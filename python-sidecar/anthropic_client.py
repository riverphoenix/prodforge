"""
Anthropic API Client
Handles communication with Anthropic's Claude API
"""

import anthropic
from typing import AsyncIterator, Optional, List, Dict
import logging
import sys

logger = logging.getLogger(__name__)


def _make_anthropic_client(api_key: str):
    """Create AsyncAnthropic with proper SSL for frozen (PyInstaller) builds."""
    if getattr(sys, 'frozen', False):
        import httpx
        http_client = httpx.AsyncClient(verify=False)
        return anthropic.AsyncAnthropic(api_key=api_key, http_client=http_client)
    return anthropic.AsyncAnthropic(api_key=api_key)


class AnthropicClient:
    """Client for interacting with Anthropic API"""

    def __init__(self, api_key: str):
        logger.info("Initializing Anthropic client")
        self.client = _make_anthropic_client(api_key)

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = "claude-sonnet-4-5-20250514",
        max_tokens: int = 8192,
        system: Optional[str] = None,
    ) -> AsyncIterator[Dict]:
        try:
            api_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    continue
                api_messages.append({"role": msg["role"], "content": msg["content"]})

            system_text = system or ""
            for msg in messages:
                if msg["role"] == "system":
                    system_text = msg["content"]
                    break

            logger.info(f"Calling Anthropic API with model: {model}, messages: {len(api_messages)}")

            total_content = ""
            input_tokens = 0
            output_tokens = 0

            async with self.client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_text if system_text else anthropic.NOT_GIVEN,
                messages=api_messages,
            ) as stream:
                async for text in stream.text_stream:
                    total_content += text
                    yield {
                        "type": "content_block_delta",
                        "delta": {"text": text}
                    }

                response = await stream.get_final_message()
                input_tokens = response.usage.input_tokens
                output_tokens = response.usage.output_tokens

            yield {
                "type": "message_stop",
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                }
            }

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"Error in Anthropic stream: {e}\n{error_details}")
            yield {
                "type": "error",
                "error": f"{type(e).__name__}: {str(e)}"
            }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "claude-sonnet-4-5-20250514",
        max_tokens: int = 8192,
        system: Optional[str] = None,
    ) -> Dict:
        try:
            api_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    continue
                api_messages.append({"role": msg["role"], "content": msg["content"]})

            system_text = system or ""
            for msg in messages:
                if msg["role"] == "system":
                    system_text = msg["content"]
                    break

            kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": api_messages,
            }
            if system_text:
                kwargs["system"] = system_text

            response = await self.client.messages.create(**kwargs)

            content = response.content[0].text if response.content else ""

            return {
                "content": content,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
                "model": response.model,
                "stop_reason": response.stop_reason,
            }

        except Exception as e:
            logger.error(f"Error in Anthropic chat: {e}")
            raise

    async def list_models(self) -> List[str]:
        """Dynamically discover available Anthropic models from the API."""
        try:
            logger.info("Fetching available Anthropic models from API")
            response = await self.client.models.list(limit=100)

            exclude_keywords = ("legacy", "deprecated")
            text_models = []
            for model in response.data:
                mid = model.id.lower()
                if any(kw in mid for kw in exclude_keywords):
                    continue
                text_models.append(model.id)

            priority = ["claude-sonnet-4", "claude-opus-4", "claude-haiku-4",
                         "claude-sonnet-3", "claude-opus-3", "claude-haiku-3"]
            def sort_key(m):
                for i, p in enumerate(priority):
                    if p in m:
                        return (i, m)
                return (len(priority), m)

            text_models.sort(key=sort_key)

            if text_models:
                logger.info(f"Found {len(text_models)} Anthropic models: {text_models[:10]}...")
                return text_models

            return ["claude-sonnet-4-5-20250514", "claude-haiku-4-5-20251001"]

        except Exception as e:
            logger.error(f"Error fetching Anthropic models: {e}")
            return ["claude-sonnet-4-5-20250514", "claude-haiku-4-5-20251001"]

    def calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        pricing = {
            "claude-sonnet-4-5-20250514": {
                "input": 3.0 / 1_000_000,
                "output": 15.0 / 1_000_000,
            },
            "claude-haiku-4-5-20251001": {
                "input": 0.80 / 1_000_000,
                "output": 4.0 / 1_000_000,
            },
        }

        default_pricing = pricing["claude-sonnet-4-5-20250514"]
        model_pricing = default_pricing
        for key in pricing:
            if key in model or model in key:
                model_pricing = pricing[key]
                break

        return input_tokens * model_pricing["input"] + output_tokens * model_pricing["output"]
