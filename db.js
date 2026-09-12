const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./config');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

// NOTE: patient_credentials is keyed by group_key (a patient's stable PID
// extracted from inside their result PDFs, falling back to case number when
// no PID can be read) instead of case_no, so one account can cover every
// case number/visit belonging to that patient. If you're upgrading from an
// older copy of this app whose patients.db still has the old case_no-keyed
// schema, delete data/patients.db and let it recreate — existing test PINs
// are the only thing lost (patients just re-verify and set a new one).
db.exec(`
  CREATE TABLE IF NOT EXISTS patient_credentials (
    group_key TEXT PRIMARY KEY,
    first_case_no TEXT NOT NULL,
    name_snapshot TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_no TEXT NOT NULL,
    ip TEXT,
    success INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
