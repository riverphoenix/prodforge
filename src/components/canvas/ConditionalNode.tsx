import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ConditionalNodeData {
  condition: string;
  [key: string]: unknown;
}

function ConditionalNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionalNodeData;
  return (
    <div className={`relative ${selected ? 'drop-shadow-lg' : ''}`} style={{ width: 48, height: 48 }}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-codex-accent !border-codex-bg" style={{ left: -4 }} />
      <div
        className={`absolute inset-0 bg-codex-surface border-2 border-codex-border ${selected ? 'ring-2 ring-codex-accent' : ''} transition-all flex items-center justify-center`}
        style={{ transform: 'rotate(45deg)' }}
      >
        <span className="text-[9px] text-codex-text-muted" style={{ transform: 'rotate(-45deg)' }}>
          {nodeData.condition ? '?' : 'if'}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-codex-accent !border-codex-bg" style={{ right: -4 }} />
      <Handle type="source" position={Position.Bottom} id="false" className="!w-2 !h-2 !bg-red-400 !border-codex-bg" style={{ bottom: -4 }} />
    </div>
  );
}

export default memo(ConditionalNode);
