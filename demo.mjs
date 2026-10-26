import { createInterface } from 'node:readline/promises';
import { sbxSandbox } from '@tanstack/ai-sandbox-docker';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(root, 'artifacts');
const temporary = await mkdtemp(path.join(tmpdir(), 'tanstack-sbx-demo-'));
const fixture = path.join(temporary, 'fixture');
const marker = path.join(temporary, 'host-only-marker.txt');
const id = `cityjs-tanstack-${process.pid}`;
const transcript = [];
const signal = AbortSignal.timeout(600_000);
let sandbox;

// Only these synthetic files enter the private clone. No project credentials.
await mkdir(artifacts, { recursive: true });
await cp(path.join(root, 'fixture'), fixture, { recursive: true });
await writeFile(marker, 'Synthetic host-only marker.\n');
await exec('git', ['init', '--quiet'], { cwd: fixture });
await exec('git', ['add', '.'], { cwd: fixture });
await exec('git', ['-c', 'user.name=Sandbox Demo', '-c', 'user.email=demo@example.invalid',
  'commit', '--quiet', '-m', 'Synthetic sales fixture'], { cwd: fixture });

const provider = sbxSandbox({
  sbxBinary: path.join(root, 'sbx-compat'),
  workspaceDir: fixture,
  allowNetwork: ['registry.npmjs.org'],
  denyNetwork: ['example.com'],
  cpus: 2,
  memory: '2g',
  logger: console,
});

async function run(label, command) {
  console.log(`\n[${label}] ${command}`);
  const result = await sandbox.process.exec(command, { signal });
  transcript.push({ label, ...result });
  if (result.stdout) console.log(result.stdout.trimEnd());
  if (result.stderr) console.error(result.stderr.trimEnd());
  if (result.exitCode !== 0) throw new Error(`${label} failed: exit ${result.exitCode}`);
  return result;
}

try {
  console.log('Creating a real microVM through TanStack sbxSandbox()...');
  console.log('First run: use SBX_PULL_POLICY=missing if no shell template is cached.');
  sandbox = await provider.create({ id, signal });
  console.log(`SANDBOX: ${sandbox.id}`);
  await run('runtime', 'uname -s; node --version');
  await run('install', 'npm install --ignore-scripts --no-audit --no-fund exceljs@4.4.0');
  await run('report', 'node report.cjs');
  // Quote the generated host path for the guest shell.
  const quotedMarker = `'${marker.replaceAll("'", "'\\''")}'`;
  await run('host-marker', `if test -f ${quotedMarker}; then echo HOST_MARKER_VISIBLE; exit 1; else echo HOST_MARKER_NOT_VISIBLE; fi`);
  const network = await run('denied-network',
    "curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://example.com");
  if (network.stdout.trim() !== '403') throw new Error('Expected denied network HTTP 403');

  const report = JSON.parse(await sandbox.fs.read('result.json'));
  if (report.customersCompared !== 4 || report.dropped.length !== 2 ||
      report.dropped.find(r => r.name === 'Acme')?.change !== -4000 ||
      report.dropped.find(r => r.name === 'Cedar')?.change !== -2000) {
    throw new Error('Unexpected synthetic sales calculations');
  }
  for (const name of ['sales-report.xlsx', 'spending-drop.svg', 'result.json']) {
    const bytes = await sandbox.fs.readBytes(name);
    await writeFile(path.join(artifacts, name), bytes);
    console.log(`EXPORTED ${name}: ${bytes.length} bytes`);
  }
  console.log('\nTANSTACK_SBX_DEMO_OK');
  console.log(`Artifacts: ${artifacts}`);

  if (process.argv.includes('--hold') || process.env.DEMO_HOLD === '1') {
    const holdController = new AbortController();
    const hold = sandbox.process.exec('sleep 3600', { signal: holdController.signal })
      .catch(error => { if (!holdController.signal.aborted) throw error; });
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\nSecond terminal:\n  sbx ls\n  sbx exec ${sandbox.id} -- sh -lc 'uname -s; node --version; cat result.json'\n  sbx policy log ${sandbox.id} --limit 10`);
    try {
      await terminal.question('\nLive inspection (up to 1 hour). Press Enter to remove the sandbox.\n');
    } finally {
      terminal.close();
      holdController.abort();
      await hold;
    }
  }
} finally {
  await writeFile(path.join(artifacts, 'transcript.json'), JSON.stringify(transcript, null, 2));
  try {
    if (sandbox) {
      await sandbox.destroy();
      console.log('Demo sandbox removed.');
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
