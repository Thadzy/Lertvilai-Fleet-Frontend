# Lertvilai Fleet Management System (WCS Frontend)

## 1. Project Overview
The Lertvilai Fleet Management System is a production-grade Warehouse Control System (WCS) frontend designed for the real-time orchestration and visualization of autonomous robot fleets. This application serves as the central command center for warehouse operators, enabling complex graph-based layout management, multi-robot pathfinding via a C++ Vehicle Routing Problem (VRP) solver, and high-frequency telemetry monitoring through a hybrid MQTT and GraphQL infrastructure.

The system translates high-level warehouse logic into actionable robot commands, ensuring safe navigation, task decomposition, and efficient fleet utilization within a spatially-aware environment.

## 2. System Architecture
The following diagram illustrates the data flow and integration points between the frontend application, telemetry layers, and backend orchestration services.

```mermaid
graph TD
    subgraph Client_Side [React Frontend]
        UI[React Flow Canvas]
        Store[Zustand State Manager]
        Hooks[Custom React Hooks]
    end

    subgraph Telemetry_Layer [Real-time Telemetry]
        MQTT[MQTT Broker / WebSocket]
    end

    subgraph Backend_Services [Orchestration & Data]
        Supabase[Supabase PostgreSQL]
        Gateway[Fleet Gateway GraphQL]
        VRP[C++ VRP Solver]
    end

    UI <--> Store
    Hooks <--> UI
    
    Hooks -- "Pub/Sub Telemetry" --> MQTT
    Hooks -- "Mutation/Query" --> Gateway
    Hooks -- "Optimization Requests" --> VRP
    Hooks -- "Data Persistence" --> Supabase
    
    Gateway -- "ROS Bridge" --> Robots[Physical Robot Fleet]
    Robots -- "Status Broadcast" --> MQTT
```

## 3. Tech Stack
*   Framework: React 19 (TypeScript)
*   Build Tool: Vite
*   Visualization: React Flow (Canvas-based node/edge management)
*   State Management: Zustand (Immutable store with undo/redo)
*   Styling: TailwindCSS
*   Telemetry: MQTT (Paho/MQTT.js) and GraphQL Polling
*   Database: Supabase (PostgreSQL with PostGIS/pgRouting)
*   Deployment: Docker (Multi-stage builds) and Nginx

## 4. Project Structure
```text
/
├── .claude/                # Agent-specific settings and worktrees
├── public/                 # Static assets (icons, manifest)
└── src/
    ├── assets/             # Global image and SVG resources
    ├── components/         # UI components and specialized panels
    │   ├── graph-editor/   # Tools for warehouse map manipulation
    │   ├── nodes/          # Custom React Flow node implementations
    │   └── ui/             # Reusable atomic UI elements
    ├── hooks/              # Business logic (MQTT, GraphQL, Graph CRUD)
    ├── lib/                # Third-party client initializations (Supabase)
    ├── store/              # Zustand global state definitions
    ├── types/              # TypeScript interfaces and database schemas
    └── utils/              # Coordinate math, API wrappers, and converters
```

## 5. Prerequisites & Installation

### Requirements
*   Node.js 20.x or higher
*   npm 10.x or higher
*   Docker and Docker Compose (for containerized deployment)

### Local Development
1. Clone the repository and navigate to the project root.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in a `.env` file (see Environment Variables section).
4. Start the development server:
   ```bash
   npm run dev
   ```

### Docker Deployment
Build and run the production-ready container:
```bash
docker compose up --build
```
The application will be served via Nginx on port 80, with built-in security headers and reverse proxying for backend services.

## 6. Development & Contribution Guide

### State Management (Zustand)
The application utilizes `useGraphStore.ts` for managing the warehouse topology. It implements a snapshot-based undo/redo pattern. To maintain performance, snapshots are captured using shallow array spreading rather than deep serialization. All state mutations must remain immutable to ensure proper React Flow re-renders.

### Telemetry Patterns
*   Real-time (MQTT): Managed via `useMQTT.ts`. It uses a singleton pattern (useRef) to prevent multiple broker connections. Telemetry is used primarily for low-latency position and battery updates.
*   Authoritative (GraphQL): Managed via `useFleetSocket.ts`. It polls the Fleet Gateway every 200ms for status verification and command synchronization.

### Coordinate System Standard
The system maintains a strict transformation layer between Web Canvas space (pixels) and ROS World space (meters).

*   Display Scale: 1.0 meter = 100 pixels (`DISPLAY_SCALE = 100`).
*   Y-Axis Inversion: React Flow origin is top-left (Y increases downward). ROS origin is bottom-left (Y increases upward).
*   Precision: All world-space coordinates are limited to 3 decimal places (millimeter accuracy) to prevent floating-point drift.

Formulas:
*   Web X = `(Meter_X - Origin_X) * 100`
*   Web Y = `ImgHeight - ((Meter_Y - Origin_Y) * 100)`
*   ROS X = `parseFloat(((Pixel_X / 100) + Origin_X).toFixed(3))`
*   ROS Y = `parseFloat((((ImgHeight - Pixel_Y) / 100) + Origin_Y).toFixed(3))`

## 7. Environment Variables

| Variable | Description |
| :--- | :--- |
| VITE_SUPABASE_URL | The endpoint for the Supabase project backend. |
| VITE_SUPABASE_ANON_KEY | The public anonymous key for Supabase authentication. |
| FLEET_GATEWAY_URL | (Docker only) The internal URL for the Fleet Gateway service. |
| VRP_URL | (Docker only) The internal URL for the C++ VRP Solver. |

## 8. Post-Installation Verification

After starting the project, follow these steps to verify that the frontend is correctly connected to the required services:

### 1. Database Connectivity (Supabase)
*   **Observation**: Open the browser and navigate to the Graph Editor.
*   **Success Criteria**: If the warehouse map or node list loads without a "Graph record not found" error, the connection to Supabase is successful.
*   **Manual Check**: Open Browser DevTools > Network tab. Look for requests to `supabase.co` or your local Supabase instance. They should return HTTP 200.

### 2. Telemetry Connectivity (MQTT)
*   **Observation**: Check the Header Panel in the Fleet Controller tab.
*   **Success Criteria**: The connection badge should display a green **CONNECTED** status.
*   **Console Check**: Look for the log `[MQTT] Connected successfully` in the browser console.

### 3. Gateway Connectivity (GraphQL)
*   **Observation**: Observe the "System Logs" panel at the bottom-right of the Fleet Controller.
*   **Success Criteria**: If logs such as `[FleetSocket] Connected` or robot status updates appear, the GraphQL polling is active.
*   **Health Check**: If running via Docker, you can verify the proxy by navigating to `http://localhost/healthz`. It should return `ok`.

### 4. Solver Connectivity (VRP)
*   **Observation**: Attempt to "Solve" a route in the Optimization tab.
*   **Success Criteria**: The console should log `[VRP] C++ Solver returned X route(s)`. If the solver is unreachable, a "VRP server unavailable" alert will be displayed.
