import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search,
  Clock, HardDrive,
  Truck, Activity,
  Boxes, ChevronRight,
  MoreVertical, Edit3, Trash2
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import type { DBGraph, DBNode, DBEdge, DBRobot } from '../types/database';
import ThemeToggle from './ThemeToggle';
import SystemStatusPanel from './SystemStatusPanel';

// ============================================
// UTILITIES
// ============================================

/**
 * Returns a human-readable "time ago" string.
 * @param {string} dateString - ISO date string from database.
 * @returns {string} - e.g., "2 days ago", "just now".
 */
const getTimeAgo = (dateString: string): string => {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
};

// ============================================
// SUB-COMPONENT: LIVE GRAPH PREVIEW
// ============================================

/**
 * GraphPreview Component
 * @description Renders a simplified SVG visualization of a warehouse graph's nodes and edges.
 * 
 * @param {number} graphId - The ID of the warehouse graph to preview.
 * @param {string | null} bgUrl - Optional background image URL.
 */
const GraphPreview: React.FC<{ graphId: number, bgUrl: string | null }> = ({ graphId, bgUrl }) => {
  const [nodes, setNodes] = useState<DBNode[]>([]);
  const [edges, setEdges] = useState<DBEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: nData } = await supabase.from('wh_nodes_view').select('id, x, y, type').eq('graph_id', graphId);
      const { data: eData } = await supabase.from('wh_edges_view').select('node_a_id, node_b_id').eq('graph_id', graphId);

      if (nData) setNodes(nData as DBNode[]);
      if (eData) setEdges(eData as DBEdge[]);
      setLoading(false);
    };
    fetchData();
  }, [graphId]);

  const viewBox = useMemo(() => {
    if (nodes.length === 0) return "0 0 800 600";
    const xs = nodes.map(n => n.x * 100);
    const ys = nodes.map(n => n.y * 100);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 100);
    const height = Math.max(maxY - minY, 100);
    const padding = 100;
    return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
  }, [nodes]);

  const getNode = (id: number) => nodes.find(n => n.id === id);

  if (loading) return <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 animate-pulse rounded-2xl" />;

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-50 dark:bg-zinc-900">
      {bgUrl && (
        <img
          src={bgUrl}
          alt="Map Background"
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-[1px]"
        />
      )}
      <svg
        viewBox={viewBox}
        className="w-full h-full absolute inset-0 pointer-events-none"
        preserveAspectRatio="xMidYMid meet"
      >
        {edges.map((e, i) => {
          const nA = getNode(e.node_a_id);
          const nB = getNode(e.node_b_id);
          if (!nA || !nB) return null;
          return (
            <line
              key={i}
              x1={nA.x * 100} y1={nA.y * 100}
              x2={nB.x * 100} y2={nB.y * 100}
              stroke="#3b82f6"
              strokeWidth="4"
              opacity={0.4}
            />
          );
        })}
        {nodes.map((n) => (
          <circle
            key={n.id}
            cx={n.x * 100}
            cy={n.y * 100}
            r={n.type === 'waypoint' ? 10 : 20}
            fill={n.type === 'waypoint' ? '#52525b' : n.type === 'shelf' ? '#06b6d4' : '#ef4444'}
          />
        ))}
      </svg>
    </div>
  );
};

// ============================================
// COMPONENT: STAT CARD
// ============================================

/**
 * StatCard Component
 * @description Displays a single metric or status indicator.
 */
const StatCard: React.FC<{
  title: string,
  value: string | number,
  icon: React.ReactNode,
  trend?: string,
  color?: 'blue' | 'emerald' | 'amber' | 'purple'
}> = ({ title, value, icon, trend, color = 'blue' }) => {

  const colorClasses = {
    blue: "text-blue-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    purple: "text-purple-500"
  };

  const selectedColor = colorClasses[color] || colorClasses.blue;

  return (
    <div className="bg-gray-50 dark:bg-zinc-900 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-blue-500/30 transition-all group relative overflow-hidden">
      <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${selectedColor}`}>
        {React.cloneElement(icon as React.ReactElement<{ size: number }>, { size: 64 })}
      </div>
      <div className="flex flex-col gap-1 relative z-10">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm font-medium">
          {React.cloneElement(icon as React.ReactElement<{ size: number }>, { size: 16 })}
          {title}
        </div>
        <div className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{value}</div>
        {trend && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
            <Activity size={10} /> {trend}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT: DASHBOARD
// ============================================

interface GraphWithMetrics extends DBGraph {
  nodeCount: number;
  edgeCount: number;
}

/**
 * Dashboard Component
 * @description The landing page for the Fleet Management System. Provides a high-level
 * overview of warehouse assets and quick access to graph editors with full CRUD support.
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<GraphWithMetrics[]>([]);
  const [robots, setRobots] = useState<DBRobot[]>([]);
  const [activeRequestsCount, setActiveRequestsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  /**
   * Fetches all graphs along with their node and edge counts.
   */
  const fetchWarehouses = useCallback(async () => {
    try {
      const { data: gData, error } = await supabase.from('wh_graphs').select('*').order('id', { ascending: true });
      if (error) throw error;

      if (gData) {
        // Fetch metrics for each graph in parallel
        const enriched = await Promise.all((gData as DBGraph[]).map(async (wh) => {
          const { count: nodes } = await supabase.from('wh_nodes').select('*', { count: 'exact', head: true }).eq('graph_id', wh.id);
          const { count: edges } = await supabase.from('wh_edges').select('*', { count: 'exact', head: true }).eq('graph_id', wh.id);
          return {
            ...wh,
            nodeCount: nodes || 0,
            edgeCount: edges || 0
          };
        }));
        setWarehouses(enriched);
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching graphs:', err);
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        await fetchWarehouses();

        // Fetch Robots metadata
        try {
          const { data: rData } = await supabase.from('wh_robots').select('*');
          if (rData) setRobots(rData as DBRobot[]);
        } catch {
          console.warn('[Dashboard] wh_robots table not available');
        }

        // Fetch Requests Stats
        try {
          const { count } = await supabase
            .from('wh_requests')
            .select('*', { count: 'exact', head: true })
            .neq('status', 'completed')
            .neq('status', 'cancelled');
          if (count !== null) setActiveRequestsCount(count);
        } catch {
          console.warn('[Dashboard] wh_requests table not available');
        }

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [fetchWarehouses]);

  /**
   * Creates a new warehouse graph via RPC.
   */
  const handleCreateNew = async () => {
    const name = prompt("Enter new warehouse name:", `Warehouse ${warehouses.length + 1}`);
    if (!name) return;

    try {
      const { data: newGraphId, error } = await supabase.rpc('wh_create_graph', {
        p_name: name,
      });

      if (error) throw error;
      navigate(`/warehouse/${newGraphId}`);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      alert(`Failed to create warehouse: ${msg}`);
    }
  };

  /**
   * Renames an existing warehouse.
   */
  const handleRename = async (e: React.MouseEvent, id: number, currentName: string) => {
    e.stopPropagation();
    setActiveMenuId(null);
    const newName = prompt(`Rename "${currentName}" to:`, currentName);
    if (!newName || newName === currentName) return;

    try {
      const { error } = await supabase.from('wh_graphs').update({ name: newName }).eq('id', id);
      if (error) throw error;
      setWarehouses(prev => prev.map(w => w.id === id ? { ...w, name: newName } : w));
    } catch (err) {
      alert('Failed to rename warehouse. See console for details.');
      console.error(err);
    }
  };

  /**
   * Deletes a warehouse graph after confirmation.
   */
  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    setActiveMenuId(null);
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;

    try {
      // wh_delete_graph RPC should handle cascaded deletes for nodes/edges/etc.
      // If RPC doesn't exist, we use direct delete assuming DB cascade is enabled.
      const { error } = await supabase.from('wh_graphs').delete().eq('id', id);
      if (error) throw error;
      setWarehouses(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      alert('Failed to delete warehouse. Ensure it has no active dependencies.');
      console.error(err);
    }
  };

  const filteredWarehouses = warehouses.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeRobots = robots.filter(r => r.status !== 'offline' && r.status !== 'inactive').length;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-gray-900 dark:text-white font-sans flex flex-col selection:bg-blue-500/30">

      {/* TOPBAR / NAVBAR */}
      <div className="h-16 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-md border-b border-gray-200 dark:border-white/5 flex items-center justify-between px-8 sticky top-0 z-30">
        
        <div className="flex items-center gap-3">
          <img 
            src="/Logo.jpg" 
            alt="Lertvilai Logo" 
            className="h-8 w-auto object-contain rounded-md shadow-sm border border-gray-100 dark:border-white/10" 
          />
          <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />
          <div className="hidden sm:flex items-center text-xs font-medium text-gray-500">
            <span>Dashboard</span>
            <ChevronRight size={14} className="mx-1.5 opacity-50" />
            <span className="text-gray-900 dark:text-gray-200">Overview</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search warehouses..."
              className="bg-gray-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500/30 rounded-full py-1.5 pl-9 pr-4 text-xs outline-none transition-all w-48 text-gray-900 dark:text-gray-200 placeholder:text-gray-400 focus:w-64"
            />
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8" onClick={() => setActiveMenuId(null)}>
        <div className="max-w-[1600px] mx-auto space-y-8">

          {/* KPI METRICS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Total Warehouses"
              value={warehouses.length}
              icon={<HardDrive />}
              trend="Active"
            />
            <StatCard
              title="Active Robots"
              value={activeRobots}
              icon={<Truck />}
              color="emerald"
              trend={`${robots.length} Total Fleet`}
            />
            <StatCard
              title="Pending Orders"
              value={activeRequestsCount}
              icon={<Boxes />}
              color="amber"
              trend="Requires Attention"
            />
            <StatCard
              title="System Status"
              value="Online"
              icon={<Activity />}
              color="purple"
              trend="99.9% Uptime"
            />
          </div>

          <SystemStatusPanel />

          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-end border-b border-gray-100 dark:border-white/5 pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Warehouse Projects</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Design layouts and manage robotic infrastructure</p>
              </div>

              <button
                onClick={handleCreateNew}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/10 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus size={18} /> New Warehouse
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">

              {/* Action: Create New */}
              <div 
                onClick={handleCreateNew} 
                className="group cursor-pointer flex flex-col h-full"
              >
                <div className="flex-1 bg-gray-50 dark:bg-zinc-900/50 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 min-h-[220px] transition-all group-hover:bg-gray-100 dark:group-hover:bg-zinc-900 group-hover:border-blue-500/30 group-hover:shadow-md">
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-zinc-800 group-hover:bg-blue-500/10 group-hover:text-blue-500 flex items-center justify-center transition-all text-gray-400 shadow-sm border border-gray-100 dark:border-white/5">
                    <Plus size={24} />
                  </div>
                  <span className="text-sm font-semibold text-gray-400 group-hover:text-blue-500">Create New Project</span>
                </div>
              </div>

              {/* Project Cards */}
              {loading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-gray-100 dark:bg-zinc-900 rounded-2xl h-[220px] w-full mb-3" />
                    <div className="h-4 bg-gray-100 dark:bg-zinc-900 rounded w-2/3 mb-2" />
                    <div className="h-3 bg-gray-50 dark:bg-zinc-900/50 rounded w-1/2" />
                  </div>
                ))
              ) : (
                filteredWarehouses.map((wh) => (
                  <div
                    key={wh.id}
                    onClick={() => navigate(`/warehouse/${wh.id}`)}
                    className="group cursor-pointer flex flex-col gap-3 relative"
                  >
                    {/* Visual Preview */}
                    <div className="relative aspect-[4/3] bg-gray-100 dark:bg-zinc-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 transition-all group-hover:ring-2 group-hover:ring-blue-500/40 group-hover:shadow-xl group-hover:-translate-y-1">
                      <GraphPreview graphId={wh.id} bgUrl={wh.map_url} />

                      {/* Interaction Overlay */}
                      <div className="absolute inset-0 bg-zinc-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-[1px]">
                        <span className="bg-white text-zinc-900 px-4 py-2 rounded-lg text-xs font-bold shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                          Open Editor
                        </span>
                      </div>
                    </div>

                    {/* Metadata Header */}
                    <div className="px-1 flex justify-between items-start">
                      <div className="overflow-hidden">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate group-hover:text-blue-500 transition-colors">
                          {wh.name}
                        </h3>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 font-medium mt-1">
                          <span className="flex items-center gap-1">
                            <Clock size={10} /> {getTimeAgo(wh.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Boxes size={10} /> {wh.nodeCount} n | {wh.edgeCount} e
                          </span>
                        </div>
                      </div>

                      {/* CRUD Actions Menu */}
                      <div className="relative">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === wh.id ? null : wh.id); }}
                          className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all"
                        >
                          <MoreVertical size={16} />
                        </button>
                        
                        {activeMenuId === wh.id && (
                          <div className="absolute right-0 bottom-full mb-2 w-32 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                            <button 
                              onClick={(e) => handleRename(e, wh.id, wh.name)}
                              className="flex items-center gap-2 w-full px-4 py-2 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            >
                              <Edit3 size={12} /> Rename
                            </button>
                            <button 
                              onClick={(e) => handleDelete(e, wh.id, wh.name)}
                              className="flex items-center gap-2 w-full px-4 py-2 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border-t border-gray-100 dark:border-white/5"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
