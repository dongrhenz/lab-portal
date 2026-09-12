const fsSync = require('fs');
const fs = require('fs/promises');

// Lazily require pdf-parse so a missing dependency degrades gracefully instead
// of crashing the whole app: every file just falls back to being grouped by
// its own case number (exactly the old behavior) if this isn't installed, and
// dob/age simply won't be shown.
let pdfParse = null;
try {
  // eslint-disable-next-line global-require
  pdfParse = require('pdf-parse');
} catch (err) {
  pdfParse = null;
}

// pdf-parse (via pdfjs) extracts this form's text roughly column-by-column,
// not in visual reading order — so some label/value pairs (like "PID:") can
// end up several lines apart with other fields' labels in between, while
// others (like "DOB:04/30/1962") come through on one line, adjacent. Run
// `node debug-pdf-text.js <path-to-a-real-pdf>` to see the raw extracted text
// if any of these patterns need adjusting for your LIS's form layout.

// PID: label-adjacent first (works when a PDF's layout keeps them together),
// falling back to this LIS's PID shape — always 15 digits (an 8-digit
// YYYYMMDD prefix + a 7-digit sequence, confirmed against real samples) and
// nothing else on the form is 15 digits (case numbers are 7, license numbers
// are 6-7, dates use "/").
const PID_LABEL_PATTERN = /PID\s*:?\s*([0-9]{6,})/i;
const PID_STANDALONE_PATTERN = /\b(\d{15})\b/;

const DOB_PATTERN = /DOB\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
const AGE_PATTERN = /Age\s*:?\s*(\d{1,3}(?:\.\d+)?\s*(?:Year|Yr|Month|Mo|Day)s?(?:\(s\))?)/i;

// filePath -> { mtimeMs, meta } — avoids re-parsing a PDF's text on every scan
// (scanAllResults() re-walks the share on essentially every request).
const cache = new Map();

function findPidInText(text) {
  const labelMatch = text.match(PID_LABEL_PATTERN);
  if (labelMatch) return labelMatch[1];
  const standaloneMatch = text.match(PID_STANDALONE_PATTERN);
  if (standaloneMatch) return standaloneMatch[1];
  return null;
}

function findDobInText(text) {
  const match = text.match(DOB_PATTERN);
  return match ? match[1] : null;
}

function findAgeInText(text) {
  const match = text.match(AGE_PATTERN);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Best-effort extraction of patient details printed inside a lab result PDF:
 * the stable Patient ID (PID, separate from the per-visit Case No.), date of
 * birth, and age at the time of that visit. Any field can come back null if
 * pdf-parse isn't installed, the file can't be read/parsed, or that field's
 * pattern isn't found — callers must treat a null PID as "group this file by
 * its own case number" (never guess/merge), and simply omit null dob/age from
 * display rather than showing something misleading.
 */
async function extractMeta(filePath) {
  if (!pdfParse) return { pid: null, dob: null, age: null };

  let stat;
  try {
    stat = fsSync.statSync(filePath);
  } catch (err) {
    return { pid: null, dob: null, age: null };
  }

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.meta;
  }

  let meta = { pid: null, dob: null, age: null };
  try {
    const buffer = await fs.readFile(filePath);
    const parsed = await pdfParse(buffer);
    meta = {
      pid: findPidInText(parsed.text),
      dob: findDobInText(parsed.text),
      age: findAgeInText(parsed.text),
    };
  } catch (err) {
    meta = { pid: null, dob: null, age: null }; // unreadable/corrupt/unparseable PDF — don't crash the scan
  }

  cache.set(filePath, { mtimeMs: stat.mtimeMs, meta });
  return meta;
}

/** Back-compat convenience wrapper — most callers want the full extractMeta(). */
async function extractPid(filePath) {
  const meta = await extractMeta(filePath);
  return meta.pid;
}

module.exports = {
  extractMeta,
  extractPid,
  findPidInText,
  findDobInText,
  findAgeInText,
  PID_LABEL_PATTERN,
  PID_STANDALONE_PATTERN,
  DOB_PATTERN,
  AGE_PATTERN,
};
