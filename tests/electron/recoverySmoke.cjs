/* Run after npm run build: node node_modules/electron/cli.js tests/electron/recoverySmoke.cjs
 * Uses a private AppData root. It never opens the operator's database.
 */
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const { buildSync } = require('esbuild');
const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), 'fmt-electron-recovery-'));
app.setPath('appData', scratch);
const dataRoot = join(scratch, 'CustomerAccounting');
mkdirSync(join(dataRoot, 'data'), { recursive: true });
writeFileSync(join(dataRoot, 'data', 'accounting.db'), 'damaged original');
const helpers = join(root, 'out', 'recovery-smoke-helpers.cjs');
buildSync({ stdin: { contents: "export * from './src/main/services/backup/zipArchive'; export * from './src/main/services/backup/backupManifest';", resolveDir: root },
  alias: { '@shared': join(root, 'src', 'shared') }, bundle: true, platform: 'node', format: 'cjs', outfile: helpers });
const { createZipBuffer, sha256, buildBackupSignature } = require(helpers);
const themeScript = buildSync({ entryPoints: [join(root, 'src/shared/theme.ts')], bundle: true, format: 'iife', globalName: 'SmokeTheme', write: false }).outputFiles[0].text;
const seedPath = join(scratch, 'seed.db');
const seed = new Database(seedPath);
seed.pragma('foreign_keys = ON');
let version = 0;
// A supported older snapshot exercises migration 012 in the actual recovery UI path.
for (const file of readdirSync(join(root, 'migrations')).filter(file => /^0(0\d|1[01])_/.test(file)).sort()) {
  seed.exec(readFileSync(join(root, 'migrations', file), 'utf8'));
  version = Number(file.slice(0, 3));
  seed.prepare('INSERT INTO schema_migrations(version,name) VALUES (?,?)').run(version, file);
}
seed.prepare('INSERT INTO admin_users(username,password_hash) VALUES (?,?)').run('admin', bcrypt.hashSync('smoke-password', 10));
seed.exec("UPDATE company_profile SET name='Smoke Company', configured=1 WHERE id=1; INSERT INTO customers(name) VALUES ('Smoke Customer');");
seed.close();
const dbBytes = readFileSync(seedPath);
const manifest = { format_version: '1.0', app_version: require('../../package.json').version, schema_version: version,
  created_at: new Date().toISOString(), created_by: 'FMT', platform: 'win32',
  statistics: { customer_count: 1, transaction_count: 0, currency_codes: ['AFN', 'USD', 'EUR'] },
  files: [{ path: 'database/accounting.db', sha256: sha256(dbBytes), size_bytes: dbBytes.length }], settings_snapshot: { language: 'en' } };
const manifestBytes = Buffer.from(JSON.stringify(manifest));
const backupPath = join(scratch, 'valid.cab');
writeFileSync(backupPath, createZipBuffer([{ name: 'manifest.json', data: manifestBytes },
  { name: 'signature.sha256', data: Buffer.from(buildBackupSignature(manifestBytes, manifest.files)) },
  { name: 'database/accounting.db', data: dbBytes }]));
const badPath = join(scratch, 'invalid.cab'); writeFileSync(badPath, 'bad archive');
let selections = 0;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [++selections === 1 ? badPath : backupPath] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(scratch, 'day.xlsx') });
const windows = [];
app.on('browser-window-created', (_event, window) => { windows.push(window); });
setTimeout(() => { console.error('Smoke test watchdog expired', scratch); app.exit(1); }, 120000);
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  console.log('Checking:', label);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { const result = await read(); if (result) return result; await pause(40); }
  throw new Error(`Timed out: ${label}`);
}
async function js(window, script) { try { return await window.webContents.executeJavaScript(script); } catch (error) { console.error('Renderer script:', script); throw error; } }
async function click(window, selector) { await js(window, `document.querySelector(${JSON.stringify(selector)}).click()`); }
async function fill(window, selector, value) {
  await js(window, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function screenshot(window, name) { writeFileSync(join(scratch, name), (await window.webContents.capturePage()).toPNG()); }

require(join(root, 'out', 'main', 'index.js'));
void (async () => {
  await app.whenReady();
  const recovery = await until(() => windows[0], 'recovery window');
  await until(async () => !recovery.webContents.isLoading() && js(recovery, 'Boolean(document.querySelector("#recovery-title"))'), 'recovery renderer');
  check(await js(recovery, '!!window.recovery && !window.api'), 'restricted preload only');
  const preferences = recovery.webContents.getLastWebPreferences();
  check(preferences.contextIsolation && preferences.sandbox && preferences.webSecurity && !preferences.nodeIntegration, 'security settings');
  await click(recovery, '.recovery-mode button');
  await until(() => js(recovery, 'Boolean(document.querySelector("[role=alert]"))'), 'invalid backup error');
  check(readFileSync(join(dataRoot, 'data', 'accounting.db'), 'utf8') === 'damaged original', 'invalid backup leaves original');
  check(await js(recovery, 'document.activeElement.getAttribute("role") === "alert"'), 'validation error receives focus');
  for (const locale of ['en', 'fa-AF', 'ps']) {
    await js(recovery, `(() => { const select = document.querySelector('#recovery-language'); select.value=${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await until(() => js(recovery, `document.documentElement.lang === ${JSON.stringify(locale)}`), 'locale');
    for (const theme of ['light', 'dark']) {
      await js(recovery, themeScript + `; SmokeTheme.applyThemeToDocument({...SmokeTheme.DEFAULT_THEME, mode:'${theme}'}, document.documentElement);`);
      await pause(200);
      await screenshot(recovery, `recovery-${locale}-${theme}.png`);
      check(await js(recovery, 'document.documentElement.scrollWidth <= innerWidth'), `no horizontal overflow ${locale}/${theme}`);
    }
  }
  await js(recovery, "document.querySelector('#recovery-language').value='en'; document.querySelector('#recovery-language').dispatchEvent(new Event('change',{bubbles:true})); document.documentElement.dataset.theme='light';");
  await click(recovery, '.recovery-mode button');
  await until(() => js(recovery, 'Boolean(document.querySelector(".recovery-selection"))'), 'valid selection');
  await click(recovery, '.recovery-selection input');
  await click(recovery, '.recovery-selection button');
  await until(() => js(recovery, 'Boolean(document.querySelector(".banner-success"))'), 'recovery success');
  check(await js(recovery, '!window.api'), 'normal API remains hidden until login transition');
  const safety = readdirSync(join(dataRoot, 'backups')).find(name => name.startsWith('pre-recovery-'));
  check(readFileSync(join(dataRoot, 'backups', safety, 'data', 'accounting.db'), 'utf8') === 'damaged original', 'safety copy preserved');
  await screenshot(recovery, 'recovery-success.png');
  await click(recovery, '.recovery-mode .button-primary');
  const normal = await until(() => windows[1], 'normal window');
  await until(async () => !normal.webContents.isLoading() && js(normal, 'Boolean(document.querySelector("#username"))'), 'normal login');
  check(await js(normal, '!!window.api && !window.recovery'), 'normal API restored, no recovery API');
  check(await js(normal, '!document.querySelector(".app-shell")'), 'no automatic login');
  await fill(normal, '#username', 'admin'); await fill(normal, '#password', 'smoke-password');
  await click(normal, '.login-submit');
  await until(() => js(normal, 'Boolean(document.querySelector(".module-card-teller"))'), 'login with restored credentials');
  await click(normal, '.module-card-teller');
  await until(() => js(normal, 'Boolean(document.querySelector(".teller-end-day-btn"))'), 'Teller');
  await click(normal, '.teller-end-day-btn');
  const row = '.teller-log-deposit input[data-row="slot-1"][data-col="amount"]';
  await until(() => js(normal, `Boolean(document.querySelector(${JSON.stringify(row)}) && !document.querySelector(${JSON.stringify(row)}).disabled)`), 'active Teller');
  await pause(200);
  await fill(normal, row, 'invalid');
  await until(() => js(normal, 'Boolean(document.querySelector(".teller-save-state-failed"))'), 'save failure');
  check(await js(normal, 'document.querySelector(".teller-end-day-btn").disabled'), 'END blocked on failed edit');
  check(await js(normal, `document.querySelector(${JSON.stringify(row)}).value === 'invalid'`), 'invalid draft retained');
  await fill(normal, row, '100.0001'); await fill(normal, row, '100.0002');
  await until(() => js(normal, 'Boolean(document.querySelector(".teller-save-state-saved"))'), 'rapid edit saved');
  check(await js(normal, `document.querySelector(${JSON.stringify(row)}).value === '100.0002'`), 'latest edit survives refresh');
  const inspect = new Database(join(dataRoot, 'data', 'accounting.db'));
  check(inspect.prepare('SELECT declared_amount FROM teller_transactions WHERE worksheet_row=2').get().declared_amount === '100.0002', 'latest edit stored');
  inspect.close();
  await screenshot(normal, 'teller-saved.png');
  console.log(JSON.stringify({ passed, failed: 0, screenshots: scratch }));
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  app.exit(0);
})().catch(error => { console.error(error); console.log(JSON.stringify({ passed, failed: 1, artifacts: scratch })); app.exit(1); });
