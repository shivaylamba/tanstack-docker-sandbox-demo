import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import { withSandbox } from '@tanstack/ai-sandbox'
import { HARNESS, PROVIDER, currentHandle, playground } from './sandbox'
import { ARTIFACT_DIR, hostTools } from './tools'

const PORT = Number(process.env.PORT ?? 4321)
const PUBLIC_DIR = join(process.cwd(), 'public')

// Local-process mode reuses your `claude login` / `codex login` instead of a key.
const authMode = PROVIDER === 'local' ? 'host' : 'api-key'
const adapter =
  HARNESS === 'claude'
    ? claudeCodeText(process.env.MODEL ?? 'sonnet', { authMode })
    : codexText(process.env.MODEL ?? 'gpt-5.3-codex', { authMode })

/** Claude Code session per thread, so follow-up prompts keep their context. */
const sessions = new Map<string, string>()

type Message = { role: 'user' | 'assistant'; content: string }

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

async function readJson(req: import('node:http').IncomingMessage) {
  const chunks: Array<Buffer> = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const { threadId, messages } = (await readJson(req)) as {
      threadId: string
      messages: Array<Message>
    }
    const abortController = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) abortController.abort()
    })
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)
    send({ type: 'CUSTOM', name: 'demo.boot', value: { harness: HARNESS, provider: PROVIDER } })

    const sessionId = sessions.get(threadId)
    const stream = chat({
      threadId,
      adapter,
      messages: sessionId ? messages.slice(-1) : messages,
      tools: hostTools,
      abortController,
      middleware: [withSandbox(playground)],
      ...(sessionId ? { modelOptions: { sessionId } } : {}),
    })

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'CUSTOM' && chunk.name === 'claude-code.session-id') {
          const value = chunk.value as { sessionId?: string } | string
          const id = typeof value === 'string' ? value : value?.sessionId
          if (id) sessions.set(threadId, id)
        }
        send(chunk)
      }
    } catch (err) {
      send({ type: 'RUN_ERROR', message: err instanceof Error ? err.message : String(err) })
    }
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    if (!currentHandle) return void res.end('[]')
    const r = await currentHandle.process.exec(
      `find /workspace -maxdepth 3 \\( -name node_modules -o -name .git -o -name '.tanstack*' -o -name '.claude' -o -name '.codex' \\) -prune -o -type f -printf '%P\\t%s\\n' | sort | head -200`,
      { cwd: '/workspace' },
    )
    const files = r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [path, size] = line.split('\t')
        return { path, size: Number(size) }
      })
      .filter((f) => !/^(tanstack-|AGENTS\.md|CLAUDE\.md|GEMINI\.md|package(-lock)?\.json)/.test(f.path))
    res.writeHead(200, { 'content-type': 'application/json' })
    return void res.end(JSON.stringify({ id: currentHandle.id, files }))
  }

  if (req.method === 'GET' && url.pathname.startsWith('/artifacts/')) {
    const file = normalize(decodeURIComponent(url.pathname.slice('/artifacts/'.length)))
    const full = join(ARTIFACT_DIR, file)
    if (!full.startsWith(ARTIFACT_DIR) || !existsSync(full)) {
      res.writeHead(404)
      return void res.end()
    }
    res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' })
    return void createReadStream(full).pipe(res)
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': MIME['.html'] })
    return void res.end(await readFile(join(PUBLIC_DIR, 'index.html')))
  }

  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  console.log(`\n  Node Playground  →  http://localhost:${PORT}`)
  console.log(`  harness=${HARNESS}  provider=${PROVIDER}\n`)
})
