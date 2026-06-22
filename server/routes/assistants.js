const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/assistants — chỉ giáo viên
router.get('/', authMiddleware, requireRole('teacher'), async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, username, full_name, created_at FROM users WHERE role='assistant'"
  );
  res.json(rows);
});

// POST /api/assistants
router.post('/', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { username, password, full_name } = req.body;
  if (!username || !password || !full_name)
    return res.status(400).json({ error: 'Thiếu thông tin' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (username, password, full_name, role) VALUES (?,?,?,'assistant')",
      [username, hash, full_name]
    );
    res.json({ id: result.insertId, username, full_name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/assistants/:id
router.put('/:id', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { full_name, username, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET full_name=?, username=?, password=? WHERE id=? AND role="assistant"',
        [full_name, username, hash, req.params.id]);
    } else {
      await db.query('UPDATE users SET full_name=?, username=? WHERE id=? AND role="assistant"',
        [full_name, username, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/assistants/:id
router.delete('/:id', authMiddleware, requireRole('teacher'), async (req, res) => {
  await db.query('DELETE FROM users WHERE id=? AND role="assistant"', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
