package main

import (
	"io/fs"
	"log"
	"os"

	"valve_database/assets"
	"valve_database/internal/server"
)

// main is the plain entry point: `go run .`, `air` and `go build` all give
// a normal local HTTP server. The route table lives in internal/server so
// the Wails desktop entry point can serve the identical router from inside
// a native window (see WAILS_MIGRATION.md at the repository root).
func main() {
	distFS, err := fs.Sub(assets.Frontend, "frontend_dist")
	if err != nil {
		log.Fatal("embedded frontend is not usable, run build-frontend first: ", err)
	}

	router, cleanup, err := server.New(distFS)
	if err != nil {
		log.Fatal("server setup failed: ", err)
	}
	defer cleanup()

	// server.New has loaded .env by now, so APP_PORT / APP_HOST from .env
	// are visible here. Default behaviour is unchanged: all interfaces,
	// port 8080. Set APP_HOST=127.0.0.1 to keep it local-only.
	appPort := os.Getenv("APP_PORT")
	if appPort == "" {
		appPort = "8080"
	}
	addr := os.Getenv("APP_HOST") + ":" + appPort

	if err := router.Run(addr); err != nil {
		log.Fatalf("Server startup failed: %v", err)
	}
}
