import { useState, useEffect } from 'react';
import { Settings as SettingsType, LLMProvider } from '../lib/types';
import { settingsAPI, modelsAPI } from '../lib/ipc';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

type SettingsTab = 'general' | 'profile' | 'context' | 'usage';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [_settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [profilePic, setProfilePic] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [aboutRole, setAboutRole] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [displayKey, setDisplayKey] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'openai' | 'anthropic' | 'google' | null>(null);

  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [displayAnthropicKey, setDisplayAnthropicKey] = useState('');

  const [googleApiKey, setGoogleApiKey] = useState('');
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [hasGoogleKey, setHasGoogleKey] = useState(false);
  const [displayGoogleKey, setDisplayGoogleKey] = useState('');

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434');
  const [defaultProvider, setDefaultProvider] = useState<LLMProvider>('openai');

  const [testingProvider, setTestingProvider] = useState<LLMProvider | null>(null);
  const [providerTestStatus, setProviderTestStatus] = useState<Record<string, 'none' | 'success' | 'error'>>({});

  const [discoveredModels, setDiscoveredModels] = useState<Record<string, string[]>>({});
  const [enabledModels, setEnabledModels] = useState<Record<string, string[]>>({});
  const [discoveringModels, setDiscoveringModels] = useState<Record<string, boolean>>({});
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [globalContext, setGlobalContext] = useState('');
  const [appPath, setAppPath] = useState('');

  useEffect(() => {
    settingsAPI.getAppExecutablePath().then(setAppPath).catch(() => {});
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await settingsAPI.get();
      setSettings(data);
      setUsername(data.username || '');
      setProfilePic(data.profile_pic || '');
      setName(data.name || '');
      setSurname(data.surname || '');
      setJobTitle(data.job_title || '');
      setCompany(data.company || '');
      setCompanyUrl(data.company_url || '');
      setAboutMe(data.about_me || '');
      setAboutRole(data.about_role || '');
      setOllamaBaseUrl(data.ollama_base_url || 'http://localhost:11434');
      setDefaultProvider((data.default_provider as LLMProvider) || 'openai');

      if (data.enabled_models) {
        try { setEnabledModels(JSON.parse(data.enabled_models)); } catch { /* ignore */ }
      }
      setGlobalContext(data.global_context || '');

      const maskKey = (key: string | null): string => {
        if (key && key.length > 5) {
          return `${key.substring(0, 2)}${'*'.repeat(10)}${key.substring(key.length - 2)}`;
        }
        return '';
      };

      const keyExists = !!data.api_key_encrypted;
      setHasApiKey(keyExists);
      if (keyExists) {
        const decryptedKey = await settingsAPI.getDecryptedApiKey();
        setDisplayKey(maskKey(decryptedKey));
      } else {
        setDisplayKey('');
      }

      const anthropicExists = !!data.anthropic_api_key_encrypted;
      setHasAnthropicKey(anthropicExists);
      if (anthropicExists) {
        const decryptedKey = await settingsAPI.getDecryptedAnthropicKey();
        setDisplayAnthropicKey(maskKey(decryptedKey));
      } else {
        setDisplayAnthropicKey('');
      }

      const googleExists = !!data.google_api_key_encrypted;
      setHasGoogleKey(googleExists);
      if (googleExists) {
        const decryptedKey = await settingsAPI.getDecryptedGoogleKey();
        setDisplayGoogleKey(maskKey(decryptedKey));
      } else {
        setDisplayGoogleKey('');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.update({
        api_key: apiKey || undefined,
        username: username || undefined,
        profile_pic: profilePic || undefined,
        name: name || undefined,
        surname: surname || undefined,
        job_title: jobTitle || undefined,
        company: company || undefined,
        company_url: companyUrl || undefined,
        about_me: aboutMe || undefined,
        about_role: aboutRole || undefined,
        anthropic_api_key: anthropicApiKey || undefined,
        google_api_key: googleApiKey || undefined,
        ollama_base_url: ollamaBaseUrl || undefined,
        default_provider: defaultProvider || undefined,
        enabled_models: Object.keys(enabledModels).length > 0 ? JSON.stringify(enabledModels) : undefined,
        global_context: globalContext || undefined,
      });
      setApiKey('');
      setAnthropicApiKey('');
      setGoogleApiKey('');
      await loadSettings();
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = (target: 'openai' | 'anthropic' | 'google') => {
    setDeleteTarget(target);
    setShowDeleteConfirm(true);
  };
  const handleDeleteCancel = () => { setShowDeleteConfirm(false); setDeleteTarget(null); };

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false);
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      if (target === 'openai') {
        await settingsAPI.deleteApiKey();
        setHasApiKey(false);
        setApiKey('');
        setDisplayKey('');
      } else if (target === 'anthropic') {
        await settingsAPI.update({ anthropic_api_key: '' });
        setHasAnthropicKey(false);
        setAnthropicApiKey('');
        setDisplayAnthropicKey('');
      } else if (target === 'google') {
        await settingsAPI.update({ google_api_key: '' });
        setHasGoogleKey(false);
        setGoogleApiKey('');
        setDisplayGoogleKey('');
      }
      await loadSettings();
      alert(`${target === 'openai' ? 'OpenAI' : target === 'anthropic' ? 'Anthropic' : 'Google'} API key deleted!`);
    } catch (error) {
      console.error(`Failed to delete ${target} API key:`, error);
      alert('Failed to delete API key. Please try again.');
    }
  };

  const handleTestConnection = async (provider: LLMProvider) => {
    setTestingProvider(provider);
    setProviderTestStatus(prev => ({ ...prev, [provider]: 'none' }));
    try {
      if (provider === 'openai') {
        if (apiKey) await settingsAPI.update({ api_key: apiKey });
        const key = apiKey || await settingsAPI.getDecryptedApiKey();
        if (!key) { setProviderTestStatus(prev => ({ ...prev, [provider]: 'error' })); return; }
        const models = await modelsAPI.listByProvider('openai', key);
        setProviderTestStatus(prev => ({ ...prev, [provider]: models.length > 0 ? 'success' : 'error' }));
      } else if (provider === 'anthropic') {
        if (anthropicApiKey) await settingsAPI.update({ anthropic_api_key: anthropicApiKey });
        const key = anthropicApiKey || await settingsAPI.getDecryptedAnthropicKey();
        if (!key) { setProviderTestStatus(prev => ({ ...prev, [provider]: 'error' })); return; }
        const models = await modelsAPI.listByProvider('anthropic', key);
        setProviderTestStatus(prev => ({ ...prev, [provider]: models.length > 0 ? 'success' : 'error' }));
      } else if (provider === 'google') {
        if (googleApiKey) await settingsAPI.update({ google_api_key: googleApiKey });
        const key = googleApiKey || await settingsAPI.getDecryptedGoogleKey();
        if (!key) { setProviderTestStatus(prev => ({ ...prev, [provider]: 'error' })); return; }
        const models = await modelsAPI.listByProvider('google', key);
        setProviderTestStatus(prev => ({ ...prev, [provider]: models.length > 0 ? 'success' : 'error' }));
      } else if (provider === 'ollama') {
        const models = await modelsAPI.listByProvider('ollama', '', ollamaBaseUrl);
        setProviderTestStatus(prev => ({ ...prev, [provider]: models.length > 0 ? 'success' : 'error' }));
      }
    } catch {
      setProviderTestStatus(prev => ({ ...prev, [provider]: 'error' }));
    } finally {
      setTestingProvider(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
        <div className="text-codex-text-secondary">Loading settings...</div>
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'profile', label: 'Personalization' },
    { id: 'context', label: 'Global Context' },
    { id: 'usage', label: 'Usage' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} className="bg-codex-bg">
      {/* Settings Sidebar */}
      <div style={{ width: '200px', flexShrink: 0 }} className="border-r border-codex-border bg-codex-sidebar p-4">
        <div className="space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-codex-surface text-codex-text-primary font-medium'
                  : 'text-codex-text-secondary hover:bg-codex-surface/50 hover:text-codex-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Content */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="p-8">
        {activeTab === 'general' && (
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-codex-text-primary mb-8">AI Providers</h1>

            {/* Default Provider */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Default Provider</div>
                  <div className="text-xs text-codex-text-secondary mt-1">
                    Used as the default for new conversations and generations.
                  </div>
                </div>
                <select
                  value={defaultProvider}
                  onChange={(e) => setDefaultProvider(e.target.value as LLMProvider)}
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>
            </div>

            {/* OpenAI */}
            <div className="mb-6">
              <h2 className="text-lg font-medium text-codex-text-primary mb-3 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-codex-text-secondary">
                  <path d="M22.28 9.37a5.93 5.93 0 0 0-.51-4.88 6 6 0 0 0-6.45-2.87A5.93 5.93 0 0 0 10.83 0a6 6 0 0 0-5.72 4.13A5.93 5.93 0 0 0 1.14 7.3a6 6 0 0 0 .74 7.07 5.93 5.93 0 0 0 .51 4.88 6 6 0 0 0 6.45 2.87A5.93 5.93 0 0 0 13.17 24a6 6 0 0 0 5.72-4.13 5.93 5.93 0 0 0 3.97-3.17 6 6 0 0 0-.74-7.07l.16-.26z"/>
                </svg>
                OpenAI
              </h2>
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">API Key</div>
                  <div className="text-xs text-codex-text-secondary mt-1">Encrypted and stored locally.</div>
                </div>
                <div className="w-72 flex-shrink-0">
                  {hasApiKey && displayKey && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-green-400">{displayKey}</span>
                      <button onClick={() => handleDeleteApiKey('openai')} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={hasApiKey ? 'Enter new key...' : 'sk-...'}
                      className="flex-1 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                    <button onClick={() => setShowApiKey(!showApiKey)} className="px-2 text-xs text-codex-text-secondary hover:text-codex-text-primary">
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-xs text-codex-text-muted mt-2">
                    Get your key from{' '}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-codex-accent hover:underline">platform.openai.com</a>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => handleTestConnection('openai')}
                  disabled={testingProvider === 'openai' || (!hasApiKey && !apiKey)}
                  className="px-3 py-2 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-primary hover:bg-codex-surface-hover disabled:opacity-50"
                >
                  {testingProvider === 'openai' ? 'Testing...' : 'Test Connection'}
                </button>
                {providerTestStatus['openai'] === 'success' && <span className="text-xs text-green-400">Connected</span>}
                {providerTestStatus['openai'] === 'error' && <span className="text-xs text-red-400">Connection failed</span>}
              </div>
            </div>

            {/* Anthropic */}
            <div className="mb-6">
              <h2 className="text-lg font-medium text-codex-text-primary mb-3 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-codex-text-secondary">
                  <path d="M13.83 1.5h3.84L24 22.5h-3.84l-6.33-21zm-7.5 0H2.49L8.82 22.5h3.84L6.33 1.5z"/>
                </svg>
                Anthropic
              </h2>
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">API Key</div>
                  <div className="text-xs text-codex-text-secondary mt-1">For Claude models (Sonnet, Haiku).</div>
                </div>
                <div className="w-72 flex-shrink-0">
                  {hasAnthropicKey && displayAnthropicKey && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-green-400">{displayAnthropicKey}</span>
                      <button onClick={() => handleDeleteApiKey('anthropic')} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={anthropicApiKey}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                      placeholder={hasAnthropicKey ? 'Enter new key...' : 'sk-ant-...'}
                      className="flex-1 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                    <button onClick={() => setShowAnthropicKey(!showAnthropicKey)} className="px-2 text-xs text-codex-text-secondary hover:text-codex-text-primary">
                      {showAnthropicKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-xs text-codex-text-muted mt-2">
                    Get your key from{' '}
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-codex-accent hover:underline">console.anthropic.com</a>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => handleTestConnection('anthropic')}
                  disabled={testingProvider === 'anthropic' || (!hasAnthropicKey && !anthropicApiKey)}
                  className="px-3 py-2 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-primary hover:bg-codex-surface-hover disabled:opacity-50"
                >
                  {testingProvider === 'anthropic' ? 'Testing...' : 'Test Connection'}
                </button>
                {providerTestStatus['anthropic'] === 'success' && <span className="text-xs text-green-400">Connected</span>}
                {providerTestStatus['anthropic'] === 'error' && <span className="text-xs text-red-400">Connection failed</span>}
              </div>
            </div>

            {/* Google */}
            <div className="mb-6">
              <h2 className="text-lg font-medium text-codex-text-primary mb-3 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-codex-text-secondary">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </h2>
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">API Key</div>
                  <div className="text-xs text-codex-text-secondary mt-1">For Gemini models (Pro, Flash).</div>
                </div>
                <div className="w-72 flex-shrink-0">
                  {hasGoogleKey && displayGoogleKey && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-green-400">{displayGoogleKey}</span>
                      <button onClick={() => handleDeleteApiKey('google')} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type={showGoogleKey ? 'text' : 'password'}
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      placeholder={hasGoogleKey ? 'Enter new key...' : 'AIza...'}
                      className="flex-1 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                    <button onClick={() => setShowGoogleKey(!showGoogleKey)} className="px-2 text-xs text-codex-text-secondary hover:text-codex-text-primary">
                      {showGoogleKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-xs text-codex-text-muted mt-2">
                    Get your key from{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-codex-accent hover:underline">aistudio.google.com</a>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => handleTestConnection('google')}
                  disabled={testingProvider === 'google' || (!hasGoogleKey && !googleApiKey)}
                  className="px-3 py-2 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-primary hover:bg-codex-surface-hover disabled:opacity-50"
                >
                  {testingProvider === 'google' ? 'Testing...' : 'Test Connection'}
                </button>
                {providerTestStatus['google'] === 'success' && <span className="text-xs text-green-400">Connected</span>}
                {providerTestStatus['google'] === 'error' && <span className="text-xs text-red-400">Connection failed</span>}
              </div>
            </div>

            {/* Ollama */}
            <div className="mb-6">
              <h2 className="text-lg font-medium text-codex-text-primary mb-3 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-codex-text-secondary">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="4" fill="#1e1e1e"/>
                </svg>
                Ollama (Local)
              </h2>
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Base URL</div>
                  <div className="text-xs text-codex-text-secondary mt-1">Local Ollama server address. Free, runs on your machine.</div>
                </div>
                <div className="w-72 flex-shrink-0">
                  <input
                    type="url"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => handleTestConnection('ollama')}
                  disabled={testingProvider === 'ollama'}
                  className="px-3 py-2 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-primary hover:bg-codex-surface-hover disabled:opacity-50"
                >
                  {testingProvider === 'ollama' ? 'Testing...' : 'Test Connection'}
                </button>
                {providerTestStatus['ollama'] === 'success' && <span className="text-xs text-green-400">Connected</span>}
                {providerTestStatus['ollama'] === 'error' && <span className="text-xs text-red-400">Not reachable</span>}
              </div>
            </div>

            {/* Model Configuration */}
            <div className="border border-codex-border rounded-lg p-4 mt-6">
              <button
                onClick={() => setModelsExpanded(!modelsExpanded)}
                className="w-full flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-codex-text-primary">Model Configuration</div>
                  <div className="text-[10px] text-codex-text-muted mt-0.5">Discover and choose which models appear in the model selector</div>
                </div>
                <svg className={`w-4 h-4 text-codex-text-muted transition-transform ${modelsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {modelsExpanded && (
                <div className="mt-4 space-y-4">
                  {(['openai', 'anthropic', 'google', 'ollama'] as LLMProvider[]).map(provider => {
                    const isConfigured = provider === 'openai' ? hasApiKey :
                      provider === 'anthropic' ? hasAnthropicKey :
                      provider === 'google' ? hasGoogleKey :
                      !!ollamaBaseUrl;
                    if (!isConfigured) return null;
                    const providerLabel = provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : provider === 'google' ? 'Google' : 'Ollama';
                    const discovered = discoveredModels[provider] || [];
                    const enabled = enabledModels[provider] || [];
                    const isDiscovering = discoveringModels[provider];

                    return (
                      <div key={provider} className="border border-codex-border/50 rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-codex-text-primary">{providerLabel}</span>
                          <button
                            onClick={async () => {
                              setDiscoveringModels(prev => ({ ...prev, [provider]: true }));
                              try {
                                const key = await settingsAPI.getDecryptedKeyForProvider(provider);
                                const url = provider === 'ollama' ? ollamaBaseUrl : undefined;
                                const models = await modelsAPI.listByProvider(provider, key || '', url);
                                setDiscoveredModels(prev => ({ ...prev, [provider]: models }));
                                if (!enabledModels[provider] || enabledModels[provider].length === 0) {
                                  setEnabledModels(prev => ({ ...prev, [provider]: models.slice(0, 5) }));
                                }
                              } catch { /* ignore */ }
                              setDiscoveringModels(prev => ({ ...prev, [provider]: false }));
                            }}
                            disabled={isDiscovering}
                            className="px-2 py-1 text-[10px] bg-codex-surface border border-codex-border rounded text-codex-text-secondary hover:text-codex-text-primary disabled:opacity-50"
                          >
                            {isDiscovering ? 'Discovering...' : discovered.length > 0 ? 'Refresh' : 'Discover Models'}
                          </button>
                        </div>
                        {discovered.length > 0 ? (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {discovered.map(model => {
                              const isEnabled = enabled.includes(model);
                              return (
                                <label key={model} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => {
                                      setEnabledModels(prev => {
                                        const current = prev[provider] || [];
                                        const updated = isEnabled
                                          ? current.filter(m => m !== model)
                                          : [...current, model];
                                        return { ...prev, [provider]: updated };
                                      });
                                    }}
                                    className="rounded border-codex-border"
                                  />
                                  <span className={`text-[11px] ${isEnabled ? 'text-codex-text-primary' : 'text-codex-text-muted'}`}>
                                    {model}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[10px] text-codex-text-muted">Click "Discover Models" to fetch available models from the API</div>
                        )}
                        {discovered.length > 0 && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-codex-border/30">
                            <button
                              onClick={() => setEnabledModels(prev => ({ ...prev, [provider]: [...discovered] }))}
                              className="text-[9px] text-codex-accent hover:underline"
                            >Enable All</button>
                            <button
                              onClick={() => setEnabledModels(prev => ({ ...prev, [provider]: [] }))}
                              className="text-[9px] text-codex-text-muted hover:text-codex-text-secondary"
                            >Disable All</button>
                            <span className="text-[9px] text-codex-text-muted ml-auto">{enabled.length}/{discovered.length} enabled</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Save */}
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-codex-accent hover:bg-codex-accent-hover disabled:opacity-50 text-white rounded-md text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save Provider Settings'}
              </button>
            </div>

            <div className="mt-10 pt-6 border-t border-codex-border/50">
              <h2 className="text-lg font-semibold text-codex-text-primary mb-4">macOS Permissions</h2>
              <div className="py-4 border-b border-codex-border/50">
                <div className="flex items-start justify-between gap-8">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-codex-text-primary">Full Disk Access</div>
                    <div className="text-xs text-codex-text-secondary mt-1">
                      Required for the terminal to access directories like Documents, Desktop, and Downloads.
                    </div>
                  </div>
                  <button
                    onClick={() => settingsAPI.openFullDiskAccessSettings()}
                    className="px-4 py-2 bg-codex-surface hover:bg-codex-surface-hover border border-codex-border text-codex-text-primary rounded-md text-sm transition-colors whitespace-nowrap"
                  >
                    Open Settings
                  </button>
                </div>
                <div className="mt-3 p-3 rounded-md bg-codex-surface/50 border border-codex-border/30">
                  <div className="text-xs text-codex-text-secondary space-y-1.5">
                    <p>1. Click <strong className="text-codex-text-primary">Open Settings</strong> above</p>
                    <p>2. Click the <strong className="text-codex-text-primary">+</strong> button and add this app:</p>
                    {appPath && (
                      <code className="block text-[10px] text-codex-accent bg-codex-bg/50 px-2 py-1 rounded mt-1 break-all select-all cursor-text">
                        {appPath}
                      </code>
                    )}
                    <p>3. Restart ProdForge after granting access</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-codex-text-primary mb-8">Personalization</h1>

            <div className="space-y-0">
              {/* Username */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Username</div>
                  <div className="text-xs text-codex-text-secondary mt-1">Display name in conversations</div>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="john_doe"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              {/* First Name */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">First Name</div>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              {/* Last Name */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Last Name</div>
                </div>
                <input
                  type="text"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="Doe"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              {/* Job Title */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Job Title</div>
                  <div className="text-xs text-codex-text-secondary mt-1">Helps GPT personalize responses to your role</div>
                </div>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Senior Product Manager"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              {/* Company */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Company</div>
                </div>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              {/* Company URL */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Company URL</div>
                </div>
                <input
                  type="url"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  placeholder="https://acme.com"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              {/* About Section Header */}
              <div className="pt-8 pb-4">
                <h2 className="text-lg font-medium text-codex-text-primary">About</h2>
              </div>

              {/* About Me */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">About Me</div>
                  <div className="text-xs text-codex-text-secondary mt-1">Background context for GPT</div>
                </div>
                <textarea
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  placeholder="Tell GPT about yourself..."
                  rows={3}
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none"
                />
              </div>

              {/* About Role */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">About My Role</div>
                  <div className="text-xs text-codex-text-secondary mt-1">Role details for better responses</div>
                </div>
                <textarea
                  value={aboutRole}
                  onChange={(e) => setAboutRole(e.target.value)}
                  placeholder="Describe your role..."
                  rows={3}
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none"
                />
              </div>

              {/* Profile Picture URL */}
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">Profile Picture</div>
                  <div className="text-xs text-codex-text-secondary mt-1">URL to your avatar image</div>
                </div>
                <input
                  type="url"
                  value={profilePic}
                  onChange={(e) => setProfilePic(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-72 px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-codex-accent hover:bg-codex-accent-hover disabled:opacity-50 text-white rounded-md text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'context' && (
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-codex-text-primary mb-2">Global Context</h1>
            <p className="text-sm text-codex-text-secondary mb-8">
              Instructions and context included in every AI generation and conversation.
            </p>

            <div className="space-y-0">
              <div className="flex items-start justify-between gap-8 py-4 border-b border-codex-border/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-codex-text-primary">System Instructions</div>
                  <div className="text-xs text-codex-text-secondary mt-1">
                    Persistent context included in all AI interactions. Use this for company guidelines,
                    writing style, tone preferences, or any instructions the AI should always follow.
                  </div>
                </div>
              </div>
              <textarea
                value={globalContext}
                onChange={(e) => setGlobalContext(e.target.value)}
                placeholder={"e.g., Always write in a professional tone. Our company builds B2B SaaS products.\nUse British English spelling. Focus on data-driven recommendations."}
                rows={12}
                className="w-full mt-4 px-4 py-3 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none font-mono"
              />
              <div className="mt-2 text-xs text-codex-text-muted">
                {globalContext.length} characters
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-codex-accent hover:bg-codex-accent-hover disabled:opacity-50 text-white rounded-md text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save Context'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="max-w-4xl">
            <h1 className="text-2xl font-semibold text-codex-text-primary mb-8">Usage & Analytics</h1>
            <AnalyticsDashboard />
          </div>
        )}

      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50" onClick={handleDeleteCancel}>
          <div className="bg-codex-surface rounded-lg p-6 max-w-sm mx-4 border border-codex-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium text-codex-text-primary mb-2">Delete {deleteTarget === 'openai' ? 'OpenAI' : deleteTarget === 'anthropic' ? 'Anthropic' : 'Google'} API Key?</h3>
            <p className="text-sm text-codex-text-secondary mb-6">
              Are you sure? You'll need to add it again to use this provider.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-sm text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface-hover rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
