const express = require('express');
const path = require('path');
const fs = require('fs');
const { findByGroupKey } = require('../scanner');
const { LIS_ROOT } = require('../config');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.groupKey) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

function fileToken(record) {
  // Opaque token so the browser never sees or can tamper with a real filesystem path.
  const payload = `${record.caseNo}|${record.category}|${record.date}|${record.fileName}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeToken(token) {
  const payload = Buffer.from(token, 'base64url').toString('utf8');
  const [caseNo, category, date, fileName] = payload.split('|');
  return { caseNo, category, date, fileName };
}

function formatDate(yyyymmdd) {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

/**
 * List everything on file for the logged-in patient across every case
 * number/visit that shares their group key, newest first, grouped by category.
 */
router.get('/', requireLogin, async (req, res) => {
  let records;
  try {
    records = await findByGroupKey(req.session.groupKey);
  } catch (err) {
    return res.status(500).json({ error: 'Could not reach the results server. Please try again shortly.' });
  }

  records.sort((a, b) => (a.date < b.date ? 1 : -1));

  const items = records.map((r) => ({
    token: fileToken(r),
    category: r.category,
    date: formatDate(r.date),
    fileName: r.fileName,
    caseNo: r.caseNo, // shown per-item since one account can now span several visits/case numbers
  }));

  // Patient details (PID, DOB, age) come from parsing each PDF's own text and
  // aren't guaranteed to be found on every file, so take the first record
  // (newest first, since records is already sorted above) that actually has
  // each field rather than assuming records[0] has all of them. patientId is
  // deliberately the raw extracted PID (not groupKey), which silently falls
  // back to a case number when no PID was ever found — showing that back to
  // the patient mislabeled as their "Patient ID" would be misleading.
  const withPid = records.find((r) => r.pid);
  const withDob = records.find((r) => r.dob);
  const withAge = records.find((r) => r.age);

  res.json({
    patientName: records[0] ? records[0].patientName : null,
    patientId: withPid ? withPid.pid : null,
    dob: withDob ? withDob.dob : null,
    age: withAge ? withAge.age : null,
    results: items,
  });
});

/** Stream a single PDF, after re-checking it still belongs to the logged-in patient. */
router.get('/file/:token', requireLogin, async (req, res) => {
  let decoded;
  try {
    decoded = decodeToken(req.params.token);
  } catch (err) {
    return res.status(400).send('Bad request.');
  }

  const candidatePath = path.join(
    LIS_ROOT,
    `.PDF Results${decoded.date}`,
    decoded.category,
    decoded.fileName
  );

  // Guard against any path traversal sneaking in via the token.
  const resolvedRoot = path.resolve(LIS_ROOT);
  const resolvedCandidate = path.resolve(candidatePath);
  if (!resolvedCandidate.startsWith(resolvedRoot)) {
    return res.status(400).send('Bad request.');
  }

  // Re-verify against a live scan (across every case number under this
  // patient's group key) rather than trusting the token's claims blindly.
  let records;
  try {
    records = await findByGroupKey(req.session.groupKey);
  } catch (err) {
    return res.status(500).send('Could not reach the results server. Please try again shortly.');
  }
  const stillOwnedByPatient = records.some((r) => path.resolve(r.filePath) === resolvedCandidate);
  if (!stillOwnedByPatient) {
    return res.status(403).send('Forbidden.');
  }

  if (!fs.existsSync(resolvedCandidate)) {
    return res.status(404).send('File not found.');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${decoded.fileName}"`);
  fs.createReadStream(resolvedCandidate).pipe(res);
});

module.exports = router;
