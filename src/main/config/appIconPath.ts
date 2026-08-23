import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ICON_FILE = 'icon.ico';

export function resolveAppIconPath(): string {
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    const packaged = join(process.resourcesPath, ICON_FILE);
    if (existsSync(packaged)) {
      return packaged;
    }
  }

  const fromBundle = join(__dirname, '../../../assets/icons', ICON_FILE);
  if (existsSync(fromBundle)) {
    return fromBundle;
  }

  return join(process.cwd(), 'assets/icons', ICON_FILE);
}
