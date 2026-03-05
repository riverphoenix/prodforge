"""
ProdForge - Python Sidecar Server
FastAPI server for LLM integration and document processing
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import os
import json
import logging

from openai_client import OpenAIClient
from anthropic_client import AnthropicClient
from google_client import GoogleClient
from ollama_client import OllamaClient
from framework_loader import get_framework
from document_parser import parse_document, fetch_url_content, fetch_google_docs_content
from agent_engine import run_agent_stream, cancel_run, test_agent
from team_engine import run_team_stream, cancel_team_run
from scheduler import schedule_manager


def get_client(provider: str, api_key: str, ollama_url: str = None):
    """Create the appropriate LLM client based on provider"""
    if provider == "anthropic":
        return AnthropicClient(api_key=api_key)
    elif provider == "google":
        return GoogleClient(api_key=api_key)
    elif provider == "ollama":
        return OllamaClient(base_url=ollama_url or "http://localhost:11434")
    return OpenAIClient(api_key=api_key)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ProdForge Sidecar", version="1.0.0")

# CORS middleware to allow Tauri frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tauri app origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global OpenAI client instance (can be updated with new API key)
openai_client: Optional[OpenAIClient] = None


# Request/Response Models
class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatRequest(BaseModel):
    project_id: str
    messages: List[ChatMessage]
    conversation_id: Optional[str] = None
    api_key: str
    model: str = "gpt-5"
    max_tokens: int = 4096
    system: Optional[str] = None
    provider: str = "openai"
    ollama_url: Optional[str] = None
    personal_info: Optional[str] = None
    global_context: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    content: str
    usage: Dict[str, int]
    cost: float
    model: str


class FieldSuggestionRequest(BaseModel):
    project_id: str
    template_id: str
    field_id: str
    field_prompt: str
    current_values: Dict[str, Any]
    api_key: str
    system: Optional[str] = None


class ContextDocument(BaseModel):
    id: str
    name: str
    type: str  # 'pdf', 'url', 'google_doc', 'text'
    content: str
    url: Optional[str] = None


class GenerateFrameworkRequest(BaseModel):
    project_id: str
    framework_id: str
    framework_definition: Optional[Dict[str, Any]] = None
    context_documents: List[ContextDocument]
    user_prompt: str
    api_key: str
    model: str = "gpt-5"
    provider: str = "openai"
    ollama_url: Optional[str] = None
    personal_info: Optional[str] = None
    global_context: Optional[str] = None


def build_context_prefix(personal_info: Optional[str] = None, global_context: Optional[str] = None) -> str:
    parts = []
    if personal_info:
        parts.append(f"## About the User\n{personal_info}")
    if global_context:
        parts.append(f"## Global Instructions\n{global_context}")
    return "\n\n".join(parts)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "ProdForge Sidecar",
        "version": "0.1.0"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/models")
async def list_models(api_key: str):
    """
    Get list of available OpenAI models

    Returns list of model IDs that the API key has access to
    """
    try:
        client = OpenAIClient(api_key=api_key)
        models = await client.list_models()
        logger.info(f"Returning {len(models)} available models")
        return {"models": models}
    except Exception as e:
        logger.error(f"Error listing models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models/{provider}")
async def list_provider_models(provider: str, api_key: str = "", ollama_url: str = "http://localhost:11434"):
    """Get available models for a specific provider"""
    try:
        client = get_client(provider, api_key, ollama_url)
        models = await client.list_models()
        return {"provider": provider, "models": models}
    except Exception as e:
        logger.error(f"Error listing {provider} models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Chat with AI provider (non-streaming)

    Returns complete response with usage and cost information
    """
    try:
        client = get_client(request.provider, request.api_key, request.ollama_url)

        logger.info(f"Chat request for project {request.project_id} with {len(request.messages)} messages")

        # Convert messages to dict format
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        # Call OpenAI API
        response = await client.chat(
            messages=messages,
            model=request.model,
            max_tokens=request.max_tokens,
            system=request.system
        )

        # Calculate cost
        cost = client.calculate_cost(
            input_tokens=response["usage"]["input_tokens"],
            output_tokens=response["usage"]["output_tokens"],
            model=response["model"]
        )

        # Generate conversation ID if not provided
        conversation_id = request.conversation_id or f"conv-{os.urandom(8).hex()}"

        return ChatResponse(
            conversation_id=conversation_id,
            content=response["content"],
            usage=response["usage"],
            cost=cost,
            model=response["model"]
        )

    except Exception as e:
        logger.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream chat responses from AI provider

    Returns a Server-Sent Events (SSE) stream of tokens as they are generated
    """
    async def generate():
        try:
            client = get_client(request.provider, request.api_key, request.ollama_url)

            logger.info(f"Stream request for project {request.project_id} with {len(request.messages)} messages")

            # Convert messages to dict format
            messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

            # Generate conversation ID if not provided
            conversation_id = request.conversation_id or f"conv-{os.urandom(8).hex()}"

            # Send conversation ID first
            yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conversation_id})}\n\n"

            # Build system message with context
            system = request.system or ""
            context_prefix = build_context_prefix(request.personal_info, request.global_context)
            if context_prefix:
                system = f"{context_prefix}\n\n{system}" if system else context_prefix

            # Stream from OpenAI API
            async for chunk in client.chat_stream(
                messages=messages,
                model=request.model,
                max_tokens=request.max_tokens,
                system=system or None
            ):
                # Add cost calculation to message_stop events
                if chunk.get("type") == "message_stop" and "usage" in chunk:
                    cost = client.calculate_cost(
                        input_tokens=chunk["usage"]["input_tokens"],
                        output_tokens=chunk["usage"]["output_tokens"],
                        model=request.model
                    )
                    chunk["cost"] = cost

                yield f"data: {json.dumps(chunk)}\n\n"

        except Exception as e:
            logger.error(f"Error in stream: {e}")
            simplified_error = str(e)
            if request.provider == "openai":
                try:
                    simplified_error = await client.simplify_error_message(str(e))
                except:
                    pass
            yield f"data: {json.dumps({'type': 'error', 'error': simplified_error})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/suggest-field")
async def suggest_field(request: FieldSuggestionRequest):
    """
    Generate AI suggestion for a single template field

    Uses project context + current field values + field-specific prompt
    to provide contextually relevant suggestions
    """
    try:
        client = OpenAIClient(api_key=request.api_key)

        # Build context message from current field values
        context_parts = []
        for key, value in request.current_values.items():
            if value and str(value).strip():
                # Format nicely for context
                field_label = key.replace('_', ' ').title()
                context_parts.append(f"{field_label}: {value}")

        context = "\n".join(context_parts) if context_parts else "No context available yet"

        # Build system prompt
        system_prompt = f"""You are helping a Product Manager fill out a {request.template_id.replace('-', ' ').title()} template.

Guidelines:
- Be concise and specific (1-3 sentences max)
- Provide only the suggested value, not explanations or meta-commentary
- Base your suggestion on the context provided
- Use professional PM language
- For numbers, provide just the number
- For text fields, provide clear, actionable text"""

        # Build user prompt with context and task
        user_prompt = f"""Current template values:
{context}

Task: {request.field_prompt}

Provide a concise, professional suggestion:"""

        # Call OpenAI with smaller, faster model for suggestions
        response = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="gpt-5-mini",  # Use cheaper, faster model
            max_tokens=200  # Keep responses short
        )

        suggestion = response["content"].strip()

        # Clean up common AI verbosity
        # Remove phrases like "Here's a suggestion:" or "I would suggest:"
        unwanted_prefixes = [
            "here's a suggestion:",
            "i would suggest:",
            "suggestion:",
            "my suggestion is:",
            "i suggest:",
            "how about:",
        ]
        suggestion_lower = suggestion.lower()
        for prefix in unwanted_prefixes:
            if suggestion_lower.startswith(prefix):
                suggestion = suggestion[len(prefix):].strip()
                break

        return {"suggestion": suggestion}

    except Exception as e:
        logger.error(f"Error in suggest_field: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-framework")
async def generate_framework(request: GenerateFrameworkRequest):
    """
    Generate a complete PM framework output using AI

    This endpoint:
    1. Loads the framework definition (system prompt, example, questions)
    2. Assembles context from provided documents
    3. Calls OpenAI with framework-specific instructions
    4. Returns the generated framework output in markdown format

    Returns a JSON response (non-streaming for now)
    """
    try:
        logger.info(f"Generate framework request: {request.framework_id} for project {request.project_id}")

        # Use provided definition or load from file
        framework = request.framework_definition or get_framework(request.framework_id)
        if not framework:
            raise HTTPException(
                status_code=404,
                detail=f"Framework '{request.framework_id}' not found"
            )

        client = get_client(request.provider, request.api_key, request.ollama_url)

        # Assemble context from documents
        context_sections = []
        for doc in request.context_documents:
            doc_header = f"## Document: {doc.name}"
            if doc.type == 'url' and doc.url:
                doc_header += f"\nSource: {doc.url}"
            elif doc.type == 'pdf':
                doc_header += f"\n(PDF document)"

            context_sections.append(f"{doc_header}\n\n{doc.content}")

        assembled_context = "\n\n---\n\n".join(context_sections) if context_sections else "No context documents provided."

        system_prompt = framework.get("system_prompt", "")
        if framework.get("example_output"):
            system_prompt += f"\n\n## Example Output Format:\n\n{framework['example_output']}"

        user_prompt_parts = [
            "# Context Documents",
            assembled_context,
            "",
            "# Task",
            request.user_prompt or f"Generate a {framework['name']} based on the context provided above.",
        ]

        if len(request.user_prompt) < 50 and framework.get("guiding_questions"):
            user_prompt_parts.append("\n## Consider These Questions:")
            for question in framework["guiding_questions"]:
                user_prompt_parts.append(f"- {question}")

        user_prompt = "\n".join(user_prompt_parts)

        logger.info(f"Calling {request.provider} with model {request.model}")
        logger.info(f"Context size: {len(assembled_context)} chars, User prompt: {len(request.user_prompt)} chars")

        response = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=request.model,
            max_tokens=100000  # Generous limit for comprehensive frameworks
        )

        # Calculate cost
        cost = client.calculate_cost(
            input_tokens=response["usage"]["input_tokens"],
            output_tokens=response["usage"]["output_tokens"],
            model=response["model"]
        )

        total_tokens = response["usage"]["input_tokens"] + response["usage"]["output_tokens"]
        logger.info(f"Framework generated successfully. Tokens: {total_tokens}, Cost: ${cost:.4f}")

        return {
            "framework_id": request.framework_id,
            "generated_content": response["content"],
            "usage": response["usage"],
            "cost": cost,
            "model": response["model"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in generate_framework: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-framework/stream")
async def generate_framework_stream(request: GenerateFrameworkRequest):
    """
    Generate a complete PM framework output using AI (streaming version)

    Same as /generate-framework but streams the response token-by-token
    using Server-Sent Events (SSE)
    """
    async def generate():
        try:
            logger.info(f"Stream generate framework: {request.framework_id} for project {request.project_id}")

            # Use provided definition or load from file
            framework = request.framework_definition or get_framework(request.framework_id)
            if not framework:
                yield f"data: {json.dumps({'type': 'error', 'error': f'Framework {request.framework_id} not found'})}\n\n"
                return

            client = get_client(request.provider, request.api_key, request.ollama_url)

            context_sections = []
            for doc in request.context_documents:
                doc_header = f"## Document: {doc.name}"
                if doc.type == 'url' and doc.url:
                    doc_header += f"\nSource: {doc.url}"
                elif doc.type == 'pdf':
                    doc_header += f"\n(PDF document)"

                context_sections.append(f"{doc_header}\n\n{doc.content}")

            assembled_context = "\n\n---\n\n".join(context_sections) if context_sections else "No context documents provided."

            # Build system prompt
            system_prompt = framework.get("system_prompt", "")
            if framework.get("example_output"):
                system_prompt += f"\n\n## Example Output Format:\n\n{framework['example_output']}"

            context_prefix = build_context_prefix(request.personal_info, request.global_context)
            if context_prefix:
                system_prompt = f"{context_prefix}\n\n{system_prompt}" if system_prompt else context_prefix

            # Build user prompt
            user_prompt_parts = [
                "# Context Documents",
                assembled_context,
                "",
                "# Task",
                request.user_prompt or f"Generate a {framework['name']} based on the context provided above.",
            ]

            if len(request.user_prompt) < 50 and framework.get("guiding_questions"):
                user_prompt_parts.append("\n## Consider These Questions:")
                for question in framework["guiding_questions"]:
                    user_prompt_parts.append(f"- {question}")

            user_prompt = "\n".join(user_prompt_parts)

            logger.info(f"Streaming from OpenAI with model {request.model}")

            # Stream from OpenAI
            async for chunk in client.chat_stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=request.model,
                max_tokens=100000
            ):
                # Add cost calculation to message_stop events
                if chunk.get("type") == "message_stop" and "usage" in chunk:
                    cost = client.calculate_cost(
                        input_tokens=chunk["usage"]["input_tokens"],
                        output_tokens=chunk["usage"]["output_tokens"],
                        model=request.model
                    )
                    chunk["cost"] = cost

                yield f"data: {json.dumps(chunk)}\n\n"

        except Exception as e:
            logger.error(f"Error in generate_framework_stream: {e}")
            simplified_error = str(e)
            if request.provider == "openai":
                try:
                    simplified_error = await client.simplify_error_message(str(e))
                except:
                    pass
            yield f"data: {json.dumps({'type': 'error', 'error': simplified_error})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


class FrameworkOutputSummary(BaseModel):
    name: str
    category: str
    framework_id: Optional[str] = None
    created_at: Optional[int] = None


class ContextDocSummary(BaseModel):
    name: str
    type: str


class InsightsRequest(BaseModel):
    project_id: str
    project_name: str
    framework_outputs: List[FrameworkOutputSummary]
    context_documents: List[ContextDocSummary]
    conversation_count: int = 0
    total_tokens_used: int = 0
    api_key: str
    model: str = "gpt-5-mini"


@app.post("/insights/generate")
async def generate_insights(request: InsightsRequest):
    try:
        client = OpenAIClient(api_key=request.api_key)

        outputs_desc = "\n".join(
            f"- {o.name} (category: {o.category})" for o in request.framework_outputs
        ) or "None"

        docs_desc = "\n".join(
            f"- {d.name} (type: {d.type})" for d in request.context_documents
        ) or "None"

        system_prompt = """You are a Product Management advisor analyzing a PM project's current state.
Based on the project metadata, generate actionable insights. Return ONLY a JSON object with an "insights" array.
Each insight must have: type (suggestion|pattern|next_step), title (short), description (1-2 sentences), priority (high|medium|low).
For next_step insights, optionally include framework_id if you can suggest a specific framework.
Generate 3-5 insights. Focus on gaps, patterns, and logical next steps."""

        user_prompt = f"""Project: {request.project_name}

Framework Outputs ({len(request.framework_outputs)}):
{outputs_desc}

Context Documents ({len(request.context_documents)}):
{docs_desc}

Conversations: {request.conversation_count}

Analyze this project and suggest insights."""

        response = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=request.model,
            max_tokens=2000
        )

        content = response["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]

        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            result = {"insights": []}

        return result

    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/parse-url")
async def parse_url(url: str):
    """
    Fetch and extract text content from a URL

    Supports:
    - HTML pages (extracts main content)
    - PDF URLs (extracts text)
    - Google Docs public links (exports as text)

    Returns extracted content and title
    """
    try:
        logger.info(f"Parsing URL: {url}")

        # Check if it's a Google Docs URL
        if 'docs.google.com' in url or 'drive.google.com' in url:
            result = fetch_google_docs_content(url)
        else:
            result = fetch_url_content(url)

        return {
            "success": True,
            "content": result['content'],
            "title": result['title'],
            "type": result.get('type', 'unknown'),
            "url": url
        }

    except Exception as e:
        logger.error(f"Error parsing URL: {e}")
        raise HTTPException(status_code=400, detail=str(e))


class FetchUrlRequest(BaseModel):
    url: str


@app.post("/fetch-url")
async def fetch_url(request: FetchUrlRequest):
    """
    Fetch content from a URL

    Simple wrapper around parse_url that accepts JSON body
    """
    try:
        logger.info(f"Fetching URL: {request.url}")

        # Check if it's a Google Docs URL
        if 'docs.google.com' in request.url or 'drive.google.com' in request.url:
            result = fetch_google_docs_content(request.url)
        else:
            result = fetch_url_content(request.url)

        return {
            "success": True,
            "content": result['content'],
            "title": result.get('title', ''),
            "type": result.get('type', 'unknown')
        }

    except Exception as e:
        logger.error(f"Error fetching URL: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/parse-pdf")
async def parse_pdf(request: Request):
    """
    Extract text from PDF bytes

    Expects raw PDF bytes in request body

    Returns extracted text
    """
    try:
        pdf_bytes = await request.body()
        logger.info(f"Parsing PDF ({len(pdf_bytes)} bytes)")

        from document_parser import extract_pdf_text
        text = extract_pdf_text(pdf_bytes)

        return {
            "success": True,
            "content": text,
            "size_bytes": len(pdf_bytes),
            "extracted_chars": len(text)
        }

    except Exception as e:
        logger.error(f"Error parsing PDF: {e}")
        raise HTTPException(status_code=400, detail=str(e))


class AgentRunRequest(BaseModel):
    agentId: str
    projectId: str
    prompt: str
    skillId: Optional[str] = None
    model: str = "claude-sonnet-4-20250514"
    provider: str = "anthropic"
    apiKey: str = ""
    maxTokens: int = 4096
    temperature: float = 0.7
    systemPrompt: str = ""
    skillPrompts: Optional[List[str]] = None
    fallbackModel: Optional[str] = None
    memoryEnabled: bool = False


class AgentCancelRequest(BaseModel):
    run_id: str


class AgentTestRequest(BaseModel):
    prompt: str
    model: str = "claude-sonnet-4-20250514"
    provider: str = "anthropic"
    apiKey: str = ""
    systemPrompt: str = ""


@app.post("/agent/run/stream")
async def agent_run_stream(request: AgentRunRequest):
    async def generate():
        try:
            client = get_client(request.provider, request.apiKey)

            async for chunk in run_agent_stream(
                client=client,
                agent_id=request.agentId,
                prompt=request.prompt,
                model=request.model,
                max_tokens=request.maxTokens,
                temperature=request.temperature,
                system_prompt=request.systemPrompt,
                skill_prompts=request.skillPrompts,
                fallback_model=request.fallbackModel,
                memory_enabled=request.memoryEnabled,
            ):
                if chunk.get("type") == "message_stop" and "usage" in chunk:
                    cost = client.calculate_cost(
                        input_tokens=chunk["usage"]["input_tokens"],
                        output_tokens=chunk["usage"]["output_tokens"],
                        model=request.model,
                    )
                    chunk["cost"] = cost

                yield f"data: {json.dumps(chunk)}\n\n"

        except Exception as e:
            logger.error(f"Error in agent stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/agent/run/cancel")
async def agent_run_cancel(request: AgentCancelRequest):
    success = cancel_run(request.run_id)
    return {"success": success}


@app.post("/agent/test")
async def agent_test(request: AgentTestRequest):
    try:
        client = get_client(request.provider, request.apiKey)
        response = await test_agent(
            client=client,
            prompt=request.prompt,
            model=request.model,
            system_prompt=request.systemPrompt,
        )
        return {
            "content": response["content"],
            "usage": response["usage"],
            "model": response["model"],
        }
    except Exception as e:
        logger.error(f"Error in agent test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class TeamNodePayload(BaseModel):
    id: str
    agentId: str
    nodeType: str = "agent"
    role: str = "worker"
    config: str = "{}"
    sortOrder: int = 0


class TeamEdgePayload(BaseModel):
    id: str
    sourceNodeId: str
    targetNodeId: str
    edgeType: str = "data"
    condition: Optional[str] = None
    dataMapping: str = "{}"


class TeamRunRequest(BaseModel):
    teamId: str
    projectId: str
    input: str
    executionMode: str = "sequential"
    nodes: List[TeamNodePayload]
    edges: List[TeamEdgePayload]
    apiKeys: Dict[str, str] = {}


class TeamCancelRequest(BaseModel):
    team_run_id: str


@app.post("/team/run/stream")
async def team_run_stream(request: TeamRunRequest):
    async def generate():
        try:
            team_run_id = f"team-run-{os.urandom(8).hex()}"

            nodes_dicts = [n.model_dump() for n in request.nodes]
            edges_dicts = [e.model_dump() for e in request.edges]

            agent_ids = list(set(n.agentId for n in request.nodes))
            agents_map = {}
            for aid in agent_ids:
                for provider_key, api_key in request.apiKeys.items():
                    if api_key:
                        try:
                            client = get_client(provider_key, api_key)
                            break
                        except Exception:
                            continue
                agents_map[aid] = {"name": aid, "provider": "anthropic", "model": "claude-sonnet-4-20250514", "system_instructions": ""}

            async for event in run_team_stream(
                get_client_fn=get_client,
                team_run_id=team_run_id,
                input_text=request.input,
                execution_mode=request.executionMode,
                nodes=nodes_dicts,
                edges=edges_dicts,
                agents_map=agents_map,
                api_keys=request.apiKeys,
            ):
                if event.get("type") == "node_complete" and "usage" in event:
                    usage = event["usage"]
                    if usage:
                        event["cost"] = 0.0
                yield f"data: {json.dumps(event)}\n\n"

        except Exception as e:
            logger.error(f"Error in team stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/team/run/cancel")
async def team_run_cancel(request: TeamCancelRequest):
    success = cancel_team_run(request.team_run_id)
    return {"success": success}


class ScheduleSyncRequest(BaseModel):
    schedules: List[Dict[str, Any]]


class ScheduleTriggerRequest(BaseModel):
    schedule_id: str


@app.post("/scheduler/sync")
async def scheduler_sync(request: ScheduleSyncRequest):
    await schedule_manager.sync_schedules(request.schedules)
    return {"success": True, "count": len(request.schedules)}


@app.post("/scheduler/start")
async def scheduler_start():
    schedule_manager.start()
    return {"success": True}


@app.post("/scheduler/stop")
async def scheduler_stop():
    schedule_manager.stop()
    return {"success": True}


@app.post("/scheduler/trigger")
async def scheduler_trigger(request: ScheduleTriggerRequest):
    await schedule_manager.trigger_now(request.schedule_id)
    return {"success": True}


if __name__ == "__main__":
    # Run the server
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=port,
        reload=True,
        log_level="info"
    )
