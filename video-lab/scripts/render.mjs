// Renders every edit (or the ones named) to out/<id>.mp4.
import { execFileSync } from 'node:child_process';

const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['bkb', 'oracle'];
for (const id of ids) {
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${id}.mp4`, '--concurrency=4'], {
    stdio: 'inherit'
  });
}
