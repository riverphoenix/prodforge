import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentTeam, AgentTeamNode, AgentTeamEdge, AgentDef, ExecutionMode } from '../lib/types';
import { agentTeamsAPI, teamNodesAPI, teamEdgesAPI } from '../lib/ipc';
import AgentNode from './canvas/AgentNode';
import ConnectorNode from './canvas/ConnectorNode';
import ConditionalNode from './canvas/ConditionalNode';
import NodePropertiesPanel from './NodePropertiesPanel';

const nodeTypes = { agent: AgentNode, connector: ConnectorNode, conditional: ConditionalNode };

interface TeamCanvasProps {
  team: AgentTeam;
  agents: AgentDef[];
  onBack: () => void;
  onRun: () => void;
}

function dbNodeToFlow(n: AgentTeamNode, agents: AgentDef[]): Node {
  const agent = agents.find(a => a.id === n.agent_id);
  return {
    id: n.id,
    type: n.node_type,
    position: { x: n.position_x, y: n.position_y },
    data: {
      agentName: agent?.name || 'Unknown',
      agentIcon: agent?.icon || '🤖',
      model: agent?.model || '',
      role: n.role,
      status: 'idle',
    },
  };
}

function dbEdgeToFlow(e: AgentTeamEdge): Edge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    type: 'smoothstep',
    animated: e.edge_type === 'data',
    label: e.label || undefined,
    style: { stroke: e.edge_type === 'conditional' ? '#eab308' : e.edge_type === 'parallel' ? '#3b82f6' : '#6b7280' },
  };
}

export default function TeamCanvas({ team, agents, onBack, onRun }: TeamCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dbNodes, setDbNodes] = useState<AgentTeamNode[]>([]);
  const [dbEdges, setDbEdges] = useState<AgentTeamEdge[]>([]);
  const [teamName, setTeamName] = useState(team.name);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(team.execution_mode);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const dragRef = useRef<{ agentId: string } | null>(null);

  const selectedDbNode = selectedNodeId ? dbNodes.find(n => n.id === selectedNodeId) || null : null;
  const selectedDbEdge = selectedEdgeId ? dbEdges.find(e => e.id === selectedEdgeId) || null : null;

  const loadGraph = useCallback(async () => {
    try {
      const [nodeRows, edgeRows] = await Promise.all([
        teamNodesAPI.list(team.id),
        teamEdgesAPI.list(team.id),
      ]);
      setDbNodes(nodeRows);
      setDbEdges(edgeRows);
      setNodes(nodeRows.map(n => dbNodeToFlow(n, agents)));
      setEdges(edgeRows.map(dbEdgeToFlow));
    } catch {}
  }, [team.id, agents, setNodes, setEdges]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    const positionChanges = changes.filter(
      (c): c is Extract<typeof c, { type: 'position' }> => c.type === 'position' && 'dragging' in c && !c.dragging && 'position' in c && !!c.position
    );
    if (positionChanges.length > 0) {
      const updates = positionChanges.map(c => ({
        id: c.id, position_x: c.position?.x || 0, position_y: c.position?.y || 0,
      }));
      teamNodesAPI.batchUpdate(updates).then(() => {
        setDbNodes(prev => prev.map(n => {
          const u = updates.find(u => u.id === n.id);
          return u ? { ...n, position_x: u.position_x, position_y: u.position_y } : n;
        }));
      }).catch(() => {});
    }
  }, [onNodesChange]);

  const handleEdgesChange: OnEdgesChange = useCallback((changes) => {
    onEdgesChange(changes);
    for (const c of changes) {
      if (c.type === 'remove') {
        teamEdgesAPI.delete(c.id).then(() => {
          setDbEdges(prev => prev.filter(e => e.id !== c.id));
        }).catch(() => {});
      }
    }
  }, [onEdgesChange]);

  const handleConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    try {
      const edge = await teamEdgesAPI.create({
        teamId: team.id,
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        edgeType: 'data',
        dataMapping: '{}',
      });
      setDbEdges(prev => [...prev, edge]);
      setEdges(eds => addEdge({ ...connection, id: edge.id, type: 'smoothstep', animated: true, style: { stroke: '#6b7280' } }, eds));
    } catch {}
  }, [team.id, setEdges]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await agentTeamsAPI.update(team.id, { name: teamName, executionMode });
    } catch {}
    setSaving(false);
  };

  const handleDragStart = (agentId: string) => {
    dragRef.current = { agentId };
  };

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    if (!dragRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    try {
      const node = await teamNodesAPI.create({
        teamId: team.id,
        agentId: dragRef.current.agentId,
        nodeType: 'agent',
        positionX: x,
        positionY: y,
        role: 'worker',
        config: '{}',
        sortOrder: dbNodes.length,
      });
      setDbNodes(prev => [...prev, node]);
      setNodes(prev => [...prev, dbNodeToFlow(node, agents)]);
    } catch {}
    dragRef.current = null;
  }, [team.id, agents, dbNodes.length, setNodes]);

  const handleDeleteNode = async (nodeId: string) => {
    try {
      await teamNodesAPI.delete(nodeId);
      setDbNodes(prev => prev.filter(n => n.id !== nodeId));
      setNodes(prev => prev.filter(n => n.id !== nodeId));
      setDbEdges(prev => prev.filter(e => e.source_node_id !== nodeId && e.target_node_id !== nodeId));
      setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    } catch {}
  };

  const filteredAgents = agentSearch
    ? agents.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase()))
    : agents;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 flex-shrink-0 border-b border-codex-border">
        <button onClick={onBack} className="text-codex-text-muted hover:text-codex-text-primary transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="text-sm font-semibold text-codex-text-primary bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-codex-accent rounded px-1"
        />
        <select
          value={executionMode}
          onChange={(e) => setExecutionMode(e.target.value as ExecutionMode)}
          className="px-2 py-1 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
        >
          <option value="sequential">Sequential</option>
          <option value="parallel">Parallel</option>
          <option value="conductor">Conductor</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary border border-codex-border rounded transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onRun}
          className="px-3 py-1 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded transition-colors"
        >
          Run Team
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className="w-44 flex-shrink-0 border-r border-codex-border overflow-y-auto bg-codex-sidebar">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search agents..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="w-full px-2 py-1 mb-2 bg-codex-surface border border-codex-border rounded text-[10px] text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
            <div className="text-[9px] font-semibold text-codex-text-muted uppercase tracking-wider mb-1 px-1">
              Drag to canvas
            </div>
          </div>
          {filteredAgents.map(a => (
            <div
              key={a.id}
              draggable
              onDragStart={() => handleDragStart(a.id)}
              className="flex items-center gap-2 px-2 py-1.5 cursor-grab hover:bg-white/[0.04] border-b border-codex-border/30 transition-colors"
            >
              <span className="text-sm">{a.icon}</span>
              <div className="min-w-0">
                <div className="text-[10px] text-codex-text-primary truncate">{a.name}</div>
                <div className="text-[8px] text-codex-text-muted truncate">{a.model}</div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{ flex: 1, minHeight: 0 }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#333" />
            <MiniMap
              className="bg-codex-sidebar"
              nodeColor="#3b82f6"
              maskColor="rgba(0,0,0,0.5)"
            />
            <Controls
              showInteractive={false}
              style={{ button: { backgroundColor: '#2a2a2a', color: '#888', border: '1px solid #333' } } as never}
            />
          </ReactFlow>
        </div>

        <div className="w-52 flex-shrink-0 border-l border-codex-border overflow-y-auto bg-codex-sidebar">
          <NodePropertiesPanel
            selectedNode={selectedDbNode}
            selectedEdge={selectedDbEdge}
            agents={agents}
            onNodeUpdate={(updated) => {
              setDbNodes(prev => prev.map(n => n.id === updated.id ? updated : n));
              setNodes(prev => prev.map(n => n.id === updated.id ? dbNodeToFlow(updated, agents) : n));
            }}
            onEdgeUpdate={(updated) => {
              setDbEdges(prev => prev.map(e => e.id === updated.id ? updated : e));
              setEdges(prev => prev.map(e => e.id === updated.id ? dbEdgeToFlow(updated) : e));
            }}
          />
          {selectedNodeId && (
            <div className="px-3 pb-3">
              <button
                onClick={() => handleDeleteNode(selectedNodeId)}
                className="w-full px-2 py-1 text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
              >
                Delete Node
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
