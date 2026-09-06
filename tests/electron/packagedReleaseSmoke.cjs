/* Packaged smoke test. Uses Chrome DevTools Protocol and performs read/navigation checks only. */
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const expectedVersion = require('../../package.json').version;

const executable = process.argv[2] || join(process.cwd(), 'dist', 'win-unpacked', 'FMT.exe');
const port = Number(process.argv[3] || 9333);
let passed = 0;
let activeChild;
const check = (value, message) => { assert.ok(value, message); passed += 1; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function closeCleanly(target) {
  void target.send('Browser.close').catch(() => undefined);
  for (let attempts = 0; attempts < 100; attempts += 1) {
    if (target.child.exitCode !== null) return;
    await pause(100);
  }
  throw new Error('Packaged application did not close cleanly');
}

async function connect() {
  const child = spawn(executable, [`--remote-debugging-port=${port}`], {
    env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  activeChild = child;
  let target;
  for (let attempts = 0; attempts < 300; attempts += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = pages.find(page => page.type === 'page');
      if (target) break;
    } catch { /* wait for packaged app */ }
    await pause(100);
  }
  if (!target) throw new Error('Packaged renderer did not expose a debug target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { child, socket, send, evaluate };
}

async function waitFor(evaluate, expression, label) {
  for (let attempts = 0; attempts < 300; attempts += 1) {
    if (await evaluate(expression)) return;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const setInput = (selector, value) => `(() => { const input=document.querySelector(${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
  input.dispatchEvent(new Event('input',{bubbles:true})); return input.value; })()`;
const click = selector => `document.querySelector(${JSON.stringify(selector)}).click()`;

async function run() {
  const first = await connect();
  await waitFor(first.evaluate, "Boolean(document.querySelector('#username'))", 'login');
  check(await first.evaluate(`window.api.auth.login({username:'admin',password:'admin123'}).then(async login => {
    if (!login.ok) return false; const status=await window.api.app.getStatus(login.data.sessionId);
    await window.api.auth.logout({sessionId:login.data.sessionId}); return status.ok && status.data.version===${JSON.stringify(expectedVersion)}; })`), `runtime version ${expectedVersion}`);
  await first.evaluate(setInput('#username', 'admin'));
  await first.evaluate(setInput('#password', 'admin123'));
  await first.evaluate(click('.login-submit'));
  await waitFor(first.evaluate, "Boolean(document.querySelector('.module-card-accounting'))", 'module selection');
  check(await first.evaluate("Boolean(document.querySelector('.module-card-teller'))"), 'both modules available');
  await first.evaluate(click('.module-card-accounting'));
  await waitFor(first.evaluate, "Boolean(document.querySelector('.customer-page'))", 'Customer Accounting');
  check(await first.evaluate("Boolean(document.querySelector('.customer-list-section,.empty-state,.customer-list-status'))"), 'Customer Accounting read completed');
  await first.evaluate("[...document.querySelectorAll('.module-switcher-btn')].find(b=>b.textContent.includes('Teller')).click()")
  await waitFor(first.evaluate, "Boolean(document.querySelector('.teller-end-day-btn'))", 'Teller worksheet');
  check(await first.evaluate("Boolean(document.querySelector('.teller-sheet-tabs'))"), 'Teller currencies rendered');
  await closeCleanly(first);

  const second = await connect();
  await waitFor(second.evaluate, "Boolean(document.querySelector('#username'))", 'login after clean restart');
  check(await second.evaluate(`window.api.auth.login({username:'admin',password:'admin123'}).then(async login => {
    if (!login.ok) return false; const status=await window.api.app.getStatus(login.data.sessionId);
    return status.ok && status.data.version===${JSON.stringify(expectedVersion)} && status.data.databaseConnected; })`), 'existing database reopened');
  await closeCleanly(second);
  console.log(JSON.stringify({ passed, failed: 0, executable }));
}

run().catch(error => {
  console.error(error); if (activeChild && !activeChild.killed) activeChild.kill();
  console.log(JSON.stringify({ passed, failed: 1, executable })); process.exitCode = 1;
});
