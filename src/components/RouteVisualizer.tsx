/**
 * @file RouteVisualizer.tsx
 * @description Modal and inline warehouse graph visualizer for VRP solutions.
 *
 * Renders the warehouse layout using the same `useGraphData.loadGraph()` pipeline
 * as the Graph Editor, ensuring visual consistency across all tabs (nodes,
 * background image, shelf grid, edge styles all match exactly).
 *
 * Solution overlay:
 * - Base edges that lie along a solved route are animated and coloured by vehicle.
 * - Edges that appear in the solution but not in the base graph are rendered as
 * dashed "virtual" edges so the user can always see the intended path.
 * - When no solution is active the raw base graph is shown as a live preview.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from 'reactflow';
import { X, Map as MapIcon, Loader2, CheckSquare, Layers, Target } from 'lucide-react';
import 'reactflow/dist/style.css';

import { useThemeStore } from '../store/themeStore';
import { useGraphData } from '../hooks/useGraphData';
import { useMapConfig } from '../hooks/useMapConfig';
import { type DBNode } from '../types/database';
import WaypointNode from './nodes/WaypointNode';
import ShelfNode from './nodes/ShelfNode';
import AnimatedEdge from './edges/AnimatedEdge';

// ============================================================
// TYPES
// ============================================================

interface SolverRoute {
  vehicle_id: number;
  steps?: { node_id: number; [key: string]: any }[];
  nodes?: number[];
  distance: number;
}

export interface PathSegment {
  edge_id: number;
  distance: number;
}

export interface SolverSolution {
  feasible: boolean;
  total_distance: number;
  wall_time_ms: number;
  routes: SolverRoute[];
  summary: string;
}

interface RouteVisualizerProps {
  /** ID of the warehouse graph to display. */
  graphId: number;
  isOpen: boolean;
  onClose: () => void;
  solution: SolverSolution | null;
  /** Called with the DB node ID when the user clicks a node (simulation mode). */
  onNodeClick?: (nodeId: number) => void;
  title?: string;
  instruction?: string;
  /** When true the component renders inline (no modal overlay). */
  inline?: boolean;
  /** Signal from parent to pan camera to Origin (0,0) */
  triggerPanToOrigin?: number; 
}

// ============================================================
// COLOUR PALETTE — one colour per vehicle route
// ============================================================

const VEHICLE_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
];

// ============================================================
// READ-ONLY MAP BACKGROUND NODE
// ============================================================

const MapNode = ({ data }: NodeProps) => (
  <img
    src={data.url}
    alt="Map Background"
    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
    draggable={false}
  />
);

const NODE_TYPES: NodeTypes = {
  waypointNode: WaypointNode,
  shelfNode:    ShelfNode,
  mapNode:      MapNode,
};

const EDGE_TYPES = { animatedEdge: AnimatedEdge };

// ============================================================
// INNER COMPONENT (Requires ReactFlow context for camera control)
// ============================================================

const RouteVisualizerInner: React.FC<RouteVisualizerProps> = ({
  graphId,
  isOpen,
  onClose,
  solution,
  onNodeClick,
  title = 'Route Visualization',
  instruction,
  inline = false,
  triggerPanToOrigin,
}) => {
  const { theme }     = useThemeStore();
  const { loadGraph } = useGraphData(graphId);
  const { config: mapConfig, configLoading: mapConfigLoading } = useMapConfig(graphId);
  const reactFlowInstance = useReactFlow();

  const [baseNodes, setBaseNodes] = useState<Node[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  
  // 💡 State for Drill-down Shelf Popup
  const [shelfPopup, setShelfPopup] = useState<{ shelf: Node, cells: any[] } | null>(null);

  /** Load Map Data */
  useEffect(() => {
    // We must wait for mapConfig to be ready to avoid mirrored initial state
    if (!graphId || (!isOpen && !inline) || mapConfigLoading) return;

    let cancelled = false;
    setGraphLoading(true);

    // 💡 CRITICAL: Pass mapConfig here to fix mirroring and alignment
    loadGraph(mapConfig).then((result) => {
      if (cancelled) return;
      setBaseNodes(result.nodes);
      setBaseEdges(result.edges);
      setGraphLoading(false);
    });

    return () => { cancelled = true; };
  }, [graphId, isOpen, inline, loadGraph, mapConfig, mapConfigLoading]);

  /** 💡 Pan to Origin Trigger */
  useEffect(() => {
    if (triggerPanToOrigin && triggerPanToOrigin > 0 && mapConfig) {
      const SCALE_FACTOR = 100;
      const originPxX = (-mapConfig.originX * SCALE_FACTOR);
      const originPxY = (mapConfig.imgHeight + (mapConfig.originY * SCALE_FACTOR));
      reactFlowInstance.setCenter(originPxX, originPxY, { zoom: 1.2, duration: 800 });
    }
  }, [triggerPanToOrigin, mapConfig, reactFlowInstance]);

  /** Process Solution Edges */
  const displayEdges = useMemo<Edge[]>(() => {
    if (!solution?.routes?.length) return baseEdges;

    const activeEdgeColor = new Map<string, string>();
    const virtualEdges: Edge[] = [];

    solution.routes.forEach((route, routeIdx) => {
      const steps = route.steps ?? [];
      const color = VEHICLE_COLORS[routeIdx % VEHICLE_COLORS.length];

      for (let i = 0; i < steps.length - 1; i++) {
        const srcId = String(steps[i].node_id);
        const tgtId = String(steps[i + 1].node_id);

        const matchedEdge = baseEdges.find(
          (e) =>
            (e.source === srcId && e.target === tgtId) ||
            (e.source === tgtId && e.target === srcId),
        );

        if (matchedEdge) {
          activeEdgeColor.set(matchedEdge.id, color);
        } else {
          virtualEdges.push({
            id: `virtual-${routeIdx}-${i}-${srcId}-${tgtId}`,
            source: srcId,
            target: tgtId,
            animated: true,
            type: 'animatedEdge',
            style: { stroke: color, strokeWidth: 4, strokeDasharray: '10 5' },
            markerEnd: { type: MarkerType.ArrowClosed, color },
            zIndex: 10,
          });
        }
      }
    });

    const styledBase = baseEdges.map((e) => {
      const color = activeEdgeColor.get(e.id);
      if (color) return { ...e, animated: true, style: { stroke: color, strokeWidth: 4 }, zIndex: 10 };
      return { ...e, animated: false, style: { stroke: '#94a3b8', strokeWidth: 1, opacity: 0.4 }, zIndex: 0 };
    });

    return [...styledBase, ...virtualEdges];
  }, [solution, baseEdges]);

  /** Process Display Nodes */
  const displayNodes = useMemo<Node[]>(() => {
    if (!onNodeClick) return baseNodes;
    return baseNodes.map((n) => {
      // Pass empty onCellClick to prevent standard shelf double-click modal (Graph Editor)
      // from firing when we are in RouteVisualizer node selection mode.
      if (n.type === 'shelfNode') {
        return { ...n, data: { ...n.data, onCellClick: () => {} } };
      }
      return n;
    });
  }, [baseNodes, onNodeClick]);

  /** 💡 Handle Node Click with Shelf Popup Logic */
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (!onNodeClick || node.id === 'map-background') return;
      
      event.preventDefault();

      if (node.type === 'shelfNode') {
        const cells = node.data.cells || [];
        const sortedCells = [...cells].sort((a, b) => {
          const aLvl = parseInt(a.levelAlias?.match(/\d+/)?.[0] || a.levelNum || '0');
          const bLvl = parseInt(b.levelAlias?.match(/\d+/)?.[0] || b.levelNum || '0');
          return bLvl - aLvl;
        });
        setShelfPopup({ shelf: node, cells: sortedCells });
        return;
      }

      const numericId = parseInt(node.id, 10);
      if (!isNaN(numericId)) onNodeClick(numericId);
    },
    [onNodeClick],
  );

  const canvas = (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={onNodeClick ? handleNodeClick : undefined}
      fitView
      minZoom={0.05}
      maxZoom={4}
      panOnScroll
      panOnDrag
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={!!onNodeClick}
      defaultEdgeOptions={{ type: 'animatedEdge' }}
    >
      <Background color={theme === 'dark' ? '#1e293b' : '#cbd5e1'} gap={20} size={1} variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>
  );

  if (!isOpen && !inline) return null;

  return (
    <>
      {inline ? (
        <div className="flex-1 w-full h-full bg-[#f8fafc] dark:bg-[#09090b] relative z-0">
          {graphLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
          )}
          {canvas}
          {!solution && baseNodes.length > 0 && (
            <div className="absolute top-4 right-4 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-sm border border-gray-200 dark:border-white/10 px-3 py-1.5 rounded-lg shadow-sm text-[10px] font-bold text-gray-500 dark:text-gray-400 pointer-events-none z-10 flex items-center gap-2">
              <MapIcon size={12} className="text-blue-500" />
              LIVE GRAPH PREVIEW
            </div>
          )}
        </div>
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-8">
          <div className="bg-white dark:bg-[#121214] w-full h-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="h-16 border-b border-gray-100 dark:border-white/5 flex items-center justify-between px-6 bg-gray-100 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white p-2 rounded-lg shadow-lg shadow-blue-200"><MapIcon size={20} /></div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded font-mono uppercase">{solution ? solution.summary : 'Preview Mode'}</span>
                    {graphLoading && <span className="flex items-center gap-1 text-[10px] text-blue-600 font-bold animate-pulse"><Loader2 size={10} className="animate-spin" /> LOADING...</span>}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:bg-white/10 rounded-full transition-colors"><X size={20} className="text-gray-500 dark:text-gray-400" /></button>
            </div>

            <div className="flex-1 bg-gray-100 dark:bg-white/5 relative">
              {canvas}
              <div className="absolute bottom-4 left-4 flex flex-col gap-2 pointer-events-none">
                <div className="bg-white dark:bg-[#121214]/90 backdrop-blur-sm p-3 rounded-xl shadow-sm border border-gray-200 dark:border-white/10 text-[10px] space-y-2">
                  <p className="font-bold text-gray-900 dark:text-white uppercase tracking-tight">Legend</p>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-600 border border-white" /><span className="text-gray-600 dark:text-gray-400">Interactive Node</span></div>
                  <div className="flex items-center gap-2"><div className="w-6 h-1 bg-blue-600" /><span className="text-gray-600 dark:text-gray-400">Assigned Path</span></div>
                  <div className="flex items-center gap-2"><div className="w-6 h-px border-b border-blue-600 border-dashed" /><span className="text-gray-600 dark:text-gray-400">Virtual Segment</span></div>
                </div>
                {instruction ? (
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg text-xs font-bold">{instruction}</div>
                ) : onNodeClick ? (
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg text-xs font-bold">Click any node to preview route</div>
                ) : null}
              </div>
            </div>

            <div className="h-16 border-t border-gray-100 dark:border-white/5 flex items-center justify-between px-6 bg-white dark:bg-[#121214] gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500"><CheckSquare size={14} className="text-gray-300 dark:text-gray-600" /><span>{onNodeClick ? 'Showing live simulation path' : 'Reviewing optimized fleet solution'}</span></div>
              <button onClick={onClose} className="px-6 py-2 bg-gray-800 dark:bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-gray-700 dark:hover:bg-blue-500 hover:shadow-lg transition-all active:scale-95">DONE {onNodeClick ? 'SIMULATING' : 'REVIEWING'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 💡 Popup สำหรับเลือก Cell (เลียนแบบ Fleet Manager) */}
      {shelfPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm" onClick={() => setShelfPopup(null)}>
          <div className="bg-white dark:bg-[#121214] rounded-[2rem] shadow-2xl border border-slate-100 dark:border-white/10 p-6 w-[340px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl text-white bg-emerald-500 shadow-sm"><Layers size={22} /></div>
                <div>
                  <h3 className="font-black text-slate-800 dark:text-white text-lg">{shelfPopup.shelf.data.label}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Cell</p>
                </div>
              </div>
              <button onClick={() => setShelfPopup(null)} className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 rounded-full transition-colors"><X size={16} /></button>
            </div>

            <div className="bg-slate-100 dark:bg-white/5 p-4 rounded-[1.5rem] max-h-[50vh] overflow-y-auto">
              {shelfPopup.cells.length === 0 ? (
                <div className="text-center text-slate-400 text-xs font-bold py-4">No cells available</div>
              ) : (
                shelfPopup.cells.map((cell) => (
                  <button 
                    key={cell.id} 
                    onClick={() => {
                      if (onNodeClick) onNodeClick(cell.id);
                      setShelfPopup(null);
                    }} 
                    className="w-full mb-3 bg-white dark:bg-[#1a1a1c] shadow-sm rounded-2xl p-3 flex items-center justify-between border border-transparent hover:border-emerald-400 hover:-translate-y-0.5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] bg-slate-50 dark:bg-white/5 flex items-center justify-center font-black text-xs text-slate-500">
                        {cell.levelAlias || (cell.levelNum ? `L${cell.levelNum}` : cell.alias?.match(/L\d+/i)?.[0] || "?")}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-slate-700 dark:text-slate-300 text-sm leading-tight group-hover:text-emerald-500 transition-colors">{cell.alias}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {cell.id}</p>
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">+</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================
// EXPORT WRAPPER (Adds ReactFlowProvider context)
// ============================================================

const RouteVisualizer: React.FC<RouteVisualizerProps> = (props) => (
  <ReactFlowProvider>
    <RouteVisualizerInner {...props} />
  </ReactFlowProvider>
);

export default RouteVisualizer;