"""
Agent Engine - Executes agents with composed skill prompts
Uses existing LLM clients for multi-provider streaming support
"""

import json
import os
import logging
import time
from typing import Optional, List, Dict, Any, AsyncIterator

from tracing_layer import SpanContext, record_span

logger = logging.getLogger(__name__)

_active_runs: Dict[str, bool] = {}
_agent_memory: Dict[str, List[Dict[str, str]]] = {}


def build_agent_system_prompt(
    system_instructions: str,
    skill_prompts: Optional[List[str]] = None,
) -> str:
    parts = []

    if system_instructions:
        parts.append(system_instructions)

    if skill_prompts:
        parts.append("\n\n# Available Skills & Expertise\n")
        for i, sp in enumerate(skill_prompts, 1):
            parts.append(f"## Skill {i}\n{sp}\n")

    return "\n".join(parts)


async def run_agent_stream(
    client,
    agent_id: str,
    prompt: str,
    model: str,
    max_tokens: int,
    temperature: float,
    system_prompt: str,
    skill_prompts: Optional[List[str]] = None,
    fallback_model: Optional[str] = None,
    memory_enabled: bool = False,
) -> AsyncIterator[Dict]:
    run_id = f"run-{os.urandom(8).hex()}"
    _active_runs[run_id] = True

    yield {"type": "run_id", "run_id": run_id}

    full_system = build_agent_system_prompt(system_prompt, skill_prompts)

    messages = []
    if memory_enabled and agent_id in _agent_memory:
        messages.extend(_agent_memory[agent_id][-10:])
    messages.append({"role": "user", "content": prompt})

    root_span = SpanContext(
        run_id=run_id,
        span_name=f"agent:{agent_id}",
        span_kind="agent",
        run_type="agent",
        input_text=prompt[:500],
    )

    full_output = ""
    total_tokens = 0

    async def _stream_with_model(m: str) -> AsyncIterator[Dict]:
        nonlocal full_output, total_tokens
        llm_span = SpanContext(
            run_id=run_id,
            span_name=f"llm_call:{m}",
            span_kind="llm",
            run_type="agent",
            parent_span_id=root_span.id,
            input_text=prompt[:500],
        )

        async for chunk in client.chat_stream(
            messages=messages,
            model=m,
            max_tokens=max_tokens,
            system=full_system,
        ):
            if not _active_runs.get(run_id, False):
                logger.info(f"Run {run_id} cancelled")
                llm_span.fail("Cancelled by user")
                record_span(llm_span)
                yield {"type": "error", "error": "Cancelled by user"}
                return

            if chunk.get("type") == "content_block_delta":
                text = chunk.get("delta", {}).get("text", "")
                full_output += text

            if chunk.get("type") == "message_stop":
                usage = chunk.get("usage", {})
                total_tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
                duration_ms = int((time.time() - start_time) * 1000)
                chunk["duration_ms"] = duration_ms
                llm_span.complete(output=full_output[:500], tokens=total_tokens)
                record_span(llm_span)

            yield chunk

    try:
        start_time = time.time()
        used_fallback = False

        try:
            async for chunk in _stream_with_model(model):
                yield chunk
        except Exception as primary_err:
            if fallback_model and fallback_model != model:
                logger.warning(f"Primary model {model} failed, trying fallback {fallback_model}: {primary_err}")
                yield {"type": "fallback", "message": f"Switching to fallback model: {fallback_model}"}
                full_output = ""
                total_tokens = 0
                used_fallback = True
                async for chunk in _stream_with_model(fallback_model):
                    yield chunk
            else:
                raise

        root_span.complete(output=full_output[:500], tokens=total_tokens)
        record_span(root_span)

        if memory_enabled:
            if agent_id not in _agent_memory:
                _agent_memory[agent_id] = []
            _agent_memory[agent_id].append({"role": "user", "content": prompt})
            _agent_memory[agent_id].append({"role": "assistant", "content": full_output[:2000]})
            if len(_agent_memory[agent_id]) > 20:
                _agent_memory[agent_id] = _agent_memory[agent_id][-20:]

        spans = [root_span.to_dict()]
        yield {"type": "trace_spans", "spans": spans}

    except Exception as e:
        logger.error(f"Agent run error: {e}")
        root_span.fail(str(e))
        record_span(root_span)
        yield {"type": "error", "error": str(e)}
    finally:
        _active_runs.pop(run_id, None)


def cancel_run(run_id: str) -> bool:
    if run_id in _active_runs:
        _active_runs[run_id] = False
        return True
    return False


async def test_agent(
    client,
    prompt: str,
    model: str,
    system_prompt: str,
) -> Dict[str, Any]:
    response = await client.chat(
        messages=[
            {"role": "user", "content": prompt}
        ],
        model=model,
        max_tokens=2000,
        system=system_prompt,
    )
    return response
