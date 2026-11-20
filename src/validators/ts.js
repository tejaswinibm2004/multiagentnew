import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.ts', (file) => runCommand('tsc', ['--noEmit', '--skipLibCheck', file]));
}
