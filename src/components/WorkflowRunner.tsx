import { useState, useEffect, useRef } from 'react';
import { WorkflowStepDef, FrameworkDefinition } from '../lib/types';
import { workflowsAPI, contextDocumentsAPI, settingsAPI, frameworkOutputsAPI } from '../lib/ipc';
import MarkdownWithMermaid from './MarkdownWithMermaid';

interface WorkflowRunnerProps {
  projectId: string;
  workflowId: string;
  apiKey: string | null;
  frameworks: FrameworkDefinition[];
  onDone: () => void;
  onTabChange: (tab: string) => void;
}

interface StepState {
  def: WorkflowStepDef;
  framework: FrameworkDefinition | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  error: string | null;
  dbStepId: string | null;
}

export default function WorkflowRunner({ projectId, workflowId, apiKey, frameworks, onDone, onTabChange }: WorkflowRunnerProps) {
  const [workflowName, setWorkflowName] = useState('');
  const [stepStates, setStepStates] = useState<StepState[]>([]);
  const [_runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedStep, setSelectedStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  const loadWorkflow = async () => {
    try {
      const wf = await workflowsAPI.get(workflowId);
      setWorkflowName(wf.name);
      const steps: WorkflowStepDef[] = JSON.parse(wf.steps);
      setStepStates(steps.map(def => ({
        def,
        framework: frameworks.find(f => f.id === def.framework_id) || null,
        status: 'pending',
        output: '',
        error: null,
        dbStepId: null,
      })));
    } catch (err) {
      console.error('Failed to load workflow:', err);
    }
  };

  const buildPrompt = (step: WorkflowStepDef, prevOutput: string) => {
    if (!step.prompt_template) return prevOutput || 'Please analyze this topic.';
    return step.prompt_template.replace(/\{prev_output\}/g, prevOutput);
  };

  const streamStep = async (
    stepIndex: number,
    prompt: string,
    framework: FrameworkDefinition,
    contextDocIds: string[],
    model: string,
    signal: AbortSignal
  ): Promise<string> => {
    let contextDocuments: { name: string; content: string }[] = [];
    if (contextDocIds.length > 0) {
      const docs = await Promise.all(contextDocIds.map(id => contextDocumentsAPI.get(id).catch(() => null)));
      contextDocuments = docs.filter(Boolean).map(d => ({ name: d!.name, content: d!.content }));
    }

    const settings = await settingsAPI.get();

    let response: Response;
    try {
      response = await fetch('http://127.0.0.1:8001/generate-framework/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          project_id: projectId,
          framework_id: framework.id,
          framework_definition: {
            id: framework.id,
            name: framework.name,
            system_prompt: framework.system_prompt,
            guiding_questions: framework.guiding_questions,
            example_output: framework.example_output,
          },
          context_documents: contextDocuments,
          user_prompt: prompt,
          api_key: apiKey,
          model,
          provider: settings?.default_provider || 'openai',
          user_profile: settings ? {
            name: settings.name,
            surname: settings.surname,
            job_title: settings.job_title,
            company: settings.company,
            about_me: settings.about_me,
            about_role: settings.about_role,
          } : undefined,
        }),
      });
    } catch (fetchErr) {
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') throw fetchErr;
      throw new Error('Cannot connect to AI server. The server may still be starting — please wait a few seconds and try again.');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Server error (${response.status}): ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let content = '';

    while (true) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.substring(6));
          if (event.type === 'content_block_delta' && event.delta?.text) {
            content += event.delta.text;
            setStepStates(prev => prev.map((s, i) =>
              i === stepIndex ? { ...s, output: content } : s
            ));
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Generation failed');
          }
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    return content;
  };

  const handleRun = async () => {
    if (!apiKey) return;
    setRunning(true);
    setDone(false);

    abortControllerRef.current = new AbortController();

    try {
      const run = await workflowsAPI.createRun(workflowId, projectId);
      setRunId(run.id);
      await workflowsAPI.updateRunStatus(run.id, 'running');

      let prevOutput = '';

      for (let i = 0; i < stepStates.length; i++) {
        if (abortControllerRef.current.signal.aborted) break;

        const state = stepStates[i];
        setSelectedStep(i);

        const dbStep = await workflowsAPI.createRunStep(run.id, i, state.def.framework_id);
        setStepStates(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'running', dbStepId: dbStep.id } : s
        ));
        await workflowsAPI.updateRunStep(dbStep.id, 'running');

        try {
          const prompt = buildPrompt(state.def, prevOutput);
          const fw = state.framework || frameworks.find(f => f.id === state.def.framework_id);
          if (!fw) throw new Error(`Framework ${state.def.framework_id} not found`);

          const output = await streamStep(
            i,
            prompt,
            fw,
            state.def.context_doc_ids,
            state.def.model,
            abortControllerRef.current.signal,
          );

          prevOutput = output;
          setStepStates(prev => prev.map((s, idx) =>
            idx === i ? { ...s, status: 'completed', output } : s
          ));
          await workflowsAPI.updateRunStep(dbStep.id, 'completed', output);
        } catch (err) {
          if (abortControllerRef.current.signal.aborted) break;
          const errorMsg = err instanceof Error ? err.message : String(err);
          setStepStates(prev => prev.map((s, idx) =>
            idx === i ? { ...s, status: 'failed', error: errorMsg } : s
          ));
          await workflowsAPI.updateRunStep(dbStep.id, 'failed', undefined, undefined, errorMsg);
          await workflowsAPI.updateRunStatus(run.id, 'failed');
          setRunning(false);
          setDone(true);
          return;
        }
      }

      if (!abortControllerRef.current.signal.aborted) {
        await workflowsAPI.updateRunStatus(run.id, 'completed');
      } else {
        await workflowsAPI.updateRunStatus(run.id, 'cancelled');
      }
    } catch (err) {
      console.error('Workflow run failed:', err);
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSaveAllOutputs = async () => {
    setSaving(true);
    try {
      for (const state of stepStates) {
        if (state.status !== 'completed' || !state.output) continue;
        await frameworkOutputsAPI.create(
          projectId,
          state.def.framework_id,
          state.framework?.category || 'general',
          `${workflowName} - ${state.def.label}`,
          state.def.prompt_template,
          state.def.context_doc_ids,
          state.output,
          'markdown',
        );
      }
      onTabChange('outputs');
      onDone();
    } catch (err) {
      console.error('Failed to save outputs:', err);
    } finally {
      setSaving(false);
    }
  };

  const completedCount = stepStates.filter(s => s.status === 'completed').length;
  const failedCount = stepStates.filter(s => s.status === 'failed').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-5 py-3 border-b border-codex-border bg-codex-surface/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onDone} className="text-xs text-codex-text-secondary hover:text-codex-text-primary">
            ← Back
          </button>
          <h2 className="text-sm font-semibold text-codex-text-primary">{workflowName}</h2>
          {running && (
            <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded animate-pulse">Running...</span>
          )}
          {done && !running && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${failedCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
              {failedCount > 0 ? `${failedCount} failed` : 'Complete'}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!running && !done && (
            <button
              onClick={handleRun}
              disabled={!apiKey || stepStates.length === 0}
              className="px-3 py-1.5 bg-codex-accent text-white rounded text-xs hover:bg-codex-accent/80 disabled:opacity-50"
            >
              Run Workflow
            </button>
          )}
          {running && (
            <button
              onClick={handleStop}
              className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
            >
              Stop
            </button>
          )}
          {done && completedCount > 0 && (
            <button
              onClick={handleSaveAllOutputs}
              disabled={saving}
              className="px-3 py-1.5 bg-codex-accent text-white rounded text-xs hover:bg-codex-accent/80 disabled:opacity-50"
            >
              {saving ? 'Saving...' : `Save ${completedCount} Output${completedCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-codex-border overflow-y-auto p-3 space-y-1">
          {stepStates.map((state, index) => (
            <button
              key={index}
              onClick={() => setSelectedStep(index)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all ${
                selectedStep === index
                  ? 'bg-codex-accent/10 border border-codex-accent/30'
                  : 'hover:bg-codex-surface/60 border border-transparent'
              }`}
            >
              <div className="flex-shrink-0">
                {state.status === 'pending' && (
                  <div className="w-4 h-4 rounded-full border-2 border-codex-border" />
                )}
                {state.status === 'running' && (
                  <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                )}
                {state.status === 'completed' && (
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                    <span className="text-[8px] text-white">✓</span>
                  </div>
                )}
                {state.status === 'failed' && (
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-[8px] text-white">×</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-codex-text-primary truncate">
                  {state.framework?.icon || '?'} {state.def.label}
                </div>
                <div className="text-[10px] text-codex-text-muted">{state.def.model}</div>
              </div>
              {index > 0 && state.def.prompt_template.includes('{prev_output}') && (
                <span className="text-[8px] text-codex-accent">⟵</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {stepStates[selectedStep] && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-codex-text-primary mb-1">
                  Step {selectedStep + 1}: {stepStates[selectedStep].def.label}
                </h3>
                <p className="text-[10px] text-codex-text-muted">
                  Framework: {stepStates[selectedStep].framework?.name || stepStates[selectedStep].def.framework_id}
                </p>
              </div>

              {stepStates[selectedStep].error && (
                <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                  <p className="text-xs text-red-400">{stepStates[selectedStep].error}</p>
                </div>
              )}

              {stepStates[selectedStep].output ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <MarkdownWithMermaid content={stepStates[selectedStep].output} />
                </div>
              ) : stepStates[selectedStep].status === 'running' ? (
                <div className="flex items-center gap-2 text-xs text-codex-text-secondary">
                  <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  Generating...
                </div>
              ) : stepStates[selectedStep].status === 'pending' ? (
                <div className="text-xs text-codex-text-muted">
                  {!running && !done ? 'Click "Run Workflow" to start.' : 'Waiting for previous steps...'}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
