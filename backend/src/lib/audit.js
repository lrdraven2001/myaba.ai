const { db, Timestamp } = require('./firebase-admin');

async function logAuditEvent({ eventType, userId, clientId, documentId, aclxContentId, decision, aclxLabel }) {
  await db.collection('auditLog').add({
    eventType,
    userId,
    clientId: clientId ?? null,
    documentId: documentId ?? null,
    aclxContentId: aclxContentId ?? null,
    decision: decision ?? null,
    aclxLabel: aclxLabel ?? null,
    timestamp: Timestamp.now(),
  });
}

module.exports = { logAuditEvent };
