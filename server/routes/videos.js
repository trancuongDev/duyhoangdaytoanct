const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const db     = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: 'uploads/videos/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// GET /api/videos
router.get('/', authMiddleware, async (req, res) => {
  let query = 'SELECT * FROM videos ORDER BY created_at DESC';
  const params = [];
  if (req.user.role === 'student') {
    query = 'SELECT * FROM videos WHERE class_name IS NULL OR class_name="" OR class_name=? ORDER BY created_at DESC';
    params.push(req.user.class_name || '');
  }
  const [rows] = await db.query(query, params);
  res.json(rows);
});

// POST /api/videos
router.post('/', authMiddleware, requireRole('teacher','assistant'), upload.single('file'), async (req, res) => {
  const { title, class_name, date } = req.body;
  if (!title || !req.file) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc file' });
  const [result] = await db.query(
    'INSERT INTO videos (title, class_name, date, file_name, file_path, uploaded_by) VALUES (?,?,?,?,?,?)',
    [title, class_name||null, date||null, req.file.originalname, req.file.filename, req.user.id]
  );
  res.json({ id: result.insertId, title, class_name, date, file_name: req.file.originalname });
});

// DELETE /api/videos/:id
router.delete('/:id', authMiddleware, requireRole('teacher','assistant'), async (req, res) => {
  const [rows] = await db.query('SELECT file_path FROM videos WHERE id=?', [req.params.id]);
  if (rows[0]) {
    const fs = require('fs');
    const fp = path.join('uploads/videos', rows[0].file_path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  await db.query('DELETE FROM videos WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
