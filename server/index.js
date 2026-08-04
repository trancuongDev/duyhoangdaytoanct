const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

// Tạo thư mục uploads nếu chưa có
['uploads/exams','uploads/videos'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// CORS — chỉ cho phép origin cụ thể khi deploy (đặt ALLOWED_ORIGIN trong .env)
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Bảo mật header cơ bản (không cần helmet package)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Rate limiting đơn giản không cần package (in-memory, reset mỗi 15 phút)
const _rateMap = new Map();
const RATE_WINDOW = 15 * 60 * 1000; // 15 phút
const RATE_LIMIT  = 200;            // tối đa 200 request/IP/15 phút
app.use('/api/', (req, res, next) => {
  const ip  = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = _rateMap.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW) { rec.count = 0; rec.start = now; }
  rec.count++;
  _rateMap.set(ip, rec);
  if (rec.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  }
  next();
});

// Serve file tĩnh (HTML/CSS/JS frontend)
app.use(express.static(path.join(__dirname, '..')));

// Serve file upload
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes API
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/students',   require('./routes/students'));
app.use('/api/exams',      require('./routes/exams'));
app.use('/api/videos',     require('./routes/videos'));
app.use('/api/alerts',     require('./routes/alerts'));
app.use('/api/assistants', require('./routes/assistants'));

// Global error handler cho multer và các lỗi khác
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File quá lớn' });
  }
  if (err.message && err.message.includes('Định dạng file') || err.message && err.message.includes('Chỉ chấp nhận')) {
    return res.status(415).json({ error: err.message });
  }
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
  console.log(`📦 Kết nối MySQL: ${process.env.DB_NAME || 'duyhoangtoan'}`);
});
