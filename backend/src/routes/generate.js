const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { db, Timestamp } = require('../lib/firebase-admin');
const { generateWithClaude, chatWithClaude } = require('../lib/claude');
const { evaluateWithACLX } = require('../lib/aclx-client');
const { logAuditEvent } = require('../lib/audit');

const DOCUMENT_PROMPTS = {
  bip: (context, additional) => `
You are generating a Behavior Intervention Plan (BIP) following BACB guidelines.

CLIENT CONTEXT (de-identified):
${context}

ADDITIONAL CONTEXT FROM CLINICIAN:
${additional || 'None provided'}

Generate a comprehensive BIP including:
1. Target behaviors with operational definitions
2. Functional behavior assessment summary
3. Replacement behaviors and rationale
4. Intervention strategies (antecedent modifications, teaching strategies, consequence strategies)
5. Data collection procedures
6. Crisis management protocol
7. Generalization and maintenance plan
`,

  fba: (context, additional) => `
You are generating a Functional Behavior Assessment (FBA) following BACB guidelines.

CLIENT CONTEXT (de-identified):
${context}

ADDITIONAL CONTEXT FROM CLINICIAN:
${additional || 'None provided'}

Generate a comprehensive FBA including:
1. Reason for referral and background
2. Assessment methods used
3. Behavioral description (topography, frequency, intensity, duration)
4. Antecedent analysis (setting events, immediate antecedents)
5. Consequence analysis
6. Hypothesized function(s) of behavior
7. Summary statements
8. Recommendations for BIP development
`,

  progress_note: (context, additional) => `
You are generating an ABA session progress note.

SESSION CONTEXT (de-identified):
${context}

ADDITIONAL CONTEXT FROM CLINICIAN:
${additional || 'None provided'}

Generate a concise progress note including:
1. Session date, duration, and setting
2. Goals targeted and programs run
3. Data summary (% correct, trials, rate)
4. Client behavior and engagement
5. Staff prompting and reinforcement strategies used
6. Notable events or behavioral observations
7. Plan for next session
`,
};

// POST /api/generate-document
router.post('/generate-document', requireAuth, async (req, res) => {
  const { clientId, documentType, additionalContext } = req.body;
  const userId = req.user.uid;
  const orgId = req.user.orgId;

  if (!clientId || !documentType) {
    return res.status(400).json({ error: 'clientId and documentType are required' });
  }

  if (!DOCUMENT_PROMPTS[documentType]) {
    return res.status(400).json({ error: `Unknown documentType: ${documentType}` });
  }

  try {
    // Layer 2: verify client access
    const clientRef = db
      .collection('organizations').doc(orgId)
      .collection('clients').doc(clientId);
    const clientSnap = await clientRef.get();

    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientSnap.data();

    // Retrieve and build context (source docs would be fetched/DLP'd here in production)
    const context = `
Preferred name: ${client.preferredName || '[redacted]'}
Diagnosis context: [Retrieved from uploaded assessments - DLP sanitized]
Treatment history: [Retrieved from session notes - DLP sanitized]
    `.trim();

    const prompt = DOCUMENT_PROMPTS[documentType](context, additionalContext);

    // Generate with Claude
    const rawOutput = await generateWithClaude({ prompt });

    // ACLX evaluation
    const aclxResult = await evaluateWithACLX({
      aiResponse: rawOutput,
      identity: {
        subject: userId,
        role: req.user.role || 'TREATING_BCBA',
        purpose: req.user.purpose || 'treatment',
        organization: orgId,
        clientId,
      },
      domain: 'hipaa',
    });

    // Handle BLOCK
    if (aclxResult.decision.decision === 'BLOCK') {
      await logAuditEvent({
        eventType: 'DOCUMENT_BLOCKED',
        userId,
        clientId,
        aclxContentId: aclxResult.content_id,
        decision: 'BLOCK',
        aclxLabel: aclxResult.aclx,
      });
      return res.status(403).json({
        error: 'Document blocked by compliance policy',
        reason: aclxResult.decision.reason,
        contentId: aclxResult.content_id,
      });
    }

    // Handle ESCALATE — queue for review
    if (aclxResult.decision.decision === 'ESCALATE') {
      await db.collection('reviewQueue').doc(aclxResult.content_id).set({
        aclxContentId: aclxResult.content_id,
        documentType,
        clientId,
        requestedBy: userId,
        requestedAt: Timestamp.now(),
        aiOutput: rawOutput,
        aclxDecision: aclxResult,
        status: 'PENDING',
      });

      await logAuditEvent({
        eventType: 'DOCUMENT_ESCALATED',
        userId,
        clientId,
        aclxContentId: aclxResult.content_id,
        decision: 'ESCALATE',
        aclxLabel: aclxResult.aclx,
      });

      return res.json({
        status: 'PENDING_REVIEW',
        message: 'Document flagged for human review before release',
        reviewId: aclxResult.content_id,
      });
    }

    // ALLOW or REDACT — store the approved text
    const docRef = await db
      .collection('organizations').doc(orgId)
      .collection('documents').add({
        title: `${documentType.toUpperCase()} - ${client.preferredName || client.legalName}`,
        clientId,
        category: documentType,
        content: aclxResult.decision.final_text,
        source: 'ai_generated',
        generatedBy: userId,
        generatedAt: Timestamp.now(),
        aclxContentId: aclxResult.content_id,
        aclxDecision: aclxResult.decision.decision,
        aclxLabel: aclxResult.aclx,
      });

    await logAuditEvent({
      eventType: 'DOCUMENT_GENERATED',
      userId,
      clientId,
      documentId: docRef.id,
      aclxContentId: aclxResult.content_id,
      decision: aclxResult.decision.decision,
      aclxLabel: aclxResult.aclx,
    });

    return res.json({
      success: true,
      documentId: docRef.id,
      documentType,
      content: aclxResult.decision.final_text,
      decision: aclxResult.decision.decision,
      contentId: aclxResult.content_id,
    });
  } catch (err) {
    console.error('Generate document error:', err);
    res.status(500).json({ error: 'Document generation failed' });
  }
});

// POST /api/chat
router.post('/chat', requireAuth, async (req, res) => {
  const { message, history = [] } = req.body;
  const userId = req.user.uid;
  const orgId = req.user.orgId;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const rawReply = await chatWithClaude({ messages });

    const aclxResult = await evaluateWithACLX({
      aiResponse: rawReply,
      identity: {
        subject: userId,
        role: req.user.role || 'TREATING_BCBA',
        purpose: req.user.purpose || 'treatment',
        organization: orgId,
      },
      domain: 'hipaa',
    });

    await logAuditEvent({
      eventType: 'CHAT_RESPONSE',
      userId,
      aclxContentId: aclxResult.content_id,
      decision: aclxResult.decision.decision,
      aclxLabel: aclxResult.aclx,
    });

    if (aclxResult.decision.decision === 'BLOCK') {
      return res.json({
        reply: 'I cannot share that information based on your current access level.',
        decision: 'BLOCK',
      });
    }

    return res.json({
      reply: aclxResult.decision.final_text,
      decision: aclxResult.decision.decision,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat failed' });
  }
});

module.exports = router;
