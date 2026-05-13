import { execFileSync } from 'node:child_process';

const ports = process.argv.slice(2);

if (ports.length === 0) {
  console.error('Usage: node scripts/kill-dev-ports.mjs <port> [port...]');
  process.exit(1);
}

function findPids(port) {
  try {
    return execFileSync('lsof', ['-ti', `tcp:${port}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((pid) => pid.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (const port of ports) {
  const pids = findPids(port);

  if (pids.length === 0) {
    continue;
  }

  console.log(`Freeing port ${port}: ${pids.join(', ')}`);

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  sleep(500);

  for (const pid of findPids(port)) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }
}
