import semver from 'semver';
export function updateManifest(version, signature, repository, notes = '') {
  if (!semver.valid(version) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release version or repository.');
  const decoded = Buffer.from(signature.trim(), 'base64').toString('utf8');
  if (!decoded.startsWith('untrusted comment:') || decoded.split('\n').length < 4) throw new Error('A signed installer is required.');
  if (!decoded.split('\n').some(line => line.startsWith('trusted comment:') && line.split('\t').includes(`version:${version}`))) throw new Error('The installer signature must bind the release version.');
  const filename = `AsterContentHub-Setup-${version}-x64.exe`;
  return { version, notes, pub_date: new Date().toISOString(), platforms: { 'windows-x86_64': { signature: signature.trim(), url: `https://github.com/${repository}/releases/download/v${version}/${filename}` } } };
}
export const advancesFeed = (current, next) => !current || (semver.valid(current) && semver.gt(next, current));
