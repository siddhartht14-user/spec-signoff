const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const b = await L.body(req); const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return L.json(res, 400, { error: 'Enter a valid email.' });
  const pass = process.env.TEAM_PASSCODE; if (!pass) return L.json(res, 500, { error: 'Team passcode not configured.' });
  if (String(b.passcode || '') !== pass) return L.json(res, 401, { error: 'Wrong passcode.' });
  L.setSession(res, { role: 'team', email, exp: Date.now() + 30 * 864e5 });
  L.json(res, 200, { ok: true });
};
