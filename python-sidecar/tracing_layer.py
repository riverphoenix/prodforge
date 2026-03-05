"""
Tracing Layer - Simple span recording for agent and team execution observability.
"""

import os
import time
from typing import Optional, List, Dict, Any


class SpanContext:
    def __init__(
        self,
        run_id: str,
        span_name: str,
        span_kind: str = "agent",
        run_type: str = "agent",
        parent_span_id: Optional[str] = None,
        input_text: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.id = f"span-{os.urandom(8).hex()}"
        self.parent_span_id = parent_span_id
        self.run_id = run_id
        self.run_type = run_type
        self.span_name = span_name
        self.span_kind = span_kind
        self.input = input_text
        self.output: Optional[str] = None
        self.status = "running"
        self.tokens: Optional[int] = None
        self.cost: Optional[float] = None
        self.metadata = metadata or {}
        self.started_at = int(time.time())
        self.ended_at: Optional[int] = None

    def complete(self, output: str = "", tokens: int = 0, cost: float = 0.0):
        self.output = output
        self.status = "completed"
        self.tokens = tokens
        self.cost = cost
        self.ended_at = int(time.time())

    def fail(self, error: str = ""):
        self.output = error
        self.status = "failed"
        self.ended_at = int(time.time())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "parent_span_id": self.parent_span_id,
            "run_id": self.run_id,
            "run_type": self.run_type,
            "span_name": self.span_name,
            "span_kind": self.span_kind,
            "input": self.input[:2000],
            "output": (self.output or "")[:2000],
            "status": self.status,
            "tokens": self.tokens,
            "cost": self.cost,
            "metadata": self.metadata,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
        }


_span_buffer: List[SpanContext] = []


def record_span(span: SpanContext):
    _span_buffer.append(span)


def get_and_clear_spans() -> List[Dict[str, Any]]:
    global _span_buffer
    spans = [s.to_dict() for s in _span_buffer]
    _span_buffer = []
    return spans


def get_spans_for_run(run_id: str) -> List[Dict[str, Any]]:
    return [s.to_dict() for s in _span_buffer if s.run_id == run_id]
