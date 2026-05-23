const axios = require('axios');

const GATEWAY_URL = process.env.ACLX_GATEWAY_URL;
const ENABLED = process.env.ACLX_ENABLED !== 'false';

/**
 * Evaluate an AI-generated response through the ACLX Gateway.
 * Returns a pass-through ALLOW decision when ACLX is disabled (dev mode).
 */
async function evaluateWithACLX({ aiResponse, identity, domain = 'hipaa', sources = [] }) {
  if (!ENABLED) {
    return {
      content_id: `dev-${Date.now()}`,
      decision: { decision: 'ALLOW', final_text: aiResponse },
      aclx: { domain: 'HIPAA', category: 'PHI', subcategory: 'NONE', sensitivity: 'LOW' },
    };
  }

  const response = await axios.post(
    `${GATEWAY_URL}/evaluate`,
    {
      domain,
      identity: {
        subject: identity.subject,
        actor_type: 'human',
        role: identity.role,
        purpose: identity.purpose,
        organization: identity.organization,
        scopes: [],
        allowed_distributions: [],
        attributes: {},
      },
      ai_response: {
        text: aiResponse,
        sources: sources.map((s) => ({
          id: s.documentId,
          label: s.category,
          distribution: s.sensitivity,
          owner: identity.organization,
        })),
      },
      request_context: {
        timestamp: new Date().toISOString(),
        client_id: identity.clientId,
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    }
  );

  return response.data;
}

module.exports = { evaluateWithACLX };
