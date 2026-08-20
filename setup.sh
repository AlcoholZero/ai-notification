#!/usr/bin/env bash
# ============================================================
# AI通知小程序 - 一键安装脚本 (Linux / macOS)
# 使用方法：chmod +x setup.sh && ./setup.sh
# ============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "\033[36m============================================\033[0m"
echo -e "\033[36m  AI通知小程序 - Docker 一键安装\033[0m"
echo -e "\033[36m============================================\033[0m"
echo ""

# 1. 检查 Docker
echo -e "\033[33m[1/5] 检查 Docker...\033[0m"
if ! command -v docker &> /dev/null; then
    echo -e "\033[31m  Docker 未安装\033[0m"
    echo -e "\033[31m  请先安装 Docker: https://docs.docker.com/get-docker/\033[0m"
    exit 1
fi
if ! docker info &> /dev/null; then
    echo -e "\033[31m  Docker 未运行，请先启动 Docker 服务\033[0m"
    exit 1
fi
echo -e "\033[32m  Docker 已安装且运行中\033[0m"

# 2. 检查 Docker Compose
echo -e "\033[33m[2/5] 检查 Docker Compose...\033[0m"
COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "\033[31m  Docker Compose 未安装\033[0m"
    exit 1
fi
echo -e "\033[32m  Docker Compose 可用 ($COMPOSE_CMD)\033[0m"

# 3. 创建 .env 配置文件
echo -e "\033[33m[3/5] 创建配置文件...\033[0m"
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo -e "\033[32m  已从模板创建 .env 文件\033[0m"
else
    echo -e "\033[32m  .env 文件已存在，跳过\033[0m"
fi

# 4. 构建并启动服务
echo -e "\033[33m[4/5] 构建并启动 Docker 容器...\033[0m"
echo -e "\033[90m  首次启动需要下载镜像和模型，请耐心等待...\033[0m"
cd "$PROJECT_ROOT"
$COMPOSE_CMD up -d --build
echo -e "\033[32m  容器已启动\033[0m"

# 5. 拉取 Ollama 模型
echo -e "\033[33m[5/5] 拉取 Ollama 模型（首次需要下载，约 4.7GB）...\033[0m"
MODEL="${LLM_MODEL:-qwen2.5:7b}"
VMODEL="${OCR_MODEL:-qwen2.5-vl:7b}"

echo -e "\033[90m  拉取文本模型: $MODEL\033[0m"
docker exec ollama ollama pull "$MODEL"
echo -e "\033[90m  拉取视觉模型: $VMODEL\033[0m"
docker exec ollama ollama pull "$VMODEL"

echo ""
echo -e "\033[36m============================================\033[0m"
echo -e "\033[32m  安装完成！\033[0m"
echo -e "\033[36m============================================\033[0m"
echo ""
echo -e "\033[97m  访问地址: http://localhost:5000\033[0m"
echo -e "\033[97m  Ollama 管理: http://localhost:11434\033[0m"
echo ""
echo -e "\033[90m  常用命令:\033[0m"
echo -e "\033[90m    查看日志:   $COMPOSE_CMD logs -f\033[0m"
echo -e "\033[90m    停止服务:   $COMPOSE_CMD down\033[0m"
echo -e "\033[90m    重启服务:   $COMPOSE_CMD restart\033[0m"
echo ""
