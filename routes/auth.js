const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { findByCaseNo, nameMatches, normalizeCaseNo } = require('../scanner');

const router = express.Router();

// Slow down brute-force guessing of case numbers / PINs.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function logAttempt(caseNo, ip, success) {
  db.prepare(
    'INSERT INTO login_attempts (case_no, ip, success) VALUES (?, ?, ?)'
  ).run(caseNo, ip, success ? 1 : 0);
}

/**
 * Step 1: patient proves they know their case number + full name (as printed
 * on their lab slip). If this is their first time, they're asked to set a PIN.
 * If they already have a PIN, they're told to log in with it instead.
 */
router.post('/verify', loginLimiter, async (req, res) => {
  const { caseNo, fullName } = req.body || {};
  if (!caseNo || !fullName) {
    return res.status(400).json({ error: 'Case number and full name are required.' });
  }

  const normalizedCaseNo = normalizeCaseNo(caseNo);
  let matches;
  try {
    matches = await findByCaseNo(normalizedCaseNo);
  } catch (err) {
    return res.status(500).json({ error: 'Could not reach the results server. Please try again shortly.' });
  }

  if (matches.length === 0 || !matches.some((m) => nameMatches(fullName, m.normalizedName))) {
    logAttempt(normalizedCaseNo, req.ip, false);
    // Deliberately vague — don't reveal whether the case number exists at all.
    return res.status(401).json({ error: 'We could not verify those details.' });
  }

  // Look the account up by the patient's stable group key (PID when readable,
  // this case number otherwise), not by the specific case number typed — so a
  // patient who already set a PIN via an earlier visit's case number is
  // recognized here even though this is a different case number.
  const groupKey = matches[0].groupKey;
  const existing = db
    .prepare('SELECT group_key FROM patient_credentials WHERE group_key = ?')
    .get(groupKey);

  logAttempt(normalizedCaseNo, req.ip, true);

  if (existing) {
    return res.json({ status: 'has_pin' });
  }
  return res.json({ status: 'needs_pin_setup', nameOnFile: matches[0].patientName });
});

/** Step 2a (first visit only): set a PIN after identity has been verified. */
router.post('/setup-pin', loginLimiter, async (req, res) => {
  const { caseNo, fullName, pin } = req.body || {};
  if (!caseNo || !fullName || !pin) {
    return res.status(400).json({ error: 'Missing fields.' });
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4-8 digits.' });
  }

  const normalizedCaseNo = normalizeCaseNo(caseNo);
  let matches;
  try {
    matches = await findByCaseNo(normalizedCaseNo);
  } catch (err) {
    return res.status(500).json({ error: 'Could not reach the results server. Please try again shortly.' });
  }
  if (matches.length === 0 || !matches.some((m) => nameMatches(fullName, m.normalizedName))) {
    logAttempt(normalizedCaseNo, req.ip, false);
    return res.status(401).json({ error: 'We could not verify those details.' });
  }

  const groupKey = matches[0].groupKey;
  const already = db
    .prepare('SELECT group_key FROM patient_credentials WHERE group_key = ?')
    .get(groupKey);
  if (already) {
    return res.status(409).json({ error: 'A PIN is already set for this case number.' });
  }

  const pinHash = bcrypt.hashSync(pin, 12);
  db.prepare(
    'INSERT INTO patient_credentials (group_key, first_case_no, name_snapshot, pin_hash) VALUES (?, ?, ?, ?)'
  ).run(groupKey, normalizedCaseNo, matches[0].patientName, pinHash);

  // Regenerate the session id on privilege change (anonymous -> authenticated) so a
  // session id an attacker handed to the victim beforehand can't be ridden in (session fixation).
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session. Please try again.' });
    req.session.groupKey = groupKey;
    res.json({ status: 'ok' });
  });
});

/**
 * Step 2b (returning visits): log in with case number + PIN. Any case number
 * belonging to this patient works here, not just the one originally used to
 * set up the PIN — we resolve whichever case number is typed to the
 * patient's stable group key first, then check the PIN against that.
 */
router.post('/login', loginLimiter, async (req, res) => {
  const { caseNo, pin } = req.body || {};
  if (!caseNo || !pin) {
    return res.status(400).json({ error: 'Case number and PIN are required.' });
  }

  const normalizedCaseNo = normalizeCaseNo(caseNo);
  let matches;
  try {
    matches = await findByCaseNo(normalizedCaseNo);
  } catch (err) {
    return res.status(500).json({ error: 'Could not reach the results server. Please try again shortly.' });
  }
  if (matches.length === 0) {
    logAttempt(normalizedCaseNo, req.ip, false);
    return res.status(401).json({ error: 'Invalid case number or PIN.' });
  }

  const groupKey = matches[0].groupKey;
  const row = db
    .prepare('SELECT pin_hash FROM patient_credentials WHERE group_key = ?')
    .get(groupKey);

  if (!row || !bcrypt.compareSync(pin, row.pin_hash)) {
    logAttempt(normalizedCaseNo, req.ip, false);
    return res.status(401).json({ error: 'Invalid case number or PIN.' });
  }

  db.prepare(
    "UPDATE patient_credentials SET last_login_at = datetime('now') WHERE group_key = ?"
  ).run(groupKey);
  logAttempt(normalizedCaseNo, req.ip, true);

  // Regenerate the session id on privilege change (anonymous -> authenticated) so a
  // session id an attacker handed to the victim beforehand can't be ridden in (session fixation).
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session. Please try again.' });
    req.session.groupKey = groupKey;
    res.json({ status: 'ok' });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ status: 'ok' }));
});

router.get('/session', (req, res) => {
  res.json({ loggedIn: !!req.session.groupKey });
});

module.exports = router;
