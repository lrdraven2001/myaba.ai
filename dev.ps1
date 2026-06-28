# Dev restart helper — never touches Firebase (keeps emulator auth users + Firestore data).
#
# Usage:
#   .\dev.ps1            # rebuild + restart the API only  (most common, after backend changes)
#   .\dev.ps1 api        # same
#   .\dev.ps1 frontend   # restart the frontend (rarely needed — Vite HMR handles src changes)
#   .\dev.ps1 both       # rebuild API + restart frontend
#   .\dev.ps1 logs       # tail the API logs
#   .\dev.ps1 up         # bring the whole stack up WITHOUT recreating Firebase if it's already running
#   .\dev.ps1 firebase   # recreate Firebase (rare) AND restart the API so it reconnects to the new container
#
# Day-to-day, Firebase is never named, so it is never restarted. The only time it needs to
# cycle is a deliberate config change — and then the API must reconnect (new container IP),
# which the "firebase" target handles for you.

param([string]$target = "api")

Set-Location -Path $PSScriptRoot

switch ($target) {
  "api"      { docker compose up -d --build api }
  "frontend" { docker compose restart frontend }
  "both"     { docker compose up -d --build api; docker compose restart frontend }
  "logs"     { docker compose logs -f --tail 50 api }
  "up"       { docker compose up -d }   # safe: only recreates services whose config/build changed
  "firebase" {
    # Recreating Firebase changes its container IP, so the API's Firestore gRPC channel goes
    # stale. Recreate Firebase (imports persisted data), then restart the API to reconnect.
    docker compose up -d firebase
    docker compose restart api
  }
  default    { Write-Host "Unknown target '$target'. Use: api | frontend | both | logs | up | firebase" -ForegroundColor Yellow }
}
