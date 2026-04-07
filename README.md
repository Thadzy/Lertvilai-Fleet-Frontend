# Lertvilai Warehouse Control System (WCS) Frontend

## Overview
The Lertvilai WCS Frontend is a centralized management interface designed for warehouse automation and robot fleet orchestration. It provides a high-performance, real-time environment for mapping warehouse layouts, optimizing multi-robot task assignments using Vehicle Routing Problem (VRP) solvers, and monitoring physical robot telemetry.

The system is built with React, TypeScript, and React Flow, integrating seamlessly with a ROS-based backend stack, Supabase for persistence, and a high-performance C++ VRP engine.

## Core Features
- **Graph Editor**: A drag-and-drop interface for creating and managing warehouse topological maps, including waypoints, shelves, conveyors, and depots.
- **VRP Optimization**: Advanced fleet orchestration that calculates the most efficient routes for multiple robots based on task queues and real-time robot locations.
- **Fleet Monitoring**: Real-time telemetry visualization of robot positions, battery status, and execution states via GraphQL polling and WebSockets.
- **Coordinate Alignment**: Full synchronization with ROS world coordinates, including Y-axis inversion handling and map origin offsets.
- **Adaptive UI**: High-contrast interface supporting both light and dark modes, optimized for industrial control environments.

## Technical Architecture
The application follows a modular architecture:
- **Frontend**: React 18+ with Vite for rapid development and optimized production builds.
- **State Management**: Zustand for global graph and theme state; React Hooks for localized logic and data fetching.
- **Database/Realtime**: Supabase (Postgres) for storing graph data, level configurations, and task history.
- **Network Proxy**: Nginx handles internal routing between the frontend and various microservices (Fleet Gateway, VRP Solver).

## Project Structure
```text
Lertvilai-Fleet-Frontend/
├── public/                 # Static assets (icons, manifest)
├── src/
│   ├── assets/             # Images and styles
│   ├── components/         # React components
│   │   ├── nodes/          # Custom React Flow node types (Waypoint, Shelf)
│   │   ├── edges/          # Custom React Flow edge types (Animated routes)
│   │   ├── graph-editor/   # Specialized UI panels for the editor
│   │   ├── FleetInterface.tsx  # Main orchestrator for the fleet tabs
│   │   └── WarehouseGraph.tsx  # Reusable read-only graph canvas
│   ├── hooks/              # Custom logic (Data fetching, Sockets, MQTT)
│   ├── lib/                # Third-party client initializations (Supabase)
│   ├── store/              # Zustand global state definitions
│   ├── types/              # TypeScript interface definitions
│   └── utils/              # Calculation helpers and API wrappers
├── Dockerfile              # Multi-stage production build definition
├── docker-compose.yml      # Container orchestration
├── nginx.conf.template     # Nginx proxy configuration with env substitution
└── package.json            # Dependency and script definitions
```

## Installation and Setup

### Prerequisites
- Node.js (v20 or higher)
- npm (v10 or higher)
- Docker and Docker Compose (for production deployment)

### Local Development
1. Clone the repository to your local machine.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables by creating a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=http://your-supabase-url:8000
   VITE_SUPABASE_ANON_KEY=your-anon-key
   FLEET_GATEWAY_URL=http://your-gateway-ip:8080
   VRP_URL=http://your-solver-ip:18080
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Production Deployment (Docker)
The application is designed to be served via Nginx inside a Docker container.
1. Build and start the container:
   ```bash
   docker compose up -d --build
   ```
2. The frontend will be accessible at `http://localhost`.

## Verification and Testing

### Connectivity Check
Verify that all backend microservices are reachable from the frontend:
- **Fleet Gateway**: `curl http://<host-ip>:8080/health`
- **VRP Solver**: `curl http://<host-ip>:18080/health`
- **Supabase**: Ensure the database columns `map_origin_x`, `map_origin_y`, and `map_img_height` exist in the `wh_graphs` table.

### Functional Verification
1. **Graph Editor**: Ensure nodes can be dragged from the toolbar and dropped onto the canvas. Verify that the "Origin Marker" (Blue +) appears at the correct coordinate relative to your map.
2. **VRP Dispatch**:
   - Add tasks to the queue in the Optimization tab.
   - Select "Robot" as the Start Point.
   - Click "OPTIMIZE FLEET ROUTES".
   - Verify that the C++ Solver returns a valid path (visible in the browser console).
   - Click "DISPATCH" and verify the `sendWarehouseOrder` mutation is sent successfully via the Network tab in DevTools.

## Troubleshooting
- **404 Not Found on API**: Ensure `nginx.conf.template` has been correctly populated with environment variables during container startup. The proxy paths must strip the `/api` prefix before forwarding to backend services.
- **Zustand Provider Error**: Ensure that any component using React Flow hooks (like `useReactFlow`) is wrapped inside a `<ReactFlowProvider>`.
- **Coordinate Mismatch**: If robot positions appear offset, check the `resolution` and `origin` values in the Map Configuration panel to ensure they match the ROS YAML metadata.
