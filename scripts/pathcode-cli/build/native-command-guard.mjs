/**
 * P16 execution guard. Creator commands never receive this private IPC channel.
 * If the coordinator dies, disconnect kills this detached, owned process group.
 */
import { spawn } from 'node:child_process';

if (typeof process.send !== 'function' || !process.connected || process.argv.length < 3) process.exit(2);
let started = false;
const terminate = () => {
  try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); }
};
process.on('disconnect', terminate);
process.on('message', message => {
  if (started || message?.kind !== 'native.start') return;
  started = true;
  if (!process.connected) return terminate();
  const [command, ...argv] = process.argv.slice(2);
  const env = { ...process.env };
  delete env.NODE_CHANNEL_FD;
  delete env.NODE_CHANNEL_SERIALIZATION_MODE;
  let child;
  try {
    child = spawn(command, argv, { cwd: process.cwd(), env, shell: false,
      detached: false, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch {
    process.send?.({ kind: 'native.error', code: 'NATIVE_TOOL_UNAVAILABLE' });
    process.exit(1);
  }
  child.on('error', () => {
    process.send?.({ kind: 'native.error', code: 'NATIVE_TOOL_UNAVAILABLE' });
    process.exit(1);
  });
  child.on('close', code => process.exit(code === 0 ? 0 : 1));
});
process.send({ kind: 'native.ready' });
