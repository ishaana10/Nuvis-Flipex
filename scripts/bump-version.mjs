#!/usr/bin/env node
/**
 * Cut a new Nuvis Flipex release.
 *
 *   node scripts/bump-version.mjs patch|minor|major|<x.y.z> [--tag] [--no-changelog]
 *
 * Updates, in one step: /VERSION (single source of truth), frontend/package.json,
 * frontend/package-lock.json and CHANGELOG.md (commit subjects since the previous tag).
 * With --tag it also commits the bump and creates the annotated tag v<version>.
 * The frontend and backend read /VERSION at build/run time, so nothing else needs editing.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const kind = args.find((a) => !a.startsWith('--'));
const flag = (f) => args.includes(f);
const sh = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

if (!kind) {
  console.error('Usage: node scripts/bump-version.mjs patch|minor|major|<x.y.z> [--tag] [--no-changelog]');
  process.exit(1);
}

const current = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) throw new Error(`VERSION "${current}" is not x.y.z`);
let [maj, min, pat] = m.slice(1).map(Number);

let next;
if (/^\d+\.\d+\.\d+$/.test(kind)) next = kind;
else if (kind === 'major') next = `${maj + 1}.0.0`;
else if (kind === 'minor') next = `${maj}.${min + 1}.0`;
else if (kind === 'patch') next = `${maj}.${min}.${pat + 1}`;
else throw new Error(`Unknown bump "${kind}"`);

writeFileSync(resolve(root, 'VERSION'), next + '\n');

for (const f of ['frontend/package.json', 'frontend/package-lock.json']) {
  const p = resolve(root, f);
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.version = next;
  if (j.packages?.['']) j.packages[''].version = next;
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

if (!flag('--no-changelog')) {
  let range = '';
  try { range = `${sh('git describe --tags --abbrev=0')}..HEAD`; } catch { /* first release */ }
  let subjects = [];
  try {
    subjects = sh(`git log ${range} --no-merges --pretty=format:%s`).split('\n')
      .filter((s) => s && !/^chore\((build|release)\)/.test(s));
  } catch { /* no git history available */ }
  const date = new Date().toISOString().slice(0, 10);
  const entry = `## v${next} - ${date}\n\n${subjects.length ? subjects.map((s) => `- ${s}`).join('\n') : '- Maintenance release'}\n\n`;
  const p = resolve(root, 'CHANGELOG.md');
  const old = existsSync(p) ? readFileSync(p, 'utf8') : '# Changelog\n\nAll notable changes to Nuvis Flipex. Versions follow semver; the number lives in /VERSION.\n\n';
  const at = old.indexOf('\n## ');
  writeFileSync(p, at === -1 ? old.trimEnd() + '\n\n' + entry : old.slice(0, at + 1) + entry + old.slice(at + 1));
}

console.log(`Version: ${current} -> ${next}`);

if (flag('--tag')) {
  sh('git add VERSION frontend/package.json frontend/package-lock.json CHANGELOG.md');
  sh(`git commit -m "chore(release): v${next}"`);
  sh(`git tag -a v${next} -m "Nuvis Flipex v${next}"`);
  console.log(`Committed and tagged v${next}. Push with: git push origin HEAD --follow-tags`);
} else {
  console.log('Review the changes, then commit. (Use --tag to commit and tag automatically.)');
}
