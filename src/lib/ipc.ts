import { invoke } from '@tauri-apps/api/core';
import { Project, Conversation, Message, Settings, SettingsUpdate, TokenUsage, TokenUsageAggregate, ContextDocument, FrameworkOutput, Folder, SearchResult, CommandHistoryEntry, CommandResult, FrameworkDefinition, FrameworkCategory, SavedPrompt, PromptVariable, ImportPreview, ImportResult, BatchExportResult, ConflictAction, Workflow, WorkflowRun, WorkflowRunStep, ProjectInsight, CommitInfo, JiraProject, JiraExportResult, NotionPage, NotionExportResult, FileEntry, LLMProvider, ProviderInfo, GitFileStatus, GitBranchInfo, GitLogEntry, GitRemoteInfo, SkillCategory, Skill, AgentDef, AgentRun, AgentUsageStats, AgentTeam, AgentTeamNode, AgentTeamEdge, TeamRun, Schedule, TraceSpan, AgentAnalytics, SkillUsageAnalytics } from './types';

interface FrameworkDefRow {
  id: string;
  category: string;
  name: string;
  description: string;
  icon: string;
  example_output: string;
  system_prompt: string;
  guiding_questions: string;
  supports_visuals: boolean;
  visual_instructions: string | null;
  is_builtin: boolean;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface FrameworkCategoryRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  is_builtin: boolean;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function parseFrameworkDef(row: FrameworkDefRow): FrameworkDefinition {
  return {
    ...row,
    guiding_questions: JSON.parse(row.guiding_questions || '[]'),
    visual_instructions: row.visual_instructions || undefined,
  };
}

function parseCategoryRow(row: FrameworkCategoryRow): Omit<FrameworkCategory, 'frameworks'> {
  return row;
}

export const projectsAPI = {
  async create(name: string, description?: string): Promise<Project> {
    return await invoke('create_project', { name, description });
  },

  async list(): Promise<Project[]> {
    return await invoke('list_projects');
  },

  async get(id: string): Promise<Project | null> {
    return await invoke('get_project', { id });
  },

  async update(id: string, name: string, description?: string): Promise<Project> {
    return await invoke('update_project', { id, name, description });
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_project', { id });
  },
};

export const conversationsAPI = {
  async create(
    projectId: string,
    title?: string,
    model: string = 'gpt-5'
  ): Promise<Conversation> {
    return await invoke('create_conversation', {
      projectId,
      title,
      model,
    });
  },

  async list(projectId: string): Promise<Conversation[]> {
    return await invoke('list_conversations', { projectId });
  },

  async get(id: string): Promise<Conversation | null> {
    return await invoke('get_conversation', { id });
  },

  async updateStats(
    id: string,
    tokens: number,
    cost: number
  ): Promise<void> {
    return await invoke('update_conversation_stats', {
      id,
      tokens,
      cost,
    });
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_conversation', { id });
  },
};

export const messagesAPI = {
  async add(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    tokens: number = 0
  ): Promise<Message> {
    return await invoke('add_message', {
      conversationId,
      role,
      content,
      tokens,
    });
  },

  async list(conversationId: string): Promise<Message[]> {
    return await invoke('get_messages', { conversationId });
  },
};

export const settingsAPI = {
  async get(): Promise<Settings> {
    return await invoke('get_settings');
  },

  async update(settings: SettingsUpdate): Promise<Settings> {
    return await invoke('update_settings', { settings });
  },

  async getDecryptedApiKey(): Promise<string | null> {
    return await invoke('get_decrypted_api_key');
  },

  async getDecryptedAnthropicKey(): Promise<string | null> {
    return await invoke('get_decrypted_anthropic_key');
  },

  async getDecryptedGoogleKey(): Promise<string | null> {
    return await invoke('get_decrypted_google_key');
  },

  async deleteApiKey(): Promise<void> {
    return await invoke('delete_api_key');
  },

  async getAvailableProviders(): Promise<ProviderInfo[]> {
    return await invoke('get_available_providers');
  },

  async getDecryptedKeyForProvider(provider: LLMProvider): Promise<string | null> {
    switch (provider) {
      case 'openai': return this.getDecryptedApiKey();
      case 'anthropic': return this.getDecryptedAnthropicKey();
      case 'google': return this.getDecryptedGoogleKey();
      case 'ollama': return null;
      default: return null;
    }
  },

  async openFullDiskAccessSettings(): Promise<void> {
    return await invoke('open_full_disk_access_settings');
  },

  async getAppExecutablePath(): Promise<string> {
    return await invoke('get_app_executable_path');
  },
};

export const tokenUsageAPI = {
  async record(
    conversationId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cost: number,
    provider?: string
  ): Promise<string> {
    return await invoke('record_token_usage', {
      conversationId,
      model,
      inputTokens,
      outputTokens,
      cost,
      provider: provider || 'openai',
    });
  },

  async getByDateRange(
    startDate: string,
    endDate: string,
    viewType: 'daily' | 'monthly'
  ): Promise<TokenUsageAggregate[]> {
    return await invoke('get_token_usage_by_date_range', {
      startDate,
      endDate,
      viewType,
    });
  },

  async getAll(): Promise<TokenUsage[]> {
    return await invoke('get_all_token_usage');
  },

  async getByProvider(startDate: string, endDate: string): Promise<unknown[]> {
    return await invoke('get_usage_by_provider', { startDate, endDate });
  },

  async getByModel(startDate: string, endDate: string): Promise<unknown[]> {
    return await invoke('get_usage_by_model', { startDate, endDate });
  },

  async exportCSV(startDate: string, endDate: string): Promise<string> {
    return await invoke('export_usage_csv', { startDate, endDate });
  },
};

// Python sidecar API (direct HTTP calls)
export const SIDECAR_URL = 'http://127.0.0.1:8001';

export const modelsAPI = {
  async list(apiKey: string): Promise<string[]> {
    try {
      const response = await fetch(`${SIDECAR_URL}/models?api_key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch {
      return [
        'gpt-5',
        'gpt-5-mini',
        'gpt-5-nano',
      ];
    }
  },

  async listByProvider(provider: LLMProvider, apiKey: string, ollamaUrl?: string): Promise<string[]> {
    try {
      const params = new URLSearchParams({ api_key: apiKey });
      if (ollamaUrl) params.set('ollama_url', ollamaUrl);
      const response = await fetch(`${SIDECAR_URL}/models/${provider}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch ${provider} models`);
      const data = await response.json();
      return data.models || [];
    } catch {
      const fallbacks: Record<string, string[]> = {
        openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
        anthropic: ['claude-sonnet-4-5-20250514', 'claude-haiku-4-5-20251001'],
        google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        ollama: ['llama3', 'mistral', 'codellama'],
      };
      return fallbacks[provider] || [];
    }
  },
};

export const foldersAPI = {
  async create(projectId: string, name: string, parentId?: string, color?: string): Promise<Folder> {
    return await invoke('create_folder', { projectId, name, parentId, color });
  },

  async list(projectId: string): Promise<Folder[]> {
    return await invoke('list_folders', { projectId });
  },

  async get(id: string): Promise<Folder | null> {
    return await invoke('get_folder', { id });
  },

  async update(id: string, name?: string, parentId?: string | null, color?: string): Promise<Folder> {
    return await invoke('update_folder', {
      id,
      name,
      parentId: parentId === null ? '__null__' : parentId,
      color,
    });
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_folder', { id });
  },

  async moveItem(itemId: string, itemType: 'context_doc' | 'framework_output', folderId: string | null): Promise<void> {
    return await invoke('move_item_to_folder', { itemId, itemType, folderId });
  },

  async searchItems(projectId: string, query: string): Promise<SearchResult[]> {
    return await invoke('search_project_items', { projectId, query });
  },

  async toggleItemFavorite(itemId: string, itemType: 'context_doc' | 'framework_output', isFavorite: boolean): Promise<void> {
    return await invoke('toggle_item_favorite', { itemId, itemType, isFavorite });
  },

  async setFolderColor(id: string, color: string | null): Promise<void> {
    return await invoke('set_folder_color', { id, color });
  },
};

export const terminalAPI = {
  async execute(projectId: string, command: string): Promise<CommandResult> {
    return await invoke('execute_shell_command', { projectId, command });
  },

  async getHistory(projectId: string, limit?: number): Promise<CommandHistoryEntry[]> {
    return await invoke('get_command_history', { projectId, limit: limit || 50 });
  },

  async getCwd(projectId: string): Promise<string> {
    return await invoke('get_terminal_cwd', { projectId });
  },

  async setCwd(projectId: string, cwd: string): Promise<void> {
    return await invoke('set_terminal_cwd', { projectId, cwd });
  },

  async completePath(projectId: string, partial: string): Promise<string[]> {
    return await invoke('complete_path', { projectId, partial });
  },
};

export const workspaceAPI = {
  async saveState(projectId: string, stateJson: string): Promise<void> {
    return await invoke('save_workspace_state', { projectId, stateJson });
  },
  async getState(projectId: string): Promise<string | null> {
    return await invoke('get_workspace_state', { projectId });
  },
  async saveRepoPath(projectId: string, repoPath: string): Promise<void> {
    return await invoke('save_project_repo_path', { projectId, repoPath });
  },
  async getRepoPath(projectId: string): Promise<string | null> {
    return await invoke('get_project_repo_path_cmd', { projectId });
  },
};

export const ptyAPI = {
  async create(cols: number, rows: number, cwd?: string, command?: string): Promise<string> {
    return await invoke('create_pty_session', { cols, rows, cwd, command });
  },

  async write(sessionId: string, data: string): Promise<void> {
    return await invoke('write_pty', { sessionId, data });
  },

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    return await invoke('resize_pty', { sessionId, cols, rows });
  },

  async close(sessionId: string): Promise<void> {
    return await invoke('close_pty', { sessionId });
  },
};

export const contextDocumentsAPI = {
  async create(
    projectId: string,
    name: string,
    docType: 'pdf' | 'url' | 'google_doc' | 'text',
    content: string,
    url?: string,
    isGlobal: boolean = false
  ): Promise<ContextDocument> {
    return await invoke('create_context_document', {
      projectId,
      name,
      docType,
      content,
      url,
      isGlobal
    });
  },

  async list(projectId: string): Promise<ContextDocument[]> {
    return await invoke('list_context_documents', { projectId });
  },

  async get(id: string): Promise<ContextDocument | null> {
    return await invoke('get_context_document', { id });
  },

  async update(id: string, name: string, isGlobal: boolean): Promise<ContextDocument> {
    return await invoke('update_context_document', {
      id,
      name,
      isGlobal
    });
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_context_document', { id });
  }
};

export const frameworkCategoriesAPI = {
  async list(): Promise<Omit<FrameworkCategory, 'frameworks'>[]> {
    const rows: FrameworkCategoryRow[] = await invoke('list_framework_categories');
    return rows.map(parseCategoryRow);
  },

  async get(id: string): Promise<Omit<FrameworkCategory, 'frameworks'> | null> {
    const row: FrameworkCategoryRow | null = await invoke('get_framework_category', { id });
    return row ? parseCategoryRow(row) : null;
  },

  async create(name: string, description: string, icon: string): Promise<Omit<FrameworkCategory, 'frameworks'>> {
    const row: FrameworkCategoryRow = await invoke('create_framework_category', { name, description, icon });
    return parseCategoryRow(row);
  },

  async update(id: string, name: string, description: string, icon: string): Promise<Omit<FrameworkCategory, 'frameworks'>> {
    const row: FrameworkCategoryRow = await invoke('update_framework_category', { id, name, description, icon });
    return parseCategoryRow(row);
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_framework_category', { id });
  },
};

export const frameworkDefsAPI = {
  async list(category?: string): Promise<FrameworkDefinition[]> {
    const rows: FrameworkDefRow[] = await invoke('list_framework_defs', { category: category || null });
    return rows.map(parseFrameworkDef);
  },

  async get(id: string): Promise<FrameworkDefinition | null> {
    const row: FrameworkDefRow | null = await invoke('get_framework_def', { id });
    return row ? parseFrameworkDef(row) : null;
  },

  async create(params: {
    category: string;
    name: string;
    description: string;
    icon: string;
    systemPrompt: string;
    guidingQuestions: string[];
    exampleOutput: string;
    supportsVisuals: boolean;
    visualInstructions?: string;
  }): Promise<FrameworkDefinition> {
    const row: FrameworkDefRow = await invoke('create_framework_def', {
      category: params.category,
      name: params.name,
      description: params.description,
      icon: params.icon,
      systemPrompt: params.systemPrompt,
      guidingQuestions: JSON.stringify(params.guidingQuestions),
      exampleOutput: params.exampleOutput,
      supportsVisuals: params.supportsVisuals,
      visualInstructions: params.visualInstructions || null,
    });
    return parseFrameworkDef(row);
  },

  async update(id: string, params: {
    category?: string;
    name?: string;
    description?: string;
    icon?: string;
    systemPrompt?: string;
    guidingQuestions?: string[];
    exampleOutput?: string;
    supportsVisuals?: boolean;
    visualInstructions?: string | null;
  }): Promise<FrameworkDefinition> {
    const row: FrameworkDefRow = await invoke('update_framework_def', {
      id,
      category: params.category,
      name: params.name,
      description: params.description,
      icon: params.icon,
      systemPrompt: params.systemPrompt,
      guidingQuestions: params.guidingQuestions ? JSON.stringify(params.guidingQuestions) : undefined,
      exampleOutput: params.exampleOutput,
      supportsVisuals: params.supportsVisuals,
      visualInstructions: params.visualInstructions,
    });
    return parseFrameworkDef(row);
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_framework_def', { id });
  },

  async reset(id: string): Promise<FrameworkDefinition> {
    const row: FrameworkDefRow = await invoke('reset_framework_def', { id });
    return parseFrameworkDef(row);
  },

  async search(query: string): Promise<FrameworkDefinition[]> {
    const rows: FrameworkDefRow[] = await invoke('search_framework_defs', { query });
    return rows.map(parseFrameworkDef);
  },

  async duplicate(id: string, newName: string): Promise<FrameworkDefinition> {
    const row: FrameworkDefRow = await invoke('duplicate_framework_def', { id, newName });
    return parseFrameworkDef(row);
  },
};

interface SavedPromptRow {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt_text: string;
  variables: string;
  framework_id: string | null;
  is_builtin: boolean;
  is_favorite: boolean;
  usage_count: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function parseSavedPrompt(row: SavedPromptRow): SavedPrompt {
  return {
    ...row,
    variables: JSON.parse(row.variables || '[]') as PromptVariable[],
    framework_id: row.framework_id || undefined,
  };
}

export const savedPromptsAPI = {
  async list(category?: string, frameworkId?: string): Promise<SavedPrompt[]> {
    const rows: SavedPromptRow[] = await invoke('list_saved_prompts', {
      category: category || null,
      frameworkId: frameworkId || null,
    });
    return rows.map(parseSavedPrompt);
  },

  async get(id: string): Promise<SavedPrompt | null> {
    const row: SavedPromptRow | null = await invoke('get_saved_prompt', { id });
    return row ? parseSavedPrompt(row) : null;
  },

  async create(params: {
    name: string;
    description: string;
    category: string;
    promptText: string;
    variables: PromptVariable[];
    frameworkId?: string;
  }): Promise<SavedPrompt> {
    const row: SavedPromptRow = await invoke('create_saved_prompt', {
      name: params.name,
      description: params.description,
      category: params.category,
      promptText: params.promptText,
      variables: JSON.stringify(params.variables),
      frameworkId: params.frameworkId || null,
    });
    return parseSavedPrompt(row);
  },

  async update(id: string, params: {
    name?: string;
    description?: string;
    category?: string;
    promptText?: string;
    variables?: PromptVariable[];
    frameworkId?: string | null;
    isFavorite?: boolean;
  }): Promise<SavedPrompt> {
    const row: SavedPromptRow = await invoke('update_saved_prompt', {
      id,
      name: params.name,
      description: params.description,
      category: params.category,
      promptText: params.promptText,
      variables: params.variables ? JSON.stringify(params.variables) : undefined,
      frameworkId: params.frameworkId !== undefined ? params.frameworkId : undefined,
      isFavorite: params.isFavorite,
    });
    return parseSavedPrompt(row);
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_saved_prompt', { id });
  },

  async search(query: string): Promise<SavedPrompt[]> {
    const rows: SavedPromptRow[] = await invoke('search_saved_prompts', { query });
    return rows.map(parseSavedPrompt);
  },

  async duplicate(id: string, newName: string): Promise<SavedPrompt> {
    const row: SavedPromptRow = await invoke('duplicate_saved_prompt', { id, newName });
    return parseSavedPrompt(row);
  },

  async incrementUsage(id: string): Promise<void> {
    return await invoke('increment_prompt_usage', { id });
  },
};

export const frameworkOutputsAPI = {
  async create(
    projectId: string,
    frameworkId: string,
    category: string,
    name: string,
    userPrompt: string,
    contextDocIds: string[],
    generatedContent: string,
    format: 'markdown' | 'html' = 'markdown'
  ): Promise<FrameworkOutput> {
    return await invoke('create_framework_output', {
      projectId,
      frameworkId,
      category,
      name,
      userPrompt,
      contextDocIds: JSON.stringify(contextDocIds),
      generatedContent,
      format
    });
  },

  async list(projectId: string): Promise<FrameworkOutput[]> {
    return await invoke('list_framework_outputs', { projectId });
  },

  async get(id: string): Promise<FrameworkOutput | null> {
    return await invoke('get_framework_output', { id });
  },

  async update(id: string, name: string, generatedContent: string): Promise<FrameworkOutput> {
    return await invoke('update_framework_output', {
      id,
      name,
      generatedContent
    });
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_framework_output', { id });
  },

  async generate(
    projectId: string,
    frameworkId: string,
    contextDocIds: string[],
    userPrompt: string
  ): Promise<string> {
    try {
      const apiKey = await settingsAPI.getDecryptedApiKey();
      if (!apiKey) {
        throw new Error('API key not configured');
      }

      const response = await fetch(`${SIDECAR_URL}/generate-framework`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          framework_id: frameworkId,
          context_doc_ids: contextDocIds,
          user_prompt: userPrompt,
          api_key: apiKey
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate framework: ${response.statusText}`);
      }

      const data = await response.json();
      return data.generated_content;
    } catch (error) {
      console.error('Error generating framework:', error);
      throw error;
    }
  }
};

export const marketplaceAPI = {
  async exportFramework(id: string): Promise<string> {
    return await invoke('export_framework', { id });
  },

  async exportFrameworksBatch(ids: string[]): Promise<BatchExportResult[]> {
    return await invoke('export_frameworks_batch', { ids });
  },

  async exportAllFrameworks(): Promise<BatchExportResult[]> {
    return await invoke('export_all_frameworks');
  },

  async previewImportFramework(mdContent: string): Promise<ImportPreview> {
    return await invoke('preview_import_framework', { mdContent });
  },

  async confirmImportFramework(mdContent: string, conflictAction: ConflictAction): Promise<ImportResult> {
    return await invoke('confirm_import_framework', { mdContent, conflictAction });
  },

  async exportPrompt(id: string): Promise<string> {
    return await invoke('export_prompt', { id });
  },

  async exportPromptsBatch(ids: string[]): Promise<BatchExportResult[]> {
    return await invoke('export_prompts_batch', { ids });
  },

  async exportAllPrompts(): Promise<BatchExportResult[]> {
    return await invoke('export_all_prompts');
  },

  async previewImportPrompt(mdContent: string): Promise<ImportPreview> {
    return await invoke('preview_import_prompt', { mdContent });
  },

  async confirmImportPrompt(mdContent: string, conflictAction: ConflictAction): Promise<ImportResult> {
    return await invoke('confirm_import_prompt', { mdContent, conflictAction });
  },

  async exportSkill(id: string): Promise<string> {
    return await invoke('export_skill', { id });
  },

  async exportSkillsBatch(ids: string[]): Promise<BatchExportResult[]> {
    return await invoke('export_skills_batch', { ids });
  },

  async exportAllSkills(): Promise<BatchExportResult[]> {
    return await invoke('export_all_skills');
  },

  async previewImportSkill(mdContent: string): Promise<ImportPreview> {
    return await invoke('preview_import_skill', { mdContent });
  },

  async confirmImportSkill(mdContent: string, conflictAction: ConflictAction): Promise<ImportResult> {
    return await invoke('confirm_import_skill', { mdContent, conflictAction });
  },

  async exportAgent(id: string): Promise<string> {
    return await invoke('export_agent', { id });
  },

  async exportAgentsBatch(ids: string[]): Promise<BatchExportResult[]> {
    return await invoke('export_agents_batch', { ids });
  },

  async exportAllAgents(): Promise<BatchExportResult[]> {
    return await invoke('export_all_agents');
  },

  async previewImportAgent(mdContent: string): Promise<ImportPreview> {
    return await invoke('preview_import_agent', { mdContent });
  },

  async confirmImportAgent(mdContent: string, conflictAction: ConflictAction): Promise<ImportResult> {
    return await invoke('confirm_import_agent', { mdContent, conflictAction });
  },
};

export const workflowsAPI = {
  async create(projectId: string, name: string, description: string, stepsJson: string): Promise<Workflow> {
    return await invoke('create_workflow', { projectId, name, description, stepsJson });
  },

  async list(projectId: string): Promise<Workflow[]> {
    return await invoke('list_workflows', { projectId });
  },

  async get(id: string): Promise<Workflow> {
    return await invoke('get_workflow', { id });
  },

  async update(id: string, name: string, description: string, stepsJson: string): Promise<Workflow> {
    return await invoke('update_workflow', { id, name, description, stepsJson });
  },

  async delete(id: string): Promise<void> {
    return await invoke('delete_workflow', { id });
  },

  async duplicate(id: string, newName: string, projectId: string): Promise<Workflow> {
    return await invoke('duplicate_workflow', { id, newName, projectId });
  },

  async createRun(workflowId: string, projectId: string): Promise<WorkflowRun> {
    return await invoke('create_workflow_run', { workflowId, projectId });
  },

  async getRun(id: string): Promise<WorkflowRun> {
    return await invoke('get_workflow_run', { id });
  },

  async listRuns(workflowId: string): Promise<WorkflowRun[]> {
    return await invoke('list_workflow_runs', { workflowId });
  },

  async updateRunStatus(id: string, status: string, completedAt?: number): Promise<void> {
    return await invoke('update_workflow_run_status', { id, status, completedAt });
  },

  async deleteRun(id: string): Promise<void> {
    return await invoke('delete_workflow_run', { id });
  },

  async createRunStep(runId: string, stepIndex: number, frameworkId: string, inputPrompt?: string): Promise<WorkflowRunStep> {
    return await invoke('create_workflow_run_step', { runId, stepIndex, frameworkId, inputPrompt });
  },

  async updateRunStep(id: string, status: string, outputContent?: string, outputId?: string, error?: string): Promise<void> {
    return await invoke('update_workflow_run_step', { id, status, outputContent, outputId, error });
  },

  async listRunSteps(runId: string): Promise<WorkflowRunStep[]> {
    return await invoke('list_workflow_run_steps', { runId });
  },

  async getRunStep(id: string): Promise<WorkflowRunStep> {
    return await invoke('get_workflow_run_step', { id });
  },
};

export const insightsAPI = {
  async list(projectId: string): Promise<ProjectInsight[]> {
    return await invoke('list_project_insights', { projectId });
  },

  async dismiss(id: string): Promise<void> {
    return await invoke('dismiss_insight', { id });
  },

  async save(projectId: string, insightsJson: string): Promise<void> {
    return await invoke('save_insights', { projectId, insightsJson });
  },

  async clear(projectId: string): Promise<void> {
    return await invoke('clear_project_insights', { projectId });
  },
};

export const gitAPI = {
  async initRepo(projectId: string): Promise<void> {
    return await invoke('init_project_repo', { projectId });
  },

  async commitOutput(projectId: string, outputId: string, name: string, content: string, message: string): Promise<void> {
    return await invoke('commit_output', { projectId, outputId, name, content, message });
  },

  async listOutputCommits(projectId: string, outputId: string): Promise<CommitInfo[]> {
    return await invoke('list_output_commits', { projectId, outputId });
  },

  async getCommitDiff(projectId: string, commitOid: string): Promise<string> {
    return await invoke('get_commit_diff', { projectId, commitOid });
  },

  async getOutputAtCommit(projectId: string, outputId: string, commitOid: string): Promise<string> {
    return await invoke('get_output_at_commit', { projectId, outputId, commitOid });
  },

  async rollbackOutput(projectId: string, outputId: string, commitOid: string): Promise<string> {
    return await invoke('rollback_output', { projectId, outputId, commitOid });
  },

  async status(repoPath: string): Promise<GitFileStatus[]> {
    return await invoke('git_status', { repoPath });
  },
  async log(repoPath: string, limit?: number): Promise<GitLogEntry[]> {
    return await invoke('git_log', { repoPath, limit });
  },
  async branches(repoPath: string): Promise<GitBranchInfo[]> {
    return await invoke('git_branches', { repoPath });
  },
  async checkoutBranch(repoPath: string, branchName: string): Promise<void> {
    return await invoke('git_checkout_branch', { repoPath, branchName });
  },
  async createBranch(repoPath: string, branchName: string): Promise<void> {
    return await invoke('git_create_branch', { repoPath, branchName });
  },
  async stageFiles(repoPath: string, files: string[]): Promise<void> {
    return await invoke('git_stage_files', { repoPath, files });
  },
  async unstageFiles(repoPath: string, files: string[]): Promise<void> {
    return await invoke('git_unstage_files', { repoPath, files });
  },
  async stageAll(repoPath: string): Promise<void> {
    return await invoke('git_stage_all', { repoPath });
  },
  async commit(repoPath: string, message: string, authorName?: string, authorEmail?: string): Promise<string> {
    return await invoke('git_commit_changes', { repoPath, message, authorName, authorEmail });
  },
  async diffWorking(repoPath: string): Promise<string> {
    return await invoke('git_diff_working', { repoPath });
  },
  async diffStaged(repoPath: string): Promise<string> {
    return await invoke('git_diff_staged', { repoPath });
  },
  async remoteInfo(repoPath: string): Promise<GitRemoteInfo[]> {
    return await invoke('git_remote_info', { repoPath });
  },
  async initNewRepo(repoPath: string): Promise<void> {
    return await invoke('git_init_repo', { repoPath });
  },
  async cloneRepo(url: string, targetPath: string): Promise<void> {
    return await invoke('git_clone_repo', { url, targetPath });
  },
  async currentBranch(repoPath: string): Promise<string> {
    return await invoke('git_current_branch', { repoPath });
  },
};

export const integrationsAPI = {
  async testJiraConnection(): Promise<boolean> {
    return await invoke('test_jira_connection');
  },

  async listJiraProjects(): Promise<JiraProject[]> {
    return await invoke('list_jira_projects');
  },

  async exportToJira(outputId: string, projectKey: string, issueType: string, summary: string): Promise<JiraExportResult> {
    return await invoke('export_to_jira', { outputId, projectKey, issueType, summary });
  },

  async testNotionConnection(): Promise<boolean> {
    return await invoke('test_notion_connection');
  },

  async searchNotionPages(query: string): Promise<NotionPage[]> {
    return await invoke('search_notion_pages', { query });
  },

  async exportToNotion(outputId: string, parentPageId: string, title: string): Promise<NotionExportResult> {
    return await invoke('export_to_notion', { outputId, parentPageId, title });
  },
};

export const fileSystemAPI = {
  async listDirectory(path: string): Promise<FileEntry[]> {
    return await invoke('list_directory', { path });
  },

  async listDirectoryAll(path: string): Promise<FileEntry[]> {
    return await invoke('list_directory_all', { path });
  },

  async readFile(path: string): Promise<string> {
    return await invoke('read_file_content', { path });
  },

  async writeFile(path: string, content: string): Promise<void> {
    return await invoke('write_file_content', { path, content });
  },

  async createFile(path: string): Promise<void> {
    return await invoke('create_new_file', { path });
  },

  async createDirectory(path: string): Promise<void> {
    return await invoke('create_new_directory', { path });
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    return await invoke('rename_fs_path', { oldPath, newPath });
  },

  async delete(path: string, isDir: boolean): Promise<void> {
    return await invoke('delete_fs_path', { path, isDir });
  },

  async getHomeDirectory(): Promise<string> {
    return await invoke('get_home_directory');
  },

  async getAppDirectory(): Promise<string> {
    return await invoke('get_app_directory');
  },
};

export const skillCategoriesAPI = {
  async list(): Promise<SkillCategory[]> {
    return await invoke('list_skill_categories');
  },
  async get(id: string): Promise<SkillCategory | null> {
    return await invoke('get_skill_category', { id });
  },
  async create(name: string, description: string, icon: string): Promise<SkillCategory> {
    return await invoke('create_skill_category', { name, description, icon });
  },
  async update(id: string, name?: string, description?: string, icon?: string): Promise<SkillCategory> {
    return await invoke('update_skill_category', { id, name, description, icon });
  },
  async delete(id: string): Promise<void> {
    return await invoke('delete_skill_category', { id });
  },
};

export const skillsAPI = {
  async list(category?: string): Promise<Skill[]> {
    return await invoke('list_skills', { category });
  },
  async get(id: string): Promise<Skill | null> {
    return await invoke('get_skill', { id });
  },
  async create(name: string, description: string, category: string, systemPrompt: string, tools: string, outputSchema: string | null, modelTier: string): Promise<Skill> {
    return await invoke('create_skill', { name, description, category, systemPrompt, tools, outputSchema, modelTier });
  },
  async update(id: string, updates: { name?: string; description?: string; category?: string; systemPrompt?: string; tools?: string; outputSchema?: string | null; modelTier?: string; isFavorite?: boolean }): Promise<Skill> {
    return await invoke('update_skill', { id, ...updates });
  },
  async delete(id: string): Promise<void> {
    return await invoke('delete_skill', { id });
  },
  async search(query: string): Promise<Skill[]> {
    return await invoke('search_skills', { query });
  },
  async duplicate(id: string, newName: string): Promise<Skill> {
    return await invoke('duplicate_skill', { id, newName });
  },
  async incrementUsage(id: string): Promise<void> {
    return await invoke('increment_skill_usage', { id });
  },
};

export const agentsAPI = {
  async list(): Promise<AgentDef[]> {
    return await invoke('list_agents');
  },
  async get(id: string): Promise<AgentDef | null> {
    return await invoke('get_agent', { id });
  },
  async create(data: { name: string; description: string; icon: string; systemInstructions: string; skillIds: string; model: string; provider: string; maxTokens: number; temperature: number; toolsConfig: string; contextStrategy: string }): Promise<AgentDef> {
    return await invoke('create_agent', data);
  },
  async update(id: string, updates: Record<string, unknown>): Promise<AgentDef> {
    return await invoke('update_agent', { id, ...updates });
  },
  async delete(id: string): Promise<void> {
    return await invoke('delete_agent', { id });
  },
  async search(query: string): Promise<AgentDef[]> {
    return await invoke('search_agents', { query });
  },
  async duplicate(id: string, newName: string): Promise<AgentDef> {
    return await invoke('duplicate_agent', { id, newName });
  },
  async incrementUsage(id: string): Promise<void> {
    return await invoke('increment_agent_usage', { id });
  },
};

export const agentRunsAPI = {
  async create(agentId: string, projectId: string, skillId: string | null, inputPrompt: string, model: string, provider: string): Promise<AgentRun> {
    return await invoke('create_agent_run', { agentId, projectId, skillId, inputPrompt, model, provider });
  },
  async get(id: string): Promise<AgentRun | null> {
    return await invoke('get_agent_run', { id });
  },
  async list(agentId?: string, projectId?: string): Promise<AgentRun[]> {
    return await invoke('list_agent_runs', { agentId, projectId });
  },
  async updateStatus(id: string, status: string, updates?: { outputContent?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; cost?: number; durationMs?: number; error?: string }): Promise<AgentRun> {
    return await invoke('update_agent_run_status', { id, status, ...updates });
  },
  async delete(id: string): Promise<void> {
    return await invoke('delete_agent_run', { id });
  },
  async getUsageStats(agentId: string): Promise<AgentUsageStats> {
    return await invoke('get_agent_usage_stats', { agentId });
  },
};

export const agentExecutionAPI = {
  async runStream(config: { agentId: string; projectId: string; prompt: string; skillId?: string; model: string; provider: string; apiKey: string; maxTokens: number; temperature: number; systemPrompt: string; skillPrompts?: string[] }): Promise<Response> {
    return fetch(`${SIDECAR_URL}/agent/run/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },
  async cancel(runId: string): Promise<void> {
    await fetch(`${SIDECAR_URL}/agent/run/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId }),
    });
  },
  async test(config: { prompt: string; model: string; provider: string; apiKey: string; systemPrompt: string }): Promise<Response> {
    return fetch(`${SIDECAR_URL}/agent/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },
};

// Phase 10: Agent Teams

export const agentTeamsAPI = {
  async list(): Promise<AgentTeam[]> {
    return invoke('list_agent_teams');
  },
  async get(id: string): Promise<AgentTeam | null> {
    return invoke('get_agent_team', { id });
  },
  async create(data: { name: string; description: string; icon: string; executionMode: string; conductorAgentId?: string | null; maxConcurrent: number }): Promise<AgentTeam> {
    return invoke('create_agent_team', { name: data.name, description: data.description, icon: data.icon, executionMode: data.executionMode, conductorAgentId: data.conductorAgentId ?? null, maxConcurrent: data.maxConcurrent });
  },
  async update(id: string, data: Partial<{ name: string; description: string; icon: string; executionMode: string; conductorAgentId: string | null; maxConcurrent: number; isFavorite: boolean }>): Promise<AgentTeam> {
    return invoke('update_agent_team', { id, ...data });
  },
  async delete(id: string): Promise<void> {
    return invoke('delete_agent_team', { id });
  },
  async duplicate(id: string, newName: string): Promise<AgentTeam> {
    return invoke('duplicate_agent_team', { id, newName });
  },
  async search(query: string): Promise<AgentTeam[]> {
    return invoke('search_agent_teams', { query });
  },
  async incrementUsage(id: string): Promise<void> {
    return invoke('increment_team_usage', { id });
  },
};

export const teamNodesAPI = {
  async list(teamId: string): Promise<AgentTeamNode[]> {
    return invoke('list_team_nodes', { teamId });
  },
  async create(data: { teamId: string; agentId: string; nodeType: string; positionX: number; positionY: number; role: string; config: string; sortOrder: number }): Promise<AgentTeamNode> {
    return invoke('create_team_node', data);
  },
  async update(id: string, data: Partial<{ positionX: number; positionY: number; role: string; config: string; sortOrder: number }>): Promise<AgentTeamNode> {
    return invoke('update_team_node', { id, ...data });
  },
  async delete(id: string): Promise<void> {
    return invoke('delete_team_node', { id });
  },
  async batchUpdate(updates: Array<{ id: string; position_x: number; position_y: number }>): Promise<void> {
    return invoke('batch_update_team_nodes', { updates });
  },
};

export const teamEdgesAPI = {
  async list(teamId: string): Promise<AgentTeamEdge[]> {
    return invoke('list_team_edges', { teamId });
  },
  async create(data: { teamId: string; sourceNodeId: string; targetNodeId: string; edgeType: string; condition?: string | null; dataMapping: string; label?: string | null }): Promise<AgentTeamEdge> {
    return invoke('create_team_edge', { teamId: data.teamId, sourceNodeId: data.sourceNodeId, targetNodeId: data.targetNodeId, edgeType: data.edgeType, condition: data.condition ?? null, dataMapping: data.dataMapping, label: data.label ?? null });
  },
  async update(id: string, data: Partial<{ edgeType: string; condition: string | null; dataMapping: string; label: string | null }>): Promise<AgentTeamEdge> {
    return invoke('update_team_edge', { id, ...data });
  },
  async delete(id: string): Promise<void> {
    return invoke('delete_team_edge', { id });
  },
};

export const teamRunsAPI = {
  async create(teamId: string, projectId: string, input: string, executionMode: string): Promise<TeamRun> {
    return invoke('create_team_run', { teamId, projectId, input, executionMode });
  },
  async get(id: string): Promise<TeamRun | null> {
    return invoke('get_team_run', { id });
  },
  async list(teamId: string, projectId: string): Promise<TeamRun[]> {
    return invoke('list_team_runs', { teamId, projectId });
  },
  async updateStatus(id: string, status: string, data?: Partial<{ output: string; totalTokens: number; totalCost: number; durationMs: number; error: string }>): Promise<void> {
    return invoke('update_team_run_status', { id, status, ...data });
  },
  async delete(id: string): Promise<void> {
    return invoke('delete_team_run', { id });
  },
};

export const teamExecutionAPI = {
  async runStream(config: {
    teamId: string; projectId: string; input: string; executionMode: string;
    nodes: Array<{ id: string; agentId: string; nodeType: string; role: string; config: string; sortOrder: number }>;
    edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; edgeType: string; condition?: string | null; dataMapping: string }>;
    apiKeys: Record<string, string>;
  }): Promise<Response> {
    return fetch(`${SIDECAR_URL}/team/run/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },
  async cancel(teamRunId: string): Promise<void> {
    await fetch(`${SIDECAR_URL}/team/run/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_run_id: teamRunId }),
    });
  },
};

// Phase 11: Schedules, Tracing, Analytics

export const schedulesAPI = {
  async list(): Promise<Schedule[]> {
    return invoke('list_schedules');
  },
  async get(id: string): Promise<Schedule | null> {
    return invoke('get_schedule', { id });
  },
  async create(data: { name: string; targetType: string; targetId: string; triggerType: string; triggerConfig: string; isActive?: boolean }): Promise<Schedule> {
    return invoke('create_schedule', data);
  },
  async update(id: string, data: Partial<{ name: string; targetType: string; targetId: string; triggerType: string; triggerConfig: string; isActive: boolean; nextRunAt: number }>): Promise<Schedule> {
    return invoke('update_schedule', { id, ...data });
  },
  async delete(id: string): Promise<void> {
    return invoke('delete_schedule', { id });
  },
  async getActive(): Promise<Schedule[]> {
    return invoke('get_active_schedules');
  },
  async updateRunStatus(id: string, lastRunAt: number, nextRunAt: number | null, runCount: number): Promise<void> {
    return invoke('update_schedule_run_status', { id, lastRunAt, nextRunAt, runCount });
  },
};

export const traceSpansAPI = {
  async create(data: { id: string; parentSpanId?: string | null; runId: string; runType: string; spanName: string; spanKind: string; input: string; metadata: string; startedAt: number }): Promise<TraceSpan> {
    return invoke('create_trace_span', { id: data.id, parentSpanId: data.parentSpanId ?? null, runId: data.runId, runType: data.runType, spanName: data.spanName, spanKind: data.spanKind, input: data.input, metadata: data.metadata, startedAt: data.startedAt });
  },
  async update(id: string, data: Partial<{ output: string; status: string; tokens: number; cost: number; endedAt: number }>): Promise<void> {
    return invoke('update_trace_span', { id, ...data });
  },
  async listForRun(runId: string): Promise<TraceSpan[]> {
    return invoke('list_trace_spans_for_run', { runId });
  },
  async get(id: string): Promise<TraceSpan | null> {
    return invoke('get_trace_span', { id });
  },
  async deleteForRun(runId: string): Promise<void> {
    return invoke('delete_trace_spans_for_run', { runId });
  },
};

export const analyticsAPI = {
  async getAgentAnalytics(startDate: string, endDate: string): Promise<AgentAnalytics[]> {
    return invoke('get_agent_analytics', { startDate, endDate });
  },
  async getSkillUsageAnalytics(startDate: string, endDate: string): Promise<SkillUsageAnalytics[]> {
    return invoke('get_skill_usage_analytics', { startDate, endDate });
  },
};

export const schedulerExecutionAPI = {
  async start(): Promise<void> {
    await fetch(`${SIDECAR_URL}/scheduler/start`, { method: 'POST' });
  },
  async stop(): Promise<void> {
    await fetch(`${SIDECAR_URL}/scheduler/stop`, { method: 'POST' });
  },
  async triggerNow(scheduleId: string): Promise<void> {
    await fetch(`${SIDECAR_URL}/scheduler/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId }),
    });
  },
};
