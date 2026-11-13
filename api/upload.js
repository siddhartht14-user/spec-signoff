const L = require('./_lib');
/* chunked upload: POST {id,i,n,data(base64),type}. Last chunk assembles asset "assets/<id>". */
module.exports = async (req, res) => {
  const s = L.session(req); if (!s) return L.json(res, 401, { error: 'signin' });
  try {
    const b = await L.body(req); const id = String(b.id || ''); if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return L.json(res, 400, { error: 'id' });
    const i = +b.i, n = +b.n; if (!(n >= 1 && n <= 40 && i >= 0 && i < n)) return L.json(res, 400, { error: 'chunk' });
    const buf = Buffer.from(String(b.data || ''), 'base64');
    if (n === 1) { await L.rawPut('assets/' + id, buf, b.type); return L.json(res, 200, { done: true, id }); }
    await L.rawPut('tmp/' + id + '/' + String(i).padStart(3, '0'), buf, 'application/octet-stream');
    if (i < n - 1) return L.json(res, 200, { done: false });
    const parts = []; for (let k = 0; k < n; k++) { const r = await L.rawGet('tmp/' + id + '/' + String(k).padStart(3, '0')); if (!r) return L.json(res, 400, { error: 'missing_part_' + k }); parts.push(r.buf); }
    await L.rawPut('assets/' + id, Buffer.concat(parts), b.type);
    const tmp = await L.rawList('tmp/' + id + '/'); await L.rawDel(tmp);
    L.json(res, 200, { done: true, id });
  } catch (e) { L.json(res, 500, { error: String(e.message || e) }); }
};
