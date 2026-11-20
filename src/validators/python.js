import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.py', (file) => runCommand('python3', ['-m', 'py_compile', file]));
}
