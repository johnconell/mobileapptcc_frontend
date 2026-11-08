const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../../masterexam-pro/api');
const sources = [
  'routes/api_v1.php',
  'app/Http/Controllers/Proctor/Api/V1/ProctorAuthController.php',
  'app/Http/Controllers/Proctor/Api/V1/ExamSessionController.php',
  'app/Http/Controllers/Applicant/Api/V1/PublicExamController.php',
  'app/Http/Controllers/Synchronization/Api/V1/OfflineResultController.php',
  'app/Services/ExamSessionService.php',
  'app/Services/ExamDayPackService.php',
  'app/Models/ExaminationRegistration.php',
  'app/Models/ExaminationSetting.php',
  'app/Http/Resources/Api/V1/QuestionResource.php',
  'app/Http/Resources/Api/V1/ExaminationResultResource.php',
  'database/migrations/2026_07_24_010000_create_examination_domain_tables.php',
  'database/migrations/2026_07_30_211000_create_examination_settings_table.php',
];
const expected = 'edc96eac4cedbe88c41785ae47ca7132dccadefd94e2492e9f06b6f44d9f6ab6';
const hash = crypto.createHash('sha256');
for (const source of sources) {
  const file = path.join(backendRoot, source);
  if (!fs.existsSync(file)) throw new Error(`Missing backend contract source: ${source}`);
  hash.update(source); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
}
const actual = hash.digest('hex');
if (process.argv.includes('--print')) { console.log(actual); process.exit(0); }
if (actual !== expected) {
  console.error(`Backend contract changed.\nExpected: ${expected}\nActual:   ${actual}\nRe-audit the listed sources and update fixtures/tests.`);
  process.exit(1);
}
console.log(`Backend contract fingerprint OK: ${actual}`);
