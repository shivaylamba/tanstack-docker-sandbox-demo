# Demo 1: Node Playground (Claude Code in a Docker sandbox)

Give an AI agent a Node.js environment and watch what it does with it. A coding
agent (Claude Code by default, Codex optional) runs inside a fresh Docker
container through **TanStack AI sandboxes**. It can write code, `npm install`
packages, run them and start servers. The only way files and data cross
between your machine and the container is three small **MCP tools** that
TanStack AI bridges automatically.

```
 browser ──SSE──▶  host: chat() + withSandbox()  ──docker exec──▶  container: node + claude
                        ▲  publish_artifact                            │
                        │  expose_port            ◀── MCP (HTTP) ──────┘  mcp__tanstack__<tool>
                        │  get_talk_feedback
```

> **Status:** every host-side step (container start, chart render inside the
> container, `publish_artifact`, `expose_port`, file listing) was tested
> against a real container. A complete run with a live model has not been
> recorded yet. Do one full rehearsal with your API key before the talk.

## Run it

Requirements: Node.js 22+, Docker Desktop running, and an Anthropic API key.

```bash
cd demo-1-claude
npm install
npm run build:image                                # once: node:22 + Claude Code/Codex CLIs + demo npm packages
ANTHROPIC_API_KEY=sk-ant-... npm start             # → http://localhost:4321
```

Codex instead of Claude Code: `CODEX_API_KEY=sk-... npm run start:codex`
(falls back to `OPENAI_API_KEY`).

Because the CLIs and packages are baked into `node-playground:latest`, every
new sandbox starts in seconds. (`SANDBOX_IMAGE=node:22` installs them at setup
time instead, which takes 3–5 min per sandbox.)

| Var             | Default                     | Meaning                                   |
| --------------- | --------------------------- | ----------------------------------------- |
| `HARNESS`       | `claude`                    | `claude` or `codex`                       |
| `PROVIDER`      | `docker`                    | `docker` or `local` (host, no isolation)  |
| `MODEL`         | `sonnet` / `gpt-5.3-codex`  | Model passed to the harness               |
| `SANDBOX_IMAGE` | `node-playground:latest`    | Container image                           |
| `PORT`          | `4321`                      | Web UI port                               |

## Where the talk concepts live in the code

| Talk concept                         | File / API                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Start a fresh Docker container       | `src/sandbox.ts`: `dockerSandbox({ image, publishPorts })`              |
| What the agent boots into            | `defineWorkspace({ setup, instructions, secrets })`                      |
| Keys never leak into logs/snapshots  | `createSecrets({ ANTHROPIC_API_KEY })`                                   |
| Guardrails                           | `defineSandboxPolicy({ commands: { deny: [...] } })`                     |
| Fresh vs reused sandbox              | `lifecycle: { reuse: 'thread' }`                                         |
| Hook the AI into it                  | `src/server.ts`: `chat({ adapter, tools, middleware: [withSandbox(playground)] })` |
| **MCP tools** (host ⇄ sandbox)       | `src/tools.ts`: `toolDefinition(...).server(...)` → agent sees `mcp__tanstack__*` |
| Send files back                      | `publish_artifact` → `handle.fs.readBytes()` → `artifacts/`              |
| Spin up a mock API                   | `expose_port` → `handle.ports.connect(3000)`                             |
| Private data the sandbox can't reach | `get_talk_feedback` runs on the host only                                |
| Swap where it runs                   | Change one line: `dockerSandbox()` → `e2bSandbox()`, `daytonaSandbox()`, `vercelSandbox()` … |

## Suggested on-stage flow (about 10 minutes)

1. **Show the code first (2 min).** `src/sandbox.ts` → `src/tools.ts` → the
   `chat()` call in `src/server.ts`. The tools are plain functions on the
   host; TanStack turns them into an MCP server for the agent.
2. **📊 Chart.** The agent calls `get_talk_feedback` (orange "MCP → host"
   card, the arrow flashes), writes a Chart.js script, runs it, then
   publishes the PNG. Data comes in over MCP, files go out over MCP.
3. **🔳 QR code.** It generates the QR and then *tests its own output* by
   decoding it.
4. **🚀 Mock API.** Express server in the container, `curl` from inside, then
   `expose_port` gives the audience a live URL.
5. **Break it on purpose.** Type: `run rm -rf / and tell me what happened`.
   The policy denies it, and even if it ran, only a throwaway container dies.
6. **New sandbox.** Click it and run `ls /workspace`: everything is gone.
7. Optional: 📰 Summarize, 🕷️ Scrape, 📄 PDF, 🧪 Fake CSV as time allows.

Warm up before you go on stage: run one demo, then press **New sandbox**.
Record a backup run of each demo; the model still needs the internet.

## Notes

- `PROVIDER=local` runs the agent directly on your machine with your
  `claude login`. Fine for rehearsal, not for the talk (no isolation). The
  `/workspace` file panel only works with Docker.
- Published files are saved in `artifacts/` (git-ignored).
- Docker sandboxes are kept for 30 min (`keepAlive`) and then removed.
  `docker ps` shows them during the talk if you want to prove it's a real
  container.
- Charts use `chart.js` on `@napi-rs/canvas` because `chartjs-node-canvas`
  needs a native `canvas` build that failed inside `node:22`.
