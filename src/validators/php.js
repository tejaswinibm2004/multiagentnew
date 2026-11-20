import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.php', (file) => runCommand('php', ['-l', file]));
}
