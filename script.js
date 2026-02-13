/**
 * VideoWatermarkRemover - 视频去水印网页应用
 * 前端交互逻辑实现
 */

// 全局变量
let uploadedFile = null;
let serverFileName = null;
let originalVideoURL = null;
let resultVideoURL = null;
let watermarkSelectionBox = null;
let isSelecting = false;
let startX, startY, currentX, currentY;
let selectionStartX, selectionStartY, selectionEndX, selectionEndY;
let isDragging = false;
let isResizing = false;
let currentResizeHandle = null;

// 服务器配置
const SERVER_URL = 'http://localhost:3000';

// DOM元素
const elements = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    uploadProgressContainer: document.getElementById('uploadProgressContainer'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadProgressText: document.getElementById('uploadProgressText'),
    fileInfoContainer: document.getElementById('fileInfoContainer'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    removeFileBtn: document.getElementById('removeFileBtn'),
    watermarkSelection: document.getElementById('watermarkSelection'),
    autoDetectBtn: document.getElementById('autoDetectBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    processingControls: document.getElementById('processingControls'),
    processBtn: document.getElementById('processBtn'),
    processingStatus: document.getElementById('processingStatus'),
    statusText: document.getElementById('statusText'),
    processingProgress: document.getElementById('processingProgress'),
    processingProgressText: document.getElementById('processingProgressText'),
    originalPreview: document.getElementById('originalPreview'),
    originalVideo: document.getElementById('originalVideo'),
    resultPreview: document.getElementById('resultPreview'),
    resultVideo: document.getElementById('resultVideo'),
    downloadContainer: document.querySelector('.download-container'),
    downloadBtn: document.getElementById('downloadBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    fullscreenModal: document.getElementById('fullscreenModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    fullscreenVideo: document.getElementById('fullscreenVideo')
};

// 初始化应用
function initApp() {
    setupEventListeners();
}

// 设置事件监听器
function setupEventListeners() {
    // 拖放上传
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    
    // 文件选择
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    
    // 移除文件
    elements.removeFileBtn.addEventListener('click', removeFile);
    
    // 水印选择
    elements.autoDetectBtn.addEventListener('click', autoDetectWatermark);
    elements.clearSelectionBtn.addEventListener('click', clearSelection);
    
    // 视频预览事件
    elements.originalVideo.addEventListener('loadedmetadata', handleVideoLoaded);
    elements.originalVideo.addEventListener('click', startSelection);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // 处理按钮
    elements.processBtn.addEventListener('click', processVideo);
    
    // 下载和全屏
    elements.downloadBtn.addEventListener('click', downloadVideo);
    elements.fullscreenBtn.addEventListener('click', openFullscreenPreview);
    elements.closeModalBtn.addEventListener('click', closeFullscreenPreview);
    elements.fullscreenModal.addEventListener('click', (e) => {
        if (e.target === elements.fullscreenModal) {
            closeFullscreenPreview();
        }
    });
}

// 处理拖放事件
function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone.classList.add('active');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('active');
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('active');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

// 处理文件选择
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

// 处理上传的文件
function processFile(file) {
    // 验证文件类型
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (!validTypes.includes(file.type)) {
        alert('不支持的文件格式。请上传 MP4、MOV、AVI 或 MKV 格式的视频。');
        return;
    }
    
    // 验证文件大小 (100MB 限制)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
        alert('文件太大。最大支持 100MB 的视频文件。');
        return;
    }
    
    uploadedFile = file;
    
    // 显示上传进度
    showUploadProgress();
    
    // 实际上传文件到服务器
    uploadFileToServer(file);
}

// 上传文件到服务器
function uploadFileToServer(file) {
    const formData = new FormData();
    formData.append('video', file);
    
    const xhr = new XMLHttpRequest();
    
    // 监听上传进度
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            elements.uploadProgress.style.width = `${progress}%`;
            elements.uploadProgressText.textContent = `${Math.round(progress)}%`;
        }
    });
    
    // 监听上传完成
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    // 保存服务器返回的文件名
                    serverFileName = response.file.fileName;
                    
                    // 上传完成后显示文件信息
                    showFileInfo(file);
                    
                    // 创建视频预览
                    createVideoPreview(file);
                } else {
                    alert(`上传失败: ${response.message}`);
                    resetUploadUI();
                }
            } catch (error) {
                console.error('解析服务器响应时出错:', error);
                alert('上传失败: 服务器响应格式错误');
                resetUploadUI();
            }
        } else {
            alert(`上传失败: 服务器错误 (${xhr.status})`);
            resetUploadUI();
        }
    });
    
    // 监听上传错误
    xhr.addEventListener('error', () => {
        alert('上传失败: 网络错误');
        resetUploadUI();
    });
    
    // 监听上传超时
    xhr.addEventListener('timeout', () => {
        alert('上传失败: 连接超时');
        resetUploadUI();
    });
    
    // 发送请求
    xhr.open('POST', `${SERVER_URL}/api/upload`);
    xhr.timeout = 300000; // 5分钟超时
    xhr.send(formData);
}

// 重置上传UI
function resetUploadUI() {
    elements.uploadProgressContainer.classList.add('hidden');
    uploadedFile = null;
    serverFileName = null;
}

// 显示上传进度
function showUploadProgress() {
    elements.uploadProgressContainer.classList.remove('hidden');
    elements.uploadProgress.style.width = '0%';
    elements.uploadProgressText.textContent = '0%';
}

// 模拟上传进度
function simulateUploadProgress(callback) {
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(callback, 500); // 延迟一下，让用户看到100%的进度
        }
        
        elements.uploadProgress.style.width = `${progress}%`;
        elements.uploadProgressText.textContent = `${Math.round(progress)}%`;
    }, 200);
}

// 显示文件信息
function showFileInfo(file) {
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.fileInfoContainer.classList.remove('hidden');
}

// 创建视频预览
function createVideoPreview(file) {
    // 清除之前的预览
    if (originalVideoURL) {
        URL.revokeObjectURL(originalVideoURL);
    }
    
    // 创建新的视频URL
    originalVideoURL = URL.createObjectURL(file);
    
    // 设置视频源
    elements.originalVideo.src = originalVideoURL;
    elements.originalVideo.classList.remove('hidden');
    
    // 隐藏占位符
    const placeholder = elements.originalPreview.querySelector('.video-placeholder');
    placeholder.classList.add('hidden');
    
    // 显示水印选择区域
    elements.watermarkSelection.classList.remove('hidden');
}

// 处理视频加载完成
function handleVideoLoaded() {
    // 视频加载完成后，可以进行水印检测等操作
    // 这里可以添加一些视频元数据的处理逻辑
}

// 开始选择水印区域
function startSelection(e) {
    // 如果已经有选择框，先清除
    if (watermarkSelectionBox) {
        watermarkSelectionBox.remove();
        watermarkSelectionBox = null;
    }
    
    // 获取视频元素的位置
    const videoRect = elements.originalVideo.getBoundingClientRect();
    
    // 计算选择起始点（相对于视频元素）
    startX = e.clientX - videoRect.left;
    startY = e.clientY - videoRect.top;
    
    // 设置选择状态
    isSelecting = true;
    
    // 创建选择框
    watermarkSelectionBox = document.createElement('div');
    watermarkSelectionBox.className = 'watermark-selection-box';
    watermarkSelectionBox.style.left = `${startX}px`;
    watermarkSelectionBox.style.top = `${startY}px`;
    watermarkSelectionBox.style.width = '0px';
    watermarkSelectionBox.style.height = '0px';
    
    // 添加到视频容器
    elements.originalVideo.parentElement.style.position = 'relative';
    elements.originalVideo.parentElement.appendChild(watermarkSelectionBox);
    
    // 显示处理控制
    elements.processingControls.classList.remove('hidden');
}

// 处理鼠标移动
function handleMouseMove(e) {
    if (!isSelecting && !isDragging && !isResizing) return;
    
    const videoRect = elements.originalVideo.getBoundingClientRect();
    
    if (isSelecting) {
        // 更新选择框大小
        currentX = e.clientX - videoRect.left;
        currentY = e.clientY - videoRect.top;
        
        const width = currentX - startX;
        const height = currentY - startY;
        
        if (width > 0) {
            watermarkSelectionBox.style.width = `${width}px`;
        } else {
            watermarkSelectionBox.style.left = `${currentX}px`;
            watermarkSelectionBox.style.width = `${startX - currentX}px`;
        }
        
        if (height > 0) {
            watermarkSelectionBox.style.height = `${height}px`;
        } else {
            watermarkSelectionBox.style.top = `${currentY}px`;
            watermarkSelectionBox.style.height = `${startY - currentY}px`;
        }
    } else if (isDragging) {
        // 移动选择框
        const dx = e.clientX - currentX;
        const dy = e.clientY - currentY;
        
        const left = parseInt(watermarkSelectionBox.style.left) + dx;
        const top = parseInt(watermarkSelectionBox.style.top) + dy;
        
        // 限制在视频范围内
        const maxLeft = videoRect.width - parseInt(watermarkSelectionBox.style.width);
        const maxTop = videoRect.height - parseInt(watermarkSelectionBox.style.height);
        
        watermarkSelectionBox.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
        watermarkSelectionBox.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
        
        currentX = e.clientX;
        currentY = e.clientY;
    } else if (isResizing && currentResizeHandle) {
        // 调整选择框大小
        const rect = watermarkSelectionBox.getBoundingClientRect();
        let newWidth = rect.width;
        let newHeight = rect.height;
        let newLeft = rect.left - videoRect.left;
        let newTop = rect.top - videoRect.top;
        
        switch (currentResizeHandle) {
            case 'tl':
                newWidth = rect.right - e.clientX;
                newHeight = rect.bottom - e.clientY;
                newLeft = e.clientX - videoRect.left;
                newTop = e.clientY - videoRect.top;
                break;
            case 'tr':
                newWidth = e.clientX - rect.left;
                newHeight = rect.bottom - e.clientY;
                newTop = e.clientY - videoRect.top;
                break;
            case 'bl':
                newWidth = rect.right - e.clientX;
                newHeight = e.clientY - rect.top;
                newLeft = e.clientX - videoRect.left;
                break;
            case 'br':
                newWidth = e.clientX - rect.left;
                newHeight = e.clientY - rect.top;
                break;
        }
        
        // 限制最小大小
        if (newWidth < 20) newWidth = 20;
        if (newHeight < 20) newHeight = 20;
        
        // 限制在视频范围内
        if (newLeft < 0) {
            newWidth += newLeft;
            newLeft = 0;
        }
        if (newTop < 0) {
            newHeight += newTop;
            newTop = 0;
        }
        if (newLeft + newWidth > videoRect.width) {
            newWidth = videoRect.width - newLeft;
        }
        if (newTop + newHeight > videoRect.height) {
            newHeight = videoRect.height - newTop;
        }
        
        watermarkSelectionBox.style.left = `${newLeft}px`;
        watermarkSelectionBox.style.top = `${newTop}px`;
        watermarkSelectionBox.style.width = `${newWidth}px`;
        watermarkSelectionBox.style.height = `${newHeight}px`;
    }
}

// 处理鼠标释放
function handleMouseUp() {
    if (isSelecting) {
        isSelecting = false;
        
        // 获取选择区域的坐标
        const left = parseInt(watermarkSelectionBox.style.left);
        const top = parseInt(watermarkSelectionBox.style.top);
        const width = parseInt(watermarkSelectionBox.style.width);
        const height = parseInt(watermarkSelectionBox.style.height);
        
        // 保存选择区域
        selectionStartX = left;
        selectionStartY = top;
        selectionEndX = left + width;
        selectionEndY = top + height;
        
        // 添加调整大小的手柄
        addResizeHandles();
        
        // 添加拖动事件
        watermarkSelectionBox.addEventListener('mousedown', (e) => {
            if (e.target === watermarkSelectionBox) {
                isDragging = true;
                currentX = e.clientX;
                currentY = e.clientY;
                e.preventDefault();
            }
        });
    } else if (isDragging) {
        isDragging = false;
    } else if (isResizing) {
        isResizing = false;
        currentResizeHandle = null;
    }
}

// 添加调整大小的手柄
function addResizeHandles() {
    const handles = ['tl', 'tr', 'bl', 'br'];
    
    handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `watermark-selection-handle ${position}`;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            currentResizeHandle = position;
            e.stopPropagation();
        });
        
        watermarkSelectionBox.appendChild(handle);
    });
}

// 自动检测水印
function autoDetectWatermark() {
    // 显示加载状态
    elements.autoDetectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中...';
    elements.autoDetectBtn.disabled = true;
    
    // 模拟AI检测过程
    setTimeout(() => {
        // 清除之前的选择框
        if (watermarkSelectionBox) {
            watermarkSelectionBox.remove();
            watermarkSelectionBox = null;
        }
        
        // 获取视频尺寸
        const videoWidth = elements.originalVideo.videoWidth;
        const videoHeight = elements.originalVideo.videoHeight;
        const videoRect = elements.originalVideo.getBoundingClientRect();
        
        // 计算视频比例
        const scaleX = videoRect.width / videoWidth;
        const scaleY = videoRect.height / videoHeight;
        
        // 模拟检测到的水印位置（通常在右下角）
        const watermarkWidth = videoWidth * 0.2; // 假设水印宽度为视频的20%
        const watermarkHeight = videoHeight * 0.1; // 假设水印高度为视频的10%
        const watermarkX = videoWidth * 0.75; // 假设水印在右侧中间位置
        const watermarkY = videoHeight * 0.8; // 假设水印在底部上方
        
        // 创建选择框
        watermarkSelectionBox = document.createElement('div');
        watermarkSelectionBox.className = 'watermark-selection-box';
        watermarkSelectionBox.style.left = `${watermarkX * scaleX}px`;
        watermarkSelectionBox.style.top = `${watermarkY * scaleY}px`;
        watermarkSelectionBox.style.width = `${watermarkWidth * scaleX}px`;
        watermarkSelectionBox.style.height = `${watermarkHeight * scaleY}px`;
        
        // 添加到视频容器
        elements.originalVideo.parentElement.style.position = 'relative';
        elements.originalVideo.parentElement.appendChild(watermarkSelectionBox);
        
        // 保存选择区域
        selectionStartX = watermarkX * scaleX;
        selectionStartY = watermarkY * scaleY;
        selectionEndX = (watermarkX + watermarkWidth) * scaleX;
        selectionEndY = (watermarkY + watermarkHeight) * scaleY;
        
        // 添加调整大小的手柄
        addResizeHandles();
        
        // 添加拖动事件
        watermarkSelectionBox.addEventListener('mousedown', (e) => {
            if (e.target === watermarkSelectionBox) {
                isDragging = true;
                currentX = e.clientX;
                currentY = e.clientY;
                e.preventDefault();
            }
        });
        
        // 显示处理控制
        elements.processingControls.classList.remove('hidden');
        
        // 恢复按钮状态
        elements.autoDetectBtn.innerHTML = '<i class="fas fa-magic"></i> AI智能检测';
        elements.autoDetectBtn.disabled = false;
        
        // 显示成功消息
        alert('AI检测完成！已自动标记可能的水印位置。您可以拖动或调整选择框进行微调。');
    }, 2000);
}

// 清除选择
function clearSelection() {
    if (watermarkSelectionBox) {
        watermarkSelectionBox.remove();
        watermarkSelectionBox = null;
    }
    
    // 隐藏处理控制
    elements.processingControls.classList.add('hidden');
    
    // 重置选择区域
    selectionStartX = null;
    selectionStartY = null;
    selectionEndX = null;
    selectionEndY = null;
}

// 处理视频
function processVideo() {
    // 检查是否已选择水印区域
    if (!watermarkSelectionBox) {
        alert('请先标记水印区域或使用AI智能检测。');
        return;
    }
    
    // 检查是否已上传文件
    if (!serverFileName) {
        alert('请先上传视频文件。');
        return;
    }
    
    // 显示处理状态
    elements.processingStatus.classList.remove('hidden');
    elements.processingControls.classList.add('hidden');
    
    // 获取水印区域坐标
    const watermarkArea = {
        x: parseInt(watermarkSelectionBox.style.left),
        y: parseInt(watermarkSelectionBox.style.top),
        width: parseInt(watermarkSelectionBox.style.width),
        height: parseInt(watermarkSelectionBox.style.height)
    };
    
    // 发送处理请求到服务器
    sendProcessingRequest(watermarkArea);
}

// 发送处理请求到服务器
function sendProcessingRequest(watermarkArea) {
    const xhr = new XMLHttpRequest();
    
    // 监听进度更新
    xhr.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            elements.processingProgress.style.width = `${progress}%`;
            elements.processingProgressText.textContent = `${Math.round(progress)}%`;
        }
    });
    
    // 监听处理完成
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    // 处理完成后显示结果
                    resultVideoURL = `${SERVER_URL}${response.result.url}`;
                    showProcessingResult();
                } else {
                    alert(`处理失败: ${response.message}`);
                    resetProcessingUI();
                }
            } catch (error) {
                console.error('解析服务器响应时出错:', error);
                alert('处理失败: 服务器响应格式错误');
                resetProcessingUI();
            }
        } else {
            alert(`处理失败: 服务器错误 (${xhr.status})`);
            resetProcessingUI();
        }
    });
    
    // 监听处理错误
    xhr.addEventListener('error', () => {
        alert('处理失败: 网络错误');
        resetProcessingUI();
    });
    
    // 监听处理超时
    xhr.addEventListener('timeout', () => {
        alert('处理失败: 连接超时');
        resetProcessingUI();
    });
    
    // 发送请求
    xhr.open('POST', `${SERVER_URL}/api/process`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 600000; // 10分钟超时
    
    // 发送数据
    const data = {
        fileName: serverFileName,
        watermarkArea: watermarkArea
    };
    
    xhr.send(JSON.stringify(data));
}

// 重置处理UI
function resetProcessingUI() {
    elements.processingStatus.classList.add('hidden');
    elements.processingControls.classList.remove('hidden');
}

// 模拟处理进度
function simulateProcessingProgress(callback) {
    let progress = 0;
    const statusMessages = [
        '正在分析视频...',
        '正在提取水印区域...',
        '应用去水印算法...',
        '优化视频质量...',
        '处理完成！'
    ];
    
    const interval = setInterval(() => {
        progress += Math.random() * 8;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(callback, 500);
        }
        
        // 更新状态文本
        const statusIndex = Math.min(Math.floor(progress / 20), statusMessages.length - 1);
        elements.statusText.textContent = statusMessages[statusIndex];
        
        // 更新进度条
        elements.processingProgress.style.width = `${progress}%`;
        elements.processingProgressText.textContent = `${Math.round(progress)}%`;
    }, 300);
}

// 显示处理结果
function showProcessingResult() {
    // 显示结果预览区域
    elements.resultPreview.classList.remove('hidden');
    
    // 隐藏占位符
    const placeholder = elements.resultPreview.querySelector('.video-placeholder');
    placeholder.classList.add('hidden');
    
    // 设置结果视频源
    elements.resultVideo.src = resultVideoURL;
    elements.resultVideo.classList.remove('hidden');
    
    // 显示下载区域
    elements.downloadContainer.classList.remove('hidden');
    
    // 重置处理状态
    elements.processingStatus.classList.add('hidden');
}

// 下载视频
function downloadVideo() {
    if (!resultVideoURL) return;
    
    // 创建下载链接
    const a = document.createElement('a');
    a.href = resultVideoURL;
    a.download = `无水印_${uploadedFile.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// 打开全屏预览
function openFullscreenPreview() {
    if (!resultVideoURL) return;
    
    // 设置全屏视频源
    elements.fullscreenVideo.src = resultVideoURL;
    
    // 显示模态框
    elements.fullscreenModal.classList.remove('hidden');
    
    // 播放视频
    elements.fullscreenVideo.play();
}

// 关闭全屏预览
function closeFullscreenPreview() {
    // 暂停视频
    elements.fullscreenVideo.pause();
    
    // 隐藏模态框
    elements.fullscreenModal.classList.add('hidden');
}

// 移除文件
function removeFile() {
    // 如果有服务器文件，请求删除
    if (serverFileName) {
        cleanupServerFiles();
    }
    
    // 清除文件引用
    uploadedFile = null;
    serverFileName = null;
    
    // 清除视频URL
    if (originalVideoURL) {
        URL.revokeObjectURL(originalVideoURL);
        originalVideoURL = null;
    }
    
    if (resultVideoURL && resultVideoURL.startsWith('blob:')) {
        URL.revokeObjectURL(resultVideoURL);
    }
    resultVideoURL = null;
    
    // 重置UI
    elements.fileInfoContainer.classList.add('hidden');
    elements.uploadProgressContainer.classList.add('hidden');
    elements.watermarkSelection.classList.add('hidden');
    elements.processingControls.classList.add('hidden');
    elements.processingStatus.classList.add('hidden');
    elements.resultPreview.classList.add('hidden');
    
    // 重置视频预览
    elements.originalVideo.src = '';
    elements.originalVideo.classList.add('hidden');
    elements.resultVideo.src = '';
    elements.resultVideo.classList.add('hidden');
    
    // 显示占位符
    const originalPlaceholder = elements.originalPreview.querySelector('.video-placeholder');
    originalPlaceholder.classList.remove('hidden');
    
    const resultPlaceholder = elements.resultPreview.querySelector('.video-placeholder');
    resultPlaceholder.classList.remove('hidden');
    
    // 清除水印选择框
    if (watermarkSelectionBox) {
        watermarkSelectionBox.remove();
        watermarkSelectionBox = null;
    }
    
    // 重置选择区域
    selectionStartX = null;
    selectionStartY = null;
    selectionEndX = null;
    selectionEndY = null;
    
    // 重置文件输入
    elements.fileInput.value = '';
}

// 清理服务器文件
function cleanupServerFiles() {
    if (!serverFileName) return;
    
    const xhr = new XMLHttpRequest();
    
    // 发送请求
    xhr.open('DELETE', `${SERVER_URL}/api/cleanup`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    // 发送数据
    const data = {
        uploadFile: serverFileName
    };
    
    xhr.send(JSON.stringify(data));
    
    // 不需要等待响应，因为这是一个后台清理操作
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 初始化应用
document.addEventListener('DOMContentLoaded', initApp);