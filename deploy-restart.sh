#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${ROOT_DIR}/Pulpy_Reporting_Portal_frontend"
BACKEND_DIR="${ROOT_DIR}/Pulpy_Reporting_Portal_Backend"

echo "Building frontend..."
cd "${FRONTEND_DIR}"
npm run build

echo "Restarting backend with PM2 ecosystem..."
cd "${BACKEND_DIR}"
if [[ -f "ecosystem.ejs" ]]; then
  pm2 restart ecosystem.ejs --update-env
elif [[ -f "ecosystem.config.cjs" ]]; then
  pm2 restart ecosystem.config.cjs --update-env
else
  echo "No PM2 ecosystem file found (expected ecosystem.ejs or ecosystem.config.cjs)."
  exit 1
fi

echo "Deployment restart complete."
