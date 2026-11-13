const L = require('./_lib');
module.exports = async (req, res) => {
  const s = L.session(req); if (!s || s.role !== 'team') return L.json(res, 401, { error: 'signin' });
  const pid = String(req.query.pid || ''), xid = String(req.query.xid || '');
  if (!/^[\w-]+$/.test(pid) || !/^[\w-]+$/.test(xid)) return L.json(res, 400, { error: 'ids' });
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  L.json(res, 200, { url: 'https://' + host + '/r/' + pid + '.' + xid + '.' + L.linkSig(pid, xid) });
};
