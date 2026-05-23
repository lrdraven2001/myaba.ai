const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth, requireRole } = require('../middleware/auth');
const { db, Timestamp } = require('../lib/firebase-admin');

// GET /api/review-queue
router.get('/', requireAuth, requireRole('TREATING_BCBA', 'SUPERVISING_BCBA'), async (req, res) => {
  try {
    const snap = await db
      .collection('reviewQueue')
      .where('status', '==', 'PENDING')
      .orderBy('requestedAt', 'desc')
      .get();

    res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

// POST /api/review-queue/submit
router.post('/submit', requireAuth, requireRole('TREATING_BCBA', 'SUPERVISING_BCBA'), async (req, res) => {
  const { contentId, verdict, notes, suggestedRule } = req.body;

  if (!contentId || !verdict) {
    return res.status(400).json({ error: 'contentId and verdict are required' });
  }

  try {
    // Submit feedback to ACLX Gateway (best-effort)
    if (process.env.ACLX_ENABLED !== 'false') {
      await axios
        .post(`${process.env.ACLX_GATEWAY_URL}/feedback`, {
          content_id: contentId,
          reviewer: req.user.email,
          verdict,
          notes,
          suggested_rule: suggestedRule,
        })
        .catch((e) => console.warn('ACLX feedback failed:', e.message));
    }

    await db.collection('reviewQueue').doc(contentId).update({
      status: verdict === 'approve' ? 'APPROVED' : 'REJECTED',
      reviewedBy: req.user.uid,
      reviewedAt: Timestamp.now(),
      reviewNotes: notes || null,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;
