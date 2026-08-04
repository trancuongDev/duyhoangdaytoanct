const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/students — trợ lý + giáo viên
router.get('/', authMiddleware, requireRole('teacher','assistant'), async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, username, full_name, class_name, active, created_at FROM users WHERE role='student' ORDER BY created_at DESC"
  );
  res.json(rows);
});

// POST /api/students — chỉ trợ lý
router.post('/', authMiddleware, requireRole('assistant'), async (req, res) => {
  const { username, password, full_name, class_name } = req.body;
  if (!username || !password || !full_name)
    return res.status(400).json({ error: 'Thiếu thông tin' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (username, password, full_name, role, class_name) VALUES (?,?,?,'student',?)",
      [username, hash, full_name, class_name || null]
    );
    res.json({ id: result.insertId, username, full_name, class_name, active: 1 });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Gmail đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/students/:id — chỉ trợ lý
router.put('/:id', authMiddleware, requireRole('assistant'), async (req, res) => {
  const { full_name, username, password, class_name, active } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET full_name=?, username=?, password=?, class_name=?, active=? WHERE id=?',
        [full_name, username, hash, class_name, active ?? 1, req.params.id]);
    } else {
      await db.query('UPDATE users SET full_name=?, username=?, class_name=?, active=? WHERE id=?',
        [full_name, username, class_name, active ?? 1, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Gmail đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/students/:id — chỉ trợ lý
router.delete('/:id', authMiddleware, requireRole('assistant'), async (req, res) => {
  await db.query('DELETE FROM users WHERE id=? AND role="student"', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
