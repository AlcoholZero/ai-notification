"""Flask 主应用 - AI通知小程序后端 API。

提供以下接口：
  1. POST   /api/notify/upload      上传截图进行处理
  2. POST   /api/notify/voice       上传语音进行处理
  3. POST   /api/notify/text        提交文字进行处理
  4. POST   /api/notify/styles      生成多种通知风格
  5. GET    /api/notifications       获取通知列表（分页）
  6. GET    /api/notifications/<id>  获取通知详情
  7. PUT    /api/notifications/<id>  更新通知内容（切换风格）
  8. DELETE /api/notifications/<id>  删除通知
  9. GET    /api/projects            获取项目标签列表
 10. POST   /api/projects            创建新项目标签
 11. GET    /api/calendar             获取月历数据
 12. GET    /api/today_todos          获取今日待办

所有接口统一返回格式：{ code: 0/1, message: "", data: {} }
"""
import logging
import os
import sys
from flask import Flask, request, jsonify, send_from_directory

# 确保项目根目录（backend/）在 Python 路径中，以便正确导入各模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Web 前端目录（与 backend/ 同级的 web/ 目录）
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')

from flask_cors import CORS

from config import FLASK_HOST, FLASK_PORT, FLASK_DEBUG, LOG_LEVEL, LOG_FORMAT
from models.database import Database
from agent.pipeline import NotificationPipeline
from agent.style_generator import get_style_generator

# ==================== 日志初始化 ====================
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format=LOG_FORMAT,
)
logger = logging.getLogger(__name__)

# ==================== Flask 应用初始化 ====================
app = Flask(__name__)
CORS(app)  # 允许跨域请求（小程序前端需要）

# 初始化数据库（自动建表 + 插入默认项目标签）
db = Database()
# 初始化通知处理流水线
pipeline = NotificationPipeline()


# ==================== 统一响应工具函数 ====================

def success(data=None, message="操作成功"):
    """成功响应（code=0）。"""
    return jsonify({"code": 0, "message": message, "data": data})


def error(message="操作失败", code=1):
    """错误响应（code=1）。"""
    return jsonify({"code": code, "message": message, "data": None})


def _build_notification_response(notif_id: int):
    """根据通知 ID 构建标准返回数据。"""
    notif = db.get_notification(notif_id)
    if not notif:
        return error("通知记录不存在")
    return success({
        "notification_id": notif["id"],
        "title": notif["title"],
        "content": notif["content"],
        "project_tag": notif["project_tag"],
        "source_type": notif["source_type"],
        "created_at": notif["created_at"],
    })


# ================================================================
#  通知处理接口（截图 / 语音 / 文字）
# ================================================================

@app.route("/api/notify/upload", methods=["POST"])
def notify_upload():
    """上传截图进行处理。

    接收: multipart/form-data
      - file:    图片文件
      - user_id: 用户ID
    """
    try:
        file = request.files.get("file")
        user_id = request.form.get("user_id", "anonymous")
        if not file:
            return error("缺少文件参数 file")

        image_bytes = file.read()
        project_tag = request.form.get("project_tag", "").strip()
        # 获取项目标签列表供分类器使用
        projects = db.list_projects()
        # 调用流水线处理截图
        result = pipeline.process(
            source_type="screenshot",
            image_bytes=image_bytes,
            projects=projects,
        )
        if project_tag:
            result["project_tag"] = project_tag
        # 存入数据库
        notif_id = db.create_notification(
            user_id=user_id,
            title=result["title"],
            content=result["content"],
            project_tag=result["project_tag"],
            source_type="screenshot",
            raw_content=result["raw_content"],
        )
        return _build_notification_response(notif_id)

    except Exception as e:
        logger.exception("截图处理失败")
        return error(f"截图处理失败: {e}")


@app.route("/api/notify/voice", methods=["POST"])
def notify_voice():
    """上传语音进行处理。

    接收: multipart/form-data
      - file:    音频文件
      - user_id: 用户ID
    """
    try:
        file = request.files.get("file")
        user_id = request.form.get("user_id", "anonymous")
        if not file:
            return error("缺少文件参数 file")

        audio_bytes = file.read()
        audio_filename = file.filename or "audio.wav"
        project_tag = request.form.get("project_tag", "").strip()
        projects = db.list_projects()
        # 调用流水线处理语音
        result = pipeline.process(
            source_type="voice",
            audio_bytes=audio_bytes,
            audio_filename=audio_filename,
            projects=projects,
        )
        if project_tag:
            result["project_tag"] = project_tag
        notif_id = db.create_notification(
            user_id=user_id,
            title=result["title"],
            content=result["content"],
            project_tag=result["project_tag"],
            source_type="voice",
            raw_content=result["raw_content"],
        )
        return _build_notification_response(notif_id)

    except Exception as e:
        logger.exception("语音处理失败")
        return error(f"语音处理失败: {e}")


@app.route("/api/notify/text", methods=["POST"])
def notify_text():
    """提交文字进行处理。

    接收: application/json
      { "user_id": "...", "text": "..." }
    """
    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get("user_id", "anonymous")
        text = data.get("text", "").strip()
        project_tag = data.get("project_tag", "").strip()
        if not text:
            return error("缺少文字内容 text")

        projects = db.list_projects()
        # 调用流水线处理文字
        result = pipeline.process(
            source_type="text",
            text=text,
            projects=projects,
        )
        if project_tag:
            result["project_tag"] = project_tag
        notif_id = db.create_notification(
            user_id=user_id,
            title=result["title"],
            content=result["content"],
            project_tag=result["project_tag"],
            source_type="text",
            raw_content=result["raw_content"],
        )
        return _build_notification_response(notif_id)

    except Exception as e:
        logger.exception("文字处理失败")
        return error(f"文字处理失败: {e}")


# ================================================================
#  通知风格生成接口
# ================================================================

@app.route("/api/notify/styles", methods=["POST"])
def notify_styles():
    """生成多种通知风格供用户选择。

    接收: application/json
      { "title": "...", "content": "..." }
    """
    try:
        data = request.get_json(silent=True) or {}
        title = data.get("title", "").strip()
        content = data.get("content", "").strip()
        if not content:
            return error("缺少内容 content")

        generator = get_style_generator()
        styles = generator.generate(title, content)
        return success({"styles": styles})
    except Exception as e:
        logger.exception("风格生成失败")
        return error(f"风格生成失败: {e}")


# ================================================================
#  通知查询 / 删除接口
# ================================================================

@app.route("/api/notifications", methods=["GET"])
def list_notifications():
    """获取通知列表（分页）。

    参数:
      - user_id:     用户ID（必填）
      - project_tag: 项目标签筛选（可选）
      - page:        页码（默认1）
      - page_size:   每页条数（默认20）
    """
    try:
        user_id = request.args.get("user_id", "anonymous")
        project_tag = request.args.get("project_tag")  # 可选，为空则不筛选
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))

        result = db.list_notifications(
            user_id=user_id,
            project_tag=project_tag,
            page=page,
            page_size=page_size,
        )
        return success(result)
    except ValueError:
        return error("page 和 page_size 必须为整数")
    except Exception as e:
        logger.exception("获取通知列表失败")
        return error(f"获取通知列表失败: {e}")


@app.route("/api/notifications/<int:notif_id>", methods=["GET"])
def get_notification(notif_id):
    """获取通知详情。"""
    try:
        notif = db.get_notification(notif_id)
        if not notif:
            return error("通知不存在")
        return success({
            "id": notif["id"],
            "title": notif["title"],
            "content": notif["content"],
            "project_tag": notif["project_tag"],
            "source_type": notif["source_type"],
            "raw_content": notif["raw_content"],
            "created_at": notif["created_at"],
        })
    except Exception as e:
        logger.exception("获取通知详情失败")
        return error(f"获取通知详情失败: {e}")


@app.route("/api/notifications/<int:notif_id>", methods=["DELETE"])
def delete_notification(notif_id):
    """删除通知。"""
    try:
        deleted = db.delete_notification(notif_id)
        if not deleted:
            return error("通知不存在或已删除")
        return success(message="删除成功")
    except Exception as e:
        logger.exception("删除通知失败")
        return error(f"删除通知失败: {e}")


@app.route("/api/notifications/<int:notif_id>", methods=["PUT"])
def update_notification(notif_id):
    """更新通知内容（切换风格）。

    接收: application/json
      { "content": "..." }
    """
    try:
        data = request.get_json(silent=True) or {}
        content = data.get("content", "").strip()
        if not content:
            return error("缺少内容 content")

        updated = db.update_notification_content(notif_id, content)
        if not updated:
            return error("通知不存在")
        return _build_notification_response(notif_id)
    except Exception as e:
        logger.exception("更新通知失败")
        return error(f"更新通知失败: {e}")


# ================================================================
#  项目标签接口
# ================================================================

@app.route("/api/projects", methods=["GET"])
def list_projects():
    """获取项目标签列表（含每个标签下的通知数量）。"""
    try:
        projects = db.list_projects()
        data = [
            {"name": p["name"], "count": p["count"], "color": p["color"], "notes": p.get("notes", "")}
            for p in projects
        ]
        return success(data)
    except Exception as e:
        logger.exception("获取项目标签列表失败")
        return error(f"获取项目标签列表失败: {e}")


@app.route("/api/projects", methods=["POST"])
def create_project():
    """创建新项目标签。

    接收: application/json
      { "name": "...", "color": "#XXXXXX" }
    """
    try:
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        color = data.get("color", "#999999").strip()
        notes = data.get("notes", "").strip()
        if not name:
            return error("项目名称不能为空")

        result = db.create_project(name=name, color=color, notes=notes)
        return success(result, message="项目标签创建成功")
    except Exception as e:
        # 项目名唯一约束冲突
        if "UNIQUE" in str(e):
            return error(f"项目标签 '{name}' 已存在")
        logger.exception("创建项目标签失败")
        return error(f"创建项目标签失败: {e}")


# ================================================================
#  日历 / 待办接口
# ================================================================

@app.route("/api/calendar", methods=["GET"])
def get_calendar():
    """获取月历数据。

    参数:
      - user_id: 用户ID
      - year:    年份（默认当前年）
      - month:   月份（默认当前月）
    """
    try:
        from datetime import datetime as dt
        user_id = request.args.get("user_id", "anonymous")
        year = int(request.args.get("year", dt.now().year))
        month = int(request.args.get("month", dt.now().month))
        data = db.get_calendar_data(user_id, year, month)
        return success({"year": year, "month": month, "dates": data})
    except Exception as e:
        logger.exception("获取日历数据失败")
        return error(f"获取日历数据失败: {e}")


@app.route("/api/today_todos", methods=["GET"])
def get_today_todos():
    """获取今日待办清单。"""
    try:
        user_id = request.args.get("user_id", "anonymous")
        data = db.get_today_todos(user_id)
        return success(data)
    except Exception as e:
        logger.exception("获取今日待办失败")
        return error(f"获取今日待办失败: {e}")


@app.route("/api/date_todos", methods=["GET"])
def get_date_todos():
    """获取指定日期的待办清单。

    参数:
      - user_id: 用户ID
      - date:    日期（YYYY-MM-DD）
    """
    try:
        user_id = request.args.get("user_id", "anonymous")
        date = request.args.get("date", "")
        if not date:
            return error("缺少 date 参数")
        data = db.get_date_todos(user_id, date)
        return success(data)
    except Exception as e:
        logger.exception("获取日期待办失败")
        return error(f"获取日期待办失败: {e}")


# ================================================================
#  健康检查接口
# ================================================================

@app.route("/api/statistics", methods=["GET"])
def get_statistics():
    """获取用户统计信息（累计处理数、本周处理数、分类准确率）。

    参数:
      - user_id: 用户ID
    """
    try:
        user_id = request.args.get("user_id", "anonymous")
        stats = db.get_statistics(user_id)
        return success(stats)
    except Exception as e:
        logger.exception("获取统计信息失败")
        return error(f"获取统计信息失败: {e}")


@app.route("/api/health", methods=["GET"])
def health_check():
    """健康检查接口。"""
    return success({"status": "ok"}, message="服务正常运行")


# ================================================================
#  Web 前端静态文件服务
# ================================================================

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_web(path):
    """提供 Web 前端静态文件。API 路由 (/api/*) 优先由各自路由函数处理。"""
    if path.startswith('api/'):
        return error("接口不存在"), 404
    try:
        return send_from_directory(WEB_DIR, path or 'index.html')
    except Exception:
        return send_from_directory(WEB_DIR, 'index.html')


# ================================================================
#  应用入口
# ================================================================

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("AI通知小程序后端服务启动中...")
    logger.info("监听地址: %s:%s", FLASK_HOST, FLASK_PORT)
    logger.info("调试模式: %s", FLASK_DEBUG)
    logger.info("数据库路径: %s", db.db_path)
    logger.info("=" * 60)
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
