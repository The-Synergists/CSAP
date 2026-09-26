// Runs a command with the ai_engine virtualenv's Python, on Windows or macOS/Linux.
// Usage: node scripts/py.mjs [--cwd pan_api] -m pytest -q   (default cwd: ai_engine)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const engineDir = path.resolve(import.meta.dirname, '..', 'ai_engine');
const candidates = [path.join(engineDir, '.venv', 'Scripts', 'python.exe'), path.join(engineDir, '.venv', 'bin', 'python')];
const python = candidates.find((p) => existsSync(p));
if (!python) {
  console.error('ai_engine/.venv not found. Create it: python -m venv ai_engine/.venv && pip install -r ai_engine/requirements.txt');
  process.exit(1);
}
let args = process.argv.slice(2);
let cwd = engineDir;
if (args[0] === '--cwd') {
  cwd = path.resolve(import.meta.dirname, '..', args[1]);
  args = args.slice(2);
}
const { status } = spawnSync(python, args, { cwd, stdio: 'inherit' });
process.exit(status ?? 1);
