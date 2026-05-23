# MyABA.ai Build Specification with ACLX Integration
## AI-Powered ABA Clinical Documentation Platform with Healthcare AI Governance

---

## Executive Summary

Build a production-ready SaaS platform for ABA therapy providers (BCBAs and organizations) that generates clinical documentation using AI while maintaining **strict HIPAA compliance through the ACLX Gateway**. The system uses **Identiverse's ACLX service** as Layer 3 (Output Classification) and Layer 4 (Policy Enforcement) to evaluate every AI-generated response before delivery, ensuring PHI is governed at the output boundary—not just the input boundary.

**Key Architectural Shift from Original Spec:**
- **Original approach**: De-identify PHI with Google DLP *before* sending to Claude → Claude never sees identifiable data
- **ACLX-integrated approach**: Claude generates from sanitized context → **ACLX Gateway evaluates the output** → enforcement decision (ALLOW/REDACT/BLOCK/ESCALATE) applied before delivery
- **Why this matters**: Traditional DLP protects inputs. ACLX protects outputs. AI synthesis can create new PHI sensitivity that never existed in source documents. ACLX catches this at the output boundary.

---

## Core Architecture with ACLX Integration

### Five-Layer Adaptive Access Control Framework

MyABA.ai implements the full five-layer framework defined in the ACLX specification:

| **Layer** | **MyABA.ai Component** | **Technology** |
|---|---|---|
| **Layer 1: Identity Verification** | User authentication, BCBA role claims | Firebase Auth + Custom Claims |
| **Layer 2: Context Analysis** | Request-time authorization (can this user query this client?) | Firestore Security Rules + Cloud Functions |
| **Layer 3: Output Classification** | AI response PHI detection, synthesis risk scoring | **ACLX Gateway** (Identiverse service) |
| **Layer 4: Policy Enforcement** | HIPAA minimum necessary evaluation, purpose-of-use checks | **ACLX Gateway OPA** |
| **Layer 5: Audit & Governance** | Immutable decision logs, compliance reporting | ACLX Audit Log + Cloud Logging |

### Frontend Stack
- **Framework**: React 18+ with TypeScript
- **Hosting**: Firebase Hosting (myaba.ai)
- **Authentication**: Firebase Auth with custom claims for BCBA roles
- **Styling**: Tailwind CSS with custom teal/blue design system
- **State Management**: React Context + useReducer
- **File Upload**: Direct to Google Cloud Storage with signed URLs

### Backend Stack
- **API**: Node.js/Express on Google Cloud Run (api.myaba.ai)
- **Database**: Cloud Firestore
- **File Storage**: Google Cloud Storage
- **PHI Sanitization (Input)**: Google Cloud DLP API (de-identify before AI generation)
- **AI Integration**: Anthropic Claude API (Sonnet 4)
- **Output Governance**: **ACLX Gateway** (HTTP API at `ACLX_GATEWAY_URL`)
- **Payments**: Stripe

---

## ACLX Integration Architecture

### The Output Boundary Problem

Traditional HIPAA compliance focuses on **access control** (who can retrieve PHI) and **encryption** (protecting PHI in transit/at rest). But AI introduces a new risk surface: **synthesis sensitivity**.

**Example Scenario:**
1. BCBA queries: "Summarize behavioral interventions for Client A"
2. Claude retrieves from sources:
   - Intake form (PHI: demographics, diagnosis)
   - Session notes (PHI: behavioral observations)
   - Treatment plan (PHI: intervention strategies)
3. Claude synthesizes: *"Client A, a 7-year-old with ASD and comorbid ADHD, exhibits aggressive outbursts during transitions. Recommended token economy with visual schedules..."*

**The Gap:**
- Each source document was properly access-controlled (Layer 2 ✓)
- PHI was de-identified before Claude saw it (traditional DLP ✓)
- But the **generated output** reconstructed identifiable PHI from sanitized context
- No traditional DLP tool evaluates live LLM output streams

**ACLX Solution:**
- Every AI-generated response passes through ACLX Gateway **before delivery**
- ACLX detects PHI in the output (Layer 3)
- ACLX evaluates minimum necessary for the user's role/purpose (Layer 4)
- Enforcement decision: ALLOW (treatment), REDACT (scheduling), or BLOCK (billing)

### ACLX Gateway as Central Enforcement Point

```
┌─────────────────────────────────────────────────────────────────┐
│                    MyABA.ai Request Flow                        │
└─────────────────────────────────────────────────────────────────┘

1. User Request
   ↓
   [Firebase Auth] → Custom claims: role=BCBA, purpose=treatment
   
2. Backend Authorization (Layer 2)
   ↓
   [Cloud Functions] → Firestore rules: Can user access this client?
   
3. AI Generation
   ↓
   [Google DLP] → De-identify source documents
   ↓
   [Claude API] → Generate clinical documentation
   ↓
   Raw AI Output: "Client exhibits self-injurious behavior..."
   
4. Output Governance (Layers 3 & 4) ← **ACLX GATEWAY**
   ↓
   POST /evaluate → ACLX Gateway
   {
     "domain": "hipaa",
     "identity": {
       "subject": "bcba-user-123",
       "role": "TREATING_BCBA",
       "purpose": "treatment"
     },
     "ai_response": {
       "text": "<Claude output>"
     }
   }
   ↓
   ACLX Response:
   {
     "decision": {
       "decision": "ALLOW",  // or REDACT, BLOCK, ESCALATE
       "final_text": "<processed output>"
     },
     "aclx": {
       "domain": "HIPAA",
       "category": "PHI",
       "subcategory": "SUPER_PHI",
       "sensitivity": "HIGH"
     }
   }
   
5. Delivery
   ↓
   Return decision.final_text to user (NEVER the raw AI output)
```

### ACLX Integration Points

**1. Environment Configuration**
```bash
# Backend .env
ACLX_GATEWAY_URL=http://aclx-gateway:8080
ACLX_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-xxx
```

**2. API Endpoint Wrapper**
```javascript
// /api/generate-document endpoint
async function generateDocument(req, res) {
  const { clientId, documentType, additionalContext } = req.body;
  const userId = req.user.uid; // From Firebase Auth token
  
  // Layer 2: Authorization check
  const hasAccess = await checkClientAccess(userId, clientId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Retrieve client data and source documents
  const clientData = await getClient(clientId);
  const sourceDocs = await getClientDocuments(clientId, documentType);
  
  // Sanitize PHI with Google DLP (traditional input protection)
  const sanitizedContext = await deidentifyWithDLP({
    clientData,
    sourceDocs
  });
  
  // Generate AI response with Claude
  const claudeResponse = await callClaudeAPI({
    prompt: buildPrompt(documentType, sanitizedContext, additionalContext),
    system: BCBA_SYSTEM_PROMPT
  });
  
  // **ACLX INTEGRATION: Evaluate output before delivery**
  const aclxEvaluation = await evaluateWithACLX({
    aiResponse: claudeResponse.text,
    identity: {
      subject: userId,
      role: req.user.customClaims.role || 'BCBA',
      purpose: req.user.customClaims.purpose || 'treatment',
      organization: req.user.customClaims.orgId
    },
    domain: 'hipaa'
  });
  
  // Layer 5: Audit log
  await logAuditEvent({
    contentId: aclxEvaluation.content_id,
    userId,
    clientId,
    decision: aclxEvaluation.decision.decision,
    aclxLabel: aclxEvaluation.aclx
  });
  
  // Return ONLY the ACLX-approved text
  return res.json({
    success: true,
    documentType,
    // CRITICAL: Use decision.final_text, not raw Claude output
    content: aclxEvaluation.decision.final_text,
    decision: aclxEvaluation.decision.decision,
    contentId: aclxEvaluation.content_id
  });
}
```

**3. ACLX Gateway Client**
```javascript
// lib/aclx-client.js
const axios = require('axios');

async function evaluateWithACLX({ aiResponse, identity, domain, sources = [] }) {
  const response = await axios.post(
    `${process.env.ACLX_GATEWAY_URL}/evaluate`,
    {
      domain, // 'hipaa' for MyABA.ai
      identity: {
        subject: identity.subject,
        actor_type: 'human', // vs 'agent' for autonomous AI
        role: identity.role,
        purpose: identity.purpose,
        organization: identity.organization,
        scopes: [],
        allowed_distributions: [], // Not applicable for HIPAA
        attributes: {} // Could include NPI, treating status, etc.
      },
      ai_response: {
        text: aiResponse,
        sources: sources.map(s => ({
          id: s.documentId,
          label: s.category, // 'intake', 'assessment', etc.
          distribution: s.sensitivity, // Could map to HIPAA distribution codes
          owner: identity.organization
        }))
      },
      request_context: {
        timestamp: new Date().toISOString(),
        client_id: identity.clientId // For audit trail
      }
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000 // ACLX responses are typically <100ms
    }
  );
  
  return response.data;
}

module.exports = { evaluateWithACLX };
```

**4. HIPAA Identity Role Mapping**

MyABA.ai uses Firebase Auth custom claims to encode BCBA roles. These map to ACLX identity attributes:

| **MyABA.ai Role** | **ACLX identity.role** | **Allowed Purposes** | **Policy Outcome** |
|---|---|---|---|
| BCBA (treating) | `TREATING_BCBA` | treatment, assessment | ALLOW for SUPER_PHI |
| BCBA (supervising) | `SUPERVISING_BCBA` | treatment, oversight | ALLOW for SUPER_PHI |
| RBT (technician) | `RBT` | session_notes | REDACT SUPER_PHI, ALLOW session data |
| Scheduling Admin | `SCHEDULING_ADMIN` | scheduling | REDACT all PHI except name/DOB |
| Billing | `BILLING_ADMIN` | payment | BLOCK SUPER_PHI, ALLOW demographics |

**5. Custom Claims Setup (Firebase)**
```javascript
// Cloud Function: setUserRole
exports.setUserRole = functions.https.onCall(async (data, context) => {
  const { userId, role, purpose } = data;
  
  // Admin-only function
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied');
  }
  
  await admin.auth().setCustomUserClaims(userId, {
    role: role, // 'TREATING_BCBA', 'RBT', etc.
    purpose: purpose, // 'treatment', 'scheduling', etc.
    orgId: data.orgId
  });
  
  return { success: true };
});
```

---

## ACLX Policy Configuration

MyABA.ai requires a custom OPA policy bundle deployed to the ACLX Gateway. The following Rego rules define HIPAA minimum necessary enforcement for ABA clinical roles:

### OPA Policy: MyABA HIPAA Rules
```rego
package acl.domains.hipaa

import rego.v1

# Helper: active HIPAA domains in this response
hipaa_domains := [d | d := input.acl.control_domains[_]; d.domain == "HIPAA"]

# ALLOW: Treating BCBA with treatment purpose
allow if {
  some domain in hipaa_domains
  input.identity.role == "TREATING_BCBA"
  input.identity.purpose == "treatment"
}

# ALLOW: Supervising BCBA with oversight purpose
allow if {
  some domain in hipaa_domains
  input.identity.role == "SUPERVISING_BCBA"
  input.identity.purpose in {"treatment", "oversight"}
}

# REDACT: RBT role - remove SUPER_PHI, allow session data
redact contains msg if {
  some domain in hipaa_domains
  domain.subcategory == "SUPER_PHI"
  input.identity.role == "RBT"
  msg := "SUPER_PHI redacted for RBT role"
}

# REDACT: Scheduling admin - demographics only
redact contains msg if {
  some domain in hipaa_domains
  input.identity.role == "SCHEDULING_ADMIN"
  domain.category == "PHI"
  not domain.subcategory == "DEMOGRAPHIC"
  msg := "Non-demographic PHI redacted for scheduling"
}

# BLOCK: Billing role accessing clinical notes
deny contains msg if {
  some domain in hipaa_domains
  domain.subcategory == "SUPER_PHI"
  input.identity.role == "BILLING_ADMIN"
  msg := "SUPER_PHI cannot be released to billing role"
}

# BLOCK: Purpose mismatch
deny contains msg if {
  some domain in hipaa_domains
  domain.distribution == "TREATMENT_ONLY"
  not input.identity.purpose in {"treatment", "assessment"}
  msg := "TREATMENT_ONLY distribution requires treatment purpose"
}

# ESCALATE: Low-confidence PHI detection
escalate contains msg if {
  some domain in hipaa_domains
  domain.confidence.level == "LOW"
  domain.sensitivity in {"HIGH", "CRITICAL"}
  msg := "Low-confidence HIGH/CRITICAL PHI requires human review"
}
```

### Deploying the Policy Bundle

```bash
# Package the MyABA OPA policy bundle
tar czf myaba-policy-bundle.tar.gz \
  acl/domains/hipaa.rego \
  acl/data/allowed_purposes.json

# Upload to ACLX Gateway (method depends on deployment model)
# Option 1: OPA Bundle API
curl -X PUT http://aclx-gateway:8181/v1/policies/myaba \
  --data-binary @myaba-policy-bundle.tar.gz

# Option 2: Mount as ConfigMap in Kubernetes
kubectl create configmap aclx-myaba-policy \
  --from-file=myaba-policy-bundle.tar.gz

# Option 3: Bake into ACLX Gateway container image
COPY myaba-policy-bundle.tar.gz /policies/
```

---

## Feature Modules with ACLX Integration

### 1. Authentication & User Management

**Firebase Auth Custom Claims:**
```javascript
// User document structure in Firestore
/users/{userId}
  - email: string
  - role: 'TREATING_BCBA' | 'SUPERVISING_BCBA' | 'RBT' | 'SCHEDULING_ADMIN' | 'BILLING_ADMIN'
  - purpose: 'treatment' | 'assessment' | 'scheduling' | 'payment'
  - organizationId: string
  - npi: string (for BCBAs)
  - credentials: {
      licenseNumber: string,
      licenseState: string,
      bcbaCertNumber: string
    }
  - customClaims: {
      role: string,
      purpose: string,
      orgId: string
    }
```

### 2. Client Management

**Database Schema with ACLX Audit Trail:**
```
/organizations/{orgId}/clients/{clientId}
  - legalName: string
  - preferredName: string
  - dateOfBirth: timestamp
  - diagnosis: string
  - primaryInsurance: string
  - createdAt: timestamp
  - lastAccessedBy: userId
  - aclxAudit: {
      lastEvaluationId: string, // ACLX content_id
      lastDecision: 'ALLOW' | 'REDACT' | 'BLOCK',
      lastDecisionReason: string
    }
```

### 3. AI Documentation Generation with Full ACLX Flow

**Enhanced Generation Workflow:**

```javascript
async function generateBIP(clientId, userId, additionalContext) {
  // 1. Layer 2: Authorization
  const client = await firestore
    .collection('organizations').doc(orgId)
    .collection('clients').doc(clientId)
    .get();
  
  if (!client.exists) {
    throw new Error('Client not found');
  }
  
  // 2. Retrieve source documents
  const assessments = await getClientDocuments(clientId, 'assessment');
  const intakeForms = await getClientDocuments(clientId, 'intake');
  const sessionNotes = await getClientDocuments(clientId, 'session_notes');
  
  // 3. Input sanitization (traditional DLP)
  const sanitizedSources = await Promise.all([
    deidentifyWithDLP(assessments),
    deidentifyWithDLP(intakeForms),
    deidentifyWithDLP(sessionNotes)
  ]);
  
  // 4. Build Claude prompt
  const prompt = `
You are an expert BCBA assistant generating a Behavior Intervention Plan.

CLIENT CONTEXT (De-identified):
${sanitizedSources.map(s => s.sanitizedText).join('\n\n')}

ADDITIONAL CONTEXT:
${additionalContext}

Generate a comprehensive BIP following BACB guidelines. Include:
1. Target behaviors with operational definitions
2. Functional behavior assessment summary
3. Replacement behaviors
4. Intervention strategies
5. Data collection procedures
6. Crisis management protocols
  `;
  
  // 5. Call Claude API
  const claudeResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const rawAIOutput = claudeResponse.content[0].text;
  
  // 6. **ACLX EVALUATION** (Layer 3 & 4)
  const aclxResult = await evaluateWithACLX({
    aiResponse: rawAIOutput,
    identity: {
      subject: userId,
      role: 'TREATING_BCBA', // From Firebase custom claims
      purpose: 'treatment',
      organization: orgId,
      clientId: clientId // For audit context
    },
    domain: 'hipaa',
    sources: [
      { documentId: 'assessment-1', category: 'FBA', sensitivity: 'HIGH' },
      { documentId: 'intake-1', category: 'DEMOGRAPHIC', sensitivity: 'MODERATE' }
    ]
  });
  
  // 7. Handle enforcement decision
  if (aclxResult.decision.decision === 'BLOCK') {
    throw new Error(`Content blocked: ${aclxResult.decision.reason}`);
  }
  
  if (aclxResult.decision.decision === 'ESCALATE') {
    // Queue for human review
    await queueForReview({
      contentId: aclxResult.content_id,
      userId,
      clientId,
      documentType: 'BIP',
      aiOutput: rawAIOutput,
      decision: aclxResult.decision
    });
    
    return {
      status: 'PENDING_REVIEW',
      message: 'BIP requires human review before release',
      reviewId: aclxResult.content_id
    };
  }
  
  // 8. Store the generated document
  const docRef = await firestore
    .collection('organizations').doc(orgId)
    .collection('documents').add({
      title: `BIP - ${client.data().preferredName}`,
      clientId,
      category: 'bip',
      content: aclxResult.decision.final_text, // ACLX-approved text
      generatedBy: userId,
      generatedAt: Timestamp.now(),
      aclxContentId: aclxResult.content_id,
      aclxDecision: aclxResult.decision.decision,
      aclxLabel: aclxResult.aclx
    });
  
  // 9. Layer 5: Audit log
  await logAuditEvent({
    eventType: 'DOCUMENT_GENERATED',
    userId,
    clientId,
    documentId: docRef.id,
    aclxContentId: aclxResult.content_id,
    decision: aclxResult.decision.decision,
    aclxLabel: aclxResult.aclx
  });
  
  return {
    success: true,
    documentId: docRef.id,
    content: aclxResult.decision.final_text,
    decision: aclxResult.decision.decision
  };
}
```

### 4. Human Review Queue (ESCALATE Handling)

When ACLX returns `ESCALATE`, the content is queued for human review:

**Review Queue Schema:**
```
/reviewQueue/{contentId}
  - aclxContentId: string
  - documentType: 'BIP' | 'FBA' | 'progress_note'
  - clientId: string
  - requestedBy: userId
  - requestedAt: timestamp
  - aiOutput: string (original Claude response)
  - aclxDecision: object (full ACLX evaluation result)
  - status: 'PENDING' | 'APPROVED' | 'REJECTED'
  - reviewedBy: userId (optional)
  - reviewedAt: timestamp (optional)
  - reviewNotes: string (optional)
```

**Review Interface:**
```javascript
// Cloud Function: submitReview
exports.submitReview = functions.https.onCall(async (data, context) => {
  const { contentId, verdict, notes } = data;
  
  // Only BCBAs can review
  if (!['TREATING_BCBA', 'SUPERVISING_BCBA'].includes(context.auth.token.role)) {
    throw new functions.https.HttpsError('permission-denied');
  }
  
  // Submit feedback to ACLX Gateway
  await axios.post(`${ACLX_GATEWAY_URL}/feedback`, {
    content_id: contentId,
    reviewer: context.auth.token.email,
    verdict: verdict, // 'approve', 'uphold', 'override'
    notes: notes,
    suggested_rule: data.suggestedRule // Optional policy improvement
  });
  
  // Update local review queue
  await firestore.collection('reviewQueue').doc(contentId).update({
    status: verdict === 'approve' ? 'APPROVED' : 'REJECTED',
    reviewedBy: context.auth.uid,
    reviewedAt: Timestamp.now(),
    reviewNotes: notes
  });
  
  return { success: true };
});
```

---

## ACLX Deployment Architecture

### Option 1: Self-Hosted ACLX Gateway (Recommended for HIPAA)

Deploy the ACLX Gateway in your own GCP project to maintain full data control:

```yaml
# kubernetes/aclx-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aclx-gateway
  namespace: myaba-prod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: aclx-gateway
  template:
    metadata:
      labels:
        app: aclx-gateway
    spec:
      containers:
      - name: aclx-gateway
        image: identiverse/aclx-gateway:1.1.0-alpha
        ports:
        - containerPort: 8080
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: anthropic-secret
              key: api-key
        - name: GCP_PROJECT_ID
          value: "myaba-prod"
        - name: DOMAIN
          value: "hipaa"
        volumeMounts:
        - name: policy-bundle
          mountPath: /policies
          readOnly: true
      volumes:
      - name: policy-bundle
        configMap:
          name: aclx-myaba-policy
---
apiVersion: v1
kind: Service
metadata:
  name: aclx-gateway-service
  namespace: myaba-prod
spec:
  selector:
    app: aclx-gateway
  ports:
  - protocol: TCP
    port: 8080
    targetPort: 8080
  type: ClusterIP
```

### Option 2: Identiverse Managed ACLX (If Available)

If Identiverse offers a managed ACLX service with BAA:

```bash
# Environment configuration
ACLX_GATEWAY_URL=https://aclx.identiverse.com/v1
ACLX_API_KEY=<provided_by_identiverse>
ACLX_TENANT_ID=myaba-prod
```

**BAA Requirements:**
- Execute Business Associate Agreement with Identiverse
- Confirm data residency (ACLX processes PHI-containing AI outputs)
- Verify HIPAA Security Rule compliance (encryption, access controls, audit logs)

---

## Security & Compliance Checklist

### HIPAA Compliance with ACLX

- [x] **Layer 1**: Firebase Auth with MFA for admin users
- [x] **Layer 2**: Firestore security rules (client-level data isolation)
- [x] **Layer 3**: ACLX Gateway detects PHI in AI outputs
- [x] **Layer 4**: ACLX OPA enforces minimum necessary
- [x] **Layer 5**: Immutable audit logs for every enforcement decision
- [ ] **BAAs executed**:
  - [ ] Google Cloud Platform (DLP, Firestore, Storage)
  - [ ] Anthropic (Claude API)
  - [ ] Identiverse (ACLX Gateway, if managed service)
  - [ ] Stripe (payment processing)
- [ ] **Encryption**:
  - [x] TLS 1.3 in transit (Cloud Run default)
  - [x] AES-256 at rest (Cloud Storage default)
  - [ ] Field-level encryption for SUPER_PHI (optional, via Firestore)
- [ ] **Access controls**:
  - [x] Role-based access (TREATING_BCBA, RBT, etc.)
  - [x] Purpose-of-use enforcement (treatment, scheduling, billing)
  - [ ] Session timeout (15 minutes idle)
- [ ] **Audit requirements**:
  - [x] Log every AI generation event
  - [x] Log every ACLX enforcement decision
  - [x] Log all client data access
  - [ ] Retain logs for 6 years (HIPAA requirement)
  - [ ] Export to SIEM (Cloud Logging → BigQuery)

---

## Testing Strategy with ACLX

### Unit Tests
```javascript
// jest: ACLX client integration
describe('ACLX Integration', () => {
  it('blocks SUPER_PHI for billing role', async () => {
    const result = await evaluateWithACLX({
      aiResponse: 'Client has HIV diagnosis...',
      identity: { role: 'BILLING_ADMIN', purpose: 'payment' },
      domain: 'hipaa'
    });
    
    expect(result.decision.decision).toBe('BLOCK');
    expect(result.aclx.subcategory).toBe('SUPER_PHI');
  });
  
  it('allows demographic PHI for scheduling', async () => {
    const result = await evaluateWithACLX({
      aiResponse: 'Client name: John Doe, DOB: 01/15/2010',
      identity: { role: 'SCHEDULING_ADMIN', purpose: 'scheduling' },
      domain: 'hipaa'
    });
    
    expect(result.decision.decision).toBe('ALLOW');
  });
});
```

### Integration Tests
```javascript
// Test full generation → ACLX → delivery flow
describe('BIP Generation with ACLX', () => {
  it('enforces minimum necessary for RBT role', async () => {
    const bip = await generateBIP('client-123', 'rbt-user-456', {
      targetBehavior: 'Aggression during transitions'
    });
    
    // RBT should receive redacted version (no diagnosis, medications)
    expect(bip.content).not.toContain('autism spectrum disorder');
    expect(bip.content).not.toContain('risperidone');
    expect(bip.decision).toBe('REDACT');
  });
});
```

### E2E Tests (Cypress)
```javascript
describe('ACLX Enforcement E2E', () => {
  it('shows full content to treating BCBA', () => {
    cy.login('bcba@example.com', 'password');
    cy.get('[data-testid="client-123"]').click();
    cy.get('[data-testid="generate-bip"]').click();
    
    cy.contains('autism spectrum disorder'); // Diagnosis visible
    cy.contains('risperidone'); // Medications visible
  });
  
  it('redacts sensitive content for RBT', () => {
    cy.login('rbt@example.com', 'password');
    cy.get('[data-testid="client-123"]').click();
    cy.get('[data-testid="view-bip"]').click();
    
    cy.contains('[REDACTED]'); // Diagnosis redacted
    cy.contains('token economy'); // Intervention strategy visible
  });
});
```

---

## Phase 1 MVP with ACLX (3-4 months)

### Month 1: Foundation + ACLX Setup
- [ ] GCP infrastructure (Cloud Run, Firestore, Storage)
- [ ] Firebase Auth with custom claims (BCBA roles)
- [ ] Basic client management (CRUD)
- [ ] **ACLX Gateway deployment** (self-hosted or managed)
- [ ] **OPA policy bundle** for MyABA HIPAA rules
- [ ] Document upload to Cloud Storage

### Month 2: AI Core + ACLX Integration
- [ ] Claude API integration
- [ ] **ACLX client library** (`evaluateWithACLX` function)
- [ ] BIP generation with **ACLX evaluation before delivery**
- [ ] FBA generation workflow
- [ ] **Human review queue** for ESCALATE decisions

### Month 3: Polish & Compliance
- [ ] Stripe billing integration
- [ ] User onboarding flow
- [ ] **HIPAA compliance audit** (with ACLX audit logs)
- [ ] **BAA execution** (GCP, Anthropic, Identiverse)
- [ ] Security testing

### Month 4: Launch Prep
- [ ] Beta testing with 5-10 BCBAs
- [ ] **ACLX policy tuning** based on real usage
- [ ] Bug fixes and refinements
- [ ] Cyber liability insurance
- [ ] Production deployment

---

## Success Metrics

### Technical KPIs
- API response time < 3s (90th percentile, including ACLX evaluation)
- ACLX evaluation latency < 100ms (per ACLX spec)
- Document generation time < 30s
- 99.9% uptime SLA
- **Zero PHI leaks** (ACLX audit log verification)

### Compliance KPIs
- **ACLX BLOCK rate** < 5% (indicates over-restrictive policy)
- **ACLX ESCALATE rate** < 10% (indicates under-tuned policy)
- **Human review turnaround** < 24 hours
- **Audit log completeness** = 100% (every generation logged)

### Business KPIs
- Conversion rate (trial → paid): 20%
- Churn rate: < 5% monthly
- NPS score: > 50
- Average time saved: 10-20 hours/week per BCBA

---

## ACLX vs. Traditional DLP: Why Both?

| **Layer** | **Traditional DLP** | **ACLX** | **Why MyABA.ai Needs Both** |
|---|---|---|---|
| **Input Protection** | De-identifies PHI before AI sees it | N/A | ✓ Prevents Claude from seeing identifiable data |
| **Output Protection** | N/A | Detects PHI in AI-generated text | ✓ Catches synthesis sensitivity |
| **Policy Enforcement** | None (just detection) | OPA evaluates minimum necessary | ✓ Enforces HIPAA purpose-of-use |
| **Audit Trail** | DLP findings log | ACLX decision log | ✓ Both required for HIPAA compliance |

**The Key Insight:**
- Traditional DLP (Google Cloud DLP) protects **inputs** to the AI
- ACLX protects **outputs** from the AI
- AI synthesis creates new PHI that never existed in inputs → **ACLX is mandatory**

---

## Questions for Claude Code Implementation

1. **ACLX Deployment Model**: Self-hosted (Kubernetes) or managed service (if Identiverse offers BAA)?
2. **Policy Bundle Versioning**: GitOps workflow for OPA bundle updates?
3. **Fallback Strategy**: If ACLX Gateway is unreachable, fail-open (log + warn) or fail-closed (block all)?
4. **Review Queue UI**: Build custom React component or use ACLX Gateway's `/queue` API directly?
5. **Multi-Tenancy**: Org-specific OPA policies or shared policy with org-scoped rules?
6. **BAA Timing**: Execute Identiverse BAA before or after beta launch?

---

## Next Steps for Development

1. **ACLX Gateway Setup**
   ```bash
   # Pull ACLX Gateway image (if available from Identiverse)
   docker pull identiverse/aclx-gateway:1.1.0-alpha
   
   # Or build from source (if open-source)
   git clone https://github.com/identiverse/aclx-gateway.git
   cd aclx-gateway
   docker build -t aclx-gateway:latest .
   ```

2. **Deploy to GCP**
   ```bash
   gcloud run deploy aclx-gateway \
     --image identiverse/aclx-gateway:1.1.0-alpha \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars DOMAIN=hipaa,GCP_PROJECT_ID=myaba-prod
   ```

3. **Test ACLX Connectivity**
   ```bash
   curl http://aclx-gateway:8080/health
   # Expected: {"status":"ok","service":"Aegis ACLX Gateway API"}
   ```

4. **Initialize MyABA Backend**
   ```bash
   mkdir myaba-backend && cd myaba-backend
   npm init -y
   npm install express @anthropic-ai/sdk axios @google-cloud/dlp firebase-admin
   ```

5. **Create ACLX Integration Module**
   ```bash
   mkdir lib
   touch lib/aclx-client.js
   # Paste ACLX client code from Section "ACLX Integration Points"
   ```

Ready to start building! The **critical path** is:
1. Deploy ACLX Gateway (self-hosted or get access to Identiverse managed)
2. Implement `/evaluate` integration in backend
3. Test with sample BIP generation
4. Tune OPA policy based on real BCBA workflows

Let me know which component to prioritize in Claude Code!
