# ============================================================
# AI通知小程序 - 一键安装脚本 (Windows PowerShell)
# 使用方法：在项目根目录执行 .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AI通知小程序 - Docker 一键安装" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Docker
Write-Host "[1/5] 检查 Docker..." -ForegroundColor Yellow
$dockerOk = $false
try {
    $null = Get-Command docker -ErrorAction Stop
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $dockerOk = $true
        Write-Host "  Docker 已安装且运行中" -ForegroundColor Green
    }
} catch {
    Write-Host "  Docker 未安装或未运行" -ForegroundColor Red
    Write-Host "  请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    exit 1
}

if (-not $dockerOk) {
    Write-Host "  请启动 Docker Desktop 后重试" -ForegroundColor Red
    exit 1
}

# 2. 检查 Docker Compose
Write-Host "[2/5] 检查 Docker Compose..." -ForegroundColor Yellow
try {
    $composeCmd = "docker compose"
    Invoke-Expression "$composeCmd version" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $composeCmd = "docker-compose"
        Invoke-Expression "$composeCmd version" 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Docker Compose 未安装" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Docker Compose 可用 ($composeCmd)" -ForegroundColor Green
} catch {
    Write-Host "  Docker Compose 检查失败" -ForegroundColor Red
    exit 1
}

# 3. 创建 .env 配置文件
Write-Host "[3/5] 创建配置文件..." -ForegroundColor Yellow
$envFile = Join-Path $PROJECT_ROOT ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $PROJECT_ROOT ".env.example") $envFile
    Write-Host "  已从模板创建 .env 文件" -ForegroundColor Green
} else {
    Write-Host "  .env 文件已存在，跳过" -ForegroundColor Green
}

# 4. 构建并启动服务
Write-Host "[4/5] 构建并启动 Docker 容器..." -ForegroundColor Yellow
Write-Host "  首次启动需要下载镜像和模型，请耐心等待..." -ForegroundColor DarkGray
Set-Location $PROJECT_ROOT
Invoke-Expression "$composeCmd up -d --build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  容器启动失败" -ForegroundColor Red
    exit 1
}
Write-Host "  容器已启动" -ForegroundColor Green

# 5. 拉取 Ollama 模型
Write-Host "[5/5] 拉取 Ollama 模型（首次需要下载，约 4.7GB）..." -ForegroundColor Yellow
$model = if ($env:LLM_MODEL) { $env:LLM_MODEL } else { "qwen2.5:7b" }
$vmodel = if ($env:OCR_MODEL) { $env:OCR_MODEL } else { "qwen2.5-vl:7b" }

Write-Host "  拉取文本模型: $model" -ForegroundColor DarkGray
docker exec ollama ollama pull $model
Write-Host "  拉取视觉模型: $vmodel" -ForegroundColor DarkGray
docker exec ollama ollama pull $vmodel

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  访问地址: http://localhost:5000" -ForegroundColor White
Write-Host "  Ollama 管理: http://localhost:11434" -ForegroundColor White
Write-Host ""
Write-Host "  常用命令:" -ForegroundColor DarkGray
Write-Host "    查看日志:   $composeCmd logs -f" -ForegroundColor DarkGray
Write-Host "    停止服务:   $composeCmd down" -ForegroundColor DarkGray
Write-Host "    重启服务:   $composeCmd restart" -ForegroundColor DarkGray
Write-Host ""
