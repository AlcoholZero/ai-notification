"""通知处理流水线 - 编排 OCR / ASR / 信息提取 / 语义分类各步骤。

NotificationPipeline 是统一入口，根据输入类型（截图/语音/文字）自动调用
对应模块，依次完成：原始文本获取 -> 结构化信息提取 -> 项目标签分类。

处理流程：
  1. 输入预处理：根据 source_type 调用 OCR / ASR / 直接使用文本
  2. 信息提取：使用 LangChain + LLM 从文本中提取标题、内容、时间、地点等
  3. 语义分类：通过 Embedding 相似度将通知归到项目标签
"""
import logging
from typing import Optional, List, Dict

from agent.ocr import get_ocr_engine
from agent.asr import get_asr_engine
from agent.extractor import get_extractor
from agent.classifier import get_classifier

logger = logging.getLogger(__name__)


class NotificationPipeline:
    """通知处理流水线 - 统一编排各处理模块。"""

    def __init__(self):
        # 初始化各模块引擎（根据 config 自动选择实现，含回退机制）
        self.ocr_engine = get_ocr_engine()
        self.asr_engine = get_asr_engine()
        self.extractor = get_extractor()
        self.classifier = get_classifier()
        logger.info("通知处理流水线初始化完成")

    def process(
        self,
        source_type: str,
        image_bytes: Optional[bytes] = None,
        audio_bytes: Optional[bytes] = None,
        text: Optional[str] = None,
        audio_filename: Optional[str] = None,
        projects: Optional[List[Dict]] = None,
    ) -> Dict[str, str]:
        """处理通知输入，返回结构化结果。

        :param source_type:    输入类型 screenshot / voice / text
        :param image_bytes:    截图二进制数据（source_type=screenshot 时提供）
        :param audio_bytes:    语音二进制数据（source_type=voice 时提供）
        :param text:           文字内容（source_type=text 时提供）
        :param audio_filename: 音频文件名（用于推断格式，可选）
        :param projects:       项目标签列表 [{"name": ..., "color": ...}]
        :return: {"title", "content", "project_tag", "raw_content"}
        """
        # ---- 第一步：输入预处理，获取原始文本 ----
        raw_content = self._preprocess(
            source_type, image_bytes, audio_bytes, text, audio_filename
        )
        logger.info("原始文本获取完成，长度=%d", len(raw_content))

        if not raw_content or not raw_content.strip():
            raise ValueError("未识别到有效内容，请确认输入是否包含语音或文字信息")

        # ---- 第二步：信息提取（LangChain + LLM） ----
        info = self.extractor.extract(raw_content)
        logger.info("信息提取完成: title=%s", info.title)

        # ---- 第三步：语义分类 ----
        project_tag = self.classifier.classify(
            f"{info.title} {info.content}",
            projects or [],
        )
        logger.info("分类完成: project_tag=%s", project_tag)

        return {
            "title": info.title,
            "content": info.content,
            "project_tag": project_tag,
            "raw_content": raw_content,
            "is_urgent": info.is_urgent,
            "is_important": info.is_important,
        }

    def _preprocess(
        self,
        source_type: str,
        image_bytes: Optional[bytes],
        audio_bytes: Optional[bytes],
        text: Optional[str],
        audio_filename: Optional[str],
    ) -> str:
        """根据输入类型调用对应模块获取原始文本。

        :return: 原始文本内容
        """
        source_type = source_type.lower()

        if source_type == "screenshot":
            if not image_bytes:
                raise ValueError("截图处理需要提供 image_bytes")
            logger.info("开始 OCR 识别截图...")
            return self.ocr_engine.recognize(image_bytes)

        elif source_type == "voice":
            if not audio_bytes:
                raise ValueError("语音处理需要提供 audio_bytes")
            logger.info("开始 ASR 语音转文字...")
            return self.asr_engine.transcribe(
                audio_bytes, filename=audio_filename or "audio.wav"
            )

        elif source_type == "text":
            if not text:
                raise ValueError("文字处理需要提供 text")
            logger.info("直接使用文字输入")
            return text

        else:
            raise ValueError(f"不支持的输入类型: {source_type}，请使用 screenshot/voice/text")
