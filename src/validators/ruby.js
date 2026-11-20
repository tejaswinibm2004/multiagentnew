import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.rb', (file) => runCommand('ruby', ['-c', file]));
}
