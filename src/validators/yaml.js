import { withTemp, runCommand } from './base.js';
export default function validate(content) {
  return withTemp(content, '.yaml', (file) => runCommand(process.execPath, ['-e',
    `try{const y=require('yaml');y.parse(require('fs').readFileSync(${JSON.stringify(file)},'utf8'));process.exit(0)}catch(e){console.error(e.message);process.exit(1)}`]));
}
