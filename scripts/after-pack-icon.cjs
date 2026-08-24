const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * electron-builder may skip PE resource editing when Authenticode signing is
 * unavailable. Re-apply the official ICO onto FMT.exe so desktop/Start Menu
 * shortcuts use the FMT icon instead of the default Electron icon.
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

  const rceditName = process.arch === 'ia32' ? 'rcedit.exe' : 'rcedit-x64.exe';
  const rceditBin = join(context.packager.projectDir, 'node_modules', 'rcedit', 'bin', rceditName);
  if (!existsSync(rceditBin)) {
    throw new Error(`rcedit binary missing: ${rceditBin}`);
  }

  const result = spawnSync(rceditBin, [exePath, '--set-icon', iconPath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `rcedit exited ${result.status}`);
  }

  console.log(`Embedded official FMT icon into ${exePath}`);
};
