"""
Ollama Client
Handles communication with local Ollama API
"""

import httpx
from typing import AsyncIterator, Optional, List, Dict
import json
import logging

logger = logging.getLogger(__name__)


class OllamaClient:
    """Client for interacting with local Ollama API"""

    def __init__(self, base_url: str = "http://localhost:11434"):
        logger.info(f"Initializing Ollama client at {base_url}")
        self.base_url = base_url.rstrip("/")

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = "llama3",
        max_tokens: int = 8192,
        system: Optional[str] = None,
    ) -> AsyncIterator[Dict]:
        try:
            full_messages = []
            if system:
                full_messages.append({"role": "system", "content": system})
            full_messages.extend(messages)

            logger.info(f"Calling Ollama with model: {model}, messages: {len(full_messages)}")

            total_content = ""
            input_tokens = 0
            output_tokens = 0

            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json={
                        "model": model,
                        "messages": full_messages,
                        "stream": True,
                        "options": {"num_predict": max_tokens},
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        chunk = json.loads(line)
                        if chunk.get("message", {}).get("content"):
                            text = chunk["message"]["content"]
                            total_content += text
                            yield {
                                "type": "content_block_delta",
                                "delta": {"text": text}
                            }
                        if chunk.get("done"):
                            input_tokens = chunk.get("prompt_eval_count", 0)
                            output_tokens = chunk.get("eval_count", 0)

            yield {
                "type": "message_stop",
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                }
            }

        except httpx.ConnectError:
            logger.error("Cannot connect to Ollama. Is it running?")
            yield {
                "type": "error",
                "error": "Cannot connect to Ollama. Make sure it's running at " + self.base_url
            }
        except Exception as e:
            import traceback
            logger.error(f"Error in Ollama stream: {e}\n{traceback.format_exc()}")
            yield {
                "type": "error",
                "error": f"{type(e).__name__}: {str(e)}"
            }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "llama3",
        max_tokens: int = 8192,
        system: Optional[str] = None,
    ) -> Dict:
        try:
            full_messages = []
            if system:
                full_messages.append({"role": "system", "content": system})
            full_messages.extend(messages)

            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": model,
                        "messages": full_messages,
                        "stream": False,
                        "options": {"num_predict": max_tokens},
                    },
                )
                response.raise_for_status()
                data = response.json()

            content = data.get("message", {}).get("content", "")
            input_tokens = data.get("prompt_eval_count", 0)
            output_tokens = data.get("eval_count", 0)

            return {
                "content": content,
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                },
                "model": model,
                "stop_reason": "end_turn",
            }

        except Exception as e:
            logger.error(f"Error in Ollama chat: {e}")
            raise

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]
                if models:
                    return models
        except Exception as e:
            logger.warning(f"Could not fetch Ollama models: {e}")

        return ["llama3", "mistral", "codellama"]

    def calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        return 0.0
