import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const buildPath = path.join(root, '.output', 'desktop');
const archivePath = path.join(root, '.output', 'desktop-mac', 'Korean-Reader-mac.zip');
const { productName, version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundleId = 'com.koreanreader.desktop';

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(error.stderr?.toString().trim() || error.message);
  }
}

function setString(plist, key, value) {
  execFileSync('/usr/bin/plutil', ['-insert', key, '-string', value, plist], { stdio: 'pipe' });
}

function setExistingString(plist, key, value) {
  run('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
}

function brandBundle(bundle, oldName, name, id) {
  const contents = path.join(bundle, 'Contents');
  const plist = path.join(contents, 'Info.plist');
  for (const key of ['CFBundleName', 'CFBundleDisplayName', 'CFBundleExecutable']) setExistingString(plist, key, name);
  setExistingString(plist, 'CFBundleIdentifier', id);
  renameSync(path.join(contents, 'MacOS', oldName), path.join(contents, 'MacOS', name));
}

function iconChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(header.length + data.length, 4);
  return Buffer.concat([header, data]);
}

function createIcon(png, staging, output) {
  const sizes = [
    ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128],
    ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ];
  const image = path.join(staging, 'resized-icon.png');
  const chunks = sizes.map(([type, size]) => {
    run('/usr/bin/sips', ['-z', String(size), String(size), png, '--out', image]);
    return iconChunk(type, readFileSync(image));
  });
  writeFileSync(output, iconChunk('icns', Buffer.concat(chunks)));
}

export function packageMacDesktop() {
  if (process.platform !== 'darwin') throw new Error('The macOS app bundle must be built on macOS.');
  const stockBundle = path.resolve(require('electron'), '../../..');
  // A file provider can add Finder metadata to app bundles under Documents.
  const localApps = path.join(os.tmpdir(), 'korean-reader-desktop');
  mkdirSync(localApps, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(path.join(localApps, 'build-'));
  const product = path.join(localApps, `${productName}.app`);
  const bundle = path.join(staging, `${productName}.app`);
  const previous = path.join(staging, 'previous.app');
  try {
    run('/bin/cp', ['-RX', stockBundle, bundle]);
    brandBundle(bundle, 'Electron', productName, bundleId);
    const contents = path.join(bundle, 'Contents');
    const plist = path.join(contents, 'Info.plist');
    const resources = path.join(contents, 'Resources');
    const frameworks = path.join(contents, 'Frameworks');
    for (const filename of readdirSync(frameworks)) {
      if (!filename.startsWith('Electron Helper') || !filename.endsWith('.app')) continue;
      const original = path.basename(filename, '.app');
      const name = productName + original.slice('Electron'.length);
      const suffix = original.match(/\(([^)]+)\)/)?.[1].toLowerCase();
      const current = path.join(frameworks, filename);
      brandBundle(current, original, name, `${bundleId}.helper${suffix ? `.${suffix}` : ''}`);
      renameSync(current, path.join(frameworks, `${name}.app`));
    }
    setExistingString(plist, 'CFBundleShortVersionString', version);
    setExistingString(plist, 'CFBundleVersion', version);
    setExistingString(plist, 'CFBundleIconFile', 'KoreanReader.icns');
    setExistingString(plist, 'LSApplicationCategoryType', 'public.app-category.education');
    setString(plist, 'NSLocalNetworkUsageDescription', 'Korean Reader uses your local network to sync study progress with your paired device.');
    createIcon(path.join(buildPath, 'app-icon.png'), staging, path.join(resources, 'KoreanReader.icns'));

    const application = path.join(resources, 'app');
    mkdirSync(application);
    run('/bin/cp', ['-RX', path.join(buildPath, 'main'), path.join(buildPath, 'renderer'), application]);
    run('/bin/cp', ['-X', path.join(buildPath, 'app-icon.png'), application]);
    writeFileSync(path.join(application, 'package.json'), JSON.stringify({
      name: 'korean-reader', productName, version, main: 'main/index.cjs',
    }));
    run('/usr/bin/xattr', ['-dr', 'com.apple.FinderInfo', bundle]);
    run('/usr/bin/xattr', ['-dr', 'com.apple.ResourceFork', bundle]);
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);

    if (existsSync(product)) renameSync(product, previous);
    try {
      renameSync(bundle, product);
    } catch (error) {
      if (existsSync(previous)) renameSync(previous, product);
      throw error;
    }
    return product;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = packageMacDesktop();
  mkdirSync(path.dirname(archivePath), { recursive: true });
  const temporaryArchive = `${archivePath}.${process.pid}.tmp`;
  try {
    run('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', bundle, temporaryArchive]);
    renameSync(temporaryArchive, archivePath);
    console.log(archivePath);
  } finally {
    rmSync(temporaryArchive, { force: true });
  }
}
