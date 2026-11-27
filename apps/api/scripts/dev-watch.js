const { spawn } = require('child_process');
const path = require('path');

const apiRoot = path.resolve(__dirname, '..');
const tscBin = require.resolve('typescript/bin/tsc');
const mainEntry = path.resolve(apiRoot, 'dist/main.js');

let serverProcess = null;
let restartPromise = Promise.resolve();
let stopping = false;
let compileBuffer = '';

function killProcess(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore force kill errors
      }
      resolve();
    }, 3000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      proc.kill();
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function scheduleServerRestart() {
  restartPromise = restartPromise.then(async () => {
    if (stopping) return;
    await killProcess(serverProcess);
    if (stopping) return;
    serverProcess = spawn(process.execPath, [mainEntry], {
      cwd: apiRoot,
      stdio: 'inherit',
      env: process.env,
    });
    serverProcess.on('exit', () => {
      serverProcess = null;
    });
  });
}

const tscProcess = spawn(
  process.execPath,
  [tscBin, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  {
    cwd: apiRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  },
);

tscProcess.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  compileBuffer += text.replace(/\x1b\[[0-9;]*m/g, '');
  if (/Found 0 errors\./i.test(compileBuffer)) {
    compileBuffer = '';
    scheduleServerRestart();
  } else if (compileBuffer.length > 4096) {
    compileBuffer = compileBuffer.slice(-2048);
  }
});

tscProcess.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await killProcess(serverProcess);
  await killProcess(tscProcess);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
