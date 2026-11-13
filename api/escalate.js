const L = require('./_lib');
/* Daily cron: projects in review > 7 days, not yet escalated -> email sales leader, leader's leader, bid & design leader */
module.exports = async (req, res) => {
  const auth = req.headers.authorization || ''; const cs = process.env.CRON_SECRET;
  const s = L.session(req);
  if (!(cs && auth === 'Bearer ' + cs) && !(s && s.role === 'team')) return L.json(res, 401, { error: 'unauthorised' });
  const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
  const docs = await L.collGet('projects'); const sent = [], skipped = [];
  for (const { id, data: p } of docs) {
    const st = p.stats || {};
    if (p.status !== 'live' || !st.reviewSince || st.allSigned) continue;
    const days = Math.floor((Date.now() - new Date(st.reviewSince)) / 864e5);
    if (days <= 7) continue;
    if (p.escalatedAt && (Date.now() - new Date(p.escalatedAt)) < 7 * 864e5) { skipped.push(id); continue; }
    const e = p.emails || {}; const to = [e.salesLead, e.salesLead2, e.bdLead].filter(Boolean), cc = [e.sales, e.bd].filter(Boolean);
    if (!to.length) continue;
    try {
      await L.sendMail({ to, cc, subject: 'Escalation: ' + p.name + ' not signed off after ' + days + ' days',
        text: 'The architect review for ' + p.name + ' (' + (p.client || '') + ') was sent on ' + new Date(st.reviewSince).toDateString() + ' and is still not signed off (' + days + ' days).\n\nOpen tasks: ' + (st.open || 0) + '\nArchitect: ' + ((p.architect && p.architect.name) || '') + ' ' + ((p.architect && p.architect.email) || '') + '\n\nPlease help unblock this.\n\n' + base });
      await L.docSet('projects/' + id, { ...p, escalatedAt: new Date().toISOString() }); sent.push(id);
    } catch (err) { return L.json(res, err.code || 500, { error: String(err.message), sent }); }
  }
  L.json(res, 200, { sent, skipped });
};
