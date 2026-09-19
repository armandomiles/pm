import os
from typing import Any

import httpx


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"


class AIConfigurationError(RuntimeError):
    pass


class AIRequestError(RuntimeError):
    pass


def openrouter_chat(
    messages: list[dict[str, str]],
    response_format: dict[str, Any] | None = None,
) -> dict[str, Any]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise AIConfigurationError("OPENROUTER_API_KEY is not configured")

    payload: dict[str, Any] = {"model": MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format

    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise AIRequestError("OpenRouter request failed") from error