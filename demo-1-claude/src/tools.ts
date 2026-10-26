/**
 * Host tools. These run on YOUR machine (with your disk, DB and secrets), but
 * the agent inside the sandbox sees them as MCP tools: `mcp__tanstack__<name>`.
 * TanStack AI's tool bridge carries only the call and the result across.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { SandboxCapability } from '@tanstack/ai-sandbox'
import { z } from 'zod'
import { APP_PORT, currentHandle } from './sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export const ARTIFACT_DIR = join(process.cwd(), 'artifacts')

type ToolContext = {
  getOptional?: <T>(cap: unknown) => T | undefined
  emitCustomEvent?: (name: string, value: Record<string, unknown>) => void
}

function sandboxFrom(context: unknown): SandboxHandle {
  const ctx = context as ToolContext | undefined
  const handle =
    (ctx?.getOptional?.(SandboxCapability) as SandboxHandle | undefined) ??
    currentHandle
  if (!handle) throw new Error('No sandbox is running for this request.')
  return handle
}

export const publishArtifact = toolDefinition({
  name: 'publish_artifact',
  description:
    'Copy a file out of the sandbox and show it to the audience. Use for every PNG, SVG, PDF, CSV, HTML, JSON or Markdown file you create.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path of the file inside the sandbox'),
    title: z.string().describe('Short caption for the audience'),
  }),
}).server(async ({ path, title }, context) => {
  const handle = sandboxFrom(context)
  const bytes = await handle.fs.readBytes(path)
  const name = `${Date.now()}-${basename(path)}`
  await mkdir(ARTIFACT_DIR, { recursive: true })
  await writeFile(join(ARTIFACT_DIR, name), bytes)

  const artifact = {
    url: `/artifacts/${encodeURIComponent(name)}`,
    title,
    path,
    ext: extname(path).slice(1).toLowerCase(),
    bytes: bytes.byteLength,
  }
  ;(context as ToolContext | undefined)?.emitCustomEvent?.(
    'demo.artifact',
    artifact,
  )
  return { ok: true, publishedAs: artifact.url, bytes: artifact.bytes }
})

export const exposePort = toolDefinition({
  name: 'expose_port',
  description: `Make a server running inside the sandbox on port ${APP_PORT} reachable from the audience's browser. Start the server first.`,
  inputSchema: z.object({
    path: z
      .string()
      .default('/')
      .describe('Path to open first, e.g. /api/users'),
    label: z.string().describe('What the server is, e.g. "Mock users API"'),
  }),
}).server(async ({ path = '/', label }, context) => {
  const handle = sandboxFrom(context)
  const { url } = await handle.ports.connect(APP_PORT)
  const full = `${url}${path.startsWith('/') ? path : `/${path}`}`
  ;(context as ToolContext | undefined)?.emitCustomEvent?.('demo.port', {
    url: full,
    label,
  })
  return { ok: true, hostUrl: full }
})

/** Pretend this is a production database the sandbox must never touch directly. */
const FEEDBACK = [
  { talk: 'Node.js Sandboxes + MCP', track: 'AI', rating: 4.8, attendees: 412 },
  { talk: 'Streams in Depth', track: 'Core', rating: 4.3, attendees: 268 },
  { talk: 'Edge Functions at Scale', track: 'Infra', rating: 4.1, attendees: 301 },
  { talk: 'TypeScript 6 Tricks', track: 'Lang', rating: 4.6, attendees: 377 },
  { talk: 'Observability for Agents', track: 'AI', rating: 4.4, attendees: 289 },
  { talk: 'WebGPU in the Browser', track: 'Web', rating: 3.9, attendees: 198 },
]

export const getTalkFeedback = toolDefinition({
  name: 'get_talk_feedback',
  description:
    'Read conference talk feedback from the host database (ratings and attendance). The sandbox has no other way to reach this data.',
  inputSchema: z.object({
    track: z.string().optional().describe('Optional track filter, e.g. "AI"'),
  }),
}).server(async ({ track }) =>
  track
    ? FEEDBACK.filter((f) => f.track.toLowerCase() === track.toLowerCase())
    : FEEDBACK,
)

export const hostTools = [publishArtifact, exposePort, getTalkFeedback]
