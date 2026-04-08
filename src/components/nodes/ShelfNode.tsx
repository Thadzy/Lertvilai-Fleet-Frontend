/**
 * @file ShelfNode.tsx
 * @description Compact Purple Shelf Node with Fleet-Manager style popup for editing cell coordinates.
 */

import React, { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { Layers, X } from 'lucide-react';

// ============================================================
// TYPES & STYLES
// ============================================================

interface CellInfo {
  id: number;
  alias: string;
  levelAlias: string | null;
  level_id: number | null;
  colNum: number;
  levelNum: number;
  height?: number;
  occupancyStatus?: 'empty' | 'queuing' | 'active' | 'error';
}

const HANDLE_STYLE: React.CSSProperties = {
  top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '10px', height: '10px', border: 'none', backgroundColor: '#a855f7', borderRadius: '50%',
};

// ============================================================
// MODAL COMPONENT (Fleet Manager Style)
// ============================================================

const CellEditorModal = ({ data, shelfId, onClose }: { data: any, shelfId: string, onClose: () => void }) => {
  const { getNode, setNodes } = useReactFlow();
  const cells: CellInfo[] = data.cells || [];
  const sortedCells = [...cells].sort((a, b) => b.levelNum - a.levelNum);

  const SCALE_FACTOR = 100;

  /**
   * Applies manual coordinate entry using Delta positioning.
   */
  const handleManualMove = (nodeId: string, axis: 'x' | 'y', newVal: string, currentRos: number) => {
    const val = parseFloat(newVal);
    if (isNaN(val)) return;

    const target = getNode(nodeId);
    if (!target) return;

    let newPxX = target.position.x;
    let newPxY = target.position.y;
    const delta = val - currentRos;

    if (axis === 'x') {
      newPxX = target.position.x + (delta * SCALE_FACTOR);
    } else {
      newPxY = target.position.y - (delta * SCALE_FACTOR); 
    }

    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, position: { x: newPxX, y: newPxY } } : n));
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-all" onClick={onClose}>
      <div className="bg-white rounded-[2rem] shadow-2xl p-6 w-[360px] border border-slate-100" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl text-white bg-emerald-500 shadow-sm">
              <Layers size={22}/>
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg">{data.label}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Edit Coordinates</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors">
            <X size={16}/>
          </button>
        </div>

        {/* Cell List */}
        <div className="bg-slate-100 p-4 rounded-[1.5rem] max-h-[60vh] overflow-y-auto">
          {sortedCells.length === 0 ? (
             <div className="text-center text-slate-400 text-xs font-bold py-4">No cells assigned</div>
          ) : (
            sortedCells.map((cell) => {
              const targetNode = getNode(cell.id.toString());
              // ใช้พิกัดโดยประมาณสำหรับการโชว์ใน Input (1m = 100px)
              const approxX = targetNode ? targetNode.position.x / SCALE_FACTOR : 0;
              const approxY = targetNode ? targetNode.position.y / SCALE_FACTOR : 0;

              return (
                <div key={cell.id} className="w-full mb-3 bg-white shadow-sm rounded-2xl p-3 flex items-center justify-between border border-transparent hover:border-emerald-300 transition-all">
                  
                  {/* Left: Badge & Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] bg-slate-50 flex items-center justify-center font-black text-xs text-slate-500">
                      {cell.levelAlias || `L${cell.levelNum}`}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-700 text-sm leading-tight">{cell.alias}</p>
                      <p className="text-[9px] font-mono text-slate-400 mt-0.5">ID: {cell.id}</p>
                    </div>
                  </div>

                  {/* Right: X, Y Inputs (Replacing the '+' Button) */}
                  <div className="flex flex-col gap-1.5 w-24">
                     <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 focus-within:border-emerald-400 transition-colors">
                        <span className="text-[9px] font-black text-emerald-500">X</span>
                        <input 
                          type="number" 
                          step="0.001" 
                          defaultValue={approxX.toFixed(3)}
                          onBlur={(e) => handleManualMove(cell.id.toString(), 'x', e.target.value, approxX)}
                          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                          className="w-full bg-transparent text-[10px] font-mono text-slate-700 focus:outline-none"
                        />
                     </div>
                     <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 focus-within:border-blue-400 transition-colors">
                        <span className="text-[9px] font-black text-blue-500">Y</span>
                        <input 
                          type="number" 
                          step="0.001" 
                          defaultValue={approxY.toFixed(3)}
                          onBlur={(e) => handleManualMove(cell.id.toString(), 'y', e.target.value, approxY)}
                          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                          className="w-full bg-transparent text-[10px] font-mono text-slate-700 focus:outline-none"
                        />
                     </div>
                  </div>

                </div>
              )
            })
          )}
        </div>
        
        {/* Footer */}
        <div className="mt-4 flex justify-end">
           <button onClick={onClose} className="w-full py-3 bg-slate-800 text-white font-bold text-sm rounded-xl hover:bg-slate-700 active:scale-95 transition-all shadow-md">
             Save & Close
           </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

// ============================================================
// MAIN NODE COMPONENT
// ============================================================

const ShelfNode = memo(({ id, data, selected, isConnectable }: NodeProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const cells: CellInfo[] = data.cells || [];

  const handleClass = `cursor-crosshair z-50 transition-opacity ${
    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  }`;

  return (
    <>
      <div 
        onDoubleClick={() => setIsEditing(true)}
        className="group relative flex items-center gap-2 cursor-pointer"
        title="Double-click to edit cell coordinates"
      >
        {/* Purple Square (Match image_bda1a3.png) */}
        <div className={`w-11 h-11 rounded-[12px] bg-purple-500 flex items-center justify-center shadow-md transition-all ${selected ? 'ring-4 ring-purple-500/30 scale-105' : 'hover:scale-105'}`}>
           <Layers size={22} className="text-white opacity-90" />
           {cells.length > 0 && (
             <div className="absolute -top-2 -right-2 w-5 h-5 bg-white text-purple-600 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-purple-500 shadow-sm">
               {cells.length}
             </div>
           )}
        </div>
        
        {/* Label next to the square */}
        <span className="font-black text-slate-700 text-[13px] tracking-wide">
          {data.label}
        </span>

        {/* React Flow Handles */}
        {(['Top', 'Bottom', 'Left', 'Right'] as const).map((dir) => (
          <React.Fragment key={dir}>
            <Handle
              type="target"
              position={Position[dir]}
              id={`t-${dir.toLowerCase()}`}
              className={handleClass}
              style={HANDLE_STYLE}
              isConnectable={!!isConnectable}
            />
            <Handle
              type="source"
              position={Position[dir]}
              id={`s-${dir.toLowerCase()}`}
              className={handleClass}
              style={HANDLE_STYLE}
              isConnectable={!!isConnectable}
            />
          </React.Fragment>
        ))}
      </div>

      {/* Popup Modal */}
      {isEditing && (
        <CellEditorModal data={data} shelfId={id} onClose={() => setIsEditing(false)} />
      )}
    </>
  );
});

ShelfNode.displayName = 'ShelfNode';
export default ShelfNode;