require('dotenv').config();
const path = require('path');

module.exports = {
  // Root of the LIS share, e.g. on Windows: \\172.22.60.5\SBSI LIS Pro
  // On Linux, mount the SMB share locally (see README) and point this at the mount point.
  LIS_ROOT: process.env.LIS_ROOT || path.join(__dirname, 'sample-data'),

  // Regex that matches the daily result folders, e.g. ".PDF Results20260910"
  DATE_FOLDER_PATTERN: /^\.PDF Results(\d{8})$/,

  // How many days of result folders to scan (protects against scanning a huge/old share)
  MAX_DAYS_HISTORY: parseInt(process.env.MAX_DAYS_HISTORY || '365', 10),

  SESSION_SECRET: process.env.SESSION_SECRET || 'CHANGE_ME_BEFORE_DEPLOY',

  PORT: parseInt(process.env.PORT || '3000', 10),

  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'data', 'patients.db'),
};
