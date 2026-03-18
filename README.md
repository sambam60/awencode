# awencode

A beautifully designed agentic coding interface. Orchestrate multiple AI coding agents from a spatial dashboard — not a chat list.

## Architecture

Awencode is a Tauri v2 desktop app (React + TypeScript frontend, Rust backend) that connects to `codex-rs/app-server` via JSON-RPC over stdio. The orchestrator dashboard shows agent tasks as stateful cards on a kanban board, with full conversation views available per-agent.

## Development

```bash
# Install dependencies
pnpm install

# Run the desktop app in dev mode
pnpm dev

# Build for production
pnpm build
```

## Structure

```
apps/desktop/       # Tauri + React desktop app
codex-rs/           # Rust backend (app-server, core engine)
sdk/python/         # Python app-server client
docs/               # Documentation
ideation/           # Design references and prototypes
```

## License

Apache-2.0
