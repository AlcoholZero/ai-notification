"""数据库模块 - SQLite 数据库模型与操作。

包含两张表：
  - notifications: 通知记录表（存储每条通知的结构化信息和原始内容）
  - projects:      项目标签表（存储项目名称、颜色，用于通知分类）

数据库在首次访问时自动初始化（建表 + 插入默认项目标签）。
所有操作通过 Database 类封装，使用上下文管理器管理连接。
"""
import sqlite3
import logging
from datetime import datetime
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

from config import DB_PATH, DATA_DIR, DEFAULT_PROJECTS

logger = logging.getLogger(__name__)


class Database:
    """SQLite 数据库管理类，封装所有数据库操作。"""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = str(db_path or DB_PATH)
        self.init_db()

    @contextmanager
    def get_conn(self):
        """获取数据库连接（上下文管理器）。

        自动管理事务：正常退出时提交，异常时回滚，最后关闭连接。
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # 使查询结果可通过列名访问
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_db(self):
        """初始化数据库：创建表结构 + 插入默认项目标签。"""
        # 确保数据目录存在
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        with self.get_conn() as conn:
            cursor = conn.cursor()

            # ---- 通知记录表 ----
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id      TEXT    NOT NULL,
                    title        TEXT    DEFAULT '',
                    content      TEXT    DEFAULT '',
                    project_tag  TEXT    DEFAULT '未分类',
                    source_type  TEXT    NOT NULL,
                    raw_content  TEXT    DEFAULT '',
                    created_at   TEXT    NOT NULL
                )
            """)

            # ---- 项目标签表 ----
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    name       TEXT UNIQUE NOT NULL,
                    color      TEXT DEFAULT '#999999',
                    notes      TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                )
            """)

            # 迁移：为旧数据库添加 notes 列（如果不存在）
            cursor.execute("PRAGMA table_info(projects)")
            columns = [col[1] for col in cursor.fetchall()]
            if "notes" not in columns:
                cursor.execute("ALTER TABLE projects ADD COLUMN notes TEXT DEFAULT ''")

        logger.info("数据库初始化完成: %s", self.db_path)

    # ================================================================
    #  通知记录 CRUD
    # ================================================================

    def create_notification(
        self,
        user_id: str,
        title: str,
        content: str,
        project_tag: str,
        source_type: str,
        raw_content: str,
    ) -> int:
        """创建通知记录，返回新记录的 ID。"""
        now = datetime.now().isoformat()
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO notifications
                   (user_id, title, content, project_tag, source_type, raw_content, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (user_id, title, content, project_tag, source_type, raw_content, now),
            )
            notif_id = cursor.lastrowid
        logger.info("通知记录已创建: id=%d, title=%s", notif_id, title)
        return notif_id

    def get_notification(self, notif_id: int) -> Optional[Dict[str, Any]]:
        """根据 ID 获取单条通知详情。"""
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM notifications WHERE id = ?", (notif_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_notifications(
        self,
        user_id: str,
        project_tag: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """获取通知列表（分页），可按项目标签筛选。

        :return: {"list": [...], "total": int, "page": int, "page_size": int}
        """
        page = max(1, page)
        page_size = max(1, min(page_size, 100))  # 限制每页最多100条
        offset = (page - 1) * page_size

        with self.get_conn() as conn:
            cursor = conn.cursor()

            if project_tag:
                # 按项目标签筛选
                cursor.execute(
                    "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND project_tag = ?",
                    (user_id, project_tag),
                )
                total = cursor.fetchone()["total"]
                cursor.execute(
                    """SELECT * FROM notifications
                       WHERE user_id = ? AND project_tag = ?
                       ORDER BY id DESC LIMIT ? OFFSET ?""",
                    (user_id, project_tag, page_size, offset),
                )
            else:
                # 不筛选，获取该用户所有通知
                cursor.execute(
                    "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?",
                    (user_id,),
                )
                total = cursor.fetchone()["total"]
                cursor.execute(
                    """SELECT * FROM notifications
                       WHERE user_id = ?
                       ORDER BY id DESC LIMIT ? OFFSET ?""",
                    (user_id, page_size, offset),
                )

            rows = cursor.fetchall()

        return {
            "list": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def delete_notification(self, notif_id: int) -> bool:
        """删除通知记录，返回是否删除成功。"""
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM notifications WHERE id = ?", (notif_id,))
            deleted = cursor.rowcount > 0
        if deleted:
            logger.info("通知记录已删除: id=%d", notif_id)
        return deleted

    def update_notification_content(self, notif_id: int, content: str) -> bool:
        """更新通知内容（用于切换风格）。"""
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE notifications SET content = ? WHERE id = ?",
                (content, notif_id),
            )
            updated = cursor.rowcount > 0
        if updated:
            logger.info("通知内容已更新: id=%d", notif_id)
        return updated

    # ================================================================
    #  项目标签 CRUD
    # ================================================================

    def list_projects(self) -> List[Dict[str, Any]]:
        """获取所有项目标签（含每个标签下的通知数量）。"""
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.id, p.name, p.color, p.notes, p.created_at,
                       (SELECT COUNT(*) FROM notifications n
                        WHERE n.project_tag = p.name) AS count
                FROM projects p
                ORDER BY p.id
            """)
            rows = cursor.fetchall()
        return [dict(r) for r in rows]

    def create_project(self, name: str, color: str = "#999999", notes: str = "") -> Dict[str, Any]:
        """创建新项目标签，返回创建结果。"""
        now = datetime.now().isoformat()
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO projects (name, color, notes, created_at) VALUES (?, ?, ?, ?)",
                (name, color, notes, now),
            )
            proj_id = cursor.lastrowid
        logger.info("项目标签已创建: id=%d, name=%s", proj_id, name)
        return {"id": proj_id, "name": name, "color": color}

    def get_project_names(self) -> List[str]:
        """获取所有项目标签名称列表（供分类器使用）。"""
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM projects ORDER BY id")
            return [row["name"] for row in cursor.fetchall()]

    def get_statistics(self, user_id: str) -> Dict[str, Any]:
        """获取用户统计信息：累计处理数、本周处理数、分类准确率。

        分类准确率 = 已分类（非"未分类"）通知数 / 总通知数 * 100

        :param user_id: 用户ID
        :return: {"total": int, "weekly": int, "accuracy": int}
        """
        with self.get_conn() as conn:
            cursor = conn.cursor()

            # 累计处理通知数
            cursor.execute(
                "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ?",
                (user_id,),
            )
            total = cursor.fetchone()["cnt"]

            # 本周处理数（取最近7天的记录）
            from datetime import datetime, timedelta
            week_ago = (datetime.now() - timedelta(days=7)).isoformat()
            cursor.execute(
                "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND created_at >= ?",
                (user_id, week_ago),
            )
            weekly = cursor.fetchone()["cnt"]

            # 分类准确率：已分类通知占比（排除"未分类"）
            if total > 0:
                cursor.execute(
                    "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND project_tag != '未分类'",
                    (user_id,),
                )
                classified = cursor.fetchone()["cnt"]
                accuracy = round(classified / total * 100)
            else:
                accuracy = 0

        return {"total": total, "weekly": weekly, "accuracy": accuracy}

    def get_calendar_data(self, user_id: str, year: int, month: int) -> Dict[str, list]:
        """获取指定月份的通知日历数据。

        :return: {"2026-08-20": [notif, ...], ...}
        """
        start = f"{year:04d}-{month:02d}-01"
        if month == 12:
            end = f"{year + 1:04d}-01-01"
        else:
            end = f"{year:04d}-{month + 1:02d}-01"
        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, title, content, project_tag, source_type, created_at
                   FROM notifications
                   WHERE user_id = ? AND created_at >= ? AND created_at < ?
                   ORDER BY created_at DESC""",
                (user_id, start, end),
            )
            rows = cursor.fetchall()
        result = {}
        for row in rows:
            date = row["created_at"][:10]
            result.setdefault(date, []).append(dict(row))
        return result

    def get_today_todos(self, user_id: str) -> Dict[str, Any]:
        """获取今日待办：今日通知 + 内容中提及今日日期的通知。"""
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        md_padded = now.strftime("%m月%d日")
        md_natural = f"{now.month}月{now.day}日"

        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, title, content, project_tag, source_type, created_at
                   FROM notifications WHERE user_id = ? AND created_at LIKE ?
                   ORDER BY created_at DESC""",
                (user_id, today + "%"),
            )
            today_notifs = [dict(r) for r in cursor.fetchall()]

            cursor.execute(
                """SELECT id, title, content, project_tag, source_type, created_at
                   FROM notifications
                   WHERE user_id = ? AND (content LIKE ? OR content LIKE ?)
                   ORDER BY created_at DESC LIMIT 20""",
                (user_id, f"%{md_padded}%", f"%{md_natural}%"),
            )
            deadline_notifs = [dict(r) for r in cursor.fetchall()]

        seen = {n["id"] for n in today_notifs}
        extra = [n for n in deadline_notifs if n["id"] not in seen]
        return {
            "today": today_notifs,
            "deadlines": extra,
            "all": today_notifs + extra,
        }

    def get_date_todos(self, user_id: str, date_str: str) -> Dict[str, Any]:
        """获取指定日期的待办：当天创建的通知 + 内容中提及该日期的通知。"""
        try:
            from datetime import datetime as dt
            d = dt.strptime(date_str, "%Y-%m-%d")
        except (ValueError, TypeError):
            return {"today": [], "deadlines": [], "all": []}

        md_padded = d.strftime("%m月%d日")
        md_natural = f"{d.month}月{d.day}日"

        with self.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, title, content, project_tag, source_type, created_at
                   FROM notifications WHERE user_id = ? AND created_at LIKE ?
                   ORDER BY created_at DESC""",
                (user_id, date_str + "%"),
            )
            date_notifs = [dict(r) for r in cursor.fetchall()]

            cursor.execute(
                """SELECT id, title, content, project_tag, source_type, created_at
                   FROM notifications
                   WHERE user_id = ? AND (content LIKE ? OR content LIKE ?)
                   ORDER BY created_at DESC LIMIT 20""",
                (user_id, f"%{md_padded}%", f"%{md_natural}%"),
            )
            deadline_notifs = [dict(r) for r in cursor.fetchall()]

        seen = {n["id"] for n in date_notifs}
        extra = [n for n in deadline_notifs if n["id"] not in seen]
        return {
            "today": date_notifs,
            "deadlines": extra,
            "all": date_notifs + extra,
        }
