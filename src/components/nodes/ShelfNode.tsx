import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Box } from 'lucide-react';

interface CellInfo {
  id: number;
  alias: string;
  levelAlias: string | null;
  level_id: number | null;
  colNum: number;
  levelNum: number;
  occupancyStatus?: 'empty' | 'queuing' | 'active' | 'error';
}

const HANDLE_STYLE: React.CSSProperties = {
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '10px',
  height: '10px',
  border: 'none',
  minWidth: 0,
  minHeight: 0,
  backgroundColor: '#3b82f6',
  borderRadius: '50%',
};

const ShelfNode = memo(({ data, selected, isConnectable }: NodeProps) => {
  const cells: CellInfo[] = data.cells || [];
  const activeLevelId: number | null = data.activeLevelId ?? null;

  const { maxCol, maxLvl, levelLabels } = React.useMemo(() => {
    const cols = cells.length > 0 ? Math.max(...cells.map((c) => c.colNum)) : 0;
    const lvls = cells.length > 0 ? Math.max(...cells.map((c) => c.levelNum)) : 0;
    const labels = Array.from({ length: lvls }, (_, i) => lvls - i);
    return { maxCol: cols, maxLvl: lvls, levelLabels: labels };
  }, [cells]);

  const getCell = React.useCallback((col: number, lvl: number) =>
    cells.find((c) => c.colNum === col && c.levelNum === lvl), [cells]);

  const handleClass = `cursor-crosshair z-50 transition-opacity ${
    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  }`;

  return (
    <div className="group relative flex flex-col items-center">
      {/* Hover tooltip */}
      <div className="absolute -top-8 flex flex-col items-center z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
        <div className="bg-gray-900/95 dark:bg-[#121214]/95 text-white text-[9px] px-2 py-1 rounded-md shadow-xl backdrop-blur-md whitespace-nowrap flex items-center gap-1.5 border border-white/10">
          <span className="font-bold text-cyan-400 dark:text-cyan-300 tracking-wide">{data.label}</span>
          <span className="w-px h-3 bg-slate-600" />
          <span className="font-mono text-slate-300 uppercase font-bold text-[8px]">SHELF</span>
          <span className="w-px h-3 bg-slate-600" />
          <span className="font-mono text-purple-400 text-[8px]">{cells.length} cells</span>
        </div>
        <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1 border-r border-b border-white/10" />
      </div>

      {/* Shelf container */}
      <div
        className={`
          bg-white/95 dark:bg-[#0b2230]/95 border-2 rounded-lg shadow-2xl backdrop-blur-sm
          transition-all duration-150 cursor-move select-none
          ${
            selected
              ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/25 dark:ring-blue-400/25 scale-[1.03]'
              : 'border-slate-200 dark:border-cyan-700/60 hover:border-blue-400 dark:hover:border-cyan-500/80'
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-slate-100 dark:border-cyan-800/50">
          <Box size={9} className="text-blue-600 dark:text-cyan-400 shrink-0" strokeWidth={2.5} />
          <span className="text-[10px] font-bold font-mono text-slate-700 dark:text-cyan-200 leading-none tracking-wider">
            {data.label}
          </span>
        </div>

        {/* Grid Container */}
        <div className="p-2 flex gap-2 items-start">
          {cells.length > 0 ? (
            <>
              {/* Level labels */}
              <div 
                className="grid gap-[3px] pt-[23px]" 
                style={{ gridTemplateRows: `repeat(${maxLvl}, 20px)` }}
              >
                {levelLabels.map((lvl) => (
                  <div key={lvl} className="flex items-center justify-end pr-1">
                    <span className="text-[7px] font-mono font-bold text-slate-400 dark:text-cyan-600/80 leading-none">
                      L{lvl}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="flex flex-col gap-[3px]">
                {/* Column labels */}
                <div 
                  className="grid gap-[3px] mb-0.5"
                  style={{ gridTemplateColumns: `repeat(${maxCol}, 24px)` }}
                >
                  {Array.from({ length: maxCol }, (_, i) => i + 1).map((col) => (
                    <div key={col} className="flex items-center justify-center">
                      <span className="text-[7px] font-mono font-bold text-slate-400 dark:text-cyan-600/80 leading-none">
                        C{col}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Cell grid */}
                <div 
                  className="grid gap-[3px]"
                  style={{ 
                    gridTemplateColumns: `repeat(${maxCol}, 24px)`,
                    gridTemplateRows: `repeat(${maxLvl}, 20px)`
                  }}
                >
                {cells.map((cell) => {
                  const isDimmed = activeLevelId !== null && cell.level_id !== activeLevelId;
                  const onCellClick: ((id: number) => void) | undefined = data.onCellClick;
                  const gridRow = maxLvl - cell.levelNum + 1;
                  const gridCol = cell.colNum;

                  return (
                    <div
                      key={cell.id}
                      title={`${cell.alias}${cell.occupancyStatus && cell.occupancyStatus !== 'empty' ? ` [${cell.occupancyStatus.toUpperCase()}]` : ''}`}
                      style={{ gridRow, gridColumn: gridCol }}
                      onClick={onCellClick ? (e) => { e.stopPropagation(); onCellClick(cell.id); } : undefined}
                      className={`
                        w-6 h-5 rounded-[3px] flex flex-col items-center justify-center
                        text-[5px] font-bold font-mono border
                        transition-all duration-200
                        ${onCellClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:scale-110' : ''}
                        ${
                          isDimmed
                            ? 'bg-slate-100 dark:bg-purple-900/20 border-slate-200 dark:border-purple-900/25 text-slate-300 dark:text-purple-800/40'
                            : cell.occupancyStatus === 'active'
                              ? 'bg-amber-500 border-amber-400 text-white shadow-sm'
                              : cell.occupancyStatus === 'queuing'
                                ? 'bg-blue-500 border-blue-400 text-white shadow-sm'
                                : 'bg-green-500 dark:bg-green-600 border-green-400 dark:border-green-500 text-white shadow-sm'
                        }
                      `}
                    >
                      <span>C{cell.colNum}</span>
                      <span className="-mt-1">L{cell.levelNum}</span>
                    </div>
                  );
                })}

                {Array.from({ length: maxLvl }).map((_, rIdx) => {
                  const lvl = maxLvl - rIdx;
                  return Array.from({ length: maxCol }).map((_, cIdx) => {
                    const col = cIdx + 1;
                    if (getCell(col, lvl)) return null;
                    return (
                      <div 
                        key={`empty-${col}-${lvl}`}
                        style={{ gridRow: rIdx + 1, gridColumn: col }}
                        className="w-6 h-5 rounded-[3px] border border-slate-100 dark:border-cyan-900/20 bg-slate-50 dark:bg-cyan-950/20"
                      />
                    );
                  });
                })}
              </div>
            </div>
          </>
        ) : (
            <span className="text-[8px] text-slate-400 dark:text-cyan-700/50 italic py-0.5 px-0.5">
              no cells
            </span>
          )}
        </div>
      </div>

      {/* Handles */}
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
  );
});

ShelfNode.displayName = 'ShelfNode';

export default ShelfNode;
