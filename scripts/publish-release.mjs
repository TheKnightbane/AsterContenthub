import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import semver from 'semver';
import { advancesFeed, updateManifest } from './release-manifest.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json')));
const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/^version = "([^"]+)"/m)?.[1];
const version = config.version;
const tag = `v${version}`;
if (pkg.version !== version || cargo !== version || (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag)) throw new Error('The tag, npm, Cargo and Tauri versions must match.');
const repo = process.env.GITHUB_REPOSITORY || 'TheKnightbane/AsterContenthub';
const gh = process.env.GH_PATH || 'gh';
const call = args => execFileSync(gh, [...args, '--repo', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const out = join(root, 'release'); mkdirSync(out, { recursive: true });
const bundle = join(root, 'src-tauri/target/release/bundle/nsis');
const original = readdirSync(bundle).find(name => name.endsWith('_x64-setup.exe') && name.includes(`_${version}_`));
if (!original) throw new Error('Build the signed x64 NSIS installer first.');
const installer = `AsterContentHub-Setup-${version}-x64.exe`;
copyFileSync(join(bundle, original), join(out, installer));
copyFileSync(join(bundle, `${original}.sig`), join(out, `${installer}.sig`));
const notes = readFileSync(join(root, 'ALPHA_RELEASE.md'), 'utf8');
const manifest = updateManifest(version, readFileSync(join(out, `${installer}.sig`), 'utf8'), repo, notes);
writeFileSync(join(out, 'latest.json'), JSON.stringify(manifest, null, 2));
const files = [installer, `${installer}.sig`, 'latest.json'];
writeFileSync(join(out, 'SHA256SUMS.txt'), files.map(name => `${createHash('sha256').update(readFileSync(join(out, name))).digest('hex')}  ${name}`).join('\n') + '\n');
if (process.argv.includes('--prepare-only')) { console.log(`Prepared ${tag} signed release files.`); process.exit(0); }

let existing;
try { existing = JSON.parse(call(['release', 'view', tag, '--json', 'isDraft'])); } catch { /* First release attempt. */ }
if (existing && !existing.isDraft) { console.log('This version is already published; existing downloads were preserved. Bump the version for a new release.'); process.exit(0); }
if (!existing) call(['release', 'create', tag, '--draft', ...(semver.prerelease(version) ? ['--prerelease'] : []), '--title', `Aster Content Hub ${version} - Windows`, '--notes-file', join(root, 'ALPHA_RELEASE.md'), '--target', process.env.GITHUB_SHA || 'main']);
call(['release', 'upload', tag, ...[...files, 'SHA256SUMS.txt'].map(name => join(out, name)), '--clobber']);
call(['release', 'edit', tag, '--draft=false']);

let current;
let feedExists = true;
const previous = join(out, 'previous'); mkdirSync(previous, { recursive: true });
try { call(['release', 'view', 'updater']); } catch (error) {
  if (!/release not found|Could not resolve to a Release/i.test(String(error.stderr))) throw error;
  feedExists = false;
}
if (feedExists) {
  call(['release', 'download', 'updater', '--pattern', 'latest.json', '--dir', previous, '--clobber']);
  current = JSON.parse(readFileSync(join(previous, 'latest.json'))).version;
}
if (current && !semver.valid(current)) throw new Error('Existing update feed has an invalid version; it was not overwritten.');
if (advancesFeed(current, version)) {
  if (!feedExists) call(['release', 'create', 'updater', '--prerelease', '--title', 'Automatic update feed', '--notes', 'Aster reads latest.json here for signed Windows updates. Download the versioned Windows setup release to install Aster.', '--target', 'main']);
  call(['release', 'upload', 'updater', join(out, 'latest.json'), '--clobber']);
  console.log(`Published ${tag} and advanced the automatic update feed.`);
} else console.log(`Published ${tag}; the feed already points to ${current}.`);
