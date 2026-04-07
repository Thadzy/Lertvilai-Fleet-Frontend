#!/usr/bin/env bash

echo "------------------------------------------------"
echo "  WCS Frontend Standalone Setup"
echo "------------------------------------------------"

# Ask for Backend Host IP
read -rp "Enter Backend Server IP (e.g. 10.61.6.33): " BACKEND_IP
BACKEND_IP="${BACKEND_IP:-127.0.0.1}"

# Ask for Supabase Anon Key
echo "Please provide the Supabase ANON_KEY from the Backend server's .env file."
read -rp "Anon Key: " ANON_KEY

# Create .env file
cat <<EOF > .env
VITE_SUPABASE_URL=http://${BACKEND_IP}:8000
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
FLEET_GATEWAY_URL=http://${BACKEND_IP}:8080
VRP_URL=http://${BACKEND_IP}:18080
EOF

echo ""
echo "Configuration saved to .env"
echo "You can now run: docker compose up -d --build"
echo "------------------------------------------------"
