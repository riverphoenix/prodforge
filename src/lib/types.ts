export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

export interface Document {
  id: string;
  project_id: string;
  name: string;
  type: 'markdown' | 'pdf';
  content?: string;
  file_path?: string;
  created_at: number;
}

export interface DocumentEmbedding {
  id: string;
  document_id: string;
  chunk_text: string;
  chunk_index: number;
  embedding?: ArrayBuffer;
}

export interface Conversation {
  id: string;
  project_id: string;
  title?: string;
  model: string;
  total_tokens: number;
  total_cost: number;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens: number;
  created_at: number;
}

export interface ChatStreamEvent {
  type: 'conversation_id' | 'content_block_delta' | 'message_stop' | 'error';
  conversation_id?: string;
  delta?: {
    text: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  cost?: number;
  error?: string;
}

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  configured: boolean;
  models: string[];
}

export interface ModelOption {
  provider: LLMProvider;
  model: string;
  label: string;
}

export interface Settings {
  id: string;
  api_key_encrypted?: string;
  username?: string;
  name?: string;
  surname?: string;
  job_title?: string;
  company?: string;
  company_url?: string;
  profile_pic?: string;
  about_me?: string;
  about_role?: string;
  jira_url?: string;
  jira_email?: string;
  jira_api_token_encrypted?: string;
  jira_project_key?: string;
  notion_api_token_encrypted?: string;
  notion_parent_page_id?: string;
  anthropic_api_key_encrypted?: string;
  google_api_key_encrypted?: string;
  ollama_base_url?: string;
  default_provider?: string;
  enabled_models?: string;
  global_context?: string;
  created_at: number;
  updated_at: number;
}

export interface SettingsUpdate {
  api_key?: string;
  username?: string;
  name?: string;
  surname?: string;
  job_title?: string;
  company?: string;
  company_url?: string;
  profile_pic?: string;
  about_me?: string;
  about_role?: string;
  jira_url?: string;
  jira_email?: string;
  jira_api_token?: string;
  jira_project_key?: string;
  notion_api_token?: string;
  notion_parent_page_id?: string;
  anthropic_api_key?: string;
  google_api_key?: string;
  ollama_base_url?: string;
  default_provider?: string;
  enabled_models?: string;
  global_context?: string;
}

export interface TokenUsage {
  id: string;
  conversation_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  created_at: number;
  date: string;
}

export interface TokenUsageAggregate {
  date: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  conversation_count: number;
}

export interface ContextDocument {
  id: string;
  project_id: string;
  name: string;
  type: 'pdf' | 'url' | 'google_doc' | 'text';
  content: string;
  url?: string;
  is_global: boolean;
  size_bytes: number;
  created_at: number;
  folder_id: string | null;
  tags: string;
  is_favorite: boolean;
  sort_order: number;
}

export interface FrameworkOutput {
  id: string;
  project_id: string;
  framework_id: string;
  category: string;
  name: string;
  user_prompt: string;
  context_doc_ids: string;  // JSON array string
  generated_content: string;
  format: 'markdown' | 'html';
  created_at: number;
  updated_at: number;
  folder_id: string | null;
  tags: string;
  is_favorite: boolean;
  sort_order: number;
}

export interface Folder {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'context_doc' | 'framework_output';
  parent_id: string | null;
  sort_order: number;
  is_favorite: boolean;
  tags: string[];
  color?: string;
  doc_type?: string;
  category?: string;
  framework_id?: string;
  size_bytes?: number;
  created_at: number;
  children?: TreeNode[];
}

export interface SearchResult {
  id: string;
  name: string;
  item_type: string;
  folder_id: string | null;
  category: string | null;
  doc_type: string | null;
  is_favorite: boolean;
  created_at: number;
}

export interface CommandHistoryEntry {
  id: string;
  project_id: string;
  command: string;
  output: string;
  exit_code: number;
  created_at: number;
}

export interface CommandResult {
  output: string;
  exit_code: number;
  cwd: string;
}

export interface FrameworkDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  example_output: string;
  system_prompt: string;
  guiding_questions: string[];
  supports_visuals: boolean;
  visual_instructions?: string;
  is_builtin: boolean;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface FrameworkCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  is_builtin: boolean;
  sort_order: number;
  created_at: number;
  updated_at: number;
  frameworks: FrameworkDefinition[];
}

export interface PromptVariable {
  name: string;
  type: 'text' | 'select' | 'textarea';
  label?: string;
  placeholder?: string;
  options?: string[];
  required: boolean;
  default_value?: string;
}

export interface SavedPrompt {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt_text: string;
  variables: PromptVariable[];
  framework_id?: string;
  is_builtin: boolean;
  is_favorite: boolean;
  usage_count: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ImportPreview {
  item_type: 'framework' | 'prompt';
  id: string;
  name: string;
  category: string;
  description: string;
  already_exists: boolean;
  is_builtin_conflict: boolean;
}

export interface ImportResult {
  success: boolean;
  item_type: 'framework' | 'prompt';
  id: string;
  name: string;
  action: 'created' | 'overwritten' | 'copied' | 'skipped';
  error?: string;
}

export interface BatchExportResult {
  filename: string;
  content: string;
}

export type ConflictAction = 'overwrite' | 'copy' | 'skip';

export interface WorkflowStepDef {
  framework_id: string;
  label: string;
  prompt_template: string;
  context_doc_ids: string[];
  model: string;
}

export interface Workflow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  steps: string;
  is_template: boolean;
  created_at: number;
  updated_at: number;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  project_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

export interface WorkflowRunStep {
  id: string;
  run_id: string;
  step_index: number;
  framework_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input_prompt: string | null;
  output_content: string | null;
  output_id: string | null;
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
}

export interface ProjectInsight {
  id: string;
  project_id: string;
  insight_type: 'suggestion' | 'pattern' | 'next_step';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  framework_id: string | null;
  is_dismissed: boolean;
  created_at: number;
}

export interface CommitInfo {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface JiraExportResult {
  success: boolean;
  issue_key?: string;
  issue_url?: string;
  error?: string;
}

export interface NotionPage {
  id: string;
  title: string;
}

export interface NotionExportResult {
  success: boolean;
  page_url?: string;
  error?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
  extension: string;
}

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitBranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  upstream?: string;
}

export interface GitLogEntry {
  oid: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
}

export interface GitRemoteInfo {
  name: string;
  url: string;
}
