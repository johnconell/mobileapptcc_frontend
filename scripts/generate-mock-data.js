/**
 * Generates mock datasets for the TCC Entrance Examination frontend.
 * Run: node scripts/generate-mock-data.js
 */
const fs = require('fs');
const path = require('path');

const FIRST_NAMES = [
  'Andrea', 'Brian', 'Carla', 'Diego', 'Elena', 'Francis', 'Gina', 'Harold',
  'Isabel', 'Jonas', 'Karen', 'Luis', 'Maria', 'Noel', 'Olivia', 'Paolo',
  'Queenie', 'Ramon', 'Sofia', 'Tomas', 'Ursula', 'Victor', 'Wendy', 'Xander',
  'Yasmin', 'Zach', 'Alya', 'Ben', 'Celine', 'Danilo', 'Eva', 'Felix',
  'Grace', 'Hiro', 'Ivy', 'Jake', 'Kim', 'Lara', 'Miguel', 'Nina',
];

const LAST_NAMES = [
  'Reyes', 'Santos', 'Cruz', 'Garcia', 'Lopez', 'Torres', 'Flores', 'Ramos',
  'Mendoza', 'Gonzales', 'Villanueva', 'Castro', 'Domingo', 'Navarro', 'Perez',
  'Aquino', 'Bautista', 'Dela Cruz', 'Fernandez', 'Gutierrez', 'Hernandez',
  'Jimenez', 'Lim', 'Morales', 'Ortiz', 'Pascual', 'Quinto', 'Romero',
];

const COURSES = [
  'BS Information Technology',
  'BS Computer Science',
  'BS Education',
  'BS Business Administration',
  'BS Criminology',
  'BS Hospitality Management',
];

const SUBJECTS = [
  { id: 'subj-eng', code: 'ENG', name: 'English Proficiency', questionCount: 15 },
  { id: 'subj-math', code: 'MATH', name: 'Mathematics', questionCount: 15 },
  { id: 'subj-sci', code: 'SCI', name: 'Science', questionCount: 15 },
  { id: 'subj-log', code: 'LOG', name: 'Logical Reasoning', questionCount: 15 },
  { id: 'subj-gen', code: 'GEN', name: 'General Knowledge', questionCount: 10 },
  { id: 'subj-fil', code: 'FIL', name: 'Filipino', questionCount: 10 },
];

const CHOICES = ['A', 'B', 'C', 'D'];

const QUESTION_BANK = {
  'subj-eng': [
    ['Which word is a synonym of "rapid"?', 'Slow', 'Quick', 'Quiet', 'Rough'],
    ['Select the correctly spelled word.', 'Accomodate', 'Acommodate', 'Accommodate', 'Acomodate'],
    ['Identify the noun in the sentence: "The cat sleeps."', 'The', 'cat', 'sleeps', '.'],
    ['Which is an antonym of "scarce"?', 'Rare', 'Abundant', 'Limited', 'Sparse'],
    ['Choose the proper article: ___ honest man.', 'A', 'An', 'The', 'No article'],
  ],
  'subj-math': [
    ['What is 15% of 200?', '20', '25', '30', '35'],
    ['Solve: 3x + 6 = 18. What is x?', '2', '3', '4', '6'],
    ['What is the area of a rectangle 8 by 5?', '13', '26', '40', '45'],
    ['Simplify: 2/4 + 1/4', '1/4', '2/4', '3/4', '1'],
    ['What is the next number: 2, 4, 8, 16, ?', '18', '24', '30', '32'],
  ],
  'subj-sci': [
    ['What gas do plants absorb for photosynthesis?', 'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
    ['Water boils at what temperature at sea level (°C)?', '90', '95', '100', '110'],
    ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Jupiter', 'Mercury'],
    ['The basic unit of life is the:', 'Atom', 'Tissue', 'Cell', 'Organ'],
    ['Which organ pumps blood throughout the body?', 'Lungs', 'Liver', 'Heart', 'Kidney'],
  ],
  'subj-log': [
    ['If all roses are flowers and some flowers fade quickly, which is true?', 'All roses fade quickly', 'Some roses may fade quickly', 'No roses fade', 'Roses are not flowers'],
    ['Find the odd one out: Apple, Banana, Carrot, Mango', 'Apple', 'Banana', 'Carrot', 'Mango'],
    ['Complete the analogy: Book is to Reading as Fork is to ___', 'Drawing', 'Writing', 'Eating', 'Cooking'],
    ['If today is Wednesday, what day is 10 days later?', 'Friday', 'Saturday', 'Sunday', 'Monday'],
    ['Which number does not belong: 3, 5, 7, 9, 11?', '3', '5', '7', '9'],
  ],
  'subj-gen': [
    ['What is the capital of the Philippines?', 'Cebu', 'Davao', 'Manila', 'Quezon City'],
    ['Who wrote the Philippine National Anthem lyrics?', 'Jose Rizal', 'Julian Felipe', 'Jose Palma', 'Andres Bonifacio'],
    ['Tagoloan is a municipality in which province?', 'Bukidnon', 'Misamis Oriental', 'Lanao del Norte', 'Camiguin'],
    ['How many continents are there?', '5', '6', '7', '8'],
    ['Which color is typically associated with caution signs?', 'Blue', 'Green', 'Yellow', 'Purple'],
  ],
  'subj-fil': [
    ['Ano ang kahulugan ng "masipag"?', 'Tamad', 'Masigasig', 'Galit', 'Malungkot'],
    ['Alin ang pangngalan?', 'Tumakbo', 'Maganda', 'Bahay', 'Mabilis'],
    ['Ano ang kasalungat ng "maaga"?', 'Madali', 'Huli', 'Mabilis', 'Mabagal'],
    ['Piliin ang wastong baybay.', 'Kaibigan', 'Kaibgan', 'Kaibgaan', 'Kaibegan'],
    ['Ano ang pantig sa salitang "araw"?', '1', '2', '3', '4'],
  ],
};

const ANSWERS = {
  'subj-eng': ['B', 'C', 'B', 'B', 'B'],
  'subj-math': ['C', 'C', 'C', 'C', 'D'],
  'subj-sci': ['C', 'C', 'B', 'C', 'C'],
  'subj-log': ['B', 'C', 'C', 'B', 'D'],
  'subj-gen': ['C', 'C', 'B', 'C', 'C'],
  'subj-fil': ['B', 'C', 'B', 'A', 'B'],
};

function pick(list, index) {
  return list[index % list.length];
}

function buildQuestions() {
  const questions = [];
  let number = 1;

  for (const subject of SUBJECTS) {
    const bank = QUESTION_BANK[subject.id];
    const answers = ANSWERS[subject.id];

    for (let i = 0; i < subject.questionCount; i += 1) {
      const template = bank[i % bank.length];
      const answer = answers[i % answers.length];
      const variant = i >= bank.length ? ` (Set ${Math.floor(i / bank.length) + 1})` : '';

      questions.push({
        id: `q-${String(number).padStart(3, '0')}`,
        number,
        subjectId: subject.id,
        type: 'multiple_choice',
        question: `${template[0]}${variant}`,
        choices: {
          A: template[1],
          B: template[2],
          C: template[3],
          D: template[4],
        },
        correctAnswer: answer,
        explanation: `The correct answer is ${answer}. Review ${subject.name} fundamentals for related items.`,
      });

      number += 1;
    }
  }

  return questions;
}

function buildStudents() {
  const students = [];

  for (let i = 1; i <= 100; i += 1) {
    const firstName = pick(FIRST_NAMES, i);
    const lastName = pick(LAST_NAMES, i * 3);
    const fullName = `${firstName} ${lastName}`;
    const statusPool = ['connected', 'waiting', 'waiting', 'waiting', 'taking_exam', 'finished'];
    const status = pick(statusPool, i);
    const currentQuestion =
      status === 'taking_exam' ? (i % 80) + 1 : status === 'finished' ? 80 : 0;

    students.push({
      id: `stu-${String(i).padStart(3, '0')}`,
      studentNumber: `2026-${String(1000 + i)}`,
      firstName,
      lastName,
      fullName,
      course: pick(COURSES, i),
      batch: 'Batch A — Morning',
      avatarInitials: `${firstName[0]}${lastName[0]}`.toUpperCase(),
      status,
      connectionStatus: status === 'offline' ? 'disconnected' : 'connected',
      currentQuestion,
      totalQuestions: 80,
      remainingSeconds: status === 'finished' ? 0 : 5400 - i * 12,
      joinedAt: new Date(Date.UTC(2026, 6, 28, 0, 30, i)).toISOString(),
    });
  }

  return students;
}

const outDir = path.join(__dirname, '..', 'mock', 'data');
fs.mkdirSync(outDir, { recursive: true });

const exam = {
  id: 'exam-tcc-2026-entrance',
  name: 'TCC Entrance Examination 2026',
  date: 'July 28, 2026',
  startTime: '08:30 AM',
  endTime: '10:00 AM',
  estimatedStartTime: '08:30 AM',
  venue: 'ICT Laboratory — Main Building',
  batch: 'Batch A — Morning',
  durationMinutes: 90,
  totalQuestions: 80,
  status: 'lobby_open',
  instructions: [
    'Arrive at the venue and connect to the campus examination LAN.',
    'Keep your device charged. Screen lock and notifications should be disabled.',
    'Read each question carefully before selecting an answer.',
    'You may navigate between questions using Previous, Next, or the question palette.',
    'Answers are auto-saved as you select choices.',
    'Submit only when you have reviewed all unanswered items.',
  ],
  rules: [
    'No switching apps or leaving the examination screen once the exam starts.',
    'Do not communicate with other examinees during the test.',
    'Proctors may end the examination for all students at any time.',
    'Any form of cheating will result in disqualification.',
    'Official results will be released by the Admissions Office.',
  ],
};

const currentStudent = {
  id: 'stu-001',
  studentNumber: '2026-1001',
  firstName: 'Andrea',
  lastName: 'Reyes',
  fullName: 'Andrea Reyes',
  course: 'BS Information Technology',
  batch: 'Batch A — Morning',
  avatarInitials: 'AR',
};

const recentStatus = [
  {
    id: 'rs-1',
    title: 'Lobby open',
    description: 'Proctors have opened the examination lobby.',
    timestamp: 'Today · 7:45 AM',
    tone: 'info',
  },
  {
    id: 'rs-2',
    title: 'Device ready',
    description: 'Your device is configured for offline LAN examination.',
    timestamp: 'Today · 7:40 AM',
    tone: 'success',
  },
  {
    id: 'rs-3',
    title: 'Reminder',
    description: 'Keep your phone awake during the examination period.',
    timestamp: 'Today · 7:30 AM',
    tone: 'warning',
  },
];

fs.writeFileSync(path.join(outDir, 'exam.json'), JSON.stringify(exam, null, 2));
fs.writeFileSync(path.join(outDir, 'subjects.json'), JSON.stringify(SUBJECTS, null, 2));
fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(buildQuestions(), null, 2));
fs.writeFileSync(path.join(outDir, 'students.json'), JSON.stringify(buildStudents(), null, 2));
fs.writeFileSync(path.join(outDir, 'current-student.json'), JSON.stringify(currentStudent, null, 2));
fs.writeFileSync(path.join(outDir, 'recent-status.json'), JSON.stringify(recentStatus, null, 2));

console.log('Mock data generated in mock/data');
