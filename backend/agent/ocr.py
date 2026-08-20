"""OCR 模块 - 截图文字识别。

支持多种 OCR 引擎，通过 config.OCR_PROVIDER 切换：
  - openai_vision: 使用 OpenAI Vision API（多模态大模型）识别图片文字
  - baidu:         使用百度 OCR 通用文字识别 API
  - mock:          返回占位文本（未配置密钥时自动回退，用于本地测试）

设计为可配置架构，新增引擎只需继承 BaseOCR 并在工厂函数中注册。
"""
import base64
import logging
import requests
from abc import ABC, abstractmethod

from config import (
    OCR_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_VISION_MODEL,
    LLM_BASE_URL,
    BAIDU_OCR_API_KEY,
    BAIDU_OCR_SECRET_KEY,
)

logger = logging.getLogger(__name__)


class BaseOCR(ABC):
    """OCR 引擎抽象基类，所有引擎实现统一接口。"""

    @abstractmethod
    def recognize(self, image_bytes: bytes) -> str:
        """识别图片中的文字内容。

        :param image_bytes: 图片二进制数据
        :return: 识别出的纯文本
        """
        ...


class OpenAIVisionOCR(BaseOCR):
    """使用 OpenAI Vision API（多模态大模型）进行 OCR 识别。"""

    def __init__(self):
        from openai import OpenAI

        self.client = OpenAI(api_key=OPENAI_API_KEY, base_url=LLM_BASE_URL)
        self.model = OPENAI_VISION_MODEL
        logger.info("OCR 引擎: OpenAI Vision, model=%s", self.model)

    def recognize(self, image_bytes: bytes) -> str:
        # 将图片编码为 base64 数据 URL
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "请识别并提取这张图片中的所有文字内容，保持原始格式和顺序，只返回提取的文字。",
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                        },
                    ],
                }
            ],
            max_tokens=2000,
        )
        text = response.choices[0].message.content.strip()
        logger.info("OCR 识别完成，文字长度=%d", len(text))
        return text


class BaiduOCR(BaseOCR):
    """使用百度 OCR 通用文字识别 API。"""

    def __init__(self):
        self.api_key = BAIDU_OCR_API_KEY
        self.secret_key = BAIDU_OCR_SECRET_KEY
        self._access_token = None  # 延迟获取，首次调用时获取
        logger.info("OCR 引擎: 百度通用文字识别")

    def _get_access_token(self) -> str:
        """获取百度 API 访问令牌。"""
        url = "https://aip.baidubce.com/oauth/2.0/token"
        params = {
            "grant_type": "client_credentials",
            "client_id": self.api_key,
            "client_secret": self.secret_key,
        }
        resp = requests.post(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()["access_token"]

    def recognize(self, image_bytes: bytes) -> str:
        if not self._access_token:
            self._access_token = self._get_access_token()
        url = (
            "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic"
            f"?access_token={self._access_token}"
        )
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        resp = requests.post(url, data={"image": b64_image}, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        # 百度 OCR 返回 words_result 数组，每个元素含 words 字段
        words_list = [item["words"] for item in result.get("words_result", [])]
        text = "\n".join(words_list)
        logger.info("百度 OCR 识别完成，文字长度=%d", len(text))
        return text


class MockOCR(BaseOCR):
    """Mock OCR 引擎 - 未配置 API 密钥时用于本地测试。"""

    def recognize(self, image_bytes: bytes) -> str:
        logger.warning("使用 Mock OCR（未配置真实 API 密钥），返回空字符串")
        return ""


def get_ocr_engine() -> BaseOCR:
    """根据配置返回对应的 OCR 引擎实例。

    若配置的引擎缺少必要密钥，自动回退到 MockOCR 以保证服务可用。
    """
    provider = OCR_PROVIDER.lower()
    if provider == "openai_vision":
        if not OPENAI_API_KEY:
            logger.warning("未配置 OPENAI_API_KEY，回退到 Mock OCR")
            return MockOCR()
        return OpenAIVisionOCR()
    elif provider == "baidu":
        if not BAIDU_OCR_API_KEY or not BAIDU_OCR_SECRET_KEY:
            logger.warning("未配置百度 OCR 密钥，回退到 Mock OCR")
            return MockOCR()
        return BaiduOCR()
    else:
        return MockOCR()
