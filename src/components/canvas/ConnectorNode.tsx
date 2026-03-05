import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

function ConnectorNode({ selected }: NodeProps) {
  return (
    <div className={`w-8 h-8 rounded-full bg-codex-surface border-2 border-codex-border flex items-center justify-center ${selected ? 'ring-2 ring-codex-accent' : ''} transition-all`}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-codex-accent !border-codex-bg" />
      <svg className="w-3.5 h-3.5 text-codex-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-codex-accent !border-codex-bg" />
    </div>
  );
}

export default memo(ConnectorNode);
