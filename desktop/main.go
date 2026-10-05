// Command desktop is the Wails shell around the Valve Database app.
//
// It adds no routes of its own. The Gin router built by
// valve_database/internal/server (the same one backend/main.go serves over
// HTTP) is handed to Wails as the AssetServer handler, so the Vue build and
// every /api, /images and /datasheets request are answered in-process inside
// the native window. No TCP port is opened.
//
// The module is named valve_database/desktop on purpose: Go only lets
// packages under the import path "valve_database/" import
// valve_database/internal/..., and a differently named module would be
// refused.
package main

import (
	"context"
	"io/fs"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"valve_database/assets"
	"valve_database/internal/server"
)

func main() {
	// data.db, .env, images/, datasheets/ and the OPC UA certificates are
	// all resolved relative to the working directory. Pin it to the folder
	// of the .exe so the app behaves the same whether it is started from a
	// shortcut, Explorer, or a terminal in another folder.
	if exe, err := os.Executable(); err == nil {
		if err := os.Chdir(filepath.Dir(exe)); err != nil {
			log.Println("could not switch to the executable folder: ", err)
		}
	}

	distFS, err := fs.Sub(assets.Frontend, "frontend_dist")
	if err != nil {
		log.Fatal("embedded frontend is not usable, run backend\\build-frontend.bat first: ", err)
	}

	router, cleanup, err := server.New(distFS)
	if err != nil {
		log.Fatal("server setup failed: ", err)
	}

	err = wails.Run(&options.App{
		Title: "Valve Database - Test Bench Report Generator",
		// Size when restored from maximised. Kept small enough to fit a
		// 1920x1080 screen at 125% display scaling (1280x720 -> 1600x900 px),
		// otherwise the title bar ends up above the screen edge.
		Width:            1280,
		Height:           720,
		MinWidth:         1024,
		MinHeight:        640,
		WindowStartState: options.Maximised,
		AssetServer: &assetserver.Options{
			Handler: router,
		},
		BackgroundColour: &options.RGBA{R: 0, G: 43, B: 73, A: 255},
		OnShutdown: func(ctx context.Context) {
			cleanup()
		},
	})
	if err != nil {
		log.Fatal("wails: ", err)
	}
}
