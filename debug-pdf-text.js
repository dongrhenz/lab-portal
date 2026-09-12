// Temporary diagnostic script — safe to delete once PID extraction is confirmed working.
// Usage:  node debug-pdf-text.js "\\172.22.60.5\SBSI LIS Pro\.PDF Results20260907\Chemistry\9093673_LAURON, BABY BOY.pdf"
//
// Dumps the raw text pdf-parse extracts from one PDF, and shows whether
// findPidInText() in pdfMeta.js actually finds the Patient ID in it. Use this
// if PID-based grouping isn't picking up results the way you expect — the
// exact text layout/PID format can vary enough between PDFs that the
// patterns in pdfMeta.js may need tweaking.

const fs = require('fs/promises');
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (err) {
  console.error('pdf-parse is not installed. Run `npm install` first.');
  process.exit(1);
}
const { findPidInText, findDobInText, findAgeInText } = require('./pdfMeta');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node debug-pdf-text.js <path-to-pdf>');
  process.exit(1);
}

(async () => {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);

  console.log('--- Raw extracted text ---');
  console.log(parsed.text);
  console.log('--- End of extracted text ---');
  console.log('');

  const pid = findPidInText(parsed.text);
  console.log(pid ? `PID found: "${pid}"` : 'No PID found (neither the label-adjacent nor the standalone 15-digit pattern matched).');

  const dob = findDobInText(parsed.text);
  console.log(dob ? `DOB found: "${dob}"` : 'No DOB found.');

  const age = findAgeInText(parsed.text);
  console.log(age ? `Age found: "${age}"` : 'No age found.');

  if (!pid || !dob || !age) {
    console.log('');
    console.log('Compare the raw text above against the patterns in pdfMeta.js and adjust them if needed.');
  }
})().catch((err) => {
  console.error('Failed to read/parse this PDF:', err.message);
  process.exit(1);
});
