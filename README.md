# Yolo

A terminal emulator built with Tauri 2, React, and [FrankenTermWeb](https://github.com/Dicklesworthstone/frankentui) (WASM).

## Architecture

```
┌─────────────────────────────────────────────┐
│  Tauri Window (WebView)                     │
│  ┌───────────────────────────────────────┐  │
│  │  <canvas> — FrankenTermWeb (WASM)     │  │
│  │  Renders terminal grid via WebGPU     │  │
│  └──────────────┬────────────▲───────────┘  │
│        keyboard/ │            │ PTY output   │
│        mouse     │            │ (bytes)      │
│  ┌───────────────▼────────────┴───────────┐  │
│  │  Tauri IPC (invoke / Channel)          │  │
│  └───────────────┬────────────▲───────────┘  │
├──────────────────┼────────────┼──────────────┤
│  Rust Backend    │            │              │
│  ┌───────────────▼────────────┴───────────┐  │
│  │  portable-pty — shell process          │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Prerequisites

- [Rust](https://rustup.rs/) (nightly toolchain + `wasm32-unknown-unknown` target)
- [Node.js](https://nodejs.org/) (v20+)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- Tauri 2 system dependencies ([see docs](https://v2.tauri.app/start/prerequisites/))

Install Rust nightly and WASM target:

```sh
rustup toolchain install nightly
rustup target add wasm32-unknown-unknown --toolchain nightly
cargo install wasm-pack
```

## Setup

```sh
make setup
```

This will:

1. Clone [frankentui](https://github.com/chenhunghan/frankentui) into `vendor/frankentui`
2. Install npm dependencies
3. Build the FrankenTermWeb WASM module into `src/wasm/`

## Development

```sh
make dev
```

## Production Build

```sh
make build
```

## Clean

```sh
make clean
```

Removes `vendor/`, `src/wasm/`, and `node_modules/`.
