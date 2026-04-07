import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  Panel,
  MarkerType,
  BackgroundVariant,
  type NodeProps,
  ConnectionLineType,
  type Node,
} from 'reactflow';

import 'reactflow/dist/style.css';
import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';
import { LayoutGrid } from 'lucide-react';

import { useGraphData, useGraphRealtime, loadCellOccupancy, type Level } from '../hooks/useGraphData';
import { useMapConfig, type RosMapConfig } from '../hooks/useMapConfig';
import { convertPgmToPng, getImageDimensions } from '../utils/pgmConverter';
import { supabase } from '../lib/supabaseClient';
import { useThemeStore } from '../store/themeStore';
import { useGraphStore } from '../store/graphStore';
import WaypointNode from './nodes/WaypointNode';
import ShelfNode from './nodes/ShelfNode';
import AnimatedEdge from './edges/AnimatedEdge';

// Sub-components
import { Toolbar } from './graph-editor/Toolbar';
import { Sidebar } from './graph-editor/Sidebar';
import { MapConfigPanel } from './graph-editor/MapConfigPanel';
import { LevelSelector, StatusPanel } from './graph-editor/StatusPanel';

const SCALE_FACTOR = 100;

// --- CENTRALIZED NODE COMPONENTS ---

const MapNode = ({ data, selected }: NodeProps) => {
  return (
    <>
      <NodeResizer color="#3b82f6" isVisible={selected} minWidth={100} minHeight={100} />
      <img
        src={data.url}
        alt="Map Background"
        style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        draggable={false}
      />
    </>
  );
};

const OriginMarker = ({ config }: { config: RosMapConfig }) => {
  // x = (0 - originX) * SCALE_FACTOR
  // y = imgHeight - (0 - originY) * SCALE_FACTOR
  const x = -config.originX * SCALE_FACTOR;
  const y = config.imgHeight + (config.originY * SCALE_FACTOR);

  return (
    <div 
      className="absolute pointer-events-none z-50"
      style={{ left: x, top: y }}
    >
      <svg width="100" height="100" viewBox="-10 -10 110 110" className="overflow-visible drop-shadow-sm">
        <defs>
          <marker id="arrowhead-x" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
          <marker id="arrowhead-y" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
          </marker>
        </defs>
        
        {/* X Axis (+X points RIGHT) */}
        <line x1="0" y1="0" x2="50" y2="0" stroke="#3b82f6" strokeWidth="2.5" markerEnd="url(#arrowhead-x)" />
        <text x="55" y="4" fill="#3b82f6" fontSize="11" fontWeight="900" fontFamily="monospace">+X</text>
        
        {/* Y Axis (+Y points UP on screen because ROS Y is inverted to Canvas Y) */}
        <line x1="0" y1="0" x2="0" y2="-50" stroke="#10b981" strokeWidth="2.5" markerEnd="url(#arrowhead-y)" />
        <text x="-8" y="-58" fill="#10b981" fontSize="11" fontWeight="900" fontFamily="monospace">+Y</text>
        
        {/* Origin Center Point */}
        <circle cx="0" cy="0" r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
      </svg>
      <div className="absolute top-0 left-0 -translate-x-1/2 translate-y-2 whitespace-nowrap">
        <span className="text-[10px] font-black text-slate-500 bg-white/80 dark:bg-black/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10 backdrop-blur-sm">
          ORIGIN (0,0)
        </span>
      </div>
    </div>
  );
};

const nodeTypes = { waypointNode: WaypointNode, shelfNode: ShelfNode, mapNode: MapNode };
const edgeTypes = { animatedEdge: AnimatedEdge };

// --- MAIN COMPONENT ---
const GraphEditor: React.FC<{ graphId: number; visualizedPath?: string[] }> = ({ graphId, visualizedPath = [] }) => {
  const { theme } = useThemeStore();
  const reactFlowInstance = useReactFlow();
  const { 
    nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange, 
    onConnect, takeSnapshot, undo, redo, snapToGrid, isDirty, setDirty, resetGraph 
  } = useGraphStore();

  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [mapLocked, setMapLocked] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toolMode, setToolMode] = useState<'move' | 'connect' | 'select'>('move');
  
  // Level & Shelf State
  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [showLevelManager, setShowLevelManager] = useState(false);
  const [newLevelAlias, setNewLevelAlias] = useState('');
  const [newLevelHeight, setNewLevelHeight] = useState('0');
  const [shelfCells, setShelfCells] = useState<any[]>([]);
  const [newCellLevel, setNewCellLevel] = useState('');
  const [newCellCol, setNewCellCol] = useState('1');

  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'success' | 'error' | 'info' }[]>([]);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const { loadGraph, saveGraph, loading, createLevel, deleteLevel, createCell, deleteCell, setNodeAsDepot } = useGraphData(graphId);
  const { config: mapConfig, updateConfig: updateMapConfig, configLoading } = useMapConfig(graphId);

  // --- DRAFTING & AUTO-SAVE ---
  const draftKey = `wcs_graph_draft_${graphId}`;

  // Clear any stale draft on mount — drafts are noise on reload
  useEffect(() => {
    localStorage.removeItem(draftKey);
  }, [graphId]);

  // Save draft when dirty
  useEffect(() => {
    if (isDirty && nodes.length > 0) {
      localStorage.setItem(draftKey, JSON.stringify({ nodes, edges }));
    }
  }, [nodes, edges, isDirty]);

  // Clear draft on save
  const clearDraft = () => localStorage.removeItem(draftKey);

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmd = isMac ? e.metaKey : e.ctrlKey;

      if (cmd && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((cmd && e.key === 'z' && e.shiftKey) || (cmd && e.key === 'y')) { e.preventDefault(); redo(); }
      if (cmd && e.key === 's') { e.preventDefault(); handleSave(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'SELECT') {
          handleDelete();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, nodes, edges]);

  // --- HANDLERS ---
  const handleSave = async () => {
    if (configLoading) return;
    try {
      const success = await saveGraph(nodes, edges, bgUrl, mapConfig);
      if (success) {
        setDirty(false);
        clearDraft();
        showToast('Graph configuration saved successfully', 'success');
        await handleDataUpdate();
      }
    } catch (err) {
      showToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleDelete = useCallback(() => {
    takeSnapshot();
    setNodes((nds) => nds.filter((node) => !node.selected || node.data?.type === 'depot' || node.data?.type === 'cell'));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, [setNodes, setEdges, takeSnapshot]);

  const addNode = (type: 'waypoint' | 'conveyor' | 'shelf' = 'waypoint', position?: { x: number; y: number }) => {
    takeSnapshot();
    const id = `temp_${Date.now()}`;
    const prefixMap = { waypoint: 'W', conveyor: 'C', shelf: 'S' };
    const rfType = type === 'shelf' ? 'shelfNode' : 'waypointNode';
    
    // Cascading offset: move new nodes 20px further for each existing node to prevent perfect stacking
    const cascadeOffset = nodes.filter(n => n.id !== 'map-background').length * 20;
    
    const newNode: Node = {
      id,
      type: rfType,
      position: position || { x: 100 + cascadeOffset, y: 100 + cascadeOffset },
      data: {
        label: `${prefixMap[type]}_${nodes.filter(n => n.data?.type === type).length + 1}`,
        type,
        height: type === 'conveyor' ? 1.0 : undefined,
        ...(type === 'shelf' ? { cells: [], activeLevelId: selectedLevel } : {}),
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const type = event.dataTransfer.getData('application/reactflow');
    if (typeof type === 'undefined' || !type) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    addNode(type as 'waypoint' | 'conveyor' | 'shelf', position);
  }, [reactFlowInstance, addNode]);

  const handleUpdateNode = (key: string, value: any) => {
    takeSnapshot();
    setNodes((nds) => nds.map((node) => node.selected ? { ...node, data: { ...node.data, [key]: value } } : node));
  };

  const handleSetAsDepot = async (nodeId: number, label: string) => {
    if (window.confirm(`Set "${label}" as the depot? Current depot will be swapped to waypoint.`)) {
      takeSnapshot();
      try {
        const success = await setNodeAsDepot(nodeId);
        if (success) {
          showToast('Depot swapped successfully', 'success');
          await handleDataUpdate();
        }
      } catch (err: any) {
        showToast(`Failed to swap: ${err.message}`, 'error');
      }
    }
  };

  // --- DATA SYNC ---
  const handleDataUpdate = useCallback(async () => {
    const { nodes: dbNodes, edges: dbEdges, levels: dbLevels, mapUrl } = await loadGraph(mapConfig);
    resetGraph(
      dbNodes.map(n => n.id === 'map-background' ? { ...n, draggable: !mapLocked, selectable: !mapLocked } : n),
      dbEdges
    );
    setLevels(dbLevels);
    setBgUrl(mapUrl || null);
  }, [loadGraph, mapLocked, resetGraph, mapConfig]);

  // --- MAP UPLOAD ---
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setUploading(true);

    try {
      let uploadBlob: Blob;
      let imgPixelWidth: number;
      let imgPixelHeight: number;

      const isPgm = file.name.toLowerCase().endsWith('.pgm');

      if (isPgm) {
        const result = await convertPgmToPng(file);
        uploadBlob     = result.blob;
        imgPixelWidth  = result.width;
        imgPixelHeight = result.height;
      } else {
        const dims     = await getImageDimensions(file);
        uploadBlob     = file;
        imgPixelWidth  = dims.width;
        imgPixelHeight = dims.height;
      }

      const res = mapConfig.resolution;
      const rfW = Math.round(imgPixelWidth  * res * SCALE_FACTOR);
      const rfH = Math.round(imgPixelHeight * res * SCALE_FACTOR);

      const ext      = isPgm ? 'png' : (file.name.split('.').pop() ?? 'png');
      const fileName = `map_${graphId}_${Date.now()}.${ext}`;

      const { data: { publicUrl } } = supabase.storage.from('maps').getPublicUrl(fileName);

      const { error: uploadError } = await supabase.storage
        .from('maps')
        .upload(fileName, uploadBlob, { contentType: isPgm ? 'image/png' : file.type });

      if (uploadError) throw uploadError;

      const newMapUrl = `${publicUrl}#x=0&y=0&w=${rfW}&h=${rfH}`;

      const { error: updateError } = await supabase
        .from('wh_graphs')
        .update({ map_url: newMapUrl })
        .eq('id', graphId);

      if (updateError) throw updateError;

      await updateMapConfig({ imgHeight: rfH });

      setBgUrl(publicUrl);
      await handleDataUpdate();
      showToast('Map uploaded successfully', 'success');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Upload failed: ${msg}`, 'error');
      console.error('[GraphEditor] Upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [graphId, mapConfig.resolution, updateMapConfig, handleDataUpdate, showToast]);

  useEffect(() => { 
    if (!configLoading) handleDataUpdate(); 
  }, [graphId, configLoading]);

  useGraphRealtime(graphId, handleDataUpdate);

  const selectedNode = useMemo(() => nodes.find(n => n.selected), [nodes]);

  useEffect(() => {
    if (selectedNode?.data?.type === 'shelf') {
      const shelfId = Number(selectedNode.id);
      setShelfCells(nodes.filter(n => n.data?.type === 'cell' && n.data?.shelf_id === shelfId).map(n => ({
        id: Number(n.id), alias: n.data.label, levelAlias: n.data.levelAlias, level_id: n.data.level_id
      })));
    }
  }, [selectedNode, nodes]);

  // Dynamic zIndex management: bring selected nodes to the absolute front (1000)
  const processedNodes = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      zIndex: node.selected ? 1000 : (node.id === 'map-background' ? -11 : 0)
    }));
  }, [nodes]);

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-[#09090b] text-gray-900 dark:text-white relative font-sans">
      <ReactFlow
        nodes={processedNodes} edges={edges}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={() => takeSnapshot()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        snapToGrid={snapToGrid} snapGrid={[10, 10]}
        fitView minZoom={0.1} maxZoom={4}
        nodesDraggable={toolMode === 'move'} nodesConnectable={toolMode === 'connect'}
        panOnDrag={toolMode === 'move'} selectionOnDrag={toolMode === 'select'}
        onPaneClick={() => setNodes(nds => nds.map(n => ({ ...n, selected: false })))}
      >
        <Background color={theme === 'dark' ? '#1e293b' : '#cbd5e1'} gap={20} size={1} variant={BackgroundVariant.Dots} />

        {/* Origin Marker */}
        {!configLoading && <OriginMarker config={mapConfig} />}
        <Panel position="top-left" className="m-4 flex flex-col gap-2">
          <div className="bg-white/90 dark:bg-[#121214]/90 backdrop-blur border border-gray-200 dark:border-white/10 shadow-sm px-4 py-3 rounded-xl flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600">
              <LayoutGrid size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">Map Designer</h2>
              <p className="text-[10px] text-slate-500 font-mono uppercase">Graph ID: #{graphId}</p>
            </div>
          </div>
          
          <MapConfigPanel
            config={mapConfig}
            updateConfig={updateMapConfig}
            loading={configLoading}
          />

          <LevelSelector
            levels={levels} selectedLevel={selectedLevel}
            onLevelSelect={(id) => {
              setSelectedLevel(id);
              setNodes(nds => nds.map(n => n.data?.type === 'shelf' ? { ...n, data: { ...n.data, activeLevelId: id } } : n));
            }}
            showManager={showLevelManager} setShowManager={setShowLevelManager}
            newLevelAlias={newLevelAlias} setNewLevelAlias={setNewLevelAlias}
            newLevelHeight={newLevelHeight} setNewLevelHeight={setNewLevelHeight}
            onCreateLevel={async () => {
              const id = await createLevel(newLevelAlias, parseFloat(newLevelHeight));
              if (id) { handleDataUpdate(); setNewLevelAlias(''); }
            }}
            onDeleteLevel={async (id) => { if (await deleteLevel(id)) handleDataUpdate(); }}
          />
        </Panel>

        <Panel position="top-right" className="m-4 flex flex-col gap-2 items-end">
          <Toolbar 
            toolMode={toolMode} setToolMode={setToolMode}
            mapLocked={mapLocked} onMapLockToggle={() => {
              setMapLocked(!mapLocked);
              setNodes(nds => nds.map(n => n.id === 'map-background' ? { ...n, draggable: mapLocked, selectable: mapLocked } : n));
            }}
            bgUrl={bgUrl} onFileUpload={handleFileUpload}
            onRemoveBackground={async () => {
              await supabase.from('wh_graphs').update({ map_url: null }).eq('id', graphId);
              setBgUrl(null);
            }}
            onAddNode={addNode} onDeleteSelected={handleDelete}
            onReload={handleDataUpdate} onSave={handleSave}
            loading={loading} undoDisabled={false} redoDisabled={false}
          />
          
          <Sidebar
            selectedNode={selectedNode || null}
            onUpdateNode={handleUpdateNode}
            onSetAsDepot={handleSetAsDepot}
            levels={levels} shelfCells={shelfCells}
            onDeleteCell={async (id) => { if (await deleteCell(id)) handleDataUpdate(); }}
            newCellCol={newCellCol} setNewCellCol={setNewCellCol}
            newCellLevel={newCellLevel} setNewCellLevel={setNewCellLevel}
            onCreateCell={async () => {
              const shelfAlias = selectedNode?.data.label;
              const levelAlias = levels.find(l => l.id === Number(newCellLevel))?.alias;
              if (shelfAlias && levelAlias) {
                await createCell(shelfAlias, levelAlias, `S${shelfAlias.match(/\d+/)}C${newCellCol}L${levelAlias.match(/\d+/)}`);
                handleDataUpdate();
              }
            }}
            mapConfig={mapConfig}
          />
        </Panel>

        <Panel position="bottom-center" className="mb-2">
          <StatusPanel 
            toolMode={toolMode} nodeCount={nodes.length - (bgUrl ? 1 : 0)}
            edgeCount={edges.length} selectedLevelAlias={levels.find(l => l.id === selectedLevel)?.alias || null}
            isDirty={isDirty}
          />
        </Panel>

        <Controls />
        <MiniMap position="bottom-left" className="!bg-gray-100 dark:bg-white/5 border border-slate-300 rounded-lg" />
      </ReactFlow>

      {/* Toasts */}
      <div className="fixed bottom-12 right-4 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-lg animate-in slide-in-from-right-4 ${t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GraphEditor;
