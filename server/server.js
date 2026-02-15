const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Deployment JSON parser
app.use(express.json({ limit: '2048mb' }));

// Static paths
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/results', express.static(path.join(__dirname, 'results')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

/* ===========================
   STEP 2A — QUEUE VARIABLES
=========================== */
const jobQueue = [];
let isProcessing = false;

/* ===========================
   STEP 5 — PROGRESS TRACKING
=========================== */
const jobsProgress = {}; // key: jobId -> { status, percent }

/* ===========================
   STEP 2B/3 — QUEUE WORKER WITH TIMEOUT & PROGRESS
=========================== */
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per job

async function processNextJob() {
  if (isProcessing || jobQueue.length === 0) return;

  isProcessing = true;
  const job = jobQueue.shift();

  jobsProgress[job.jobId] = { status: 'processing', percent: 0 };

  const timeout = new Promise((_, reject) => {
    job._timeoutId = setTimeout(function () {
      reject(new Error('视频处理超时'));
    }, JOB_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      processVideoWithFFmpegWithProgress(job.inputPath, job.outputPath, job.watermarkArea, job.jobId),
      timeout
    ]);
    clearTimeout(job._timeoutId);
    jobsProgress[job.jobId].status = 'done';
    jobsProgress[job.jobId].percent = 100;
    job.resolve();
  } catch (err) {
    clearTimeout(job._timeoutId);
    jobsProgress[job.jobId].status = 'error';
    job.reject(err);
  } finally {
    isProcessing = false;
    processNextJob();
  }
}

/* ===========================
   MULTER CONFIGURATION
=========================== */
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) { cb(null, `${uuidv4()}${path.extname(file.originalname)}`); }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedExt = ['.mp4', '.mov', '.avi', '.mkv'];
    if (allowedExt.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('不支持的文件格式'));
  }
});

/* ===========================
   UPLOAD ROUTE
=========================== */
app.post('/api/upload', upload.single('video'), function (req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: '没有文件被上传' });

  const fileInfo = {
    originalName: req.file.originalname,
    fileName: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`
  };

  res.json({ success: true, message: '文件上传成功', file: fileInfo });
});

/* ===========================
   PROCESS VIDEO ROUTE
=========================== */
app.post('/api/process', async function (req, res) {
  try {
    const { fileName, watermarkArea } = req.body;
    if (!fileName || !watermarkArea) return res.status(400).json({ success: false, message: '缺少必要参数' });

    const inputPath = path.join(uploadsDir, fileName);
    const outputFileName = `processed_${uuidv4()}${path.extname(fileName)}`;
    const outputPath = path.join(resultsDir, outputFileName);

    if (!fs.existsSync(inputPath)) return res.status(404).json({ success: false, message: '找不到上传的文件' });

    const jobId = uuidv4();

    await new Promise(function (resolve, reject) {
      jobQueue.push({ inputPath, outputPath, watermarkArea, jobId, resolve, reject });
      processNextJob();
    });

    res.json({ success: true, message: '视频处理已排队', jobId, result: { fileName: outputFileName, url: `/results/${outputFileName}` } });

  } catch (error) {
    console.error('处理视频时出错:', error);
    res.status(500).json({ success: false, message: '处理视频时出错。', error: error.message });
  }
});

/* ===========================
   STEP 3 — FFmpeg WITH PROGRESS
=========================== */
function processVideoWithFFmpegWithProgress(inputPath, outputPath, watermarkArea, jobId) {
  return new Promise(function (resolve, reject) {
    const { x, y, width = 200, height = 200 } = watermarkArea;

    ffmpeg.ffprobe(inputPath, function (err, metadata) {
      if (err) return reject(err);

      const videoStream = metadata.streams.find(function (s) { return s.codec_type === 'video'; });
      if (!videoStream) return reject(new Error('无法读取视频流'));

      const videoWidth = videoStream.width;
      const videoHeight = videoStream.height;

      const safeX = Math.max(0, Math.min(x, videoWidth - width));
      const safeY = Math.max(0, Math.min(y, videoHeight - height));
      const safeWidth = Math.min(width, videoWidth - safeX);
      const safeHeight = Math.min(height, videoHeight - safeY);

      ffmpeg(inputPath)
        .complexFilter([
          `[0:v]split=2[main][tmp];` +
          `[tmp]crop=${safeWidth}:${safeHeight}:${safeX}:${safeY},boxblur=20:5[blur];` +
          `[main][blur]overlay=${safeX}:${safeY}[output]`
        ])
        .outputOptions([
          '-map [output]',
          '-map 0:a?',
          '-c:v libx264',
          '-crf 18',
          '-preset slow',
          '-c:a copy'
        ])
        .output(outputPath)
        .on('progress', function (progress) {
          if (jobsProgress[jobId]) jobsProgress[jobId].percent = Math.floor(progress.percent || 0);
        })
        .on('end', function () { resolve(); })
        .on('error', function (err) { reject(err); })
        .run();
    });
  });
}

/* ===========================
   STEP 5 — PROGRESS ENDPOINT
=========================== */
app.get('/api/progress/:jobId', function (req, res) {
  const jobId = req.params.jobId;
  if (!jobsProgress[jobId]) return res.status(404).json({ success: false, message: '找不到该任务' });
  res.json({ success: true, jobId, ...jobsProgress[jobId] });
});

/* ===========================
   STEP 4 — AUTOMATIC DISK CLEANUP
=========================== */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 min
const MAX_FILE_AGE_MS = 60 * 60 * 1000; // 1 hour

function cleanupOldFiles() {
  const now = Date.now();

  [uploadsDir, resultsDir].forEach(function (dir) {
    fs.readdir(dir, function (err, files) {
      if (err) return console.error('扫描目录出错:', dir, err);

      files.forEach(function (file) {
        const filePath = path.join(dir, file);

        fs.stat(filePath, function (err, stats) {
          if (err) return console.error('读取文件信息失败:', filePath, err);

          if (now - stats.mtimeMs > MAX_FILE_AGE_MS) {
            fs.unlink(filePath, function (err) {
              if (!err) console.log('删除旧文件:', filePath);
            });
          }
        });
      });
    });
  });
}

setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
cleanupOldFiles(); // initial cleanup

// Manual cleanup route
app.delete('/api/cleanup', function (req, res) {
  try {
    const { uploadFile, resultFile } = req.body;
    if (uploadFile && fs.existsSync(path.join(uploadsDir, uploadFile))) fs.unlinkSync(path.join(uploadsDir, uploadFile));
    if (resultFile && fs.existsSync(path.join(resultsDir, resultFile))) fs.unlinkSync(path.join(resultsDir, resultFile));
    res.json({ success: true, message: '临时文件已清理' });
  } catch (error) {
    res.status(500).json({ success: false, message: '清理文件时出错' });
  }
});

// Start server
app.listen(PORT, function () {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
