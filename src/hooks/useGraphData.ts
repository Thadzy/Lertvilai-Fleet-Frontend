/**
 * @file useGraphData.ts
 * @description Standardized hook for warehouse graph operations with full CRUD support.
 * * Key Features:
 * 1. Constant Visual Scale: 1.0 meter always equals 100 pixels on the UI.
 * 2. Coordinate Transformation: Standard ROS to Web-Canvas mapping.
 * 3. Inverse Math: Converts pixels back to meters for database persistence.
 * 4. Cell Drill-down Support: Organizes cells inside shelf data for the UI.
 */

import { useState, useCallback, useEffect } from 'react';
import { type Node, type Edge, MarkerType } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { type RosMapConfig } from './useMapConfig';
import { fromRosCoordinates, toRosCoordinates, CANVAS_SCALE } from '../utils/mapCoordinates';

/** * Constant for visual rendering: 1.0 meter (Real World) = 100 pixels (Canvas).
 * This ensures nodes don't overlap when the map resolution is high.
 */
const DISPLAY_SCALE = CANVAS_SCALE;

// ---------------------------------------------------------------------------
// TYPE DEFINITIONS
// ---------------------------------------------------------------------------

/** Raw node row from 'wh_nodes_view' */
export interface ViewNode {
  id: number;
  type: 'waypoint' | 'conveyor' | 'shelf' | 'cell' | 'depot';
  alias: string | null;
  graph_id: number;
  x: number;
  y: number;
  yaw: number | null;
  height: number | null;
  shelf_id: number | null;
  level_id: number | null;
  created_at: string;
}

/** Raw edge row from 'wh_edges_view' */
export interface ViewEdge {
  edge_id: number;
  graph_id: number;
  node_a_id: number;
  node_b_id: number;
  node_a_type: string;
  node_a_alias: string | null;
  node_b_type: string;
  node_b_alias: string | null;
  distance_2d: number;
}

/** Warehouse floor level */
export interface Level {
  id: number;
  alias: string;
  height: number;
  graph_id: number;
  cell_count?: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// HOOK IMPLEMENTATION
// ---------------------------------------------------------------------------

export const useGraphData = (graphId: number) => {
  const [loading, setLoading] = useState(false);

  // =========================================================
  // 1. READ OPERATION: FETCH & TRANSFORM
  // =========================================================

  /**
   * Loads graph data and transforms coordinates for React Flow.
   * * Transformation Math:
   * X_px = (X_meter - OriginX) * 100
   * Y_px = ImgHeight - ((Y_meter - OriginY) * 100)
   */
  const loadGraph = useCallback(async (mapConfig?: RosMapConfig) => {
    const fallback = {
      nodes: [] as Node[],
      edges: [] as Edge[],
      mapUrl: null as string | null,
      levels: [] as Level[],
      nodeAliasMap: new Map<number, string>(),
      cellMap: new Map<number, number>(),
    };

    if (!graphId) return fallback;

    setLoading(true);
    try {
      // Parallel data fetching for performance
      const [graphRes, nodeRes, edgeRes, levelRes] = await Promise.all([
        supabase.from('wh_graphs').select('*').eq('id', graphId).single(),
        supabase.from('wh_nodes_view').select('*').eq('graph_id', graphId),
        supabase.from('wh_edges_view').select('*').eq('graph_id', graphId),
        supabase.from('wh_levels').select('*').eq('graph_id', graphId).order('height')
      ]);

      if (graphRes.error || !graphRes.data) throw new Error('Graph record not found');

      const levels = (levelRes.data || []) as Level[];
      const viewNodes = (nodeRes.data || []) as ViewNode[];
      const viewEdges = (edgeRes.data || []) as ViewEdge[];
      const cellNodeIds = new Set(viewNodes.filter(n => n.type === 'cell').map(n => n.id));

      // Organize cells by their parent Shelf ID
      const cellsByShelfId = new Map<number, any[]>();
      viewNodes.forEach(n => {
        if (n.type === 'cell' && n.shelf_id !== null) {
          const lvl = levels.find(l => l.id === n.level_id);
          const entry = { 
            id: n.id, 
            alias: n.alias || `Cell_${n.id}`, 
            levelAlias: lvl ? lvl.alias : (n.alias?.match(/L\d+/i)?.[0] || 'L?'), 
            level_id: n.level_id, 
            levelNum: parseInt(n.alias?.match(/L(\d+)/i)?.[1] || '1'),
            occupancyStatus: 'empty' 
          };
          const arr = cellsByShelfId.get(n.shelf_id) || [];
          arr.push(entry);
          cellsByShelfId.set(n.shelf_id, arr);
        }
      });

      // Mapping database coordinates to UI pixels
      const flowNodes: Node[] = viewNodes.map((n) => {
        const { x: posX, y: posY } = mapConfig 
          ? fromRosCoordinates(n.x, n.y, mapConfig)
          : { x: n.x * DISPLAY_SCALE, y: n.y * DISPLAY_SCALE };

        if (n.type === 'shelf') {
          return { 
            id: n.id.toString(), 
            type: 'shelfNode', 
            position: { x: posX, y: posY }, 
            draggable: true, 
            data: { 
              label: n.alias, 
              type: n.type, 
              cells: cellsByShelfId.get(n.id) || [], 
              activeLevelId: null 
            } 
          };
        }

        return { 
          id: n.id.toString(), 
          type: 'waypointNode', 
          position: { x: posX, y: posY }, 
          draggable: true, 
          hidden: n.type === 'cell', // Hide individual cells from the main canvas
          data: { label: n.alias, type: n.type, yaw: n.yaw, height: n.height } 
        };
      });

      // Map background placement (Hash URL parsing)
      const mapUrl = graphRes.data.map_url;
      if (mapUrl) {
        let mapX = 0, mapY = 0, mapW = 1200, mapH = 800, cleanUrl = mapUrl;
        if (mapUrl.includes('#')) {
          const [base, hash] = mapUrl.split('#'); cleanUrl = base;
          const params = new URLSearchParams(hash);
          mapX = parseFloat(params.get('x') || '0');
          mapY = parseFloat(params.get('y') || '0');
          mapW = parseFloat(params.get('w') || '1200');
          mapH = parseFloat(params.get('h') || '800');
        }
        flowNodes.unshift({
          id: 'map-background',
          type: 'mapNode',
          position: { x: mapX, y: mapY },
          data: { url: cleanUrl },
          style: { width: mapW, height: mapH, zIndex: -11 },
          draggable: false, selectable: false
        });
      }

      // Supplementary mappings
      const nodeAliasMap = new Map<number, string>();
      viewNodes.forEach(n => nodeAliasMap.set(n.id, n.alias || `Node_${n.id}`));

      const cellMap = new Map<number, number>();
      viewNodes.forEach(n => { if (n.type === 'cell' && n.shelf_id) cellMap.set(n.id, n.shelf_id); });

      const flowEdges: Edge[] = (viewEdges as ViewEdge[])
        .filter(e => !cellNodeIds.has(e.node_a_id) && !cellNodeIds.has(e.node_b_id))
        .map((e) => ({
          id: `e${e.node_a_id}-${e.node_b_id}`,
          source: e.node_a_id.toString(),
          target: e.node_b_id.toString(),
          type: 'animatedEdge',
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
        }));

      return { nodes: flowNodes, edges: flowEdges, mapUrl, levels, nodeAliasMap, cellMap };
    } catch (error) {
      console.error('[useGraphData] Load Error:', error);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, [graphId]);

  // =========================================================
  // 2. WRITE OPERATION: PERSIST CHANGES
  // =========================================================

  /**
   * Persists the current graph state (nodes and edges) to the Supabase backend.
   * 
   * This function performs the inverse transformation from Web Canvas pixels back
   * to ROS world coordinates (meters). It also handles node creation, updates, 
   * and deletions to synchronize the local React Flow state with the database.
   * 
   * Coordinate Transformation (Web-to-ROS):
   * - X: (Canvas_X / 100) + Origin_X
   * - Y: ((ImgHeight - Canvas_Y) / 100) + Origin_Y
   * - Precision: Limited to 3 decimal places (millimeter accuracy) to prevent
   *   floating-point drift in the database.
   * 
   * @param nodes - Current array of React Flow nodes.
   * @param edges - Current array of React Flow edges.
   * @param currentMapUrl - Optional background map URL with coordinate hash.
   * @param mapConfig - Optional ROS spatial metadata for coordinate mapping.
   */
  const saveGraph = useCallback(async (
    nodes: Node[], 
    edges: Edge[], 
    currentMapUrl: string | null = null, 
    mapConfig?: RosMapConfig
  ) => {
    if (!graphId) throw new Error("No graph ID provided.");
    setLoading(true);

    const generateTagId = (alias: string | null): string | null => {
      if (!alias) return null;
      const clean = alias.trim().toUpperCase();
      if (clean.startsWith('Q')) return clean.substring(1);
      if (clean.startsWith('S')) {
        const match = clean.match(/^S(\d+)(.*)$/);
        if (match) return `S${match[1].padStart(3, '0')}${match[2]}`;
      }
      return clean;
    };

    try {
      const activeNodes = nodes.filter(n => n.id !== 'map-background');
      const idMap = new Map<string, number>();
      const existingNodes: any[] = [];
      const newNodes: Node[] = [];
      const nodesToDelete: number[] = [];

      // Sort nodes into categories
      for (const n of activeNodes) {
        const numericId = Number(n.id);
        if (n.data?.type === 'cell') {
          if (!isNaN(numericId)) idMap.set(n.id, numericId);
          continue;
        }
        if (isNaN(numericId)) newNodes.push(n);
        else { existingNodes.push({ flowNode: n, dbId: numericId }); idMap.set(n.id, numericId); }
      }

      // Cleanup logic for deleted nodes
      const { data: currentDbNodes } = await supabase.from('wh_nodes_view').select('id, type').eq('graph_id', graphId);
      if (currentDbNodes) {
        const activeDbIds = new Set(existingNodes.map(n => n.dbId));
        for (const dbNode of currentDbNodes) {
          if (dbNode.type === 'depot' || dbNode.type === 'cell') continue;
          if (!activeDbIds.has(dbNode.id)) nodesToDelete.push(dbNode.id);
        }
      }

      await Promise.all(nodesToDelete.map(nodeId => supabase.rpc('wh_delete_node', { p_node_id: nodeId })));

      const coordinateGuard = (val: any) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

      // Update existing nodes with inverse coordinate math
      await Promise.all(existingNodes.map(async ({ flowNode, dbId }) => {
        const { x: rosX, y: rosY } = mapConfig
          ? toRosCoordinates(flowNode.position.x, flowNode.position.y, mapConfig)
          : { x: flowNode.position.x / DISPLAY_SCALE, y: flowNode.position.y / DISPLAY_SCALE };

        const alias = flowNode.data.label || null;
        const tagId = generateTagId(alias);
        
        await supabase.rpc('wh_update_node_position', {
          p_node_id: dbId, p_x: rosX, p_y: rosY, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0)
        });
        await supabase.from('wh_nodes').update({ alias, tag_id: tagId }).eq('id', dbId);
      }));

      // Create new nodes
      for (const flowNode of newNodes) {
        const nodeType = (flowNode.data.type || 'waypoint') as string;
        const { x: rosX, y: rosY } = mapConfig
          ? toRosCoordinates(flowNode.position.x, flowNode.position.y, mapConfig)
          : { x: flowNode.position.x / DISPLAY_SCALE, y: flowNode.position.y / DISPLAY_SCALE };

        const alias = flowNode.data.label || null;
        const tagId = generateTagId(alias);
        let newNodeId: number | null = null;

        if (nodeType === 'waypoint') {
          const { data } = await supabase.rpc('wh_create_waypoint', { p_graph_id: graphId, p_x: rosX, p_y: rosY, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0), p_alias: alias, p_tag_id: tagId });
          newNodeId = data;
        } else if (nodeType === 'shelf') {
          const { data } = await supabase.rpc('wh_create_shelf', { p_graph_id: graphId, p_x: rosX, p_y: rosY, p_alias: alias, p_tag_id: tagId });
          newNodeId = data;
        } else if (nodeType === 'conveyor') {
          const { data } = await supabase.rpc('wh_create_conveyor', { p_graph_id: graphId, p_x: rosX, p_y: rosY, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0), p_height: coordinateGuard(flowNode.data.height ?? 1.0), p_alias: alias, p_tag_id: tagId });
          newNodeId = data;
        }

        if (newNodeId !== null) idMap.set(flowNode.id, newNodeId);
      }

      // Reconstruct Edges
      const { data: currentEdges } = await supabase.from('wh_edges_view').select('edge_id, node_a_type, node_b_type').eq('graph_id', graphId);
      if (currentEdges) {
        await Promise.all(currentEdges.filter(e => e.node_a_type !== 'cell' && e.node_b_type !== 'cell').map(e => supabase.rpc('wh_delete_edge', { p_edge_id: e.edge_id })));
      }

      for (const edge of edges) {
        const sourceId = idMap.get(edge.source);
        const targetId = idMap.get(edge.target);
        if (sourceId !== undefined && targetId !== undefined) {
          await supabase.rpc('wh_create_edge', { p_graph_id: graphId, p_node_a_id: sourceId, p_node_b_id: targetId });
        }
      }

      // Background metadata sync
      const mapNode = nodes.find(n => n.id === 'map-background');
      if (mapNode && currentMapUrl) {
        const baseUrl = currentMapUrl.split('#')[0];
        const newMapUrl = `${baseUrl}#x=${Math.round(mapNode.position.x)}&y=${Math.round(mapNode.position.y)}&w=${Math.round(mapNode.width || mapNode.style?.width || 1200)}&h=${Math.round(mapNode.height || mapNode.style?.height || 800)}`;
        await supabase.from('wh_graphs').update({ map_url: newMapUrl }).eq('id', graphId);
      }

      return true;
    } catch (error) {
      console.error('[useGraphData] Save Error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [graphId]);

  // =========================================================
  // 3. CRUD: LEVELS & CELLS
  // =========================================================

  const createLevel = useCallback(async (alias: string, height: number) => {
    const { data, error } = await supabase.rpc('wh_create_level', { p_graph_id: graphId, p_alias: alias, p_height: height });
    if (error) throw error; return data as number;
  }, [graphId]);

  const deleteLevel = useCallback(async (levelId: number) => {
    const { error } = await supabase.from('wh_levels').delete().eq('id', levelId);
    return !error;
  }, []);

  const createCell = useCallback(async (sAlias: string, lAlias: string, cAlias: string, tId: string) => {
    const { data, error } = await supabase.rpc('wh_create_cell', { 
      p_graph_id: graphId, p_shelf_alias: sAlias, p_level_alias: lAlias, p_alias: cAlias, p_tag_id: tId 
    });
    if (error) throw error; return data as number;
  }, [graphId]);

  const deleteCell = useCallback(async (cellId: number) => {
    const { error } = await supabase.rpc('wh_delete_node', { p_node_id: cellId });
    return !error;
  }, []);

  const setNodeAsDepot = useCallback(async (nodeId: number) => {
    const { error } = await supabase.rpc('wh_set_node_as_depot', { p_graph_id: graphId, p_node_id: nodeId });
    return !error;
  }, [graphId]);

  return { loadGraph, saveGraph, loading, createLevel, deleteLevel, createCell, deleteCell, setNodeAsDepot };
};

/** Real-time database listener */
export const useGraphRealtime = (graphId: number, onUpdate: () => void) => {
  useEffect(() => {
    if (!graphId) return;
    const channel = supabase.channel(`graph-rt-${graphId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wh_nodes', filter: `graph_id=eq.${graphId}` }, onUpdate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [graphId, onUpdate]);
};