FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码和前端静态文件
COPY backend/ ./backend/
COPY web/ ./web/

WORKDIR /app/backend

# 数据持久化
VOLUME ["/app/backend/data"]

EXPOSE 5000

CMD ["python", "app.py"]
