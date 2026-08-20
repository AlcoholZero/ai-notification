# AI通知小程序

团队日常通知来源杂（群聊截图、语音、文字），本项目搭建了一个可自动识别、提取、分类并推送通知的 Agent 小程序，降低信息整理成本。

## 核心功能

- **多模态输入**：支持截图拍照、语音录音、文字输入三种方式提交通知
- **AI自动处理流水线**：截图OCR识别 → 语音转文字 → 信息提取 → 格式化生成 → 自动分类
- **语义分类**：通过 Embedding 语义相似度自动归到对应项目标签
- **通知管理**：列表浏览、项目筛选、详情查看、删除
- **数据统计**：累计处理数、本周处理数、分类准确率

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序（WXML + WXSS + JS） |
| 后端 | Python + Flask + Flask-CORS |
| AI编排 | LangChain（Agent流水线） |
| 多模态 | OpenAI Vision API（OCR）/ Whisper（语音识别） |
| 语义分类 | OpenAI Embeddings + 余弦相似度 |
| 数据库 | SQLite |

## 项目结构

```
AI通知小程序/
├── backend/                      # Flask后端
│   ├── app.py                    # Flask主应用（9个API路由）
│   ├── config.py                 # 配置（API密钥、引擎选择）
│   ├── requirements.txt          # Python依赖
│   ├── agent/                    # LangChain Agent处理流水线
│   │   ├── pipeline.py           # 流水线编排（统一入口）
│   │   ├── ocr.py                # 截图OCR（OpenAI Vision/百度/Mock）
│   │   ├── asr.py                # 语音转文字（Whisper/百度/Mock）
│   │   ├── extractor.py          # 信息提取（LLM/规则回退）
│   │   └── classifier.py         # 语义分类（Embedding/关键词回退）
│   ├── models/
│   │   └── database.py           # SQLite数据库模型与操作
│   └── data/                     # 数据存储目录
│
├── miniprogram/                  # 微信小程序前端
│   ├── app.js                    # 小程序入口
│   ├── app.json                  # 全局配置（tabBar）
│   ├── app.wxss                  # 全局样式
│   ├── pages/
│   │   ├── index/                # 首页（多模态输入）
│   │   ├── notifications/        # 通知列表（筛选+分页）
│   │   ├── detail/               # 通知详情
│   │   └── profile/              # 个人中心（统计+项目管理）
│   ├── components/
│   │   └── notification-card/    # 通知卡片组件
│   └── utils/
│       └── api.js                # API请求封装
│
└── README.md
```

## 快速开始

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
python app.py
```

后端默认运行在 `http://localhost:5000`。

**未配置 API 密钥时**，后端自动启用 Mock 模式（OCR/ASR返回占位文本，提取器使用规则匹配，分类器使用关键词匹配），可以正常体验所有接口流程。

**配置真实 API 密钥后**，自动切换为 LLM 模式：

```bash
# Windows
set OPENAI_API_KEY=sk-xxx
set LLM_API_KEY=sk-xxx
python app.py
```

### 2. 启动小程序前端

1. 打开**微信开发者工具**
2. 导入项目，选择 `miniprogram/` 目录
3. 将 `project.config.json` 中的 `appid` 替换为你的小程序 AppID
4. 确认后端服务已启动，编译运行

### 3. 体验流程

1. 在首页选择「拍照识别」「相册选图」「语音输入」或「文字输入」
2. 等待AI处理完成，查看提取的标题、内容和自动分类的项目标签
3. 在「通知」页查看所有通知，按项目标签筛选
4. 在「我的」页查看统计数据和管理项目标签

## API接口文档

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/notify/upload` | POST | 上传截图处理（multipart/form-data） |
| `/api/notify/voice` | POST | 上传语音处理（multipart/form-data） |
| `/api/notify/text` | POST | 提交文字处理（JSON） |
| `/api/notifications` | GET | 获取通知列表（分页+筛选） |
| `/api/notifications/<id>` | GET | 获取通知详情 |
| `/api/notifications/<id>` | DELETE | 删除通知 |
| `/api/projects` | GET | 获取项目标签列表 |
| `/api/projects` | POST | 创建新项目标签 |
| `/api/statistics` | GET | 获取用户统计信息 |
| `/api/health` | GET | 健康检查 |

所有接口统一返回格式：`{ "code": 0/1, "message": "", "data": {} }`

## 配置说明

`backend/config.py` 支持通过环境变量配置：

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `FLASK_HOST` | 监听地址 | 0.0.0.0 |
| `FLASK_PORT` | 监听端口 | 5000 |
| `FLASK_DEBUG` | 调试模式 | true |
| `OPENAI_API_KEY` | OpenAI API密钥 | （空，使用Mock） |
| `LLM_API_KEY` | LLM API密钥 | （空，使用规则提取） |
| `LLM_MODEL` | LLM模型名 | gpt-4o-mini |
| `OCR_PROVIDER` | OCR引擎 | openai_vision |
| `ASR_PROVIDER` | ASR引擎 | openai_whisper |
| `EMBEDDING_PROVIDER` | Embedding引擎 | openai |
