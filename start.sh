#!/bin/bash

echo "========================================="
echo "  视频去水印应用启动脚本"
echo "========================================="
echo ""

# 检查是否安装了Node.js
if ! command -v node &> /dev/null
then
    echo "错误: 未安装Node.js。请先安装Node.js 14或更高版本。"
    exit 1
fi

# 检查是否安装了npm
if ! command -v npm &> /dev/null
then
    echo "错误: 未安装npm。请先安装npm。"
    exit 1
fi

# 检查是否安装了ffmpeg
if ! command -v ffmpeg &> /dev/null
then
    echo "错误: 未安装ffmpeg。请先安装ffmpeg。"
    echo "Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "macOS: brew install ffmpeg"
    echo "Windows: 下载ffmpeg并添加到PATH环境变量"
    exit 1
fi

echo "正在启动后端服务器..."
cd server
chmod +x start.sh
./start.sh &

# 保存后端进程ID
BACKEND_PID=$!

echo "后端服务器已启动 (PID: $BACKEND_PID)"
echo ""

echo "========================================="
echo "  应用已启动！"
echo "========================================="
echo "后端服务器运行在: http://localhost:3000"
echo "请在浏览器中打开 index.html 文件以使用应用"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "========================================="

# 等待用户中断
trap "echo '正在停止服务器...'; kill $BACKEND_PID; exit 0" INT

# 保持脚本运行
wait $BACKEND_PID