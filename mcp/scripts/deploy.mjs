// `npm run deploy`: deploys the worker with the git commit and time stamped in, so GET /version and
// the landing page say which build is live (review A11). A tree with uncommitted changes is stamped
// "<commit>-dirty".
import { execFileSync } from 'node:child_process';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--', '.', '../src', '../imports') !== '';
const stamp = `${commit}${dirty ? '-dirty' : ''}`;
const at = new Date().toISOString();
console.log(`Deploying ${stamp} at ${at}`);
execFileSync('npx', ['wrangler', 'deploy', '--var', `GIT_COMMIT:${stamp}`, '--var', `DEPLOYED_AT:${at}`, ...process.argv.slice(2)], { stdio: 'inherit' });
