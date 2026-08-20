"""分类模块 - 通过语义相似度将通知归类到项目标签。

支持多种分类引擎，通过 config.EMBEDDING_PROVIDER 切换：
  - openai: 使用 OpenAI Embeddings 计算语义相似度
  - local:  使用本地 sentence-transformers 模型计算语义相似度
  - mock:   基于关键词匹配（无需模型，回退方案）

分类逻辑：计算通知文本与各项目名称的向量余弦相似度，取最高者。
若最高相似度低于阈值（0.3），则标记为"未分类"。
"""
import math
import logging
from typing import List, Dict

from config import (
    EMBEDDING_PROVIDER,
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
    LLM_BASE_URL,
    LOCAL_EMBEDDING_MODEL,
)

logger = logging.getLogger(__name__)

# 相似度阈值：低于此值则不归类（标记为"未分类"）
SIMILARITY_THRESHOLD = 0.3


class BaseClassifier:
    """分类器抽象基类。"""

    def classify(self, text: str, projects: List[Dict]) -> str:
        """将文本分类到最匹配的项目标签。

        :param text: 通知文本（标题+内容）
        :param projects: 项目标签列表 [{"name": "项目A", "color": "#xxx"}, ...]
        :return: 最匹配的项目名称，若无匹配则返回 "未分类"
        """
        ...

    @staticmethod
    def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        """计算两个向量的余弦相似度。"""
        if not vec_a or not vec_b:
            return 0.0
        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot_product / (norm_a * norm_b)


class EmbeddingClassifier(BaseClassifier):
    """基于 OpenAI Embeddings 的语义相似度分类器。"""

    def __init__(self):
        from langchain_openai import OpenAIEmbeddings

        self.embeddings = OpenAIEmbeddings(
            model=EMBEDDING_MODEL,
            api_key=OPENAI_API_KEY,
            base_url=LLM_BASE_URL,
        )
        logger.info("Embedding 分类器初始化完成, model=%s", EMBEDDING_MODEL)

    def classify(self, text: str, projects: List[Dict]) -> str:
        if not projects:
            return "未分类"

        # 计算通知文本的嵌入向量
        text_vec = self.embeddings.embed_query(text)
        best_score = -1.0
        best_name = "未分类"

        for proj in projects:
            proj_vec = self.embeddings.embed_query(proj["name"])
            score = self._cosine_similarity(text_vec, proj_vec)
            logger.debug("相似度: '%s...' <-> %s = %.4f", text[:20], proj["name"], score)
            if score > best_score:
                best_score = score
                best_name = proj["name"]

        # 低于阈值则不归类
        if best_score < SIMILARITY_THRESHOLD:
            logger.info("最高相似度 %.4f 低于阈值 %.2f，标记为未分类", best_score, SIMILARITY_THRESHOLD)
            return "未分类"

        logger.info("分类结果: %s (相似度=%.4f)", best_name, best_score)
        return best_name


class LocalEmbeddingClassifier(BaseClassifier):
    """基于本地 sentence-transformers 模型的语义相似度分类器。

    使用 HuggingFaceEmbeddings（通过 langchain-community）加载本地模型，
    无需 API 调用，适合离线场景。
    """

    def __init__(self):
        from langchain_community.embeddings import HuggingFaceEmbeddings

        self.embeddings = HuggingFaceEmbeddings(model_name=LOCAL_EMBEDDING_MODEL)
        logger.info("本地 Embedding 分类器初始化完成, model=%s", LOCAL_EMBEDDING_MODEL)

    def classify(self, text: str, projects: List[Dict]) -> str:
        if not projects:
            return "未分类"

        text_vec = self.embeddings.embed_query(text)
        best_score = -1.0
        best_name = "未分类"

        for proj in projects:
            proj_vec = self.embeddings.embed_query(proj["name"])
            score = self._cosine_similarity(text_vec, proj_vec)
            if score > best_score:
                best_score = score
                best_name = proj["name"]

        if best_score < SIMILARITY_THRESHOLD:
            return "未分类"

        logger.info("分类结果: %s (相似度=%.4f)", best_name, best_score)
        return best_name


class KeywordClassifier(BaseClassifier):
    """基于关键词匹配的分类器（无需模型，回退方案）。

    内置项目名关键词映射，也支持动态匹配项目名称本身。
    """

    # 项目名 -> 关联关键词列表（小写匹配）
    KEYWORD_MAP = {
        "项目A": ["项目a", "项目A", "a组", "a team", "alpha"],
        "项目B": ["项目b", "项目B", "b组", "b team", "beta"],
        "项目C": ["项目c", "项目C", "c组", "c team", "gamma"],
    }

    def classify(self, text: str, projects: List[Dict]) -> str:
        if not projects:
            return "未分类"

        text_lower = text.lower()
        best_name = "未分类"
        best_count = 0

        for proj in projects:
            name = proj["name"]
            # 获取该项目的关键词列表，默认包含项目名本身
            keywords = self.KEYWORD_MAP.get(name, [name.lower()])
            match_count = sum(1 for kw in keywords if kw.lower() in text_lower)
            if match_count > best_count:
                best_count = match_count
                best_name = name

        if best_count == 0:
            return "未分类"

        logger.info("关键词分类结果: %s (匹配数=%d)", best_name, best_count)
        return best_name


def get_classifier() -> BaseClassifier:
    """根据配置返回分类器实例。

    优先使用 Embedding 分类器；若未配置密钥或初始化失败，回退到关键词分类器。
    """
    provider = EMBEDDING_PROVIDER.lower()
    if provider == "openai":
        if not OPENAI_API_KEY:
            logger.warning("未配置 OPENAI_API_KEY，回退到关键词分类器")
            return KeywordClassifier()
        try:
            return EmbeddingClassifier()
        except Exception as e:
            logger.warning("Embedding 分类器初始化失败: %s，回退到关键词分类器", e)
            return KeywordClassifier()
    elif provider == "local":
        try:
            return LocalEmbeddingClassifier()
        except Exception as e:
            logger.warning("本地 Embedding 初始化失败: %s，回退到关键词分类器", e)
            return KeywordClassifier()
    else:
        return KeywordClassifier()
