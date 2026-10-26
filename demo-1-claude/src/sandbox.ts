import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createSecrets,
  defineSandbox,
  defineSandboxPolicy,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export const HARNESS = (process.env.HARNESS ?? 'claude') as 'claude' | 'codex'
export const PROVIDER = (process.env.PROVIDER ?? 'docker') as 'docker' | 'local'

/** Port the agent should bind mock APIs / dev servers to inside the sandbox. */
export const APP_PORT = 3000

/** Docker Desktop on macOS does not always link /var/run/docker.sock. */
function dockerSocket(): string | undefined {
  if (process.env.DOCKER_HOST?.startsWith('unix://')) {
    return process.env.DOCKER_HOST.slice('unix://'.length)
  }
  const desktop = join(homedir(), '.docker/run/docker.sock')
  return existsSync(desktop) ? desktop : undefined
}

// The most recent sandbox handle, so the HTTP server can list files.
export let currentHandle: SandboxHandle | undefined

/**
 * Pre-installed during setup so they land in the snapshot: the live demos then
 * start instantly and survive bad conference Wi-Fi.
 */
const DEMO_PACKAGES = [
  'chart.js@4',
  '@napi-rs/canvas',
  'qrcode',
  'jsqr',
  'pngjs',
  'pdfkit',
  '@faker-js/faker',
  'express',
  'cheerio',
]

const INSTRUCTIONS = `
# Node.js Playground

You are running inside a throwaway Node.js 22 sandbox. Nothing you do here can
hurt the host, so act like a developer with a fresh laptop:

- Work in /workspace. Create a sub-folder per task (e.g. /workspace/qr).
- Install any npm package you need with \`npm i <pkg>\` (no need to ask).
- Write real JavaScript files and run them with \`node\`. Show the important
  part of the output.
- When you produce a file the audience should see (PNG, SVG, PDF, CSV, HTML,
  JSON, MD), call the \`publish_artifact\` tool with its absolute path. That is
  the ONLY way files leave the sandbox.
- These packages are already installed in /workspace/node_modules, so prefer
  them: ${DEMO_PACKAGES.join(', ')}.
- Charts: render a PNG with \`chart.js\` on a \`@napi-rs/canvas\` canvas
  (\`Chart.register(...registerables)\`, \`animation: false\`,
  \`responsive: false\`, then \`canvas.toBuffer('image/png')\`). Do NOT use
  chartjs-node-canvas or canvas: they need native builds.
- Servers (mock APIs, previews): listen on 0.0.0.0:${APP_PORT}, start them in
  the background with \`nohup node server.js > server.log 2>&1 &\`, curl them
  to prove they work, then call \`expose_port\` so the audience can open it.
- Private host data (like talk feedback) is only reachable through the
  \`get_talk_feedback\` tool. Use it instead of inventing data.
- Keep the final answer short: what you built, and how you verified it.
`.trim()

const secrets = createSecrets(
  HARNESS === 'claude'
    ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' }
    : { CODEX_API_KEY: process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY ?? '' },
)

const CLI_INSTALL =
  HARNESS === 'claude'
    ? 'npm i -g @anthropic-ai/claude-code'
    : 'npm i -g @openai/codex'

const socketPath = dockerSocket()

/**
 * `npm run build:image` bakes the agent CLIs and DEMO_PACKAGES into this image
 * (see Dockerfile), so a new sandbox starts in seconds. Set
 * SANDBOX_IMAGE=node:22 to install everything at setup time instead (slow).
 */
const IMAGE = process.env.SANDBOX_IMAGE ?? 'node-playground:latest'
const PREBAKED = IMAGE !== 'node:22'

export const playground = defineSandbox({
  id: 'node-playground',
  provider:
    PROVIDER === 'docker'
      ? dockerSandbox({
          image: IMAGE,
          publishPorts: [APP_PORT],
          ...(socketPath ? { dockerodeOptions: { socketPath } } : {}),
        })
      : localProcessSandbox({
          scrubEnv: ['ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'OPENAI_API_KEY'],
        }),
  workspace: defineWorkspace({
    source: { type: 'none' },
    // Runs once per fresh sandbox. Nothing to do when the image is prebaked.
    setup:
      PROVIDER === 'docker' && !PREBAKED
        ? [
            CLI_INSTALL,
            'cd /workspace && npm init -y > /dev/null',
            `cd /workspace && npm i --no-audit --no-fund ${DEMO_PACKAGES.join(' ')}`,
            'git init -q /workspace',
          ]
        : [],
    instructions: INSTRUCTIONS,
    secrets,
  }),
  policy: defineSandboxPolicy({
    // Isolation comes from the container, so let the agent work freely,
    // but still block the obviously destructive stuff.
    commands: { deny: ['rm -rf /', 'rm -rf /*', 'shutdown *', 'reboot *'] },
    default: 'allow',
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
  hooks: {
    onReady: (handle) => {
      currentHandle = handle
      console.log(`[sandbox] ready ${handle.provider} ${handle.id}`)
    },
    onError: (err) => console.error('[sandbox] error', err),
    onDestroy: () => console.log('[sandbox] destroyed'),
  },
})
