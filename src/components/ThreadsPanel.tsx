import { useState, useEffect, useRef } from 'react';
import { Project } from '../lib/types';
import { projectsAPI } from '../lib/ipc';
import { ask } from '@tauri-apps/plugin-dialog';

interface ThreadsPanelProps {
  onProjectSelect: (projectId: string) => void;
  onSettingsClick: () => void;
  currentProjectId: string | null;
  onClose: () => void;
}

export default function ThreadsPanel({
  onProjectSelect,
  currentProjectId,
  onClose,
}: ThreadsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 50);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const loadProjects = async () => {
    try {
      const projectList = await projectsAPI.list();
      setProjects(projectList);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const duplicateName = projects.some(
      p => p.name.toLowerCase() === newProjectName.trim().toLowerCase()
    );
    if (duplicateName) {
      alert(`A project named "${newProjectName.trim()}" already exists.`);
      return;
    }
    try {
      const project = await projectsAPI.create(newProjectName.trim());
      setProjects([project, ...projects]);
      setNewProjectName('');
      setIsCreating(false);
      onProjectSelect(project.id);
      onClose();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await ask(
      `Delete "${projectName}"? This will permanently delete all data in this project.`,
      { title: 'Delete Project', kind: 'warning' }
    );
    if (!confirmed) return;
    try {
      await projectsAPI.delete(projectId);
      await loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <div
      ref={panelRef}
      className="fixed left-12 bottom-0 z-40 flex flex-col animate-slide-in-right"
      style={{ width: '240px', top: '38px', backgroundColor: '#1e1e1e', borderRight: '1px solid #3e3e42' }}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-codex-text-primary">Projects</span>
          <button
            onClick={() => setIsCreating(true)}
            className="text-codex-text-muted hover:text-codex-text-primary p-0.5"
            title="New project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {isCreating && (
          <div className="mb-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') { setIsCreating(false); setNewProjectName(''); }
              }}
              placeholder="Project name..."
              className="w-full px-2 py-1.5 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-dimmed focus:outline-none focus:border-codex-accent"
              autoFocus
            />
            <div className="flex gap-1 mt-1.5">
              <button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="flex-1 px-2 py-1 bg-codex-accent text-white rounded text-[10px] disabled:opacity-40">Create</button>
              <button onClick={() => { setIsCreating(false); setNewProjectName(''); }} className="flex-1 px-2 py-1 bg-codex-surface text-codex-text-secondary rounded text-[10px]">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="space-y-0.5">
          {projects.map((project) => (
            <div key={project.id} className="group/project relative">
              <button
                onClick={() => { onProjectSelect(project.id); onClose(); }}
                className={`w-full px-2.5 py-2 flex items-center gap-2 rounded text-xs transition-colors ${
                  currentProjectId === project.id
                    ? 'bg-codex-accent/15 text-codex-text-primary'
                    : 'text-codex-text-secondary hover:bg-codex-surface/50 hover:text-codex-text-primary'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  currentProjectId === project.id ? 'bg-codex-accent' : 'bg-codex-text-muted'
                }`} />
                <span className="truncate">{project.name}</span>
              </button>
              <button
                onClick={(e) => handleDeleteProject(project.id, project.name, e)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/project:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                title="Delete"
              >
                <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {projects.length === 0 && !isCreating && (
            <div className="px-2 py-4 text-center">
              <p className="text-[10px] text-codex-text-muted">No projects yet</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-codex-border">
        <div className="text-[9px] text-codex-text-muted text-center">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </div>
      </div>
    </div>
  );
}
