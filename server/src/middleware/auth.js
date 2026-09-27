const jwt = require('jsonwebtoken');

function secret() {
  return process.env.JWT_SECRET || 'dev-only-secret-change-me';
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: '2h' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  try {
    const payload = jwt.verify(token, secret());
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

module.exports = { signToken, requireAuth };
