/**
 * Regenerates students.json with Gmail addresses.
 * Run: node scripts/generate-students.js
 */
const fs = require('fs');
const path = require('path');

const FIRST = [
  'Andrea', 'Brian', 'Carla', 'Diego', 'Elena', 'Francis', 'Gina', 'Harold',
  'Isabel', 'Jonas', 'Karen', 'Luis', 'Maria', 'Noel', 'Olivia', 'Paolo',
  'Queenie', 'Ramon', 'Sofia', 'Tomas', 'Ursula', 'Victor', 'Wendy', 'Xander',
  'Yasmin', 'Zach', 'Alya', 'Ben', 'Celine', 'Danilo', 'Eva', 'Felix',
  'Grace', 'Hiro', 'Ivy', 'Jake', 'Kim', 'Lara', 'Miguel', 'Nina',
];

const MIDDLE = [
  'Santos', 'Reyes', 'Cruz', 'Lopez', 'Torres', 'Flores', 'Ramos', 'Garcia',
  'Mendoza', 'Navarro', 'Perez', 'Aquino', 'Lim', 'Tan', 'Go',
];

const LAST = [
  'Reyes', 'Santos', 'Cruz', 'Garcia', 'Lopez', 'Torres', 'Flores', 'Ramos',
  'Mendoza', 'Gonzales', 'Villanueva', 'Castro', 'Domingo', 'Navarro', 'Perez',
  'Aquino', 'Bautista', 'Dela Cruz', 'Fernandez', 'Gutierrez',
];

const PROGRAMS = [
  { id: 'prog-bsit', code: 'BSIT', name: 'BS Information Technology' },
  { id: 'prog-bsba', code: 'BSBA', name: 'BS Business Administration' },
  { id: 'prog-bsed', code: 'BSED', name: 'BS Education' },
  { id: 'prog-beed', code: 'BEED', name: 'BEED' },
  { id: 'prog-crim', code: 'CRIM', name: 'Criminology' },
];

const students = [];
for (let i = 1; i <= 80; i += 1) {
  const firstName = FIRST[i % FIRST.length];
  const middleName = MIDDLE[i % MIDDLE.length];
  const lastName = LAST[(i * 3) % LAST.length];
  const program = PROGRAMS[i % PROGRAMS.length];
  const sex = i % 2 === 0 ? 'Female' : 'Male';
  const emailLocal = `${firstName}.${lastName}${i}`
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9.]/g, '');

  students.push({
    id: `stu-${String(i).padStart(3, '0')}`,
    studentId: `2026-${String(1000 + i)}`,
    firstName,
    middleName,
    lastName,
    fullName: `${firstName} ${middleName} ${lastName}`,
    email: `${emailLocal}@gmail.com`,
    programId: program.id,
    programCode: program.code,
    programName: program.name,
    sex,
    avatarInitials: `${firstName[0]}${lastName[0]}`.toUpperCase(),
  });
}

const out = path.join(__dirname, '..', 'mock', 'data', 'students.json');
fs.writeFileSync(out, JSON.stringify(students, null, 2));
console.log(`Wrote ${students.length} students to ${out}`);
