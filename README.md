# WCS Frontend — Standalone Web Interface

This is the standalone web interface for the **Warehouse Control System (WCS)**. It is built with React 19 and Vite, designed to connect to a remote WCS Backend/Infrastructure.

---

## 🚀 Quick Start

Use this repository if you want to run the WCS Dashboard on a separate machine (e.g., a dedicated monitoring station) within the same LAN as your robots and backend server.

### 1. Prerequisites
*   **Docker Desktop** or **Docker Engine** (v24.0+)
*   The **IP Address** of your WCS Backend server.
*   The **Supabase Anon Key** from your WCS Backend server.

### 2. Initialization
Run the setup script to configure your connection to the backend:
```bash
chmod +x env_init.sh
./env_init.sh
```
The script will ask for:
1.  **Backend Server IP**: (e.g., `10.61.6.33`)
2.  **Anon Key**: The JWT key used for Supabase API access.

### 3. Launch with Docker
Start the frontend container on Port 80:
```bash
docker compose up -d --build
```

---

## 🌐 Accessing the UI

Once the container is running, open your browser and navigate to:
`http://localhost` (or `http://<FRONTEND_MACHINE_IP>`)

The UI will automatically proxy all API requests to the Backend server you configured during setup.

---

## 🛠 Features Included
*   **Interactive Map Designer**: Design warehouse topologies.
*   **Route Optimization (VRP)**: Solve and dispatch multi-robot tasks.
*   **Real-time Fleet Tracking**: Monitor robot positions and status via WebSocket.
*   **Multi-Robot Support**: Switch between `SIMBOT` and physical robots.

---

## 📂 Repository Structure
```text
.
├── src/                # React Source Code
├── public/             # Static Assets
├── Dockerfile          # Production Build Config
├── nginx.conf.template # Nginx Proxy Configuration
├── docker-compose.yml  # Container Orchestration
└── env_init.sh         # Standalone Setup Script
```

---
*Developed by Lertvilai V2 Team.*
