"""配置模块 - 管理 API 密钥、数据库路径、引擎选择等配置项。

所有敏感信息（API 密钥）均通过环境变量读取，并提供占位默认值。
部署时通过设置环境变量覆盖默认值即可，无需修改代码。
"""
import os
from pathlib import Path

# ==================== 路径配置 ====================
# 项目根目录（backend/）
BASE_DIR = Path(__file__).resolve().parent
# 数据存储目录
DATA_DIR = BASE_DIR / "data"
# SQLite 数据库文件路径
DB_PATH = DATA_DIR / "notifications.db"

# ==================== Flask 服务配置 ====================
FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"

# ==================== LLM 配置（信息提取用） ====================
# 提供商：openai / dashscope（通义千问）/ 其他兼容 OpenAI 接口的服务
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# ==================== OCR 配置（截图文字识别） ====================
# 引擎选择：openai_vision / baidu / mock
OCR_PROVIDER = os.getenv("OCR_PROVIDER", "openai_vision")
# OpenAI Vision API
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4o")
# 百度 OCR 通用文字识别
BAIDU_OCR_API_KEY = os.getenv("BAIDU_OCR_API_KEY", "")
BAIDU_OCR_SECRET_KEY = os.getenv("BAIDU_OCR_SECRET_KEY", "")

# ==================== ASR 配置（语音转文字） ====================
# 引擎选择：openai_whisper / baidu / mock
ASR_PROVIDER = os.getenv("ASR_PROVIDER", "openai_whisper")
# OpenAI Whisper
OPENAI_WHISPER_MODEL = os.getenv("OPENAI_WHISPER_MODEL", "whisper-1")
# 百度语音识别
BAIDU_ASR_API_KEY = os.getenv("BAIDU_ASR_API_KEY", "")
BAIDU_ASR_SECRET_KEY = os.getenv("BAIDU_ASR_SECRET_KEY", "")

# ==================== 语义分类配置 ====================
# 引擎选择：openai（OpenAI Embeddings）/ local（本地模型）/ mock（关键词匹配）
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "openai")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-ada-002")
# 本地 sentence-transformers 模型名
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")

# ==================== 默认项目标签 ====================
# 数据库初始化时自动创建这些项目标签（空列表：用户自行添加）
DEFAULT_PROJECTS = []

# ==================== 日志配置 ====================
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
