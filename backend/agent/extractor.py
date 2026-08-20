"""信息提取模块 - 使用 LangChain + LLM 从原始文本中提取结构化通知信息。

提取字段：标题(title)、内容(content)、时间(event_time)、地点(location)、参与人(participants)。

核心组件：
  - LLMExtractor:      基于 LangChain + ChatOpenAI 的 LLM 提取器（首选）
  - RuleBasedExtractor: 基于正则和规则的启发式提取器（无 API 密钥时回退）

通过 get_extractor() 工厂函数根据配置自动选择。
"""
import json
import re
import logging
from typing import Dict, Any

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER

logger = logging.getLogger(__name__)

# LLM 提取提示词模板 - 指导大模型从原始文本中提取结构化通知信息
EXTRACTION_PROMPT = """你是一个通知信息提取助手。请从以下原始文本中提取结构化的通知信息。

原始文本：
{raw_text}

请提取以下字段，并以 JSON 格式返回（只返回 JSON，不要任何其他内容）：
{{
  "title": "通知标题（简洁概括，10-30字，不含emoji）",
  "content": "通知正文内容（使用emoji进行结构化排版，格式见下方说明）",
  "event_time": "通知中提到的时间（如'明天下午3点'，如无则为空字符串）",
  "location": "通知中提到的地点（如'会议室201'，如无则为空字符串）",
  "participants": "通知中提到的相关人员或角色（如无则为空字符串）"
}}

content 字段的排版格式要求（使用换行符\\n分隔各部分）：
1. 使用适当的emoji作为各部分的标记，使通知更清晰易读
2. 参考格式：
   📤提交方式：[提交方式的描述]

   🔍[小节标题]：
   [小节内容，有序号时用 1. 2. 3. 编号]

   ⚠️重要提醒：
   1. [提醒事项一]
   2. [提醒事项二]

   [结尾提醒语]
3. 根据原文实际内容选择合适的emoji和小节，不要生搬硬套
4. 常用emoji参考：📢通知、⏰时间、📍地点、📤提交方式、🔍注意/说明、⚠️重要提醒、✅要求、❗特别提示
5. 各部分之间用空行分隔，保持层次清晰

注意：
1. 如果原始文本不是通知类内容，title 设为"一般消息"，content 为原文摘要
2. 时间和地点尽量保持原文表述
3. 返回的 JSON 必须是合法格式，不要用 markdown 代码块包裹
"""


class NotificationInfo:
    """通知信息提取结果的数据结构。"""

    def __init__(self, title="", content="", event_time="", location="", participants=""):
        self.title = title
        self.content = content
        self.event_time = event_time
        self.location = location
        self.participants = participants

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "content": self.content,
            "event_time": self.event_time,
            "location": self.location,
            "participants": self.participants,
        }


class LLMExtractor:
    """基于 LangChain + LLM 的信息提取器。

    使用 LangChain 的 ChatPromptTemplate 编排提示词，
    通过 LCEL (prompt | llm) 链式调用获取结构化结果。
    """

    def __init__(self):
        from langchain_openai import ChatOpenAI
        from langchain_core.prompts import ChatPromptTemplate

        # temperature=0 保证提取结果稳定、确定性
        self.llm = ChatOpenAI(
            model=LLM_MODEL,
            api_key=LLM_API_KEY,
            base_url=LLM_BASE_URL,
            temperature=0,
        )
        self.prompt = ChatPromptTemplate.from_template(EXTRACTION_PROMPT)
        # LCEL 链式调用：提示词模板 -> LLM
        self.chain = self.prompt | self.llm
        logger.info("LLM 信息提取器初始化完成, model=%s", LLM_MODEL)

    def extract(self, raw_text: str) -> NotificationInfo:
        """从原始文本提取结构化通知信息。"""
        # 调用 LLM 链获取响应
        response = self.chain.invoke({"raw_text": raw_text})
        result_text = response.content.strip()

        # 从响应中解析 JSON
        json_str = self._extract_json(result_text)
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            logger.warning("LLM 返回的 JSON 解析失败，使用原文作为内容")
            data = {}

        info = NotificationInfo(
            title=data.get("title", "未命名通知"),
            content=data.get("content", raw_text),
            event_time=data.get("event_time", ""),
            location=data.get("location", ""),
            participants=data.get("participants", ""),
        )

        # 将时间、地点、参与人附加到内容末尾，便于前端展示
        info.content = self._build_full_content(info, raw_text)
        logger.info("LLM 提取完成: title=%s", info.title)
        return info

    @staticmethod
    def _extract_json(text: str) -> str:
        """从可能包含多余文本的响应中提取 JSON 字符串。"""
        # 去除可能的 markdown 代码块标记
        text = re.sub(r"```(?:json)?\s*", "", text).strip()
        match = re.search(r"\{[\s\S]*\}", text)
        return match.group(0) if match else text

    @staticmethod
    def _build_full_content(info: NotificationInfo, raw_text: str) -> str:
        """将提取的结构化字段整合为完整内容描述，带emoji前缀。"""
        meta = []
        if info.event_time:
            meta.append(f"⏰时间：{info.event_time}")
        if info.location:
            meta.append(f"📍地点：{info.location}")
        if info.participants:
            meta.append(f"👥参与人：{info.participants}")
        if meta:
            return info.content.rstrip() + "\n\n" + "\n".join(meta)
        return info.content


class RuleBasedExtractor:
    """基于规则的启发式信息提取器（无 LLM API 时的回退方案）。

    通过正则表达式尝试提取标题、时间、地点等关键信息。
    """

    # 常见时间模式
    TIME_PATTERNS = [
        r"\d{1,2}月\d{1,2}日",
        r"\d{1,2}[:：]\d{2}",
        r"今天|明天|后天|大后天",
        r"本周[一二三四五六日天]?|下周[一二三四五六日天]?",
        r"上午|下午|晚上|中午",
    ]

    # 地点关键词模式
    LOCATION_PATTERN = r"(?:在|地点[:：\s]*)([\u4e00-\u9fa5a-zA-Z0-9]+(?:会议室|办公室|楼|室|厅|中心|基地))"

    # emoji 关键词映射：匹配到关键词的行自动添加对应emoji前缀
    EMOJI_KEYWORDS = [
        (re.compile(r"重要提醒|注意事项|特别注意"), "⚠️"),
        (re.compile(r"提交方式|报送方式|上交方式"), "📤"),
        (re.compile(r"注意|说明事项|操作说明"), "🔍"),
        (re.compile(r"要求|必做|务必"), "✅"),
        (re.compile(r"特别提示|温馨提示|特别说明"), "❗"),
    ]

    def extract(self, raw_text: str) -> NotificationInfo:
        """通过正则规则从文本中提取通知信息。"""
        logger.info("使用规则提取器处理文本")
        text = raw_text.strip()

        # 标题：取第一行，截断到30字
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        title = lines[0][:30] if lines else "未命名通知"

        # 时间：匹配所有时间模式（去重，保持顺序）
        times = []
        seen = set()
        for pattern in self.TIME_PATTERNS:
            for m in re.findall(pattern, text):
                if m not in seen:
                    seen.add(m)
                    times.append(m)
        event_time = " ".join(times[:4]) if times else ""

        # 地点
        loc_match = re.search(self.LOCATION_PATTERN, text)
        location = loc_match.group(1) if loc_match else ""

        # 对正文逐行添加emoji前缀
        content = self._add_emoji_to_lines(text)

        # 用emoji前缀格式化元数据，附加在正文末尾
        meta = []
        if event_time:
            meta.append(f"⏰时间：{event_time}")
        if location:
            meta.append(f"📍地点：{location}")
        if meta:
            content = content.rstrip() + "\n\n" + "\n".join(meta)

        info = NotificationInfo(
            title=title,
            content=content,
            event_time=event_time,
            location=location,
        )
        logger.info("规则提取完成: title=%s", info.title)
        return info

    def _add_emoji_to_lines(self, text: str) -> str:
        """对文本逐行扫描，匹配到关键词的行添加emoji前缀。"""
        result_lines = []
        for line in text.split("\n"):
            stripped = line.strip()
            if not stripped:
                result_lines.append("")
                continue
            emoji = self._match_emoji(stripped)
            if emoji and not self._has_emoji(stripped):
                result_lines.append(f"{emoji}{stripped}")
            else:
                result_lines.append(line)
        return "\n".join(result_lines)

    @staticmethod
    def _match_emoji(text: str) -> str:
        """返回文本匹配到的第一个emoji，无匹配则返回空字符串。"""
        for pattern, emoji in RuleBasedExtractor.EMOJI_KEYWORDS:
            if pattern.search(text):
                return emoji
        return ""

    @staticmethod
    def _has_emoji(text: str) -> bool:
        """检测文本是否已经以emoji开头。"""
        if not text:
            return False
        return bool(re.match(r"^[\U0001f000-\U0001ffff\u2600-\u27bf\u2705\u2757\u2753\u2755]", text))


def get_extractor():
    """根据配置返回提取器实例。

    优先使用 LLM 提取器；若未配置 API 密钥或初始化失败，回退到规则提取器。
    """
    if LLM_API_KEY and LLM_PROVIDER == "openai":
        try:
            return LLMExtractor()
        except Exception as e:
            logger.warning("LLM 提取器初始化失败: %s，回退到规则提取器", e)
            return RuleBasedExtractor()
    logger.info("未配置 LLM API 密钥，使用规则提取器")
    return RuleBasedExtractor()
