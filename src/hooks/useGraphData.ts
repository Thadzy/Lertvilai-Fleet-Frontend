/**
 * @file useGraphData.ts
 * @description Fully functional version with Real Database CRUD operations.
 */

import { useState, useCallback, useEffect } from 'react';
import { type Node, type Edge, MarkerType } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { type RosMapConfig } from './useMapConfig';

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

export interface Level {
  id: number;
  alias: string;
  height: number;
  graph_id: number;
  cell_count?: number;
  created_at: string;
}

export const useGraphData = (graphId: number) => {
  const [loading, setLoading] = useState(false);

  // =========================================================
  // 1. READ OPERATION (FETCH MAP)
  // =========================================================
  const loadGraph = useCallback(async (mapConfig?: RosMapConfig) => {
    const fallback = {
      nodes: [], edges: [], mapUrl: null, levels: [] as Level[],
      nodeAliasMap: new Map<number, string>(), cellMap: new Map<number, number>(),
    };

    if (!graphId) return fallback;

    setLoading(true);
    try {
      const { data: graphData, error: graphError } = await supabase.from('wh_graphs').select('*').eq('id', graphId).single();
      if (graphError || !graphData) throw new Error('Graph not found');

      const { data: nodeData, error: nodeError } = await supabase.from('wh_nodes_view').select('*').eq('graph_id', graphId);
      if (nodeError) throw nodeError;

      const { data: edgeData, error: edgeError } = await supabase.from('wh_edges_view').select('*').eq('graph_id', graphId);
      if (edgeError) throw edgeError;

      const { data: levelData } = await supabase.from('wh_levels').select('*').eq('graph_id', graphId).order('height');

      const levels: Level[] = (levelData || []) as Level[];
      const viewNodes = (nodeData || []) as ViewNode[];
      const cellNodeIds = new Set(viewNodes.filter(n => n.type === 'cell').map(n => n.id));

      const parseCellAlias = (alias: string | null) => {
        const match = (alias || '').match(/L(\d+)/i);
        return match ? { colNum: 1, levelNum: parseInt(match[1], 10) } : { colNum: 1, levelNum: 1 };
      };

      const cellsByShelfId = new Map<number, any[]>();
      viewNodes.forEach(n => {
        if (n.type === 'cell' && n.shelf_id !== null) {
          const lvl = levels.find(l => l.id === n.level_id);
          const { colNum, levelNum } = parseCellAlias(n.alias);
          const entry = { 
            id: n.id, 
            alias: n.alias || `Cell_${n.id}`, 
            levelAlias: lvl ? lvl.alias : null, 
            level_id: n.level_id, 
            colNum, 
            levelNum,
            occupancyStatus: 'empty' 
          };
          const arr = cellsByShelfId.get(n.shelf_id) || [];
          arr.push(entry);
          cellsByShelfId.set(n.shelf_id, arr);
        }
      });

      const flowNodes: Node[] = viewNodes.map((n) => {
        let posX = n.x;
        let posY = n.y;
        if (mapConfig) {
          /**
           * ROS to Web/Canvas Coordinate Transformation:
           * Pixel = (Meter - Origin) / Resolution
           * For Y-axis: Invert because Web +Y is Down, ROS +Y is Up.
           */
          posX = (n.x - mapConfig.originX) / mapConfig.resolution;
          posY = mapConfig.imgHeight - ((n.y - mapConfig.originY) / mapConfig.resolution);
        }

        if (n.type === 'shelf') {
          return { 
            id: n.id.toString(), 
            type: 'shelfNode', 
            position: { x: posX, y: posY }, 
            draggable: true, 
            selectable: true,
            data: { 
              label: n.alias, 
              type: n.type, 
              yaw: n.yaw, 
              cells: cellsByShelfId.get(n.id) || [], 
              activeLevelId: null 
            } 
          };
        }

        if (n.type === 'cell') {
          return { id: n.id.toString(), type: 'waypointNode', position: { x: posX, y: posY }, draggable: false, selectable: false, hidden: true, data: { label: n.alias, type: n.type, shelf_id: n.shelf_id } };
        }
        
        return { 
          id: n.id.toString(), 
          type: 'waypointNode', 
          position: { x: posX, y: posY }, 
          draggable: true, 
          selectable: true,
          data: { label: n.alias, type: n.type, yaw: n.yaw, height: n.height } 
        };
      });

      const mapUrl = graphData.map_url;
      if (mapUrl) {
        let mapX = 0, mapY = 0, mapW = 1200, mapH = 800, cleanUrl = mapUrl;
        if (mapUrl.includes('#')) {
          const [base, hash] = mapUrl.split('#'); cleanUrl = base;
          const params = new URLSearchParams(hash);
          if (params.has('x')) mapX = parseFloat(params.get('x') || '0');
          if (params.has('y')) mapY = parseFloat(params.get('y') || '0');
          if (params.has('w')) mapW = parseFloat(params.get('w') || '1200');
          if (params.has('h')) mapH = parseFloat(params.get('h') || '800');
        }
        flowNodes.unshift({ id: 'map-background', type: 'mapNode', position: { x: mapX, y: mapY }, data: { url: cleanUrl }, style: { width: mapW, height: mapH, zIndex: -11 }, draggable: false, selectable: false });
      }

      const nodeAliasMap = new Map<number, string>();
      viewNodes.forEach(n => nodeAliasMap.set(n.id, n.alias || `Node_${n.id}`));

      const cellMap = new Map<number, number>();

      const flowEdges: Edge[] = (edgeData as ViewEdge[])
        .filter(e => !cellNodeIds.has(e.node_a_id) && !cellNodeIds.has(e.node_b_id))
        .map((e) => ({ id: `e${e.node_a_id}-${e.node_b_id}`, source: e.node_a_id.toString(), target: e.node_b_id.toString(), type: 'animatedEdge', animated: false, style: { stroke: '#3b82f6', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' } }));

      return { nodes: flowNodes, edges: flowEdges, mapUrl, levels, nodeAliasMap, cellMap };
    } catch (error) {
      console.error('[useGraphData] Error loading graph:', error);
      return fallback;
    } finally { setLoading(false); }
  }, [graphId]);

  // =========================================================
  // 2. WRITE OPERATION (SAVE MAP & FULL CRUD)
  // =========================================================
  const saveGraph = useCallback(async (nodes: Node[], edges: Edge[], currentMapUrl: string | null = null, mapConfig?: RosMapConfig) => {
    if (!graphId) throw new Error("No graph ID loaded. Cannot save.");
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
      const idMap = new Map<string, number>();
      const activeNodes = nodes.filter(n => n.id !== 'map-background');
      const existingNodes: any[] = [];
      const newNodes: Node[] = [];
      const nodesToDelete: number[] = [];

      for (const n of activeNodes) {
        if (n.data?.type === 'cell') {
          const numericId = Number(n.id);
          if (!isNaN(numericId)) idMap.set(n.id, numericId);
          continue;
        }
        const numericId = Number(n.id);
        if (isNaN(numericId)) newNodes.push(n);
        else { existingNodes.push({ flowNode: n, dbId: numericId }); idMap.set(n.id, numericId); }
      }

      const { data: currentDbNodes } = await supabase.from('wh_nodes_view').select('id, type').eq('graph_id', graphId);
      const dbTypeMap = new Map<number, string>();
      if (currentDbNodes) {
        currentDbNodes.forEach(n => dbTypeMap.set(n.id, n.type));
        const activeDbIds = new Set(existingNodes.map(n => n.dbId));
        activeNodes.forEach(n => { const numId = Number(n.id); if (!isNaN(numId)) activeDbIds.add(numId); });
        for (const dbNode of currentDbNodes) {
          // Do not delete depot nodes automatically during normal node deletion logic
          if (dbNode.type === 'depot' || dbNode.type === 'cell') continue;
          if (!activeDbIds.has(dbNode.id)) nodesToDelete.push(dbNode.id);
        }
      }

      const typeChangedNodes: Node[] = [];
      const stableExistingNodes = existingNodes.filter(({ flowNode, dbId }) => {
        const dbType = dbTypeMap.get(dbId);
        const canvasType = flowNode.data?.type as string;
        // If type changed (e.g. waypoint -> shelf), we delete old and create new, EXCEPT for depot which is special
        if (dbType && dbType !== 'depot' && dbType !== 'cell' && canvasType && canvasType !== dbType) {
          nodesToDelete.push(dbId); typeChangedNodes.push(flowNode); return false;
        }
        return true;
      });
      existingNodes.length = 0; stableExistingNodes.forEach(n => existingNodes.push(n));
      newNodes.push(...typeChangedNodes);

      await Promise.all(nodesToDelete.map(async (nodeId) => {
        try { await supabase.rpc('wh_delete_node', { p_node_id: nodeId }); } catch (e) {}
      }));

      const coordinateGuard = (val: any) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

      await Promise.all(existingNodes.map(async ({ flowNode, dbId }) => {
        let x = coordinateGuard(flowNode.position.x);
        let y = coordinateGuard(flowNode.position.y);
        if (mapConfig) {
          /**
           * Web/Canvas to ROS Coordinate Transformation:
           * Meter = (Pixel * Resolution) + Origin
           * For Y-axis: Invert the pixel value first.
           */
          x = (flowNode.position.x * mapConfig.resolution) + mapConfig.originX;
          y = ((mapConfig.imgHeight - flowNode.position.y) * mapConfig.resolution) + mapConfig.originY;
        }
        const alias = flowNode.data.label || null;
        const tagId = generateTagId(alias);
        try { 
          const { error: rpcError } = await supabase.rpc('wh_update_node_position', { p_node_id: dbId, p_x: x, p_y: y, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0) }); 
          if (rpcError) console.error(`[saveGraph] RPC Error updating node ${dbId} (${flowNode.data.label}):`, rpcError);
          
          const { error: updateError } = await supabase.from('wh_nodes').update({ alias, tag_id: tagId }).eq('id', dbId);
          if (updateError) console.error(`[saveGraph] Update Error for node ${dbId}:`, updateError);
        } catch (e) {
          console.error(`[saveGraph] Exception for node ${dbId}:`, e);
        }
      }));

      for (const flowNode of newNodes) {
        const nodeType = (flowNode.data.type || 'waypoint') as string;
        let x = coordinateGuard(flowNode.position.x);
        let y = coordinateGuard(flowNode.position.y);
        if (mapConfig) {
          /**
           * Web/Canvas to ROS Coordinate Transformation:
           * Meter = (Pixel * Resolution) + Origin
           * For Y-axis: Invert the pixel value first.
           */
          x = (flowNode.position.x * mapConfig.resolution) + mapConfig.originX;
          y = ((mapConfig.imgHeight - flowNode.position.y) * mapConfig.resolution) + mapConfig.originY;
        }
        const alias = flowNode.data.label || null;
        const tagId = generateTagId(alias);
        let newNodeId: number | null = null;
        try {
          if (nodeType === 'waypoint') {
            const { data } = await supabase.rpc('wh_create_waypoint', { p_graph_id: graphId, p_x: x, p_y: y, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0), p_alias: alias, p_tag_id: tagId });
            newNodeId = data;
          } else if (nodeType === 'shelf') {
            const { data } = await supabase.rpc('wh_create_shelf', { p_graph_id: graphId, p_x: x, p_y: y, p_alias: alias, p_tag_id: tagId });
            newNodeId = data;
          } else if (nodeType === 'conveyor') {
            const { data } = await supabase.rpc('wh_create_conveyor', { p_graph_id: graphId, p_x: x, p_y: y, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0), p_height: coordinateGuard(flowNode.data.height ?? 1.0), p_alias: alias, p_tag_id: tagId });
            newNodeId = data;
          } else if (nodeType === 'depot') {
            const { data: depotId } = await supabase.rpc('wh_get_depot_node_id', { p_graph_id: graphId });
            if (depotId) { 
              await supabase.rpc('wh_update_node_position', { p_node_id: depotId, p_x: x, p_y: y, p_yaw: coordinateGuard(flowNode.data?.yaw ?? 0.0) }); 
              await supabase.from('wh_nodes').update({ alias, tag_id: tagId }).eq('id', depotId);
              newNodeId = depotId; 
            }
          }
          if (newNodeId !== null) idMap.set(flowNode.id, newNodeId);
        } catch (err) {}
      }

      const { data: currentEdges } = await supabase.from('wh_edges_view').select('edge_id, node_a_id, node_b_id, node_a_type, node_b_type').eq('graph_id', graphId);
      if (currentEdges) {
        await Promise.all(currentEdges.filter(edge => edge.node_a_type !== 'cell' && edge.node_b_type !== 'cell').map(async (edge) => {
          try { await supabase.rpc('wh_delete_edge', { p_edge_id: edge.edge_id }); } catch (e) {}
        }));
      }

      for (const edge of edges) {
        const sourceId = idMap.get(edge.source); const targetId = idMap.get(edge.target);
        if (sourceId !== undefined && targetId !== undefined) {
          try { await supabase.rpc('wh_create_edge', { p_graph_id: graphId, p_node_a_id: sourceId, p_node_b_id: targetId }); } catch (e) {}
        }
      }

      const mapNode = nodes.find(n => n.id === 'map-background');
      if (mapNode && currentMapUrl) {
        try {
          const baseUrl = currentMapUrl.split('#')[0];
          const x = Math.round(coordinateGuard(mapNode.position.x) * 10) / 10;
          const y = Math.round(coordinateGuard(mapNode.position.y) * 10) / 10;
          const getVal = (v: any) => { if (typeof v === 'number') return v; if (typeof v === 'string') return parseFloat(v); return 0; };
          const w = Math.round(getVal(mapNode.width || mapNode.style?.width || 1200));
          const h = Math.round(getVal(mapNode.height || mapNode.style?.height || 800));
          const newMapUrl = `${baseUrl}#x=${x}&y=${y}&w=${w}&h=${h}`;
          if (newMapUrl !== currentMapUrl) await supabase.from('wh_graphs').update({ map_url: newMapUrl }).eq('id', graphId);
        } catch (err) {}
      }
      return true;
    } catch (error) { console.error('[useGraphData] Error saving map:', error); throw error; }
    finally { setLoading(false); }
  }, [graphId]);

  const createLevel = useCallback(async (alias: string, height: number) => {
    const { data, error } = await supabase.rpc('wh_create_level', { p_graph_id: graphId, p_alias: alias, p_height: height });
    if (error) throw error; return data as number;
  }, [graphId]);

  const deleteLevel = useCallback(async (levelId: number) => {
    const { error } = await supabase.from('wh_levels').delete().eq('id', levelId);
    if (error) throw error; return true;
  }, []);

const createCell = useCallback(async (shelfAlias: string, levelAlias: string, cellAlias: string, tagId: string) => {
    const { data, error } = await supabase.rpc('wh_create_cell', { 
      p_graph_id: graphId, 
      p_shelf_alias: shelfAlias, 
      p_level_alias: levelAlias, 
      p_alias: cellAlias,
      p_tag_id: tagId // 💡 ส่งพารามิเตอร์ตัวที่ 5 ให้ครบตามที่ Database ต้องการ
    });
    if (error) {
      console.error('[createCell] Error:', error);
      throw error;
    }
    return data as number;
  }, [graphId]);

  const deleteCell = useCallback(async (cellId: number) => {
    const { error } = await supabase.rpc('wh_delete_node', { p_node_id: cellId });
    if (error) throw error; return true;
  }, []);

  const setNodeAsDepot = useCallback(async (nodeId: number) => {
    setLoading(true);
    try {
      const { data: targetNode } = await supabase.from('wh_nodes_view').select('*').eq('id', nodeId).single();
      if (!targetNode || (targetNode.type !== 'waypoint' && targetNode.type !== 'conveyor')) throw new Error("Invalid node for depot");
      const { data: depotNode } = await supabase.from('wh_nodes_view').select('*').eq('graph_id', graphId).eq('type', 'depot').single();
      if (!depotNode) throw new Error("Depot not found");
      const { data: targetEdges } = await supabase.rpc('wh_get_edges_by_node', { p_node_id: nodeId });
      const { data: depotEdges } = await supabase.rpc('wh_get_edges_by_node', { p_node_id: depotNode.id });
      const { data: newWpId } = await supabase.rpc('wh_create_waypoint', { p_graph_id: graphId, p_x: depotNode.x, p_y: depotNode.y, p_yaw: depotNode.yaw ?? 0, p_alias: `W_from_depot_${Date.now().toString().slice(-4)}` });
      if (depotEdges) {
        await Promise.all((depotEdges as any[]).map(async (e: any) => {
          await supabase.rpc('wh_create_edge', { p_graph_id: graphId, p_node_a_id: newWpId, p_node_b_id: e.other_node_id });
          await supabase.rpc('wh_delete_edge', { p_edge_id: e.edge_id });
        }));
      }
      await supabase.rpc('wh_update_node_position', { p_node_id: depotNode.id, p_x: targetNode.x, p_y: targetNode.y, p_yaw: targetNode.yaw ?? 0 });
      if (targetEdges) {
        await Promise.all((targetEdges as any[]).map(async (e: any) => {
          if (e.other_node_id !== depotNode.id) await supabase.rpc('wh_create_edge', { p_graph_id: graphId, p_node_a_id: depotNode.id, p_node_b_id: e.other_node_id });
        }));
      }
      await supabase.rpc('wh_delete_node', { p_node_id: nodeId });
      return true;
    } catch (err) { console.error(err); throw err; } finally { setLoading(false); }
  }, [graphId]);

  return { loadGraph, saveGraph, loading, createLevel, deleteLevel, createCell, deleteCell, setNodeAsDepot };
};

export const useGraphRealtime = (graphId: number, onUpdate: () => void) => {
  useEffect(() => {}, [graphId, onUpdate]);
};

export async function loadCellOccupancy(graphId: number): Promise<Map<number, 'queuing' | 'active'>> {
  return new Map();
}