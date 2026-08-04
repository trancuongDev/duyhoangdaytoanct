const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

// Tạo thư mục uploads nếu chưa có
['uploads/exams','uploads/videos'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
  console.log(`📦 Kết nối MySQL: ${process.env.DB_NAME || 'duyhoangtoan'}`);
});
