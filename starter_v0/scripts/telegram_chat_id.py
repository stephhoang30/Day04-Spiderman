"""In ra TELEGRAM_CHAT_ID của mọi chat mà bot đã nhìn thấy.

Cách dùng (từ starter_v0/):
    python scripts/telegram_chat_id.py                 # đọc TELEGRAM_BOT_TOKEN trong .env
    python scripts/telegram_chat_id.py --token 123:ABC # hoặc truyền thẳng

Trước khi chạy: NHẮN cho bot một tin bất kỳ.
    - Chat riêng: mở @tenbot -> /start
    - Group:      thêm bot vào group -> gõ "/start@tenbot" (bắt buộc có @tenbot,
                  vì privacy mode khiến bot không đọc được tin thường)
    - Channel:    thêm bot làm admin -> đăng một bài
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from env_loader import load_lab_env  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.telegram.org"


def chats_from_updates(updates: list[dict]) -> dict[int, dict]:
    found: dict[int, dict] = {}
    for update in updates:
        for key in ("message", "edited_message", "channel_post", "edited_channel_post", "my_chat_member"):
            chat = (update.get(key) or {}).get("chat")
            if chat and chat.get("id") is not None:
                found[chat["id"]] = chat
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="Lấy TELEGRAM_CHAT_ID từ getUpdates.")
    parser.add_argument("--token", default=None, help="Bot token; mặc định đọc TELEGRAM_BOT_TOKEN trong .env")
    args = parser.parse_args()

    load_lab_env(ROOT)
    token = args.token or os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        print("✗ Chưa có TELEGRAM_BOT_TOKEN.")
        print("  1. Mở @BotFather trên Telegram -> /newbot -> copy token.")
        print("  2. Bỏ dấu # ở dòng TELEGRAM_BOT_TOKEN trong starter_v0/.env rồi dán token vào.")
        return 1

    me = requests.get(f"{API}/bot{token}/getMe", timeout=30).json()
    if not me.get("ok"):
        print(f"✗ Token sai: {me.get('description')}")
        return 1
    username = me["result"].get("username")
    print(f"✓ Bot: @{username}")

    hook = requests.get(f"{API}/bot{token}/getWebhookInfo", timeout=30).json()
    if hook.get("ok") and hook["result"].get("url"):
        print(f"! Bot đang đặt webhook ({hook['result']['url']}) nên getUpdates luôn rỗng.")
        print(f"  Gỡ tạm: curl -s '{API}/bot<TOKEN>/deleteWebhook'")

    data = requests.get(f"{API}/bot{token}/getUpdates", timeout=30).json()
    if not data.get("ok"):
        print(f"✗ getUpdates lỗi: {data.get('description')}")
        return 1

    chats = chats_from_updates(data.get("result", []))
    if not chats:
        print("✗ Chưa thấy chat nào. Hãy nhắn cho bot rồi chạy lại:")
        print(f"    - chat riêng: mở https://t.me/{username} rồi bấm /start")
        print(f"    - group:      thêm bot vào group rồi gõ  /start@{username}")
        print("    - channel:    thêm bot làm admin rồi đăng 1 bài")
        print("  Lưu ý: Telegram chỉ giữ update ~24h và mỗi update chỉ đọc được một lần.")
        return 1

    print("\nCác chat bot nhìn thấy:")
    for chat_id, chat in chats.items():
        name = chat.get("title") or " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")])) or "?"
        handle = f" @{chat['username']}" if chat.get("username") else ""
        print(f"  TELEGRAM_CHAT_ID={chat_id:<16} # {chat.get('type')} · {name}{handle}")

    print("\nDán dòng phù hợp vào starter_v0/.env (bỏ phần sau #), rồi khởi động lại backend.")
    print("Kiểm tra bằng cách gửi thật:")
    print("  python -c \"from pathlib import Path; from env_loader import load_lab_env;"
          " load_lab_env(Path.cwd()); from tools import TOOL_FUNCTIONS as T;"
          " print(T['send'](text='test tu Day04', confirmed=True))\"")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
