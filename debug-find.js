// Temporary diagnostic script — safe to delete once the login issue is resolved.
// Usage:  node debug-find.js 9106529
//
// Dumps what scanAllResults() actually sees on the live share, so we can tell
// whether a case number isn't being found at all (share/scan problem) vs. found
// but under a name that doesn't match what's typed (matching-logic problem).

const { LIS_ROOT, DATE_FOLDER_PATTERN, MAX_DAYS_HISTORY } = require('./config');
const { scanAllResults, findByCaseNo, normalizeCaseNo } = require('./scanner');

const target = process.argv[2];

console.log('LIS_ROOT               :', LIS_ROOT);
console.log('DATE_FOLDER_PATTERN     :', DATE_FOLDER_PATTERN);
console.log('MAX_DAYS_HISTORY        :', MAX_DAYS_HISTORY);
console.log('');

let all;
try {
  all = scanAllResults();
} catch (err) {
  console.error('scanAllResults() THREW — the app cannot read LIS_ROOT at all:');
  console.error(err);
  process.exit(1);
}

const dateFolders = [...new Set(all.map((r) => r.date))].sort();
const categories = [...new Set(all.map((r) => r.category))].sort();

console.log('Total result files found :', all.length);
console.log('Date folders scanned     :', dateFolders.length ? dateFolders.join(', ') : '(none)');
console.log('Categories seen          :', categories.length ? categories.join(', ') : '(none)');
console.log('');

if (!target) {
  console.log('Pass a case number as an argument to look it up, e.g.:');
  console.log('  node debug-find.js 9106529');
  process.exit(0);
}

const normalizedTarget = normalizeCaseNo(target);
console.log(`Looking for case number "${target}" (normalized: "${normalizedTarget}")`);
console.log('');

const exactMatches = findByCaseNo(target);
if (exactMatches.length > 0) {
  console.log(`FOUND ${exactMatches.length} file(s) for this exact case number:`);
  for (const m of exactMatches) {
    console.log(`  - [${m.category}] ${m.date}  fileName="${m.fileName}"  normalizedName="${m.normalizedName}"`);
  }
} else {
  console.log('NOT FOUND under an exact case-number match.');
  console.log('Searching all scanned case numbers for anything similar (substring match)...');
  const near = all.filter(
    (r) => r.caseNo.includes(normalizedTarget) || normalizedTarget.includes(r.caseNo)
  );
  if (near.length > 0) {
    console.log(`Found ${near.length} file(s) whose case number is close but not identical:`);
    for (const m of near) {
      console.log(`  - caseNo="${m.caseNo}"  fileName="${m.fileName}"  [${m.category}] ${m.date}`);
    }
  } else {
    console.log('No close matches either. This case number does not appear anywhere in the scanned files.');
    console.log('Sample of case numbers that WERE found (first 10), to compare formatting:');
    for (const m of all.slice(0, 10)) {
      console.log(`  - caseNo="${m.caseNo}"  fileName="${m.fileName}"`);
    }
  }
}
