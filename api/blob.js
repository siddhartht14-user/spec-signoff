const L = require('./_lib');
module.exports = async (req, res) => {
  const s = L.session(req); if (!s) return L.json(res, 401, { error: 'signin' });
  const id = String((req.query && req.query.id) || ''); if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return L.json(res, 400, { error: 'id' });
  const r = await L.rawGet('assets/' + id); if (!r) return L.json(res, 404, { error: 'not_found' });
  res.statusCode = 200; res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'private, max-age=3600'); res.end(r.buf);
};
