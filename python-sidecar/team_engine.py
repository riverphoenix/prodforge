"""
Team Engine - Multi-agent orchestration for sequential, parallel, and conductor execution modes.
Uses existing LLM clients for streaming support.
"""

import asyncio
import json
import os
import logging
import time
from typing import Optional, List, Dict, Any, AsyncIterator, Callable

from tracing_layer import SpanContext, record_span

logger = logging.getLogger(__name__)

_active_team_runs: Dict[str, bool] = {}


def topological_sort(nodes: List[Dict], edges: List[Dict]) -> List[str]:
    node_ids = [n["id"] for n in nodes]
    in_degree = {nid: 0 for nid in node_ids}
    adjacency: Dict[str, List[str]] = {nid: [] for nid in node_ids}

    for e in edges:
        src = e["sourceNodeId"]
        tgt = e["targetNodeId"]
        if src in adjacency and tgt in in_degree:
            adjacency[src].append(tgt)
            in_degree[tgt] += 1

    queue = [nid for nid in node_ids if in_degree[nid] == 0]
    result = []
    while queue:
        queue.sort(key=lambda x: next((n["sortOrder"] for n in nodes if n["id"] == x), 0))
        nid = queue.pop(0)
        result.append(nid)
        for neighbor in adjacency.get(nid, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return result


def get_entry_nodes(nodes: List[Dict], edges: List[Dict]) -> List[str]:
    targets = {e["targetNodeId"] for e in edges}
    return [n["id"] for n in nodes if n["id"] not in targets]


async def run_single_node(
    client,
    node: Dict,
    agent: Dict,
    input_text: str,
    model: str,
    max_tokens: int = 4096,
    parent_span_id: Optional[str] = None,
    span_collector: Optional[List] = None,
    team_run_id: Optional[str] = None,
) -> AsyncIterator[Dict]:
    system = agent.get("system_instructions", "")
    messages = [{"role": "user", "content": input_text}]

    full_output = ""
    usage = {}
    start_time = time.time()

    node_span = SpanContext(
        run_id=team_run_id or "",
        span_name=f"node:{agent.get('name', 'Agent')}",
        span_kind="agent",
        run_type="team",
        parent_span_id=parent_span_id,
        input_text=input_text[:500],
    )

    yield {"type": "node_start", "node_id": node["id"], "agent_id": node["agentId"], "agent_name": agent.get("name", "Agent")}

    try:
        async for chunk in client.chat_stream(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            system=system,
        ):
            if chunk.get("type") == "content_block_delta" and chunk.get("delta", {}).get("text"):
                text = chunk["delta"]["text"]
                full_output += text
                yield {"type": "node_content", "node_id": node["id"], "delta": {"text": text}}
            elif chunk.get("type") == "message_stop":
                usage = chunk.get("usage", {})

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        node_span.fail(str(e))
        record_span(node_span)
        if span_collector is not None:
            span_collector.append(node_span)
        yield {"type": "node_error", "node_id": node["id"], "error": str(e), "duration_ms": duration_ms}
        return

    duration_ms = int((time.time() - start_time) * 1000)
    total_tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
    node_span.complete(output=full_output[:500], tokens=total_tokens)
    record_span(node_span)
    if span_collector is not None:
        span_collector.append(node_span)

    yield {
        "type": "node_complete",
        "node_id": node["id"],
        "output": full_output,
        "usage": usage,
        "duration_ms": duration_ms,
    }


async def run_team_stream(
    get_client_fn: Callable,
    team_run_id: str,
    input_text: str,
    execution_mode: str,
    nodes: List[Dict],
    edges: List[Dict],
    agents_map: Dict[str, Dict],
    api_keys: Dict[str, str],
) -> AsyncIterator[Dict]:
    _active_team_runs[team_run_id] = True
    start_time = time.time()

    root_span = SpanContext(
        run_id=team_run_id,
        span_name=f"team:{execution_mode}",
        span_kind="chain",
        run_type="team",
        input_text=input_text[:500],
    )
    all_spans: List[SpanContext] = [root_span]

    yield {"type": "team_run_id", "team_run_id": team_run_id}

    try:
        if execution_mode == "sequential":
            async for event in _run_sequential(get_client_fn, team_run_id, input_text, nodes, edges, agents_map, api_keys, root_span.id, all_spans):
                yield event
        elif execution_mode == "parallel":
            async for event in _run_parallel(get_client_fn, team_run_id, input_text, nodes, edges, agents_map, api_keys, root_span.id, all_spans):
                yield event
        elif execution_mode == "conductor":
            async for event in _run_conductor(get_client_fn, team_run_id, input_text, nodes, edges, agents_map, api_keys, root_span.id, all_spans):
                yield event
        else:
            yield {"type": "error", "error": f"Unknown execution mode: {execution_mode}"}

        root_span.complete(tokens=sum(s.tokens or 0 for s in all_spans if s != root_span))
        record_span(root_span)

    except Exception as e:
        logger.error(f"Team run error: {e}")
        root_span.fail(str(e))
        record_span(root_span)
        yield {"type": "error", "error": str(e)}

    finally:
        duration_ms = int((time.time() - start_time) * 1000)
        span_dicts = [s.to_dict() for s in all_spans]
        yield {"type": "trace_spans", "spans": span_dicts}
        yield {"type": "team_complete", "team_run_id": team_run_id, "duration_ms": duration_ms}
        _active_team_runs.pop(team_run_id, None)


async def _run_sequential(
    get_client_fn, team_run_id, input_text, nodes, edges, agents_map, api_keys,
    parent_span_id: Optional[str] = None, span_collector: Optional[List] = None,
) -> AsyncIterator[Dict]:
    sorted_ids = topological_sort(nodes, edges)
    node_map = {n["id"]: n for n in nodes}
    current_input = input_text

    for node_id in sorted_ids:
        if not _active_team_runs.get(team_run_id, False):
            yield {"type": "error", "error": "Cancelled by user"}
            return

        node = node_map.get(node_id)
        if not node:
            continue

        agent = agents_map.get(node["agentId"], {})
        provider = agent.get("provider", "anthropic")
        model = agent.get("model", "claude-sonnet-4-20250514")
        client = get_client_fn(provider, api_keys.get(provider, ""))

        node_output = ""
        async for event in run_single_node(client, node, agent, current_input, model, parent_span_id=parent_span_id, span_collector=span_collector, team_run_id=team_run_id):
            yield event
            if event.get("type") == "node_complete":
                node_output = event.get("output", "")

        current_input = node_output if node_output else current_input


async def _run_parallel(
    get_client_fn, team_run_id, input_text, nodes, edges, agents_map, api_keys,
    parent_span_id: Optional[str] = None, span_collector: Optional[List] = None,
) -> AsyncIterator[Dict]:
    entry_ids = get_entry_nodes(nodes, edges)
    node_map = {n["id"]: n for n in nodes}
    queue: asyncio.Queue = asyncio.Queue()

    async def run_node_to_queue(node_id: str, node_input: str):
        node = node_map.get(node_id)
        if not node:
            return ""
        agent = agents_map.get(node["agentId"], {})
        provider = agent.get("provider", "anthropic")
        model = agent.get("model", "claude-sonnet-4-20250514")
        client = get_client_fn(provider, api_keys.get(provider, ""))
        output = ""
        async for event in run_single_node(client, node, agent, node_input, model, parent_span_id=parent_span_id, span_collector=span_collector, team_run_id=team_run_id):
            await queue.put(event)
            if event.get("type") == "node_complete":
                output = event.get("output", "")
        return output

    tasks = [asyncio.create_task(run_node_to_queue(nid, input_text)) for nid in entry_ids]

    done_count = 0
    total = len(tasks)
    while done_count < total:
        if not _active_team_runs.get(team_run_id, False):
            for t in tasks:
                t.cancel()
            yield {"type": "error", "error": "Cancelled by user"}
            return

        try:
            event = await asyncio.wait_for(queue.get(), timeout=0.1)
            yield event
            if event.get("type") in ("node_complete", "node_error"):
                done_count += 1
        except asyncio.TimeoutError:
            finished = [t for t in tasks if t.done()]
            done_count = len(finished)

    outputs = []
    for t in tasks:
        try:
            result = await t
            if result:
                outputs.append(result)
        except Exception:
            pass

    downstream_ids = [n["id"] for n in nodes if n["id"] not in entry_ids]
    if downstream_ids and outputs:
        merged_input = "\n\n---\n\n".join(outputs)
        for node_id in downstream_ids:
            if not _active_team_runs.get(team_run_id, False):
                return
            node = node_map.get(node_id)
            if not node:
                continue
            agent = agents_map.get(node["agentId"], {})
            provider = agent.get("provider", "anthropic")
            model = agent.get("model", "claude-sonnet-4-20250514")
            client = get_client_fn(provider, api_keys.get(provider, ""))
            async for event in run_single_node(client, node, agent, merged_input, model, parent_span_id=parent_span_id, span_collector=span_collector, team_run_id=team_run_id):
                yield event


async def _run_conductor(
    get_client_fn, team_run_id, input_text, nodes, edges, agents_map, api_keys,
    parent_span_id: Optional[str] = None, span_collector: Optional[List] = None,
) -> AsyncIterator[Dict]:
    conductor_node = next((n for n in nodes if n["role"] == "conductor"), None)
    if not conductor_node:
        yield {"type": "error", "error": "No conductor node found. Set one node's role to 'conductor'."}
        return

    worker_nodes = [n for n in nodes if n["id"] != conductor_node["id"]]
    worker_catalog = json.dumps([
        {"node_id": w["id"], "agent_name": agents_map.get(w["agentId"], {}).get("name", "Unknown"), "description": agents_map.get(w["agentId"], {}).get("description", "")}
        for w in worker_nodes
    ], indent=2)

    conductor_agent = agents_map.get(conductor_node["agentId"], {})
    conductor_provider = conductor_agent.get("provider", "anthropic")
    conductor_model = conductor_agent.get("model", "claude-sonnet-4-20250514")
    conductor_client = get_client_fn(conductor_provider, api_keys.get(conductor_provider, ""))

    conductor_system = f"""{conductor_agent.get("system_instructions", "")}

You are the conductor of a team of AI agents. Your job is to delegate tasks to workers and synthesize their outputs.

Available workers:
{worker_catalog}

Respond with JSON in one of these formats:
- To delegate: {{"delegate": "node_id", "input": "task description"}}
- To give final answer: {{"final": "your final synthesized answer"}}

Always delegate to workers before giving a final answer. You can delegate multiple times."""

    conversation = [{"role": "user", "content": input_text}]
    node_map = {n["id"]: n for n in nodes}
    max_iterations = 10

    yield {"type": "node_start", "node_id": conductor_node["id"], "agent_id": conductor_node["agentId"], "agent_name": conductor_agent.get("name", "Conductor")}

    for iteration in range(max_iterations):
        if not _active_team_runs.get(team_run_id, False):
            yield {"type": "error", "error": "Cancelled by user"}
            return

        conductor_output = ""
        async for chunk in conductor_client.chat_stream(
            messages=conversation,
            model=conductor_model,
            max_tokens=4096,
            system=conductor_system,
        ):
            if chunk.get("type") == "content_block_delta" and chunk.get("delta", {}).get("text"):
                conductor_output += chunk["delta"]["text"]
                yield {"type": "node_content", "node_id": conductor_node["id"], "delta": {"text": chunk["delta"]["text"]}}

        conversation.append({"role": "assistant", "content": conductor_output})

        try:
            decision = json.loads(conductor_output.strip())
        except json.JSONDecodeError:
            yield {"type": "node_complete", "node_id": conductor_node["id"], "output": conductor_output}
            break

        if "final" in decision:
            yield {"type": "node_complete", "node_id": conductor_node["id"], "output": decision["final"]}
            break

        if "delegate" in decision:
            worker_node_id = decision["delegate"]
            worker_input = decision.get("input", input_text)
            worker_node = node_map.get(worker_node_id)

            if not worker_node:
                conversation.append({"role": "user", "content": f"Error: node_id '{worker_node_id}' not found. Available: {[n['id'] for n in worker_nodes]}"})
                continue

            worker_agent = agents_map.get(worker_node["agentId"], {})
            worker_provider = worker_agent.get("provider", "anthropic")
            worker_model = worker_agent.get("model", "claude-sonnet-4-20250514")
            worker_client = get_client_fn(worker_provider, api_keys.get(worker_provider, ""))

            worker_output = ""
            async for event in run_single_node(worker_client, worker_node, worker_agent, worker_input, worker_model, parent_span_id=parent_span_id, span_collector=span_collector, team_run_id=team_run_id):
                yield event
                if event.get("type") == "node_complete":
                    worker_output = event.get("output", "")

            conversation.append({"role": "user", "content": f"Worker '{agents_map.get(worker_node['agentId'], {}).get('name', 'Unknown')}' responded:\n{worker_output}"})
        else:
            yield {"type": "node_complete", "node_id": conductor_node["id"], "output": conductor_output}
            break


def cancel_team_run(team_run_id: str) -> bool:
    if team_run_id in _active_team_runs:
        _active_team_runs[team_run_id] = False
        return True
    return False
