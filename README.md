# yolo

A native macOS app that launches isolated Linux VMs pre-configured for vibe coding with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Drop a folder, get a sandbox. Each VM comes with Claude Code CLI, Docker, GitHub CLI, and everything you need — ready in minutes.

## Features

- **One-click sandbox**: Auto-creates and starts a Lima VM on first launch. No configuration needed.
- **Drag & drop**: Drop a folder onto the window to mount it into the VM, or drop a file to copy it in.
- **Integrated terminal**: Built-in terminal with tabs, side-by-side splits, and dedicated Claude Code / btop tabs.
- **Native performance**: Tauri + Rust backend, React frontend, macOS Virtualization.framework (`vz`).

## What's in the box

Each `yolo-*` VM is provisioned with:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (`--dangerously-skip-permissions` ready)
- Docker, GitHub CLI (`gh`), btop
- Node.js, Python 3, Bun, Git, curl, jq, vim
- Starship prompt, zsh as default shell
- Ubuntu 24.04 (arm64/amd64)

Default VM sizing: half your CPU cores (min 1), 2 GiB RAM, 40 GiB disk.

## Installation

### Homebrew (Recommended)

```bash
brew install chenhunghan/tap/yolo
```

### Download

Download the latest `.dmg` from [Releases](https://github.com/chenhunghan/yolo/releases), then:

1. Drag **yolo** to **Applications**.
2. Remove the quarantine attribute (unsigned binary):
   ```bash
   xattr -cr /Applications/yolo.app
   ```
3. Launch yolo.

### Build from Source

**Requirements:** Node.js 18+, Rust (stable), [`limactl`](https://github.com/lima-vm/lima) in PATH.

```bash
git clone https://github.com/chenhunghan/yolo.git
cd yolo
npm install
npm run tauri dev      # development
npm run tauri build    # production
```

## License

Copyright © 2025 Hung-Han Chen <chenhungh@gmail.com>.

Licensed under the dual [MIT](LICENSE-MIT) and [Apache-2.0](LICENSE-APACHE) licenses.
