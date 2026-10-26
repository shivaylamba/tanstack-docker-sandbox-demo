# TanStack AI sandbox demos

Two demos of [TanStack AI sandboxes](https://tanstack.com/ai/latest/docs/sandbox/providers-advanced):
JavaScript running in an isolated Docker environment, driven from Node.js on the host.

| Folder | What it shows | Runs on | Needs |
| --- | --- | --- | --- |
| [`demo-1-claude/`](demo-1-claude) | **Node Playground.** An AI agent (Claude Code) gets a Node.js sandbox. It writes code, installs npm packages, makes charts, PDFs, QR codes and CSVs, and starts mock APIs. Host tools reach it over MCP. Web UI for presenting. | `dockerSandbox()` (container) | Docker Desktop, `ANTHROPIC_API_KEY` |
| [`demo-2-codex/`](demo-2-codex) | **Scripted microVM run.** Creates a Docker Sandboxes microVM, runs a fixed report script, exports an Excel workbook and chart, and proves a network deny (HTTP 403). No model involved. | `sbxSandbox()` (microVM) | Docker Sandboxes (`sbx`), hypervisor |

Each folder is self-contained: `cd` into it and follow its README.

```bash
git clone https://github.com/shivaylamba/tanstack-docker-sandbox-demo.git
cd tanstack-docker-sandbox-demo/demo-1-claude   # or demo-2-codex
```
