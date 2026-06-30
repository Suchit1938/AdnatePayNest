const jwt = require('jsonwebtoken');

const User = require('../models/User');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, token missing' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password +activeSessionId');

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user missing' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'User is not active' });
    }

    if (!decoded.sessionId || decoded.sessionId !== user.activeSessionId) {
      return res.status(401).json({
        message: 'Session expired because this account signed in elsewhere',
        code: 'SESSION_INVALIDATED',
      });
    }

    const canCompletePasswordChange =
      req.originalUrl === '/api/auth/logout' ||
      req.originalUrl.startsWith('/api/auth/password/') ||
      (req.method === 'GET' && req.originalUrl === '/api/users/me') ||
      (req.method === 'GET' && req.originalUrl === '/api/auth/me');

    if (user.mustChangePassword && !canCompletePasswordChange) {
      return res.status(403).json({
        message: 'Password change required before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

module.exports = { protect };
