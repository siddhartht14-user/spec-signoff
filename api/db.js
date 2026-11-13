const L = require('./_lib');
module.exports = async (req, res) => {
  const s = L.session(req); if (!s) return L.json(res, 401, { error: 'signin' });
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  try {
    const b = await L.body(req); const p = b.path; L.cleanPath(p);
    if (b.op === 'get') { if (!L.canRead(s, p)) return L.json(res, 200, { exists: false }); const d = await L.docGet(p); return L.json(res, 200, d ? { exists: true, data: d } : { exists: false }); }
    if (b.op === 'list') {
      let docs = await L.collGet(p);
      if (s.role === 'arch') docs = docs.filter(d => L.canRead(s, p + '/' + d.id));
      else if (!L.canRead(s, p + '/x')) docs = [];
      return L.json(res, 200, { docs });
    }
    if (b.op === 'set') { if (!L.canWrite(s, p)) return L.json(res, 403, { error: 'forbidden' }); const d = b.data; if (!d || typeof d !== 'object' || JSON.stringify(d).length > 262144) return L.json(res, 400, { error: 'bad_body' }); await L.docSet(p, d); return L.json(res, 200, { ok: true }); }
    if (b.op === 'delete') { if (!L.canWrite(s, p)) return L.json(res, 403, { error: 'forbidden' }); await L.docDel(p); return L.json(res, 200, { ok: true }); }
    L.json(res, 400, { error: 'op' });
  } catch (e) { L.json(res, 400, { error: String(e.message || e) }); }
};
