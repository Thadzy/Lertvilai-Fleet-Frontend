import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  CircleDot,
  ArrowUpFromLine,
  Box,
  Layers,
  Home,
} from 'lucide-react';

export const NODE_STYLES: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  waypoint: { color: 'bg-slate-500 dark:bg-blue-600 border-slate-300 dark:border-blue-400 shadow-slate-900/20', icon: CircleDot, label: 'WAYPOINT' },
  conveyor: { color: 'bg-amber-500 dark:bg-amber-600 border-amber-300 dark:border-amber-400 shadow-amber-900/20', icon: ArrowUpFromLine, label: 'CONVEYOR' },
  shelf: { color: 'bg-cyan-500 dark:bg-cyan-600 border-cyan-300 dark:border-cyan-400 shadow-cyan-900/20', icon: Box, label: 'SHELF' },
  cell: { color: 'bg-purple-500 dark:bg-purple-600 border-purple-300 dark:border-purple-400 shadow-purple-900/20', icon: Layers, label: 'CELL' },
  depot: { color: 'bg-red-500 dark:bg-red-600 border-red-300 dark:border-red-400 shadow-red-900/20', icon: Home, label: 'DEPOT' },
  default: { color: 'bg-slate-400 dark:bg-slate-500 border-gray-200 dark:border-white/10', icon: CircleDot, label: 'UNKNOWN' },
} as const;

export const WaypointNode = memo(({ data, selected, isConnectable }: NodeProps) => {
  const nodeType = data.type || 'default';
  const style = NODE_STYLES[nodeType] || NODE_STYLES.default;
  const Icon = style.icon;
  const isCell = nodeType === 'cell';
  const sizeClass = isCell ? 'w-6 h-6' : 'w-9 h-9';

  return (
    <div className="group relative flex flex-col items-center justify-center">

      {/* Detail Tooltip */}
      {data.label && (
        <div className="absolute -top-12 flex flex-col items-center z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
          <div className="bg-gray-900/95 dark:bg-[#121214]/95 text-white text-[10px] px-2.5 py-1.5 rounded-md shadow-xl backdrop-blur-md whitespace-nowrap flex items-center gap-2 border border-gray-300 dark:border-white/10">
            <span className="font-bold text-slate-100 tracking-wide">{data.label}</span>
            <span className="w-px h-3 bg-slate-600"></span>
            <span className="font-mono text-[9px] uppercase font-bold text-slate-300">{style.label}</span>
            {data.levelAlias && (
              <>
                <span className="w-px h-3 bg-slate-600"></span>
                <span className="font-mono text-[9px] uppercase font-bold text-purple-400">{data.levelAlias}</span>
              </>
            )}
            {nodeType === 'conveyor' && data.height != null && (
              <>
                <span className="w-px h-3 bg-slate-600"></span>
                <span className="font-mono text-[9px] font-bold text-amber-400">H:{data.height}</span>
              </>
            )}
          </div>
          <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-gray-300 dark:border-white/10"></div>
        </div>
      )}

      {/* Node Body */}
      <div
        className={`
          ${sizeClass} rounded-full shadow-lg flex items-center justify-center
          border-[3px] transition-all cursor-move z-20 relative
          ${style.color}
          ${selected ? 'ring-4 ring-blue-500/20 dark:ring-blue-400/30 scale-110' : ''}
          ${data.highlighted ? 'ring-4 ring-yellow-400/70' : ''}
        `}
      >
        <Icon size={isCell ? 10 : 16} className="text-white drop-shadow-sm" strokeWidth={2.5} />

        {/* Level Badge for cells */}
        {data.levelAlias && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-purple-600 text-white text-[7px] font-bold rounded-full flex items-center justify-center border border-white shadow-sm">
            {data.levelAlias.replace(/^L/i, '')}
          </div>
        )}
      </div>

      {/* Persistent Alias Label */}
      {data.label && (
        <div
          className="absolute pointer-events-none"
          style={{ top: '100%', marginTop: '5px', zIndex: 40, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
        >
          <span className="bg-gray-900/75 dark:bg-black/80 text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shadow-md backdrop-blur-sm border border-white/10 leading-none">
            {data.label}
          </span>
        </div>
      )}

      {/* Handles */}
      {(['Top', 'Bottom', 'Left', 'Right'] as const).map((pos) => (
        <React.Fragment key={pos}>
          <Handle
            type="target"
            position={Position[pos]}
            id={`t-${pos.toLowerCase()}`}
            className={`cursor-crosshair z-50 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '10px', height: '10px', border: 'none', minWidth: 0, minHeight: 0, backgroundColor: '#3b82f6', borderRadius: '50%' }}
            isConnectable={!!isConnectable}
          />
          <Handle
            type="source"
            position={Position[pos]}
            id={`s-${pos.toLowerCase()}`}
            className={`cursor-crosshair z-50 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '10px', height: '10px', border: 'none', minWidth: 0, minHeight: 0, backgroundColor: '#3b82f6', borderRadius: '50%' }}
            isConnectable={!!isConnectable}
          />
        </React.Fragment>
      ))}
    </div>
  );
});

WaypointNode.displayName = 'WaypointNode';

export default WaypointNode;
