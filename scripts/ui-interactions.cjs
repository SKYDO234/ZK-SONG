// Interactive UI smoke test: drives real clicks in jsdom against the live dev server.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = 'http://127.0.0.1:5173';
const bundle = fs.readFileSync('/tmp/client.js', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

async function boot(path, token) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
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
      window.HTMLMediaElement.prototype.pause = function () {};
      window.HTMLMediaElement.prototype.load = function () {};
      window.fetch = (input, init) => {
        const url = typeof input === 'string' && input.startsWith('/') ? `${BASE}${input}` : input;
        return fetch(url, init);
      };
      window.scrollTo = () => {};
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    },
  });
  const script = dom.window.document.createElement('script');
  script.textContent = bundle;
  dom.window.document.body.appendChild(script);
  await sleep(2200);
  return dom;
}

function byText(doc, selector, text) {
  return [...doc.querySelectorAll(selector)].find((el) =>
    (el.textContent || '').replace(/\s+/g, ' ').toLowerCase().includes(text.toLowerCase())
  );
}

function check(name, cond, detail = '') {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const adminToken = (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@zksong.io', password: 'Admin@123' }),
  }).then((r) => r.json())).token;
  const artistToken = (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'aria@zksong.io', password: 'Artist@123' }),
  }).then((r) => r.json())).token;

  // ---------- My Songs: status filter + edit modal ----------
  let dom = await boot('/user/songs', artistToken);
  let doc = dom.window.document;
  const rejectedTab = byText(doc, 'button', 'Rejected');
  rejectedTab?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(900);
  let text = doc.getElementById('root').textContent.replace(/\s+/g, ' ');
  check('My Songs: Rejected filter shows empty state', /No songs found/.test(text), text.match(/Song Library[^A]*/)?.[0]?.slice(0, 90));

  byText(doc, 'button', 'All')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(900);
  doc = dom.window.document;
  const pencil = doc.querySelector('button[title="Edit details"]');
  pencil?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
  text = doc.body.textContent.replace(/\s+/g, ' ');
  check('My Songs: edit modal opens with metadata', /Edit Song Metadata/.test(text));

  const deleteBtn = doc.querySelector('button[title="Delete song"]');
  deleteBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(500);
  check('My Songs: delete confirmation dialog opens', /Delete this song\?/.test(doc.body.textContent));
  dom.window.close();

  // ---------- Admin API sandbox ----------
  dom = await boot('/admin/api-keys', adminToken);
  doc = dom.window.document;
  const sandboxBtn = byText(doc, 'button', 'Send Request');
  sandboxBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(1800);
  text = doc.getElementById('root').textContent.replace(/\s+/g, ' ');
  check('API Keys: live sandbox returns a response', /"status": "success"/.test(text) || /200/.test(text), text.match(/Send Request[^]*?ms/)?.[0]?.slice(0, 60));
  dom.window.close();

  // ---------- Admin songs search ----------
  dom = await boot('/admin/songs', adminToken);
  doc = dom.window.document;
  const input = doc.querySelector('input[placeholder*="Search title"]');
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Quantum');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  await sleep(1200);
  text = doc.getElementById('root').textContent.replace(/\s+/g, ' ');
  check('Songs Management: search narrows result set', /Quantum Bloom/.test(text) && !/Neon Odyssey/.test(text), text.match(/Song Catalogue[^]*?plays/)?.[0]?.slice(0, 90));
  dom.window.close();

  // ---------- Admin users: expand details ----------
  dom = await boot('/admin/users', adminToken);
  doc = dom.window.document;
  const details = byText(doc, 'button', 'Details');
  details?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(500);
  check('User Management: details panel expands', /Approved This Month/.test(doc.getElementById('root').textContent));
  dom.window.close();

  // ---------- Landing page: catalogue search ----------
  dom = await boot('/', null);
  doc = dom.window.document;
  const catalogSearch = doc.querySelector('input[placeholder*="Search"]');
  if (catalogSearch) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(catalogSearch, 'Quantum');
    catalogSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(700);
    text = doc.getElementById('root').textContent.replace(/\s+/g, ' ');
    check('Landing: catalogue search filters songs', /Quantum Bloom/.test(text));
  } else {
    check('Landing: catalogue search input present', false);
  }
  dom.window.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} interaction checks passed`);
  process.exit(failed ? 1 : 0);
})();
