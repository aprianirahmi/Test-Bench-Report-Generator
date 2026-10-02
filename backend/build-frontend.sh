#!/usr/bin/env bash
# Builds the Vue frontend in "embedded" mode and copies the result into
# backend/assets/frontend_dist, which the Go binary embeds through the
# //go:embed directive in assets/assets.go. Run it before `go build` /
# `go run .` in this folder, and again whenever frontend source changes.
#
# VITE_EMBEDDED=true makes the frontend call a relative "/api" (same
# origin as the page, because the Go binary serves both). Without it the
# build keeps the development default, an absolute http://localhost:8080/api.
# Windows without bash: use build-frontend.bat.
set -e
cd "$(dirname "$0")"

rm -rf assets/frontend_dist
mkdir -p assets/frontend_dist

(
  cd ../frontend
  npm install
  VITE_EMBEDDED=true npm run build
)

cp -r ../frontend/dist/. assets/frontend_dist/
touch assets/frontend_dist/.gitkeep
echo "frontend built into backend/assets/frontend_dist/"
