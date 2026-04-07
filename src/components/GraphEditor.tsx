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
      className="absolute pointer-events-none flex items-center justify-center z-50"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="w-6 h-[2px] bg-blue-500 absolute" />
      <div className="h-6 w-[2px] bg-blue-500 absolute" />
      <span className="mt-8 text-[10px] font-bold text-blue-500 bg-white/50 dark:bg-black/50 px-1 rounded backdrop-blur-sm">
        ORIGIN (0,0)
      </span>
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
    const newNode: Node = {
      id,
      type: rfType,
      position: position || { x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 },
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

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-[#09090b] text-gray-900 dark:text-white relative font-sans">
      <ReactFlow
        nodes={nodes} edges={edges}
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
