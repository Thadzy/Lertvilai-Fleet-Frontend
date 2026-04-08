# Lertvilai Fleet Management System

A professional-grade Warehouse Management System (WMS) and Robot Fleet Orchestration platform. This system provides a digital twin interface for warehouse operations, enabling high-precision map design, automated task optimization, and real-time multi-robot monitoring.

## System Overview

The platform is designed to bridge the gap between high-level warehouse logic and low-level robotic execution. It adheres to industrial robotics standards, specifically the Robot Operating System (ROS) spatial configurations, ensuring seamless integration between the web-based control center and physical robot hardware.

## Core Modules

### 1. Precision Map Designer
The Map Designer allows engineers to create and manage the warehouse topology using an interactive graph-based interface.
- **Node Entities**: Support for Waypoints, Shelves (Multi-level), Conveyors, and Depot stations.
- **Topological Mapping**: Create directed or undirected edges between nodes to define valid robot paths.
- **Dynamic Level Management**: Hierarchical storage management allowing for cell-level precision within shelf units.
- **Asset Support**: Native support for PGM and PNG floorplan uploads with resolution-based scaling.

### 2. Intelligent Task Optimization
A central hub for managing warehouse throughput and vehicle routing.
- **VRP Solver Integration**: Utilizes Vehicle Routing Problem algorithms to distribute tasks across the fleet efficiently.
- **A* Pathfinding Preview**: Real-time preview of calculated paths using the A-star algorithm before dispatching to hardware.
- **Task Queue Orchestration**: Comprehensive management of pickup and delivery sequences with priority handling.

### 3. Fleet Monitoring and Control
Real-time observation of the robotic fleet's health and spatial status.
- **Live Telemetry**: Monitor robot pose (X, Y, Yaw), battery levels, and operational states.
- **Path Visualization**: Real-time rendering of active paths and historical breadcrumbs.
- **Gateway Integration**: Low-latency communication via GraphQL and MQTT gateways.

## Technical Architecture

The following diagram illustrates the data flow and integration points between the frontend application, the persistence layer, and the robotic hardware.

```mermaid
graph TD
    subgraph Frontend_Application
        UI[React Flow UI]
        Store[Zustand State]
        Logic[Coordinate Transformation Engine]
    end

    subgraph Persistence_Layer
        DB[(Supabase PostgreSQL)]
        Storage[(Map Assets S3)]
        Realtime[Postgres Changes / Realtime]
    end

    subgraph Robotics_Gateway
        GQL[Fleet GraphQL API]
        MQTT[MQTT Broker]
        Solver[VRP Solver Service]
    end

    subgraph Physical_Fleet
        R1[Robot 1]
        R2[Robot 2]
    end

    UI <--> Store
    Logic <--> UI
    UI -- CRUD Operations --> DB
    UI -- Asset Upload --> Storage
    DB -- Live Updates --> UI
    
    UI -- Dispatch Order --> GQL
    UI -- Monitoring --> MQTT
    Logic -- Graph Data --> Solver
    Solver -- Optimized Routes --> UI
    
    MQTT <--> R1
    MQTT <--> R2
    GQL <--> R1
    GQL <--> R2
```

## Coordinate System Standard

To ensure 100% compatibility with the Robot Operating System (ROS), the system utilizes a resolution-based transformation matrix. This eliminates fixed scale factors and accounts for the Y-axis inversion between Web Canvas and ROS standards.

### Mathematical Transformations

| Direction | Component | Formula |
| :--- | :--- | :--- |
| **ROS to Web (Pixel)** | X | `(Meter_X - Origin_X) / Resolution` |
| | Y | `ImgHeight - ((Meter_Y - Origin_Y) / Resolution)` |
| **Web to ROS (Meter)** | X | `(Pixel_X * Resolution) + Origin_X` |
| | Y | `((ImgHeight - Pixel_Y) * Resolution) + Origin_Y` |

*Note: All Y-axis calculations incorporate the inversion logic where ROS +Y is Up and Web +Y is Down.*

## Technology Stack

- **Framework**: React 18 with TypeScript
- **State Management**: Zustand (Global UI State) and React Flow Store (Graph State)
- **Visualization**: React Flow (High-performance canvas rendering)
- **Backend Service**: Supabase (PostgreSQL, Realtime, Authentication)
- **Robotics Integration**: Apollo/GraphQL for order dispatch and MQTT for telemetry
- **Styling**: Tailwind CSS with Dark Mode support
- **Build Tool**: Vite

## Setup and Installation

### Local Development
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env`:
   ```env
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_public_key
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Production Deployment (Docker Compose)

The application is containerized using a multi-stage Docker build and served via Nginx. Environment variables required for the build process must be provided in the `.env` file before initiating the build.

#### 1. Configuration
Create or update the `.env` file in the root directory with the following variables:

```env
# Build-time variables (Baked into the JS bundle)
VITE_SUPABASE_URL=http://your-supabase-url:8000
VITE_SUPABASE_ANON_KEY=your-anon-key

# Runtime variables (Substituted by Nginx at startup)
FLEET_GATEWAY_URL=http://your-fleet-gateway:8080
VRP_URL=http://your-vrp-solver:18080
```

#### 2. Deployment Commands
Use Docker Compose to build the image and start the service:

```bash
# Build and start the container in detached mode
docker compose up -d --build
```

#### 3. Verification
- The frontend will be accessible at `http://localhost:80`.
- Verify the container status:
  ```bash
  docker compose ps
  ```
- To view logs:
  ```bash
  docker compose logs -f wcs-frontend
  ```

#### 4. Updates
To deploy updates after code changes:
```bash
docker compose down
docker compose up -d --build
```

## Development Lifecycle
- **Research**: Adhering to ROS standards for spatial data consistency.
- **Strategy**: Using Graph Theory for warehouse topology and VRP for fleet optimization.
- **Execution**: Modular component architecture for high maintainability.
