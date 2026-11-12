const { getDb } = require('../db');

// Role gate; use after requireAuth. The signed token only proves who the user was when it
// was issued, so the account is checked in the database: a deleted account gets 401
// (sign in again) instead of a foreign-key error, and the stored role wins over the
// role claim in an older token.
function requireRole(role, message) {
  return (req, res, next) => {
    const account = req.user
      ? getDb().prepare('SELECT role FROM users WHERE id = ?').get(req.user.id)
      : undefined;
    if (!account) {
      return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    }
    if (account.role !== role) {
      return res.status(403).json({ error: message || 'You do not have permission to do that.' });
    }
    return next();
  };
}

module.exports = { requireRole };