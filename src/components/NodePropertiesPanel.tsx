import { AgentTeamNode, AgentTeamEdge, AgentDef, NodeRole } from '../lib/types';
import { teamNodesAPI, teamEdgesAPI } from '../lib/ipc';

interface NodePropertiesPanelProps {
  selectedNode: AgentTeamNode | null;
  selectedEdge: AgentTeamEdge | null;
  agents: AgentDef[];
  onNodeUpdate: (node: AgentTeamNode) => void;
  onEdgeUpdate: (edge: AgentTeamEdge) => void;
}

export default function NodePropertiesPanel({ selectedNode, selectedEdge, agents, onNodeUpdate, onEdgeUpdate }: NodePropertiesPanelProps) {
  const agent = selectedNode ? agents.find(a => a.id === selectedNode.agent_id) : null;

  const handleRoleChange = async (role: NodeRole) => {
    if (!selectedNode) return;
    try {
      const updated = await teamNodesAPI.update(selectedNode.id, { role });
      onNodeUpdate(updated);
    } catch {}
  };

  const handleEdgeTypeChange = async (edgeType: string) => {
    if (!selectedEdge) return;
    try {
      const updated = await teamEdgesAPI.update(selectedEdge.id, { edgeType });
      onEdgeUpdate(updated);
    } catch {}
  };

  const handleEdgeLabelChange = async (label: string) => {
    if (!selectedEdge) return;
    try {
      const updated = await teamEdgesAPI.update(selectedEdge.id, { label: label || null });
      onEdgeUpdate(updated);
    } catch {}
  };

  const handleConditionChange = async (condition: string) => {
    if (!selectedEdge) return;
    try {
      const updated = await teamEdgesAPI.update(selectedEdge.id, { condition: condition || null });
      onEdgeUpdate(updated);
    } catch {}
  };

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="p-3 text-center">
        <p className="text-[10px] text-codex-text-muted">Select a node or edge to view properties</p>
      </div>
    );
  }

  if (selectedNode) {
    return (
      <div className="p-3 space-y-3">
        <div className="text-[10px] font-semibold text-codex-text-muted uppercase tracking-wider">Node Properties</div>
        {agent && (
          <div className="flex items-center gap-2 p-2 bg-codex-bg/50 rounded">
            <span className="text-base">{agent.icon}</span>
            <div>
              <div className="text-xs font-medium text-codex-text-primary">{agent.name}</div>
              <div className="text-[9px] text-codex-text-muted">{agent.model}</div>
            </div>
          </div>
        )}
        <div>
          <label className="block text-[10px] text-codex-text-muted mb-1">Role</label>
          <select
            value={selectedNode.role}
            onChange={(e) => handleRoleChange(e.target.value as NodeRole)}
            className="w-full px-2 py-1 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
          >
            <option value="worker">Worker</option>
            <option value="conductor">Conductor</option>
            <option value="reviewer">Reviewer</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-codex-text-muted mb-1">Type</label>
          <div className="text-xs text-codex-text-secondary">{selectedNode.node_type}</div>
        </div>
        <div>
          <label className="block text-[10px] text-codex-text-muted mb-1">Position</label>
          <div className="text-xs text-codex-text-secondary">
            x: {Math.round(selectedNode.position_x)}, y: {Math.round(selectedNode.position_y)}
          </div>
        </div>
      </div>
    );
  }

  if (selectedEdge) {
    return (
      <div className="p-3 space-y-3">
        <div className="text-[10px] font-semibold text-codex-text-muted uppercase tracking-wider">Edge Properties</div>
        <div>
          <label className="block text-[10px] text-codex-text-muted mb-1">Type</label>
          <select
            value={selectedEdge.edge_type}
            onChange={(e) => handleEdgeTypeChange(e.target.value)}
            className="w-full px-2 py-1 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
          >
            <option value="data">Data</option>
            <option value="conditional">Conditional</option>
            <option value="parallel">Parallel</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-codex-text-muted mb-1">Label</label>
          <input
            type="text"
            value={selectedEdge.label || ''}
            onChange={(e) => handleEdgeLabelChange(e.target.value)}
            placeholder="Edge label..."
            className="w-full px-2 py-1 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
          />
        </div>
        {selectedEdge.edge_type === 'conditional' && (
          <div>
            <label className="block text-[10px] text-codex-text-muted mb-1">Condition</label>
            <input
              type="text"
              value={selectedEdge.condition || ''}
              onChange={(e) => handleConditionChange(e.target.value)}
              placeholder="Condition expression..."
              className="w-full px-2 py-1 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
          </div>
        )}
      </div>
    );
  }

  return null;
}
