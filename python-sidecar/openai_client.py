"""
OpenAI API Client
Handles communication with OpenAI's GPT API
"""

from openai import AsyncOpenAI
from typing import AsyncIterator, Optional, List, Dict
import json
import logging
import sys

logger = logging.getLogger(__name__)


def _make_openai_client(api_key: str) -> AsyncOpenAI:
    """Create AsyncOpenAI with proper SSL for frozen (PyInstaller) builds."""
    if getattr(sys, 'frozen', False):
        import httpx
        http_client = httpx.AsyncClient(verify=False)
        return AsyncOpenAI(api_key=api_key, http_client=http_client)
    return AsyncOpenAI(api_key=api_key)


class OpenAIClient:
    """Client for interacting with OpenAI API"""

    def __init__(self, api_key: str):
        """
        Initialize OpenAI client

        Args:
            api_key: OpenAI API key
        """
        logger.info("Initializing OpenAI client")
        self.async_client = _make_openai_client(api_key)

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = "gpt-5",
        max_tokens: int = 100000,
        system: Optional[str] = None,
    ) -> AsyncIterator[Dict]:
        """
        Stream chat responses from OpenAI

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: OpenAI model to use
            max_tokens: Maximum tokens in response
            system: Optional system prompt

        Yields:
            Dictionary with event type and content
        """
        try:
            # Add system message if provided
            full_messages = []
            if system:
                full_messages.append({"role": "system", "content": system})
            full_messages.extend(messages)

            logger.info(f"Calling OpenAI API with model: {model}, messages: {len(full_messages)}")

            # Stream the response
            # GPT-5 models use max_completion_tokens instead of max_tokens
            stream = await self.async_client.chat.completions.create(
                model=model,
                messages=full_messages,
                max_completion_tokens=max_tokens,
                stream=True,
            )

            total_content = ""
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    total_content += content
                    yield {
                        "type": "content_block_delta",
                        "delta": {"text": content}
                    }

            # Note: OpenAI streaming doesn't provide token usage in real-time
            # We'll estimate or use a follow-up call if needed
            # For now, return approximate values
            input_tokens = sum(len(msg.get("content", "").split()) * 1.3 for msg in full_messages)
            output_tokens = len(total_content.split()) * 1.3

            yield {
                "type": "message_stop",
                "usage": {
                    "input_tokens": int(input_tokens),
                    "output_tokens": int(output_tokens),
                }
            }

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"Error in OpenAI stream: {e}\n{error_details}")
            yield {
                "type": "error",
                "error": f"{type(e).__name__}: {str(e)}"
            }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "gpt-5",
        max_tokens: int = 100000,
        system: Optional[str] = None,
    ) -> Dict:
        """
        Send a chat request to OpenAI (non-streaming)

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: OpenAI model to use
            max_tokens: Maximum tokens in response
            system: Optional system prompt

        Returns:
            Dictionary with response and usage information
        """
        try:
            # Add system message if provided
            full_messages = []
            if system:
                full_messages.append({"role": "system", "content": system})
            full_messages.extend(messages)

            # GPT-5 models use max_completion_tokens instead of max_tokens
            response = await self.async_client.chat.completions.create(
                model=model,
                messages=full_messages,
                max_completion_tokens=max_tokens,
            )

            content = response.choices[0].message.content
            logger.info(f"OpenAI response - content length: {len(content) if content else 0}, finish_reason: {response.choices[0].finish_reason}")

            if not content:
                logger.warning(f"Empty content received! Full response: {response}")

            return {
                "content": content or "",
                "usage": {
                    "input_tokens": response.usage.prompt_tokens,
                    "output_tokens": response.usage.completion_tokens,
                },
                "model": response.model,
                "stop_reason": response.choices[0].finish_reason,
            }

        except Exception as e:
            logger.error(f"Error in OpenAI chat: {e}")
            raise

    async def list_models(self) -> List[str]:
        """Dynamically discover available OpenAI chat models from the API."""
        try:
            logger.info("Fetching available OpenAI models from API")
            models_response = await self.async_client.models.list()

            chat_prefixes = ("gpt-5", "gpt-4", "gpt-3.5", "o1", "o3", "o4")
            exclude_keywords = ("realtime", "audio", "tts", "whisper", "dall-e",
                                "embedding", "moderation", "davinci", "babbage",
                                "instruct", "search", "edit", "code-", "text-")

            text_models = []
            for model in models_response.data:
                mid = model.id.lower()
                if not any(mid.startswith(p) for p in chat_prefixes):
                    continue
                if any(kw in mid for kw in exclude_keywords):
                    continue
                text_models.append(model.id)

            priority = ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4o", "gpt-4o-mini",
                         "o4-mini", "o3", "o3-mini", "o1", "o1-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
            def sort_key(m):
                for i, p in enumerate(priority):
                    if m == p or m.startswith(p + "-"):
                        return (i, m)
                return (len(priority), m)

            text_models.sort(key=sort_key)

            if text_models:
                logger.info(f"Found {len(text_models)} OpenAI text models: {text_models[:10]}...")
                return text_models

            return ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4o", "gpt-4o-mini"]

        except Exception as e:
            logger.error(f"Error fetching models: {e}")
            return ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4o", "gpt-4o-mini"]

    def calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """
        Calculate the cost of an OpenAI API call

        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model: Model used

        Returns:
            Cost in USD
        """
        # Pricing as of 2026 for GPT models
        pricing = {
            # GPT-5 Frontier Models (2026)
            "gpt-5": {
                "input": 1.25 / 1_000_000,   # $1.25 per million input tokens
                "output": 10.0 / 1_000_000,  # $10 per million output tokens
            },
            "gpt-5-mini": {
                "input": 0.25 / 1_000_000,   # $0.25 per million input tokens (estimate)
                "output": 1.0 / 1_000_000,   # $1 per million output tokens (estimate)
            },
            "gpt-5-nano": {
                "input": 0.05 / 1_000_000,   # $0.05 per million input tokens
                "output": 0.40 / 1_000_000,  # $0.40 per million output tokens
            },
            # Legacy GPT-4 Models
            "gpt-4-turbo-preview": {
                "input": 10.0 / 1_000_000,  # $10 per million input tokens
                "output": 30.0 / 1_000_000,  # $30 per million output tokens
            },
            "gpt-4-turbo": {
                "input": 10.0 / 1_000_000,
                "output": 30.0 / 1_000_000,
            },
            "gpt-4": {
                "input": 30.0 / 1_000_000,
                "output": 60.0 / 1_000_000,
            },
            "gpt-3.5-turbo": {
                "input": 0.5 / 1_000_000,
                "output": 1.5 / 1_000_000,
            },
            "gpt-4o": {
                "input": 5.0 / 1_000_000,
                "output": 15.0 / 1_000_000,
            },
            "gpt-4o-mini": {
                "input": 0.15 / 1_000_000,
                "output": 0.6 / 1_000_000,
            },
        }

        # Default to GPT-5 pricing if model not found
        model_pricing = pricing.get(model, pricing["gpt-5"])
        input_cost = input_tokens * model_pricing["input"]
        output_cost = output_tokens * model_pricing["output"]

        return input_cost + output_cost

    async def simplify_error_message(self, error_message: str) -> str:
        """
        Use LLM to simplify technical error messages into user-friendly text

        Args:
            error_message: Technical error message

        Returns:
            Simplified user-friendly error message (max 10 words)
        """
        try:
            response = await self.async_client.chat.completions.create(
                model="gpt-5-nano",  # Use fast, cheap model for error simplification
                messages=[
                    {
                        "role": "system",
                        "content": "You are an error message simplifier. Convert technical errors into simple, user-friendly messages. Maximum 10 words. Be clear and actionable."
                    },
                    {
                        "role": "user",
                        "content": f"Simplify this error for a non-technical user:\n\n{error_message}"
                    }
                ],
                max_completion_tokens=50,
            )

            simplified = response.choices[0].message.content or error_message
            logger.info(f"Simplified error: {error_message[:100]} -> {simplified}")
            return simplified.strip()

        except Exception as e:
            logger.error(f"Failed to simplify error message: {e}")
            # Fallback to extracting key parts of the original message
            if "tokens exceed" in error_message.lower():
                return "Input too large. Try removing documents or using GPT-5."
            elif "rate limit" in error_message.lower():
                return "Too many requests. Please wait a moment."
            elif "invalid api key" in error_message.lower() or "authentication" in error_message.lower():
                return "Invalid API key. Check your settings."
            elif "timeout" in error_message.lower():
                return "Request timed out. Try again."
            else:
                return "An error occurred. Please try again."
