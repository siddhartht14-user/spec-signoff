const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL = process.env.LOCAL_STORE || '/tmp/signoff-store';
let blob = null;
if (HAS_BLOB) blob = require('@vercel/blob');

/* ---------- raw object store: put / get / list / del ---------- */
async function rawPut(key, buf, contentType) {
  if (HAS_BLOB) return blob.put(key, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: contentType || 'application/octet-stream' });
  const f = path.join(LOCAL, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
}
async function rawGet(key) {
  if (HAS_BLOB) {
    const r = await blob.get(key, { access: 'private' });
    if (!r || r.statusCode !== 200) return null;
    const chunks = []; for await (const c of r.stream) chunks.push(Buffer.from(c));
    return { buf: Buffer.concat(chunks), type: r.blob && r.blob.contentType };
  }
  const f = path.join(LOCAL, key); if (!fs.existsSync(f)) return null; return { buf: fs.readFileSync(f), type: 'application/octet-stream' };
}
async function rawList(prefix) {
  if (HAS_BLOB) {
    const out = []; let cursor;
    do { const r = await blob.list({ prefix, cursor, limit: 1000 }); r.blobs.forEach(b => out.push({ key: b.pathname, url: b.url })); cursor = r.hasMore ? r.cursor : null; } while (cursor);
    return out;
  }
  const out = []; const walk = d => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else out.push({ key: path.relative(LOCAL, f), url: f }); } };
  walk(LOCAL); return out.filter(o => o.key.startsWith(prefix));
}
async function rawDel(items) {
  if (!items.length) return;
  if (HAS_BLOB) return blob.del(items.map(i => i.url));
  items.forEach(i => { try { fs.unlinkSync(i.url); } catch (e) {} });
}

/* ---------- document store with immutable versions (no stale reads) ---------- */
const SEG = /^[A-Za-z0-9_.@+:-]{1,200}$/;
function cleanPath(p) { const s = String(p || '').split('/'); if (!s.length || s.some(x => !SEG.test(x) || x === '.' || x === '..')) throw new Error('bad_path'); return s; }
async function docVersions(p) { const l = await rawList('db/' + p + '~'); return l.sort((a, b) => a.key < b.key ? -1 : 1); }
async function docGet(p) {
  const v = await docVersions(p); if (!v.length) return null;
  const r = await rawGet(v[v.length - 1].key); if (!r) return null;
  const d = JSON.parse(r.buf.toString('utf8')); return d && d.__deleted ? null : d;
}
async function docSet(p, data) {
  const old = await docVersions(p);
  const key = 'db/' + p + '~' + String(Date.now()).padStart(15, '0') + Math.random().toString(36).slice(2, 6) + '.json';
  await rawPut(key, Buffer.from(JSON.stringify(data)), 'application/json');
  await rawDel(old);
}
async function docDel(p) { const old = await docVersions(p); if (!old.length) return; await docSet(p, { __deleted: 1 }); }
async function collGet(c) {
  const l = await rawList('db/' + c + '/'); const latest = new Map();
  for (const o of l) { const rest = o.key.slice(('db/' + c + '/').length); if (rest.includes('/')) continue; const id = rest.split('~')[0]; const cur = latest.get(id); if (!cur || o.key > cur.key) latest.set(id, o); }
  const docs = [];
  await Promise.all([...latest].map(async ([id, o]) => { const r = await rawGet(o.key); if (!r) return; const d = JSON.parse(r.buf.toString('utf8')); if (d && !d.__deleted) docs.push({ id, data: d }); }));
  return docs;
}

/* ---------- sessions ---------- */
const SECRET = () => process.env.SESSION_SECRET || 'dev-secret';
const b64u = b => Buffer.from(b).toString('base64url');
function sign(obj) { const p = b64u(JSON.stringify(obj)); return p + '.' + crypto.createHmac('sha256', SECRET()).update(p).digest('base64url'); }
function verify(tok) { if (!tok) return null; const [p, s] = String(tok).split('.'); if (!p || !s) return null; const e = crypto.createHmac('sha256', SECRET()).update(p).digest('base64url'); if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null; try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp && o.exp < Date.now() ? null : o; } catch (e) { return null; } }
function cookies(req) { const o = {}; String(req.headers.cookie || '').split(/;\s*/).forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i)] = decodeURIComponent(c.slice(i + 1)); }); return o; }
function session(req) { return verify(cookies(req).sid); }
function setSession(res, obj) { res.setHeader('Set-Cookie', 'sid=' + encodeURIComponent(sign(obj)) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (60 * 60 * 24 * 30)); }
function linkSig(pid, xid) { return crypto.createHmac('sha256', SECRET()).update('link:' + pid + ':' + xid).digest('base64url').slice(0, 32); }
function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); }
async function body(req) { if (req.body && typeof req.body === 'object') return req.body; let s = ''; for await (const c of req) s += c; try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }

/* ---------- access rules ---------- */
function canRead(ses, p) {
  if (!ses) return false; if (ses.role === 'team') return true;
  return ses.role === 'arch' && (p === 'projects/' + ses.pid || p.startsWith('projects/' + ses.pid + '/'));
}
function canWrite(ses, p) {
  if (!ses) return false; if (ses.role === 'team') return true;
  return ses.role === 'arch' && (p === 'projects/' + ses.pid || p === 'projects/' + ses.pid + '/files/' + ses.xid);
}

/* ---------- mail ---------- */
async function sendMail({ to, cc, subject, text, attachment }) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) { const e = new Error('not_configured'); e.code = 501; throw e; }
  const payload = { from, to, subject, text }; if (cc && cc.length) payload.cc = cc;
  if (attachment) payload.attachments = [{ filename: attachment.name, content: attachment.buf.toString('base64') }];
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) { const e = new Error('mail_failed: ' + (await r.text()).slice(0, 300)); e.code = 502; throw e; }
}
module.exports = { rawPut, rawGet, rawList, rawDel, docGet, docSet, docDel, collGet, cleanPath, session, setSession, sign, verify, linkSig, json, body, canRead, canWrite, sendMail, cookies };
