import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface AgentNodeData {
  agentName: string;
  agentIcon: string;
  model: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  [key: string]: unknown;
}

function AgentNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const statusColors: Record<string, string> = {
    idle: 'border-codex-border',
    running: 'border-blue-500 shadow-blue-500/20',
    completed: 'border-green-500 shadow-green-500/20',
    failed: 'border-red-500 shadow-red-500/20',
  };

  return (
    <div className={`px-3 py-2 rounded-lg bg-codex-surface border-2 ${statusColors[nodeData.status] || statusColors.idle} ${selected ? 'ring-2 ring-codex-accent' : ''} min-w-[140px] transition-all`}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-codex-accent !border-codex-bg" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{nodeData.agentIcon || '🤖'}</span>
        <span className="text-xs font-semibold text-codex-text-primary truncate max-w-[100px]">
          {nodeData.agentName || 'Agent'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded truncate max-w-[80px]">
          {nodeData.model || 'model'}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
          nodeData.role === 'conductor' ? 'bg-purple-500/20 text-purple-300'
          : nodeData.role === 'reviewer' ? 'bg-yellow-500/20 text-yellow-300'
          : 'bg-codex-bg/60 text-codex-text-muted'
        }`}>
          {nodeData.role || 'worker'}
        </span>
      </div>
      {nodeData.status === 'running' && (
        <div className="mt-1.5 h-0.5 bg-codex-bg rounded overflow-hidden">
          <div className="h-full bg-blue-500 animate-pulse w-full" />
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-codex-accent !border-codex-bg" />
    </div>
  );
}

export default memo(AgentNode);
