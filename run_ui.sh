#!/usr/bin/env bash
# Chạy backend (FastAPI) + frontend (Next.js) cho demo. Ctrl+C để dừng cả hai.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${VENV:-$ROOT/.venv}"
API_PORT="${API_PORT:-8000}"
UI_PORT="${UI_PORT:-3000}"

if [ ! -d "$VENV" ]; then
  echo "Không thấy virtualenv ở $VENV — tạo bằng: python3 -m venv .venv" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "▶ backend  http://localhost:$API_PORT"
(cd "$ROOT/starter_v0" && uvicorn server:app --reload --port "$API_PORT") &

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "▶ npm install…"
  (cd "$ROOT/frontend" && npm install)
fi

echo "▶ frontend http://localhost:$UI_PORT"
(cd "$ROOT/frontend" && npm run dev -- --port "$UI_PORT") &

wait
