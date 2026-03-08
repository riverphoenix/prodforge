import { useState, useEffect } from 'react';
import { FrameworkDefinition } from '../lib/types';
import { frameworkDefsAPI } from '../lib/ipc';
import { invalidateCache } from '../lib/frameworks';
import PromptEditor from './PromptEditor';

interface FrameworkCustomizerProps {
  framework: FrameworkDefinition;
  onClose: () => void;
  onSaved: (updated: FrameworkDefinition) => void;
}

export default function FrameworkCustomizer({
  framework,
  onClose,
  onSaved,
}: FrameworkCustomizerProps) {
  const [systemPrompt, setSystemPrompt] = useState(framework.system_prompt);
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([...framework.guiding_questions]);
  const [exampleOutput, setExampleOutput] = useState(framework.example_output);
  const [showExample, setShowExample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSystemPrompt(framework.system_prompt);
    setGuidingQuestions([...framework.guiding_questions]);
    setExampleOutput(framework.example_output);
  }, [framework]);

  const hasChanges =
    systemPrompt !== framework.system_prompt ||
    JSON.stringify(guidingQuestions) !== JSON.stringify(framework.guiding_questions) ||
    exampleOutput !== framework.example_output;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await frameworkDefsAPI.update(framework.id, {
        systemPrompt,
        guidingQuestions,
        exampleOutput,
      });
      invalidateCache();
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!framework.is_builtin) return;
    setResetting(true);
    setError(null);
    try {
      const restored = await frameworkDefsAPI.reset(framework.id);
      invalidateCache();
      setSystemPrompt(restored.system_prompt);
      setGuidingQuestions([...restored.guiding_questions]);
      setExampleOutput(restored.example_output);
      onSaved(restored);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setResetting(false);
    }
  };

  const handleAddQuestion = () => {
    setGuidingQuestions([...guidingQuestions, '']);
  };

  const handleRemoveQuestion = (index: number) => {
    setGuidingQuestions(guidingQuestions.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...guidingQuestions];
    updated[index] = value;
    setGuidingQuestions(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/95" onClick={onClose} />
      <div className="w-[600px] bg-codex-bg border-l border-codex-border flex flex-col h-full overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-codex-border bg-codex-surface/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{framework.icon}</span>
              <div>
                <h2 className="text-sm font-semibold text-codex-text-primary">{framework.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {framework.is_builtin && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-codex-accent/20 text-codex-accent rounded">
                      Built-in
                    </span>
                  )}
                  {hasChanges && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                      Modified
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-medium text-codex-text-secondary mb-2">
              System Prompt
            </label>
            <p className="text-[10px] text-codex-text-muted mb-2">
              Instructions that define how the AI generates this framework output
            </p>
            <PromptEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              height="250px"
            />
          </div>

          {/* Guiding Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-codex-text-secondary">
                Guiding Questions ({guidingQuestions.length})
              </label>
              <button
                onClick={handleAddQuestion}
                className="text-[10px] text-codex-accent hover:text-codex-accent-hover transition-colors"
              >
                + Add Question
              </button>
            </div>
            <p className="text-[10px] text-codex-text-muted mb-2">
              Questions shown to the user to help them provide better context
            </p>
            <div className="space-y-2">
              {guidingQuestions.map((question, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[10px] text-codex-text-muted w-4 text-right flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => handleQuestionChange(idx, e.target.value)}
                    placeholder="Enter a guiding question..."
                    className="flex-1 px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                  <button
                    onClick={() => handleRemoveQuestion(idx)}
                    className="text-xs text-codex-text-muted hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {guidingQuestions.length === 0 && (
                <div className="text-xs text-codex-text-muted text-center py-4 bg-codex-surface/40 rounded">
                  No guiding questions yet
                </div>
              )}
            </div>
          </div>

          {/* Example Output */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-codex-text-secondary">
                Example Output
              </label>
              <button
                onClick={() => setShowExample(!showExample)}
                className="text-[10px] text-codex-text-muted hover:text-codex-text-primary transition-colors"
              >
                {showExample ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <p className="text-[10px] text-codex-text-muted mb-2">
              A reference example appended to the system prompt to guide output format
            </p>
            {showExample && (
              <PromptEditor
                value={exampleOutput}
                onChange={setExampleOutput}
                height="300px"
              />
            )}
            {!showExample && exampleOutput && (
              <div
                onClick={() => setShowExample(true)}
                className="px-3 py-2 bg-codex-surface/40 border border-codex-border rounded text-xs text-codex-text-muted cursor-pointer hover:bg-codex-surface-hover transition-colors"
              >
                {exampleOutput.substring(0, 150)}...
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-codex-border bg-codex-surface/30">
          <div className="flex items-center justify-between">
            <div>
              {framework.is_builtin && (
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors disabled:opacity-50"
                >
                  {resetting ? 'Resetting...' : 'Reset to Default'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
