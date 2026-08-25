import packageJson from '../../../package.json';

/** Authoritative app version — always the `package.json` version. */
export const APP_VERSION: string = packageJson.version;
