import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { packageMacDesktop } from './package-mac.mjs';

const require = createRequire(import.meta.url);
const command = process.platform === 'darwin' ? '/usr/bin/open' : require('electron');
const args = process.platform === 'darwin'
  ? ['-W', '-a', packageMacDesktop()]
  : [fileURLToPath(new URL('../.output/desktop/main/index.cjs', import.meta.url))];
const app = spawn(command, args, { stdio: 'inherit' });
app.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
app.on('exit', (code) => { process.exitCode = code ?? 1; });
