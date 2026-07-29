# Research Agent Console — UI (Next.js)

UI demo cho research agent của Day 04. UI **không** tự viết agent loop: nó gọi
`starter_v0/server.py` (FastAPI), và server đó dùng lại đúng `iter_model_tool_loop`
trong `starter_v0/chat.py` mà CLI đang chạy. Cùng một agent, hai bề mặt.

## Chạy local

Hai terminal.

**1. Backend (từ `starter_v0/`)**

```bash
cd starter_v0
source ../.venv/bin/activate      # hoặc .venv của bạn
python -m pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Smoke test: `curl http://localhost:8000/api/health`

**2. Frontend (từ `frontend/`)**

```bash
cd frontend
npm install
cp .env.example .env.local        # sửa NEXT_PUBLIC_API_BASE nếu backend không ở localhost:8000
npm run dev
```

Mở http://localhost:3000 (Next tự nhảy sang 3001 nếu 3000 bận).

## Hai tab

| Tab | Dùng để làm gì trong lúc demo |
|---|---|
| **Chat + Trace** | Chạy agent thật. Mỗi turn hiện round → tool call → arguments → result/error, kèm latency từng tool. Cột phải là "evidence": artifact_version, session, transcript id, tool timeline, turn JSON. |
| **So sánh version** | Một prompt chạy song song qua nhiều artifact version (`current`, `v0`, `v1`…) và bày tool path cạnh nhau. Đây là bằng chứng "sửa prompt/tools làm đổi routing". |

Chọn một eval case ở panel **demo scenario** trước khi gửi: UI sẽ so tool + args
thực tế với `expect` của case đó và hiện PASS/FAIL ngay trong cột evidence.

Theme mặc định là **light** (dễ nhìn khi chiếu máy chiếu). Nút `☀ light / ☾ dark`
ở góc phải header đổi theme và nhớ lựa chọn trong `localStorage`.

## System prompt không lộ ra UI

`system_prompt.md` **không được hiển thị ở bất kỳ đâu trong UI** và cũng không có endpoint nào
trả nội dung của nó (endpoint `/api/versions/{label}` đã bị gỡ). Người xem — kể cả qua link
tunnel — chỉ thấy `artifact_version` + `prompt_hash`, đủ để đối chiếu version mà không đọc được
prompt. Cần review nội dung thì mở thẳng file trong repo.

Backend còn cờ `EXPOSE_PROMPT` (`UI_EXPOSE_PROMPT=1`) trong `server.py` nếu sau này muốn dựng lại
một view nội bộ; mặc định là tắt.

## Artifact version registry

- `current` = `starter_v0/artifacts/{system_prompt.md,tools.yaml}` — bản đang sửa.
- Mỗi thư mục `starter_v0/artifacts/versions/<label>/` có đủ `system_prompt.md` +
  `tools.yaml` sẽ tự xuất hiện thành một version chọn được.

Khi chốt xong một vòng tối ưu, đóng băng nó lại để còn so sánh:

```bash
mkdir -p starter_v0/artifacts/versions/v1
cp starter_v0/artifacts/system_prompt.md starter_v0/artifacts/tools.yaml \
   starter_v0/artifacts/versions/v1/
```

Reload UI → `v1` xuất hiện trong dropdown và trong tab So sánh version.

## API key

UI đọc `starter_v0/.env` qua backend và gắn nhãn `key ✕` lên tool nào thiếu key.
Tool thiếu key vẫn gọi được — nó trả `error` và UI hiển thị lỗi đó (đúng nguyên
tắc "failures are evidence"). Muốn demo tool chạy thật thì điền:

- `TAVILY_API_KEY` → `lookup`
- `FIRECRAWL_API_KEY` → `fetch`
- `RAPIDAPI_KEY` → `timeline`, `social_search`
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` → `send`

`clarify`, `format`, `policy`, `papers`, `paper_text` chạy được không cần key.

## Deploy cho team khác test

UI và API dùng **chung một origin**: Next rewrite `/api/*` sang FastAPI (`next.config.ts`),
nên chỉ cần tunnel đúng cổng 3000 và không phải build lại khi URL đổi.

```bash
brew install cloudflared     # Windows: winget install --id Cloudflare.cloudflared
./deploy.sh                  # từ thư mục gốc repo
```

Script sẽ: bật backend → build + start frontend → mở Cloudflare Tunnel → in ra
`https://<random>.trycloudflare.com`. Dán link đó vào `REPORT.md` phần A và test bằng
máy/điện thoại khác. Cổng bận thì script tự nhảy sang cổng trống kế tiếp.

- `./deploy.sh --local` — chạy production build ở local, không mở tunnel.
- `SKIP_BUILD=1 ./deploy.sh` — bỏ qua `npm run build` khi đã build sẵn.
- `./run_ui.sh` — chế độ dev (hot reload), cũng đi qua proxy y hệt.

Link `trycloudflare` là tạm và đổi mỗi lần chạy lại. API **không có auth**, ai có link
đều gọi được và tiêu credit model của nhóm — Ctrl+C tắt tunnel ngay sau khi demo xong.

## API backend

| Endpoint | Mô tả |
|---|---|
| `GET /api/meta` | provider + trạng thái key, version registry, tool catalog |
| `GET /api/scenarios` | demo prompt lấy từ `data/eval_*.json` |
| `POST /api/chat/stream` | chạy 1 turn, stream SSE từng round/tool call |
| `POST /api/chat` | như trên nhưng trả 1 JSON |
| `POST /api/compare` | 1 prompt × N version |
| `GET /api/transcripts`, `GET /api/transcripts/{id}` | transcript đã lưu trong `starter_v0/transcripts/` |

## Ghi chú bảo mật

Đã kiểm tra và chặn ở biên API:

- không field nào của client ghi đè được system prompt — prompt chỉ đọc từ artifact file theo
  `version`, và `version` phải khớp label đã đăng ký (payload lạ bị pydantic bỏ qua);
- `session_id` đi vào tên file transcript nên được `safe_slug()` + kiểm tra thư mục đích, chặn
  path traversal kiểu `../../`;
- `max_tool_rounds` (1–8), `history_window` (0–20), độ dài `message` (8000) và số version trong
  `/api/compare` (4) đều bị giới hạn, tránh một request tự nhân bản chi phí model;
- link trong tool result đi qua `safeHref()` (chỉ `http/https/mailto`), nên `data:`/`vbscript:`
  không thành `href` được.

Còn lại (chấp nhận trong phạm vi lab): API **không có auth**, nên ai có URL tunnel đều gọi được
và tiêu credit của nhóm — tắt tunnel sau khi demo. Ngoài ra nội dung web do `fetch`/`lookup` tải
về được đưa thẳng vào context model, nên vẫn có prompt injection *bậc hai* từ trang web; đây là
rủi ro của agent chứ không phải của UI, xử lý bằng cách nêu trust boundary trong system prompt
như `policy` tool đang làm.
