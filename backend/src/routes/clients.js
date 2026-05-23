const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { db, Timestamp } = require('../lib/firebase-admin');
const { logAuditEvent } = require('../lib/audit');

// GET /api/clients
router.get('/', requireAuth, async (req, res) => {
  const orgId = req.user.orgId;
  try {
    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('clients')
      .orderBy('createdAt', 'desc')
      .get();

    const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ clients });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:clientId
router.get('/:clientId', requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const orgId = req.user.orgId;
  try {
    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('clients').doc(clientId)
      .get();

    if (!snap.exists) return res.status(404).json({ error: 'Client not found' });

    await logAuditEvent({ eventType: 'CLIENT_ACCESSED', userId: req.user.uid, clientId });
    res.json({ client: { id: snap.id, ...snap.data() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/clients
router.post('/', requireAuth, async (req, res) => {
  const orgId = req.user.orgId;
  const { legalName, preferredName, dateOfBirth, gender, primaryInsurance, ehrProvider, ehrCaseId } = req.body;

  if (!legalName) return res.status(400).json({ error: 'legalName is required' });

  try {
    const ref = await db
      .collection('organizations').doc(orgId)
      .collection('clients')
      .add({
        legalName,
        preferredName: preferredName || legalName,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        primaryInsurance: primaryInsurance || null,
        ehrProvider: ehrProvider || null,
        ehrCaseId: ehrCaseId || null,
        createdAt: Timestamp.now(),
        createdBy: req.user.uid,
      });

    await logAuditEvent({ eventType: 'CLIENT_CREATED', userId: req.user.uid, clientId: ref.id });
    res.status(201).json({ clientId: ref.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:clientId
router.put('/:clientId', requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const orgId = req.user.orgId;
  const allowed = ['legalName', 'preferredName', 'dateOfBirth', 'gender', 'primaryInsurance', 'ehrProvider', 'ehrCaseId'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  try {
    await db
      .collection('organizations').doc(orgId)
      .collection('clients').doc(clientId)
      .update({ ...updates, updatedAt: Timestamp.now() });

    await logAuditEvent({ eventType: 'CLIENT_UPDATED', userId: req.user.uid, clientId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// GET /api/clients/:clientId/documents
router.get('/:clientId/documents', requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const orgId = req.user.orgId;
  try {
    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('documents')
      .where('clientId', '==', clientId)
      .orderBy('generatedAt', 'desc')
      .get();

    const documents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ documents });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

module.exports = router;
