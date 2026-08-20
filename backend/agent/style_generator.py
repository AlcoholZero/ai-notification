"""通知风格生成器 - 将提取的通知内容转换为多种排版风格。

支持四种风格：
  - emoji:     Emoji版（带emoji标记，结构化排版）
  - concise:   简洁版（只保留核心信息，短小精悍）
  - formal:    正式版（规范公文风格，无emoji）
  - chat:      群聊版（口语化，适合群消息转发）

有 LLM 时用 AI 生成，无 LLM 时用规则生成。
"""
import json
import re
import logging
from typing import Dict, List

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER

logger = logging.getLogger(__name__)

STYLE_OPTIONS = [
    {"key": "emoji", "label": "Emoji版", "desc": "带emoji标记，结构清晰"},
    {"key": "concise", "label": "简洁版", "desc": "只保留核心信息"},
    {"key": "formal", "label": "正式版", "desc": "规范公文风格，无emoji"},
    {"key": "chat", "label": "群聊版", "desc": "口语化，适合群转发"},
]

STYLE_PROMPT = """你是一个通知排版助手。请将以下通知内容重新排版为4种不同风格。

通知标题：{title}
通知内容：{content}

请生成以下4种风格的内容，以JSON数组返回（只返回JSON，不要其他内容）：
[
  {{
    "key": "emoji",
    "label": "Emoji版",
    "content": "使用emoji标记各部分（📢通知 ⏰时间 📍地点 📤提交方式 🔍说明 ⚠️提醒 ✅要求），各部分用空行分隔，有序号用1.2.3."
  }},
  {{
    "key": "concise",
    "label": "简洁版",
    "content": "只保留标题、时间、关键要求，每项一行，不加emoji，尽量简短"
  }},
  {{
    "key": "formal",
    "label": "正式版",
    "content": "公文风格，使用'现就...事项通知如下'等正式用语，分条列述，不用emoji"
  }},
  {{
    "key": "chat",
    "label": "群聊版",
    "content": "口语化，像群聊消息，用换行分段，适当用~等符号，简明亲切"
  }}
]

要求：
1. 每种风格保留通知的核心信息（时间、地点、要求等）
2. 返回合法JSON数组，不要markdown代码块
3. content字段使用\\n表示换行
"""


class StyleGenerator:
    """通知风格生成器。"""

    def __init__(self):
        self.use_llm = bool(LLM_API_KEY and LLM_PROVIDER == "openai")
        if self.use_llm:
            try:
                from langchain_openai import ChatOpenAI
                from langchain_core.prompts import ChatPromptTemplate

                self.llm = ChatOpenAI(
                    model=LLM_MODEL,
                    api_key=LLM_API_KEY,
                    base_url=LLM_BASE_URL,
                    temperature=0.3,
                )
                self.prompt = ChatPromptTemplate.from_template(STYLE_PROMPT)
                self.chain = self.prompt | self.llm
                logger.info("风格生成器: LLM 模式")
            except Exception as e:
                logger.warning("LLM 风格生成器初始化失败: %s，使用规则模式", e)
                self.use_llm = False
        if not self.use_llm:
            logger.info("风格生成器: 规则模式")

    def generate(self, title: str, content: str) -> List[Dict[str, str]]:
        """生成多种风格的通知内容。

        :return: [{"key", "label", "content"}, ...]
        """
        if self.use_llm:
            return self._generate_with_llm(title, content)
        return self._generate_with_rules(title, content)

    def _generate_with_llm(self, title: str, content: str) -> List[Dict[str, str]]:
        """使用 LLM 生成多种风格。"""
        try:
            response = self.chain.invoke({"title": title, "content": content})
            text = response.content.strip()
            text = re.sub(r"```(?:json)?\s*", "", text).strip()
            match = re.search(r"\[[\s\S]*\]", text)
            if match:
                data = json.loads(match.group(0))
                if isinstance(data, list) and len(data) > 0:
                    logger.info("LLM 风格生成完成，共%d种", len(data))
                    return data
        except Exception as e:
            logger.warning("LLM 风格生成失败: %s，回退到规则模式", e)
        return self._generate_with_rules(title, content)

    def _generate_with_rules(self, title: str, content: str) -> List[Dict[str, str]]:
        """使用规则生成多种风格。"""
        return [
            {"key": "emoji", "label": "Emoji版", "content": self._style_emoji(title, content)},
            {"key": "concise", "label": "简洁版", "content": self._style_concise(title, content)},
            {"key": "formal", "label": "正式版", "content": self._style_formal(title, content)},
            {"key": "chat", "label": "群聊版", "content": self._style_chat(title, content)},
        ]

    @staticmethod
    def _style_emoji(title: str, content: str) -> str:
        """Emoji版 - 复用提取器已有的emoji格式。"""
        lines = content.strip().split("\n")
        result = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                result.append("")
                continue
            if StyleGenerator._has_emoji(stripped):
                result.append(stripped)
            else:
                emoji = StyleGenerator._match_emoji(stripped)
                result.append(f"{emoji}{stripped}" if emoji else stripped)
        return "\n".join(result)

    @staticmethod
    def _style_concise(title: str, content: str) -> str:
        """简洁版 - 只保留核心信息。"""
        lines = [l.strip() for l in content.strip().split("\n") if l.strip()]
        key_lines = []
        for line in lines:
            if any(kw in line for kw in ["时间", "月", "日", "点", "上午", "下午", "截止", "期限"]):
                key_lines.append(line)
            elif any(kw in line for kw in ["提交", "方式", "地点", "要求", "务必", "请"]):
                key_lines.append(line)
            elif re.match(r"^\d+\.", line):
                key_lines.append(line)
        if not key_lines:
            key_lines = lines[:5]
        return f"{title}\n" + "\n".join(key_lines[:8])

    @staticmethod
    def _style_formal(title: str, content: str) -> str:
        """正式版 - 公文风格。"""
        lines = [l.strip() for l in content.strip().split("\n") if l.strip()]
        cleaned = [re.sub(r"^[\U0001f000-\U0001ffff\u2600-\u27bf\u2705\u2757\u2753\u2755]+", "", l) for l in lines]
        body = "\n".join(cleaned)
        return f"关于{title}的通知\n\n现就有关事项通知如下：\n\n{body}\n\n特此通知。"

    @staticmethod
    def _style_chat(title: str, content: str) -> str:
        """群聊版 - 口语化。"""
        lines = [l.strip() for l in content.strip().split("\n") if l.strip()]
        cleaned = [re.sub(r"^[\U0001f000-\U0001ffff\u2600-\u27bf\u2705\u2757\u2753\u2755]+", "", l) for l in lines]
        return f"📢 {title}\n\n" + "\n".join(cleaned) + "\n\n大家注意一下哈~"

    EMOJI_KEYWORDS = [
        (re.compile(r"重要提醒|注意事项|特别注意"), "⚠️"),
        (re.compile(r"提交方式|报送方式|上交方式"), "📤"),
        (re.compile(r"注意|说明事项|操作说明"), "🔍"),
        (re.compile(r"要求|必做|务必"), "✅"),
        (re.compile(r"特别提示|温馨提示|特别说明"), "❗"),
    ]

    @classmethod
    def _match_emoji(cls, text: str) -> str:
        for pattern, emoji in cls.EMOJI_KEYWORDS:
            if pattern.search(text):
                return emoji
        return ""

    @staticmethod
    def _has_emoji(text: str) -> bool:
        if not text:
            return False
        return bool(re.match(r"^[\U0001f000-\U0001ffff\u2600-\u27bf\u2705\u2757\u2753\u2755]", text))


_style_generator = None


def get_style_generator() -> StyleGenerator:
    """单例获取风格生成器。"""
    global _style_generator
    if _style_generator is None:
        _style_generator = StyleGenerator()
    return _style_generator
