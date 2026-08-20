# AI通知小程序

团队日常通知来源杂（群聊截图、语音、文字），本项目搭建了一个可自动识别、提取、分类并推送通知的 Agent 应用，降低信息整理成本。

## 核心功能

- **多模态输入**：支持截图拍照、语音录音、文字输入三种方式提交通知
- **AI自动处理流水线**：截图OCR识别 → 语音转文字 → 信息提取 → 格式化生成 → 自动分类
- **语义分类**：通过 Embedding 语义相似度自动归到对应项目标签
- **三栏布局首页**：左侧项目管理、中间通知对话框、右侧任务分类+日历+待办
- **四象限任务分类**：AI根据通知内容自动判断紧急性和重要性，将任务规划到四象限矩阵
- **日历与待办**：月历视图高亮有通知的日期，支持按日期查看待办
- **通知管理**：列表浏览、项目筛选、详情弹窗、删除
- **本地大模型**：内置 Ollama 集成，零成本使用本地 AI

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS（SPA 架构，响应式布局） |
| 后端 | Python + Flask + Flask-CORS |
| AI编排 | LangChain（Agent流水线） |
| LLM | Ollama（本地）/ OpenAI API（云端） |
| 多模态 | Ollama 视觉模型（OCR）/ Whisper（语音识别） |
| 语义分类 | sentence-transformers / 关键词匹配 |
| 数据库 | SQLite |
| 部署 | Docker Compose（Ollama + 后端一键启动） |

## 项目结构

```
AI通知小程序/
├── docker-compose.yml            # Docker Compose 编排（Ollama + 后端）
├── Dockerfile                    # 后端容器镜像
├── setup.ps1                     # Windows 一键安装脚本
├── setup.sh                      # Linux/macOS 一键安装脚本
├── .env.example                  # 环境变量配置模板
│
├── backend/                      # Flask后端
│   ├── app.py                    # Flask主应用（API路由 + 前端静态文件服务）
│   ├── config.py                 # 配置（API密钥、引擎选择，默认指向本地 Ollama）
│   ├── requirements.txt          # Python依赖
│   ├── agent/                    # LangChain Agent处理流水线
│   │   ├── pipeline.py           # 流水线编排（统一入口）
│   │   ├── ocr.py                # 截图OCR（Ollama Vision/百度/Mock）
│   │   ├── asr.py                # 语音转文字（Whisper/百度/Mock）
│   │   ├── extractor.py          # 信息提取（LLM/规则回退，含紧急性/重要性分析）
│   │   └── classifier.py         # 语义分类（Embedding/关键词回退）
│   ├── models/
│   │   └── database.py           # SQLite数据库模型与操作
│   └── data/                     # 数据存储目录（Docker 持久化卷）
│
├── web/                          # Web前端（主流版本）
│   ├── index.html                # 前端入口
│   ├── css/
│   │   └── style.css             # 全局样式（三栏布局、四象限矩阵）
│   └── js/
│       ├── api.js                # API请求封装（11个接口）
│       └── app.js                # SPA路由 + 页面渲染 + 事件处理
│
├── miniprogram/                  # 微信小程序前端（适配版本）
│
└── README.md
```

## 快速开始

### 方式一：Docker Compose 一键部署（推荐）

无需安装 Python、无需配置 API 密钥，Docker 自动拉起本地大模型和后端服务。

**Windows：**
```powershell
.\setup.ps1
```

**Linux / macOS：**
```bash
chmod +x setup.sh && ./setup.sh
```

脚本会自动完成：
1. 检查 Docker 环境
2. 创建 `.env` 配置文件
3. 构建并启动容器（Ollama + 后端）
4. 拉取本地大模型（qwen2.5:7b 文本模型 + qwen2.5-vl:7b 视觉模型）

启动后访问 `http://localhost:5000` 即可使用。

**手动操作：**
```bash
# 复制配置文件
cp .env.example .env

# 启动服务
docker-compose up -d --build

# 拉取模型（首次需要下载）
docker exec ollama ollama pull qwen2.5:7b
docker exec ollama ollama pull qwen2.5-vl:7b
```

### 方式二：本地开发模式

适合开发调试，需要本地安装 Python 3.11+。

```bash
# 1. 安装依赖
cd backend
pip install -r requirements.txt

# 2. 启动后端（默认指向本地 Ollama）
python app.py
```

后端同时服务 API 和前端页面，访问 `http://localhost:5000` 即可。

如需使用云端 API，设置环境变量：
```bash
# OpenAI
export LLM_API_KEY=sk-your-key
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_MODEL=gpt-4o-mini
python app.py
```

## 配置说明

通过 `.env` 文件或环境变量配置，所有配置项有合理默认值：

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `LLM_PROVIDER` | LLM 提供商 | openai（兼容 Ollama） |
| `LLM_API_KEY` | LLM API 密钥 | ollama（本地无需真实密钥） |
| `LLM_BASE_URL` | LLM 接口地址 | http://localhost:11434/v1 |
| `LLM_MODEL` | 文本提取模型 | qwen2.5:7b |
| `OCR_PROVIDER` | OCR 引擎 | openai_vision |
| `OPENAI_VISION_MODEL` | 视觉识别模型 | qwen2.5-vl:7b |
| `ASR_PROVIDER` | 语音识别引擎 | mock（本地无 Whisper 时回退） |
| `EMBEDDING_PROVIDER` | 语义分类引擎 | mock（关键词匹配） |

### 切换为云端 API

修改 `.env` 文件：
```env
LLM_API_KEY=sk-your-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-your-key
OPENAI_VISION_MODEL=gpt-4o
ASR_PROVIDER=openai_whisper
EMBEDDING_PROVIDER=openai
```

## API接口文档

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/notify/upload` | POST | 上传截图处理 |
| `/api/notify/voice` | POST | 上传语音处理 |
| `/api/notify/text` | POST | 提交文字处理 |
| `/api/notify/styles` | POST | 生成多种通知风格 |
| `/api/notifications` | GET | 获取通知列表（分页+筛选） |
| `/api/notifications/<id>` | GET | 获取通知详情 |
| `/api/notifications/<id>` | PUT | 更新通知内容 |
| `/api/notifications/<id>` | DELETE | 删除通知 |
| `/api/projects` | GET | 获取项目标签列表 |
| `/api/projects` | POST | 创建新项目标签 |
| `/api/calendar` | GET | 获取月历数据 |
| `/api/today_todos` | GET | 获取今日待办 |
| `/api/date_todos` | GET | 获取指定日期待办 |
| `/api/task_matrix` | GET | 获取四象限任务矩阵 |
| `/api/statistics` | GET | 获取统计信息 |
| `/api/health` | GET | 健康检查 |

## Docker 常用命令

```bash
# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 重新构建
docker-compose up -d --build
```
