// Package assets embeds the built Vue frontend into whatever Go binary
// imports it. build-frontend.sh / build-frontend.bat (in backend/) fill
// frontend_dist/ from ../frontend/dist before `go build` or `go run`.
// Only a .gitkeep lives in git; the build output itself is generated and
// ignored.
//
// It is a package of its own because //go:embed only works for files in
// the same directory (or below) as the Go file that declares it. Every
// entry point that serves the frontend (backend/main.go now, the Wails
// desktop entry later) imports this package instead of repeating the
// directive.
package assets

import "embed"

// Frontend is the embedded frontend_dist folder. "all:" keeps files that
// start with "." or "_", which also guarantees the .gitkeep placeholder
// satisfies the compiler on a fresh clone before the frontend was built.
//
//go:embed all:frontend_dist
var Frontend embed.FS
