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
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'admin123' }),
  }).then((r) => r.json())).token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  // ---- provision throwaway fixtures so the suite works on an empty platform ----
  const stamp = Date.now();
  const fixtureEmail = `smoke-${stamp}@example.com`;
  const artist = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Artist', email: fixtureEmail, password: 'smoke1234', primary_genre: 'Synthwave' }),
  }).then((r) => r.json());
  const artistToken = artist.token;

  const wavRes = await fetch(`${BASE}/api/public/bootstrap`);
  const keyRes = await fetch(`${BASE}/api/admin/api-keys`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ name: `Smoke Client ${stamp}` }),
  });
  const fixtureKey = (await keyRes.json()).api_key;

  const audio = new File([Buffer.alloc(2048)], 'smoke.wav', { type: 'audio/wav' });
  const cover = new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8b5cf6"/></svg>'], 'smoke.svg', { type: 'image/svg+xml' });
  const form = new FormData();
  form.append('title', 'Smoke Quantum Track');
  form.append('artist', 'Smoke Artist');
  form.append('musician', 'Smoke Artist');
  form.append('composer', 'Smoke Artist');
  form.append('genre', 'Synthwave');
  form.append('duration', '8');
  form.append('duration_formatted', '0:08');
  form.append('audio', audio);
  form.append('thumbnail', cover);
  const uploaded = await fetch(`${BASE}/api/user/songs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${artistToken}` },
    body: form,
  }).then((r) => r.json());
  const fixtureSongId = uploaded.song?.id;
  await fetch(`${BASE}/api/admin/songs/${fixtureSongId}/approve`, {
    method: 'POST', headers: adminHeaders,
  });
  console.log(`fixtures: artist #${artist.user?.id}, song #${fixtureSongId}, key ${fixtureKey?.api_key?.slice(0, 14)}…\n`);

  const cleanup = async () => {
    await fetch(`${BASE}/api/admin/songs/${fixtureSongId}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {});
    await fetch(`${BASE}/api/admin/users/${artist.user?.id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {});
    await fetch(`${BASE}/api/admin/api-keys/${fixtureKey?.id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {});
  };

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
  await sleep(600);
  const keySelect = doc.querySelector('select');
  if (keySelect && keySelect.options.length > 1) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
    setter.call(keySelect, keySelect.options[1].value);
    keySelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await sleep(300);
  }
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
    setter.call(input, 'Smoke Quantum');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  await sleep(1200);
  text = doc.getElementById('root').textContent.replace(/\s+/g, ' ');
  check('Songs Management: search narrows result set', /Smoke Quantum Track/.test(text) && /1 song\(s\) matching your filters/.test(text), text.match(/Song Catalogue[^]*?plays/)?.[0]?.slice(0, 90));
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
    setter.call(catalogSearch, 'Smoke Quantum');
    catalogSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(700);
    text = doc.getElementById('root').textContent.replace(/\s+/g, ' ');
    check('Landing: catalogue search filters songs', /Smoke Quantum Track/.test(text));
  } else {
    check('Landing: catalogue search input present', false);
  }
  dom.window.close();

  await cleanup();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} interaction checks passed`);
  process.exit(failed ? 1 : 0);
})();
