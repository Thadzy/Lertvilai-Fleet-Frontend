import { type DBNode } from '../types/database';
import { supabase } from '../lib/supabaseClient';

/**
 * VRP API Client
 *
 * Communicates exclusively with the C++ VRP server proxied via Vite at /api/cpp-vrp.
 * The C++ server (Crow + OR-Tools, port 18080) handles cost-matrix computation
 * internally using the warehouse graph stored in PostgreSQL.
 *
 * Python VRP fallback has been removed — all routing must go through the C++ server.
 */

/**
 * Proxy paths (configured in vite.config.ts).
 *   /api/fleet  → fleet_gateway (port 8080) — validated VRP + decomposition
 *   /api/cpp-vrp → C++ OR-Tools server (port 18080) — raw solver (legacy)
 */
const FLEET_GATEWAY_URL = '/api/fleet';
const CPP_VRP_URL = '/api/cpp-vrp';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Request payload sent to the C++ VRP solver.
 *
 * @property graph_id           - ID of the warehouse graph in PostgreSQL.
 * @property num_vehicles       - Number of robots available for assignment.
 * @property pickups_deliveries - Array of pickup/delivery node ID pairs.
 * @property robot_locations    - Optional array of starting node IDs per robot.
 * @property vehicle_capacity   - Optional maximum number of tasks per robot.
 */
export interface VrpRequest {
    graph_id: number;
    num_vehicles: number;
    pickups_deliveries: { id?: number; pickup: number; delivery: number }[];
    robot_locations?: number[];
    vehicle_capacity?: number;
}

/** Raw response envelope returned by the C++ VRP server. */
interface CppVrpResponse {
    success: boolean;
    data?: { paths: (string | number)[][] };
    error?: string | null;
}

/** Response envelope from the fleet_gateway /vrp/solve endpoint. */
interface GatewayVrpResponse {
    success: boolean;
    paths?: (string | number)[][];
    decomposed?: boolean;
    error_code?: string;
    error_message?: string;
}

/** Human-readable labels for fleet_gateway error codes. */
const VRP_ERROR_LABELS: Record<string, string> = {
    NO_SOLUTION:        'No feasible route found',
    INCOMPLETE_COSTMAP: 'Graph not fully connected',
    OVERCAPACITY:       'Fleet overcapacity',
    UNREACHABLE_NODE:   'Unreachable node in graph',
    SERVER_UNAVAILABLE: 'VRP server unavailable',
    VALIDATION_ERROR:   'Invalid request',
    UNKNOWN:            'Solver error',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Submit a VRP solve request through the fleet_gateway `/vrp/solve` endpoint.
 *
 * @param req - The VRP request parameters.
 * @returns   A 2-D array where each inner array is the ordered node IDs or aliases for one vehicle.
 * @throws    Error with a human-readable message on any failure.
 */
async function solveViaGateway(req: VrpRequest): Promise<(string | number)[][]> {
    const body = {
        graph_id: req.graph_id,
        num_vehicles: req.num_vehicles,
        pickups_deliveries: req.pickups_deliveries.map(pd => ({
            task_id: pd.id ?? null,
            pickup: pd.pickup,
            delivery: pd.delivery,
        })),
        robot_locations: req.robot_locations ?? null,
        vehicle_capacity: req.vehicle_capacity ?? null,
    };

    console.log('[VRP] Request payload (via fleet_gateway):', JSON.stringify(body, null, 2));

    const res = await fetch(`${FLEET_GATEWAY_URL}/vrp/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35000),
    });

    // Read raw text first so we can log it before attempting JSON parse
    const rawText = await res.text();
    console.log(`[VRP] fleet_gateway HTTP ${res.status} raw response:`, rawText);

    let json: GatewayVrpResponse & { detail?: unknown };
    try {
        json = JSON.parse(rawText);
    } catch {
        throw new Error(
            `fleet_gateway returned non-JSON response (HTTP ${res.status}): ${rawText.slice(0, 200)}`
        );
    }

    if (!json.success || !json.paths) {
        // Handle FastAPI native validation errors: {"detail": [{...}]}
        if (json.detail !== undefined) {
            const detail = Array.isArray(json.detail)
                ? json.detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join('; ')
                : String(json.detail);
            throw new Error(`[Validation Error] ${detail}`);
        }
        const label = VRP_ERROR_LABELS[json.error_code ?? ''] ?? json.error_code ?? 'Error';
        throw new Error(`[${label}] ${json.error_message ?? `HTTP ${res.status} — see console for raw response`}`);
    }

    if (json.decomposed) {
        console.log('[VRP] Solution assembled via task decomposition (duplicate pickup nodes).');
    }

    return json.paths;
}

/**
 * Submit a VRP solve request directly to the C++ OR-Tools server.
 * Uses /solve_alias which expects node alias strings.
 *
 * @param req - The VRP request parameters.
 * @param nodeAliasMap - Map of numeric IDs to alias strings.
 * @returns   A 2-D array where each inner array is the ordered node aliases for one vehicle.
 */
async function solveCppDirect(req: VrpRequest, nodeAliasMap: Map<number, string>): Promise<(string | number)[][]> {
    // 1. Get graph name from DB first (required for /solve_alias)
    const { data: graphInfo } = await supabase
        .from('wh_graphs')
        .select('name')
        .eq('id', req.graph_id)
        .single();
    
    const graphName = graphInfo?.name || 'default';

    const formData = new URLSearchParams();
    formData.append('graph_name', graphName);
    formData.append('num_vehicles', String(req.num_vehicles));

    // Convert numeric IDs to aliases for the request
    const pdArray = req.pickups_deliveries.map(pd => [
        nodeAliasMap.get(pd.pickup) || String(pd.pickup),
        nodeAliasMap.get(pd.delivery) || String(pd.delivery)
    ]);
    formData.append('pickups_deliveries', JSON.stringify(pdArray));

    if (req.robot_locations && req.robot_locations.length > 0) {
        const aliasLocations = req.robot_locations.map(id => nodeAliasMap.get(id) || String(id));
        formData.append('robot_locations', JSON.stringify(aliasLocations));
    }
    if (req.vehicle_capacity && req.vehicle_capacity > 0) {
        formData.append('vehicle_capacity', String(req.vehicle_capacity));
    }

    console.log(`[VRP] Fallback: sending direct to C++ server (/solve_alias, graph: ${graphName})`);

    const res = await fetch(`${CPP_VRP_URL}/solve_alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`C++ VRP server HTTP ${res.status}: ${text}`);
    }

    const json: CppVrpResponse = await res.json();

    if (!json.success || !json.data) {
        throw new Error(String(json.error) || 'C++ VRP solver returned an error with no message');
    }

    return json.data.paths;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Solve a Vehicle Routing Problem.
 *
 * Routes the request directly to the C++ Solver (18080) as the primary engine,
 * since the fleet_gateway (8080) is currently not providing VRP services.
 *
 * @param req             - VRP problem definition (graph, vehicles, tasks).
 * @param nodeAliasMap    - Map of ID -> Alias for name-based lookup.
 * @returns An object containing the per-vehicle `paths` (node IDs or Aliases)
 *          and `server` indicating which backend handled the request.
 */
export async function solveVRP(
    req: VrpRequest,
    nodeAliasMap: Map<number, string> = new Map(),
): Promise<{ paths: (string | number)[][]; server: 'gateway' | 'cpp' }> {
    console.log('[VRP] Submitting solve request directly to C++ Solver (18080)...');

    try {
        // Direct C++ server (/solve_alias)
        const paths = await solveCppDirect(req, nodeAliasMap);
        console.log(`[VRP] C++ Solver returned ${paths.length} route(s)`);
        return { paths, server: 'cpp' };
    } catch (cppErr) {
        const msg = cppErr instanceof Error ? cppErr.message : String(cppErr);
        console.error('[VRP] C++ Solver Error:', msg);
        
        // Optional: Try gateway as fallback only if C++ fails
        console.warn('[VRP] C++ Solver failed, attempting gateway fallback...');
        try {
            const paths = await solveViaGateway(req);
            return { paths, server: 'gateway' };
        } catch (gwErr) {
            throw cppErr; // Throw original C++ error if both fail
        }
    }
}

/**
 * Check whether the C++ VRP server is reachable via its /health endpoint.
 *
 * The `python` field is always `false` as the Python server has been removed.
 *
 * @returns `{ cpp: boolean; python: false }`
 */
export async function checkVrpServers(): Promise<{ cpp: boolean; python: false }> {
    let cpp = false;
    try {
        const res = await fetch(`${CPP_VRP_URL}/health`, {
            signal: AbortSignal.timeout(2000),
        });
        cpp = res.ok;
    } catch {
        cpp = false;
    }
    return { cpp, python: false };
}
