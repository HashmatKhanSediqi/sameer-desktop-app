const { existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * electron-builder skips PE resource editing when Authenticode signing is
 * unavailable (`signAndEditExecutable: false`). Re-apply the official ICO and
 * FMT version strings onto FMT.exe so shortcuts and Windows Security see FMT
 * instead of a generic Electron binary.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = join(context.appOutDir, 'FMT.exe');
  const iconPath = join(context.packager.projectDir, 'assets', 'icons', 'icon.ico');
  if (!existsSync(exePath) || !existsSync(iconPath)) {
    throw new Error(`afterPack icon embed missing exe or ico: ${exePath} / ${iconPath}`);
  }

  const pkg = JSON.parse(readFileSync(join(context.packager.projectDir, 'package.json'), 'utf8'));
  const productName = pkg.build?.productName || 'FMT';
  const version = pkg.version;

  const rceditName = process.arch === 'ia32' ? 'rcedit.exe' : 'rcedit-x64.exe';
  const rceditBin = join(context.packager.projectDir, 'node_modules', 'rcedit', 'bin', rceditName);
  if (!existsSync(rceditBin)) {
    throw new Error(`rcedit binary missing: ${rceditBin}`);
  }

  const result = spawnSync(
    rceditBin,
    [
      exePath,
      '--set-icon',
      iconPath,
      '--set-version-string',
      'FileDescription',
      pkg.description || productName,
      '--set-version-string',
      'ProductName',
      productName,
      '--set-version-string',
      'CompanyName',
      pkg.author || productName,
      '--set-version-string',
      'OriginalFilename',
      'FMT.exe',
      '--set-file-version',
      version,
      '--set-product-version',
      version,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `rcedit exited ${result.status}`);
  }

  console.log(`Embedded official FMT icon and version ${version} into ${exePath}`);
};
