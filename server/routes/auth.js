const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    if (!user.active) return res.status(403).json({ error: 'Tài khoản đã bị khóa' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });

    const token = jwt.sign(
      { id: user.id, username: user.username, full_name: user.full_name, role: user.role, class_name: user.class_name },
      SECRET, { expiresIn: '8h' }
    );
    res.json({ token, role: user.role, full_name: user.full_name, username: user.username, class_name: user.class_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
