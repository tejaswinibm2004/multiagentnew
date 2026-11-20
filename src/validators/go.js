import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.go', (file) => runCommand('gofmt', ['-e', file], { timeout: 10000 }));
}
