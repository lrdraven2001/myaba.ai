const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { db, Timestamp } = require('../lib/firebase-admin');

// GET /api/policies?category=policy_manual|sop|handbook
router.get('/', requireAuth, async (req, res) => {
  const orgId = req.user.orgId;
  const { category } = req.query;

  try {
    let query = db.collection('organizations').doc(orgId).collection('policies');
    if (category) query = query.where('category', '==', category);
    const snap = await query.orderBy('uploadedAt', 'desc').get();
    res.json({ documents: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
});

// GET /api/templates
router.get('/templates', requireAuth, async (req, res) => {
  const orgId = req.user.orgId;
  try {
    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('templates')
      .orderBy('uploadedAt', 'desc')
      .get();
    res.json({ templates: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

module.exports = router;
