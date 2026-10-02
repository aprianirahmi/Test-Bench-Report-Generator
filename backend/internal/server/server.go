// Package server builds the app's *gin.Engine (database connection, user
// seeding, every /api route, and the embedded-frontend fallback) as one
// reusable constructor. It is kept out of func main() on purpose, so every
// entry point builds and serves the exact same router: the plain HTTP
// server in backend/main.go today, and the Wails desktop entry point once
// it is scaffolded. Two copies of the route table would drift apart.
package server

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"valve_database/controllers"
	"valve_database/database"
	"valve_database/middleware"
)

// New connects the database, seeds the default users, registers every
// /api route and serves distFS (the embedded Vue build, see the assets
// package) for everything that is not an API or upload route. distFS must
// contain index.html at its root.
//
// The returned cleanup func closes the database handle. Call it on exit
// (defer in main, OnShutdown in Wails) so SQLite can checkpoint its WAL.
func New(distFS fs.FS) (*gin.Engine, func(), error) {
	if err := godotenv.Load(); err != nil {
		log.Println("Notice: .env file not found, using system environment defaults")
	}

	db := database.ConnectDB()
	database.SeedUsers(db)

	sqlDB, err := db.DB()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to obtain SQL DB handle: %w", err)
	}
	cleanup := func() { _ = sqlDB.Close() }

	_ = os.MkdirAll("./images", os.ModePerm)
	_ = os.MkdirAll("./datasheets", os.ModePerm)

	router := gin.Default()

	// CORS for local development: the Vite dev server (:5173) calls this
	// API directly. Harmless when the frontend is served from the same
	// origin (embedded build / Wails), where no cross-origin call happens.
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Static asset routing (uploads)
	router.Static("/images", "./images")
	router.Static("/datasheets", "./datasheets")

	api := router.Group("/api")
	{
		// Health & Auth
		api.GET("/ping", controllers.Ping)
		api.POST("/login", controllers.Login(db))

		// Valve Master Data
		api.GET("/valves", controllers.GetValves(db))
		api.GET("/valves/:id", controllers.GetValveByID(db))
		api.PUT("/valves/:id", middleware.AuthRequired(), controllers.UpdateValve(db))
		api.POST("/valves", middleware.AuthRequired(), middleware.AdminOnly(), controllers.CreateValve(db))
		api.DELETE("/valves/:id", middleware.AuthRequired(), middleware.AdminOnly(), controllers.DeleteValve(db))
		api.POST("/valves/:id/image", middleware.AuthRequired(), middleware.AdminOnly(), controllers.UploadValveImage(db))
		api.POST("/valves/:id/datasheet", middleware.AuthRequired(), middleware.AdminOnly(), controllers.UploadValveDatasheet(db))

		// Test Records & Telemetry Logs
		api.GET("/records", middleware.AuthRequired(), controllers.GetTestRecords(db))
		api.POST("/records", middleware.AuthRequired(), controllers.SaveTestRecord(db))

		// System Settings
		api.GET("/settings", middleware.AuthRequired(), middleware.AdminOnly(), controllers.GetSettings(db))
		api.PUT("/settings", middleware.AuthRequired(), middleware.AdminOnly(), controllers.UpdateSettings(db))

		// OPC UA Telemetry & Actuation
		api.GET("/opcua/data", middleware.AuthRequired(), controllers.GetOpcData(db))
		api.GET("/opcua/status", middleware.AuthRequired(), controllers.GetOpcStatus(db))
		api.POST("/ctrlx/start", middleware.AuthRequired(), controllers.StartOutput(db))
		api.POST("/ctrlx/stop", middleware.AuthRequired(), controllers.StopOutput(db))
	}

	// Everything else is the embedded Vue app.
	router.NoRoute(spaFallback(distFS))

	return router, cleanup, nil
}

// spaFallback serves files from the embedded frontend and falls back to
// index.html for any other GET path, so a hard refresh on a client-side
// route (for example /valves/5) still works in a plain browser tab; Vue
// Router takes over from there. API and upload paths that did not match a
// route get a real 404 instead of HTML, so a mistyped endpoint is not
// mistaken for a working page.
//
// path (not path/filepath) is used on purpose: fs.FS paths are always
// forward-slash, whatever the host OS.
func spaFallback(distFS fs.FS) gin.HandlerFunc {
	fileServer := http.FileServer(http.FS(distFS))

	return func(c *gin.Context) {
		r := c.Request
		p := r.URL.Path

		isRead := r.Method == http.MethodGet || r.Method == http.MethodHead
		isBackendPath := p == "/api" ||
			strings.HasPrefix(p, "/api/") ||
			strings.HasPrefix(p, "/images/") ||
			strings.HasPrefix(p, "/datasheets/")
		if !isRead || isBackendPath {
			c.String(http.StatusNotFound, "404 page not found")
			return
		}

		// A real file in the embedded build (JS, CSS, fonts, favicon...)
		lookup := strings.TrimPrefix(path.Clean("/"+p), "/")
		if lookup != "" {
			if f, err := distFS.Open(lookup); err == nil {
				info, statErr := f.Stat()
				_ = f.Close()
				if statErr == nil && !info.IsDir() {
					fileServer.ServeHTTP(c.Writer, r)
					return
				}
			}
		}

		// Not a file: hand back the app shell.
		index, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			c.String(http.StatusNotFound, "frontend not built: run build-frontend first")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", index)
	}
}
