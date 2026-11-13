const L = require('./_lib');
/* Architect landing link: /r/<pid>.<xid>.<sig>  ->  scoped session, then the app */
module.exports = async (req, res) => {
  const t = String((req.query && req.query.t) || ''); const [pid, xid, sig] = t.split('.');
  if (!pid || !xid || !sig || sig !== L.linkSig(pid, xid)) { res.statusCode = 403; return res.end('This review link is not valid.'); }
  const proj = await L.docGet('projects/' + pid);
  if (!proj || !proj.architect) { res.statusCode = 404; return res.end('Project not found.'); }
  const prev = L.session(req);
  if (!(prev && prev.role === 'team')) L.setSession(res, { role: 'arch', email: String(proj.architect.email || '').toLowerCase(), pid, xid, exp: Date.now() + 30 * 864e5 });
  res.statusCode = 302; res.setHeader('Location', '/#p=' + pid + '&x=' + xid); res.end();
};
