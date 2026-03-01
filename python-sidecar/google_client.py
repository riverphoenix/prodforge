"""
Google Gemini API Client
Handles communication with Google's Gemini API
"""

from typing import AsyncIterator, Optional, List, Dict
import logging

logger = logging.getLogger(__name__)


class GoogleClient:
    """Client for interacting with Google Gemini API"""

    def __init__(self, api_key: str):
        logger.info("Initializing Google Gemini client")
        self.api_key = api_key
        try:
            from google import genai
            self.genai = genai
            self.client = genai.Client(api_key=api_key)
        except ImportError:
            logger.warning("google-genai not installed, Google provider unavailable")
            self.genai = None
            self.client = None

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.5-pro",
        max_tokens: int = 8192,
        system: Optional[str] = None,
    ) -> AsyncIterator[Dict]:
        if not self.client:
            yield {"type": "error", "error": "Google AI SDK not installed. Run: pip install google-genai"}
            return

        try:
            contents = []
            for msg in messages:
                if msg["role"] == "system":
                    continue
                role = "user" if msg["role"] == "user" else "model"
                contents.append(self.genai.types.Content(
                    role=role,
                    parts=[self.genai.types.Part(text=msg["content"])]
                ))

            system_text = system or ""
            for msg in messages:
                if msg["role"] == "system":
                    system_text = msg["content"]
                    break

            config = self.genai.types.GenerateContentConfig(
                max_output_tokens=max_tokens,
            )
            if system_text:
                config.system_instruction = system_text

            logger.info(f"Calling Google Gemini API with model: {model}")

            total_content = ""
            response = self.client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            )

            for chunk in response:
                if chunk.text:
                    total_content += chunk.text
                    yield {
                        "type": "content_block_delta",
                        "delta": {"text": chunk.text}
                    }

            input_tokens = int(len(" ".join(m.get("content", "") for m in messages).split()) * 1.3)
            output_tokens = int(len(total_content.split()) * 1.3)

            yield {
                "type": "message_stop",
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                }
            }

        except Exception as e:
            import traceback
            logger.error(f"Error in Google stream: {e}\n{traceback.format_exc()}")
            yield {
                "type": "error",
                "error": f"{type(e).__name__}: {str(e)}"
            }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.5-pro",
        max_tokens: int = 8192,
        system: Optional[str] = None,
    ) -> Dict:
        if not self.client:
            raise RuntimeError("Google AI SDK not installed. Run: pip install google-genai")

        try:
            contents = []
            for msg in messages:
                if msg["role"] == "system":
                    continue
                role = "user" if msg["role"] == "user" else "model"
                contents.append(self.genai.types.Content(
                    role=role,
                    parts=[self.genai.types.Part(text=msg["content"])]
                ))

            system_text = system or ""
            for msg in messages:
                if msg["role"] == "system":
                    system_text = msg["content"]
                    break

            config = self.genai.types.GenerateContentConfig(
                max_output_tokens=max_tokens,
            )
            if system_text:
                config.system_instruction = system_text

            response = self.client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

            content = response.text or ""
            input_tokens = response.usage_metadata.prompt_token_count if response.usage_metadata else 0
            output_tokens = response.usage_metadata.candidates_token_count if response.usage_metadata else 0

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
            logger.error(f"Error in Google chat: {e}")
            raise

    async def list_models(self) -> List[str]:
        """Dynamically discover available Google Gemini text models from the API."""
        if not self.client:
            return ["gemini-2.5-pro", "gemini-2.5-flash"]
        try:
            logger.info("Fetching available Google Gemini models from API")
            models_list = self.client.models.list()

            exclude_keywords = ("embedding", "aqa", "vision", "imagen", "code")
            text_models = []
            for model in models_list:
                name = model.name
                if name.startswith("models/"):
                    name = name[7:]
                mid = name.lower()
                if not mid.startswith("gemini"):
                    continue
                if any(kw in mid for kw in exclude_keywords):
                    continue
                text_models.append(name)

            priority = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0",
                         "gemini-1.5-pro", "gemini-1.5-flash"]
            def sort_key(m):
                for i, p in enumerate(priority):
                    if m.startswith(p):
                        return (i, m)
                return (len(priority), m)

            text_models.sort(key=sort_key)

            if text_models:
                logger.info(f"Found {len(text_models)} Gemini models: {text_models[:10]}...")
                return text_models

            return ["gemini-2.5-pro", "gemini-2.5-flash"]

        except Exception as e:
            logger.error(f"Error fetching Gemini models: {e}")
            return ["gemini-2.5-pro", "gemini-2.5-flash"]

    def calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        pricing = {
            "gemini-2.5-pro": {
                "input": 1.25 / 1_000_000,
                "output": 5.0 / 1_000_000,
            },
            "gemini-2.5-flash": {
                "input": 0.075 / 1_000_000,
                "output": 0.30 / 1_000_000,
            },
        }

        model_pricing = pricing.get(model, pricing["gemini-2.5-pro"])
        return input_tokens * model_pricing["input"] + output_tokens * model_pricing["output"]
