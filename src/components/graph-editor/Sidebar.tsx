/**
 * @file Sidebar.tsx
 * @description Node properties panel with manual coordinate entry support.
 */

import React from "react";
import { Edit3, MapPin, Box, Trash2, Plus, Layers } from "lucide-react";
import { Node, useReactFlow } from "reactflow";
import { Level } from "../../hooks/useGraphData";
import { toRosCoordinates } from "../../utils/mapCoordinates";
import type { RosMapConfig } from "../../hooks/useMapConfig";

interface SidebarProps {
  selectedNode: Node | null;
  onUpdateNode: (key: string, value: any) => void;
  onSetAsDepot: (nodeId: number, label: string) => void;
  levels: Level[];
  shelfCells: any[];
  onDeleteCell: (id: number) => void;
  newCellCol: string;
  setNewCellCol: (val: string) => void;
  newCellLevel: string;
  setNewCellLevel: (val: string) => void;
  onCreateCell: () => void;
  mapConfig: RosMapConfig;
}

const SCALE_FACTOR = 100;

const inputClass =
  "w-full text-xs border border-slate-300 dark:border-white/10 rounded-lg px-2.5 py-1.5 " +
  "focus:outline-none focus:border-blue-500 bg-white dark:bg-[#09090b] " +
  "text-slate-800 dark:text-white font-mono transition-colors shadow-sm";

const manualCoordinateInputClass =
  "w-full text-xs border border-slate-300 dark:border-white/20 rounded-lg px-2 py-1.5 " +
  "focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#121214] " +
  "text-slate-800 dark:text-white font-mono hover:border-blue-400 transition-colors shadow-inner";

export const Sidebar: React.FC<SidebarProps> = ({
  selectedNode,
  onUpdateNode,
  onSetAsDepot,
  levels,
  shelfCells,
  onDeleteCell,
  newCellCol,
  setNewCellCol,
  newCellLevel,
  setNewCellLevel,
  onCreateCell,
  mapConfig,
}) => {
  const { getNode, setNodes } = useReactFlow();

  if (!selectedNode || selectedNode.id === "map-background") return null;

  const isShelf = selectedNode.data.type === "shelf";

  const rosCoords = toRosCoordinates(
    selectedNode.position.x,
    selectedNode.position.y,
    mapConfig,
  );

  const handleManualCoordinateUpdate = (
    nodeId: string,
    axis: "x" | "y",
    value: string,
  ) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    const targetNode = getNode(nodeId);
    if (!targetNode) return;

    const currentRos = toRosCoordinates(
      targetNode.position.x,
      targetNode.position.y,
      mapConfig,
    );

    let newPxX = targetNode.position.x;
    let newPxY = targetNode.position.y;

    if (axis === "x") {
      const deltaRosX = numValue - currentRos.x;
      newPxX = targetNode.position.x + deltaRosX * SCALE_FACTOR;
    } else if (axis === "y") {
      const deltaRosY = numValue - currentRos.y;
      newPxY = targetNode.position.y - deltaRosY * SCALE_FACTOR;
    }

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n, position: { x: newPxX, y: newPxY } };
        }
        return n;
      }),
    );
  };

  // เรียงลำดับเซลล์จากชั้นบนลงล่าง เพื่อความสวยงาม
  const sortedCells = [...shelfCells].sort((a, b) => {
    const aLvl = parseInt(a.levelAlias?.match(/\d+/)?.[0] || a.levelNum || 0);
    const bLvl = parseInt(b.levelAlias?.match(/\d+/)?.[0] || b.levelNum || 0);
    return bLvl - aLvl;
  });

  return (
    <div className="bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl p-4 flex flex-col gap-4 w-[280px] pointer-events-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5 text-blue-600 dark:text-cyan-400 border-b border-slate-100 dark:border-white/5 pb-3">
        <div className="p-1.5 bg-blue-50 dark:bg-cyan-900/30 rounded-lg">
          <Edit3 size={16} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black uppercase tracking-tight">
          Node Properties
        </span>
      </div>

      {/* Label Edit */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Node Alias (Name)
        </label>
        <input
          type="text"
          value={selectedNode.data.label}
          onChange={(e) => onUpdateNode("label", e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Manual Coordinates */}
      <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-2.5 tracking-wider">
          <MapPin size={12} /> ROS Location (meters)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase">
              X Axis
            </label>
            <input
              type="number"
              step="0.001"
              /* 💡 เปลี่ยนจาก defaultValue เป็น value เพื่อให้อัปเดตตามการลาก */
              value={rosCoords.x.toFixed(3)}
              /* 💡 เพิ่ม onChange เพื่อให้พิมพ์ได้ และเรียกฟังก์ชันอัปเดตตัวเดียวกับตอน Blur */
              onChange={(e) =>
                handleManualCoordinateUpdate(
                  selectedNode.id,
                  "x",
                  e.target.value,
                )
              }
              onKeyDown={(e) => e.key === "Enter" && (e.target as any).blur()}
              className={manualCoordinateInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase">
              Y Axis
            </label>
            <input
              type="number"
              step="0.001"
              /* 💡 เปลี่ยนจาก defaultValue เป็น value */
              value={rosCoords.y.toFixed(3)}
              /* 💡 เพิ่ม onChange */
              onChange={(e) =>
                handleManualCoordinateUpdate(
                  selectedNode.id,
                  "y",
                  e.target.value,
                )
              }
              onKeyDown={(e) => e.key === "Enter" && (e.target as any).blur()}
              className={manualCoordinateInputClass}
            />
          </div>
        </div>
      </div>

      {/* Shelf & Cell Management */}
      {isShelf && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1.5 tracking-wider">
              <Box size={14} /> Assigned Cells
            </span>
            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
              {shelfCells.length} Total
            </span>
          </div>

          {/* Cell List */}
          <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 pr-1 custom-scrollbar">
            {sortedCells.length === 0 ? (
              <div className="text-center py-4 text-xs font-bold text-slate-400 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                No cells assigned
              </div>
            ) : (
              sortedCells.map((cell) => (
                <div
                  key={cell.id}
                  className="group flex items-center justify-between p-2 bg-white dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 hover:border-purple-300 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded flex items-center justify-center font-black text-[9px]">
                      {cell.levelAlias ||
                        (cell.levelNum
                          ? `L${cell.levelNum}`
                          : cell.alias?.match(/L\d+/i)?.[0] || "?")}
                    </div>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-xs">
                      {cell.alias}
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteCell(cell.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                    title="Remove Cell"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Clean Add Cell Section (No Col input) */}
          <div className="mt-1 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-col gap-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase">
              Add New Level to {selectedNode.data.label}
            </span>
            <div className="flex gap-2">
              <select
                value={newCellLevel}
                onChange={(e) => setNewCellLevel(e.target.value)}
                className="flex-1 text-xs px-2.5 py-2 border border-slate-300 dark:border-white/20 rounded-lg bg-slate-50 dark:bg-[#09090b] text-slate-800 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-bold cursor-pointer"
              >
                <option value="" disabled>
                  Select Level...
                </option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.alias} (H: {l.height}m)
                  </option>
                ))}
              </select>
              <button
                onClick={onCreateCell}
                disabled={!newCellLevel}
                className="px-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex items-center justify-center"
                title="Add Cell to Shelf"
              >
                <Plus size={16} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
