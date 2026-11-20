import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.mjs', (file) => runCommand(process.execPath, ['--check', file]));
}
