# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```sh
make setup          # First-time: clone vendor, npm install, build WASM
make dev            # Start Tauri dev server (frontend + backend)
make wasm           # Rebuild FrankenTermWeb WASM module only
make build          # Production build (requires icons: make icon SRC=path.png)
make icon SRC=...   # Generate app icons from source image
make clean          # Remove vendor/, src/wasm/, node_modules/
npm run lint        # Run oxlint on src/
```

The WASM build requires Rust nightly with `wasm32-unknown-unknown` target and `wasm-pack`.

## Architecture

Yolo is a terminal emulator with three tiers:

```
React (canvas) ←→ Tauri IPC ←→ Rust (portable-pty)
```

**Frontend** (`src/`): A single `Terminal` component renders a `<canvas>` using FrankenTermWeb (WASM). The WASM module handles VT parsing, grid state, and rendering via WebGPU/canvas2d.

**IPC Bridge** (`src-tauri/src/lib.rs`): Three Tauri commands — `spawn_shell`, `write_pty`, `resize_pty`. PTY output streams to the frontend via a Tauri `Channel<Vec<u8>>`.

**Backend** (`src-tauri/src/pty.rs`): `PtyHandle` wraps portable-pty. A reader thread continuously reads PTY output (8KB buffer) and sends bytes through the Tauri Channel.

### Data Flow

- **Shell → Screen**: PTY reader thread → Channel → `term.feed(bytes)` → `term.render()` on RAF loop
- **Keyboard → Shell**: `term.input(event)` → `drainEncodedInputBytes()` → `invoke("write_pty")`
- **Resize**: ResizeObserver → debounced 150ms → `term.fitToContainer()` + `invoke("resize_pty")` → SIGWINCH

### Vendor Dependency

FrankenTermWeb is built from a fork at `vendor/frankentui` (cloned by `make setup`). The fork includes a fix for shadow_cells corruption on resize ([PR #22](https://github.com/Dicklesworthstone/frankentui/pull/22)). The WASM output goes to `src/wasm/frankenterm-web/` — both directories are gitignored.

## Key Constraints

- FrankenTermWeb's terminal engine does **not support reflow** on resize. Width decrease truncates cells; height changes push/pull scrollback rows. This causes visible artifacts (duplicate prompts, content shifting) similar to xterm.
- The resize handler debounces the entire `fitToContainer()` + `resize_pty` to prevent progressive content loss from repeated scrollback operations during drag-resize.
- Cell dimensions are hardcoded: 9px width, 18px height. The renderer uses "Pragmasevka NF" font with "monospace" fallback.
