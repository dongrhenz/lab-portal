const fs = require('fs');
const path = require('path');
const { LIS_ROOT, DATE_FOLDER_PATTERN, MAX_DAYS_HISTORY } = require('./config');
const { extractMeta } = require('./pdfMeta');

// Filenames look like: 9095708_ENTERINA, ROD MERCADER.pdf
// i.e.  <caseNo>_<LASTNAME, FIRSTNAME MIDDLENAME>.pdf
const FILENAME_PATTERN = /^([^_]+)_(.+)\.pdf$/i;

function normalizeName(name) {
  return name
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCaseNo(caseNo) {
  return String(caseNo).trim().toUpperCase();
}

/**
 * Walk the share and return every result file found, tagged with
 * caseNo, patientName, category (subfolder), date (from folder name), and full path.
 * This is intentionally re-scanned on demand rather than cached long-term, since the
 * LIS drops new folders/files continuously.
 *
 * Each record also gets a `groupKey`: the patient's stable PID extracted from
 * inside the PDF itself when available, so all of a patient's results across
 * different case numbers (one per visit) can be shown together. If a PID
 * can't be read from a given file, that file falls back to being grouped by
 * its own case number alone (i.e. the original, pre-PID behavior) — it is
 * never silently merged with another patient's results.
 */
async function scanAllResults() {
  const results = [];

  let dateFolders;
  try {
    dateFolders = fs.readdirSync(LIS_ROOT, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read LIS_ROOT (${LIS_ROOT}): ${err.message}`);
  }

  const matchingDateFolders = dateFolders
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => DATE_FOLDER_PATTERN.test(name))
    .sort()
    .reverse() // newest first
    .slice(0, MAX_DAYS_HISTORY);

  for (const dateFolderName of matchingDateFolders) {
    const dateMatch = dateFolderName.match(DATE_FOLDER_PATTERN);
    const dateStr = dateMatch[1]; // YYYYMMDD
    const dateFolderPath = path.join(LIS_ROOT, dateFolderName);

    let categoryFolders;
    try {
      categoryFolders = fs.readdirSync(dateFolderPath, { withFileTypes: true });
    } catch (err) {
      continue; // skip unreadable/locked folder, don't crash the whole scan
    }

    for (const catDirent of categoryFolders) {
      if (!catDirent.isDirectory()) continue;
      const category = catDirent.name; // Chemistry, Fecalysis, Hematology, ImmunoSero, Urinalysis, ...
      const categoryPath = path.join(dateFolderPath, category);

      let files;
      try {
        files = fs.readdirSync(categoryPath, { withFileTypes: true });
      } catch (err) {
        continue;
      }

      for (const fileDirent of files) {
        if (!fileDirent.isFile()) continue;
        const m = fileDirent.name.match(FILENAME_PATTERN);
        if (!m) continue; // skip files that don't follow the expected naming convention

        const [, rawCaseNo, rawName] = m;
        results.push({
          caseNo: normalizeCaseNo(rawCaseNo),
          patientName: rawName.trim(),
          normalizedName: normalizeName(rawName),
          category,
          date: dateStr, // YYYYMMDD
          fileName: fileDirent.name,
          filePath: path.join(categoryPath, fileDirent.name),
        });
      }
    }
  }

  // Attach the stable grouping key plus any patient details (DOB, age) we can
  // read out of the PDF. Done as a second pass, concurrently, since
  // reading/parsing each PDF's text is async (results.length calls run in
  // parallel; extractMeta caches per file by mtime so repeat scans are cheap).
  await Promise.all(
    results.map(async (r) => {
      const { pid, dob, age } = await extractMeta(r.filePath);
      r.pid = pid;
      r.dob = dob;
      r.age = age;
      r.groupKey = pid || r.caseNo;
    })
  );

  return results;
}

/** Find all result records for a given case number (a single visit). */
async function findByCaseNo(caseNo) {
  const target = normalizeCaseNo(caseNo);
  const all = await scanAllResults();
  return all.filter((r) => r.caseNo === target);
}

/**
 * Find every result across all of a patient's case numbers/visits, keyed by
 * the stable groupKey (PID when readable, case number otherwise) established
 * in scanAllResults().
 */
async function findByGroupKey(groupKey) {
  const all = await scanAllResults();
  return all.filter((r) => r.groupKey === groupKey);
}

/**
 * Loose name match: every "significant token" the user typed must appear
 * somewhere in the name embedded in the filename (order-independent, so
 * "Enterina Rod" or "Rod Enterina" both match "ENTERINA, ROD MERCADER").
 */
function nameMatches(submittedFullName, normalizedFileName) {
  const submittedTokens = normalizeName(submittedFullName)
    .split(' ')
    .filter((t) => t.length > 1);
  if (submittedTokens.length === 0) return false;
  return submittedTokens.every((t) => normalizedFileName.includes(t));
}

module.exports = {
  scanAllResults,
  findByCaseNo,
  findByGroupKey,
  nameMatches,
  normalizeName,
  normalizeCaseNo,
};
