/* Spec Sign-off: Vercel runtime. Provides the same window.claude.use() surface the app was built against,
   backed by /api/* (documents and files in a private Vercel Blob store). */
(function () {
  window.__SERVER = true;
  let ME = null, meP = null;
  const css = '#lg{position:fixed;inset:0;background:#efebe4;z-index:9999;display:flex;align-items:center;justify-content:center;font:14px -apple-system,Segoe UI,Arial,sans-serif;color:#1d1b18}#lg form{background:#fff;border:1px solid #d9d3c8;border-radius:14px;padding:22px;width:min(360px,92vw);box-shadow:0 10px 30px rgba(29,27,24,.18)}#lg h1{font:400 24px Georgia,serif;margin:0 0 4px}#lg p{color:#5e5951;margin:0 0 12px}#lg input{width:100%;border:1px solid #d9d3c8;border-radius:8px;padding:9px 10px;margin:4px 0 10px;font:inherit}#lg button{width:100%;background:#1d1b18;color:#fff;border:0;border-radius:9px;padding:10px;font:inherit;cursor:pointer}#lg .e{color:#c0322f;margin-bottom:8px;min-height:1em}';
  function ready() { return document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r)); }
  async function login() {
    await ready();
    return new Promise(res => {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      const d = document.createElement('div'); d.id = 'lg';
      d.innerHTML = '<form><h1>Spec Sign-off</h1><p>Haworth team sign in</p><label>Work email</label><input id="lgE" type="email" autocomplete="email"><label>Team passcode</label><input id="lgP" type="password" autocomplete="current-password"><div class="e" id="lgX"></div><button>Sign in</button></form>';
      document.body.appendChild(d);
      d.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: d.querySelector('#lgE').value, passcode: d.querySelector('#lgP').value }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) { d.remove(); res(); } else d.querySelector('#lgX').textContent = j.error || 'Could not sign in';
      };
    });
  }
  async function me() {
    if (ME) return ME;
    if (!meP) meP = (async () => {
      for (;;) { const r = await fetch('/api/me'); if (r.ok) { ME = await r.json(); return ME; } await login(); }
    })();
    return meP;
  }
  async function call(op, path, data) {
    await me();
    const r = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, path, data }) });
    if (r.status === 401) { ME = null; meP = null; await me(); return call(op, path, data); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'error'); e.code = r.status === 403 ? 'invalid_argument' : 'unavailable'; throw e; }
    return j;
  }
  const listeners = new Set(); let timer = null, busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try { for (const l of [...listeners]) { try { await l.run(); } catch (e) {} } } finally { busy = false; }
  }
  function ensureTimer() { if (!timer) timer = setInterval(() => { if (!document.hidden) tick(); }, 6000); }
  const snapDoc = (id, ex, d) => ({ id, exists: ex, data: () => (ex ? d : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  function doc(path) {
    const ref = {
      id: path.split('/').pop(), path,
      get: async () => { const j = await call('get', path); return snapDoc(ref.id, j.exists, j.data); },
      set: async d => { await call('set', path, JSON.parse(JSON.stringify(d))); setTimeout(tick, 50); },
      update: async d => { const j = await call('get', path); if (!j.exists) { const e = new Error('missing'); e.code = 'invalid_argument'; throw e; } await call('set', path, { ...j.data, ...d }); setTimeout(tick, 50); },
      delete: async () => { await call('delete', path); setTimeout(tick, 50); },
      collection: p => collection(path + '/' + p),
      onSnapshot: (next, err) => {
        let last = null; const l = { run: async () => { const j = await call('get', path); const s = JSON.stringify(j); if (s !== last) { last = s; next(snapDoc(ref.id, j.exists, j.data)); } } };
        listeners.add(l); ensureTimer(); l.run().catch(e => err && err(e)); return () => listeners.delete(l);
      }
    };
    return ref;
  }
  function collection(path, ord, lim) {
    const qs = docs => ({ docs: docs.map(d => snapDoc(d.id, true, d.data)), size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } });
    async function fetchDocs() {
      const docs = (await call('list', path)).docs || [];
      if (ord) { const [f, dir] = ord; docs.sort((a, b) => { const x = a.data[f], y = b.data[f]; const c = x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0; return dir === 'desc' ? -c : c; }); }
      else docs.sort((a, b) => (a.id < b.id ? -1 : 1));
      return lim ? docs.slice(0, lim) : docs;
    }
    const q = {
      path,
      orderBy: (f, dir) => collection(path, [f, dir || 'asc'], lim),
      limit: n => collection(path, ord, n),
      get: async () => qs(await fetchDocs()),
      doc: id => doc(path + '/' + (id || Math.random().toString(36).slice(2, 12))),
      add: async d => { const r = q.doc(); await r.set(d); return r; },
      onSnapshot: (next, err) => {
        let last = null; const l = { run: async () => { const docs = await fetchDocs(); const s = JSON.stringify(docs); if (s !== last) { last = s; next(qs(docs)); } } };
        listeners.add(l); ensureTimer(); l.run().catch(e => err && err(e)); return () => listeners.delete(l);
      }
    };
    return q;
  }
  async function uploadAsset(file) {
    const id = 'a' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const CH = Math.floor(2.4 * 1024 * 1024), n = Math.max(1, Math.ceil(file.size / CH));
    for (let i = 0; i < n; i++) {
      const part = file.slice(i * CH, (i + 1) * CH);
      const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(part); });
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, i, n, data: b64, type: file.type || 'application/octet-stream' }) });
      if (!r.ok) throw new Error('upload failed (' + r.status + ')');
    }
    return { id, url: '/_blob/' + id, sizeBytes: file.size, contentType: file.type };
  }
  const caps = {
    db: async () => { await me(); return { doc, collection: p => collection(p) }; },
    user: async () => { const m = await me(); return { me: async () => ({ id: m.email, email: m.email, name: m.email, isOwner: m.canEdit, canEdit: m.canEdit }), canEdit: async () => m.canEdit, isOwner: async () => m.canEdit, id: async () => m.email, can: async () => m.canEdit }; },
    assets: async () => { const m = await me(); return m.canEdit ? { upload: uploadAsset } : null; },
    downloads: async () => ({ save: async ({ filename, data }) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return { ok: true }; } })
  };
  window.claude = { use: async n => (caps[n] ? caps[n]() : null) };
  window.__uploadAsset = uploadAsset; window.__me = me;
})();
