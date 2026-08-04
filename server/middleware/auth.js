const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'duyhoangtoan_secret_2026';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    next();
  };
}

module.exports = { authMiddleware, requireRole, SECRET };
