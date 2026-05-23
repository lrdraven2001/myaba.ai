package acl.domains.hipaa

import rego.v1

# Active HIPAA control domains in this response
hipaa_domains := [d | d := input.acl.control_domains[_]; d.domain == "HIPAA"]

# ALLOW: Treating BCBA with treatment purpose
allow if {
  some domain in hipaa_domains
  input.identity.role == "TREATING_BCBA"
  input.identity.purpose == "treatment"
}

# ALLOW: Supervising BCBA
allow if {
  some domain in hipaa_domains
  input.identity.role == "SUPERVISING_BCBA"
  input.identity.purpose in {"treatment", "oversight"}
}

# REDACT: RBT — strip SUPER_PHI, allow session data
redact contains msg if {
  some domain in hipaa_domains
  domain.subcategory == "SUPER_PHI"
  input.identity.role == "RBT"
  msg := "SUPER_PHI redacted for RBT role"
}

# REDACT: Scheduling admin — demographics only
redact contains msg if {
  some domain in hipaa_domains
  input.identity.role == "SCHEDULING_ADMIN"
  domain.category == "PHI"
  not domain.subcategory == "DEMOGRAPHIC"
  msg := "Non-demographic PHI redacted for scheduling role"
}

# BLOCK: Billing cannot access clinical/SUPER_PHI
deny contains msg if {
  some domain in hipaa_domains
  domain.subcategory == "SUPER_PHI"
  input.identity.role == "BILLING_ADMIN"
  msg := "SUPER_PHI cannot be released to billing role"
}

# BLOCK: Purpose mismatch for TREATMENT_ONLY distribution
deny contains msg if {
  some domain in hipaa_domains
  domain.distribution == "TREATMENT_ONLY"
  not input.identity.purpose in {"treatment", "assessment"}
  msg := "TREATMENT_ONLY distribution requires treatment or assessment purpose"
}

# ESCALATE: Low-confidence detection of high-sensitivity PHI
escalate contains msg if {
  some domain in hipaa_domains
  domain.confidence.level == "LOW"
  domain.sensitivity in {"HIGH", "CRITICAL"}
  msg := "Low-confidence HIGH/CRITICAL PHI requires human review"
}
