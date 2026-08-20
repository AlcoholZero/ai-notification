"""ASR 模块 - 语音转文字。

支持多种 ASR 引擎，通过 config.ASR_PROVIDER 切换：
  - openai_whisper: 使用 OpenAI Whisper API 进行语音转写
  - baidu:          使用百度语音识别 API
  - mock:           返回占位文本（未配置密钥时自动回退，用于本地测试）

设计为可配置架构，新增引擎只需继承 BaseASR 并在工厂函数中注册。
"""
import os
import base64
import logging
import tempfile
import requests
from abc import ABC, abstractmethod

from config import (
    ASR_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_WHISPER_MODEL,
    LLM_BASE_URL,
    BAIDU_ASR_API_KEY,
    BAIDU_ASR_SECRET_KEY,
)

logger = logging.getLogger(__name__)


class BaseASR(ABC):
    """ASR 引擎抽象基类，所有引擎实现统一接口。"""

    @abstractmethod
    def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        """将语音转写为文字。

        :param audio_bytes: 音频二进制数据
        :param filename:    原始文件名（用于推断格式）
        :return: 转写后的纯文本
        """
        ...


class OpenAIWhisperASR(BaseASR):
    """使用 OpenAI Whisper API 进行语音转写。"""

    def __init__(self):
        from openai import OpenAI

        self.client = OpenAI(api_key=OPENAI_API_KEY, base_url=LLM_BASE_URL)
        self.model = OPENAI_WHISPER_MODEL
        logger.info("ASR 引擎: OpenAI Whisper, model=%s", self.model)

    def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        # Whisper API 需要文件对象，将二进制数据写入临时文件
        suffix = os.path.splitext(filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            with open(tmp_path, "rb") as audio_file:
                response = self.client.audio.transcriptions.create(
                    model=self.model,
                    file=audio_file,
                )
            text = response.text.strip()
            logger.info("Whisper 转写完成，文字长度=%d", len(text))
            return text
        finally:
            os.unlink(tmp_path)


class BaiduASR(BaseASR):
    """使用百度语音识别 API。"""

    def __init__(self):
        self.api_key = BAIDU_ASR_API_KEY
        self.secret_key = BAIDU_ASR_SECRET_KEY
        self._access_token = None
        logger.info("ASR 引擎: 百度语音识别")

    def _get_access_token(self) -> str:
        url = "https://aip.baidubce.com/oauth/2.0/token"
        params = {
            "grant_type": "client_credentials",
            "client_id": self.api_key,
            "client_secret": self.secret_key,
        }
        resp = requests.post(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()["access_token"]

    def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        if not self._access_token:
            self._access_token = self._get_access_token()
        url = f"https://vop.baidu.com/server_api?access_token={self._access_token}"
        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        payload = {
            "format": "wav",
            "rate": 16000,
            "channel": 1,
            "cuid": "ai-notify-backend",
            "token": self._access_token,
            "speech": b64_audio,
            "len": len(audio_bytes),
        }
        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        result = resp.json()
        # 百度 ASR 返回 result 数组，拼接为完整文本
        text = "".join(result.get("result", []))
        logger.info("百度 ASR 转写完成，文字长度=%d", len(text))
        return text


class MockASR(BaseASR):
    """Mock ASR 引擎 - 未配置 API 密钥时用于本地测试。

    Mock 模式无法真正识别语音内容，因此始终返回空字符串，
    避免在用户未说话或说了话时冒出虚假转写结果。
    """

    MIN_AUDIO_BYTES = 500

    def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        if not audio_bytes or len(audio_bytes) < self.MIN_AUDIO_BYTES:
            logger.warning(
                "Mock ASR：音频数据过小（%d 字节），可能未录制到内容，返回空文本",
                len(audio_bytes) if audio_bytes else 0,
            )
            return ""
        logger.warning(
            "Mock ASR：未配置真实 API 密钥，无法识别语音内容，返回空文本"
        )
        return ""


def get_asr_engine() -> BaseASR:
    """根据配置返回对应的 ASR 引擎实例。

    若配置的引擎缺少必要密钥，自动回退到 MockASR 以保证服务可用。
    """
    provider = ASR_PROVIDER.lower()
    if provider == "openai_whisper":
        if not OPENAI_API_KEY:
            logger.warning("未配置 OPENAI_API_KEY，回退到 Mock ASR")
            return MockASR()
        return OpenAIWhisperASR()
    elif provider == "baidu":
        if not BAIDU_ASR_API_KEY or not BAIDU_ASR_SECRET_KEY:
            logger.warning("未配置百度 ASR 密钥，回退到 Mock ASR")
            return MockASR()
        return BaiduASR()
    else:
        return MockASR()
