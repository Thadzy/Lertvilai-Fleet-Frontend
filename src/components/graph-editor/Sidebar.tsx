/**
 * @file Sidebar.tsx
 * @description Node properties panel with support for manual ROS coordinates 
 * and real-time screen pixel display.
 */

import React from "react";
import { 
  Edit3, 
  MapPin, 
  Box, 
  Trash2, 
  Plus, 
  Monitor, 
  Layers 
} from "lucide-react";
import { Node, useReactFlow } from "reactflow";
import { Level } from "../../hooks/useGraphData";
import { CANVAS_SCALE } from "../../utils/mapCoordinates";
import type { RosMapConfig } from "../../hooks/useMapConfig";
import { NumericInput } from "../ui/NumericInput";

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
  const isDepot = selectedNode.data.type === "depot";
  const isWaypoint = selectedNode.data.type === "waypoint";
  const isConveyor = selectedNode.data.type === "conveyor";

  /**
   * Calculate ROS coordinates in metres (canvas → world).
   *
   * Forward:  canvas_px = (metres - origin) × CANVAS_SCALE
   * Inverse:  metres    = origin + canvas_px / CANVAS_SCALE
   *
   * Y-axis is flipped: ROS +Y is Up, React Flow +Y is Down.
   *   canvas_py = imgHeight - (metres_y - originY) × CANVAS_SCALE
   *   metres_y  = originY   + (imgHeight - canvas_py) / CANVAS_SCALE
   *
   * imgHeight is in canvas pixels (raw_px × resolution × CANVAS_SCALE).
   */
  const rosX = mapConfig.originX + selectedNode.position.x / CANVAS_SCALE;
  const rosY = mapConfig.originY + (mapConfig.imgHeight - selectedNode.position.y) / CANVAS_SCALE;

  /**
   * Handle manual coordinate updates in metres (world → canvas).
   *
   * Forward:  canvas_px  = (metres   - origin)    × CANVAS_SCALE
   *           canvas_py  = imgHeight - (metres_y - originY) × CANVAS_SCALE
   */
  const handleManualCoordinateUpdate = (
    nodeId: string,
    axis: "x" | "y",
    value: string,
  ) => {
    const meterVal = parseFloat(value);
    if (isNaN(meterVal)) return;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          const newPos = { ...n.position };
          if (axis === "x") {
            newPos.x = (meterVal - mapConfig.originX) * CANVAS_SCALE;
          } else {
            newPos.y = mapConfig.imgHeight - (meterVal - mapConfig.originY) * CANVAS_SCALE;
          }
          return { ...n, position: newPos };
        }
        return n;
      }),
    );
  };

  /**
   * Handle manual coordinate updates in Pixels.
   */
  const handleManualPixelUpdate = (
    nodeId: string,
    axis: "x" | "y",
    value: string,
  ) => {
    const pixelVal = parseFloat(value);
    if (isNaN(pixelVal)) return;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          const newPos = { ...n.position };
          if (axis === "x") newPos.x = pixelVal;
          else newPos.y = pixelVal;
          return { ...n, position: newPos };
        }
        return n;
      }),
    );
  };

  // เรียงลำดับเซลล์จากชั้นบนลงล่าง
  const sortedCells = [...shelfCells].sort((a, b) => {
    const aLvlStr = a.levelAlias || a.alias?.match(/L\d+/i)?.[0] || "";
    const bLvlStr = b.levelAlias || b.alias?.match(/L\d+/i)?.[0] || "";
    const aLvl = parseInt(aLvlStr.replace(/\D/g, "") || "0");
    const bLvl = parseInt(bLvlStr.replace(/\D/g, "") || "0");
    return bLvl - aLvl;
  });

  return (
    <div className="bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl p-4 flex flex-col gap-4 w-[280px] pointer-events-auto transition-all">
      
      {/* 1. Header Section */}
      <div className="flex items-center gap-2.5 text-blue-600 dark:text-cyan-400 border-b border-slate-100 dark:border-white/5 pb-3">
        <div className="p-1.5 bg-blue-50 dark:bg-cyan-900/30 rounded-lg">
          <Edit3 size={16} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black uppercase tracking-tight">
          Node Properties
        </span>
      </div>

      {/* 2. Label & Alias Section */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Node Alias (Name)
          </label>
          <input
            type="text"
            value={selectedNode.data.label || ""}
            onChange={(e) => onUpdateNode("label", e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Node Type Info & Depot Toggle */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Type</span>
            <span className={`text-[10px] font-bold uppercase ${isDepot ? 'text-red-500' : isShelf ? 'text-purple-500' : 'text-slate-600 dark:text-slate-300'}`}>
              {selectedNode.data.type || "waypoint"}
            </span>
          </div>
          {(isWaypoint || isConveyor) && !isDepot && (
             <button
                onClick={() => onSetAsDepot(Number(selectedNode.id), selectedNode.data.label)}
                className="px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded-lg hover:bg-red-700 transition-colors shadow-sm"
             >
                SET AS DEPOT
             </button>
          )}
          {isDepot && (
             <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <span className="text-[9px] font-black uppercase">Active Depot</span>
             </div>
          )}
        </div>
      </div>

      {/* 3. Screen Position Section (Pixels) */}
      <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-xl p-3 border border-blue-100 dark:border-blue-900/20">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase mb-2.5 tracking-wider">
          <Monitor size={12} /> Screen Position (Pixels)
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono font-bold">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-blue-600/70 uppercase">X Pixel</label>
            <NumericInput
              value={Math.round(selectedNode.position.x)}
              onChange={(v) => handleManualPixelUpdate(selectedNode.id, "x", String(v))}
              step={1}
              integer
              className={manualCoordinateInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-blue-600/70 uppercase">Y Pixel</label>
            <NumericInput
              value={Math.round(selectedNode.position.y)}
              onChange={(v) => handleManualPixelUpdate(selectedNode.id, "y", String(v))}
              step={1}
              integer
              className={manualCoordinateInputClass}
            />
          </div>
        </div>
      </div>

      {/* 4. ROS Coordinates Section (Meters) */}
      <div className="bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900/20 shadow-sm">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-2.5 tracking-wider">
          <MapPin size={12} /> ROS Location (Meters)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-emerald-600/70 uppercase">X Meter</label>
            <NumericInput
              value={rosX}
              onChange={(v) => handleManualCoordinateUpdate(selectedNode.id, "x", String(v))}
              step={0.001}
              decimals={3}
              className={manualCoordinateInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-emerald-600/70 uppercase">Y Meter</label>
            <NumericInput
              value={rosY}
              onChange={(v) => handleManualCoordinateUpdate(selectedNode.id, "y", String(v))}
              step={0.001}
              decimals={3}
              className={manualCoordinateInputClass}
            />
          </div>
        </div>

        {/* Rotation & Height (Conditional) */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          {(selectedNode.data.type === 'waypoint' || selectedNode.data.type === 'conveyor' || selectedNode.data.type === 'depot' || selectedNode.data.type === 'shelf') && (
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-emerald-600/70 uppercase">Yaw (Rad)</label>
              <NumericInput
                value={selectedNode.data.yaw ?? 0}
                onChange={(v) => onUpdateNode("yaw", v)}
                step={0.01}
                decimals={3}
                className={manualCoordinateInputClass}
              />
            </div>
          )}
          {selectedNode.data.type === 'conveyor' && (
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-emerald-600/70 uppercase">Height (M)</label>
              <NumericInput
                value={selectedNode.data.height ?? 1.0}
                onChange={(v) => onUpdateNode("height", v)}
                step={0.1}
                decimals={2}
                min={0}
                className={manualCoordinateInputClass}
              />
            </div>
          )}
        </div>
      </div>

      {/* 5. Shelf & Cell Management Section */}
      {isShelf && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1.5 tracking-wider">
              <Box size={14} /> Assigned Cells
            </span>
            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded shadow-inner">
              {shelfCells.length} Total
            </span>
          </div>

          {/* Cell List Container */}
          <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 pr-1 custom-scrollbar">
            {sortedCells.length === 0 ? (
              <div className="text-center py-4 text-[10px] font-bold text-slate-400 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                No cells assigned
              </div>
            ) : (
              sortedCells.map((cell) => (
                <div
                  key={cell.id}
                  className="group flex items-center justify-between p-2 bg-white dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/50 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded flex items-center justify-center font-black text-[9px]">
                      {cell.levelAlias ||
                        cell.alias?.match(/L\d+/i)?.[0] ||
                        "?"}
                    </div>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-xs">
                      {cell.alias}
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteCell(cell.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    title="Remove Cell"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add Cell UI */}
          <div className="mt-1 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-col gap-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
              Add New Level
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