#!/usr/bin/env bash
# Deploy nhanh cho demo: dựng backend + frontend rồi mở MỘT link public qua Cloudflare Tunnel.
# UI và API dùng chung origin (Next rewrite /api -> FastAPI), nên chỉ cần tunnel cổng 3000.
#
#   ./deploy.sh              -> build production rồi mở tunnel
#   SKIP_BUILD=1 ./deploy.sh -> bỏ qua npm run build (đã build sẵn)
#   ./deploy.sh --local      -> chỉ chạy local, không mở tunnel
#
# Ctrl+C để tắt tất cả. Link trycloudflare là tạm thời và đổi mỗi lần chạy lại.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${VENV:-$ROOT/.venv}"
API_PORT="${API_PORT:-8000}"
UI_PORT="${UI_PORT:-3000}"
LOG_DIR="${TMPDIR:-/tmp}/day04-deploy"
NO_TUNNEL=0
[ "${1:-}" = "--local" ] && NO_TUNNEL=1

mkdir -p "$LOG_DIR"

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

pick_free_port() {  # $1 = cổng mong muốn, in ra cổng trống đầu tiên
  local port="$1"
  for _ in $(seq 1 20); do
    port_busy "$port" || { echo "$port"; return; }
    port=$((port + 1))
  done
  echo "✗ Không tìm được cổng trống quanh $1" >&2
  exit 1
}

if [ ! -d "$VENV" ]; then
  echo "✗ Không thấy virtualenv ở $VENV (tạo bằng: python3 -m venv .venv)" >&2
  exit 1
fi

if [ "$NO_TUNNEL" = "0" ] && ! command -v cloudflared >/dev/null 2>&1; then
  echo "✗ Chưa có cloudflared. Cài rồi chạy lại:" >&2
  echo "    macOS:   brew install cloudflared" >&2
  echo "    Windows: winget install --id Cloudflare.cloudflared" >&2
  echo "  Hoặc chạy nội bộ trước: ./deploy.sh --local" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

NEW_API_PORT="$(pick_free_port "$API_PORT")"
NEW_UI_PORT="$(pick_free_port "$UI_PORT")"
[ "$NEW_API_PORT" != "$API_PORT" ] && echo "ℹ cổng $API_PORT bận -> backend dùng $NEW_API_PORT"
[ "$NEW_UI_PORT" != "$UI_PORT" ] && echo "ℹ cổng $UI_PORT bận -> frontend dùng $NEW_UI_PORT"
API_PORT="$NEW_API_PORT"
UI_PORT="$NEW_UI_PORT"

echo "▶ backend  :$API_PORT"
(cd "$ROOT/starter_v0" && uvicorn server:app --host 127.0.0.1 --port "$API_PORT" > "$LOG_DIR/api.log" 2>&1) &

for _ in $(seq 1 30); do
  curl -sf -m 1 "http://127.0.0.1:$API_PORT/api/health" >/dev/null && break
  sleep 0.5
done
curl -sf -m 2 "http://127.0.0.1:$API_PORT/api/health" >/dev/null || {
  echo "✗ Backend không lên được, xem $LOG_DIR/api.log" >&2
  tail -20 "$LOG_DIR/api.log" >&2
  exit 1
}

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "▶ build frontend…"
  API_PROXY_TARGET="http://127.0.0.1:$API_PORT" npm run build
fi

echo "▶ frontend :$UI_PORT"
API_PROXY_TARGET="http://127.0.0.1:$API_PORT" npx next start --port "$UI_PORT" > "$LOG_DIR/ui.log" 2>&1 &

UI_UP=0
for _ in $(seq 1 40); do
  if curl -sf -m 1 "http://127.0.0.1:$UI_PORT/api/health" >/dev/null; then UI_UP=1; break; fi
  sleep 0.5
done
if [ "$UI_UP" != "1" ]; then
  echo "✗ Frontend không lên được, xem $LOG_DIR/ui.log" >&2
  tail -20 "$LOG_DIR/ui.log" >&2
  exit 1
fi

if [ "$NO_TUNNEL" = "1" ]; then
  echo
  echo "✓ Local: http://localhost:$UI_PORT   (Ctrl+C để dừng)"
  wait
fi

echo "▶ cloudflare tunnel…"
: > "$LOG_DIR/tunnel.log"
cloudflared tunnel --url "http://localhost:$UI_PORT" > "$LOG_DIR/tunnel.log" 2>&1 &

PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -1 || true)"
  [ -n "$PUBLIC_URL" ] && break
  sleep 1
done

echo
if [ -n "$PUBLIC_URL" ]; then
  echo "══════════════════════════════════════════════════════════"
  echo "  ✓ PUBLIC URL:  $PUBLIC_URL"
  echo "══════════════════════════════════════════════════════════"
  echo "  Dán link này vào REPORT.md phần A rồi test bằng máy/điện thoại khác."
  echo "  API không có auth -> tắt tunnel (Ctrl+C) ngay sau khi demo xong."
else
  echo "✗ Chưa lấy được URL, xem $LOG_DIR/tunnel.log" >&2
fi

wait
