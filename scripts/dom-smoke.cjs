// Browser-like smoke test: runs the real client bundle in jsdom, logs in and walks every panel page.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = 'http://127.0.0.1:5173';
const bundle = fs.readFileSync('/tmp/client.js', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];

async function boot(path, token) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (!/Could not load|Not implemented/.test(e.message)) problems.push(`jsdomError: ${e.message.slice(0, 240)}`);
  });
  virtualConsole.on('error', (...a) => {
    const msg = a.join(' ');
    if (!/useLayoutEffect|Not implemented/.test(msg)) problems.push(`console.error: ${msg.slice(0, 240)}`);
  });

  const dom = new JSDOM(
    `<!doctype html><html><head></head><body><div id="root"></div></body></html>`,
    {
      url: `${BASE}${path}`,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        if (token) window.localStorage.setItem('zksong_token', token);
        window.HTMLMediaElement.prototype.play = function play() {
          this.dispatchEvent(new window.Event('play'));
          return Promise.resolve();
        };
        window.HTMLMediaElement.prototype.pause = function pause() {
          this.dispatchEvent(new window.Event('pause'));
        };
        window.HTMLMediaElement.prototype.load = function load() {};
        window.HTMLCanvasElement.prototype.getContext = () => null;
        window.fetch = (input, init) => {
          const url = typeof input === 'string' && input.startsWith('/') ? `${BASE}${input}` : input;
          return fetch(url, init);
        };
        window.XMLHttpRequest = class extends require('xmlhttprequest').XMLHttpRequest {};
        window.scrollTo = () => {};
        window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      },
    }
  );
  const script = dom.window.document.createElement('script');
  script.textContent = bundle;
  dom.window.document.body.appendChild(script);
  return dom;
}

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SMOKE_EMAIL || 'admin@zksong.io', password: process.env.SMOKE_PASS || 'Admin@123' }),
  }).then((r) => r.json());
  const token = login.token;
  console.log(`logged in as ${login.user.name} (${login.user.role})\n`);

  const routes = process.argv.slice(2);
  let failures = 0;

  for (const route of routes) {
    problems.length = 0;
    const dom = await boot(route, token);
    await sleep(2600);
    const text = (dom.window.document.getElementById('root')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buttons = dom.window.document.querySelectorAll('button').length;
    const links = dom.window.document.querySelectorAll('a').length;
    const ok = text.length > 150;
    if (!ok) failures += 1;
    const m = text.match(/(?:No songs found|No tracks uploaded yet|No notifications|skeleton|Loading)/g);
    console.log(`${route.padEnd(22)} ${String(text.length).padStart(6)} chars  ${String(buttons).padStart(3)} buttons  ${String(links).padStart(3)} links  ${ok ? 'OK' : 'FAIL'}`);
    if (process.env.FULL) console.log(`   TEXT: ${text.slice(0, 3000)}`);
    else console.log(`   sample: ${text.slice(0, 200)}`);
    problems.slice(0, 4).forEach((p) => console.log(`   ! ${p}`));
    dom.window.close();
  }

  console.log(`\nfailures: ${failures}`);
  process.exit(failures ? 1 : 0);
})();
