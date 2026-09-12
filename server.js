const express = require('express');
const session = require('express-session');
const path = require('path');
const { SESSION_SECRET, PORT } = require('./config');

const authRoutes = require('./routes/auth');
const resultsRoutes = require('./routes/results');

const app = express();

// Needed so express-rate-limit (and req.ip / req.secure) work correctly once this
// sits behind a reverse proxy (nginx/IIS/Caddy) as the README's production setup
// requires. Without this, X-Forwarded-For is untrusted: every patient behind the
// proxy can get bucketed into one shared rate-limit counter, or express-rate-limit
// throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. "1" trusts one hop (the proxy in front
// of this app) — set it to match your actual deployment topology.
//
// env vars are always strings, so TRUST_PROXY=false must NOT be passed to
// app.set() as-is — the literal string "false" is truthy in JS and Express would
// try (and fail) to parse the word "false" as a trusted hostname/IP.
function parseTrustProxy(raw, isProduction) {
  if (raw === undefined || raw === '') return isProduction ? 1 : false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && raw.trim() !== '') return asNumber;
  return raw; // hostname / IP / CIDR / comma-separated list — passed through as-is
}
const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY, process.env.NODE_ENV === 'production');
app.set('trust proxy', TRUST_PROXY);

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure:true requires HTTPS — turn on once you put this behind TLS (see README).
      secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true',
      maxAge: 1000 * 60 * 30, // 30 minute session
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/results', resultsRoutes);

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Lab results portal listening on http://localhost:${PORT}`);
});
