const L = require('./_lib');
module.exports = async (req, res) => {
  const s = L.session(req); if (!s) return L.json(res, 401, { error: 'signin' });
  let allowed = null;
  if (s.role === 'arch') { const pr = await L.docGet('projects/' + s.pid); if (!pr) return L.json(res, 403, { error: 'forbidden' }); allowed = [...Object.values(pr.emails || {}), pr.architect && pr.architect.email].filter(Boolean).map(x => String(x).toLowerCase()); }
  try {
    const b = await L.body(req); const ok = a => Array.isArray(a) && a.every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (!ok(b.to) || !b.to.length || (b.cc && !ok(b.cc))) return L.json(res, 400, { error: 'recipients' });
    if (allowed) { b.to = b.to.filter(x => allowed.includes(x.toLowerCase())); b.cc = (b.cc || []).filter(x => allowed.includes(x.toLowerCase())); if (!b.to.length) return L.json(res, 403, { error: 'recipients_not_on_project' }); }
    let attachment = null;
    if (b.assetId) { if (!/^[A-Za-z0-9_-]{6,40}$/.test(b.assetId)) return L.json(res, 400, { error: 'asset' }); const r = await L.rawGet('assets/' + b.assetId); if (r) attachment = { name: String(b.attachName || 'review.pdf').replace(/[^\w. -]/g, '_'), buf: r.buf }; }
    await L.sendMail({ to: b.to, cc: b.cc, subject: String(b.subject || '').slice(0, 300), text: String(b.text || '').slice(0, 20000), attachment });
    L.json(res, 200, { ok: true });
  } catch (e) { L.json(res, e.code || 500, { error: String(e.message || e) }); }
};
