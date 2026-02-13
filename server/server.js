const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 启用CORS
app.use(cors());

// 设置静态文件目录
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/results', express.static('results'));

// 确保上传和结果目录存在
const uploadsDir = path.join(__dirname, 'uploads');
const resultsDir = path.join(__dirname, 'results');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// 配置Multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

// 创建Multer实例
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|avi|mkv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('不支持的文件格式。请上传 MP4、MOV、AVI 或 MKV 格式的视频。'));
    }
  }
});

// 上传视频文件
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '没有文件被上传。' });
  }

  const fileInfo = {
    originalName: req.file.originalname,
    fileName: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`
  };

  res.json({
    success: true,
    message: '文件上传成功',
    file: fileInfo
  });
});

// 处理视频去水印
app.post('/api/process', async (req, res) => {
  try {
    const { fileName, watermarkArea } = req.body;
    
    if (!fileName || !watermarkArea) {
      return res.status(400).json({ success: false, message: '缺少必要参数。' });
    }

    const inputPath = path.join(uploadsDir, fileName);
    const outputFileName = `processed_${uuidv4()}${path.extname(fileName)}`;
    const outputPath = path.join(resultsDir, outputFileName);

    // 确保文件存在
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ success: false, message: '找不到上传的文件。' });
    }

    // 使用ffmpeg处理视频（模糊水印区域）
    await processVideoWithFFmpeg(inputPath, outputPath, watermarkArea);

    // 返回处理后的视频信息
    res.json({
      success: true,
      message: '视频处理成功',
      result: {
        fileName: outputFileName,
        url: `/results/${outputFileName}`
      }
    });
  } catch (error) {
    console.error('处理视频时出错:', error);
    res.status(500).json({ success: false, message: '处理视频时出错。', error: error.message });
  }
});

// 使用ffmpeg处理视频
function processVideoWithFFmpeg(inputPath, outputPath, watermarkArea) {
  return new Promise((resolve, reject) => {
    // 提取水印区域参数
    const { x, y, width, height } = watermarkArea;
    
    // 构建ffmpeg命令
    // 1. 使用boxblur滤镜模糊水印区域
    // 2. 保持原始视频质量
    ffmpeg(inputPath)
      .videoFilters([
        {
          filter: 'boxblur',
          options: {
            width: 20,
            height: 20,
            steps: 5
          },
          inputs: '[0:v]',
          outputs: '[blurred]'
        },
        {
          filter: 'overlay',
          options: {
            x: x,
            y: y
          },
          inputs: ['[0:v]', '[blurred]'],
          outputs: '[output]'
        }
      ])
      .outputOptions([
        '-map [output]',
        '-map 0:a?', // 保留原始音频（如果有）
        '-c:v libx264',
        '-crf 18', // 高质量视频
        '-preset slow',
        '-c:a copy' // 复制原始音频
      ])
      .output(outputPath)
      .on('end', () => {
        console.log('视频处理完成');
        resolve();
      })
      .on('error', (err) => {
        console.error('ffmpeg错误:', err);
        reject(err);
      })
      .run();
  });
}

// 删除临时文件
app.delete('/api/cleanup', (req, res) => {
  try {
    const { uploadFile, resultFile } = req.body;
    
    if (uploadFile) {
      const uploadFilePath = path.join(uploadsDir, uploadFile);
      if (fs.existsSync(uploadFilePath)) {
        fs.unlinkSync(uploadFilePath);
      }
    }
    
    if (resultFile) {
      const resultFilePath = path.join(resultsDir, resultFile);
      if (fs.existsSync(resultFilePath)) {
        fs.unlinkSync(resultFilePath);
      }
    }
    
    res.json({ success: true, message: '临时文件已清理' });
  } catch (error) {
    console.error('清理文件时出错:', error);
    res.status(500).json({ success: false, message: '清理文件时出错。' });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});