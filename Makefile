# ─────────────────────────────────────────────────────────────────────────────
# myABA.ai — developer convenience targets
#
# Prerequisites:  Docker Desktop, make (Git Bash on Windows includes it)
#
# Usage:
#   make dev              Start myABA only (no ACLX — ACLX_ENABLED=false)
#   make dev-full         Start myABA + ACLX gateway + OPA together (ACLX on)
#   make dev-full-ext     Same as dev-full + extraction adapter + standards admin
#   make aclx             Start ACLX standalone stack (its own compose file)
#   make down             Stop myABA base stack
#   make down-full        Stop the unified myABA + ACLX stack
#   make down-aclx        Stop ACLX standalone stack
#   make down-all         Stop all stacks
#   make clean            Stop all stacks and wipe volumes (clean slate)
#   make logs             Tail logs for myABA base stack
#   make logs-full        Tail logs for unified stack
#   make logs-aclx        Tail logs for ACLX standalone stack
# ─────────────────────────────────────────────────────────────────────────────

# Path to the ACLX docker-compose directory (adjust if your checkout is elsewhere)
ACLX_DIR := $(or $(ACLX_DIR),D:/aegislayer/ACL/deploy/docker-compose)

# ACLX profiles for the *standalone* ACLX stack (used by `make aclx`):
#   extraction       document-file enforcement adapter  (:8095)
#   standards-admin  corpus curation panel             (:8099)
# The 'adapter' profile (Keycloak + identity-adapter) is omitted —
# myABA uses Firebase Auth so Keycloak is not needed in dev.
ACLX_PROFILES := --profile extraction --profile standards-admin

ACLX_COMPOSE   := docker compose -f $(ACLX_DIR)/docker-compose.yml
FULL_COMPOSE   := docker compose -f docker-compose.full.yml
FULL_COMPOSE_EXT := docker compose -f docker-compose.full.yml --profile extraction --profile standards-admin

.PHONY: dev dev-full dev-full-ext aclx \
        down down-full down-aclx down-all \
        clean logs logs-full logs-aclx

# ── myABA only (ACLX disabled) ────────────────────────────────────────────────
dev:
	docker compose up --build

# ── Unified stack: myABA + ACLX gateway + OPA ────────────────────────────────
# Uses docker-compose.full.yml which includes the base docker-compose.yml
# and adds aclx-gateway + aclx-opa.  The API reaches ACLX via the shared
# Docker network (http://aclx-gateway:8080) — no host.docker.internal needed.
# Healthchecks ensure the API waits for both Firebase and ACLX before starting.
dev-full:
	$(FULL_COMPOSE) up --build

# ── Unified stack + extraction adapter + standards admin ──────────────────────
dev-full-ext:
	$(FULL_COMPOSE_EXT) up --build

# ── ACLX standalone stack (for when you want ACLX independent of myABA) ──────
aclx:
	$(ACLX_COMPOSE) $(ACLX_PROFILES) up --build

# ── Stop targets ──────────────────────────────────────────────────────────────
down:
	docker compose down

down-full:
	$(FULL_COMPOSE_EXT) down

down-aclx:
	$(ACLX_COMPOSE) $(ACLX_PROFILES) down

down-all: down-full down-aclx

# ── Clean slate (removes all volumes — wipes Firestore emulator data etc.) ────
clean: down-all
	docker compose down -v
	$(FULL_COMPOSE_EXT) down -v
	$(ACLX_COMPOSE) down -v

# ── Logs ──────────────────────────────────────────────────────────────────────
logs:
	docker compose logs -f

logs-full:
	$(FULL_COMPOSE) logs -f

logs-aclx:
	$(ACLX_COMPOSE) logs -f
