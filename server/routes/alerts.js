const router = require('express').Router();
const db     = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/alerts — trợ lý
router.get('/', authMiddleware, requireRole('assistant'), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 200');
  res.json(rows);
});

// POST /api/alerts — học sinh tự ghi khi bị phát hiện
router.post('/', authMiddleware, requireRole('student'), async (req, res) => {
  const { reason } = req.body;
  await db.query(
    'INSERT INTO alerts (student_id, username, student_name, class_name, reason) VALUES (?,?,?,?,?)',
    [req.user.id, req.user.username, req.user.full_name, req.user.class_name || '', reason || 'Không rõ']
  );
  res.json({ success: true });
});

// DELETE /api/alerts/:id — xóa từng alert theo id
router.delete('/:id', authMiddleware, requireRole('assistant'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
  await db.query('DELETE FROM alerts WHERE id=?', [id]);
  res.json({ success: true });
});

// DELETE /api/alerts — xóa tất cả (chỉ giáo viên)
router.delete('/', authMiddleware, requireRole('teacher'), async (req, res) => {
  await db.query('DELETE FROM alerts');
  res.json({ success: true });
});

module.exports = router;
