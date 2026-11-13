const L = require('./_lib');
module.exports = async (req, res) => {
  const s = L.session(req); if (!s) return L.json(res, 401, { error: 'signin' });
  L.json(res, 200, { email: s.email, role: s.role, canEdit: s.role === 'team', pid: s.pid || null, xid: s.xid || null, mail: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM) });
};
