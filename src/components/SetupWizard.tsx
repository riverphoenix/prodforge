import { useState } from 'react';
import { settingsAPI, projectsAPI } from '../lib/ipc';

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [projectName, setProjectName] = useState('My First Project');
  const [saving, setSaving] = useState(false);

  const steps = ['Welcome', 'API Key', 'Profile', 'First Project'];
  const totalSteps = steps.length;

  const handleFinish = async () => {
    setSaving(true);
    try {
      await settingsAPI.update({
        api_key: apiKey || undefined,
        name: name || undefined,
        job_title: jobTitle || undefined,
        company: company || undefined,
      });
      if (projectName.trim()) {
        await projectsAPI.create(projectName.trim());
      }
      onComplete();
    } catch (err) {
      console.error('Setup failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-codex-bg">
      <div className="max-w-lg w-full mx-4">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i <= step ? 'bg-codex-accent' : 'bg-codex-border'
              }`}
            />
          ))}
        </div>

        <div className="bg-codex-surface rounded-xl border border-codex-border p-8 shadow-2xl">
          {step === 0 && (
            <div className="text-center">
              <div className="text-4xl mb-4">PMKit</div>
              <h1 className="text-2xl font-semibold text-codex-text-primary mb-3">
                Welcome to PMKit
              </h1>
              <p className="text-sm text-codex-text-secondary mb-6 leading-relaxed">
                Your AI-powered product management toolkit. Generate frameworks, manage documents,
                run workflows, and chat with AI — all in one place.
              </p>
              <p className="text-xs text-codex-text-muted">
                Let's get you set up in a few quick steps.
              </p>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-codex-text-primary mb-2">Connect an AI Provider</h2>
              <p className="text-sm text-codex-text-secondary mb-6">
                Add at least one API key to start generating. You can add more providers later in Settings.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-codex-text-muted mb-1.5">OpenAI API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                  <p className="text-[10px] text-codex-text-muted mt-1.5">
                    Get your key from platform.openai.com. Supports Anthropic and Google too — configure in Settings later.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-codex-text-primary mb-2">Tell us about you</h2>
              <p className="text-sm text-codex-text-secondary mb-6">
                This helps the AI personalize its responses to your role.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-codex-text-muted mb-1.5">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-codex-text-muted mb-1.5">Job Title</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Senior Product Manager"
                    className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-codex-text-muted mb-1.5">Company</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc"
                    className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-codex-text-primary mb-2">Create your first project</h2>
              <p className="text-sm text-codex-text-secondary mb-6">
                Projects organize your conversations, documents, and outputs.
              </p>
              <div>
                <label className="block text-xs text-codex-text-muted mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My First Project"
                  className="w-full px-3 py-2 bg-codex-bg border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <div>
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 text-sm text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onComplete}
                className="px-4 py-2 text-xs text-codex-text-muted hover:text-codex-text-secondary transition-colors"
              >
                Skip
              </button>
              {step < totalSteps - 1 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="px-6 py-2 bg-codex-accent hover:bg-codex-accent-hover text-white text-sm rounded-lg transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="px-6 py-2 bg-codex-accent hover:bg-codex-accent-hover disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  {saving ? 'Setting up...' : 'Get Started'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
