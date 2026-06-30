const crypto = require('crypto');

/**
 * Simple CSRF protection middleware.
 * Expects a token in the request header `x-csrf-token` that matches the
 * token stored in the user's session (req.session.csrfToken). If the token is
 * missing or does not match, the request is rejected with a 403 response.
 */
function csrfProtection(req, res, next) {
  // For safe methods (GET, HEAD, OPTIONS) we simply generate a token.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.session) {
      return next();
    }
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomUUID();
    }
    res.setHeader('x-csrf-token', req.session.csrfToken);
    return next();
  }

  const requestToken = req.get('x-csrf-token');
  if (!req.session || requestToken !== req.session.csrfToken) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  return next();
}

module.exports = csrfProtection;
