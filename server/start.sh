#!/bin/bash

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

echo "正在安装依赖..."
npm install

echo "启动服务器..."
npm start