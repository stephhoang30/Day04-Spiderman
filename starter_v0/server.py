"""HTTP API for the Research Agent UI.

Wraps the SAME agent loop the CLI uses (`chat.iter_model_tool_loop`) so the UI is a
view over the lab artifacts, not a second agent implementation. Everything the demo
rubric asks for is exposed here:

  GET  /api/meta                    providers, models, artifact versions, tool catalog
  GET  /api/scenarios               demo prompts pulled from the eval datasets
  POST /api/chat/stream             run one turn, stream rounds/tool calls as SSE
  POST /api/chat                    same turn, single JSON response
  POST /api/compare                 run one prompt against N versions (A/B demo)
  GET  /api/sessions/{id}           in-memory session state
  GET  /api/transcripts             saved transcript files
  GET  /api/transcripts/{id}        one transcript JSON

Run:  uvicorn server:app --reload --port 8000   (from starter_v0/)
"""

from __future__ import annotations

import json
import os
import queue
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from chat import (
    ARTIFACTS_DIR,
    ROOT,
    iter_model_tool_loop,
    now_iso,
    safe_slug,
    trim_history,
    write_transcript,
)
from env_loader import load_lab_env
from providers import make_provider
from tools import TOOL_FUNCTIONS, load_tool_declarations, to_openai_tools
from versioning import artifact_version_dict, build_artifact_version

load_lab_env(ROOT)

TRANSCRIPTS_DIR = ROOT / "transcripts"
VERSIONS_DIR = ARTIFACTS_DIR / "versions"
DATA_DIR = ROOT / "data"

# System prompt là artifact chính của nhóm -> mặc định KHÔNG trả nội dung ra API.
# Bật lại khi tự review: UI_EXPOSE_PROMPT=1 uvicorn server:app ...
EXPOSE_PROMPT = os.getenv("UI_EXPOSE_PROMPT", "0").strip().lower() in {"1", "true", "yes", "on"}

PROVIDERS: dict[str, dict[str, Any]] = {
    "openai": {"label": "OpenAI", "env": "OPENAI_API_KEY", "default_model": "gpt-4o-mini",
               "models": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]},
    "openrouter": {"label": "OpenRouter", "env": "OPENROUTER_API_KEY", "default_model": None,
                   "models": ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-001"]},
    "anthropic": {"label": "Anthropic", "env": "ANTHROPIC_API_KEY", "default_model": None,
                  "models": ["claude-sonnet-4-5", "claude-haiku-4-5-20251001"]},
    "gemini": {"label": "Gemini", "env": "GEMINI_API_KEY", "default_model": None,
               "models": ["gemini-2.0-flash", "gemini-2.5-flash"]},
}

TOOL_ENV_HINTS: dict[str, list[str]] = {
    "lookup": ["TAVILY_API_KEY"],
    "fetch": ["FIRECRAWL_API_KEY"],
    "timeline": ["RAPIDAPI_KEY"],
    "social_search": ["RAPIDAPI_KEY"],
    "send": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
}

app = FastAPI(title="Research Agent Console API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Artifact versions                                                            #
# --------------------------------------------------------------------------- #

class ArtifactSet:
    """One (system_prompt.md, tools.yaml) pair the agent can run with."""

    def __init__(self, label: str, prompt_path: Path, tools_path: Path, *, is_working: bool) -> None:
        self.label = label
        self.prompt_path = prompt_path
        self.tools_path = tools_path
        self.is_working = is_working

    @property
    def version(self):
        return build_artifact_version(self.label, self.prompt_path, self.tools_path)

    def system_prompt(self) -> str:
        return self.prompt_path.read_text(encoding="utf-8")

    def declarations(self) -> list[dict[str, Any]]:
        return load_tool_declarations(self.tools_path)

    def summary(self) -> dict[str, Any]:
        declarations = self.declarations()
        return {
            "label": self.label,
            "is_working": self.is_working,
            "description": "Artifacts đang chỉnh sửa (artifacts/)" if self.is_working
            else f"Snapshot đã đóng băng (artifacts/versions/{self.label}/)",
            **artifact_version_dict(self.version),
            "tool_count": len(declarations),
            "tool_names": [item["name"] for item in declarations],
            "prompt_chars": len(self.system_prompt()),
        }


def artifact_sets() -> dict[str, ArtifactSet]:
    sets: dict[str, ArtifactSet] = {
        "current": ArtifactSet("current", ARTIFACTS_DIR / "system_prompt.md", ARTIFACTS_DIR / "tools.yaml", is_working=True)
    }
    if VERSIONS_DIR.exists():
        for folder in sorted(VERSIONS_DIR.iterdir()):
            prompt_path = folder / "system_prompt.md"
            tools_path = folder / "tools.yaml"
            if folder.is_dir() and prompt_path.exists() and tools_path.exists():
                sets[folder.name] = ArtifactSet(folder.name, prompt_path, tools_path, is_working=False)
    return sets


def ordered_artifact_sets() -> list[ArtifactSet]:
    """Snapshot theo thứ tự tự nhiên (v0, v1, v2, v10…), 'current' luôn đứng cuối."""

    def natural_key(label: str) -> tuple[int, str]:
        digits = "".join(ch for ch in label if ch.isdigit())
        return (int(digits) if digits else 9999, label)

    sets = artifact_sets()
    snapshots = sorted((s for s in sets.values() if not s.is_working), key=lambda s: natural_key(s.label))
    return [*snapshots, *(s for s in sets.values() if s.is_working)]


def get_artifact_set(label: str | None) -> ArtifactSet:
    sets = artifact_sets()
    chosen = sets.get(label or "current")
    if not chosen:
        raise HTTPException(status_code=404, detail=f"Unknown artifact version: {label}")
    return chosen


# --------------------------------------------------------------------------- #
# Sessions                                                                     #
# --------------------------------------------------------------------------- #

class Session:
    def __init__(self, session_id: str, meta: dict[str, Any]) -> None:
        self.id = session_id
        self.history: list[dict[str, str]] = []
        self.turn_index = 0
        self.transcript_path = TRANSCRIPTS_DIR / f"{session_id}.transcript.json"
        # Chốt chặn thứ hai sau safe_session_id(): không ghi ra ngoài transcripts/.
        if self.transcript_path.resolve().parent != TRANSCRIPTS_DIR.resolve():
            raise HTTPException(status_code=400, detail="Invalid session id")
        self.transcript: dict[str, Any] = {
            "transcript_id": session_id,
            "surface": "nextjs_ui",
            **meta,
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "turns": [],
        }


SESSIONS: dict[str, Session] = {}
SESSION_LOCK = threading.Lock()


# --------------------------------------------------------------------------- #
# Request models                                                               #
# --------------------------------------------------------------------------- #

MAX_MESSAGE_CHARS = 8000
MAX_SESSION_ID_CHARS = 80


class ChatRequest(BaseModel):
    """Mọi field đều do client gửi -> giới hạn ngay ở biên.

    Không có field nào cho phép client chèn/ghi đè system prompt: prompt chỉ đọc từ
    artifact file theo `version`, và `version` phải khớp một label đã đăng ký.
    """

    message: str = Field(max_length=MAX_MESSAGE_CHARS)
    session_id: str | None = Field(default=None, max_length=MAX_SESSION_ID_CHARS)
    provider: str = "openai"
    model: str | None = Field(default=None, max_length=120)
    version: str = "current"
    history_window: int = Field(default=5, ge=0, le=20)
    max_tool_rounds: int = Field(default=4, ge=1, le=8)


class CompareRequest(BaseModel):
    message: str = Field(max_length=MAX_MESSAGE_CHARS)
    provider: str = "openai"
    model: str | None = Field(default=None, max_length=120)
    versions: list[str] = Field(default_factory=lambda: ["current"], max_length=4)
    max_tool_rounds: int = Field(default=4, ge=1, le=8)


# --------------------------------------------------------------------------- #
# Turn execution                                                               #
# --------------------------------------------------------------------------- #

def build_turn_context(request: ChatRequest) -> dict[str, Any]:
    artifacts = get_artifact_set(request.version)
    provider_key = request.provider
    if provider_key not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_key}")
    provider = make_provider(provider_key)
    model = request.model or getattr(provider, "default_model", None)
    return {
        "artifacts": artifacts,
        "provider": provider,
        "provider_key": provider_key,
        "model": model,
        "system_prompt": artifacts.system_prompt(),
        "openai_tools": to_openai_tools(artifacts.declarations()),
    }


def safe_session_id(raw: str | None, version: str) -> str:
    """session_id đi thẳng vào tên file transcript -> phải chặn path traversal.

    safe_slug() thay mọi ký tự ngoài [A-Za-z0-9_.-] (kể cả '/' và '\\') bằng '_',
    nên kết quả không bao giờ thoát khỏi TRANSCRIPTS_DIR.
    """
    if not raw:
        return f"ui_{safe_slug(version)}_{datetime.now():%Y%m%dT%H%M%S}_{uuid.uuid4().hex[:6]}"
    cleaned = safe_slug(raw).strip(".")[:MAX_SESSION_ID_CHARS]
    return cleaned or f"ui_{uuid.uuid4().hex[:12]}"


def get_or_create_session(request: ChatRequest, context: dict[str, Any]) -> Session:
    session_id = safe_session_id(request.session_id, request.version)
    with SESSION_LOCK:
        session = SESSIONS.get(session_id)
        if session is None:
            artifacts: ArtifactSet = context["artifacts"]
            session = Session(session_id, {
                **artifact_version_dict(artifacts.version),
                "provider": context["provider_key"],
                "model": context["model"],
                "system_prompt": str(artifacts.prompt_path),
                "tools": str(artifacts.tools_path),
                "history_window": request.history_window,
                "max_tool_rounds": request.max_tool_rounds,
            })
            SESSIONS[session_id] = session
    return session


def run_turn(request: ChatRequest, *, emit: Any | None = None) -> dict[str, Any]:
    """Run one user turn. `emit(event)` is called for every streaming event."""
    context = build_turn_context(request)
    session = get_or_create_session(request, context)
    artifacts: ArtifactSet = context["artifacts"]
    version = artifacts.version

    session.turn_index += 1
    messages = [
        {"role": "system", "content": context["system_prompt"]},
        *trim_history(session.history, request.history_window),
        {"role": "user", "content": request.message},
    ]

    turn_record: dict[str, Any] = {
        "turn_index": session.turn_index,
        "started_at": now_iso(),
        "user": request.message,
        "status": "started",
        "assistant_text": None,
        "rounds": [],
        "tool_events": [],
        "artifact_version": version.artifact_version,
    }

    def push(event: dict[str, Any]) -> None:
        if emit is not None:
            emit(event)

    push({
        "type": "run_start",
        "session_id": session.id,
        "turn_index": session.turn_index,
        "provider": context["provider_key"],
        "model": context["model"],
        "version_label": artifacts.label,
        **artifact_version_dict(version),
    })

    started = datetime.now()
    try:
        payload: dict[str, Any] = {}
        for event in iter_model_tool_loop(
            provider=context["provider"],
            messages=messages,
            tools=context["openai_tools"],
            model=request.model,
            max_tool_rounds=request.max_tool_rounds,
        ):
            if event["type"] == "final":
                payload = event["payload"]
            else:
                push(event)
        turn_record.update(payload)
        session.history.append({"role": "user", "content": request.message})
        session.history.append({"role": "assistant", "content": payload["assistant_text"]})
    except Exception as exc:
        turn_record.update({
            "status": "provider_error",
            "assistant_text": None,
            "error": f"{type(exc).__name__}: {exc}",
        })

    turn_record["ended_at"] = now_iso()
    turn_record["duration_ms"] = int((datetime.now() - started).total_seconds() * 1000)
    session.transcript["turns"].append(turn_record)
    write_transcript(session.transcript_path, session.transcript)

    final_event = {
        "type": "final",
        "session_id": session.id,
        "transcript_id": session.transcript_path.stem.replace(".transcript", ""),
        "transcript_path": str(session.transcript_path),
        "turn": turn_record,
        **artifact_version_dict(version),
    }
    push(final_event)
    return final_event


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "time": now_iso()}


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    sets = artifact_sets()
    working = sets["current"]
    declarations = working.declarations()
    tools = [{
        "name": item["name"],
        "description": item.get("description", ""),
        "parameters": item.get("parameters", {}),
        "required": item.get("parameters", {}).get("required", []),
        "implemented": item["name"] in TOOL_FUNCTIONS,
        "env_keys": [{"name": key, "present": bool(os.getenv(key))} for key in TOOL_ENV_HINTS.get(item["name"], [])],
    } for item in declarations]

    return {
        "providers": [{
            "key": key,
            "label": info["label"],
            "models": info["models"],
            "default_model": info["default_model"],
            "key_present": bool(os.getenv(info["env"])),
            "env": info["env"],
        } for key, info in PROVIDERS.items()],
        "versions": [item.summary() for item in ordered_artifact_sets()],
        "tools": tools,
        "defaults": {"history_window": 5, "max_tool_rounds": 4, "version": "current"},
        "prompt_visible": EXPOSE_PROMPT,
    }


@app.get("/api/scenarios")
def scenarios() -> dict[str, Any]:
    """Demo prompts lifted from the eval datasets so the demo mirrors the eval."""
    out: list[dict[str, Any]] = []
    for file_name, suite in [("eval_base.json", "base"), ("eval_group.json", "group"), ("eval_research_extension.json", "research")]:
        path = DATA_DIR / file_name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for case in data.get("cases", []):
            turns = case.get("turns")
            query = case.get("query") or (turns[0].get("user") if turns else None) or (turns[0] if turns and isinstance(turns[0], str) else None)
            if not query:
                continue
            expected = case.get("expect", {})
            out.append({
                "id": case.get("id"),
                "suite": suite,
                "query": query,
                "turns": turns,
                "failure_type": case.get("failure_type"),
                "expected_tools": [call.get("name") for call in expected.get("tool_calls", [])],
                "expected_args": [call.get("args", {}) for call in expected.get("tool_calls", [])],
                "no_tool": bool(expected.get("no_tool")),
                "what_it_tests": (case.get("metadata") or {}).get("what_it_tests"),
            })
    return {"scenarios": out}


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict[str, Any]:
    return run_turn(request)


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    events: queue.Queue[dict[str, Any] | None] = queue.Queue()

    def worker() -> None:
        try:
            run_turn(request, emit=events.put)
        except HTTPException as exc:
            events.put({"type": "error", "message": str(exc.detail)})
        except Exception as exc:
            events.put({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        finally:
            events.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def stream() -> Iterator[str]:
        while True:
            event = events.get()
            if event is None:
                yield "data: [DONE]\n\n"
                return
            yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


@app.post("/api/compare")
def compare(request: CompareRequest) -> dict[str, Any]:
    """Run the same prompt through several artifact versions (rubric: A/B demo).

    Các version chạy SONG SONG: demo 4 version mất thời gian như chạy 1 version,
    thay vì cộng dồn. Thứ tự trả về vẫn đúng thứ tự client gửi lên.
    """

    def run_one(label: str) -> dict[str, Any]:
        try:
            result = run_turn(ChatRequest(
                message=request.message,
                session_id=None,
                provider=request.provider,
                model=request.model,
                version=label,
                history_window=0,
                max_tool_rounds=request.max_tool_rounds,
            ))
            return {"version_label": label, **result}
        except HTTPException as exc:
            return {"version_label": label, "error": str(exc.detail)}
        except Exception as exc:
            return {"version_label": label, "error": f"{type(exc).__name__}: {exc}"}

    with ThreadPoolExecutor(max_workers=len(request.versions) or 1) as pool:
        runs = list(pool.map(run_one, request.versions))
    return {"message": request.message, "runs": runs}


@app.get("/api/sessions/{session_id}")
def session_detail(session_id: str) -> dict[str, Any]:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Unknown session")
    return session.transcript


@app.get("/api/transcripts")
def transcripts() -> dict[str, Any]:
    if not TRANSCRIPTS_DIR.exists():
        return {"transcripts": []}
    items: list[dict[str, Any]] = []
    for path in sorted(TRANSCRIPTS_DIR.glob("*.transcript.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:50]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        items.append({
            "transcript_id": data.get("transcript_id", path.stem),
            "file": path.name,
            "artifact_version": data.get("artifact_version"),
            "provider": data.get("provider"),
            "model": data.get("model"),
            "surface": data.get("surface", "cli"),
            "turn_count": len(data.get("turns", [])),
            "updated_at": data.get("updated_at"),
        })
    return {"transcripts": items}


@app.get("/api/transcripts/{transcript_id}")
def transcript_detail(transcript_id: str) -> dict[str, Any]:
    path = TRANSCRIPTS_DIR / f"{safe_slug(transcript_id)}.transcript.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Unknown transcript")
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
