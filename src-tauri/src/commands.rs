use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use tauri::Manager;
use rusqlite::{Connection, params, OptionalExtension};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose};
use serde_yaml;
use git2::{Repository, Signature};
use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

fn terminal_cwds() -> &'static Mutex<HashMap<String, String>> {
    static CWD_MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CWD_MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub project_id: String,
    pub title: Option<String>,
    pub model: String,
    pub total_tokens: i32,
    pub total_cost: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub tokens: i32,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub id: String,
    pub api_key_encrypted: Option<String>,
    pub username: Option<String>,
    pub name: Option<String>,
    pub surname: Option<String>,
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub company_url: Option<String>,
    pub profile_pic: Option<String>,
    pub about_me: Option<String>,
    pub about_role: Option<String>,
    pub jira_url: Option<String>,
    pub jira_email: Option<String>,
    pub jira_api_token_encrypted: Option<String>,
    pub jira_project_key: Option<String>,
    pub notion_api_token_encrypted: Option<String>,
    pub notion_parent_page_id: Option<String>,
    pub anthropic_api_key_encrypted: Option<String>,
    pub google_api_key_encrypted: Option<String>,
    pub ollama_base_url: Option<String>,
    pub default_provider: Option<String>,
    pub enabled_models: Option<String>,
    pub global_context: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsUpdate {
    pub api_key: Option<String>,
    pub username: Option<String>,
    pub name: Option<String>,
    pub surname: Option<String>,
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub company_url: Option<String>,
    pub profile_pic: Option<String>,
    pub about_me: Option<String>,
    pub about_role: Option<String>,
    pub jira_url: Option<String>,
    pub jira_email: Option<String>,
    pub jira_api_token: Option<String>,
    pub jira_project_key: Option<String>,
    pub notion_api_token: Option<String>,
    pub notion_parent_page_id: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub google_api_key: Option<String>,
    pub ollama_base_url: Option<String>,
    pub default_provider: Option<String>,
    pub enabled_models: Option<String>,
    pub global_context: Option<String>,
}

// Encryption helpers
fn get_encryption_key(_app: &tauri::AppHandle) -> Result<[u8; 32], String> {
    // Derive a key from the app's unique identifier and machine ID
    let app_id = "com.dsotiriou.prodforge";
    let machine_id = machine_uid::get().unwrap_or_else(|_| "default-machine-id".to_string());

    let mut hasher = Sha256::new();
    hasher.update(app_id.as_bytes());
    hasher.update(machine_id.as_bytes());
    let hash = hasher.finalize();

    let mut key = [0u8; 32];
    key.copy_from_slice(&hash[..32]);
    Ok(key)
}

fn encrypt_string(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce_bytes = [0u8; 12]; // For production, use OsRng to generate random nonce
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    Ok(general_purpose::STANDARD.encode(ciphertext))
}

fn decrypt_string(encrypted: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce_bytes = [0u8; 12];
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 conversion failed: {}", e))
}

// Database connection helper
fn get_db_connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app directory: {}", e))?;

    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;

    let db_path = app_dir.join("prodforge.db");
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable foreign key constraints (required for CASCADE deletes)
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    Ok(conn)
}

// Initialize database tables (called on startup)
pub fn init_db(app: &tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(app)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create projects table: {}", e))?;

    let _ = conn.execute("ALTER TABLE projects ADD COLUMN workspace_state TEXT", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN repo_path TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT,
            file_path TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create documents table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id)",
        [],
    ).map_err(|e| format!("Failed to create documents index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS document_embeddings (
            id TEXT PRIMARY KEY NOT NULL,
            document_id TEXT NOT NULL,
            chunk_text TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            embedding BLOB,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create document_embeddings table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_embeddings_document_id ON document_embeddings(document_id)",
        [],
    ).map_err(|e| format!("Failed to create embeddings index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            title TEXT,
            model TEXT NOT NULL DEFAULT 'claude-sonnet-4',
            total_tokens INTEGER NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0.0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create conversations table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id)",
        [],
    ).map_err(|e| format!("Failed to create conversations index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY NOT NULL,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tokens INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create messages table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)",
        [],
    ).map_err(|e| format!("Failed to create messages index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY NOT NULL,
            api_key_encrypted TEXT,
            username TEXT,
            name TEXT,
            surname TEXT,
            job_title TEXT,
            company TEXT,
            company_url TEXT,
            profile_pic TEXT,
            about_me TEXT,
            about_role TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create settings table: {}", e))?;

    // Add username column if it doesn't exist (migration)
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN username TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN jira_url TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN jira_email TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN jira_api_token_encrypted TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN jira_project_key TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN notion_api_token_encrypted TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN notion_parent_page_id TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN anthropic_api_key_encrypted TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN google_api_key_encrypted TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN ollama_base_url TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN default_provider TEXT DEFAULT 'openai'", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN enabled_models TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN global_context TEXT", []);

    // Create token usage tracking table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS token_usage (
            id TEXT PRIMARY KEY NOT NULL,
            conversation_id TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            cost REAL NOT NULL,
            created_at INTEGER NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create token_usage table: {}", e))?;

    // Create index on date for efficient querying
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date)",
        [],
    ).map_err(|e| format!("Failed to create token_usage date index: {}", e))?;

    let _ = conn.execute("ALTER TABLE token_usage ADD COLUMN provider TEXT DEFAULT 'openai'", []);

    // Create context documents table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS context_documents (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            url TEXT,
            is_global INTEGER NOT NULL DEFAULT 0,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create context_documents table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_documents_project_id ON context_documents(project_id)",
        [],
    ).map_err(|e| format!("Failed to create context_documents index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_documents_global ON context_documents(is_global)",
        [],
    ).map_err(|e| format!("Failed to create context_documents global index: {}", e))?;

    // Create framework outputs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS framework_outputs (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            framework_id TEXT NOT NULL,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            user_prompt TEXT NOT NULL,
            context_doc_ids TEXT NOT NULL,
            generated_content TEXT NOT NULL,
            format TEXT NOT NULL DEFAULT 'markdown',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create framework_outputs table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_framework_outputs_project_id ON framework_outputs(project_id)",
        [],
    ).map_err(|e| format!("Failed to create framework_outputs index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_framework_outputs_framework_id ON framework_outputs(framework_id)",
        [],
    ).map_err(|e| format!("Failed to create framework_outputs framework index: {}", e))?;

    // Create folders table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            parent_id TEXT,
            name TEXT NOT NULL,
            color TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create folders table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id)",
        [],
    ).map_err(|e| format!("Failed to create folders project index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)",
        [],
    ).map_err(|e| format!("Failed to create folders parent index: {}", e))?;

    // Migrations: add folder_id, tags, is_favorite, sort_order to context_documents
    let _ = conn.execute("ALTER TABLE context_documents ADD COLUMN folder_id TEXT", []);
    let _ = conn.execute("ALTER TABLE context_documents ADD COLUMN tags TEXT DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE context_documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE context_documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0", []);

    // Migrations: add folder_id, tags, is_favorite, sort_order to framework_outputs
    let _ = conn.execute("ALTER TABLE framework_outputs ADD COLUMN folder_id TEXT", []);
    let _ = conn.execute("ALTER TABLE framework_outputs ADD COLUMN tags TEXT DEFAULT '[]'", []);
    let _ = conn.execute("ALTER TABLE framework_outputs ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE framework_outputs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0", []);

    // Create command_history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS command_history (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            command TEXT NOT NULL,
            output TEXT NOT NULL,
            exit_code INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create command_history table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_command_history_project ON command_history(project_id)",
        [],
    ).map_err(|e| format!("Failed to create command_history index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS framework_categories (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            icon TEXT NOT NULL,
            is_builtin INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create framework_categories table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS framework_definitions (
            id TEXT PRIMARY KEY NOT NULL,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            icon TEXT NOT NULL,
            example_output TEXT NOT NULL DEFAULT '',
            system_prompt TEXT NOT NULL DEFAULT '',
            guiding_questions TEXT NOT NULL DEFAULT '[]',
            supports_visuals INTEGER NOT NULL DEFAULT 0,
            visual_instructions TEXT,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (category) REFERENCES framework_categories(id)
        )",
        [],
    ).map_err(|e| format!("Failed to create framework_definitions table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_framework_defs_category ON framework_definitions(category)",
        [],
    ).map_err(|e| format!("Failed to create framework_definitions index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS saved_prompts (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            prompt_text TEXT NOT NULL,
            variables TEXT NOT NULL DEFAULT '[]',
            framework_id TEXT,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (framework_id) REFERENCES framework_definitions(id) ON DELETE SET NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create saved_prompts table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_prompts_category ON saved_prompts(category)",
        [],
    ).map_err(|e| format!("Failed to create saved_prompts index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_prompts_framework ON saved_prompts(framework_id)",
        [],
    ).map_err(|e| format!("Failed to create saved_prompts framework index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_insights (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            insight_type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'medium',
            framework_id TEXT,
            is_dismissed INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create project_insights table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_insights_project ON project_insights(project_id)",
        [],
    ).map_err(|e| format!("Failed to create project_insights index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            steps TEXT NOT NULL DEFAULT '[]',
            is_template INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create workflows table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id)",
        [],
    ).map_err(|e| format!("Failed to create workflows index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY NOT NULL,
            workflow_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at INTEGER,
            completed_at INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create workflow_runs table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)",
        [],
    ).map_err(|e| format!("Failed to create workflow_runs index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_run_steps (
            id TEXT PRIMARY KEY NOT NULL,
            run_id TEXT NOT NULL,
            step_index INTEGER NOT NULL,
            framework_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            input_prompt TEXT,
            output_content TEXT,
            output_id TEXT,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create workflow_run_steps table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_wrs_run ON workflow_run_steps(run_id)",
        [],
    ).map_err(|e| format!("Failed to create workflow_run_steps index: {}", e))?;

    // Migration: Recreate workflows table without FK constraint (needed for template seeding)
    let has_fk: bool = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='workflows'",
        [],
        |row| { let sql: String = row.get(0)?; Ok(sql.contains("FOREIGN KEY")) },
    ).unwrap_or(false);
    if has_fk {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE workflows_new (
                 id TEXT PRIMARY KEY NOT NULL,
                 project_id TEXT NOT NULL,
                 name TEXT NOT NULL,
                 description TEXT NOT NULL DEFAULT '',
                 steps TEXT NOT NULL DEFAULT '[]',
                 is_template INTEGER NOT NULL DEFAULT 0,
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO workflows_new SELECT * FROM workflows;
             DROP TABLE workflows;
             ALTER TABLE workflows_new RENAME TO workflows;
             CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id);
             COMMIT;"
        ).map_err(|e| format!("Failed to migrate workflows table: {}", e))?;
    }

    // Skills & Agents tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS skill_categories (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create skill_categories table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL,
            system_prompt TEXT NOT NULL DEFAULT '',
            tools TEXT NOT NULL DEFAULT '[]',
            output_schema TEXT,
            model_tier TEXT NOT NULL DEFAULT 'sonnet',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (category) REFERENCES skill_categories(id)
        )",
        [],
    ).map_err(|e| format!("Failed to create skills table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)",
        [],
    ).map_err(|e| format!("Failed to create skills index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '',
            system_instructions TEXT NOT NULL DEFAULT '',
            skill_ids TEXT NOT NULL DEFAULT '[]',
            model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
            provider TEXT NOT NULL DEFAULT 'anthropic',
            max_tokens INTEGER NOT NULL DEFAULT 4096,
            temperature REAL NOT NULL DEFAULT 0.7,
            tools_config TEXT NOT NULL DEFAULT '{}',
            context_strategy TEXT NOT NULL DEFAULT 'auto',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create agents table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY NOT NULL,
            agent_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            skill_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            input_prompt TEXT NOT NULL DEFAULT '',
            output_content TEXT,
            model TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT '',
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0.0,
            duration_ms INTEGER,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create agent_runs table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id)",
        [],
    ).map_err(|e| format!("Failed to create agent_runs agent index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id)",
        [],
    ).map_err(|e| format!("Failed to create agent_runs project index: {}", e))?;

    // Phase 10: Agent Teams tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_teams (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '',
            execution_mode TEXT NOT NULL DEFAULT 'sequential',
            conductor_agent_id TEXT,
            max_concurrent INTEGER NOT NULL DEFAULT 3,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create agent_teams table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_team_nodes (
            id TEXT PRIMARY KEY NOT NULL,
            team_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            node_type TEXT NOT NULL DEFAULT 'agent',
            position_x REAL NOT NULL DEFAULT 0.0,
            position_y REAL NOT NULL DEFAULT 0.0,
            role TEXT NOT NULL DEFAULT 'worker',
            config TEXT NOT NULL DEFAULT '{}',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )",
        [],
    ).map_err(|e| format!("Failed to create agent_team_nodes table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_nodes_team ON agent_team_nodes(team_id)",
        [],
    ).map_err(|e| format!("Failed to create team_nodes index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_team_edges (
            id TEXT PRIMARY KEY NOT NULL,
            team_id TEXT NOT NULL,
            source_node_id TEXT NOT NULL,
            target_node_id TEXT NOT NULL,
            edge_type TEXT NOT NULL DEFAULT 'data',
            condition TEXT,
            data_mapping TEXT NOT NULL DEFAULT '{}',
            label TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
            FOREIGN KEY (source_node_id) REFERENCES agent_team_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_node_id) REFERENCES agent_team_nodes(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create agent_team_edges table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_edges_team ON agent_team_edges(team_id)",
        [],
    ).map_err(|e| format!("Failed to create team_edges index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_runs (
            id TEXT PRIMARY KEY NOT NULL,
            team_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            input TEXT NOT NULL DEFAULT '',
            output TEXT,
            execution_mode TEXT NOT NULL DEFAULT 'sequential',
            total_tokens INTEGER NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0.0,
            duration_ms INTEGER,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create team_runs table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_runs_team ON team_runs(team_id)",
        [],
    ).map_err(|e| format!("Failed to create team_runs team index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_runs_project ON team_runs(project_id)",
        [],
    ).map_err(|e| format!("Failed to create team_runs project index: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_run_steps (
            id TEXT PRIMARY KEY NOT NULL,
            team_run_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            input TEXT NOT NULL DEFAULT '',
            output TEXT,
            tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0.0,
            duration_ms INTEGER,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (team_run_id) REFERENCES team_runs(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create team_run_steps table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_run_steps_run ON team_run_steps(team_run_id)",
        [],
    ).map_err(|e| format!("Failed to create team_run_steps index: {}", e))?;

    // Phase 11: Schedules
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            target_type TEXT NOT NULL DEFAULT 'agent',
            target_id TEXT NOT NULL,
            trigger_type TEXT NOT NULL DEFAULT 'interval',
            trigger_config TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 0,
            last_run_at INTEGER,
            next_run_at INTEGER,
            run_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create schedules table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_schedules_target ON schedules(target_id)",
        [],
    ).map_err(|e| format!("Failed to create schedules target index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(is_active)",
        [],
    ).map_err(|e| format!("Failed to create schedules active index: {}", e))?;

    // Phase 11: Trace Spans
    conn.execute(
        "CREATE TABLE IF NOT EXISTS trace_spans (
            id TEXT PRIMARY KEY NOT NULL,
            parent_span_id TEXT,
            run_id TEXT NOT NULL,
            run_type TEXT NOT NULL DEFAULT 'agent',
            span_name TEXT NOT NULL,
            span_kind TEXT NOT NULL DEFAULT 'agent',
            input TEXT NOT NULL DEFAULT '',
            output TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            tokens INTEGER,
            cost REAL,
            metadata TEXT NOT NULL DEFAULT '{}',
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            FOREIGN KEY (parent_span_id) REFERENCES trace_spans(id) ON DELETE SET NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create trace_spans table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_trace_spans_run ON trace_spans(run_id)",
        [],
    ).map_err(|e| format!("Failed to create trace_spans run index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_trace_spans_parent ON trace_spans(parent_span_id)",
        [],
    ).map_err(|e| format!("Failed to create trace_spans parent index: {}", e))?;

    // Phase 11: Add fallback_model and memory_config to agents
    let _ = conn.execute("ALTER TABLE agents ADD COLUMN fallback_model TEXT", []);
    let _ = conn.execute("ALTER TABLE agents ADD COLUMN memory_config TEXT DEFAULT '{}'", []);

    seed_frameworks(&conn)?;
    seed_prompts(&conn)?;
    seed_workflows(&conn)?;
    seed_skills(&conn)?;
    seed_agents(&conn)?;

    // Create default settings if none exist
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count settings: {}", e))?;

    if count == 0 {
        let now = Utc::now().timestamp();
        conn.execute(
            "INSERT INTO settings (id, created_at, updated_at) VALUES (?1, ?2, ?3)",
            params!["default", &now, &now],
        ).map_err(|e| format!("Failed to create default settings: {}", e))?;
    }

    Ok(())
}

fn seed_frameworks(conn: &Connection) -> Result<(), String> {
    let fw_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM framework_definitions WHERE is_builtin = 1", [], |row| row.get(0)
    ).unwrap_or(0);

    if fw_count >= 45 {
        return Ok(());
    }

    let now = Utc::now().timestamp();
    let categories_json = include_str!("../../src/frameworks/categories.json");
    let categories: Vec<serde_json::Value> = serde_json::from_str(categories_json)
        .map_err(|e| format!("Failed to parse seed categories: {}", e))?;

    for (i, cat) in categories.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO framework_categories (id, name, description, icon, is_builtin, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7)",
            params![
                cat["id"].as_str().unwrap_or(""),
                cat["name"].as_str().unwrap_or(""),
                cat["description"].as_str().unwrap_or(""),
                cat["icon"].as_str().unwrap_or(""),
                i as i32,
                &now,
                &now,
            ],
        ).map_err(|e| format!("Failed to seed category: {}", e))?;
    }

    let framework_files: &[&str] = &[
        // Strategy (8)
        include_str!("../../src/frameworks/strategy/business-model-canvas.json"),
        include_str!("../../src/frameworks/strategy/swot.json"),
        include_str!("../../src/frameworks/strategy/porters-five-forces.json"),
        include_str!("../../src/frameworks/strategy/lean-canvas.json"),
        include_str!("../../src/frameworks/strategy/value-proposition-canvas.json"),
        include_str!("../../src/frameworks/strategy/blue-ocean-strategy.json"),
        include_str!("../../src/frameworks/strategy/ansoff-matrix.json"),
        include_str!("../../src/frameworks/strategy/strategic-planning.json"),
        // Prioritization (6)
        include_str!("../../src/frameworks/prioritization/rice.json"),
        include_str!("../../src/frameworks/prioritization/moscow.json"),
        include_str!("../../src/frameworks/prioritization/kano-model.json"),
        include_str!("../../src/frameworks/prioritization/ice-scoring.json"),
        include_str!("../../src/frameworks/prioritization/value-effort-matrix.json"),
        include_str!("../../src/frameworks/prioritization/weighted-scoring.json"),
        // Discovery (8)
        include_str!("../../src/frameworks/discovery/jtbd.json"),
        include_str!("../../src/frameworks/discovery/customer-journey-map.json"),
        include_str!("../../src/frameworks/discovery/user-personas.json"),
        include_str!("../../src/frameworks/discovery/empathy-map.json"),
        include_str!("../../src/frameworks/discovery/problem-statement.json"),
        include_str!("../../src/frameworks/discovery/competitive-analysis.json"),
        include_str!("../../src/frameworks/discovery/survey-design.json"),
        include_str!("../../src/frameworks/discovery/feature-audit.json"),
        // Development (5)
        include_str!("../../src/frameworks/development/sprint-planning.json"),
        include_str!("../../src/frameworks/development/technical-spec.json"),
        include_str!("../../src/frameworks/development/architecture-decision-record.json"),
        include_str!("../../src/frameworks/development/definition-of-done.json"),
        include_str!("../../src/frameworks/development/release-plan.json"),
        // Execution (6)
        include_str!("../../src/frameworks/execution/okrs.json"),
        include_str!("../../src/frameworks/execution/north-star-metric.json"),
        include_str!("../../src/frameworks/execution/kpi-dashboard.json"),
        include_str!("../../src/frameworks/execution/retrospective.json"),
        include_str!("../../src/frameworks/execution/roadmap-template.json"),
        include_str!("../../src/frameworks/execution/success-metrics.json"),
        // Decision Making (5)
        include_str!("../../src/frameworks/decision/decision-matrix.json"),
        include_str!("../../src/frameworks/decision/raci.json"),
        include_str!("../../src/frameworks/decision/pre-mortem.json"),
        include_str!("../../src/frameworks/decision/opportunity-assessment.json"),
        include_str!("../../src/frameworks/decision/trade-off-analysis.json"),
        // Communication (7)
        include_str!("../../src/frameworks/communication/prd.json"),
        include_str!("../../src/frameworks/communication/user-stories.json"),
        include_str!("../../src/frameworks/communication/stakeholder-update.json"),
        include_str!("../../src/frameworks/communication/launch-plan.json"),
        include_str!("../../src/frameworks/communication/feature-brief.json"),
        include_str!("../../src/frameworks/communication/product-vision.json"),
        include_str!("../../src/frameworks/communication/changelog.json"),
    ];

    for (i, fw_json) in framework_files.iter().enumerate() {
        let fw: serde_json::Value = serde_json::from_str(fw_json)
            .map_err(|e| format!("Failed to parse seed framework: {}", e))?;

        let guiding_questions = fw["guiding_questions"].to_string();
        let supports_visuals = fw["supports_visuals"].as_bool().unwrap_or(false);

        conn.execute(
            "INSERT OR IGNORE INTO framework_definitions (id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?13)",
            params![
                fw["id"].as_str().unwrap_or(""),
                fw["category"].as_str().unwrap_or(""),
                fw["name"].as_str().unwrap_or(""),
                fw["description"].as_str().unwrap_or(""),
                fw["icon"].as_str().unwrap_or(""),
                fw["example_output"].as_str().unwrap_or(""),
                fw["system_prompt"].as_str().unwrap_or(""),
                &guiding_questions,
                supports_visuals,
                fw["visual_instructions"].as_str(),
                i as i32,
                &now,
                &now,
            ],
        ).map_err(|e| format!("Failed to seed framework: {}", e))?;
    }

    Ok(())
}

fn seed_prompts(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM saved_prompts", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count saved_prompts: {}", e))?;

    if count > 0 {
        return Ok(());
    }

    let now = Utc::now().timestamp();
    let prompt_files: &[&str] = &[
        // PRD (5)
        include_str!("../../src/prompts/prd/prd-from-jtbd.json"),
        include_str!("../../src/prompts/prd/technical-prd.json"),
        include_str!("../../src/prompts/prd/one-pager.json"),
        include_str!("../../src/prompts/prd/feature-spec.json"),
        include_str!("../../src/prompts/prd/api-specification.json"),
        // Analysis (5)
        include_str!("../../src/prompts/analysis/competitive-analysis.json"),
        include_str!("../../src/prompts/analysis/feature-comparison.json"),
        include_str!("../../src/prompts/analysis/market-positioning.json"),
        include_str!("../../src/prompts/analysis/feedback-synthesis.json"),
        include_str!("../../src/prompts/analysis/churn-analysis.json"),
        // Stories (5)
        include_str!("../../src/prompts/stories/jtbd-to-stories.json"),
        include_str!("../../src/prompts/stories/epic-breakdown.json"),
        include_str!("../../src/prompts/stories/invest-criteria.json"),
        include_str!("../../src/prompts/stories/acceptance-criteria.json"),
        include_str!("../../src/prompts/stories/story-estimation.json"),
        // Communication (5)
        include_str!("../../src/prompts/communication/stakeholder-email.json"),
        include_str!("../../src/prompts/communication/executive-summary.json"),
        include_str!("../../src/prompts/communication/product-announcement.json"),
        include_str!("../../src/prompts/communication/release-notes.json"),
        include_str!("../../src/prompts/communication/team-update.json"),
        // Data (4)
        include_str!("../../src/prompts/data/metrics-analysis.json"),
        include_str!("../../src/prompts/data/ab-test-analysis.json"),
        include_str!("../../src/prompts/data/kpi-review.json"),
        include_str!("../../src/prompts/data/funnel-analysis.json"),
        // Prioritization (3)
        include_str!("../../src/prompts/prioritization/quarterly-priorities.json"),
        include_str!("../../src/prompts/prioritization/feature-scoring.json"),
        include_str!("../../src/prompts/prioritization/resource-allocation.json"),
        // Strategy (3)
        include_str!("../../src/prompts/strategy/okr-drafting.json"),
        include_str!("../../src/prompts/strategy/strategic-initiative.json"),
        include_str!("../../src/prompts/strategy/vision-alignment.json"),
    ];

    for (i, prompt_json) in prompt_files.iter().enumerate() {
        let p: serde_json::Value = serde_json::from_str(prompt_json)
            .map_err(|e| format!("Failed to parse seed prompt: {}", e))?;

        let variables = p["variables"].to_string();

        conn.execute(
            "INSERT OR IGNORE INTO saved_prompts (id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 0, 0, ?8, ?9, ?10)",
            params![
                p["id"].as_str().unwrap_or(""),
                p["name"].as_str().unwrap_or(""),
                p["description"].as_str().unwrap_or(""),
                p["category"].as_str().unwrap_or("general"),
                p["prompt_text"].as_str().unwrap_or(""),
                &variables,
                p["framework_id"].as_str(),
                i as i32,
                &now,
                &now,
            ],
        ).map_err(|e| format!("Failed to seed prompt: {}", e))?;
    }

    Ok(())
}

fn row_to_saved_prompt(row: &rusqlite::Row) -> rusqlite::Result<SavedPromptRow> {
    Ok(SavedPromptRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        category: row.get(3)?,
        prompt_text: row.get(4)?,
        variables: row.get(5)?,
        framework_id: row.get(6)?,
        is_builtin: row.get::<_, i32>(7)? != 0,
        is_favorite: row.get::<_, i32>(8)? != 0,
        usage_count: row.get(9)?,
        sort_order: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn row_to_category(row: &rusqlite::Row) -> rusqlite::Result<FrameworkCategoryRow> {
    Ok(FrameworkCategoryRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        is_builtin: row.get::<_, i32>(4)? != 0,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn row_to_framework_def(row: &rusqlite::Row) -> rusqlite::Result<FrameworkDefRow> {
    Ok(FrameworkDefRow {
        id: row.get(0)?,
        category: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        icon: row.get(4)?,
        example_output: row.get(5)?,
        system_prompt: row.get(6)?,
        guiding_questions: row.get(7)?,
        supports_visuals: row.get::<_, i32>(8)? != 0,
        visual_instructions: row.get(9)?,
        is_builtin: row.get::<_, i32>(10)? != 0,
        sort_order: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const FRAMEWORK_DEF_COLUMNS: &str = "id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at";

#[tauri::command]
pub async fn list_framework_categories(app: tauri::AppHandle) -> Result<Vec<FrameworkCategoryRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, icon, is_builtin, sort_order, created_at, updated_at
         FROM framework_categories ORDER BY sort_order ASC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let rows = stmt.query_map([], row_to_category)
        .map_err(|e| format!("Failed to query categories: {}", e))?;
    let result: Result<Vec<_>, _> = rows.collect();
    result.map_err(|e| format!("Failed to collect categories: {}", e))
}

#[tauri::command]
pub async fn get_framework_category(id: String, app: tauri::AppHandle) -> Result<Option<FrameworkCategoryRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, icon, is_builtin, sort_order, created_at, updated_at
         FROM framework_categories WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let cat = stmt.query_row(params![&id], row_to_category).optional()
        .map_err(|e| format!("Failed to get category: {}", e))?;
    Ok(cat)
}

#[tauri::command]
pub async fn create_framework_category(
    name: String,
    description: String,
    icon: String,
    app: tauri::AppHandle,
) -> Result<FrameworkCategoryRow, String> {
    let conn = get_db_connection(&app)?;
    let id = name.to_lowercase().replace(' ', "-");
    let now = Utc::now().timestamp();

    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM framework_categories", [], |row| row.get(0)
    ).map_err(|e| format!("Failed to get max sort_order: {}", e))?;

    conn.execute(
        "INSERT INTO framework_categories (id, name, description, icon, is_builtin, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
        params![&id, &name, &description, &icon, max_order + 1, &now, &now],
    ).map_err(|e| format!("Failed to create category: {}", e))?;

    Ok(FrameworkCategoryRow { id, name, description, icon, is_builtin: false, sort_order: max_order + 1, created_at: now, updated_at: now })
}

#[tauri::command]
pub async fn update_framework_category(
    id: String,
    name: String,
    description: String,
    icon: String,
    app: tauri::AppHandle,
) -> Result<FrameworkCategoryRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE framework_categories SET name = ?1, description = ?2, icon = ?3, updated_at = ?4 WHERE id = ?5",
        params![&name, &description, &icon, &now, &id],
    ).map_err(|e| format!("Failed to update category: {}", e))?;

    get_framework_category(id, app).await?
        .ok_or_else(|| "Category not found after update".to_string())
}

#[tauri::command]
pub async fn delete_framework_category(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    let is_builtin: i32 = conn.query_row(
        "SELECT is_builtin FROM framework_categories WHERE id = ?1", params![&id], |row| row.get(0)
    ).map_err(|e| format!("Category not found: {}", e))?;

    if is_builtin != 0 {
        return Err("Cannot delete built-in category".to_string());
    }

    let fw_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM framework_definitions WHERE category = ?1", params![&id], |row| row.get(0)
    ).map_err(|e| format!("Failed to count frameworks: {}", e))?;

    if fw_count > 0 {
        return Err("Cannot delete category with frameworks. Delete or move frameworks first.".to_string());
    }

    conn.execute("DELETE FROM framework_categories WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete category: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_framework_defs(category: Option<String>, app: tauri::AppHandle) -> Result<Vec<FrameworkDefRow>, String> {
    let conn = get_db_connection(&app)?;

    if let Some(ref cat) = category {
        let q = format!("SELECT {} FROM framework_definitions WHERE category = ?1 ORDER BY sort_order ASC", FRAMEWORK_DEF_COLUMNS);
        let mut stmt = conn.prepare(&q).map_err(|e| format!("Failed to prepare: {}", e))?;
        let rows = stmt.query_map(params![cat], row_to_framework_def)
            .map_err(|e| format!("Failed to query: {}", e))?;
        let r: Result<Vec<_>, _> = rows.collect();
        r.map_err(|e| format!("Failed to collect: {}", e))
    } else {
        let q = format!("SELECT {} FROM framework_definitions ORDER BY sort_order ASC", FRAMEWORK_DEF_COLUMNS);
        let mut stmt = conn.prepare(&q).map_err(|e| format!("Failed to prepare: {}", e))?;
        let rows = stmt.query_map([], row_to_framework_def)
            .map_err(|e| format!("Failed to query: {}", e))?;
        let r: Result<Vec<_>, _> = rows.collect();
        r.map_err(|e| format!("Failed to collect: {}", e))
    }
}

#[tauri::command]
pub async fn get_framework_def(id: String, app: tauri::AppHandle) -> Result<Option<FrameworkDefRow>, String> {
    let conn = get_db_connection(&app)?;
    let q = format!("SELECT {} FROM framework_definitions WHERE id = ?1", FRAMEWORK_DEF_COLUMNS);
    let mut stmt = conn.prepare(&q).map_err(|e| format!("Failed to prepare: {}", e))?;

    let fw = stmt.query_row(params![&id], row_to_framework_def).optional()
        .map_err(|e| format!("Failed to get framework: {}", e))?;
    Ok(fw)
}

#[tauri::command]
pub async fn create_framework_def(
    category: String,
    name: String,
    description: String,
    icon: String,
    system_prompt: String,
    guiding_questions: String,
    example_output: String,
    supports_visuals: bool,
    visual_instructions: Option<String>,
    app: tauri::AppHandle,
) -> Result<FrameworkDefRow, String> {
    let conn = get_db_connection(&app)?;
    let id = name.to_lowercase().replace(' ', "-").replace('(', "").replace(')', "");
    let now = Utc::now().timestamp();

    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM framework_definitions WHERE category = ?1", params![&category], |row| row.get(0)
    ).map_err(|e| format!("Failed to get max sort_order: {}", e))?;

    conn.execute(
        &format!("INSERT INTO framework_definitions ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12, ?13)", FRAMEWORK_DEF_COLUMNS),
        params![&id, &category, &name, &description, &icon, &example_output, &system_prompt, &guiding_questions, supports_visuals, &visual_instructions, max_order + 1, &now, &now],
    ).map_err(|e| format!("Failed to create framework: {}", e))?;

    Ok(FrameworkDefRow {
        id, category, name, description, icon, example_output, system_prompt, guiding_questions,
        supports_visuals, visual_instructions, is_builtin: false, sort_order: max_order + 1,
        created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_framework_def(
    id: String,
    category: Option<String>,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    system_prompt: Option<String>,
    guiding_questions: Option<String>,
    example_output: Option<String>,
    supports_visuals: Option<bool>,
    visual_instructions: Option<String>,
    app: tauri::AppHandle,
) -> Result<FrameworkDefRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE framework_definitions SET
            category = COALESCE(?1, category),
            name = COALESCE(?2, name),
            description = COALESCE(?3, description),
            icon = COALESCE(?4, icon),
            system_prompt = COALESCE(?5, system_prompt),
            guiding_questions = COALESCE(?6, guiding_questions),
            example_output = COALESCE(?7, example_output),
            supports_visuals = COALESCE(?8, supports_visuals),
            visual_instructions = COALESCE(?9, visual_instructions),
            updated_at = ?10
         WHERE id = ?11",
        params![
            &category, &name, &description, &icon, &system_prompt,
            &guiding_questions, &example_output,
            supports_visuals.map(|v| if v { 1 } else { 0 }),
            &visual_instructions, &now, &id
        ],
    ).map_err(|e| format!("Failed to update framework: {}", e))?;

    get_framework_def(id, app).await?
        .ok_or_else(|| "Framework not found after update".to_string())
}

#[tauri::command]
pub async fn delete_framework_def(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    let is_builtin: i32 = conn.query_row(
        "SELECT is_builtin FROM framework_definitions WHERE id = ?1", params![&id], |row| row.get(0)
    ).map_err(|e| format!("Framework not found: {}", e))?;

    if is_builtin != 0 {
        return Err("Cannot delete built-in framework".to_string());
    }

    conn.execute("DELETE FROM framework_definitions WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete framework: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn reset_framework_def(id: String, app: tauri::AppHandle) -> Result<FrameworkDefRow, String> {
    let conn = get_db_connection(&app)?;

    let is_builtin: i32 = conn.query_row(
        "SELECT is_builtin FROM framework_definitions WHERE id = ?1", params![&id], |row| row.get(0)
    ).map_err(|e| format!("Framework not found: {}", e))?;

    if is_builtin == 0 {
        return Err("Can only reset built-in frameworks".to_string());
    }

    let framework_files: &[&str] = &[
        // Strategy (8)
        include_str!("../../src/frameworks/strategy/business-model-canvas.json"),
        include_str!("../../src/frameworks/strategy/swot.json"),
        include_str!("../../src/frameworks/strategy/porters-five-forces.json"),
        include_str!("../../src/frameworks/strategy/lean-canvas.json"),
        include_str!("../../src/frameworks/strategy/value-proposition-canvas.json"),
        include_str!("../../src/frameworks/strategy/blue-ocean-strategy.json"),
        include_str!("../../src/frameworks/strategy/ansoff-matrix.json"),
        include_str!("../../src/frameworks/strategy/strategic-planning.json"),
        // Prioritization (6)
        include_str!("../../src/frameworks/prioritization/rice.json"),
        include_str!("../../src/frameworks/prioritization/moscow.json"),
        include_str!("../../src/frameworks/prioritization/kano-model.json"),
        include_str!("../../src/frameworks/prioritization/ice-scoring.json"),
        include_str!("../../src/frameworks/prioritization/value-effort-matrix.json"),
        include_str!("../../src/frameworks/prioritization/weighted-scoring.json"),
        // Discovery (8)
        include_str!("../../src/frameworks/discovery/jtbd.json"),
        include_str!("../../src/frameworks/discovery/customer-journey-map.json"),
        include_str!("../../src/frameworks/discovery/user-personas.json"),
        include_str!("../../src/frameworks/discovery/empathy-map.json"),
        include_str!("../../src/frameworks/discovery/problem-statement.json"),
        include_str!("../../src/frameworks/discovery/competitive-analysis.json"),
        include_str!("../../src/frameworks/discovery/survey-design.json"),
        include_str!("../../src/frameworks/discovery/feature-audit.json"),
        // Development (5)
        include_str!("../../src/frameworks/development/sprint-planning.json"),
        include_str!("../../src/frameworks/development/technical-spec.json"),
        include_str!("../../src/frameworks/development/architecture-decision-record.json"),
        include_str!("../../src/frameworks/development/definition-of-done.json"),
        include_str!("../../src/frameworks/development/release-plan.json"),
        // Execution (6)
        include_str!("../../src/frameworks/execution/okrs.json"),
        include_str!("../../src/frameworks/execution/north-star-metric.json"),
        include_str!("../../src/frameworks/execution/kpi-dashboard.json"),
        include_str!("../../src/frameworks/execution/retrospective.json"),
        include_str!("../../src/frameworks/execution/roadmap-template.json"),
        include_str!("../../src/frameworks/execution/success-metrics.json"),
        // Decision Making (5)
        include_str!("../../src/frameworks/decision/decision-matrix.json"),
        include_str!("../../src/frameworks/decision/raci.json"),
        include_str!("../../src/frameworks/decision/pre-mortem.json"),
        include_str!("../../src/frameworks/decision/opportunity-assessment.json"),
        include_str!("../../src/frameworks/decision/trade-off-analysis.json"),
        // Communication (7)
        include_str!("../../src/frameworks/communication/prd.json"),
        include_str!("../../src/frameworks/communication/user-stories.json"),
        include_str!("../../src/frameworks/communication/stakeholder-update.json"),
        include_str!("../../src/frameworks/communication/launch-plan.json"),
        include_str!("../../src/frameworks/communication/feature-brief.json"),
        include_str!("../../src/frameworks/communication/product-vision.json"),
        include_str!("../../src/frameworks/communication/changelog.json"),
    ];

    let now = Utc::now().timestamp();
    for fw_json in framework_files {
        let fw: serde_json::Value = serde_json::from_str(fw_json)
            .map_err(|e| format!("Failed to parse framework: {}", e))?;
        if fw["id"].as_str() == Some(id.as_str()) {
            conn.execute(
                "UPDATE framework_definitions SET system_prompt = ?1, guiding_questions = ?2, example_output = ?3, visual_instructions = ?4, updated_at = ?5 WHERE id = ?6",
                params![
                    fw["system_prompt"].as_str().unwrap_or(""),
                    fw["guiding_questions"].to_string(),
                    fw["example_output"].as_str().unwrap_or(""),
                    fw["visual_instructions"].as_str(),
                    &now,
                    &id,
                ],
            ).map_err(|e| format!("Failed to reset framework: {}", e))?;

            return get_framework_def(id, app).await?
                .ok_or_else(|| "Framework not found after reset".to_string());
        }
    }

    Err(format!("No seed data found for framework '{}'", id))
}

#[tauri::command]
pub async fn search_framework_defs(query: String, app: tauri::AppHandle) -> Result<Vec<FrameworkDefRow>, String> {
    let conn = get_db_connection(&app)?;
    let search = format!("%{}%", query);
    let q = format!("SELECT {} FROM framework_definitions WHERE name LIKE ?1 OR description LIKE ?1 ORDER BY sort_order ASC", FRAMEWORK_DEF_COLUMNS);
    let mut stmt = conn.prepare(&q).map_err(|e| format!("Failed to prepare: {}", e))?;

    let rows = stmt.query_map(params![&search], row_to_framework_def)
        .map_err(|e| format!("Failed to search: {}", e))?;
    let result: Result<Vec<_>, _> = rows.collect();
    result.map_err(|e| format!("Failed to collect: {}", e))
}

#[tauri::command]
pub async fn duplicate_framework_def(id: String, new_name: String, app: tauri::AppHandle) -> Result<FrameworkDefRow, String> {
    let original = get_framework_def(id.clone(), app.clone()).await?
        .ok_or_else(|| format!("Framework '{}' not found", id))?;

    let conn = get_db_connection(&app)?;
    let new_id = new_name.to_lowercase().replace(' ', "-").replace('(', "").replace(')', "");
    let now = Utc::now().timestamp();

    conn.execute(
        &format!("INSERT INTO framework_definitions ({}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12, ?13)", FRAMEWORK_DEF_COLUMNS),
        params![
            &new_id, &original.category, &new_name, &original.description, &original.icon,
            &original.example_output, &original.system_prompt, &original.guiding_questions,
            original.supports_visuals, &original.visual_instructions, original.sort_order + 1, &now, &now
        ],
    ).map_err(|e| format!("Failed to duplicate framework: {}", e))?;

    get_framework_def(new_id, app).await?
        .ok_or_else(|| "Framework not found after duplicate".to_string())
}

#[tauri::command]
pub async fn create_project(
    name: String,
    description: Option<String>,
    app: tauri::AppHandle,
) -> Result<Project, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let project = Project {
        id: id.clone(),
        name: name.clone(),
        description: description.clone(),
        created_at: now,
        updated_at: now,
    };

    conn.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![&id, &name, &description.unwrap_or_default(), &now, &now],
    ).map_err(|e| format!("Failed to create project: {}", e))?;

    Ok(project)
}

#[tauri::command]
pub async fn list_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare("SELECT id, name, description, created_at, updated_at FROM projects ORDER BY updated_at DESC")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: {
                let desc: String = row.get(2)?;
                if desc.is_empty() { None } else { Some(desc) }
            },
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    }).map_err(|e| format!("Failed to query projects: {}", e))?;

    let result: Result<Vec<Project>, _> = projects.collect();
    result.map_err(|e| format!("Failed to collect projects: {}", e))
}

#[tauri::command]
pub async fn get_project(id: String, app: tauri::AppHandle) -> Result<Option<Project>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare("SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?1")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let project = stmt.query_row(params![&id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: {
                let desc: String = row.get(2)?;
                if desc.is_empty() { None } else { Some(desc) }
            },
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    }).optional()
        .map_err(|e| format!("Failed to get project: {}", e))?;

    Ok(project)
}

#[tauri::command]
pub async fn update_project(
    id: String,
    name: String,
    description: Option<String>,
    app: tauri::AppHandle,
) -> Result<Project, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE projects SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
        params![&name, &description.unwrap_or_default(), &now, &id],
    ).map_err(|e| format!("Failed to update project: {}", e))?;

    // Fetch the updated project
    get_project(id, app).await?
        .ok_or_else(|| "Project not found after update".to_string())
}

#[tauri::command]
pub async fn delete_project(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    conn.execute(
        "DELETE FROM projects WHERE id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to delete project: {}", e))?;

    Ok(())
}

// Conversation commands

#[tauri::command]
pub async fn create_conversation(
    project_id: String,
    title: Option<String>,
    model: String,
    app: tauri::AppHandle,
) -> Result<Conversation, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let conversation = Conversation {
        id: id.clone(),
        project_id: project_id.clone(),
        title: title.clone(),
        model: model.clone(),
        total_tokens: 0,
        total_cost: 0.0,
        created_at: now,
        updated_at: now,
    };

    conn.execute(
        "INSERT INTO conversations (id, project_id, title, model, total_tokens, total_cost, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![&id, &project_id, &title.unwrap_or_default(), &model, &0, &0.0, &now, &now],
    ).map_err(|e| format!("Failed to create conversation: {}", e))?;

    Ok(conversation)
}

#[tauri::command]
pub async fn list_conversations(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Conversation>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, model, total_tokens, total_cost, created_at, updated_at
         FROM conversations
         WHERE project_id = ?1
         ORDER BY updated_at DESC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let conversations = stmt.query_map(params![&project_id], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: {
                let title: String = row.get(2)?;
                if title.is_empty() { None } else { Some(title) }
            },
            model: row.get(3)?,
            total_tokens: row.get(4)?,
            total_cost: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).map_err(|e| format!("Failed to query conversations: {}", e))?;

    let result: Result<Vec<Conversation>, _> = conversations.collect();
    result.map_err(|e| format!("Failed to collect conversations: {}", e))
}

#[tauri::command]
pub async fn get_conversation(
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<Conversation>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, model, total_tokens, total_cost, created_at, updated_at
         FROM conversations
         WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let conversation = stmt.query_row(params![&id], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: {
                let title: String = row.get(2)?;
                if title.is_empty() { None } else { Some(title) }
            },
            model: row.get(3)?,
            total_tokens: row.get(4)?,
            total_cost: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).optional()
        .map_err(|e| format!("Failed to get conversation: {}", e))?;

    Ok(conversation)
}

#[tauri::command]
pub async fn add_message(
    conversation_id: String,
    role: String,
    content: String,
    tokens: i32,
    app: tauri::AppHandle,
) -> Result<Message, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let message = Message {
        id: id.clone(),
        conversation_id: conversation_id.clone(),
        role: role.clone(),
        content: content.clone(),
        tokens,
        created_at: now,
    };

    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, tokens, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![&id, &conversation_id, &role, &content, &tokens, &now],
    ).map_err(|e| format!("Failed to add message: {}", e))?;

    Ok(message)
}

#[tauri::command]
pub async fn get_messages(
    conversation_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Message>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, tokens, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let messages = stmt.query_map(params![&conversation_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            tokens: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| format!("Failed to query messages: {}", e))?;

    let result: Result<Vec<Message>, _> = messages.collect();
    result.map_err(|e| format!("Failed to collect messages: {}", e))
}

#[tauri::command]
pub async fn update_conversation_stats(
    id: String,
    tokens: i32,
    cost: f64,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE conversations
         SET total_tokens = total_tokens + ?1,
             total_cost = total_cost + ?2,
             updated_at = ?3
         WHERE id = ?4",
        params![&tokens, &cost, &now, &id],
    ).map_err(|e| format!("Failed to update conversation stats: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_conversation(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to delete conversation: {}", e))?;

    Ok(())
}

// Token usage tracking commands

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsage {
    pub id: String,
    pub conversation_id: String,
    pub model: String,
    pub provider: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    pub cost: f64,
    pub created_at: i64,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsageAggregate {
    pub date: String,
    pub total_tokens: i32,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cost: f64,
    pub conversation_count: i32,
}

#[tauri::command]
pub async fn record_token_usage(
    conversation_id: String,
    model: String,
    input_tokens: i32,
    output_tokens: i32,
    cost: f64,
    provider: Option<String>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let timestamp = now.timestamp();
    let date = now.format("%Y-%m-%d").to_string();
    let total_tokens = input_tokens + output_tokens;
    let provider_val = provider.unwrap_or_else(|| "openai".to_string());

    conn.execute(
        "INSERT INTO token_usage (id, conversation_id, model, input_tokens, output_tokens, total_tokens, cost, created_at, date, provider)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![&id, &conversation_id, &model, &input_tokens, &output_tokens, &total_tokens, &cost, &timestamp, &date, &provider_val],
    ).map_err(|e| format!("Failed to record token usage: {}", e))?;

    Ok(id)
}

#[tauri::command]
pub async fn get_token_usage_by_date_range(
    start_date: String,
    end_date: String,
    view_type: String, // "daily" or "monthly"
    app: tauri::AppHandle,
) -> Result<Vec<TokenUsageAggregate>, String> {
    let conn = get_db_connection(&app)?;

    let date_format = if view_type == "monthly" {
        "%Y-%m"
    } else {
        "%Y-%m-%d"
    };

    let query = format!(
        "SELECT
            strftime('{}', date) as period,
            SUM(total_tokens) as total_tokens,
            SUM(input_tokens) as input_tokens,
            SUM(output_tokens) as output_tokens,
            SUM(cost) as cost,
            COUNT(DISTINCT conversation_id) as conversation_count
         FROM token_usage
         WHERE date >= ?1 AND date <= ?2
         GROUP BY period
         ORDER BY period ASC",
        date_format
    );

    let mut stmt = conn.prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let aggregates = stmt.query_map(params![&start_date, &end_date], |row| {
        Ok(TokenUsageAggregate {
            date: row.get(0)?,
            total_tokens: row.get(1)?,
            input_tokens: row.get(2)?,
            output_tokens: row.get(3)?,
            cost: row.get(4)?,
            conversation_count: row.get(5)?,
        })
    }).map_err(|e| format!("Failed to query token usage: {}", e))?;

    let result: Result<Vec<TokenUsageAggregate>, _> = aggregates.collect();
    result.map_err(|e| format!("Failed to collect token usage: {}", e))
}

#[tauri::command]
pub async fn get_all_token_usage(
    app: tauri::AppHandle,
) -> Result<Vec<TokenUsage>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, model, input_tokens, output_tokens, total_tokens, cost, created_at, date, COALESCE(provider, 'openai')
         FROM token_usage
         ORDER BY created_at DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let usage_records = stmt.query_map([], |row| {
        Ok(TokenUsage {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            model: row.get(2)?,
            provider: row.get(9)?,
            input_tokens: row.get(3)?,
            output_tokens: row.get(4)?,
            total_tokens: row.get(5)?,
            cost: row.get(6)?,
            created_at: row.get(7)?,
            date: row.get(8)?,
        })
    }).map_err(|e| format!("Failed to query token usage: {}", e))?;

    let result: Result<Vec<TokenUsage>, _> = usage_records.collect();
    result.map_err(|e| format!("Failed to collect token usage: {}", e))
}

// Settings commands

#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, api_key_encrypted, username, name, surname, job_title, company, company_url,
                profile_pic, about_me, about_role, jira_url, jira_email, jira_api_token_encrypted,
                jira_project_key, notion_api_token_encrypted, notion_parent_page_id,
                anthropic_api_key_encrypted, google_api_key_encrypted, ollama_base_url, default_provider,
                enabled_models, global_context, created_at, updated_at
         FROM settings WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let settings = stmt.query_row(params!["default"], |row| {
        Ok(Settings {
            id: row.get(0)?,
            api_key_encrypted: row.get(1)?,
            username: row.get(2)?,
            name: row.get(3)?,
            surname: row.get(4)?,
            job_title: row.get(5)?,
            company: row.get(6)?,
            company_url: row.get(7)?,
            profile_pic: row.get(8)?,
            about_me: row.get(9)?,
            about_role: row.get(10)?,
            jira_url: row.get(11)?,
            jira_email: row.get(12)?,
            jira_api_token_encrypted: row.get(13)?,
            jira_project_key: row.get(14)?,
            notion_api_token_encrypted: row.get(15)?,
            notion_parent_page_id: row.get(16)?,
            anthropic_api_key_encrypted: row.get(17)?,
            google_api_key_encrypted: row.get(18)?,
            ollama_base_url: row.get(19)?,
            default_provider: row.get(20)?,
            enabled_models: row.get(21)?,
            global_context: row.get(22)?,
            created_at: row.get(23)?,
            updated_at: row.get(24)?,
        })
    }).map_err(|e| format!("Failed to get settings: {}", e))?;

    Ok(settings)
}

#[tauri::command]
pub async fn update_settings(
    settings: SettingsUpdate,
    app: tauri::AppHandle,
) -> Result<Settings, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    let enc_key = get_encryption_key(&app)?;

    let api_key_encrypted = if let Some(ref api_key) = settings.api_key {
        if api_key.is_empty() { None } else { Some(encrypt_string(api_key, &enc_key)?) }
    } else {
        None
    };

    let jira_token_encrypted = if let Some(ref token) = settings.jira_api_token {
        if token.is_empty() { None } else { Some(encrypt_string(token, &enc_key)?) }
    } else {
        None
    };

    let notion_token_encrypted = if let Some(ref token) = settings.notion_api_token {
        if token.is_empty() { None } else { Some(encrypt_string(token, &enc_key)?) }
    } else {
        None
    };

    let anthropic_key_encrypted = if let Some(ref key) = settings.anthropic_api_key {
        if key.is_empty() { None } else { Some(encrypt_string(key, &enc_key)?) }
    } else {
        None
    };

    let google_key_encrypted = if let Some(ref key) = settings.google_api_key {
        if key.is_empty() { None } else { Some(encrypt_string(key, &enc_key)?) }
    } else {
        None
    };

    conn.execute(
        "UPDATE settings
         SET api_key_encrypted = COALESCE(?1, api_key_encrypted),
             username = COALESCE(?2, username),
             name = COALESCE(?3, name),
             surname = COALESCE(?4, surname),
             job_title = COALESCE(?5, job_title),
             company = COALESCE(?6, company),
             company_url = COALESCE(?7, company_url),
             profile_pic = COALESCE(?8, profile_pic),
             about_me = COALESCE(?9, about_me),
             about_role = COALESCE(?10, about_role),
             jira_url = COALESCE(?11, jira_url),
             jira_email = COALESCE(?12, jira_email),
             jira_api_token_encrypted = COALESCE(?13, jira_api_token_encrypted),
             jira_project_key = COALESCE(?14, jira_project_key),
             notion_api_token_encrypted = COALESCE(?15, notion_api_token_encrypted),
             notion_parent_page_id = COALESCE(?16, notion_parent_page_id),
             anthropic_api_key_encrypted = COALESCE(?17, anthropic_api_key_encrypted),
             google_api_key_encrypted = COALESCE(?18, google_api_key_encrypted),
             ollama_base_url = COALESCE(?19, ollama_base_url),
             default_provider = COALESCE(?20, default_provider),
             enabled_models = COALESCE(?21, enabled_models),
             global_context = COALESCE(?22, global_context),
             updated_at = ?23
         WHERE id = ?24",
        params![
            &api_key_encrypted,
            &settings.username,
            &settings.name,
            &settings.surname,
            &settings.job_title,
            &settings.company,
            &settings.company_url,
            &settings.profile_pic,
            &settings.about_me,
            &settings.about_role,
            &settings.jira_url,
            &settings.jira_email,
            &jira_token_encrypted,
            &settings.jira_project_key,
            &notion_token_encrypted,
            &settings.notion_parent_page_id,
            &anthropic_key_encrypted,
            &google_key_encrypted,
            &settings.ollama_base_url,
            &settings.default_provider,
            &settings.enabled_models,
            &settings.global_context,
            &now,
            "default"
        ],
    ).map_err(|e| format!("Failed to update settings: {}", e))?;

    get_settings(app).await
}

#[tauri::command]
pub async fn get_decrypted_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let settings = get_settings(app.clone()).await?;

    if let Some(encrypted) = settings.api_key_encrypted {
        let key = get_encryption_key(&app)?;
        Ok(Some(decrypt_string(&encrypted, &key)?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn delete_api_key(app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE settings SET api_key_encrypted = NULL, updated_at = ?1 WHERE id = ?2",
        params![&now, "default"],
    ).map_err(|e| format!("Failed to delete API key: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_decrypted_anthropic_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let settings = get_settings(app.clone()).await?;

    if let Some(encrypted) = settings.anthropic_api_key_encrypted {
        let key = get_encryption_key(&app)?;
        Ok(Some(decrypt_string(&encrypted, &key)?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn get_decrypted_google_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let settings = get_settings(app.clone()).await?;

    if let Some(encrypted) = settings.google_api_key_encrypted {
        let key = get_encryption_key(&app)?;
        Ok(Some(decrypt_string(&encrypted, &key)?))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub configured: bool,
    pub models: Vec<String>,
}

#[tauri::command]
pub async fn get_available_providers(app: tauri::AppHandle) -> Result<Vec<ProviderInfo>, String> {
    let settings = get_settings(app).await?;

    let providers = vec![
        ProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            configured: settings.api_key_encrypted.is_some(),
            models: vec!["gpt-5".to_string(), "gpt-5-mini".to_string(), "gpt-5-nano".to_string()],
        },
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            configured: settings.anthropic_api_key_encrypted.is_some(),
            models: vec!["claude-sonnet-4-5".to_string(), "claude-haiku-4-5".to_string()],
        },
        ProviderInfo {
            id: "google".to_string(),
            name: "Google".to_string(),
            configured: settings.google_api_key_encrypted.is_some(),
            models: vec!["gemini-2.5-pro".to_string(), "gemini-2.5-flash".to_string()],
        },
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            configured: settings.ollama_base_url.is_some(),
            models: vec!["llama3".to_string(), "mistral".to_string(), "codellama".to_string()],
        },
    ];

    Ok(providers)
}

#[tauri::command]
pub async fn get_usage_by_provider(
    start_date: String,
    end_date: String,
    app: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT COALESCE(provider, 'openai') as provider,
                SUM(total_tokens) as total_tokens,
                SUM(input_tokens) as input_tokens,
                SUM(output_tokens) as output_tokens,
                SUM(cost) as cost,
                COUNT(*) as count
         FROM token_usage
         WHERE date >= ?1 AND date <= ?2
         GROUP BY provider
         ORDER BY cost DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt.query_map(params![&start_date, &end_date], |row| {
        Ok(serde_json::json!({
            "provider": row.get::<_, String>(0)?,
            "total_tokens": row.get::<_, i32>(1)?,
            "input_tokens": row.get::<_, i32>(2)?,
            "output_tokens": row.get::<_, i32>(3)?,
            "cost": row.get::<_, f64>(4)?,
            "count": row.get::<_, i32>(5)?,
        }))
    }).map_err(|e| format!("Failed to query usage by provider: {}", e))?;

    let result: Result<Vec<serde_json::Value>, _> = rows.collect();
    result.map_err(|e| format!("Failed to collect: {}", e))
}

#[tauri::command]
pub async fn get_usage_by_model(
    start_date: String,
    end_date: String,
    app: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT model,
                COALESCE(provider, 'openai') as provider,
                SUM(total_tokens) as total_tokens,
                SUM(cost) as cost,
                COUNT(*) as count
         FROM token_usage
         WHERE date >= ?1 AND date <= ?2
         GROUP BY model, provider
         ORDER BY cost DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt.query_map(params![&start_date, &end_date], |row| {
        Ok(serde_json::json!({
            "model": row.get::<_, String>(0)?,
            "provider": row.get::<_, String>(1)?,
            "total_tokens": row.get::<_, i32>(2)?,
            "cost": row.get::<_, f64>(3)?,
            "count": row.get::<_, i32>(4)?,
        }))
    }).map_err(|e| format!("Failed to query usage by model: {}", e))?;

    let result: Result<Vec<serde_json::Value>, _> = rows.collect();
    result.map_err(|e| format!("Failed to collect: {}", e))
}

#[tauri::command]
pub async fn export_usage_csv(
    start_date: String,
    end_date: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT date, model, COALESCE(provider, 'openai'), input_tokens, output_tokens, total_tokens, cost
         FROM token_usage
         WHERE date >= ?1 AND date <= ?2
         ORDER BY date ASC, created_at ASC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let mut csv = String::from("date,model,provider,input_tokens,output_tokens,total_tokens,cost\n");

    let rows = stmt.query_map(params![&start_date, &end_date], |row| {
        Ok(format!(
            "{},{},{},{},{},{},{:.6}",
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, i32>(5)?,
            row.get::<_, f64>(6)?,
        ))
    }).map_err(|e| format!("Failed to query: {}", e))?;

    for row in rows {
        csv.push_str(&row.map_err(|e| format!("Row error: {}", e))?);
        csv.push('\n');
    }

    Ok(csv)
}

// Folder commands

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: String,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn create_folder(
    project_id: String,
    name: String,
    parent_id: Option<String>,
    color: Option<String>,
    app: tauri::AppHandle,
) -> Result<Folder, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let folder = Folder {
        id: id.clone(),
        project_id: project_id.clone(),
        parent_id: parent_id.clone(),
        name: name.clone(),
        color: color.clone(),
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };

    conn.execute(
        "INSERT INTO folders (id, project_id, parent_id, name, color, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![&id, &project_id, &parent_id, &name, &color, &0, &now, &now],
    ).map_err(|e| format!("Failed to create folder: {}", e))?;

    Ok(folder)
}

#[tauri::command]
pub async fn list_folders(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Folder>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_id, name, color, sort_order, created_at, updated_at
         FROM folders
         WHERE project_id = ?1
         ORDER BY sort_order ASC, name ASC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let folders = stmt.query_map(params![&project_id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_id: row.get(2)?,
            name: row.get(3)?,
            color: row.get(4)?,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).map_err(|e| format!("Failed to query folders: {}", e))?;

    let result: Result<Vec<Folder>, _> = folders.collect();
    result.map_err(|e| format!("Failed to collect folders: {}", e))
}

#[tauri::command]
pub async fn get_folder(
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<Folder>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, parent_id, name, color, sort_order, created_at, updated_at
         FROM folders WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let folder = stmt.query_row(params![&id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_id: row.get(2)?,
            name: row.get(3)?,
            color: row.get(4)?,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).optional()
        .map_err(|e| format!("Failed to get folder: {}", e))?;

    Ok(folder)
}

#[tauri::command]
pub async fn update_folder(
    id: String,
    name: Option<String>,
    parent_id: Option<String>,
    color: Option<String>,
    sort_order: Option<i32>,
    app: tauri::AppHandle,
) -> Result<Folder, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE folders
         SET name = COALESCE(?1, name),
             parent_id = CASE WHEN ?2 = '__null__' THEN NULL WHEN ?2 IS NOT NULL THEN ?2 ELSE parent_id END,
             color = COALESCE(?3, color),
             sort_order = COALESCE(?4, sort_order),
             updated_at = ?5
         WHERE id = ?6",
        params![&name, &parent_id, &color, &sort_order, &now, &id],
    ).map_err(|e| format!("Failed to update folder: {}", e))?;

    get_folder(id, app).await?
        .ok_or_else(|| "Folder not found after update".to_string())
}

#[tauri::command]
pub async fn delete_folder(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    // Set folder_id to NULL on items in this folder before deleting
    conn.execute(
        "UPDATE context_documents SET folder_id = NULL WHERE folder_id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to unlink context documents: {}", e))?;

    conn.execute(
        "UPDATE framework_outputs SET folder_id = NULL WHERE folder_id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to unlink framework outputs: {}", e))?;

    conn.execute(
        "DELETE FROM folders WHERE id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to delete folder: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn move_item_to_folder(
    item_id: String,
    item_type: String,
    folder_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    match item_type.as_str() {
        "context_doc" => {
            conn.execute(
                "UPDATE context_documents SET folder_id = ?1 WHERE id = ?2",
                params![&folder_id, &item_id],
            ).map_err(|e| format!("Failed to move context document: {}", e))?;
        },
        "framework_output" => {
            conn.execute(
                "UPDATE framework_outputs SET folder_id = ?1 WHERE id = ?2",
                params![&folder_id, &item_id],
            ).map_err(|e| format!("Failed to move framework output: {}", e))?;
        },
        _ => return Err(format!("Unknown item type: {}", item_type)),
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub name: String,
    pub item_type: String,
    pub folder_id: Option<String>,
    pub category: Option<String>,
    pub doc_type: Option<String>,
    pub is_favorite: bool,
    pub created_at: i64,
}

#[tauri::command]
pub async fn search_project_items(
    project_id: String,
    query: String,
    app: tauri::AppHandle,
) -> Result<Vec<SearchResult>, String> {
    let conn = get_db_connection(&app)?;
    let search = format!("%{}%", query);

    let mut stmt = conn.prepare(
        "SELECT id, name, 'context_doc' as item_type, folder_id, NULL as category, type as doc_type, is_favorite, created_at
         FROM context_documents WHERE project_id = ?1 AND (name LIKE ?2 OR tags LIKE ?2)
         UNION ALL
         SELECT id, name, 'framework_output' as item_type, folder_id, category, NULL as doc_type, is_favorite, created_at
         FROM framework_outputs WHERE project_id = ?1 AND (name LIKE ?2 OR tags LIKE ?2)
         ORDER BY name ASC"
    ).map_err(|e| format!("Failed to prepare search: {}", e))?;

    let results = stmt.query_map(params![&project_id, &search], |row| {
        Ok(SearchResult {
            id: row.get(0)?,
            name: row.get(1)?,
            item_type: row.get(2)?,
            folder_id: row.get(3)?,
            category: row.get(4)?,
            doc_type: row.get(5)?,
            is_favorite: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?,
        })
    }).map_err(|e| format!("Failed to search: {}", e))?;

    let result: Result<Vec<SearchResult>, _> = results.collect();
    result.map_err(|e| format!("Failed to collect search results: {}", e))
}

#[tauri::command]
pub async fn toggle_item_favorite(
    item_id: String,
    item_type: String,
    is_favorite: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let fav_val = if is_favorite { 1 } else { 0 };

    let table = match item_type.as_str() {
        "context_doc" => "context_documents",
        "framework_output" => "framework_outputs",
        _ => return Err(format!("Invalid item type: {}", item_type)),
    };

    conn.execute(
        &format!("UPDATE {} SET is_favorite = ?1 WHERE id = ?2", table),
        params![&fav_val, &item_id],
    ).map_err(|e| format!("Failed to toggle favorite: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn set_folder_color(
    id: String,
    color: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE folders SET color = ?1, updated_at = ?2 WHERE id = ?3",
        params![&color, &now, &id],
    ).map_err(|e| format!("Failed to set folder color: {}", e))?;

    Ok(())
}

// Context Document commands

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextDocument {
    pub id: String,
    pub project_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub content: String,
    pub url: Option<String>,
    pub is_global: bool,
    pub size_bytes: i64,
    pub created_at: i64,
    pub folder_id: Option<String>,
    pub tags: String,
    pub is_favorite: bool,
    pub sort_order: i32,
}

#[tauri::command]
pub async fn create_context_document(
    project_id: String,
    name: String,
    doc_type: String,
    content: String,
    url: Option<String>,
    is_global: bool,
    app: tauri::AppHandle,
) -> Result<ContextDocument, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let size_bytes = content.len() as i64;

    let document = ContextDocument {
        id: id.clone(),
        project_id: project_id.clone(),
        name: name.clone(),
        doc_type: doc_type.clone(),
        content: content.clone(),
        url: url.clone(),
        is_global,
        size_bytes,
        created_at: now,
        folder_id: None,
        tags: "[]".to_string(),
        is_favorite: false,
        sort_order: 0,
    };

    conn.execute(
        "INSERT INTO context_documents (id, project_id, name, type, content, url, is_global, size_bytes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![&id, &project_id, &name, &doc_type, &content, &url, &is_global, &size_bytes, &now],
    ).map_err(|e| format!("Failed to create context document: {}", e))?;

    Ok(document)
}

#[tauri::command]
pub async fn list_context_documents(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<ContextDocument>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, type, content, url, is_global, size_bytes, created_at, folder_id, tags, is_favorite, sort_order
         FROM context_documents
         WHERE project_id = ?1
         ORDER BY sort_order ASC, created_at DESC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let documents = stmt.query_map(params![&project_id], |row| {
        Ok(ContextDocument {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            doc_type: row.get(3)?,
            content: row.get(4)?,
            url: row.get(5)?,
            is_global: row.get::<_, i32>(6)? != 0,
            size_bytes: row.get(7)?,
            created_at: row.get(8)?,
            folder_id: row.get(9)?,
            tags: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
            is_favorite: row.get::<_, Option<i32>>(11)?.unwrap_or(0) != 0,
            sort_order: row.get::<_, Option<i32>>(12)?.unwrap_or(0),
        })
    }).map_err(|e| format!("Failed to query context documents: {}", e))?;

    let result: Result<Vec<ContextDocument>, _> = documents.collect();
    result.map_err(|e| format!("Failed to collect context documents: {}", e))
}

#[tauri::command]
pub async fn get_context_document(
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<ContextDocument>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, type, content, url, is_global, size_bytes, created_at, folder_id, tags, is_favorite, sort_order
         FROM context_documents
         WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let document = stmt.query_row(params![&id], |row| {
        Ok(ContextDocument {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            doc_type: row.get(3)?,
            content: row.get(4)?,
            url: row.get(5)?,
            is_global: row.get::<_, i32>(6)? != 0,
            size_bytes: row.get(7)?,
            created_at: row.get(8)?,
            folder_id: row.get(9)?,
            tags: row.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
            is_favorite: row.get::<_, Option<i32>>(11)?.unwrap_or(0) != 0,
            sort_order: row.get::<_, Option<i32>>(12)?.unwrap_or(0),
        })
    }).optional()
        .map_err(|e| format!("Failed to get context document: {}", e))?;

    Ok(document)
}

#[tauri::command]
pub async fn update_context_document(
    id: String,
    name: String,
    is_global: bool,
    app: tauri::AppHandle,
) -> Result<ContextDocument, String> {
    let conn = get_db_connection(&app)?;

    conn.execute(
        "UPDATE context_documents
         SET name = ?1, is_global = ?2
         WHERE id = ?3",
        params![&name, &is_global, &id],
    ).map_err(|e| format!("Failed to update context document: {}", e))?;

    // Fetch the updated document
    get_context_document(id, app).await?
        .ok_or_else(|| "Context document not found after update".to_string())
}

#[tauri::command]
pub async fn delete_context_document(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    conn.execute(
        "DELETE FROM context_documents WHERE id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to delete context document: {}", e))?;

    Ok(())
}

// Framework Output commands

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FrameworkOutput {
    pub id: String,
    pub project_id: String,
    pub framework_id: String,
    pub category: String,
    pub name: String,
    pub user_prompt: String,
    pub context_doc_ids: String,
    pub generated_content: String,
    pub format: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub folder_id: Option<String>,
    pub tags: String,
    pub is_favorite: bool,
    pub sort_order: i32,
}

#[tauri::command]
pub async fn create_framework_output(
    project_id: String,
    framework_id: String,
    category: String,
    name: String,
    user_prompt: String,
    context_doc_ids: String,
    generated_content: String,
    format: String,
    app: tauri::AppHandle,
) -> Result<FrameworkOutput, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let output = FrameworkOutput {
        id: id.clone(),
        project_id: project_id.clone(),
        framework_id: framework_id.clone(),
        category: category.clone(),
        name: name.clone(),
        user_prompt: user_prompt.clone(),
        context_doc_ids: context_doc_ids.clone(),
        generated_content: generated_content.clone(),
        format: format.clone(),
        created_at: now,
        updated_at: now,
        folder_id: None,
        tags: "[]".to_string(),
        is_favorite: false,
        sort_order: 0,
    };

    conn.execute(
        "INSERT INTO framework_outputs (id, project_id, framework_id, category, name, user_prompt, context_doc_ids, generated_content, format, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![&id, &project_id, &framework_id, &category, &name, &user_prompt, &context_doc_ids, &generated_content, &format, &now, &now],
    ).map_err(|e| format!("Failed to create framework output: {}", e))?;

    let _ = commit_output(project_id.clone(), id.clone(), name.clone(), generated_content.clone(), format!("Create: {}", name), app).await;

    Ok(output)
}

#[tauri::command]
pub async fn list_framework_outputs(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<FrameworkOutput>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, framework_id, category, name, user_prompt, context_doc_ids, generated_content, format, created_at, updated_at, folder_id, tags, is_favorite, sort_order
         FROM framework_outputs
         WHERE project_id = ?1
         ORDER BY sort_order ASC, updated_at DESC"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let outputs = stmt.query_map(params![&project_id], |row| {
        Ok(FrameworkOutput {
            id: row.get(0)?,
            project_id: row.get(1)?,
            framework_id: row.get(2)?,
            category: row.get(3)?,
            name: row.get(4)?,
            user_prompt: row.get(5)?,
            context_doc_ids: row.get(6)?,
            generated_content: row.get(7)?,
            format: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            folder_id: row.get(11)?,
            tags: row.get::<_, Option<String>>(12)?.unwrap_or_else(|| "[]".to_string()),
            is_favorite: row.get::<_, Option<i32>>(13)?.unwrap_or(0) != 0,
            sort_order: row.get::<_, Option<i32>>(14)?.unwrap_or(0),
        })
    }).map_err(|e| format!("Failed to query framework outputs: {}", e))?;

    let result: Result<Vec<FrameworkOutput>, _> = outputs.collect();
    result.map_err(|e| format!("Failed to collect framework outputs: {}", e))
}

#[tauri::command]
pub async fn get_framework_output(
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<FrameworkOutput>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, framework_id, category, name, user_prompt, context_doc_ids, generated_content, format, created_at, updated_at, folder_id, tags, is_favorite, sort_order
         FROM framework_outputs
         WHERE id = ?1"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let output = stmt.query_row(params![&id], |row| {
        Ok(FrameworkOutput {
            id: row.get(0)?,
            project_id: row.get(1)?,
            framework_id: row.get(2)?,
            category: row.get(3)?,
            name: row.get(4)?,
            user_prompt: row.get(5)?,
            context_doc_ids: row.get(6)?,
            generated_content: row.get(7)?,
            format: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            folder_id: row.get(11)?,
            tags: row.get::<_, Option<String>>(12)?.unwrap_or_else(|| "[]".to_string()),
            is_favorite: row.get::<_, Option<i32>>(13)?.unwrap_or(0) != 0,
            sort_order: row.get::<_, Option<i32>>(14)?.unwrap_or(0),
        })
    }).optional()
        .map_err(|e| format!("Failed to get framework output: {}", e))?;

    Ok(output)
}

#[tauri::command]
pub async fn update_framework_output(
    id: String,
    name: String,
    generated_content: String,
    app: tauri::AppHandle,
) -> Result<FrameworkOutput, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    // Get project_id before update for git commit
    let project_id: String = conn.query_row(
        "SELECT project_id FROM framework_outputs WHERE id = ?1",
        params![&id],
        |row| row.get(0),
    ).map_err(|e| format!("Output not found: {}", e))?;

    conn.execute(
        "UPDATE framework_outputs
         SET name = ?1, generated_content = ?2, updated_at = ?3
         WHERE id = ?4",
        params![&name, &generated_content, &now, &id],
    ).map_err(|e| format!("Failed to update framework output: {}", e))?;

    let _ = commit_output(project_id, id.clone(), name.clone(), generated_content.clone(), format!("Update: {}", name), app.clone()).await;

    // Fetch the updated output
    get_framework_output(id, app).await?
        .ok_or_else(|| "Framework output not found after update".to_string())
}

#[tauri::command]
pub async fn delete_framework_output(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    conn.execute(
        "DELETE FROM framework_outputs WHERE id = ?1",
        params![&id],
    ).map_err(|e| format!("Failed to delete framework output: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandHistoryEntry {
    pub id: String,
    pub project_id: String,
    pub command: String,
    pub output: String,
    pub exit_code: i32,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub output: String,
    pub exit_code: i32,
    pub cwd: String,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
    pub extension: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FrameworkCategoryRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub is_builtin: bool,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FrameworkDefRow {
    pub id: String,
    pub category: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub example_output: String,
    pub system_prompt: String,
    pub guiding_questions: String,
    pub supports_visuals: bool,
    pub visual_instructions: Option<String>,
    pub is_builtin: bool,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedPromptRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub prompt_text: String,
    pub variables: String,
    pub framework_id: Option<String>,
    pub is_builtin: bool,
    pub is_favorite: bool,
    pub usage_count: i32,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FrameworkExportMeta {
    pub r#type: String,
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub icon: String,
    pub supports_visuals: bool,
    pub visual_instructions: Option<String>,
    pub exported_at: String,
    pub export_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PromptVariableExport {
    pub name: String,
    pub r#type: String,
    pub label: Option<String>,
    pub placeholder: Option<String>,
    pub options: Option<Vec<String>>,
    pub required: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PromptExportMeta {
    pub r#type: String,
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub framework_id: Option<String>,
    pub variables: Vec<PromptVariableExport>,
    pub exported_at: String,
    pub export_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportPreview {
    pub item_type: String,
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub already_exists: bool,
    pub is_builtin_conflict: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportResult {
    pub success: bool,
    pub item_type: String,
    pub id: String,
    pub name: String,
    pub action: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchExportResult {
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowStepDef {
    pub framework_id: String,
    pub label: String,
    pub prompt_template: String,
    pub context_doc_ids: Vec<String>,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workflow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub steps: String,
    pub is_template: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub project_id: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowRunStep {
    pub id: String,
    pub run_id: String,
    pub step_index: i32,
    pub framework_id: String,
    pub status: String,
    pub input_prompt: Option<String>,
    pub output_content: Option<String>,
    pub output_id: Option<String>,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectInsight {
    pub id: String,
    pub project_id: String,
    pub insight_type: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub framework_id: Option<String>,
    pub is_dismissed: bool,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfo {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

#[tauri::command]
pub async fn execute_shell_command(
    project_id: String,
    command: String,
    app: tauri::AppHandle,
) -> Result<CommandResult, String> {
    use std::process::Command as StdCommand;

    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let cwd = {
        let map = terminal_cwds().lock().map_err(|e| format!("Lock error: {}", e))?;
        map.get(&project_id).cloned().unwrap_or_else(|| home_dir.clone())
    };

    let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let cwd_marker = "__PM_IDE_CWD_MARKER__";
    let wrapped = format!(
        "cd {} 2>/dev/null && {{ {}; }}; __ec=$?; printf '\\n{}'; pwd; exit $__ec",
        shell_escape(&cwd),
        &command,
        cwd_marker
    );

    let output = StdCommand::new(&user_shell)
        .arg("-l")
        .arg("-i")
        .arg("-c")
        .arg(&wrapped)
        .env("TERM", "xterm-256color")
        .env("CLICOLOR", "1")
        .env("CLICOLOR_FORCE", "1")
        .env("LSCOLORS", "Gxfxcxdxbxegedabagacad")
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout_raw = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let (user_output, new_cwd) = if let Some(idx) = stdout_raw.rfind(cwd_marker) {
        let before = stdout_raw[..idx].trim_end().to_string();
        let after = stdout_raw[idx + cwd_marker.len()..].trim().to_string();
        let resolved_cwd = if after.is_empty() { cwd.clone() } else { after };
        (before, resolved_cwd)
    } else {
        (stdout_raw, cwd.clone())
    };

    {
        let mut map = terminal_cwds().lock().map_err(|e| format!("Lock error: {}", e))?;
        map.insert(project_id.clone(), new_cwd.clone());
    }

    let combined = if stderr.is_empty() {
        user_output
    } else if user_output.is_empty() {
        stderr
    } else {
        format!("{}\n{}", user_output, stderr)
    };
    let exit_code = output.status.code().unwrap_or(-1);

    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    conn.execute(
        "INSERT INTO command_history (id, project_id, command, output, exit_code, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![&id, &project_id, &command, &combined, &exit_code, &now],
    ).map_err(|e| format!("Failed to save command history: {}", e))?;

    Ok(CommandResult {
        output: combined,
        exit_code,
        cwd: new_cwd,
    })
}

#[tauri::command]
pub async fn get_command_history(
    project_id: String,
    limit: Option<i32>,
    app: tauri::AppHandle,
) -> Result<Vec<CommandHistoryEntry>, String> {
    let conn = get_db_connection(&app)?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn.prepare(
        "SELECT id, project_id, command, output, exit_code, created_at
         FROM command_history
         WHERE project_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let entries = stmt.query_map(params![&project_id, &limit], |row| {
        Ok(CommandHistoryEntry {
            id: row.get(0)?,
            project_id: row.get(1)?,
            command: row.get(2)?,
            output: row.get(3)?,
            exit_code: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| format!("Failed to query command history: {}", e))?;

    let mut results = Vec::new();
    for entry in entries {
        results.push(entry.map_err(|e| format!("Failed to read command history entry: {}", e))?);
    }

    results.reverse();
    Ok(results)
}

#[tauri::command]
pub async fn get_terminal_cwd(
    project_id: String,
) -> Result<String, String> {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let map = terminal_cwds().lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(map.get(&project_id).cloned().unwrap_or(home_dir))
}

#[tauri::command]
pub async fn set_terminal_cwd(
    project_id: String,
    cwd: String,
) -> Result<(), String> {
    let path = std::path::Path::new(&cwd);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Directory does not exist: {}", cwd));
    }
    let mut map = terminal_cwds().lock().map_err(|e| format!("Lock error: {}", e))?;
    map.insert(project_id, cwd);
    Ok(())
}

#[tauri::command]
pub async fn complete_path(
    project_id: String,
    partial: String,
) -> Result<Vec<String>, String> {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let cwd = {
        let map = terminal_cwds().lock().map_err(|e| format!("Lock error: {}", e))?;
        map.get(&project_id).cloned().unwrap_or_else(|| home_dir.clone())
    };

    let expanded = if partial.starts_with('~') {
        format!("{}{}", home_dir, &partial[1..])
    } else {
        partial.clone()
    };

    let full_path = if std::path::Path::new(&expanded).is_absolute() {
        expanded.clone()
    } else {
        format!("{}/{}", cwd, expanded)
    };

    let (dir, prefix) = if full_path.ends_with('/') {
        (full_path.clone(), String::new())
    } else {
        let p = std::path::Path::new(&full_path);
        let dir = p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_else(|| "/".to_string());
        let prefix = p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
        (dir, prefix)
    };

    let mut matches = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) {
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                let suffix = if is_dir { "/" } else { " " };
                if partial.contains('/') {
                    let base = &partial[..partial.rfind('/').unwrap() + 1];
                    matches.push(format!("{}{}{}", base, name, suffix));
                } else {
                    matches.push(format!("{}{}", name, suffix));
                }
            }
        }
    }

    matches.sort();
    Ok(matches.into_iter().take(20).collect())
}

// === Saved Prompts CRUD ===

const SAVED_PROMPT_COLUMNS: &str = "id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at";

#[tauri::command]
pub async fn list_saved_prompts(
    category: Option<String>,
    framework_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<SavedPromptRow>, String> {
    let conn = get_db_connection(&app)?;

    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (&category, &framework_id) {
        (Some(cat), Some(fid)) => (
            format!("SELECT {} FROM saved_prompts WHERE category = ?1 AND framework_id = ?2 ORDER BY sort_order, name", SAVED_PROMPT_COLUMNS),
            vec![Box::new(cat.clone()) as Box<dyn rusqlite::types::ToSql>, Box::new(fid.clone())],
        ),
        (Some(cat), None) => (
            format!("SELECT {} FROM saved_prompts WHERE category = ?1 ORDER BY sort_order, name", SAVED_PROMPT_COLUMNS),
            vec![Box::new(cat.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, Some(fid)) => (
            format!("SELECT {} FROM saved_prompts WHERE framework_id = ?1 ORDER BY sort_order, name", SAVED_PROMPT_COLUMNS),
            vec![Box::new(fid.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, None) => (
            format!("SELECT {} FROM saved_prompts ORDER BY sort_order, name", SAVED_PROMPT_COLUMNS),
            vec![],
        ),
    };

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare query: {}", e))?;
    let rows = stmt.query_map(params_ref.as_slice(), row_to_saved_prompt)
        .map_err(|e| format!("Failed to list saved prompts: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Failed to read saved prompt: {}", e))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_saved_prompt(id: String, app: tauri::AppHandle) -> Result<Option<SavedPromptRow>, String> {
    let conn = get_db_connection(&app)?;
    let result = conn.query_row(
        &format!("SELECT {} FROM saved_prompts WHERE id = ?1", SAVED_PROMPT_COLUMNS),
        params![&id],
        row_to_saved_prompt,
    ).optional().map_err(|e| format!("Failed to get saved prompt: {}", e))?;
    Ok(result)
}

#[tauri::command]
pub async fn create_saved_prompt(
    name: String,
    description: String,
    category: String,
    prompt_text: String,
    variables: String,
    framework_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<SavedPromptRow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let max_sort: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM saved_prompts WHERE category = ?1",
        params![&category],
        |row| row.get(0),
    ).unwrap_or(-1);

    conn.execute(
        "INSERT INTO saved_prompts (id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, 0, ?8, ?9, ?10)",
        params![&id, &name, &description, &category, &prompt_text, &variables, &framework_id, max_sort + 1, &now, &now],
    ).map_err(|e| format!("Failed to create saved prompt: {}", e))?;

    get_saved_prompt(id, app).await?.ok_or_else(|| "Failed to retrieve created prompt".to_string())
}

#[tauri::command]
pub async fn update_saved_prompt(
    id: String,
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    prompt_text: Option<String>,
    variables: Option<String>,
    framework_id: Option<Option<String>>,
    is_favorite: Option<bool>,
    app: tauri::AppHandle,
) -> Result<SavedPromptRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE saved_prompts SET
            name = COALESCE(?1, name),
            description = COALESCE(?2, description),
            category = COALESCE(?3, category),
            prompt_text = COALESCE(?4, prompt_text),
            variables = COALESCE(?5, variables),
            updated_at = ?6
         WHERE id = ?7",
        params![&name, &description, &category, &prompt_text, &variables, &now, &id],
    ).map_err(|e| format!("Failed to update saved prompt: {}", e))?;

    if let Some(fid) = framework_id {
        conn.execute(
            "UPDATE saved_prompts SET framework_id = ?1 WHERE id = ?2",
            params![&fid, &id],
        ).map_err(|e| format!("Failed to update prompt framework_id: {}", e))?;
    }

    if let Some(fav) = is_favorite {
        conn.execute(
            "UPDATE saved_prompts SET is_favorite = ?1 WHERE id = ?2",
            params![fav as i32, &id],
        ).map_err(|e| format!("Failed to update prompt favorite: {}", e))?;
    }

    get_saved_prompt(id, app).await?.ok_or_else(|| "Prompt not found after update".to_string())
}

#[tauri::command]
pub async fn delete_saved_prompt(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;

    let is_builtin: i32 = conn.query_row(
        "SELECT is_builtin FROM saved_prompts WHERE id = ?1", params![&id], |row| row.get(0)
    ).map_err(|e| format!("Prompt not found: {}", e))?;

    if is_builtin != 0 {
        return Err("Cannot delete built-in prompts".to_string());
    }

    conn.execute("DELETE FROM saved_prompts WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete saved prompt: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn search_saved_prompts(query: String, app: tauri::AppHandle) -> Result<Vec<SavedPromptRow>, String> {
    let conn = get_db_connection(&app)?;
    let search = format!("%{}%", query);

    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM saved_prompts WHERE name LIKE ?1 OR description LIKE ?1 OR prompt_text LIKE ?1 ORDER BY usage_count DESC, name", SAVED_PROMPT_COLUMNS)
    ).map_err(|e| format!("Failed to prepare search: {}", e))?;

    let rows = stmt.query_map(params![&search], row_to_saved_prompt)
        .map_err(|e| format!("Failed to search saved prompts: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Failed to read prompt: {}", e))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn duplicate_saved_prompt(id: String, new_name: String, app: tauri::AppHandle) -> Result<SavedPromptRow, String> {
    let original = get_saved_prompt(id, app.clone()).await?
        .ok_or_else(|| "Prompt not found".to_string())?;

    create_saved_prompt(
        new_name,
        original.description,
        original.category,
        original.prompt_text,
        original.variables,
        original.framework_id,
        app,
    ).await
}

#[tauri::command]
pub async fn increment_prompt_usage(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE saved_prompts SET usage_count = usage_count + 1, updated_at = ?1 WHERE id = ?2",
        params![&now, &id],
    ).map_err(|e| format!("Failed to increment prompt usage: {}", e))?;
    Ok(())
}

// === Phase 6: Import/Export Helpers ===

fn parse_yaml_frontmatter(md: &str) -> Result<(String, String), String> {
    let trimmed = md.trim();
    if !trimmed.starts_with("---") {
        return Err("File must start with YAML front matter (---)".to_string());
    }
    let after_first = &trimmed[3..];
    let end_idx = after_first.find("\n---")
        .ok_or("Missing closing --- for YAML front matter")?;
    let yaml_str = after_first[..end_idx].trim().to_string();
    let body = after_first[end_idx + 4..].trim().to_string();
    Ok((yaml_str, body))
}

fn framework_to_markdown(fw: &FrameworkDefRow) -> Result<String, String> {
    let meta = FrameworkExportMeta {
        r#type: "framework".to_string(),
        id: fw.id.clone(),
        name: fw.name.clone(),
        category: fw.category.clone(),
        description: fw.description.clone(),
        icon: fw.icon.clone(),
        supports_visuals: fw.supports_visuals,
        visual_instructions: fw.visual_instructions.clone(),
        exported_at: Utc::now().to_rfc3339(),
        export_version: 1,
    };
    let yaml = serde_yaml::to_string(&meta)
        .map_err(|e| format!("Failed to serialize YAML: {}", e))?;

    let questions: Vec<String> = serde_json::from_str(&fw.guiding_questions)
        .unwrap_or_default();
    let questions_md: String = questions.iter()
        .enumerate()
        .map(|(i, q)| format!("{}. {}", i + 1, q))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        "---\n{}---\n\n# System Prompt\n\n{}\n\n# Guiding Questions\n\n{}\n\n# Example Output\n\n{}",
        yaml,
        fw.system_prompt,
        questions_md,
        fw.example_output,
    ))
}

fn markdown_to_framework_parts(body: &str) -> Result<(String, Vec<String>, String), String> {
    let system_prompt_start = body.find("# System Prompt")
        .ok_or("Missing '# System Prompt' section")?;
    let questions_start = body.find("# Guiding Questions")
        .ok_or("Missing '# Guiding Questions' section")?;
    let example_start = body.find("# Example Output")
        .ok_or("Missing '# Example Output' section")?;

    let system_prompt = body[system_prompt_start + 15..questions_start].trim().to_string();
    let questions_section = body[questions_start + 19..example_start].trim();
    let example_output = body[example_start + 16..].trim().to_string();

    let questions: Vec<String> = questions_section
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let trimmed = l.trim();
            if let Some(pos) = trimmed.find(". ") {
                if trimmed[..pos].chars().all(|c| c.is_ascii_digit()) {
                    return trimmed[pos + 2..].to_string();
                }
            }
            if trimmed.starts_with("- ") {
                return trimmed[2..].to_string();
            }
            trimmed.to_string()
        })
        .collect();

    Ok((system_prompt, questions, example_output))
}

fn prompt_to_markdown(prompt: &SavedPromptRow) -> Result<String, String> {
    let variables: Vec<PromptVariableExport> = serde_json::from_str(&prompt.variables)
        .unwrap_or_default();
    let meta = PromptExportMeta {
        r#type: "prompt".to_string(),
        id: prompt.id.clone(),
        name: prompt.name.clone(),
        description: prompt.description.clone(),
        category: prompt.category.clone(),
        framework_id: prompt.framework_id.clone(),
        variables,
        exported_at: Utc::now().to_rfc3339(),
        export_version: 1,
    };
    let yaml = serde_yaml::to_string(&meta)
        .map_err(|e| format!("Failed to serialize YAML: {}", e))?;

    Ok(format!(
        "---\n{}---\n\n# Prompt Text\n\n{}",
        yaml,
        prompt.prompt_text,
    ))
}

fn sanitize_filename(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else if c == ' ' { '-' } else { '-' })
        .collect::<String>()
        .replace("--", "-")
        .trim_matches('-')
        .to_string()
}

// === Phase 6: Export Commands ===

#[tauri::command]
pub async fn export_framework(id: String, app: tauri::AppHandle) -> Result<String, String> {
    let conn = get_db_connection(&app)?;
    let fw = conn.query_row(
        "SELECT id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at FROM framework_defs WHERE id = ?1",
        params![&id],
        |row| {
            Ok(FrameworkDefRow {
                id: row.get(0)?,
                category: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                icon: row.get(4)?,
                example_output: row.get(5)?,
                system_prompt: row.get(6)?,
                guiding_questions: row.get(7)?,
                supports_visuals: row.get(8)?,
                visual_instructions: row.get(9)?,
                is_builtin: row.get(10)?,
                sort_order: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        },
    ).map_err(|e| format!("Framework not found: {}", e))?;
    framework_to_markdown(&fw)
}

#[tauri::command]
pub async fn export_frameworks_batch(ids: Vec<String>, app: tauri::AppHandle) -> Result<Vec<BatchExportResult>, String> {
    let conn = get_db_connection(&app)?;
    let mut results = Vec::new();
    for id in &ids {
        let fw = conn.query_row(
            "SELECT id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at FROM framework_defs WHERE id = ?1",
            params![id],
            |row| {
                Ok(FrameworkDefRow {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    icon: row.get(4)?,
                    example_output: row.get(5)?,
                    system_prompt: row.get(6)?,
                    guiding_questions: row.get(7)?,
                    supports_visuals: row.get(8)?,
                    visual_instructions: row.get(9)?,
                    is_builtin: row.get(10)?,
                    sort_order: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        ).map_err(|e| format!("Framework {} not found: {}", id, e))?;
        let content = framework_to_markdown(&fw)?;
        let filename = format!("{}.md", sanitize_filename(&fw.name));
        results.push(BatchExportResult { filename, content });
    }
    Ok(results)
}

#[tauri::command]
pub async fn export_all_frameworks(app: tauri::AppHandle) -> Result<Vec<BatchExportResult>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        "SELECT id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at FROM framework_defs ORDER BY sort_order"
    ).map_err(|e| format!("Failed to query frameworks: {}", e))?;

    let frameworks: Vec<FrameworkDefRow> = stmt.query_map([], |row| {
        Ok(FrameworkDefRow {
            id: row.get(0)?,
            category: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            icon: row.get(4)?,
            example_output: row.get(5)?,
            system_prompt: row.get(6)?,
            guiding_questions: row.get(7)?,
            supports_visuals: row.get(8)?,
            visual_instructions: row.get(9)?,
            is_builtin: row.get(10)?,
            sort_order: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    let mut results = Vec::new();
    for fw in &frameworks {
        let content = framework_to_markdown(fw)?;
        let filename = format!("{}.md", sanitize_filename(&fw.name));
        results.push(BatchExportResult { filename, content });
    }
    Ok(results)
}

#[tauri::command]
pub async fn preview_import_framework(md_content: String, app: tauri::AppHandle) -> Result<ImportPreview, String> {
    let (yaml_str, _body) = parse_yaml_frontmatter(&md_content)?;
    let meta: FrameworkExportMeta = serde_yaml::from_str(&yaml_str)
        .map_err(|e| format!("Invalid YAML front matter: {}", e))?;

    if meta.r#type != "framework" {
        return Err(format!("Expected type 'framework', got '{}'", meta.r#type));
    }
    if meta.export_version != 1 {
        return Err(format!("Unsupported export version: {}", meta.export_version));
    }
    if meta.name.is_empty() { return Err("Missing required field: name".to_string()); }
    if meta.category.is_empty() { return Err("Missing required field: category".to_string()); }
    if meta.id.is_empty() { return Err("Missing required field: id".to_string()); }

    let conn = get_db_connection(&app)?;
    let existing: Option<(String, bool)> = conn.query_row(
        "SELECT id, is_builtin FROM framework_defs WHERE id = ?1",
        params![&meta.id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(|e| format!("DB error: {}", e))?;

    let (already_exists, is_builtin_conflict) = match existing {
        Some((_, is_builtin)) => (true, is_builtin),
        None => (false, false),
    };

    Ok(ImportPreview {
        item_type: "framework".to_string(),
        id: meta.id,
        name: meta.name,
        category: meta.category,
        description: meta.description,
        already_exists,
        is_builtin_conflict,
    })
}

#[tauri::command]
pub async fn confirm_import_framework(md_content: String, conflict_action: String, app: tauri::AppHandle) -> Result<ImportResult, String> {
    let (yaml_str, body) = parse_yaml_frontmatter(&md_content)?;
    let meta: FrameworkExportMeta = serde_yaml::from_str(&yaml_str)
        .map_err(|e| format!("Invalid YAML: {}", e))?;
    let (system_prompt, questions, example_output) = markdown_to_framework_parts(&body)?;
    let questions_json = serde_json::to_string(&questions)
        .map_err(|e| format!("Failed to serialize questions: {}", e))?;

    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    let existing: Option<bool> = conn.query_row(
        "SELECT is_builtin FROM framework_defs WHERE id = ?1",
        params![&meta.id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("DB error: {}", e))?;

    let final_id: String;
    let action: String;

    match (existing, conflict_action.as_str()) {
        (None, _) => {
            final_id = meta.id.clone();
            action = "created".to_string();
            ensure_category_exists(&conn, &meta.category)?;
            conn.execute(
                "INSERT INTO framework_defs (id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 999, ?11, ?12)",
                params![&meta.id, &meta.category, &meta.name, &meta.description, &meta.icon, &example_output, &system_prompt, &questions_json, &meta.supports_visuals, &meta.visual_instructions, &now, &now],
            ).map_err(|e| format!("Failed to insert framework: {}", e))?;
        },
        (Some(_), "skip") => {
            return Ok(ImportResult {
                success: true,
                item_type: "framework".to_string(),
                id: meta.id,
                name: meta.name,
                action: "skipped".to_string(),
                error: None,
            });
        },
        (Some(_), "overwrite") => {
            final_id = meta.id.clone();
            action = "overwritten".to_string();
            ensure_category_exists(&conn, &meta.category)?;
            conn.execute(
                "UPDATE framework_defs SET category=?1, name=?2, description=?3, icon=?4, example_output=?5, system_prompt=?6, guiding_questions=?7, supports_visuals=?8, visual_instructions=?9, updated_at=?10 WHERE id=?11",
                params![&meta.category, &meta.name, &meta.description, &meta.icon, &example_output, &system_prompt, &questions_json, &meta.supports_visuals, &meta.visual_instructions, &now, &meta.id],
            ).map_err(|e| format!("Failed to update framework: {}", e))?;
        },
        (Some(_), "copy") | (Some(_), _) => {
            final_id = format!("{}-imported-{}", meta.id, &Uuid::new_v4().to_string()[..8]);
            action = "copied".to_string();
            ensure_category_exists(&conn, &meta.category)?;
            conn.execute(
                "INSERT INTO framework_defs (id, category, name, description, icon, example_output, system_prompt, guiding_questions, supports_visuals, visual_instructions, is_builtin, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 999, ?11, ?12)",
                params![&final_id, &meta.category, &format!("{} (Imported)", meta.name), &meta.description, &meta.icon, &example_output, &system_prompt, &questions_json, &meta.supports_visuals, &meta.visual_instructions, &now, &now],
            ).map_err(|e| format!("Failed to insert framework copy: {}", e))?;
        },
    }

    Ok(ImportResult {
        success: true,
        item_type: "framework".to_string(),
        id: final_id,
        name: meta.name,
        action,
        error: None,
    })
}

fn ensure_category_exists(conn: &Connection, category_id: &str) -> Result<(), String> {
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM framework_categories WHERE id = ?1",
        params![category_id],
        |row| row.get(0),
    ).map_err(|e| format!("DB error checking category: {}", e))?;

    if !exists {
        let now = Utc::now().timestamp();
        let name = category_id.replace('-', " ")
            .split_whitespace()
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        conn.execute(
            "INSERT INTO framework_categories (id, name, description, icon, is_builtin, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, '📁', 0, 999, ?4, ?5)",
            params![category_id, &name, &format!("Imported category: {}", name), &now, &now],
        ).map_err(|e| format!("Failed to create category: {}", e))?;
    }
    Ok(())
}

// === Phase 6: Prompt Export Commands ===

#[tauri::command]
pub async fn export_prompt(id: String, app: tauri::AppHandle) -> Result<String, String> {
    let conn = get_db_connection(&app)?;
    let prompt = conn.query_row(
        "SELECT id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at FROM saved_prompts WHERE id = ?1",
        params![&id],
        |row| {
            Ok(SavedPromptRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                category: row.get(3)?,
                prompt_text: row.get(4)?,
                variables: row.get(5)?,
                framework_id: row.get(6)?,
                is_builtin: row.get(7)?,
                is_favorite: row.get(8)?,
                usage_count: row.get(9)?,
                sort_order: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        },
    ).map_err(|e| format!("Prompt not found: {}", e))?;
    prompt_to_markdown(&prompt)
}

#[tauri::command]
pub async fn export_prompts_batch(ids: Vec<String>, app: tauri::AppHandle) -> Result<Vec<BatchExportResult>, String> {
    let conn = get_db_connection(&app)?;
    let mut results = Vec::new();
    for id in &ids {
        let prompt = conn.query_row(
            "SELECT id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at FROM saved_prompts WHERE id = ?1",
            params![id],
            |row| {
                Ok(SavedPromptRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    category: row.get(3)?,
                    prompt_text: row.get(4)?,
                    variables: row.get(5)?,
                    framework_id: row.get(6)?,
                    is_builtin: row.get(7)?,
                    is_favorite: row.get(8)?,
                    usage_count: row.get(9)?,
                    sort_order: row.get(10)?,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            },
        ).map_err(|e| format!("Prompt {} not found: {}", id, e))?;
        let content = prompt_to_markdown(&prompt)?;
        let filename = format!("{}.md", sanitize_filename(&prompt.name));
        results.push(BatchExportResult { filename, content });
    }
    Ok(results)
}

#[tauri::command]
pub async fn export_all_prompts(app: tauri::AppHandle) -> Result<Vec<BatchExportResult>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at FROM saved_prompts ORDER BY sort_order"
    ).map_err(|e| format!("Failed to query prompts: {}", e))?;

    let prompts: Vec<SavedPromptRow> = stmt.query_map([], |row| {
        Ok(SavedPromptRow {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            category: row.get(3)?,
            prompt_text: row.get(4)?,
            variables: row.get(5)?,
            framework_id: row.get(6)?,
            is_builtin: row.get(7)?,
            is_favorite: row.get(8)?,
            usage_count: row.get(9)?,
            sort_order: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    let mut results = Vec::new();
    for prompt in &prompts {
        let content = prompt_to_markdown(prompt)?;
        let filename = format!("{}.md", sanitize_filename(&prompt.name));
        results.push(BatchExportResult { filename, content });
    }
    Ok(results)
}

// === Phase 6: Prompt Import Commands ===

#[tauri::command]
pub async fn preview_import_prompt(md_content: String, app: tauri::AppHandle) -> Result<ImportPreview, String> {
    let (yaml_str, _body) = parse_yaml_frontmatter(&md_content)?;
    let meta: PromptExportMeta = serde_yaml::from_str(&yaml_str)
        .map_err(|e| format!("Invalid YAML front matter: {}", e))?;

    if meta.r#type != "prompt" {
        return Err(format!("Expected type 'prompt', got '{}'", meta.r#type));
    }
    if meta.export_version != 1 {
        return Err(format!("Unsupported export version: {}", meta.export_version));
    }
    if meta.name.is_empty() { return Err("Missing required field: name".to_string()); }
    if meta.category.is_empty() { return Err("Missing required field: category".to_string()); }
    if meta.id.is_empty() { return Err("Missing required field: id".to_string()); }

    let conn = get_db_connection(&app)?;
    let existing: Option<(String, bool)> = conn.query_row(
        "SELECT id, is_builtin FROM saved_prompts WHERE id = ?1",
        params![&meta.id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(|e| format!("DB error: {}", e))?;

    let (already_exists, is_builtin_conflict) = match existing {
        Some((_, is_builtin)) => (true, is_builtin),
        None => (false, false),
    };

    Ok(ImportPreview {
        item_type: "prompt".to_string(),
        id: meta.id,
        name: meta.name,
        category: meta.category,
        description: meta.description,
        already_exists,
        is_builtin_conflict,
    })
}

#[tauri::command]
pub async fn confirm_import_prompt(md_content: String, conflict_action: String, app: tauri::AppHandle) -> Result<ImportResult, String> {
    let (yaml_str, body) = parse_yaml_frontmatter(&md_content)?;
    let meta: PromptExportMeta = serde_yaml::from_str(&yaml_str)
        .map_err(|e| format!("Invalid YAML: {}", e))?;

    let prompt_text_start = body.find("# Prompt Text")
        .ok_or("Missing '# Prompt Text' section")?;
    let prompt_text = body[prompt_text_start + 13..].trim().to_string();

    let variables_json = serde_json::to_string(&meta.variables)
        .map_err(|e| format!("Failed to serialize variables: {}", e))?;

    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    let existing: Option<bool> = conn.query_row(
        "SELECT is_builtin FROM saved_prompts WHERE id = ?1",
        params![&meta.id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("DB error: {}", e))?;

    let final_id: String;
    let action: String;

    match (existing, conflict_action.as_str()) {
        (None, _) => {
            final_id = meta.id.clone();
            action = "created".to_string();
            conn.execute(
                "INSERT INTO saved_prompts (id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, 0, 999, ?8, ?9)",
                params![&meta.id, &meta.name, &meta.description, &meta.category, &prompt_text, &variables_json, &meta.framework_id, &now, &now],
            ).map_err(|e| format!("Failed to insert prompt: {}", e))?;
        },
        (Some(_), "skip") => {
            return Ok(ImportResult {
                success: true,
                item_type: "prompt".to_string(),
                id: meta.id,
                name: meta.name,
                action: "skipped".to_string(),
                error: None,
            });
        },
        (Some(_), "overwrite") => {
            final_id = meta.id.clone();
            action = "overwritten".to_string();
            conn.execute(
                "UPDATE saved_prompts SET name=?1, description=?2, category=?3, prompt_text=?4, variables=?5, framework_id=?6, updated_at=?7 WHERE id=?8",
                params![&meta.name, &meta.description, &meta.category, &prompt_text, &variables_json, &meta.framework_id, &now, &meta.id],
            ).map_err(|e| format!("Failed to update prompt: {}", e))?;
        },
        (Some(_), "copy") | (Some(_), _) => {
            final_id = format!("{}-imported-{}", meta.id, &Uuid::new_v4().to_string()[..8]);
            action = "copied".to_string();
            conn.execute(
                "INSERT INTO saved_prompts (id, name, description, category, prompt_text, variables, framework_id, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, 0, 999, ?8, ?9)",
                params![&final_id, &format!("{} (Imported)", meta.name), &meta.description, &meta.category, &prompt_text, &variables_json, &meta.framework_id, &now, &now],
            ).map_err(|e| format!("Failed to insert prompt copy: {}", e))?;
        },
    }

    Ok(ImportResult {
        success: true,
        item_type: "prompt".to_string(),
        id: final_id,
        name: meta.name,
        action,
        error: None,
    })
}

fn seed_workflows(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM workflows", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count workflows: {}", e))?;

    if count > 0 {
        return Ok(());
    }

    let now = Utc::now().timestamp();

    let templates: Vec<(&str, &str, &str, Vec<WorkflowStepDef>)> = vec![
        (
            "complete-product-brief",
            "Complete Product Brief",
            "End-to-end product brief: research, competitive analysis, PRD, and go-to-market plan",
            vec![
                WorkflowStepDef {
                    framework_id: "jtbd".to_string(),
                    label: "Jobs-to-be-Done Analysis".to_string(),
                    prompt_template: "Analyze the jobs-to-be-done for this product. Focus on the core user needs, desired outcomes, and pain points that drive adoption.".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "competitive-analysis".to_string(),
                    label: "Competitive Analysis".to_string(),
                    prompt_template: "Based on the following user research:\n\n{prev_output}\n\nConduct a competitive analysis identifying key competitors, their strengths and weaknesses, and market opportunities.".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "prd-template".to_string(),
                    label: "PRD Generation".to_string(),
                    prompt_template: "Using the research and competitive analysis below, generate a comprehensive PRD:\n\n{prev_output}".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "go-to-market".to_string(),
                    label: "Go-to-Market Plan".to_string(),
                    prompt_template: "Based on this PRD, create a go-to-market plan covering positioning, channels, pricing strategy, and launch timeline:\n\n{prev_output}".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
            ],
        ),
        (
            "feature-validation",
            "Feature Validation",
            "Validate and plan a feature: scoring, user stories, and sprint planning",
            vec![
                WorkflowStepDef {
                    framework_id: "rice".to_string(),
                    label: "RICE Scoring".to_string(),
                    prompt_template: "Score this feature using the RICE framework (Reach, Impact, Confidence, Effort). Provide detailed justification for each score.".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "user-story-map".to_string(),
                    label: "User Story Mapping".to_string(),
                    prompt_template: "Based on this RICE analysis, create a user story map breaking down the feature into epics and stories:\n\n{prev_output}".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "sprint-planning".to_string(),
                    label: "Sprint Planning".to_string(),
                    prompt_template: "Using these user stories, create a sprint plan with prioritized backlog items, effort estimates, and sprint goals:\n\n{prev_output}".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
            ],
        ),
        (
            "strategic-review",
            "Strategic Review",
            "Full strategic analysis: SWOT, competitive forces, and value proposition",
            vec![
                WorkflowStepDef {
                    framework_id: "swot".to_string(),
                    label: "SWOT Analysis".to_string(),
                    prompt_template: "Conduct a thorough SWOT analysis covering internal strengths and weaknesses, and external opportunities and threats.".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "porters-five-forces".to_string(),
                    label: "Porter's Five Forces".to_string(),
                    prompt_template: "Building on this SWOT analysis, analyze the competitive landscape using Porter's Five Forces:\n\n{prev_output}".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
                WorkflowStepDef {
                    framework_id: "value-proposition-canvas".to_string(),
                    label: "Value Proposition Canvas".to_string(),
                    prompt_template: "Using the strategic insights from SWOT and Five Forces analysis, develop a value proposition canvas:\n\n{prev_output}".to_string(),
                    context_doc_ids: vec![],
                    model: "gpt-5".to_string(),
                },
            ],
        ),
    ];

    for (id, name, description, steps) in templates {
        let steps_json = serde_json::to_string(&steps)
            .map_err(|e| format!("Failed to serialize workflow steps: {}", e))?;
        conn.execute(
            "INSERT OR IGNORE INTO workflows (id, project_id, name, description, steps, is_template, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
            params![id, "__templates__", name, description, &steps_json, &now, &now],
        ).map_err(|e| format!("Failed to seed workflow: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn create_workflow(
    project_id: String,
    name: String,
    description: String,
    steps_json: String,
    app: tauri::AppHandle,
) -> Result<Workflow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    conn.execute(
        "INSERT INTO workflows (id, project_id, name, description, steps, is_template, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        params![&id, &project_id, &name, &description, &steps_json, &now, &now],
    ).map_err(|e| format!("Failed to create workflow: {}", e))?;

    Ok(Workflow {
        id,
        project_id,
        name,
        description,
        steps: steps_json,
        is_template: false,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_workflows(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Workflow>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, description, steps, is_template, created_at, updated_at FROM workflows WHERE project_id = ?1 OR is_template = 1 ORDER BY is_template DESC, updated_at DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let workflows = stmt.query_map(params![&project_id], |row| {
        Ok(Workflow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            steps: row.get(4)?,
            is_template: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).map_err(|e| format!("Failed to query workflows: {}", e))?;

    let mut results = Vec::new();
    for wf in workflows {
        results.push(wf.map_err(|e| format!("Failed to read workflow: {}", e))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_workflow(
    id: String,
    app: tauri::AppHandle,
) -> Result<Workflow, String> {
    let conn = get_db_connection(&app)?;

    conn.query_row(
        "SELECT id, project_id, name, description, steps, is_template, created_at, updated_at FROM workflows WHERE id = ?1",
        params![&id],
        |row| {
            Ok(Workflow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                steps: row.get(4)?,
                is_template: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    ).map_err(|e| format!("Workflow not found: {}", e))
}

#[tauri::command]
pub async fn update_workflow(
    id: String,
    name: String,
    description: String,
    steps_json: String,
    app: tauri::AppHandle,
) -> Result<Workflow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE workflows SET name = ?1, description = ?2, steps = ?3, updated_at = ?4 WHERE id = ?5",
        params![&name, &description, &steps_json, &now, &id],
    ).map_err(|e| format!("Failed to update workflow: {}", e))?;

    get_workflow(id, app).await
}

#[tauri::command]
pub async fn delete_workflow(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM workflows WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete workflow: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn duplicate_workflow(
    id: String,
    new_name: String,
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Workflow, String> {
    let conn = get_db_connection(&app)?;
    let original = conn.query_row(
        "SELECT steps, description FROM workflows WHERE id = ?1",
        params![&id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ).map_err(|e| format!("Workflow not found: {}", e))?;

    let new_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    conn.execute(
        "INSERT INTO workflows (id, project_id, name, description, steps, is_template, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        params![&new_id, &project_id, &new_name, &original.1, &original.0, &now, &now],
    ).map_err(|e| format!("Failed to duplicate workflow: {}", e))?;

    Ok(Workflow {
        id: new_id,
        project_id,
        name: new_name,
        description: original.1,
        steps: original.0,
        is_template: false,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn create_workflow_run(
    workflow_id: String,
    project_id: String,
    app: tauri::AppHandle,
) -> Result<WorkflowRun, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    conn.execute(
        "INSERT INTO workflow_runs (id, workflow_id, project_id, status, created_at) VALUES (?1, ?2, ?3, 'pending', ?4)",
        params![&id, &workflow_id, &project_id, &now],
    ).map_err(|e| format!("Failed to create workflow run: {}", e))?;

    Ok(WorkflowRun {
        id,
        workflow_id,
        project_id,
        status: "pending".to_string(),
        started_at: None,
        completed_at: None,
        created_at: now,
    })
}

#[tauri::command]
pub async fn get_workflow_run(
    id: String,
    app: tauri::AppHandle,
) -> Result<WorkflowRun, String> {
    let conn = get_db_connection(&app)?;

    conn.query_row(
        "SELECT id, workflow_id, project_id, status, started_at, completed_at, created_at FROM workflow_runs WHERE id = ?1",
        params![&id],
        |row| {
            Ok(WorkflowRun {
                id: row.get(0)?,
                workflow_id: row.get(1)?,
                project_id: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                completed_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    ).map_err(|e| format!("Workflow run not found: {}", e))
}

#[tauri::command]
pub async fn list_workflow_runs(
    workflow_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<WorkflowRun>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, workflow_id, project_id, status, started_at, completed_at, created_at FROM workflow_runs WHERE workflow_id = ?1 ORDER BY created_at DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let runs = stmt.query_map(params![&workflow_id], |row| {
        Ok(WorkflowRun {
            id: row.get(0)?,
            workflow_id: row.get(1)?,
            project_id: row.get(2)?,
            status: row.get(3)?,
            started_at: row.get(4)?,
            completed_at: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| format!("Failed to query runs: {}", e))?;

    let mut results = Vec::new();
    for run in runs {
        results.push(run.map_err(|e| format!("Failed to read run: {}", e))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn update_workflow_run_status(
    id: String,
    status: String,
    completed_at: Option<i64>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    if status == "running" {
        conn.execute(
            "UPDATE workflow_runs SET status = ?1, started_at = ?2 WHERE id = ?3",
            params![&status, &now, &id],
        ).map_err(|e| format!("Failed to update run status: {}", e))?;
    } else {
        let end_time = completed_at.unwrap_or(now);
        conn.execute(
            "UPDATE workflow_runs SET status = ?1, completed_at = ?2 WHERE id = ?3",
            params![&status, &end_time, &id],
        ).map_err(|e| format!("Failed to update run status: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_workflow_run(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM workflow_runs WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete workflow run: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn create_workflow_run_step(
    run_id: String,
    step_index: i32,
    framework_id: String,
    input_prompt: Option<String>,
    app: tauri::AppHandle,
) -> Result<WorkflowRunStep, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO workflow_run_steps (id, run_id, step_index, framework_id, status, input_prompt) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
        params![&id, &run_id, &step_index, &framework_id, &input_prompt],
    ).map_err(|e| format!("Failed to create run step: {}", e))?;

    Ok(WorkflowRunStep {
        id,
        run_id,
        step_index,
        framework_id,
        status: "pending".to_string(),
        input_prompt,
        output_content: None,
        output_id: None,
        error: None,
        started_at: None,
        completed_at: None,
    })
}

#[tauri::command]
pub async fn update_workflow_run_step(
    id: String,
    status: String,
    output_content: Option<String>,
    output_id: Option<String>,
    error: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    if status == "running" {
        conn.execute(
            "UPDATE workflow_run_steps SET status = ?1, started_at = ?2 WHERE id = ?3",
            params![&status, &now, &id],
        ).map_err(|e| format!("Failed to update step: {}", e))?;
    } else {
        conn.execute(
            "UPDATE workflow_run_steps SET status = ?1, output_content = ?2, output_id = ?3, error = ?4, completed_at = ?5 WHERE id = ?6",
            params![&status, &output_content, &output_id, &error, &now, &id],
        ).map_err(|e| format!("Failed to update step: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_workflow_run_steps(
    run_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<WorkflowRunStep>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, run_id, step_index, framework_id, status, input_prompt, output_content, output_id, error, started_at, completed_at FROM workflow_run_steps WHERE run_id = ?1 ORDER BY step_index ASC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let steps = stmt.query_map(params![&run_id], |row| {
        Ok(WorkflowRunStep {
            id: row.get(0)?,
            run_id: row.get(1)?,
            step_index: row.get(2)?,
            framework_id: row.get(3)?,
            status: row.get(4)?,
            input_prompt: row.get(5)?,
            output_content: row.get(6)?,
            output_id: row.get(7)?,
            error: row.get(8)?,
            started_at: row.get(9)?,
            completed_at: row.get(10)?,
        })
    }).map_err(|e| format!("Failed to query steps: {}", e))?;

    let mut results = Vec::new();
    for step in steps {
        results.push(step.map_err(|e| format!("Failed to read step: {}", e))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_workflow_run_step(
    id: String,
    app: tauri::AppHandle,
) -> Result<WorkflowRunStep, String> {
    let conn = get_db_connection(&app)?;

    conn.query_row(
        "SELECT id, run_id, step_index, framework_id, status, input_prompt, output_content, output_id, error, started_at, completed_at FROM workflow_run_steps WHERE id = ?1",
        params![&id],
        |row| {
            Ok(WorkflowRunStep {
                id: row.get(0)?,
                run_id: row.get(1)?,
                step_index: row.get(2)?,
                framework_id: row.get(3)?,
                status: row.get(4)?,
                input_prompt: row.get(5)?,
                output_content: row.get(6)?,
                output_id: row.get(7)?,
                error: row.get(8)?,
                started_at: row.get(9)?,
                completed_at: row.get(10)?,
            })
        },
    ).map_err(|e| format!("Run step not found: {}", e))
}

// --- AI Insights Commands ---

#[tauri::command]
pub async fn list_project_insights(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<ProjectInsight>, String> {
    let conn = get_db_connection(&app)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, insight_type, title, description, priority, framework_id, is_dismissed, created_at FROM project_insights WHERE project_id = ?1 AND is_dismissed = 0 ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let insights = stmt.query_map(params![&project_id], |row| {
        Ok(ProjectInsight {
            id: row.get(0)?,
            project_id: row.get(1)?,
            insight_type: row.get(2)?,
            title: row.get(3)?,
            description: row.get(4)?,
            priority: row.get(5)?,
            framework_id: row.get(6)?,
            is_dismissed: row.get(7)?,
            created_at: row.get(8)?,
        })
    }).map_err(|e| format!("Failed to query insights: {}", e))?;

    let mut results = Vec::new();
    for insight in insights {
        results.push(insight.map_err(|e| format!("Failed to read insight: {}", e))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn dismiss_insight(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("UPDATE project_insights SET is_dismissed = 1 WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to dismiss insight: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn save_insights(
    project_id: String,
    insights_json: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();

    let insights: Vec<serde_json::Value> = serde_json::from_str(&insights_json)
        .map_err(|e| format!("Invalid insights JSON: {}", e))?;

    for insight in insights {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO project_insights (id, project_id, insight_type, title, description, priority, framework_id, is_dismissed, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)",
            params![
                &id,
                &project_id,
                insight["type"].as_str().unwrap_or("suggestion"),
                insight["title"].as_str().unwrap_or(""),
                insight["description"].as_str().unwrap_or(""),
                insight["priority"].as_str().unwrap_or("medium"),
                insight.get("framework_id").and_then(|v| v.as_str()),
                &now,
            ],
        ).map_err(|e| format!("Failed to save insight: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_project_insights(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM project_insights WHERE project_id = ?1", params![&project_id])
        .map_err(|e| format!("Failed to clear insights: {}", e))?;
    Ok(())
}

// --- Git Integration Commands ---

fn get_project_repo_path(app: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app directory: {}", e))?;
    let repo_path = app_dir.join("git").join(project_id);
    Ok(repo_path)
}

fn ensure_repo(app: &tauri::AppHandle, project_id: &str) -> Result<Repository, String> {
    let repo_path = get_project_repo_path(app, project_id)?;
    if repo_path.exists() {
        Repository::open(&repo_path).map_err(|e| format!("Failed to open repo: {}", e))
    } else {
        std::fs::create_dir_all(&repo_path)
            .map_err(|e| format!("Failed to create repo dir: {}", e))?;
        let repo = Repository::init(&repo_path)
            .map_err(|e| format!("Failed to init repo: {}", e))?;
        {
            let sig = Signature::now("ProdForge", "prodforge@local").map_err(|e| format!("Sig error: {}", e))?;
            let tree_id = {
                let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
                index.write_tree().map_err(|e| format!("Tree error: {}", e))?
            };
            let tree = repo.find_tree(tree_id).map_err(|e| format!("Tree find error: {}", e))?;
            repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
                .map_err(|e| format!("Initial commit error: {}", e))?;
        }
        Ok(repo)
    }
}

fn output_filename(output_id: &str) -> String {
    format!("outputs/{}.md", output_id)
}

#[tauri::command]
pub async fn init_project_repo(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    ensure_repo(&app, &project_id)?;
    Ok(())
}

#[tauri::command]
pub async fn commit_output(
    project_id: String,
    output_id: String,
    _name: String,
    content: String,
    message: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let repo = ensure_repo(&app, &project_id)?;
    let repo_path = get_project_repo_path(&app, &project_id)?;

    let outputs_dir = repo_path.join("outputs");
    std::fs::create_dir_all(&outputs_dir)
        .map_err(|e| format!("Failed to create outputs dir: {}", e))?;

    let file_path = repo_path.join(output_filename(&output_id));
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    index.add_path(std::path::Path::new(&output_filename(&output_id)))
        .map_err(|e| format!("Add error: {}", e))?;
    index.write().map_err(|e| format!("Write index error: {}", e))?;
    let tree_id = index.write_tree().map_err(|e| format!("Tree error: {}", e))?;
    let tree = repo.find_tree(tree_id).map_err(|e| format!("Tree find error: {}", e))?;

    let sig = Signature::now("ProdForge", "prodforge@local").map_err(|e| format!("Sig error: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    let parent = head.peel_to_commit().map_err(|e| format!("Parent error: {}", e))?;

    repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])
        .map_err(|e| format!("Commit error: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn list_output_commits(
    project_id: String,
    output_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<CommitInfo>, String> {
    let repo = ensure_repo(&app, &project_id)?;
    let filename = output_filename(&output_id);

    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk error: {}", e))?;
    revwalk.push_head().map_err(|e| format!("Push head error: {}", e))?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| format!("Sort error: {}", e))?;

    let mut commits = Vec::new();
    for oid in revwalk {
        let oid = oid.map_err(|e| format!("OID error: {}", e))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("Commit error: {}", e))?;
        let tree = commit.tree().map_err(|e| format!("Tree error: {}", e))?;

        if tree.get_path(std::path::Path::new(&filename)).is_ok() {
            let dominated = if commit.parent_count() > 0 {
                let parent = commit.parent(0).map_err(|e| format!("Parent error: {}", e))?;
                let parent_tree = parent.tree().map_err(|e| format!("Parent tree error: {}", e))?;
                let diff = repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                    .map_err(|e| format!("Diff error: {}", e))?;
                diff.deltas().any(|d| {
                    d.new_file().path().map(|p| p.to_str() == Some(&filename)).unwrap_or(false)
                })
            } else {
                true
            };

            if dominated {
                commits.push(CommitInfo {
                    oid: oid.to_string(),
                    message: commit.message().unwrap_or("").to_string(),
                    author: commit.author().name().unwrap_or("PM IDE").to_string(),
                    timestamp: commit.time().seconds(),
                });
            }
        }
    }

    Ok(commits)
}

#[tauri::command]
pub async fn get_commit_diff(
    project_id: String,
    commit_oid: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let repo = ensure_repo(&app, &project_id)?;
    let oid = git2::Oid::from_str(&commit_oid).map_err(|e| format!("Invalid OID: {}", e))?;
    let commit = repo.find_commit(oid).map_err(|e| format!("Commit not found: {}", e))?;
    let tree = commit.tree().map_err(|e| format!("Tree error: {}", e))?;

    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0).map_err(|e| format!("Parent error: {}", e))?
            .tree().map_err(|e| format!("Parent tree error: {}", e))?)
    } else {
        None
    };

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| format!("Diff error: {}", e))?;

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            _ => "",
        };
        diff_text.push_str(prefix);
        diff_text.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    }).map_err(|e| format!("Diff print error: {}", e))?;

    Ok(diff_text)
}

#[tauri::command]
pub async fn get_output_at_commit(
    project_id: String,
    output_id: String,
    commit_oid: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let repo = ensure_repo(&app, &project_id)?;
    let oid = git2::Oid::from_str(&commit_oid).map_err(|e| format!("Invalid OID: {}", e))?;
    let commit = repo.find_commit(oid).map_err(|e| format!("Commit not found: {}", e))?;
    let tree = commit.tree().map_err(|e| format!("Tree error: {}", e))?;

    let filename = output_filename(&output_id);
    let entry = tree.get_path(std::path::Path::new(&filename))
        .map_err(|e| format!("File not found at commit: {}", e))?;

    let blob = repo.find_blob(entry.id())
        .map_err(|e| format!("Blob error: {}", e))?;

    let content = std::str::from_utf8(blob.content())
        .map_err(|e| format!("UTF-8 error: {}", e))?;

    Ok(content.to_string())
}

#[tauri::command]
pub async fn rollback_output(
    project_id: String,
    output_id: String,
    commit_oid: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let content = get_output_at_commit(project_id.clone(), output_id.clone(), commit_oid, app.clone()).await?;

    // Update the DB
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE framework_outputs SET generated_content = ?1, updated_at = ?2 WHERE id = ?3",
        params![&content, &now, &output_id],
    ).map_err(|e| format!("Failed to update output: {}", e))?;

    // Commit the rollback
    commit_output(project_id, output_id, "Rollback".to_string(), content.clone(), "Rollback to previous version".to_string(), app).await?;

    Ok(content)
}

// --- Integration Commands (Jira / Notion) ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JiraProject {
    pub key: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JiraExportResult {
    pub success: bool,
    pub issue_key: Option<String>,
    pub issue_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotionPage {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotionExportResult {
    pub success: bool,
    pub page_url: Option<String>,
    pub error: Option<String>,
}

fn get_decrypted_token(encrypted: &Option<String>, app: &tauri::AppHandle) -> Result<Option<String>, String> {
    if let Some(ref enc) = encrypted {
        let key = get_encryption_key(app)?;
        Ok(Some(decrypt_string(enc, &key)?))
    } else {
        Ok(None)
    }
}

fn markdown_to_jira(md: &str) -> String {
    let mut result = String::new();
    for line in md.lines() {
        if line.starts_with("### ") {
            result.push_str(&format!("h3. {}\n", &line[4..]));
        } else if line.starts_with("## ") {
            result.push_str(&format!("h2. {}\n", &line[3..]));
        } else if line.starts_with("# ") {
            result.push_str(&format!("h1. {}\n", &line[2..]));
        } else if line.starts_with("- ") {
            result.push_str(&format!("* {}\n", &line[2..]));
        } else if line.starts_with("**") && line.ends_with("**") {
            result.push_str(&format!("*{}*\n", &line[2..line.len()-2]));
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }
    result
}

#[tauri::command]
pub async fn test_jira_connection(app: tauri::AppHandle) -> Result<bool, String> {
    let settings = get_settings(app.clone()).await?;
    let url = settings.jira_url.ok_or("Jira URL not configured")?;
    let email = settings.jira_email.ok_or("Jira email not configured")?;
    let token = get_decrypted_token(&settings.jira_api_token_encrypted, &app)?
        .ok_or("Jira API token not configured")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/rest/api/3/myself", url.trim_end_matches('/')))
        .basic_auth(&email, Some(&token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    Ok(resp.status().is_success())
}

#[tauri::command]
pub async fn list_jira_projects(app: tauri::AppHandle) -> Result<Vec<JiraProject>, String> {
    let settings = get_settings(app.clone()).await?;
    let url = settings.jira_url.ok_or("Jira URL not configured")?;
    let email = settings.jira_email.ok_or("Jira email not configured")?;
    let token = get_decrypted_token(&settings.jira_api_token_encrypted, &app)?
        .ok_or("Jira API token not configured")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/rest/api/3/project", url.trim_end_matches('/')))
        .basic_auth(&email, Some(&token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Parse error: {}", e))?;

    let projects = body.as_array()
        .map(|arr| {
            arr.iter().filter_map(|p| {
                Some(JiraProject {
                    key: p.get("key")?.as_str()?.to_string(),
                    name: p.get("name")?.as_str()?.to_string(),
                })
            }).collect()
        })
        .unwrap_or_default();

    Ok(projects)
}

#[tauri::command]
pub async fn export_to_jira(
    output_id: String,
    project_key: String,
    issue_type: String,
    summary: String,
    app: tauri::AppHandle,
) -> Result<JiraExportResult, String> {
    let settings = get_settings(app.clone()).await?;
    let url = settings.jira_url.ok_or("Jira URL not configured")?;
    let email = settings.jira_email.ok_or("Jira email not configured")?;
    let token = get_decrypted_token(&settings.jira_api_token_encrypted, &app)?
        .ok_or("Jira API token not configured")?;

    let conn = get_db_connection(&app)?;
    let content: String = conn.query_row(
        "SELECT generated_content FROM framework_outputs WHERE id = ?1",
        params![&output_id],
        |row| row.get(0),
    ).map_err(|e| format!("Output not found: {}", e))?;

    let jira_content = markdown_to_jira(&content);

    let payload = serde_json::json!({
        "fields": {
            "project": { "key": project_key },
            "summary": summary,
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{
                    "type": "codeBlock",
                    "attrs": { "language": "none" },
                    "content": [{ "type": "text", "text": jira_content }]
                }]
            },
            "issuetype": { "name": issue_type }
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/rest/api/3/issue", url.trim_end_matches('/')))
        .basic_auth(&email, Some(&token))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await
            .map_err(|e| format!("Parse error: {}", e))?;
        let issue_key = body.get("key").and_then(|k| k.as_str()).unwrap_or("").to_string();
        let issue_url = format!("{}/browse/{}", url.trim_end_matches('/'), issue_key);
        Ok(JiraExportResult {
            success: true,
            issue_key: Some(issue_key),
            issue_url: Some(issue_url),
            error: None,
        })
    } else {
        let err_text = resp.text().await.unwrap_or_default();
        Ok(JiraExportResult {
            success: false,
            issue_key: None,
            issue_url: None,
            error: Some(err_text),
        })
    }
}

#[tauri::command]
pub async fn test_notion_connection(app: tauri::AppHandle) -> Result<bool, String> {
    let settings = get_settings(app.clone()).await?;
    let token = get_decrypted_token(&settings.notion_api_token_encrypted, &app)?
        .ok_or("Notion API token not configured")?;

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.notion.com/v1/users/me")
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", "2022-06-28")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    Ok(resp.status().is_success())
}

#[tauri::command]
pub async fn search_notion_pages(
    query: String,
    app: tauri::AppHandle,
) -> Result<Vec<NotionPage>, String> {
    let settings = get_settings(app.clone()).await?;
    let token = get_decrypted_token(&settings.notion_api_token_encrypted, &app)?
        .ok_or("Notion API token not configured")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.notion.com/v1/search")
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", "2022-06-28")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "query": query,
            "filter": { "value": "page", "property": "object" },
            "page_size": 20
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let body: serde_json::Value = resp.json().await
        .map_err(|e| format!("Parse error: {}", e))?;

    let pages = body.get("results")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter().filter_map(|p| {
                let id = p.get("id")?.as_str()?.to_string();
                let title = p.get("properties")
                    .and_then(|props| props.get("title"))
                    .and_then(|t| t.get("title"))
                    .and_then(|arr| arr.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|item| item.get("plain_text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("Untitled")
                    .to_string();
                Some(NotionPage { id, title })
            }).collect()
        })
        .unwrap_or_default();

    Ok(pages)
}

#[tauri::command]
pub async fn export_to_notion(
    output_id: String,
    parent_page_id: String,
    title: String,
    app: tauri::AppHandle,
) -> Result<NotionExportResult, String> {
    let settings = get_settings(app.clone()).await?;
    let token = get_decrypted_token(&settings.notion_api_token_encrypted, &app)?
        .ok_or("Notion API token not configured")?;

    let conn = get_db_connection(&app)?;
    let content: String = conn.query_row(
        "SELECT generated_content FROM framework_outputs WHERE id = ?1",
        params![&output_id],
        |row| row.get(0),
    ).map_err(|e| format!("Output not found: {}", e))?;

    let mut blocks: Vec<serde_json::Value> = Vec::new();
    for line in content.lines() {
        if line.starts_with("### ") {
            blocks.push(serde_json::json!({
                "object": "block",
                "type": "heading_3",
                "heading_3": {
                    "rich_text": [{ "type": "text", "text": { "content": &line[4..] } }]
                }
            }));
        } else if line.starts_with("## ") {
            blocks.push(serde_json::json!({
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{ "type": "text", "text": { "content": &line[3..] } }]
                }
            }));
        } else if line.starts_with("# ") {
            blocks.push(serde_json::json!({
                "object": "block",
                "type": "heading_1",
                "heading_1": {
                    "rich_text": [{ "type": "text", "text": { "content": &line[2..] } }]
                }
            }));
        } else if line.starts_with("- ") || line.starts_with("* ") {
            blocks.push(serde_json::json!({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [{ "type": "text", "text": { "content": &line[2..] } }]
                }
            }));
        } else if !line.trim().is_empty() {
            blocks.push(serde_json::json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{ "type": "text", "text": { "content": line } }]
                }
            }));
        }
    }

    // Notion API limits to 100 blocks per request
    if blocks.len() > 100 {
        blocks.truncate(100);
    }

    let payload = serde_json::json!({
        "parent": { "page_id": parent_page_id },
        "properties": {
            "title": {
                "title": [{ "type": "text", "text": { "content": title } }]
            }
        },
        "children": blocks
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.notion.com/v1/pages")
        .header("Authorization", format!("Bearer {}", token))
        .header("Notion-Version", "2022-06-28")
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await
            .map_err(|e| format!("Parse error: {}", e))?;
        let page_url = body.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
        Ok(NotionExportResult {
            success: true,
            page_url: Some(page_url),
            error: None,
        })
    } else {
        let err_text = resp.text().await.unwrap_or_default();
        Ok(NotionExportResult {
            success: false,
            page_url: None,
            error: Some(err_text),
        })
    }
}

// ─── File Explorer Commands ───────────────────────────────────────────────────

fn expand_home(path: &str) -> String {
    if path.starts_with('~') {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
        format!("{}{}", home, &path[1..])
    } else {
        path.to_string()
    }
}

fn read_dir_entries(dir: &std::path::Path, include_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if !include_hidden && name.starts_with('.') {
            continue;
        }
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };
        let modified = metadata.modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);
        let extension = entry.path().extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();

        entries.push(FileEntry { name, path: path_str, is_dir, size, modified, extension });
    }

    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let expanded = expand_home(&path);
    let dir = std::path::Path::new(&expanded);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Not a valid directory: {}", expanded));
    }
    read_dir_entries(dir, false)
}

#[tauri::command]
pub async fn list_directory_all(path: String) -> Result<Vec<FileEntry>, String> {
    let expanded = expand_home(&path);
    let dir = std::path::Path::new(&expanded);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Not a valid directory: {}", expanded));
    }
    read_dir_entries(dir, true)
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let expanded = expand_home(&path);
    std::fs::read_to_string(&expanded)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    let expanded = expand_home(&path);
    std::fs::write(&expanded, &content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn create_new_file(path: String) -> Result<(), String> {
    let expanded = expand_home(&path);
    if std::path::Path::new(&expanded).exists() {
        return Err("File already exists".to_string());
    }
    std::fs::write(&expanded, "")
        .map_err(|e| format!("Failed to create file: {}", e))
}

#[tauri::command]
pub async fn create_new_directory(path: String) -> Result<(), String> {
    let expanded = expand_home(&path);
    if std::path::Path::new(&expanded).exists() {
        return Err("Directory already exists".to_string());
    }
    std::fs::create_dir_all(&expanded)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
pub async fn rename_fs_path(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename: {}", e))
}

#[tauri::command]
pub async fn delete_fs_path(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        std::fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
pub async fn get_home_directory() -> Result<String, String> {
    std::env::var("HOME").map_err(|_| "HOME not set".to_string())
}

#[tauri::command]
pub async fn get_app_directory() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current directory: {}", e))
}

// === PTY Terminal Commands ===

#[tauri::command]
pub async fn create_pty_session(
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    command: Option<String>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let working_dir = cwd.unwrap_or_else(|| {
        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
    });

    let pty_manager = app.state::<crate::pty::PtyManager>();
    pty_manager.create_session(&session_id, cols, rows, &working_dir, command.as_deref(), app.clone())?;

    Ok(session_id)
}

#[tauri::command]
pub async fn write_pty(
    session_id: String,
    data: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let pty_manager = app.state::<crate::pty::PtyManager>();
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
pub async fn resize_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let pty_manager = app.state::<crate::pty::PtyManager>();
    pty_manager.resize_session(&session_id, cols, rows)
}

#[tauri::command]
pub async fn close_pty(
    session_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let pty_manager = app.state::<crate::pty::PtyManager>();
    pty_manager.close_session(&session_id)
}

// --- Workspace State Commands ---

#[tauri::command]
pub async fn save_workspace_state(
    project_id: String,
    state_json: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute(
        "UPDATE projects SET workspace_state = ?1 WHERE id = ?2",
        params![&state_json, &project_id],
    ).map_err(|e| format!("Failed to save workspace state: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_workspace_state(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let conn = get_db_connection(&app)?;
    let result: Option<String> = conn.query_row(
        "SELECT workspace_state FROM projects WHERE id = ?1",
        params![&project_id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("Failed to get workspace state: {}", e))?
    .flatten();
    Ok(result)
}

#[tauri::command]
pub async fn save_project_repo_path(
    project_id: String,
    repo_path: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute(
        "UPDATE projects SET repo_path = ?1 WHERE id = ?2",
        params![&repo_path, &project_id],
    ).map_err(|e| format!("Failed to save repo path: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_project_repo_path_cmd(
    project_id: String,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let conn = get_db_connection(&app)?;
    let result: Option<String> = conn.query_row(
        "SELECT repo_path FROM projects WHERE id = ?1",
        params![&project_id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("Failed to get repo path: {}", e))?
    .flatten();
    Ok(result)
}

// --- Git Repository Commands ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitLogEntry {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitRemoteInfo {
    pub name: String,
    pub url: String,
}

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<Vec<GitFileStatus>, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let statuses = repo.statuses(None)
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let mut files = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();

        if s.is_index_new() {
            files.push(GitFileStatus { path: path.clone(), status: "added".into(), staged: true });
        }
        if s.is_index_modified() {
            files.push(GitFileStatus { path: path.clone(), status: "modified".into(), staged: true });
        }
        if s.is_index_deleted() {
            files.push(GitFileStatus { path: path.clone(), status: "deleted".into(), staged: true });
        }
        if s.is_index_renamed() {
            files.push(GitFileStatus { path: path.clone(), status: "renamed".into(), staged: true });
        }
        if s.is_wt_new() {
            files.push(GitFileStatus { path: path.clone(), status: "untracked".into(), staged: false });
        }
        if s.is_wt_modified() {
            files.push(GitFileStatus { path: path.clone(), status: "modified".into(), staged: false });
        }
        if s.is_wt_deleted() {
            files.push(GitFileStatus { path: path.clone(), status: "deleted".into(), staged: false });
        }
        if s.is_wt_renamed() {
            files.push(GitFileStatus { path: path.clone(), status: "renamed".into(), staged: false });
        }
        if s.is_conflicted() {
            files.push(GitFileStatus { path, status: "conflicted".into(), staged: false });
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn git_log(repo_path: String, limit: Option<usize>) -> Result<Vec<GitLogEntry>, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let mut revwalk = repo.revwalk()
        .map_err(|e| format!("Revwalk error: {}", e))?;
    revwalk.push_head().map_err(|e| format!("Push head error: {}", e))?;
    revwalk.set_sorting(git2::Sort::TIME)
        .map_err(|e| format!("Sort error: {}", e))?;

    let max = limit.unwrap_or(100);
    let mut entries = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i >= max { break; }
        let oid = oid.map_err(|e| format!("OID error: {}", e))?;
        let commit = repo.find_commit(oid)
            .map_err(|e| format!("Commit error: {}", e))?;
        entries.push(GitLogEntry {
            oid: oid.to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            email: commit.author().email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn git_branches(repo_path: String) -> Result<Vec<GitBranchInfo>, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let head = repo.head().ok();
    let current_branch = head.as_ref()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut branches = Vec::new();
    for branch_result in repo.branches(None).map_err(|e| format!("Branches error: {}", e))? {
        let (branch, branch_type) = branch_result.map_err(|e| format!("Branch error: {}", e))?;
        let name = branch.name().map_err(|e| format!("Name error: {}", e))?
            .unwrap_or("").to_string();
        let is_remote = branch_type == git2::BranchType::Remote;
        let upstream = branch.upstream().ok()
            .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));
        branches.push(GitBranchInfo {
            is_current: !is_remote && current_branch.as_deref() == Some(&name),
            name,
            is_remote,
            upstream,
        });
    }

    Ok(branches)
}

#[tauri::command]
pub fn git_checkout_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let (object, reference) = repo.revparse_ext(&branch_name)
        .map_err(|e| format!("Branch not found: {}", e))?;
    repo.checkout_tree(&object, None)
        .map_err(|e| format!("Checkout error: {}", e))?;
    if let Some(refname) = reference.and_then(|r| r.name().map(|s| s.to_string())) {
        repo.set_head(&refname)
            .map_err(|e| format!("Set HEAD error: {}", e))?;
    } else {
        repo.set_head_detached(object.id())
            .map_err(|e| format!("Detach HEAD error: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    let commit = head.peel_to_commit()
        .map_err(|e| format!("Peel error: {}", e))?;
    repo.branch(&branch_name, &commit, false)
        .map_err(|e| format!("Create branch error: {}", e))?;
    let refname = format!("refs/heads/{}", branch_name);
    let obj = repo.revparse_single(&refname)
        .map_err(|e| format!("Revparse error: {}", e))?;
    repo.checkout_tree(&obj, None)
        .map_err(|e| format!("Checkout error: {}", e))?;
    repo.set_head(&refname)
        .map_err(|e| format!("Set HEAD error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn git_stage_files(repo_path: String, files: Vec<String>) -> Result<(), String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    for file in &files {
        let path = std::path::Path::new(file);
        if std::path::Path::new(&repo_path).join(path).exists() {
            index.add_path(path).map_err(|e| format!("Stage error for {}: {}", file, e))?;
        } else {
            index.remove_path(path).map_err(|e| format!("Remove error for {}: {}", file, e))?;
        }
    }
    index.write().map_err(|e| format!("Write index error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage_files(repo_path: String, files: Vec<String>) -> Result<(), String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    let commit = head.peel_to_commit()
        .map_err(|e| format!("Peel error: {}", e))?;
    let tree = commit.tree().map_err(|e| format!("Tree error: {}", e))?;

    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    for file in &files {
        let path = std::path::Path::new(file);
        if let Ok(entry) = tree.get_path(path) {
            let blob = repo.find_blob(entry.id())
                .map_err(|e| format!("Blob error: {}", e))?;
            let ie = git2::IndexEntry {
                ctime: git2::IndexTime::new(0, 0),
                mtime: git2::IndexTime::new(0, 0),
                dev: 0,
                ino: 0,
                mode: entry.filemode() as u32,
                uid: 0,
                gid: 0,
                file_size: blob.size() as u32,
                id: entry.id(),
                flags: 0,
                flags_extended: 0,
                path: file.as_bytes().to_vec(),
            };
            index.add(&ie).map_err(|e| format!("Reset error: {}", e))?;
        } else {
            index.remove_path(path).map_err(|e| format!("Remove error: {}", e))?;
        }
    }
    index.write().map_err(|e| format!("Write index error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn git_commit_changes(
    repo_path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<String, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    let tree_id = index.write_tree().map_err(|e| format!("Tree error: {}", e))?;
    let tree = repo.find_tree(tree_id).map_err(|e| format!("Find tree error: {}", e))?;

    let name = author_name.unwrap_or_else(|| "ProdForge User".to_string());
    let email = author_email.unwrap_or_else(|| "prodforge@local".to_string());
    let sig = Signature::now(&name, &email)
        .map_err(|e| format!("Signature error: {}", e))?;

    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    let parent = head.peel_to_commit().map_err(|e| format!("Peel error: {}", e))?;

    let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])
        .map_err(|e| format!("Commit error: {}", e))?;

    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_diff_working(repo_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let diff = repo.diff_index_to_workdir(None, None)
        .map_err(|e| format!("Diff error: {}", e))?;

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            _ => "",
        };
        diff_text.push_str(prefix);
        diff_text.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    }).map_err(|e| format!("Diff print error: {}", e))?;

    Ok(diff_text)
}

#[tauri::command]
pub fn git_diff_staged(repo_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    let tree = head.peel_to_tree().map_err(|e| format!("Tree error: {}", e))?;

    let diff = repo.diff_tree_to_index(Some(&tree), None, None)
        .map_err(|e| format!("Diff error: {}", e))?;

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            _ => "",
        };
        diff_text.push_str(prefix);
        diff_text.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    }).map_err(|e| format!("Diff print error: {}", e))?;

    Ok(diff_text)
}

#[tauri::command]
pub fn git_remote_info(repo_path: String) -> Result<Vec<GitRemoteInfo>, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let remotes = repo.remotes()
        .map_err(|e| format!("Remotes error: {}", e))?;

    let mut infos = Vec::new();
    for name in remotes.iter().flatten() {
        if let Ok(remote) = repo.find_remote(name) {
            infos.push(GitRemoteInfo {
                name: name.to_string(),
                url: remote.url().unwrap_or("").to_string(),
            });
        }
    }
    Ok(infos)
}

#[tauri::command]
pub fn git_init_repo(repo_path: String) -> Result<(), String> {
    Repository::init(&repo_path)
        .map_err(|e| format!("Init error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn git_clone_repo(url: String, target_path: String) -> Result<(), String> {
    Repository::clone(&url, &target_path)
        .map_err(|e| format!("Clone error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn git_current_branch(repo_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let head = repo.head().map_err(|e| format!("HEAD error: {}", e))?;
    Ok(head.shorthand().unwrap_or("HEAD").to_string())
}

#[tauri::command]
pub fn git_stage_all(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Add all error: {}", e))?;
    index.write().map_err(|e| format!("Write index error: {}", e))?;
    Ok(())
}

// === Phase 9: Skills & Agents ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillCategoryRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub sort_order: i32,
    pub is_builtin: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub system_prompt: String,
    pub tools: String,
    pub output_schema: Option<String>,
    pub model_tier: String,
    pub is_builtin: bool,
    pub is_favorite: bool,
    pub usage_count: i32,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub system_instructions: String,
    pub skill_ids: String,
    pub model: String,
    pub provider: String,
    pub max_tokens: i32,
    pub temperature: f64,
    pub tools_config: String,
    pub context_strategy: String,
    pub is_builtin: bool,
    pub is_favorite: bool,
    pub usage_count: i32,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
    pub fallback_model: Option<String>,
    pub memory_config: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentRunRow {
    pub id: String,
    pub agent_id: String,
    pub project_id: String,
    pub skill_id: Option<String>,
    pub status: String,
    pub input_prompt: String,
    pub output_content: Option<String>,
    pub model: String,
    pub provider: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    pub cost: f64,
    pub duration_ms: Option<i64>,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

fn row_to_skill_category(row: &rusqlite::Row) -> rusqlite::Result<SkillCategoryRow> {
    Ok(SkillCategoryRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        sort_order: row.get(4)?,
        is_builtin: row.get::<_, i32>(5)? != 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const SKILL_CATEGORY_COLUMNS: &str = "id, name, description, icon, sort_order, is_builtin, created_at, updated_at";

fn row_to_skill(row: &rusqlite::Row) -> rusqlite::Result<SkillRow> {
    Ok(SkillRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        category: row.get(3)?,
        system_prompt: row.get(4)?,
        tools: row.get(5)?,
        output_schema: row.get(6)?,
        model_tier: row.get(7)?,
        is_builtin: row.get::<_, i32>(8)? != 0,
        is_favorite: row.get::<_, i32>(9)? != 0,
        usage_count: row.get(10)?,
        sort_order: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const SKILL_COLUMNS: &str = "id, name, description, category, system_prompt, tools, output_schema, model_tier, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at";

fn row_to_agent(row: &rusqlite::Row) -> rusqlite::Result<AgentRow> {
    Ok(AgentRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        system_instructions: row.get(4)?,
        skill_ids: row.get(5)?,
        model: row.get(6)?,
        provider: row.get(7)?,
        max_tokens: row.get(8)?,
        temperature: row.get(9)?,
        tools_config: row.get(10)?,
        context_strategy: row.get(11)?,
        is_builtin: row.get::<_, i32>(12)? != 0,
        is_favorite: row.get::<_, i32>(13)? != 0,
        usage_count: row.get(14)?,
        sort_order: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
        fallback_model: row.get(18).ok(),
        memory_config: row.get(19).ok(),
    })
}

const AGENT_COLUMNS: &str = "id, name, description, icon, system_instructions, skill_ids, model, provider, max_tokens, temperature, tools_config, context_strategy, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at, fallback_model, memory_config";

fn row_to_agent_run(row: &rusqlite::Row) -> rusqlite::Result<AgentRunRow> {
    Ok(AgentRunRow {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        project_id: row.get(2)?,
        skill_id: row.get(3)?,
        status: row.get(4)?,
        input_prompt: row.get(5)?,
        output_content: row.get(6)?,
        model: row.get(7)?,
        provider: row.get(8)?,
        input_tokens: row.get(9)?,
        output_tokens: row.get(10)?,
        total_tokens: row.get(11)?,
        cost: row.get(12)?,
        duration_ms: row.get(13)?,
        error: row.get(14)?,
        started_at: row.get(15)?,
        completed_at: row.get(16)?,
        created_at: row.get(17)?,
    })
}

const AGENT_RUN_COLUMNS: &str = "id, agent_id, project_id, skill_id, status, input_prompt, output_content, model, provider, input_tokens, output_tokens, total_tokens, cost, duration_ms, error, started_at, completed_at, created_at";

// === Phase 10: Agent Teams ===

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentTeamRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub execution_mode: String,
    pub conductor_agent_id: Option<String>,
    pub max_concurrent: i32,
    pub is_favorite: bool,
    pub usage_count: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentTeamNodeRow {
    pub id: String,
    pub team_id: String,
    pub agent_id: String,
    pub node_type: String,
    pub position_x: f64,
    pub position_y: f64,
    pub role: String,
    pub config: String,
    pub sort_order: i32,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentTeamEdgeRow {
    pub id: String,
    pub team_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub edge_type: String,
    pub condition: Option<String>,
    pub data_mapping: String,
    pub label: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamRunRow {
    pub id: String,
    pub team_id: String,
    pub project_id: String,
    pub status: String,
    pub input: String,
    pub output: Option<String>,
    pub execution_mode: String,
    pub total_tokens: i32,
    pub total_cost: f64,
    pub duration_ms: Option<i64>,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamRunStepRow {
    pub id: String,
    pub team_run_id: String,
    pub node_id: String,
    pub agent_id: String,
    pub status: String,
    pub input: String,
    pub output: Option<String>,
    pub tokens: i32,
    pub cost: f64,
    pub duration_ms: Option<i64>,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

fn row_to_agent_team(row: &rusqlite::Row) -> rusqlite::Result<AgentTeamRow> {
    Ok(AgentTeamRow {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        execution_mode: row.get(4)?,
        conductor_agent_id: row.get(5)?,
        max_concurrent: row.get(6)?,
        is_favorite: row.get::<_, i32>(7)? != 0,
        usage_count: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const AGENT_TEAM_COLUMNS: &str = "id, name, description, icon, execution_mode, conductor_agent_id, max_concurrent, is_favorite, usage_count, created_at, updated_at";

fn row_to_team_node(row: &rusqlite::Row) -> rusqlite::Result<AgentTeamNodeRow> {
    Ok(AgentTeamNodeRow {
        id: row.get(0)?,
        team_id: row.get(1)?,
        agent_id: row.get(2)?,
        node_type: row.get(3)?,
        position_x: row.get(4)?,
        position_y: row.get(5)?,
        role: row.get(6)?,
        config: row.get(7)?,
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
    })
}

const TEAM_NODE_COLUMNS: &str = "id, team_id, agent_id, node_type, position_x, position_y, role, config, sort_order, created_at";

fn row_to_team_edge(row: &rusqlite::Row) -> rusqlite::Result<AgentTeamEdgeRow> {
    Ok(AgentTeamEdgeRow {
        id: row.get(0)?,
        team_id: row.get(1)?,
        source_node_id: row.get(2)?,
        target_node_id: row.get(3)?,
        edge_type: row.get(4)?,
        condition: row.get(5)?,
        data_mapping: row.get(6)?,
        label: row.get(7)?,
        created_at: row.get(8)?,
    })
}

const TEAM_EDGE_COLUMNS: &str = "id, team_id, source_node_id, target_node_id, edge_type, condition, data_mapping, label, created_at";

fn row_to_team_run(row: &rusqlite::Row) -> rusqlite::Result<TeamRunRow> {
    Ok(TeamRunRow {
        id: row.get(0)?,
        team_id: row.get(1)?,
        project_id: row.get(2)?,
        status: row.get(3)?,
        input: row.get(4)?,
        output: row.get(5)?,
        execution_mode: row.get(6)?,
        total_tokens: row.get(7)?,
        total_cost: row.get(8)?,
        duration_ms: row.get(9)?,
        error: row.get(10)?,
        started_at: row.get(11)?,
        completed_at: row.get(12)?,
        created_at: row.get(13)?,
    })
}

const TEAM_RUN_COLUMNS: &str = "id, team_id, project_id, status, input, output, execution_mode, total_tokens, total_cost, duration_ms, error, started_at, completed_at, created_at";

fn row_to_team_run_step(row: &rusqlite::Row) -> rusqlite::Result<TeamRunStepRow> {
    Ok(TeamRunStepRow {
        id: row.get(0)?,
        team_run_id: row.get(1)?,
        node_id: row.get(2)?,
        agent_id: row.get(3)?,
        status: row.get(4)?,
        input: row.get(5)?,
        output: row.get(6)?,
        tokens: row.get(7)?,
        cost: row.get(8)?,
        duration_ms: row.get(9)?,
        error: row.get(10)?,
        started_at: row.get(11)?,
        completed_at: row.get(12)?,
        created_at: row.get(13)?,
    })
}

const TEAM_RUN_STEP_COLUMNS: &str = "id, team_run_id, node_id, agent_id, status, input, output, tokens, cost, duration_ms, error, started_at, completed_at, created_at";

// Phase 11: Schedule structs

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduleRow {
    pub id: String,
    pub name: String,
    pub target_type: String,
    pub target_id: String,
    pub trigger_type: String,
    pub trigger_config: String,
    pub is_active: bool,
    pub last_run_at: Option<i64>,
    pub next_run_at: Option<i64>,
    pub run_count: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

fn row_to_schedule(row: &rusqlite::Row) -> rusqlite::Result<ScheduleRow> {
    Ok(ScheduleRow {
        id: row.get(0)?,
        name: row.get(1)?,
        target_type: row.get(2)?,
        target_id: row.get(3)?,
        trigger_type: row.get(4)?,
        trigger_config: row.get(5)?,
        is_active: row.get::<_, i32>(6)? != 0,
        last_run_at: row.get(7)?,
        next_run_at: row.get(8)?,
        run_count: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

const SCHEDULE_COLUMNS: &str = "id, name, target_type, target_id, trigger_type, trigger_config, is_active, last_run_at, next_run_at, run_count, created_at, updated_at";

// Phase 11: Trace Span structs

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraceSpanRow {
    pub id: String,
    pub parent_span_id: Option<String>,
    pub run_id: String,
    pub run_type: String,
    pub span_name: String,
    pub span_kind: String,
    pub input: String,
    pub output: Option<String>,
    pub status: String,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
    pub metadata: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
}

fn row_to_trace_span(row: &rusqlite::Row) -> rusqlite::Result<TraceSpanRow> {
    Ok(TraceSpanRow {
        id: row.get(0)?,
        parent_span_id: row.get(1)?,
        run_id: row.get(2)?,
        run_type: row.get(3)?,
        span_name: row.get(4)?,
        span_kind: row.get(5)?,
        input: row.get(6)?,
        output: row.get(7)?,
        status: row.get(8)?,
        tokens: row.get(9)?,
        cost: row.get(10)?,
        metadata: row.get(11)?,
        started_at: row.get(12)?,
        ended_at: row.get(13)?,
    })
}

const TRACE_SPAN_COLUMNS: &str = "id, parent_span_id, run_id, run_type, span_name, span_kind, input, output, status, tokens, cost, metadata, started_at, ended_at";

// Phase 11: Analytics result structs

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentAnalyticsRow {
    pub agent_id: String,
    pub agent_name: String,
    pub run_count: i32,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub avg_duration_ms: f64,
    pub success_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillUsageRow {
    pub skill_id: String,
    pub skill_name: String,
    pub run_count: i32,
    pub total_tokens: i64,
    pub total_cost: f64,
}

// --- Skill Categories CRUD ---

#[tauri::command]
pub async fn list_skill_categories(app: tauri::AppHandle) -> Result<Vec<SkillCategoryRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM skill_categories ORDER BY sort_order, name", SKILL_CATEGORY_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map([], row_to_skill_category)
        .map_err(|e| format!("Failed to list skill categories: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_skill_category(id: String, app: tauri::AppHandle) -> Result<Option<SkillCategoryRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM skill_categories WHERE id = ?1", SKILL_CATEGORY_COLUMNS),
        params![&id], row_to_skill_category,
    ).optional().map_err(|e| format!("Failed to get skill category: {}", e))
}

#[tauri::command]
pub async fn create_skill_category(name: String, description: String, icon: String, app: tauri::AppHandle) -> Result<SkillCategoryRow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let max_sort: i32 = conn.query_row("SELECT COALESCE(MAX(sort_order), -1) FROM skill_categories", [], |row| row.get(0)).unwrap_or(-1);
    conn.execute(
        "INSERT INTO skill_categories (id, name, description, icon, sort_order, is_builtin, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        params![&id, &name, &description, &icon, max_sort + 1, &now, &now],
    ).map_err(|e| format!("Failed to create skill category: {}", e))?;
    get_skill_category(id, app).await?.ok_or_else(|| "Failed to retrieve created category".to_string())
}

#[tauri::command]
pub async fn update_skill_category(id: String, name: Option<String>, description: Option<String>, icon: Option<String>, app: tauri::AppHandle) -> Result<SkillCategoryRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE skill_categories SET name = COALESCE(?1, name), description = COALESCE(?2, description), icon = COALESCE(?3, icon), updated_at = ?4 WHERE id = ?5",
        params![&name, &description, &icon, &now, &id],
    ).map_err(|e| format!("Failed to update skill category: {}", e))?;
    get_skill_category(id, app).await?.ok_or_else(|| "Category not found".to_string())
}

#[tauri::command]
pub async fn delete_skill_category(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let is_builtin: i32 = conn.query_row("SELECT is_builtin FROM skill_categories WHERE id = ?1", params![&id], |row| row.get(0))
        .map_err(|e| format!("Category not found: {}", e))?;
    if is_builtin != 0 { return Err("Cannot delete built-in categories".to_string()); }
    conn.execute("DELETE FROM skill_categories WHERE id = ?1", params![&id]).map_err(|e| format!("Failed to delete: {}", e))?;
    Ok(())
}

// --- Skills CRUD ---

#[tauri::command]
pub async fn list_skills(category: Option<String>, app: tauri::AppHandle) -> Result<Vec<SkillRow>, String> {
    let conn = get_db_connection(&app)?;
    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match &category {
        Some(cat) => (
            format!("SELECT {} FROM skills WHERE category = ?1 ORDER BY sort_order, name", SKILL_COLUMNS),
            vec![Box::new(cat.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        None => (
            format!("SELECT {} FROM skills ORDER BY sort_order, name", SKILL_COLUMNS),
            vec![],
        ),
    };
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params_ref.as_slice(), row_to_skill).map_err(|e| format!("Failed to list skills: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_skill(id: String, app: tauri::AppHandle) -> Result<Option<SkillRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM skills WHERE id = ?1", SKILL_COLUMNS),
        params![&id], row_to_skill,
    ).optional().map_err(|e| format!("Failed to get skill: {}", e))
}

#[tauri::command]
pub async fn create_skill(
    name: String, description: String, category: String, system_prompt: String,
    tools: String, output_schema: Option<String>, model_tier: String, app: tauri::AppHandle,
) -> Result<SkillRow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let max_sort: i32 = conn.query_row("SELECT COALESCE(MAX(sort_order), -1) FROM skills WHERE category = ?1", params![&category], |row| row.get(0)).unwrap_or(-1);
    conn.execute(
        "INSERT INTO skills (id, name, description, category, system_prompt, tools, output_schema, model_tier, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0, 0, ?9, ?10, ?11)",
        params![&id, &name, &description, &category, &system_prompt, &tools, &output_schema, &model_tier, max_sort + 1, &now, &now],
    ).map_err(|e| format!("Failed to create skill: {}", e))?;
    get_skill(id, app).await?.ok_or_else(|| "Failed to retrieve created skill".to_string())
}

#[tauri::command]
pub async fn update_skill(
    id: String, name: Option<String>, description: Option<String>, category: Option<String>,
    system_prompt: Option<String>, tools: Option<String>, output_schema: Option<Option<String>>,
    model_tier: Option<String>, is_favorite: Option<bool>, app: tauri::AppHandle,
) -> Result<SkillRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE skills SET name = COALESCE(?1, name), description = COALESCE(?2, description), category = COALESCE(?3, category),
         system_prompt = COALESCE(?4, system_prompt), tools = COALESCE(?5, tools), model_tier = COALESCE(?6, model_tier), updated_at = ?7 WHERE id = ?8",
        params![&name, &description, &category, &system_prompt, &tools, &model_tier, &now, &id],
    ).map_err(|e| format!("Failed to update skill: {}", e))?;
    if let Some(os) = output_schema {
        conn.execute("UPDATE skills SET output_schema = ?1 WHERE id = ?2", params![&os, &id])
            .map_err(|e| format!("Failed to update output_schema: {}", e))?;
    }
    if let Some(fav) = is_favorite {
        conn.execute("UPDATE skills SET is_favorite = ?1 WHERE id = ?2", params![fav as i32, &id])
            .map_err(|e| format!("Failed to update favorite: {}", e))?;
    }
    get_skill(id, app).await?.ok_or_else(|| "Skill not found after update".to_string())
}

#[tauri::command]
pub async fn delete_skill(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let is_builtin: i32 = conn.query_row("SELECT is_builtin FROM skills WHERE id = ?1", params![&id], |row| row.get(0))
        .map_err(|e| format!("Skill not found: {}", e))?;
    if is_builtin != 0 { return Err("Cannot delete built-in skills".to_string()); }
    conn.execute("DELETE FROM skills WHERE id = ?1", params![&id]).map_err(|e| format!("Failed to delete skill: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn search_skills(query: String, app: tauri::AppHandle) -> Result<Vec<SkillRow>, String> {
    let conn = get_db_connection(&app)?;
    let search = format!("%{}%", query);
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM skills WHERE name LIKE ?1 OR description LIKE ?1 OR system_prompt LIKE ?1 ORDER BY usage_count DESC, name", SKILL_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&search], row_to_skill).map_err(|e| format!("Failed to search skills: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn duplicate_skill(id: String, new_name: String, app: tauri::AppHandle) -> Result<SkillRow, String> {
    let original = get_skill(id, app.clone()).await?.ok_or_else(|| "Skill not found".to_string())?;
    create_skill(new_name, original.description, original.category, original.system_prompt, original.tools, original.output_schema, original.model_tier, app).await
}

#[tauri::command]
pub async fn increment_skill_usage(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute("UPDATE skills SET usage_count = usage_count + 1, updated_at = ?1 WHERE id = ?2", params![&now, &id])
        .map_err(|e| format!("Failed to increment skill usage: {}", e))?;
    Ok(())
}

// --- Agents CRUD ---

#[tauri::command]
pub async fn list_agents(app: tauri::AppHandle) -> Result<Vec<AgentRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM agents ORDER BY sort_order, name", AGENT_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map([], row_to_agent).map_err(|e| format!("Failed to list agents: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_agent(id: String, app: tauri::AppHandle) -> Result<Option<AgentRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM agents WHERE id = ?1", AGENT_COLUMNS),
        params![&id], row_to_agent,
    ).optional().map_err(|e| format!("Failed to get agent: {}", e))
}

#[tauri::command]
pub async fn create_agent(
    name: String, description: String, icon: String, system_instructions: String,
    skill_ids: String, model: String, provider: String, max_tokens: i32,
    temperature: f64, tools_config: String, context_strategy: String, app: tauri::AppHandle,
) -> Result<AgentRow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let max_sort: i32 = conn.query_row("SELECT COALESCE(MAX(sort_order), -1) FROM agents", [], |row| row.get(0)).unwrap_or(-1);
    conn.execute(
        "INSERT INTO agents (id, name, description, icon, system_instructions, skill_ids, model, provider, max_tokens, temperature, tools_config, context_strategy, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 0, 0, ?13, ?14, ?15)",
        params![&id, &name, &description, &icon, &system_instructions, &skill_ids, &model, &provider, &max_tokens, &temperature, &tools_config, &context_strategy, max_sort + 1, &now, &now],
    ).map_err(|e| format!("Failed to create agent: {}", e))?;
    get_agent(id, app).await?.ok_or_else(|| "Failed to retrieve created agent".to_string())
}

#[tauri::command]
pub async fn update_agent(
    id: String, name: Option<String>, description: Option<String>, icon: Option<String>,
    system_instructions: Option<String>, skill_ids: Option<String>, model: Option<String>,
    provider: Option<String>, max_tokens: Option<i32>, temperature: Option<f64>,
    tools_config: Option<String>, context_strategy: Option<String>, is_favorite: Option<bool>,
    fallback_model: Option<String>, memory_config: Option<String>,
    app: tauri::AppHandle,
) -> Result<AgentRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE agents SET name = COALESCE(?1, name), description = COALESCE(?2, description), icon = COALESCE(?3, icon),
         system_instructions = COALESCE(?4, system_instructions), skill_ids = COALESCE(?5, skill_ids),
         model = COALESCE(?6, model), provider = COALESCE(?7, provider), tools_config = COALESCE(?8, tools_config),
         context_strategy = COALESCE(?9, context_strategy), fallback_model = COALESCE(?10, fallback_model),
         memory_config = COALESCE(?11, memory_config), updated_at = ?12 WHERE id = ?13",
        params![&name, &description, &icon, &system_instructions, &skill_ids, &model, &provider, &tools_config, &context_strategy, &fallback_model, &memory_config, &now, &id],
    ).map_err(|e| format!("Failed to update agent: {}", e))?;
    if let Some(mt) = max_tokens {
        conn.execute("UPDATE agents SET max_tokens = ?1 WHERE id = ?2", params![&mt, &id]).map_err(|e| format!("Failed: {}", e))?;
    }
    if let Some(t) = temperature {
        conn.execute("UPDATE agents SET temperature = ?1 WHERE id = ?2", params![&t, &id]).map_err(|e| format!("Failed: {}", e))?;
    }
    if let Some(fav) = is_favorite {
        conn.execute("UPDATE agents SET is_favorite = ?1 WHERE id = ?2", params![fav as i32, &id]).map_err(|e| format!("Failed: {}", e))?;
    }
    get_agent(id, app).await?.ok_or_else(|| "Agent not found after update".to_string())
}

#[tauri::command]
pub async fn delete_agent(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let is_builtin: i32 = conn.query_row("SELECT is_builtin FROM agents WHERE id = ?1", params![&id], |row| row.get(0))
        .map_err(|e| format!("Agent not found: {}", e))?;
    if is_builtin != 0 { return Err("Cannot delete built-in agents".to_string()); }
    conn.execute("DELETE FROM agents WHERE id = ?1", params![&id]).map_err(|e| format!("Failed to delete agent: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn search_agents(query: String, app: tauri::AppHandle) -> Result<Vec<AgentRow>, String> {
    let conn = get_db_connection(&app)?;
    let search = format!("%{}%", query);
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM agents WHERE name LIKE ?1 OR description LIKE ?1 ORDER BY usage_count DESC, name", AGENT_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&search], row_to_agent).map_err(|e| format!("Failed to search agents: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn duplicate_agent(id: String, new_name: String, app: tauri::AppHandle) -> Result<AgentRow, String> {
    let original = get_agent(id, app.clone()).await?.ok_or_else(|| "Agent not found".to_string())?;
    create_agent(new_name, original.description, original.icon, original.system_instructions, original.skill_ids, original.model, original.provider, original.max_tokens, original.temperature, original.tools_config, original.context_strategy, app).await
}

#[tauri::command]
pub async fn increment_agent_usage(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute("UPDATE agents SET usage_count = usage_count + 1, updated_at = ?1 WHERE id = ?2", params![&now, &id])
        .map_err(|e| format!("Failed to increment agent usage: {}", e))?;
    Ok(())
}

// --- Agent Runs CRUD ---

#[tauri::command]
pub async fn create_agent_run(
    agent_id: String, project_id: String, skill_id: Option<String>,
    input_prompt: String, model: String, provider: String, app: tauri::AppHandle,
) -> Result<AgentRunRow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO agent_runs (id, agent_id, project_id, skill_id, status, input_prompt, model, provider, input_tokens, output_tokens, total_tokens, cost, started_at, created_at)
         VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6, ?7, 0, 0, 0, 0.0, ?8, ?9)",
        params![&id, &agent_id, &project_id, &skill_id, &input_prompt, &model, &provider, &now, &now],
    ).map_err(|e| format!("Failed to create agent run: {}", e))?;
    get_agent_run(id, app).await?.ok_or_else(|| "Failed to retrieve created run".to_string())
}

#[tauri::command]
pub async fn get_agent_run(id: String, app: tauri::AppHandle) -> Result<Option<AgentRunRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM agent_runs WHERE id = ?1", AGENT_RUN_COLUMNS),
        params![&id], row_to_agent_run,
    ).optional().map_err(|e| format!("Failed to get agent run: {}", e))
}

#[tauri::command]
pub async fn list_agent_runs(agent_id: Option<String>, project_id: Option<String>, app: tauri::AppHandle) -> Result<Vec<AgentRunRow>, String> {
    let conn = get_db_connection(&app)?;
    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (&agent_id, &project_id) {
        (Some(aid), Some(pid)) => (
            format!("SELECT {} FROM agent_runs WHERE agent_id = ?1 AND project_id = ?2 ORDER BY created_at DESC", AGENT_RUN_COLUMNS),
            vec![Box::new(aid.clone()) as Box<dyn rusqlite::types::ToSql>, Box::new(pid.clone())],
        ),
        (Some(aid), None) => (
            format!("SELECT {} FROM agent_runs WHERE agent_id = ?1 ORDER BY created_at DESC", AGENT_RUN_COLUMNS),
            vec![Box::new(aid.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, Some(pid)) => (
            format!("SELECT {} FROM agent_runs WHERE project_id = ?1 ORDER BY created_at DESC", AGENT_RUN_COLUMNS),
            vec![Box::new(pid.clone()) as Box<dyn rusqlite::types::ToSql>],
        ),
        (None, None) => (
            format!("SELECT {} FROM agent_runs ORDER BY created_at DESC LIMIT 100", AGENT_RUN_COLUMNS),
            vec![],
        ),
    };
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params_ref.as_slice(), row_to_agent_run).map_err(|e| format!("Failed to list agent runs: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn update_agent_run_status(
    id: String, status: String, output_content: Option<String>,
    input_tokens: Option<i32>, output_tokens: Option<i32>, total_tokens: Option<i32>,
    cost: Option<f64>, duration_ms: Option<i64>, error: Option<String>, app: tauri::AppHandle,
) -> Result<AgentRunRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    let completed = if status == "completed" || status == "failed" || status == "cancelled" { Some(now) } else { None };
    conn.execute(
        "UPDATE agent_runs SET status = ?1, output_content = COALESCE(?2, output_content),
         input_tokens = COALESCE(?3, input_tokens), output_tokens = COALESCE(?4, output_tokens),
         total_tokens = COALESCE(?5, total_tokens), cost = COALESCE(?6, cost),
         duration_ms = COALESCE(?7, duration_ms), error = COALESCE(?8, error), completed_at = COALESCE(?9, completed_at)
         WHERE id = ?10",
        params![&status, &output_content, &input_tokens, &output_tokens, &total_tokens, &cost, &duration_ms, &error, &completed, &id],
    ).map_err(|e| format!("Failed to update agent run: {}", e))?;
    get_agent_run(id, app).await?.ok_or_else(|| "Run not found".to_string())
}

#[tauri::command]
pub async fn delete_agent_run(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM agent_runs WHERE id = ?1", params![&id]).map_err(|e| format!("Failed to delete run: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_agent_usage_stats(agent_id: String, app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let conn = get_db_connection(&app)?;
    let stats = conn.query_row(
        "SELECT COUNT(*) as run_count, COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost), 0.0) as total_cost, COALESCE(AVG(duration_ms), 0) as avg_duration
         FROM agent_runs WHERE agent_id = ?1 AND status = 'completed'",
        params![&agent_id],
        |row| Ok(serde_json::json!({
            "run_count": row.get::<_, i32>(0)?,
            "total_tokens": row.get::<_, i64>(1)?,
            "total_cost": row.get::<_, f64>(2)?,
            "avg_duration_ms": row.get::<_, f64>(3)?,
        })),
    ).map_err(|e| format!("Failed to get usage stats: {}", e))?;
    Ok(stats)
}

// --- Phase 10: Agent Teams CRUD ---

#[tauri::command]
pub async fn list_agent_teams(app: tauri::AppHandle) -> Result<Vec<AgentTeamRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM agent_teams ORDER BY is_favorite DESC, usage_count DESC, name", AGENT_TEAM_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map([], row_to_agent_team)
        .map_err(|e| format!("Failed to list teams: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_agent_team(id: String, app: tauri::AppHandle) -> Result<Option<AgentTeamRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM agent_teams WHERE id = ?1", AGENT_TEAM_COLUMNS),
        params![&id], row_to_agent_team,
    ).optional().map_err(|e| format!("Failed to get team: {}", e))
}

#[tauri::command]
pub async fn create_agent_team(
    name: String, description: String, icon: String,
    execution_mode: String, conductor_agent_id: Option<String>, max_concurrent: i32,
    app: tauri::AppHandle,
) -> Result<AgentTeamRow, String> {
    let conn = get_db_connection(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO agent_teams (id, name, description, icon, execution_mode, conductor_agent_id, max_concurrent, is_favorite, usage_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?9)",
        params![&id, &name, &description, &icon, &execution_mode, &conductor_agent_id, &max_concurrent, &now, &now],
    ).map_err(|e| format!("Failed to create team: {}", e))?;
    get_agent_team(id, app).await?.ok_or_else(|| "Team not found after create".to_string())
}

#[tauri::command]
pub async fn update_agent_team(
    id: String, name: Option<String>, description: Option<String>, icon: Option<String>,
    execution_mode: Option<String>, conductor_agent_id: Option<String>, max_concurrent: Option<i32>,
    is_favorite: Option<bool>,
    app: tauri::AppHandle,
) -> Result<AgentTeamRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE agent_teams SET name = COALESCE(?1, name), description = COALESCE(?2, description),
         icon = COALESCE(?3, icon), execution_mode = COALESCE(?4, execution_mode),
         conductor_agent_id = COALESCE(?5, conductor_agent_id), updated_at = ?6 WHERE id = ?7",
        params![&name, &description, &icon, &execution_mode, &conductor_agent_id, &now, &id],
    ).map_err(|e| format!("Failed to update team: {}", e))?;
    if let Some(mc) = max_concurrent {
        conn.execute("UPDATE agent_teams SET max_concurrent = ?1 WHERE id = ?2", params![&mc, &id])
            .map_err(|e| format!("Failed: {}", e))?;
    }
    if let Some(fav) = is_favorite {
        conn.execute("UPDATE agent_teams SET is_favorite = ?1 WHERE id = ?2", params![fav as i32, &id])
            .map_err(|e| format!("Failed: {}", e))?;
    }
    get_agent_team(id, app).await?.ok_or_else(|| "Team not found after update".to_string())
}

#[tauri::command]
pub async fn delete_agent_team(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM team_run_steps WHERE team_run_id IN (SELECT id FROM team_runs WHERE team_id = ?1)", params![&id])
        .map_err(|e| format!("Failed to delete team run steps: {}", e))?;
    conn.execute("DELETE FROM team_runs WHERE team_id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete team runs: {}", e))?;
    conn.execute("DELETE FROM agent_team_edges WHERE team_id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete team edges: {}", e))?;
    conn.execute("DELETE FROM agent_team_nodes WHERE team_id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete team nodes: {}", e))?;
    conn.execute("DELETE FROM agent_teams WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete team: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn duplicate_agent_team(id: String, new_name: String, app: tauri::AppHandle) -> Result<AgentTeamRow, String> {
    let new_id = {
        let conn = get_db_connection(&app)?;
        let team = conn.query_row(
            &format!("SELECT {} FROM agent_teams WHERE id = ?1", AGENT_TEAM_COLUMNS),
            params![&id], row_to_agent_team,
        ).map_err(|e| format!("Team not found: {}", e))?;
        let new_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        conn.execute(
            "INSERT INTO agent_teams (id, name, description, icon, execution_mode, conductor_agent_id, max_concurrent, is_favorite, usage_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?9)",
            params![&new_id, &new_name, &team.description, &team.icon, &team.execution_mode, &team.conductor_agent_id, &team.max_concurrent, &now, &now],
        ).map_err(|e| format!("Failed to duplicate team: {}", e))?;
        let nodes: Vec<AgentTeamNodeRow> = {
            let mut stmt = conn.prepare(
                &format!("SELECT {} FROM agent_team_nodes WHERE team_id = ?1", TEAM_NODE_COLUMNS)
            ).map_err(|e| format!("Failed to prepare: {}", e))?;
            let collected: Vec<AgentTeamNodeRow> = stmt.query_map(params![&id], row_to_team_node)
                .map_err(|e| format!("Failed to list nodes: {}", e))?
                .filter_map(|r| r.ok()).collect();
            collected
        };
        let mut node_id_map = std::collections::HashMap::new();
        for node in &nodes {
            let new_node_id = uuid::Uuid::new_v4().to_string();
            node_id_map.insert(node.id.clone(), new_node_id.clone());
            conn.execute(
                "INSERT INTO agent_team_nodes (id, team_id, agent_id, node_type, position_x, position_y, role, config, sort_order, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![&new_node_id, &new_id, &node.agent_id, &node.node_type, &node.position_x, &node.position_y, &node.role, &node.config, &node.sort_order, &now],
            ).map_err(|e| format!("Failed to duplicate node: {}", e))?;
        }
        let edges: Vec<AgentTeamEdgeRow> = {
            let mut stmt = conn.prepare(
                &format!("SELECT {} FROM agent_team_edges WHERE team_id = ?1", TEAM_EDGE_COLUMNS)
            ).map_err(|e| format!("Failed to prepare: {}", e))?;
            let collected: Vec<AgentTeamEdgeRow> = stmt.query_map(params![&id], row_to_team_edge)
                .map_err(|e| format!("Failed to list edges: {}", e))?
                .filter_map(|r| r.ok()).collect();
            collected
        };
        for edge in &edges {
            if let (Some(new_src), Some(new_tgt)) = (node_id_map.get(&edge.source_node_id), node_id_map.get(&edge.target_node_id)) {
                let new_edge_id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO agent_team_edges (id, team_id, source_node_id, target_node_id, edge_type, condition, data_mapping, label, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![&new_edge_id, &new_id, new_src, new_tgt, &edge.edge_type, &edge.condition, &edge.data_mapping, &edge.label, &now],
                ).map_err(|e| format!("Failed to duplicate edge: {}", e))?;
            }
        }
        new_id
    };
    get_agent_team(new_id, app).await?.ok_or_else(|| "Team not found after duplicate".to_string())
}

#[tauri::command]
pub async fn search_agent_teams(query: String, app: tauri::AppHandle) -> Result<Vec<AgentTeamRow>, String> {
    let conn = get_db_connection(&app)?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM agent_teams WHERE name LIKE ?1 OR description LIKE ?1 ORDER BY usage_count DESC, name", AGENT_TEAM_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&pattern], row_to_agent_team)
        .map_err(|e| format!("Failed to search teams: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn increment_team_usage(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("UPDATE agent_teams SET usage_count = usage_count + 1, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().timestamp(), &id],
    ).map_err(|e| format!("Failed to increment team usage: {}", e))?;
    Ok(())
}

// --- Team Nodes CRUD ---

#[tauri::command]
pub async fn list_team_nodes(team_id: String, app: tauri::AppHandle) -> Result<Vec<AgentTeamNodeRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM agent_team_nodes WHERE team_id = ?1 ORDER BY sort_order", TEAM_NODE_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&team_id], row_to_team_node)
        .map_err(|e| format!("Failed to list nodes: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn create_team_node(
    team_id: String, agent_id: String, node_type: String,
    position_x: f64, position_y: f64, role: String, config: String, sort_order: i32,
    app: tauri::AppHandle,
) -> Result<AgentTeamNodeRow, String> {
    let conn = get_db_connection(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO agent_team_nodes (id, team_id, agent_id, node_type, position_x, position_y, role, config, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![&id, &team_id, &agent_id, &node_type, &position_x, &position_y, &role, &config, &sort_order, &now],
    ).map_err(|e| format!("Failed to create node: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM agent_team_nodes WHERE id = ?1", TEAM_NODE_COLUMNS),
        params![&id], row_to_team_node,
    ).map_err(|e| format!("Node not found after create: {}", e))
}

#[tauri::command]
pub async fn update_team_node(
    id: String, position_x: Option<f64>, position_y: Option<f64>,
    role: Option<String>, config: Option<String>, sort_order: Option<i32>,
    app: tauri::AppHandle,
) -> Result<AgentTeamNodeRow, String> {
    let conn = get_db_connection(&app)?;
    conn.execute(
        "UPDATE agent_team_nodes SET role = COALESCE(?1, role), config = COALESCE(?2, config) WHERE id = ?3",
        params![&role, &config, &id],
    ).map_err(|e| format!("Failed to update node: {}", e))?;
    if let Some(px) = position_x {
        conn.execute("UPDATE agent_team_nodes SET position_x = ?1 WHERE id = ?2", params![px, &id])
            .map_err(|e| format!("Failed: {}", e))?;
    }
    if let Some(py) = position_y {
        conn.execute("UPDATE agent_team_nodes SET position_y = ?1 WHERE id = ?2", params![py, &id])
            .map_err(|e| format!("Failed: {}", e))?;
    }
    if let Some(so) = sort_order {
        conn.execute("UPDATE agent_team_nodes SET sort_order = ?1 WHERE id = ?2", params![so, &id])
            .map_err(|e| format!("Failed: {}", e))?;
    }
    conn.query_row(
        &format!("SELECT {} FROM agent_team_nodes WHERE id = ?1", TEAM_NODE_COLUMNS),
        params![&id], row_to_team_node,
    ).map_err(|e| format!("Node not found after update: {}", e))
}

#[tauri::command]
pub async fn delete_team_node(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM agent_team_edges WHERE source_node_id = ?1 OR target_node_id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete node edges: {}", e))?;
    conn.execute("DELETE FROM agent_team_nodes WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete node: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn batch_update_team_nodes(
    updates: Vec<serde_json::Value>, app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    for u in &updates {
        let id = u["id"].as_str().ok_or("Missing id in batch update")?;
        let px = u["position_x"].as_f64();
        let py = u["position_y"].as_f64();
        if let (Some(x), Some(y)) = (px, py) {
            conn.execute(
                "UPDATE agent_team_nodes SET position_x = ?1, position_y = ?2 WHERE id = ?3",
                params![x, y, id],
            ).map_err(|e| format!("Failed to batch update node: {}", e))?;
        }
    }
    Ok(())
}

// --- Team Edges CRUD ---

#[tauri::command]
pub async fn list_team_edges(team_id: String, app: tauri::AppHandle) -> Result<Vec<AgentTeamEdgeRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM agent_team_edges WHERE team_id = ?1", TEAM_EDGE_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&team_id], row_to_team_edge)
        .map_err(|e| format!("Failed to list edges: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn create_team_edge(
    team_id: String, source_node_id: String, target_node_id: String,
    edge_type: String, condition: Option<String>, data_mapping: String, label: Option<String>,
    app: tauri::AppHandle,
) -> Result<AgentTeamEdgeRow, String> {
    let conn = get_db_connection(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO agent_team_edges (id, team_id, source_node_id, target_node_id, edge_type, condition, data_mapping, label, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![&id, &team_id, &source_node_id, &target_node_id, &edge_type, &condition, &data_mapping, &label, &now],
    ).map_err(|e| format!("Failed to create edge: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM agent_team_edges WHERE id = ?1", TEAM_EDGE_COLUMNS),
        params![&id], row_to_team_edge,
    ).map_err(|e| format!("Edge not found after create: {}", e))
}

#[tauri::command]
pub async fn update_team_edge(
    id: String, edge_type: Option<String>, condition: Option<String>,
    data_mapping: Option<String>, label: Option<String>,
    app: tauri::AppHandle,
) -> Result<AgentTeamEdgeRow, String> {
    let conn = get_db_connection(&app)?;
    conn.execute(
        "UPDATE agent_team_edges SET edge_type = COALESCE(?1, edge_type), condition = COALESCE(?2, condition),
         data_mapping = COALESCE(?3, data_mapping), label = COALESCE(?4, label) WHERE id = ?5",
        params![&edge_type, &condition, &data_mapping, &label, &id],
    ).map_err(|e| format!("Failed to update edge: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM agent_team_edges WHERE id = ?1", TEAM_EDGE_COLUMNS),
        params![&id], row_to_team_edge,
    ).map_err(|e| format!("Edge not found after update: {}", e))
}

#[tauri::command]
pub async fn delete_team_edge(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM agent_team_edges WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete edge: {}", e))?;
    Ok(())
}

// --- Team Runs CRUD ---

#[tauri::command]
pub async fn create_team_run(
    team_id: String, project_id: String, input: String, execution_mode: String,
    app: tauri::AppHandle,
) -> Result<TeamRunRow, String> {
    let conn = get_db_connection(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO team_runs (id, team_id, project_id, status, input, execution_mode, total_tokens, total_cost, created_at, started_at)
         VALUES (?1, ?2, ?3, 'running', ?4, ?5, 0, 0.0, ?6, ?7)",
        params![&id, &team_id, &project_id, &input, &execution_mode, &now, &now],
    ).map_err(|e| format!("Failed to create team run: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM team_runs WHERE id = ?1", TEAM_RUN_COLUMNS),
        params![&id], row_to_team_run,
    ).map_err(|e| format!("Team run not found after create: {}", e))
}

#[tauri::command]
pub async fn get_team_run(id: String, app: tauri::AppHandle) -> Result<Option<TeamRunRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM team_runs WHERE id = ?1", TEAM_RUN_COLUMNS),
        params![&id], row_to_team_run,
    ).optional().map_err(|e| format!("Failed to get team run: {}", e))
}

#[tauri::command]
pub async fn list_team_runs(team_id: String, project_id: String, app: tauri::AppHandle) -> Result<Vec<TeamRunRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM team_runs WHERE team_id = ?1 AND project_id = ?2 ORDER BY created_at DESC LIMIT 50", TEAM_RUN_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&team_id, &project_id], row_to_team_run)
        .map_err(|e| format!("Failed to list team runs: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn update_team_run_status(
    id: String, status: String, output: Option<String>,
    total_tokens: Option<i32>, total_cost: Option<f64>,
    duration_ms: Option<i64>, error: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    let completed_at = if status == "completed" || status == "failed" { Some(now) } else { None };
    conn.execute(
        "UPDATE team_runs SET status = ?1, output = COALESCE(?2, output), total_tokens = COALESCE(?3, total_tokens),
         total_cost = COALESCE(?4, total_cost), duration_ms = COALESCE(?5, duration_ms),
         error = ?6, completed_at = COALESCE(?7, completed_at) WHERE id = ?8",
        params![&status, &output, &total_tokens, &total_cost, &duration_ms, &error, &completed_at, &id],
    ).map_err(|e| format!("Failed to update team run status: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_team_run(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM team_run_steps WHERE team_run_id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete team run steps: {}", e))?;
    conn.execute("DELETE FROM team_runs WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete team run: {}", e))?;
    Ok(())
}

// --- Phase 11: Schedule CRUD ---

#[tauri::command]
pub async fn list_schedules(app: tauri::AppHandle) -> Result<Vec<ScheduleRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM schedules ORDER BY created_at DESC", SCHEDULE_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map([], row_to_schedule)
        .map_err(|e| format!("Failed to list schedules: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_schedule(id: String, app: tauri::AppHandle) -> Result<Option<ScheduleRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM schedules WHERE id = ?1", SCHEDULE_COLUMNS),
        params![&id], row_to_schedule,
    ).optional().map_err(|e| format!("Failed to get schedule: {}", e))
}

#[tauri::command]
pub async fn create_schedule(
    name: String, target_type: String, target_id: String,
    trigger_type: String, trigger_config: String,
    is_active: Option<bool>,
    app: tauri::AppHandle,
) -> Result<ScheduleRow, String> {
    let conn = get_db_connection(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let active_int: i32 = if is_active.unwrap_or(false) { 1 } else { 0 };
    conn.execute(
        "INSERT INTO schedules (id, name, target_type, target_id, trigger_type, trigger_config, is_active, run_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)",
        params![&id, &name, &target_type, &target_id, &trigger_type, &trigger_config, &active_int, &now, &now],
    ).map_err(|e| format!("Failed to create schedule: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM schedules WHERE id = ?1", SCHEDULE_COLUMNS),
        params![&id], row_to_schedule,
    ).map_err(|e| format!("Schedule not found after create: {}", e))
}

#[tauri::command]
pub async fn update_schedule(
    id: String,
    name: Option<String>, target_type: Option<String>, target_id: Option<String>,
    trigger_type: Option<String>, trigger_config: Option<String>,
    is_active: Option<bool>, next_run_at: Option<i64>,
    app: tauri::AppHandle,
) -> Result<ScheduleRow, String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    let is_active_int: Option<i32> = is_active.map(|b| if b { 1 } else { 0 });
    conn.execute(
        "UPDATE schedules SET name = COALESCE(?1, name), target_type = COALESCE(?2, target_type),
         target_id = COALESCE(?3, target_id), trigger_type = COALESCE(?4, trigger_type),
         trigger_config = COALESCE(?5, trigger_config), is_active = COALESCE(?6, is_active),
         next_run_at = COALESCE(?7, next_run_at), updated_at = ?8 WHERE id = ?9",
        params![&name, &target_type, &target_id, &trigger_type, &trigger_config, &is_active_int, &next_run_at, &now, &id],
    ).map_err(|e| format!("Failed to update schedule: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM schedules WHERE id = ?1", SCHEDULE_COLUMNS),
        params![&id], row_to_schedule,
    ).map_err(|e| format!("Schedule not found after update: {}", e))
}

#[tauri::command]
pub async fn delete_schedule(id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM schedules WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete schedule: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_active_schedules(app: tauri::AppHandle) -> Result<Vec<ScheduleRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM schedules WHERE is_active = 1 ORDER BY created_at ASC", SCHEDULE_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map([], row_to_schedule)
        .map_err(|e| format!("Failed to list active schedules: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn update_schedule_run_status(
    id: String, last_run_at: i64, next_run_at: Option<i64>, run_count: i32,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE schedules SET last_run_at = ?1, next_run_at = ?2, run_count = ?3, updated_at = ?4 WHERE id = ?5",
        params![&last_run_at, &next_run_at, &run_count, &now, &id],
    ).map_err(|e| format!("Failed to update schedule run status: {}", e))?;
    Ok(())
}

// --- Phase 11: Trace Span CRUD ---

#[tauri::command]
pub async fn create_trace_span(
    id: String, parent_span_id: Option<String>, run_id: String, run_type: String,
    span_name: String, span_kind: String, input: String, metadata: String, started_at: i64,
    app: tauri::AppHandle,
) -> Result<TraceSpanRow, String> {
    let conn = get_db_connection(&app)?;
    conn.execute(
        "INSERT INTO trace_spans (id, parent_span_id, run_id, run_type, span_name, span_kind, input, status, metadata, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'running', ?8, ?9)",
        params![&id, &parent_span_id, &run_id, &run_type, &span_name, &span_kind, &input, &metadata, &started_at],
    ).map_err(|e| format!("Failed to create trace span: {}", e))?;
    conn.query_row(
        &format!("SELECT {} FROM trace_spans WHERE id = ?1", TRACE_SPAN_COLUMNS),
        params![&id], row_to_trace_span,
    ).map_err(|e| format!("Trace span not found after create: {}", e))
}

#[tauri::command]
pub async fn update_trace_span(
    id: String, output: Option<String>, status: Option<String>,
    tokens: Option<i32>, cost: Option<f64>, ended_at: Option<i64>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute(
        "UPDATE trace_spans SET output = COALESCE(?1, output), status = COALESCE(?2, status),
         tokens = COALESCE(?3, tokens), cost = COALESCE(?4, cost), ended_at = COALESCE(?5, ended_at)
         WHERE id = ?6",
        params![&output, &status, &tokens, &cost, &ended_at, &id],
    ).map_err(|e| format!("Failed to update trace span: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_trace_spans_for_run(run_id: String, app: tauri::AppHandle) -> Result<Vec<TraceSpanRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        &format!("SELECT {} FROM trace_spans WHERE run_id = ?1 ORDER BY started_at ASC", TRACE_SPAN_COLUMNS)
    ).map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt.query_map(params![&run_id], row_to_trace_span)
        .map_err(|e| format!("Failed to list trace spans: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_trace_span(id: String, app: tauri::AppHandle) -> Result<Option<TraceSpanRow>, String> {
    let conn = get_db_connection(&app)?;
    conn.query_row(
        &format!("SELECT {} FROM trace_spans WHERE id = ?1", TRACE_SPAN_COLUMNS),
        params![&id], row_to_trace_span,
    ).optional().map_err(|e| format!("Failed to get trace span: {}", e))
}

#[tauri::command]
pub async fn delete_trace_spans_for_run(run_id: String, app: tauri::AppHandle) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    conn.execute("DELETE FROM trace_spans WHERE run_id = ?1", params![&run_id])
        .map_err(|e| format!("Failed to delete trace spans: {}", e))?;
    Ok(())
}

// --- Phase 11: Analytics Commands ---

#[tauri::command]
pub async fn get_agent_analytics(start_date: String, end_date: String, app: tauri::AppHandle) -> Result<Vec<AgentAnalyticsRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name,
            COUNT(ar.id) as run_count,
            COALESCE(SUM(ar.total_tokens), 0) as total_tokens,
            COALESCE(SUM(ar.cost), 0.0) as total_cost,
            COALESCE(AVG(ar.duration_ms), 0.0) as avg_duration_ms,
            CASE WHEN COUNT(ar.id) > 0
                THEN CAST(SUM(CASE WHEN ar.status = 'completed' THEN 1 ELSE 0 END) AS REAL) / COUNT(ar.id)
                ELSE 0.0 END as success_rate
         FROM agents a
         LEFT JOIN agent_runs ar ON ar.agent_id = a.id
            AND ar.created_at >= strftime('%s', ?1)
            AND ar.created_at <= strftime('%s', ?2)
         GROUP BY a.id, a.name
         HAVING run_count > 0
         ORDER BY run_count DESC"
    ).map_err(|e| format!("Failed to prepare agent analytics: {}", e))?;
    let rows = stmt.query_map(params![&start_date, &end_date], |row| {
        Ok(AgentAnalyticsRow {
            agent_id: row.get(0)?,
            agent_name: row.get(1)?,
            run_count: row.get(2)?,
            total_tokens: row.get(3)?,
            total_cost: row.get(4)?,
            avg_duration_ms: row.get(5)?,
            success_rate: row.get(6)?,
        })
    }).map_err(|e| format!("Failed to query agent analytics: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

#[tauri::command]
pub async fn get_skill_usage_analytics(start_date: String, end_date: String, app: tauri::AppHandle) -> Result<Vec<SkillUsageRow>, String> {
    let conn = get_db_connection(&app)?;
    let mut stmt = conn.prepare(
        "SELECT ar.skill_id, COALESCE(s.name, ar.skill_id) as skill_name,
            COUNT(ar.id) as run_count,
            COALESCE(SUM(ar.total_tokens), 0) as total_tokens,
            COALESCE(SUM(ar.cost), 0.0) as total_cost
         FROM agent_runs ar
         LEFT JOIN skills s ON s.id = ar.skill_id
         WHERE ar.skill_id IS NOT NULL AND ar.skill_id != ''
            AND ar.created_at >= strftime('%s', ?1)
            AND ar.created_at <= strftime('%s', ?2)
         GROUP BY ar.skill_id
         ORDER BY run_count DESC"
    ).map_err(|e| format!("Failed to prepare skill usage analytics: {}", e))?;
    let rows = stmt.query_map(params![&start_date, &end_date], |row| {
        Ok(SkillUsageRow {
            skill_id: row.get(0)?,
            skill_name: row.get(1)?,
            run_count: row.get(2)?,
            total_tokens: row.get(3)?,
            total_cost: row.get(4)?,
        })
    }).map_err(|e| format!("Failed to query skill usage analytics: {}", e))?;
    let mut results = Vec::new();
    for row in rows { results.push(row.map_err(|e| format!("Row error: {}", e))?); }
    Ok(results)
}

// --- Seed Skills & Agents ---

fn seed_skills(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM skills WHERE is_builtin = 1", [], |row| row.get(0)).unwrap_or(0);
    if count >= 30 { return Ok(()); }

    let now = Utc::now().timestamp();

    let categories = vec![
        ("strategy", "Strategy", "Strategic thinking and planning skills", "chess"),
        ("research", "Research", "User research and discovery skills", "search"),
        ("execution", "Execution", "Shipping and delivery skills", "rocket"),
        ("leadership", "Leadership", "People and stakeholder skills", "users"),
        ("growth", "Growth", "Growth and monetization skills", "trending-up"),
        ("gtm", "Go-to-Market", "Launch and marketing skills", "megaphone"),
        ("ai", "AI & Technology", "AI product and technology skills", "cpu"),
        ("career", "Career", "Career development skills", "graduation-cap"),
    ];

    for (i, (id, name, desc, icon)) in categories.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO skill_categories (id, name, description, icon, sort_order, is_builtin, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
            params![id, name, desc, icon, i as i32, &now, &now],
        ).map_err(|e| format!("Failed to seed skill category: {}", e))?;
    }

    let skills: Vec<(&str, &str, &str, &str, &str, &str)> = vec![
        ("writing-prds", "Writing PRDs", "strategy", "sonnet",
         "Create comprehensive Product Requirement Documents",
         "You are an expert product manager specializing in writing PRDs. Structure your PRDs with: Problem Statement, Goals & Success Metrics, User Stories, Requirements (functional & non-functional), Scope (in/out), Dependencies, Timeline, and Open Questions. Use clear, measurable acceptance criteria. Focus on the 'why' before the 'what'. Include edge cases and error states. Write for both engineering and stakeholder audiences."),
        ("prioritizing-roadmap", "Prioritizing Roadmap", "strategy", "sonnet",
         "Prioritize features and roadmap items using proven frameworks",
         "You are an expert at product prioritization. Apply frameworks like RICE (Reach, Impact, Confidence, Effort), ICE, MoSCoW, or weighted scoring. Consider: business impact, user value, technical effort, strategic alignment, dependencies, and opportunity cost. Present a ranked list with clear rationale. Identify quick wins vs. strategic bets. Help resolve disagreements with data-driven arguments."),
        ("defining-product-vision", "Defining Product Vision", "strategy", "opus",
         "Create compelling product vision and strategy",
         "You are a visionary product strategist. Help define: the product vision (3-5 year aspirational statement), mission (how you'll get there), strategic pillars, target audience, key differentiators, and success metrics. Use frameworks like Playing to Win or Crossing the Chasm when relevant. Ensure the vision is inspiring yet actionable, balancing ambition with market reality."),
        ("setting-okrs", "Setting OKRs & Goals", "strategy", "sonnet",
         "Define clear Objectives and Key Results",
         "You are an OKR expert. Help define SMART objectives that are ambitious yet achievable. Each objective should have 2-5 measurable key results. Ensure alignment with company strategy. Distinguish between committed OKRs (must-hit) and aspirational OKRs (stretch goals). Include leading indicators, not just lagging metrics. Avoid vanity metrics."),
        ("evaluating-trade-offs", "Evaluating Trade-offs", "strategy", "opus",
         "Analyze complex product decisions and trade-offs",
         "You are a strategic decision analyst. Present trade-offs clearly using: options comparison matrix, risk assessment, reversibility analysis, and second-order effects. Apply frameworks like DACI for decision-making. Consider technical debt, user experience, business metrics, and competitive dynamics. Always recommend a path forward with clear reasoning."),
        ("scoping-cutting", "Scoping & Cutting", "strategy", "sonnet",
         "Define MVPs and scope projects effectively",
         "You are a scope management expert. Help define minimum viable products by distinguishing must-haves from nice-to-haves. Apply the 80/20 rule ruthlessly. Identify the smallest increment that delivers meaningful value. Create clear cut criteria. Use timeboxing and fixed-scope approaches. Balance shipping speed with quality thresholds."),
        ("writing-specs", "Writing Specs & Designs", "strategy", "sonnet",
         "Write detailed technical and product specifications",
         "You are a spec writing expert. Create detailed specifications that include: context and background, proposed solution, technical design, API contracts, data models, UI wireframes (text-based), migration plan, rollback strategy, and testing approach. Write specs that engineering teams can implement without ambiguity."),
        ("user-interviews", "Conducting User Interviews", "research", "sonnet",
         "Design and analyze user interview protocols",
         "You are a user research expert specializing in qualitative interviews. Help design interview guides with open-ended questions that avoid leading bias. Structure interviews: warm-up, context gathering, deep dive, and wrap-up. Teach the 5 Whys technique. Help synthesize findings into actionable insights. Create empathy maps and journey maps from interview data."),
        ("analyzing-feedback", "Analyzing User Feedback", "research", "haiku",
         "Synthesize and prioritize user feedback",
         "You analyze user feedback efficiently. Categorize feedback by theme, frequency, and severity. Identify patterns across channels (NPS, support tickets, reviews, surveys). Separate signal from noise. Prioritize feedback by user segment and business impact. Create actionable summaries with recommended next steps."),
        ("competitive-analysis", "Competitive Analysis", "research", "sonnet",
         "Analyze competitive landscape and positioning",
         "You are a competitive intelligence analyst. Create detailed competitive analyses covering: market landscape, feature comparison matrices, pricing analysis, SWOT per competitor, strategic positioning, differentiation opportunities, and threat assessment. Track competitor moves and market trends. Recommend competitive responses."),
        ("problem-definition", "Problem Definition", "research", "sonnet",
         "Define problems clearly before jumping to solutions",
         "You are a problem framing expert. Help define problems using: problem statement templates, Jobs-to-be-Done framework, current vs. desired state analysis, root cause analysis (5 Whys, Fishbone), impact quantification, and stakeholder impact mapping. Ensure problems are specific, measurable, and validated before proceeding to solutions."),
        ("designing-surveys", "Designing Surveys", "research", "haiku",
         "Create effective surveys and questionnaires",
         "You design surveys that generate actionable data. Apply survey methodology best practices: clear question phrasing, appropriate scales (Likert, NPS, semantic differential), logical flow, minimal bias, proper branching logic. Keep surveys concise. Include screening questions. Plan for statistical analysis."),
        ("usability-testing", "Usability Testing", "research", "sonnet",
         "Plan and analyze usability test sessions",
         "You are a usability testing expert. Help plan test sessions: task scenarios, success criteria, think-aloud protocol, moderation scripts, and recording setup. Analyze results: task completion rates, error rates, time-on-task, SUS scores, and qualitative observations. Prioritize findings by severity and frequency."),
        ("shipping-products", "Shipping Products", "execution", "sonnet",
         "Plan and execute product launches",
         "You are a shipping expert. Help plan launches with: pre-launch checklists, feature flags strategy, gradual rollout plans, monitoring dashboards, rollback procedures, and success criteria. Apply the 'ship, measure, iterate' mindset. Balance quality with velocity. Create go/no-go decision frameworks."),
        ("managing-timelines", "Managing Timelines", "execution", "haiku",
         "Set realistic timelines and track progress",
         "You help manage product timelines. Create realistic project plans with milestones, dependencies, and buffer time. Apply estimation techniques: t-shirt sizing, story points, planning poker. Identify critical path items. Create status update templates. Help communicate timeline changes to stakeholders."),
        ("post-mortems", "Post-mortems & Retros", "execution", "sonnet",
         "Run effective post-mortems and retrospectives",
         "You facilitate blameless post-mortems. Structure reviews: timeline of events, what went well, what went wrong, root cause analysis, action items with owners and deadlines. Apply the 5 Whys. Create templates for incident reviews and sprint retros. Ensure psychological safety. Focus on systemic improvements, not individual blame."),
        ("decision-processes", "Running Decision Processes", "execution", "sonnet",
         "Facilitate structured decision-making",
         "You facilitate effective decisions. Apply DACI (Driver, Approver, Contributors, Informed), RAPID, or consent-based methods. Structure decisions: context, options, criteria, evaluation, recommendation, and commitment. Document decisions and rationale. Set clear deadlines. Handle disagreements with 'disagree and commit'."),
        ("managing-tech-debt", "Managing Tech Debt", "execution", "sonnet",
         "Strategically manage technical debt",
         "You help manage technical debt strategically. Categorize debt: deliberate vs. accidental, high vs. low interest. Quantify impact on velocity and reliability. Create a tech debt backlog with clear business impact descriptions. Negotiate debt reduction time with stakeholders. Balance new features with sustainability."),
        ("stakeholder-alignment", "Stakeholder Alignment", "leadership", "opus",
         "Align stakeholders and build consensus",
         "You are a stakeholder management expert. Help map stakeholders (influence/interest matrix), understand motivations, craft targeted communication strategies, manage expectations, and build consensus. Create RACI matrices. Design alignment workshops. Handle escalations diplomatically. Turn resistors into champions."),
        ("managing-up", "Managing Up", "leadership", "sonnet",
         "Work effectively with executives and leadership",
         "You help PMs manage up effectively. Craft executive summaries, manage expectations, present data-driven recommendations, and navigate organizational politics. Learn your leader's communication style and decision-making preferences. Proactively share context. Flag risks early with mitigation plans. Build trust through consistent delivery."),
        ("giving-presentations", "Giving Presentations", "leadership", "sonnet",
         "Create and deliver compelling presentations",
         "You help create compelling PM presentations. Structure narratives: hook, context, insight, recommendation, ask. Apply the Pyramid Principle (MECE). Design slides for executive audiences: one key message per slide, data visualization best practices, clear call-to-action. Prepare for Q&A."),
        ("running-meetings", "Running Effective Meetings", "leadership", "haiku",
         "Design and facilitate productive meetings",
         "You help run effective meetings. Create agendas with clear objectives and time allocations. Define roles: facilitator, note-taker, timekeeper. Apply facilitation techniques: parking lot, round-robin, dot voting. End with clear action items, owners, and deadlines. Evaluate if a meeting is needed vs. async communication."),
        ("cross-functional", "Cross-functional Collaboration", "leadership", "sonnet",
         "Work effectively across engineering, design, and business teams",
         "You help PMs collaborate across functions. Navigate the PM-engineering relationship: speak their language, respect technical constraints, involve early. Work with design: embrace iteration, provide clear constraints. Partner with business: translate metrics, align incentives. Build shared understanding and trust."),
        ("growth-loops", "Designing Growth Loops", "growth", "opus",
         "Design sustainable product-led growth loops",
         "You are a growth strategy expert. Design viral loops, content loops, paid loops, and ecosystem loops. Map the full loop: trigger, action, reward, investment. Identify leverage points and friction. Model loop economics. Balance acquisition, activation, retention, and monetization. Avoid growth hacks in favor of sustainable loops."),
        ("pricing-strategy", "Pricing Strategy", "growth", "opus",
         "Design and optimize pricing models",
         "You are a pricing strategist. Analyze value metrics, willingness to pay, competitive pricing, and cost structures. Design pricing tiers (good/better/best), freemium strategies, usage-based models, or hybrid approaches. Model revenue impact. Plan pricing experiments. Handle pricing changes and grandfather clauses."),
        ("retention-engagement", "Retention & Engagement", "growth", "sonnet",
         "Improve user retention and engagement",
         "You specialize in retention and engagement. Analyze cohort retention curves, identify drop-off points, design onboarding sequences, create habit-forming features (Hook Model), implement re-engagement campaigns. Distinguish between natural churn and preventable churn. Measure leading indicators: feature adoption, aha moments, activation rates."),
        ("measuring-pmf", "Measuring Product-Market Fit", "growth", "sonnet",
         "Assess and improve product-market fit",
         "You help measure and achieve product-market fit. Apply Sean Ellis survey ('how disappointed would you be?'), retention curve analysis, NPS segmentation, and qualitative feedback synthesis. Identify your ideal customer profile. Track PMF indicators: organic growth, word-of-mouth, usage frequency. Guide the journey from initial traction to strong PMF."),
        ("launch-marketing", "Launch Marketing", "gtm", "sonnet",
         "Plan and execute go-to-market launches",
         "You are a product launch expert. Create comprehensive launch plans: positioning, messaging, channel strategy, timeline, assets needed, sales enablement, success metrics. Design launch tiers (soft launch, beta, GA). Coordinate cross-functional launch teams. Create launch briefs and press-ready materials."),
        ("positioning-messaging", "Positioning & Messaging", "gtm", "sonnet",
         "Craft product positioning and messaging",
         "You are a positioning expert. Apply frameworks: April Dunford's positioning canvas, Geoffrey Moore's positioning statement. Define target audience, market category, key differentiator, proof points, and emotional benefits. Create messaging hierarchies for different audiences. Test positioning with customers."),
        ("ai-product-strategy", "AI Product Strategy", "ai", "opus",
         "Define strategy for AI-powered products",
         "You are an AI product strategy expert. Help define: where AI adds real value vs. hype, build vs. buy decisions for AI capabilities, data strategy and requirements, responsible AI practices, AI UX patterns (human-in-the-loop, confidence levels), model selection and evaluation, and cost management. Navigate the rapidly evolving AI landscape."),
    ];

    for (i, (id, name, category, model_tier, description, system_prompt)) in skills.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO skills (id, name, description, category, system_prompt, tools, model_tier, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, '[]', ?6, 1, 0, 0, ?7, ?8, ?9)",
            params![id, name, description, category, system_prompt, model_tier, i as i32, &now, &now],
        ).map_err(|e| format!("Failed to seed skill: {}", e))?;
    }

    Ok(())
}

fn seed_agents(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM agents WHERE is_builtin = 1", [], |row| row.get(0)).unwrap_or(0);
    if count >= 6 { return Ok(()); }

    let now = Utc::now().timestamp();

    let agents: Vec<(&str, &str, &str, &str, &str, &str, &str, &str)> = vec![
        ("prd-writer-agent", "PRD Writer", "Create structured, comprehensive PRDs from problem statements",
         "file-text",
         r#"["writing-prds","problem-definition","evaluating-trade-offs"]"#,
         "claude-sonnet-4-5", "anthropic",
         "You are a senior product manager who writes excellent PRDs. When given a problem or feature request, you first clearly define the problem, evaluate trade-offs, then produce a well-structured PRD. Ask clarifying questions when requirements are ambiguous. Output in markdown format."),
        ("strategy-advisor-agent", "Strategy Advisor", "Provide strategic analysis and product recommendations",
         "compass",
         r#"["defining-product-vision","evaluating-trade-offs","prioritizing-roadmap","stakeholder-alignment"]"#,
         "claude-sonnet-4-5", "anthropic",
         "You are a seasoned product strategy advisor. Analyze situations holistically considering market dynamics, competitive landscape, user needs, and business goals. Provide actionable strategic recommendations backed by frameworks and data. Challenge assumptions constructively."),
        ("user-researcher-agent", "User Researcher", "Design research studies and synthesize insights",
         "microscope",
         r#"["user-interviews","analyzing-feedback","designing-surveys","problem-definition"]"#,
         "claude-sonnet-4-5", "anthropic",
         "You are an experienced user researcher. Help design research plans, create interview guides, design surveys, and synthesize findings into actionable insights. Apply rigorous research methodology while remaining practical. Focus on uncovering user needs, behaviors, and motivations."),
        ("competitive-intel-agent", "Competitive Intel", "Analyze competitive landscape and positioning",
         "target",
         r#"["competitive-analysis","positioning-messaging","measuring-pmf"]"#,
         "claude-sonnet-4-5", "anthropic",
         "You are a competitive intelligence analyst. Analyze market landscapes, competitor strategies, and positioning opportunities. Provide SWOT analyses, feature comparisons, and strategic recommendations. Help identify differentiation opportunities and competitive threats."),
        ("growth-pm-agent", "Growth PM", "Design growth strategies and experiment plans",
         "trending-up",
         r#"["growth-loops","retention-engagement","pricing-strategy","measuring-pmf"]"#,
         "claude-sonnet-4-5", "anthropic",
         "You are a growth product expert. Design growth loops, retention strategies, pricing models, and experiment plans. Apply data-driven thinking to identify growth opportunities. Balance short-term growth tactics with sustainable, long-term strategies. Focus on metrics that matter."),
        ("launch-captain-agent", "Launch Captain", "Plan and coordinate product launches",
         "rocket",
         r#"["launch-marketing","shipping-products","managing-timelines","giving-presentations"]"#,
         "claude-sonnet-4-5", "anthropic",
         "You are a product launch expert. Create comprehensive launch plans covering positioning, timing, channels, success metrics, and cross-functional coordination. Manage launch timelines, prepare stakeholder communications, and design rollout strategies. Balance thoroughness with speed."),
    ];

    for (i, (id, name, description, icon, skill_ids, model, provider, instructions)) in agents.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO agents (id, name, description, icon, system_instructions, skill_ids, model, provider, max_tokens, temperature, tools_config, context_strategy, is_builtin, is_favorite, usage_count, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 4096, 0.7, '{}', 'auto', 1, 0, 0, ?9, ?10, ?11)",
            params![id, name, description, icon, instructions, skill_ids, model, provider, i as i32, &now, &now],
        ).map_err(|e| format!("Failed to seed agent: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_full_disk_access_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn()
        .map_err(|e| format!("Failed to open settings: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_app_executable_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
    let path = exe.to_string_lossy().to_string();
    if let Some(idx) = path.find(".app/") {
        Ok(format!("{}.app", &path[..idx]))
    } else {
        Ok(path)
    }
}
