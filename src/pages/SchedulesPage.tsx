import { useState, useEffect, useCallback } from 'react';
import { Schedule, TriggerType, TargetType, AgentDef, AgentTeam } from '../lib/types';
import { schedulesAPI, schedulerExecutionAPI, agentsAPI, agentTeamsAPI } from '../lib/ipc';

interface SchedulesPageProps {
  projectId: string;
}

const TRIGGER_LABELS: Record<TriggerType, { label: string; color: string }> = {
  cron: { label: 'Cron', color: 'bg-purple-500/20 text-purple-300' },
  interval: { label: 'Interval', color: 'bg-blue-500/20 text-blue-300' },
  event: { label: 'Event', color: 'bg-amber-500/20 text-amber-300' },
};

export default function SchedulesPage({ projectId: _projectId }: SchedulesPageProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const [formName, setFormName] = useState('');
  const [formTargetType, setFormTargetType] = useState<TargetType>('agent');
  const [formTargetId, setFormTargetId] = useState('');
  const [formTriggerType, setFormTriggerType] = useState<TriggerType>('interval');
  const [formCronExpr, setFormCronExpr] = useState('0 * * * *');
  const [formIntervalSecs, setFormIntervalSecs] = useState(3600);
  const [formActive, setFormActive] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allSchedules, allAgents, allTeams] = await Promise.all([
        schedulesAPI.list(),
        agentsAPI.list(),
        agentTeamsAPI.list(),
      ]);
      setSchedules(allSchedules);
      setAgents(allAgents);
      setTeams(allTeams);
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const resetForm = () => {
    setFormName('');
    setFormTargetType('agent');
    setFormTargetId('');
    setFormTriggerType('interval');
    setFormCronExpr('0 * * * *');
    setFormIntervalSecs(3600);
    setFormActive(false);
    setEditingSchedule(null);
  };

  const openEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name);
    setFormTargetType(schedule.target_type);
    setFormTargetId(schedule.target_id);
    setFormTriggerType(schedule.trigger_type);
    const config = typeof schedule.trigger_config === 'string' ? JSON.parse(schedule.trigger_config || '{}') : schedule.trigger_config;
    setFormCronExpr(config.expression || '0 * * * *');
    setFormIntervalSecs(config.seconds || 3600);
    setFormActive(schedule.is_active);
    setShowCreateModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formTargetId) return;
    setSaving(true);
    const triggerConfig = formTriggerType === 'cron'
      ? JSON.stringify({ expression: formCronExpr })
      : JSON.stringify({ seconds: formIntervalSecs });

    try {
      if (editingSchedule) {
        await schedulesAPI.update(editingSchedule.id, {
          name: formName,
          targetType: formTargetType,
          targetId: formTargetId,
          triggerType: formTriggerType,
          triggerConfig,
          isActive: formActive,
        });
      } else {
        await schedulesAPI.create({
          name: formName,
          targetType: formTargetType,
          targetId: formTargetId,
          triggerType: formTriggerType,
          triggerConfig,
          isActive: formActive,
        });
      }
      setShowCreateModal(false);
      resetForm();
      await loadData();
      await syncScheduler();
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await schedulesAPI.delete(id);
      await loadData();
      await syncScheduler();
    } catch {}
  };

  const handleToggleActive = async (schedule: Schedule) => {
    try {
      await schedulesAPI.update(schedule.id, { isActive: !schedule.is_active });
      await loadData();
      await syncScheduler();
    } catch {}
  };

  const handleTriggerNow = async (scheduleId: string) => {
    try {
      await schedulerExecutionAPI.triggerNow(scheduleId);
    } catch (err) {
      console.error('Failed to trigger schedule:', err);
    }
  };

  const syncScheduler = async () => {
    try {
      const active = await schedulesAPI.getActive();
      await schedulerExecutionAPI.start();
      await fetch('http://127.0.0.1:8001/scheduler/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules: active }),
      });
    } catch {}
  };

  const getTargetName = (targetType: TargetType, targetId: string): string => {
    if (targetType === 'agent') {
      return agents.find(a => a.id === targetId)?.name || 'Unknown Agent';
    }
    if (targetType === 'team') {
      return teams.find(t => t.id === targetId)?.name || 'Unknown Team';
    }
    return targetId;
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
  };

  const targets = formTargetType === 'agent'
    ? agents.map(a => ({ id: a.id, name: a.name, icon: a.icon }))
    : teams.map(t => ({ id: t.id, name: t.name, icon: t.icon }));

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
        <div className="text-codex-text-muted text-xs">Loading schedules...</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="bg-codex-bg">
      <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0 border-b border-codex-border">
        <div>
          <h1 className="text-sm font-semibold text-codex-text-primary">Schedules</h1>
          <p className="text-[10px] text-codex-text-muted mt-0.5">Automate agent and team runs with cron or interval triggers</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreateModal(true); }}
          className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
        >
          + New Schedule
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {schedules.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">&#128337;</div>
            <h3 className="text-sm text-codex-text-primary mb-1">No schedules yet</h3>
            <p className="text-xs text-codex-text-muted mb-4">Create a schedule to automate agent or team runs</p>
            <button
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
            >
              Create Your First Schedule
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                className="border border-codex-border rounded-lg p-4 hover:border-codex-accent/30 transition-colors"
                style={{ backgroundColor: '#1e1e1e' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${schedule.is_active ? 'bg-green-500' : 'bg-codex-text-muted'}`} />
                    <div>
                      <h3 className="text-sm font-medium text-codex-text-primary">{schedule.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${TRIGGER_LABELS[schedule.trigger_type]?.color || 'bg-codex-surface text-codex-text-muted'}`}>
                          {TRIGGER_LABELS[schedule.trigger_type]?.label || schedule.trigger_type}
                        </span>
                        <span className="text-[10px] text-codex-text-muted">
                          {schedule.target_type}: {getTargetName(schedule.target_type, schedule.target_id)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTriggerNow(schedule.id)}
                      className="px-2 py-1 text-[10px] text-codex-text-secondary hover:text-codex-text-primary border border-codex-border rounded hover:bg-white/[0.04] transition-colors"
                    >
                      Run Now
                    </button>
                    <button
                      onClick={() => handleToggleActive(schedule)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                        schedule.is_active
                          ? 'text-green-400 border-green-500/30 hover:bg-green-500/10'
                          : 'text-codex-text-muted border-codex-border hover:bg-white/[0.04]'
                      }`}
                    >
                      {schedule.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => openEdit(schedule)}
                      className="px-2 py-1 text-[10px] text-codex-text-secondary hover:text-codex-text-primary border border-codex-border rounded hover:bg-white/[0.04] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      className="px-2 py-1 text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-codex-text-muted">
                  <span>Last run: {formatDate(schedule.last_run_at)}</span>
                  <span>Next run: {formatDate(schedule.next_run_at)}</span>
                  <span>{schedule.run_count} runs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowCreateModal(false); resetForm(); }}>
          <div
            className="w-[480px] rounded-lg border border-codex-border shadow-2xl"
            style={{ backgroundColor: '#252526' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-codex-border">
              <h2 className="text-sm font-semibold text-codex-text-primary">
                {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
              </h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-[10px] text-codex-text-muted uppercase tracking-wider block mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g., Daily market analysis"
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-codex-text-muted uppercase tracking-wider block mb-1">Target Type</label>
                  <select
                    value={formTargetType}
                    onChange={e => { setFormTargetType(e.target.value as TargetType); setFormTargetId(''); }}
                    className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  >
                    <option value="agent">Agent</option>
                    <option value="team">Team</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-codex-text-muted uppercase tracking-wider block mb-1">Target</label>
                  <select
                    value={formTargetId}
                    onChange={e => setFormTargetId(e.target.value)}
                    className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  >
                    <option value="">Select...</option>
                    {targets.map(t => (
                      <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-codex-text-muted uppercase tracking-wider block mb-1">Trigger Type</label>
                <div className="flex gap-2">
                  {(['interval', 'cron'] as TriggerType[]).map(tt => (
                    <button
                      key={tt}
                      onClick={() => setFormTriggerType(tt)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                        formTriggerType === tt
                          ? 'border-codex-accent text-codex-accent bg-codex-accent/10'
                          : 'border-codex-border text-codex-text-muted hover:text-codex-text-primary hover:bg-white/[0.04]'
                      }`}
                    >
                      {tt.charAt(0).toUpperCase() + tt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {formTriggerType === 'cron' ? (
                <div>
                  <label className="text-[10px] text-codex-text-muted uppercase tracking-wider block mb-1">Cron Expression</label>
                  <input
                    type="text"
                    value={formCronExpr}
                    onChange={e => setFormCronExpr(e.target.value)}
                    placeholder="0 * * * *"
                    className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary font-mono placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                  <p className="text-[9px] text-codex-text-muted mt-1">min hour day month weekday</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] text-codex-text-muted uppercase tracking-wider block mb-1">Interval (seconds)</label>
                  <input
                    type="number"
                    value={formIntervalSecs}
                    onChange={e => setFormIntervalSecs(parseInt(e.target.value) || 60)}
                    min={60}
                    className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                  <p className="text-[9px] text-codex-text-muted mt-1">
                    Every {formIntervalSecs >= 3600 ? `${(formIntervalSecs / 3600).toFixed(1)}h` : `${(formIntervalSecs / 60).toFixed(0)}m`}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFormActive(!formActive)}
                  className={`w-8 h-4 rounded-full transition-colors relative ${formActive ? 'bg-green-500' : 'bg-codex-surface border border-codex-border'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${formActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-codex-text-secondary">{formActive ? 'Active' : 'Paused'}</span>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-codex-border flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary border border-codex-border rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formTargetId}
                className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingSchedule ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
