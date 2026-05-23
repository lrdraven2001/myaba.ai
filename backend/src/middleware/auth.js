const { auth } = require('../lib/firebase-admin');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = header.slice(7);
  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded; // uid, email, role, purpose, orgId from custom claims
    next();
  } catch {
    res.status(401).json({ error: 'Invalid auth token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: `Role ${userRole} not authorized for this action` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
