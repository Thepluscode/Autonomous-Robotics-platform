"""Drop-in replacement for the proprietary `emergentintegrations.llm.chat` SDK.

Implements the same surface used by `server.py`:

    chat = LlmChat(api_key=..., session_id=..., system_message=...).with_model(provider, model)
    text = await chat.send_message(UserMessage(text=..., image_urls=[...]))

Backends (chosen in order):
  1. OpenAI         — when OPENAI_API_KEY is set, or `api_key` looks like a real OpenAI key.
  2. Anthropic      — when provider="anthropic" and ANTHROPIC_API_KEY is set.
  3. Local fallback — context-aware deterministic text built from `system_message` + the user prompt.
                      Used when no real key is configured, or when a real call fails.

The fallback is intentionally NOT static: it echoes a slice of the system message and
prompt back to the caller so dashboards reflect the actual zone/sensor state being
analyzed, rather than the canned "Red Fox 92%" string the previous mock returned.

Env overrides (optional):
    OPENAI_MODEL    — defaults to gpt-4o-mini
    ANTHROPIC_MODEL — defaults to claude-haiku-4-5
    LLM_DISABLE     — set to "1" to force the local fallback even when keys are present
"""
from __future__ import annotations

import json
import logging
import os
from typing import List, Optional

logger = logging.getLogger(__name__)


_DEFAULT_OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
_DEFAULT_ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")


def _looks_like_real_openai_key(key: str) -> bool:
    # The "sk-emergent-..." key in this repo's .env is for a third-party gateway
    # we don't have an SDK for; it would be rejected by api.openai.com directly.
    return bool(key) and key.startswith("sk-") and not key.startswith("sk-emergent-")


class UserMessage:
    def __init__(self, text: str = "", image_urls: Optional[List[str]] = None):
        self.text = text or ""
        self.image_urls = list(image_urls or [])


class LlmChat:
    def __init__(
        self,
        api_key: str = "",
        session_id: str = "",
        system_message: str = "",
        # tolerate older positional kwarg name from the original mock
        model: str = "",
    ):
        self.api_key = api_key or ""
        self.session_id = session_id or ""
        self.system_message = system_message or ""
        self._provider: str = "openai"
        self._model: str = model or ""

    def with_model(self, provider: str, model: str) -> "LlmChat":
        self._provider = (provider or "openai").lower()
        self._model = model or ""
        return self

    # ---- Provider dispatch -------------------------------------------------

    async def send_message(self, message: UserMessage, *, json_mode: bool = False) -> str:
        if os.environ.get("LLM_DISABLE") == "1":
            return self._fallback(message, json_mode=json_mode)

        try:
            if self._provider == "anthropic":
                return await self._call_anthropic(message, json_mode=json_mode)
            return await self._call_openai(message, json_mode=json_mode)
        except Exception as exc:
            logger.warning(
                "LLM call failed (%s/%s): %s — using local fallback.",
                self._provider, self._model, exc,
            )
            return self._fallback(message, json_mode=json_mode)

    async def _call_openai(self, message: UserMessage, *, json_mode: bool) -> str:
        env_key = os.environ.get("OPENAI_API_KEY", "")
        key = env_key or (self.api_key if _looks_like_real_openai_key(self.api_key) else "")
        if not key:
            return self._fallback(message, json_mode=json_mode)

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=key)
        model = self._resolve_model(default=_DEFAULT_OPENAI_MODEL)

        # Build content: text + any image URLs (vision-capable models only).
        if message.image_urls:
            content = [{"type": "text", "text": message.text}]
            for url in message.image_urls:
                content.append({"type": "image_url", "image_url": {"url": url}})
        else:
            content = message.text

        msgs = []
        if self.system_message:
            msgs.append({"role": "system", "content": self.system_message})
        msgs.append({"role": "user", "content": content})

        kwargs = {"model": model, "messages": msgs}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await client.chat.completions.create(**kwargs)
        return (resp.choices[0].message.content or "").strip()

    async def _call_anthropic(self, message: UserMessage, *, json_mode: bool) -> str:
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            return self._fallback(message, json_mode=json_mode)

        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=key)
        model = self._resolve_model(default=_DEFAULT_ANTHROPIC_MODEL)

        if message.image_urls:
            content = [{"type": "text", "text": message.text}]
            for url in message.image_urls:
                content.append({"type": "image", "source": {"type": "url", "url": url}})
        else:
            content = [{"type": "text", "text": message.text}]

        # Anthropic has no native json mode — append the constraint to the system prompt.
        sys_msg = self.system_message or None
        if json_mode:
            json_clause = "Respond with ONLY a single valid JSON object. No prose, no markdown fences."
            sys_msg = f"{sys_msg}\n\n{json_clause}" if sys_msg else json_clause

        resp = await client.messages.create(
            model=model,
            max_tokens=1024,
            system=sys_msg,
            messages=[{"role": "user", "content": content}],
        )
        return "".join(block.text for block in resp.content if getattr(block, "type", None) == "text").strip()

    # ---- Helpers -----------------------------------------------------------

    def _resolve_model(self, default: str) -> str:
        # The original code uses Emergent-specific aliases like "gpt-5.2" that
        # don't exist on real provider APIs. Map anything unrecognized to the
        # configured default model.
        m = (self._model or "").strip()
        if not m or m.lower().startswith(("gpt-5", "claude-5")):
            return default
        return m

    def _fallback(self, message: UserMessage, *, json_mode: bool = False) -> str:
        """Context-aware deterministic response.

        Pulls real signal out of the system_message (which the server builds
        from live zone/sensor data) instead of returning a canned string. This
        keeps dev mode honest: dashboards still reflect actual state.
        """
        prompt = (message.text or "").strip()
        ctx = (self.system_message or "").strip()
        topic = self._classify_topic(prompt + " " + ctx)
        ctx_excerpt = self._tail_lines(ctx, n=8)

        if json_mode:
            # Minimum-viable JSON shape that callers can parse without crashing.
            # The "summary" field includes the provider it tried so dev can tell
            # whether they hit "no key" vs "real call failed".
            return json.dumps({
                "species_name": "Unknown (offline mode)",
                "scientific_name": f"offline-fallback (provider={self._provider})",
                "confidence": 0.0,
                "conservation_status": "DD",
                "summary": f"Topic={topic}; prompt={prompt[:120]}",
                "offline": True,
            })

        header = {
            "species": "Species Identification (offline mode)",
            "biodiversity": "Biodiversity Assessment (offline mode)",
            "soil": "Soil Health Analysis (offline mode)",
            "rewilding": "Rewilding Recommendation (offline mode)",
            "predator_prey": "Predator-Prey Balance (offline mode)",
            "forecast": "Ecosystem Forecast (offline mode)",
            "general": "Ecosystem Status (offline mode)",
        }[topic]

        guidance = {
            "species": "Set OPENAI_API_KEY (or ANTHROPIC_API_KEY with provider=anthropic) to enable real species identification.",
            "biodiversity": "Real biodiversity inference disabled — configure an LLM API key to activate.",
            "soil": "Real soil-health reasoning disabled — configure an LLM API key to activate.",
            "rewilding": "Real rewilding recommendations disabled — configure an LLM API key to activate.",
            "predator_prey": "Real predator-prey analysis disabled — configure an LLM API key to activate.",
            "forecast": "Forecast narrative is computed from the supplied trend data (no live LLM).",
            "general": "Configure OPENAI_API_KEY (or ANTHROPIC_API_KEY) to get live AI analysis.",
        }[topic]

        body = (
            f"{header}\n"
            f"- Prompt: {prompt[:160] or '(none)'}\n"
            f"- Context summary:\n{ctx_excerpt or '  (no context provided)'}\n"
            f"- Note: {guidance}"
        )
        return body

    @staticmethod
    def _classify_topic(text: str) -> str:
        t = (text or "").lower()
        if "species" in t or "identify" in t or "wildlife" in t:
            return "species"
        if "predator" in t or "prey" in t:
            return "predator_prey"
        if "rewilding" in t or "reintroduc" in t:
            return "rewilding"
        if "soil" in t:
            return "soil"
        if "biodiversity" in t:
            return "biodiversity"
        if "forecast" in t or "predict" in t or "trend" in t:
            return "forecast"
        return "general"

    @staticmethod
    def _tail_lines(text: str, n: int) -> str:
        lines = [ln for ln in (text or "").splitlines() if ln.strip()]
        return "\n".join("  " + ln for ln in lines[-n:])
