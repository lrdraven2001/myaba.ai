package acl.domains.hipaa

import rego.v1

# ── Helpers ────────────────────────────────────────────────────────────────

# Active HIPAA control domains in this response
hipaa_domains := [d | d := input.acl.control_domains[_]; d.domain == "HIPAA"]

# Resolve client IDs present in this request (single or multi-client)
request_client_ids := input.request_context.client_ids if {
    input.request_context.client_ids
} else := [input.request_context.client_id] if {
    input.request_context.client_id
} else := []

is_cross_client := count(request_client_ids) > 1

# Roles permitted to access clinical PHI
clinical_roles := {"TREATING_BCBA", "SUPERVISING_BCBA"}

# ── ALLOW ──────────────────────────────────────────────────────────────────

# Single-client: Treating BCBA with treatment purpose
allow if {
    some domain in hipaa_domains
    input.identity.role == "TREATING_BCBA"
    input.identity.purpose == "treatment"
    not is_cross_client
}

# Single-client: Supervising BCBA
allow if {
    some domain in hipaa_domains
    input.identity.role == "SUPERVISING_BCBA"
    input.identity.purpose in {"treatment", "oversight"}
    not is_cross_client
}

# Cross-client: BCBA roles may query across clients in the same org.
# Input-side authorization (verifying the user owns each client) is enforced
# at the backend layer before the prompt is built. ACLX governs the output boundary.
allow if {
    is_cross_client
    input.identity.role in clinical_roles
    input.identity.purpose in {"treatment", "oversight", "assessment"}
}

# ── REDACT ─────────────────────────────────────────────────────────────────

# RBT: strip SUPER_PHI (diagnosis, medication, mental health details)
redact contains msg if {
    some domain in hipaa_domains
    domain.subcategory == "SUPER_PHI"
    input.identity.role == "RBT"
    msg := "SUPER_PHI redacted for RBT role"
}

# Scheduling admin: only demographic PHI permitted
redact contains msg if {
    some domain in hipaa_domains
    input.identity.role == "SCHEDULING_ADMIN"
    domain.category == "PHI"
    not domain.subcategory == "DEMOGRAPHIC"
    msg := "Non-demographic PHI redacted for scheduling role"
}

# ── BLOCK ──────────────────────────────────────────────────────────────────

# Billing admin cannot access clinical or SUPER_PHI
deny contains msg if {
    some domain in hipaa_domains
    domain.subcategory == "SUPER_PHI"
    input.identity.role == "BILLING_ADMIN"
    msg := "SUPER_PHI cannot be released to billing role"
}

# Purpose mismatch for TREATMENT_ONLY distributions
deny contains msg if {
    some domain in hipaa_domains
    domain.distribution == "TREATMENT_ONLY"
    not input.identity.purpose in {"treatment", "assessment"}
    msg := "TREATMENT_ONLY distribution requires treatment or assessment purpose"
}

# Cross-client queries are blocked for non-clinical roles
deny contains msg if {
    is_cross_client
    not input.identity.role in clinical_roles
    msg := "Cross-client queries restricted to BCBA roles"
}

# ── ESCALATE ───────────────────────────────────────────────────────────────

# Low-confidence HIGH/CRITICAL PHI always escalates
escalate contains msg if {
    some domain in hipaa_domains
    domain.confidence.level == "LOW"
    domain.sensitivity in {"HIGH", "CRITICAL"}
    msg := "Low-confidence HIGH/CRITICAL PHI requires human review"
}

# Cross-client queries with HIGH/CRITICAL sensitivity always escalate for audit
escalate contains msg if {
    is_cross_client
    some domain in hipaa_domains
    domain.sensitivity in {"HIGH", "CRITICAL"}
    msg := "Cross-client HIGH sensitivity response requires human review before release"
}
