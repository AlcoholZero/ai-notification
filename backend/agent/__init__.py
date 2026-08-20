"""Agent 模块包 - 包含通知处理流水线的各个组件。

子模块说明：
  - ocr.py        截图文字识别（OCR）
  - asr.py        语音转文字（ASR）
  - extractor.py  基于 LangChain + LLM 的结构化信息提取
  - classifier.py 基于语义相似度的项目标签分类
  - pipeline.py   通知处理流水线编排（统一入口）
"""
