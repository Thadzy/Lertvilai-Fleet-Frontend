import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Wifi, Database, Server,
  RefreshCw, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, AlertCircle, Clock, Terminal, KeyRound,
  Activity, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { checkVrpServers } from '../utils/vrpApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusLevel = 'ok' | 'error' | 'checking' | 'unknown';

interface ServiceStatus {
  label: string;
  level: StatusLevel;
  message: string;
  latencyMs?: number;
  lastChecked?: Date;
}

interface EnvVar {
  key: string;
  value: string | undefined;
  masked?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_VARS: EnvVar[] = [
  { key: 'VITE_SUPABASE_URL', value: import.meta.env.VITE_SUPABASE_URL },
  { key: 'VITE_SUPABASE_ANON_KEY', value: import.meta.env.VITE_SUPABASE_ANON_KEY, masked: true },
];

const maskValue = (val: string) =>
  val.length > 12 ? `${val.slice(0, 6)}...${val.slice(-4)}` : '***';

/**
 * Pings the Supabase database by attempting a simple select on wh_graphs.
 */
async function pingSupabase(): Promise<{ level: StatusLevel; message: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const { error } = await supabase
      .from('wh_graphs')
      .select('id')
      .limit(1);
    const latencyMs = Math.round(performance.now() - t0);
    if (error) {
      return { level: 'error', message: `DB Error: ${error.message}`, latencyMs };
    }
    return { level: 'ok', message: 'Connected to Supabase', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return { level: 'error', message: `DB Fetch failed: ${msg}`, latencyMs };
  }
}

/**
 * Pings the Fleet Gateway via the proxy endpoint.
 */
async function pingFleetGateway(): Promise<{ level: StatusLevel; message: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const res = await fetch('/api/fleet/health', {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (res.ok) {
      return { level: 'ok', message: `/health OK (HTTP ${res.status})`, latencyMs };
    }
    return { level: 'error', message: `Gateway HTTP ${res.status}`, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return { level: 'error', message: `Gateway Unreachable: ${msg}`, latencyMs };
  }
}

/**
 * Pings the VRP C++ Solver server.
 */
async function pingVrpServer(): Promise<{ level: StatusLevel; message: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const result = await checkVrpServers();
    const latencyMs = Math.round(performance.now() - t0);
    if (result.cpp) {
      return { level: 'ok', message: 'C++ Solver reachable', latencyMs };
    }
    return { level: 'error', message: 'C++ solver /health failed', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return { level: 'error', message: `Solver check failed: ${msg}`, latencyMs };
  }
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

const StatusIcon: React.FC<{ level: StatusLevel; size?: number }> = ({ level, size = 14 }) => {
  if (level === 'ok') return <CheckCircle2 size={size} className="text-emerald-500 flex-shrink-0" />;
  if (level === 'error') return <XCircle size={size} className="text-red-500 flex-shrink-0" />;
  if (level === 'checking') return <Loader2 size={size} className="text-blue-500 animate-spin flex-shrink-0" />;
  return <AlertCircle size={size} className="text-zinc-500 flex-shrink-0" />;
};

const levelBg: Record<StatusLevel, string> = {
  ok: 'border-emerald-500/15 bg-emerald-500/5',
  error: 'border-red-500/15 bg-red-500/5',
  checking: 'border-blue-500/15 bg-blue-500/5',
  unknown: 'border-zinc-200 dark:border-zinc-800 bg-transparent',
};

const levelBadge: Record<StatusLevel, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400 bg-emerald-400/10',
  error: 'text-red-600 dark:text-red-400 bg-red-400/10',
  checking: 'text-blue-600 dark:text-blue-400 bg-blue-400/10',
  unknown: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800',
};

const levelLabel: Record<StatusLevel, string> = {
  ok: 'Online',
  error: 'Offline',
  checking: 'Checking…',
  unknown: 'Unknown',
};

const ServiceRow: React.FC<{ icon: React.ReactNode; status: ServiceStatus }> = ({ icon, status }) => (
  <div className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all ${levelBg[status.level]}`}>
    <div className="mt-0.5 flex-shrink-0 text-zinc-400">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">{status.label}</span>
        <div className="flex items-center gap-1.5">
          {status.latencyMs !== undefined && status.level !== 'checking' && (
            <span className="text-[9px] text-zinc-500 font-mono">{status.latencyMs}ms</span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${levelBadge[status.level]}`}>
            {levelLabel[status.level]}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 mt-0.5 truncate font-mono">{status.message}</p>
    </div>
    <StatusIcon level={status.level} />
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * SystemStatusPanel
 * @description Compact diagnostic dashboard providing real-time connectivity 
 * status for the core Lertvilai infrastructure components.
 */
const SystemStatusPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const initialStatus = (label: string): ServiceStatus => ({
    label,
    level: 'unknown',
    message: 'Press refresh to check',
  });

  const [supabaseStatus, setSupabaseStatus] = useState<ServiceStatus>(initialStatus('Database'));
  const [gatewayStatus, setGatewayStatus] = useState<ServiceStatus>(initialStatus('Fleet Gateway'));
  const [vrpStatus, setVrpStatus] = useState<ServiceStatus>(initialStatus('VRP Solver'));

  const runChecks = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    addLog('Starting diagnostic sequence...');

    const checking = (label: string): ServiceStatus => ({
      label, level: 'checking', message: 'Connecting…',
    });

    setSupabaseStatus(checking('Database'));
    setGatewayStatus(checking('Fleet Gateway'));
    setVrpStatus(checking('VRP Solver'));

    // Execute core service pings
    const [sbResult, gwResult, vrpResult] = await Promise.allSettled([
      pingSupabase(),
      pingFleetGateway(),
      pingVrpServer(),
    ]);

    const now = new Date();

    // Parse Results
    const getRes = (res: any) => res.status === 'fulfilled' ? res.value : { level: 'error' as StatusLevel, message: 'Process Timeout', latencyMs: 0 };

    const sb = getRes(sbResult);
    setSupabaseStatus({ label: 'Database', ...sb, lastChecked: now });
    addLog(`[DB] ${sb.level.toUpperCase()} - ${sb.latencyMs}ms`);

    const gw = getRes(gwResult);
    setGatewayStatus({ label: 'Fleet Gateway', ...gw, lastChecked: now });
    addLog(`[GW] ${gw.level.toUpperCase()} - ${gw.latencyMs}ms`);

    const vrp = getRes(vrpResult);
    setVrpStatus({ label: 'VRP Solver', ...vrp, lastChecked: now });
    addLog(`[VRP] ${vrp.level.toUpperCase()} - ${vrp.latencyMs}ms`);

    addLog('Diagnostic sequence complete.');
    setIsRefreshing(false);
  }, [isRefreshing, addLog]);

  useEffect(() => {
    runChecks();
  }, []);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = 0;
  }, [logs]);

  const allStatuses = [supabaseStatus, gatewayStatus, vrpStatus];
  const errorCount = allStatuses.filter(s => s.level === 'error').length;
  const okCount = allStatuses.filter(s => s.level === 'ok').length;
  
  const overallLevel: StatusLevel =
    allStatuses.some(s => s.level === 'checking') ? 'checking'
    : errorCount === 0 && okCount === 3 ? 'ok'
    : errorCount > 0 ? 'error'
    : 'unknown';

  return (
    <div className="rounded-2xl border bg-white/80 dark:bg-zinc-900/50 backdrop-blur-md border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm transition-all">

      {/* HEADER */}
      <div
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors cursor-pointer group"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center">
          <img src="/Logo.jpg" alt="Lertvilai Logo" className="h-4 w-auto object-contain mr-3 opacity-80 group-hover:opacity-100 transition-opacity" />
          <span className="text-[12px] font-black text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">System Diagnostics</span>
          
          <div className="flex items-center gap-2 ml-4">
            <div className={`w-2 h-2 rounded-full ${
              overallLevel === 'ok' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
              : overallLevel === 'error' ? 'bg-red-500 animate-pulse'
              : overallLevel === 'checking' ? 'bg-blue-500 animate-pulse'
              : 'bg-zinc-400'
            }`} />
            {errorCount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                {errorCount} ERR
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); runChecks(); }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-blue-500 transition-all px-2 py-1 rounded-lg hover:bg-blue-500/5"
          >
            <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
            Check
          </button>
          {isOpen ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
        </div>
      </div>

      {/* BODY */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 dark:border-zinc-800/50 pt-4">

          {/* Grid Rows for Services */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ServiceRow icon={<Database size={14} />} status={supabaseStatus} />
            <ServiceRow icon={<Server size={14} />} status={gatewayStatus} />
            <ServiceRow icon={<Server size={14} />} status={vrpStatus} />
            <div className="flex items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-white/[0.02] p-2">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">WCS v4.0 Active</span>
            </div>
          </div>

          {/* Infrastructure & Logs Accordion Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            
            {/* Env Vars */}
            <div className="space-y-2">
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                <KeyRound size={10} /> Secrets & Endpoints
              </p>
              <div className="space-y-1.5">
                {ENV_VARS.map((ev) => (
                  <div key={ev.key} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800 text-[10px] font-mono">
                    <span className="text-zinc-500">{ev.key}</span>
                    <span className={ev.value ? 'text-zinc-900 dark:text-zinc-300' : 'text-red-500'}>
                      {ev.value ? (ev.masked ? maskValue(ev.value) : ev.value) : 'MISSING'}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800 text-[10px] font-mono">
                  <span className="text-zinc-500">Gateway Proxy</span>
                  <span className="text-zinc-400">/api/fleet → :8080</span>
                </div>
              </div>
            </div>

            {/* Debug Console */}
            <div className="space-y-2">
              <button
                className="flex items-center justify-between w-full text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                onClick={() => setShowLogs(!showLogs)}
              >
                <span className="flex items-center gap-1.5"><Terminal size={10} /> Developer Console</span>
                {showLogs ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showLogs && (
                <div ref={logsRef} className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 h-28 overflow-y-auto font-mono text-[9px] leading-relaxed space-y-0.5 custom-scrollbar">
                  {logs.length === 0 ? (
                    <p className="text-zinc-600 italic">Console idle.</p>
                  ) : (
                    logs.map((line, i) => (
                      <div key={i} className={
                        line.includes('ERROR') || line.includes('Offline') ? 'text-red-500' :
                        line.includes('Online') || line.includes('OK') ? 'text-emerald-500' : 'text-zinc-500'
                      }>
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemStatusPanel;
