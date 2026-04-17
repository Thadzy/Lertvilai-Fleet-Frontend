import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Wifi, WifiOff, Database, Server, Radio,
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
    return { level: 'ok', message: 'Connected — wh_graphs query OK', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return { level: 'error', message: `Fetch failed: ${msg}`, latencyMs };
  }
}

async function pingFleetGateway(): Promise<{ level: StatusLevel; message: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    // Try health endpoint first
    const res = await fetch('/api/fleet/health', {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (res.ok) {
      return { level: 'ok', message: `HTTP ${res.status} — /health OK`, latencyMs };
    }
    // Fallback: try graphql endpoint (even a 400 means the server is up)
    if (res.status === 404 || res.status === 400 || res.status === 405) {
      // Try graphql endpoint
      const gqlRes = await fetch('/api/fleet/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
        signal: AbortSignal.timeout(5000),
      });
      const gqlLatency = Math.round(performance.now() - t0);
      if (gqlRes.ok || gqlRes.status === 400) {
        return { level: 'ok', message: `GraphQL endpoint reachable (HTTP ${gqlRes.status})`, latencyMs: gqlLatency };
      }
      return { level: 'error', message: `GraphQL HTTP ${gqlRes.status}`, latencyMs: gqlLatency };
    }
    return { level: 'error', message: `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return { level: 'error', message: `Unreachable: ${msg}`, latencyMs };
  }
}

async function pingVrpServer(): Promise<{ level: StatusLevel; message: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const result = await checkVrpServers();
    const latencyMs = Math.round(performance.now() - t0);
    if (result.cpp) {
      return { level: 'ok', message: 'C++ OR-Tools solver reachable (/health OK)', latencyMs };
    }
    return { level: 'error', message: 'C++ solver unreachable — /api/cpp-vrp/health failed', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return { level: 'error', message: `Check failed: ${msg}`, latencyMs };
  }
}

function pingMQTT(brokerUrl: string): Promise<{ level: StatusLevel; message: string; latencyMs: number }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;

    const settle = (level: StatusLevel, message: string) => {
      if (settled) return;
      settled = true;
      const latencyMs = Math.round(performance.now() - t0);
      resolve({ level, message, latencyMs });
    };

    const timeout = setTimeout(() => {
      settle('error', 'Connection timeout (5s) — broker unreachable');
    }, 5000);

    try {
      const ws = new WebSocket(brokerUrl);
      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        settle('ok', `WebSocket handshake OK (${brokerUrl})`);
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        settle('error', `WebSocket error — cannot reach ${brokerUrl}`);
      };
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      settle('error', `WebSocket init failed: ${msg}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Status Icon
// ---------------------------------------------------------------------------

const StatusIcon: React.FC<{ level: StatusLevel; size?: number }> = ({ level, size = 16 }) => {
  if (level === 'ok') return <CheckCircle2 size={size} className="text-emerald-400 flex-shrink-0" />;
  if (level === 'error') return <XCircle size={size} className="text-red-400 flex-shrink-0" />;
  if (level === 'checking') return <Loader2 size={size} className="text-blue-400 animate-spin flex-shrink-0" />;
  return <AlertCircle size={size} className="text-gray-500 flex-shrink-0" />;
};

const levelBg: Record<StatusLevel, string> = {
  ok: 'border-emerald-500/20 bg-emerald-500/5',
  error: 'border-red-500/20 bg-red-500/5',
  checking: 'border-blue-500/20 bg-blue-500/5',
  unknown: 'border-gray-700/40 bg-transparent',
};

const levelBadge: Record<StatusLevel, string> = {
  ok: 'text-emerald-400 bg-emerald-400/10',
  error: 'text-red-400 bg-red-400/10',
  checking: 'text-blue-400 bg-blue-400/10',
  unknown: 'text-gray-500 bg-gray-700/30',
};

const levelLabel: Record<StatusLevel, string> = {
  ok: 'Online',
  error: 'Offline',
  checking: 'Checking…',
  unknown: 'Unknown',
};

// ---------------------------------------------------------------------------
// Service Row
// ---------------------------------------------------------------------------

const ServiceRow: React.FC<{ icon: React.ReactNode; status: ServiceStatus }> = ({ icon, status }) => (
  <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${levelBg[status.level]}`}>
    <div className="mt-0.5 flex-shrink-0 text-gray-400">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-200">{status.label}</span>
        <div className="flex items-center gap-2">
          {status.latencyMs !== undefined && status.level !== 'checking' && (
            <span className="text-[10px] text-gray-500 font-mono">{status.latencyMs}ms</span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${levelBadge[status.level]}`}>
            {levelLabel[status.level]}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 break-all leading-relaxed font-mono">{status.message}</p>
      {status.lastChecked && (
        <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
          <Clock size={9} /> {status.lastChecked.toLocaleTimeString()}
        </p>
      )}
    </div>
    <StatusIcon level={status.level} />
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const MQTT_BROKER = 'ws://broker.emqx.io:8083/mqtt';

const SystemStatusPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const initialStatus = (label: string): ServiceStatus => ({
    label,
    level: 'unknown',
    message: 'Press refresh to check',
  });

  const [supabaseStatus, setSupabaseStatus] = useState<ServiceStatus>(initialStatus('Supabase Database'));
  const [gatewayStatus, setGatewayStatus] = useState<ServiceStatus>(initialStatus('Fleet Gateway (GraphQL :8080)'));
  const [vrpStatus, setVrpStatus] = useState<ServiceStatus>(initialStatus('VRP Solver (C++ :18080)'));
  const [mqttStatus, setMqttStatus] = useState<ServiceStatus>(initialStatus('MQTT Broker (broker.emqx.io)'));

  const runChecks = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    addLog('--- Starting system health check ---');

    const checking = (label: string): ServiceStatus => ({
      label, level: 'checking', message: 'Connecting…',
    });

    setSupabaseStatus(checking('Supabase Database'));
    setGatewayStatus(checking('Fleet Gateway (GraphQL :8080)'));
    setVrpStatus(checking('VRP Solver (C++ :18080)'));
    setMqttStatus(checking('MQTT Broker (broker.emqx.io)'));

    // Run all checks concurrently
    const [sbResult, gwResult, vrpResult, mqttResult] = await Promise.allSettled([
      pingSupabase(),
      pingFleetGateway(),
      pingVrpServer(),
      pingMQTT(MQTT_BROKER),
    ]);

    const now = new Date();

    // Supabase
    const sb = sbResult.status === 'fulfilled'
      ? sbResult.value
      : { level: 'error' as StatusLevel, message: String((sbResult as PromiseRejectedResult).reason), latencyMs: 0 };
    setSupabaseStatus({ label: 'Supabase Database', ...sb, lastChecked: now });
    addLog(`[Supabase] ${sb.level.toUpperCase()} — ${sb.message} (${sb.latencyMs}ms)`);

    // Fleet Gateway
    const gw = gwResult.status === 'fulfilled'
      ? gwResult.value
      : { level: 'error' as StatusLevel, message: String((gwResult as PromiseRejectedResult).reason), latencyMs: 0 };
    setGatewayStatus({ label: 'Fleet Gateway (GraphQL :8080)', ...gw, lastChecked: now });
    addLog(`[Fleet GW] ${gw.level.toUpperCase()} — ${gw.message} (${gw.latencyMs}ms)`);

    // VRP
    const vrp = vrpResult.status === 'fulfilled'
      ? vrpResult.value
      : { level: 'error' as StatusLevel, message: String((vrpResult as PromiseRejectedResult).reason), latencyMs: 0 };
    setVrpStatus({ label: 'VRP Solver (C++ :18080)', ...vrp, lastChecked: now });
    addLog(`[VRP]      ${vrp.level.toUpperCase()} — ${vrp.message} (${vrp.latencyMs}ms)`);

    // MQTT
    const mq = mqttResult.status === 'fulfilled'
      ? mqttResult.value
      : { level: 'error' as StatusLevel, message: String((mqttResult as PromiseRejectedResult).reason), latencyMs: 0 };
    setMqttStatus({ label: 'MQTT Broker (broker.emqx.io)', ...mq, lastChecked: now });
    addLog(`[MQTT]     ${mq.level.toUpperCase()} — ${mq.message} (${mq.latencyMs}ms)`);

    addLog('--- Health check complete ---');
    setIsRefreshing(false);
  }, [isRefreshing, addLog]);

  // Auto-run on mount
  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = 0;
    }
  }, [logs]);

  const allStatuses = [supabaseStatus, gatewayStatus, vrpStatus, mqttStatus];
  const errorCount = allStatuses.filter(s => s.level === 'error').length;
  const okCount = allStatuses.filter(s => s.level === 'ok').length;
  const overallLevel: StatusLevel =
    allStatuses.some(s => s.level === 'checking') ? 'checking'
    : errorCount === 0 && okCount === 4 ? 'ok'
    : errorCount > 0 ? 'error'
    : 'unknown';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-[#111113] overflow-hidden shadow-xl">

      {/* ── Header ── */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/3 transition-colors"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            overallLevel === 'ok' ? 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]'
            : overallLevel === 'error' ? 'bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.4)] animate-pulse'
            : overallLevel === 'checking' ? 'bg-blue-400 animate-pulse'
            : 'bg-gray-600'
          }`} />
          <span className="text-sm font-bold text-gray-900 dark:text-gray-200 tracking-tight">System Diagnostics</span>
          {errorCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded border border-red-500/20">
              {errorCount} Error{errorCount > 1 ? 's' : ''}
            </span>
          )}
          {overallLevel === 'ok' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded border border-emerald-500/20">
              All Systems OK
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); runChecks(); }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-blue-400 transition-colors px-2 py-1 rounded-lg hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          {isOpen ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </button>

      {/* ── Body ── */}
      {isOpen && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-200 dark:border-white/5 pt-4">

          {/* Services */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity size={11} /> Services
            </p>
            <ServiceRow icon={<Database size={16} />} status={supabaseStatus} />
            <ServiceRow icon={<Server size={16} />} status={gatewayStatus} />
            <ServiceRow icon={<Server size={16} />} status={vrpStatus} />
            <ServiceRow icon={<Radio size={16} />} status={mqttStatus} />
          </div>

          {/* Environment Variables */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <KeyRound size={11} /> Environment Variables
            </p>
            <div className="space-y-2">
              {ENV_VARS.map((ev) => (
                <div
                  key={ev.key}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-[11px] font-mono ${
                    ev.value
                      ? 'border-emerald-500/15 bg-emerald-500/5'
                      : 'border-red-500/20 bg-red-500/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ev.value
                      ? <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                      : <XCircle size={12} className="text-red-400 flex-shrink-0" />
                    }
                    <span className="text-gray-400">{ev.key}</span>
                  </div>
                  <span className={`truncate max-w-[180px] text-right ${ev.value ? 'text-gray-300' : 'text-red-400'}`}>
                    {ev.value
                      ? (ev.masked ? maskValue(ev.value) : ev.value)
                      : 'NOT SET'
                    }
                  </span>
                </div>
              ))}

              {/* Extra runtime info */}
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-700/30 bg-transparent text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <Wifi size={12} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-500">Fleet Gateway Proxy</span>
                </div>
                <span className="text-gray-400 truncate max-w-[180px] text-right">/api/fleet → :8080</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-700/30 bg-transparent text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <Wifi size={12} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-500">VRP Proxy</span>
                </div>
                <span className="text-gray-400 truncate max-w-[180px] text-right">/api/cpp-vrp → :18080</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-700/30 bg-transparent text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  {mqttStatus.level === 'ok'
                    ? <Wifi size={12} className="text-emerald-400 flex-shrink-0" />
                    : <WifiOff size={12} className="text-gray-500 flex-shrink-0" />
                  }
                  <span className="text-gray-500">MQTT Broker URL</span>
                </div>
                <span className="text-gray-400 truncate max-w-[180px] text-right">{MQTT_BROKER}</span>
              </div>
            </div>
          </div>

          {/* Debug Logs */}
          <div>
            <button
              className="w-full flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 hover:text-gray-300 transition-colors"
              onClick={() => setShowLogs(v => !v)}
            >
              <span className="flex items-center gap-2">
                <Terminal size={11} /> Debug Logs
                <span className="normal-case font-normal text-gray-600">({logs.length} entries)</span>
              </span>
              {showLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showLogs && (
              <div
                ref={logsRef}
                className="bg-black/40 dark:bg-black/60 border border-white/5 rounded-xl p-3 h-44 overflow-y-auto font-mono text-[10px] leading-relaxed space-y-0.5"
              >
                {logs.length === 0 ? (
                  <p className="text-gray-600 italic">No logs yet. Click Refresh to run checks.</p>
                ) : (
                  logs.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.includes('ERROR') || line.includes('Offline') || line.includes('error')
                          ? 'text-red-400'
                          : line.includes('OK') || line.includes('ok') || line.includes('Online')
                          ? 'text-emerald-400'
                          : line.startsWith('[') && line.includes('---')
                          ? 'text-blue-400 font-bold'
                          : 'text-gray-500'
                      }
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemStatusPanel;
