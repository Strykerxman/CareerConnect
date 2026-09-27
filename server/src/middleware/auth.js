const jwt = require('jsonwebtoken');

function secret() {
  return process.env.JWT_SECRET || 'dev-only-secret-change-me';
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: '2h' });
}

module.exports = { signToken };
