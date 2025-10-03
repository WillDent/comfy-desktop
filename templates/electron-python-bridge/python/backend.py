"""Minimal Python backend for the Electron bridge template."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from typing import Optional


def make_response(request_id: int, result: Optional[dict] = None, error: Optional[str] = None) -> str:
    message = {"id": request_id, "result": result, "error": error}
    return json.dumps(message)


def handle_payload(payload: dict) -> dict:
    prompt = payload.get("prompt", "")

    # Placeholder logic that simulates an AI/ML inference call.
    sentiment = "positive" if "good" in prompt.lower() else "neutral"

    return {
        "prompt": prompt,
        "sentiment": sentiment,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
            request_id = message["id"]
            payload = message.get("payload", {})
            result = handle_payload(payload)
            sys.stdout.write(make_response(request_id, result=result) + "\n")
            sys.stdout.flush()
        except Exception as exc:  # noqa: BLE001 - surface the stack trace to Electron
            request_id = -1
            try:
                request_id = json.loads(line).get("id", -1)
            except Exception:  # noqa: BLE001 - ignore parse errors here
                pass
            sys.stdout.write(make_response(request_id, error=str(exc)) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
