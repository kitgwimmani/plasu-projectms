import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { q, db, migrate, setSetting, UPLOAD_DIR, DB_FILE } from './db.js';
import { buildDocx, DEFAULT_DOCS } from './lib/docx.js';

export const DEFAULT_FEATURES = {
  registration: true, chat: true, editor: true, plagiarism: true, ai_checker: true, references: true,
  community: true, manuscripts: true, resources: true, defenses: true, announcements: true,
};

const STRUCTURE = [
  { name: 'Faculty of Natural and Applied Sciences', code: 'FNAS', depts: [
    ['Computer Science', 'CSC', [['B.Sc. Computer Science', 'B.Sc.', 'UG'], ['M.Sc. Computer Science', 'M.Sc.', 'PG'], ['PhD Computer Science', 'PhD', 'PG']]],
    ['Mathematics', 'MTH', [['B.Sc. Mathematics', 'B.Sc.', 'UG'], ['M.Sc. Mathematics', 'M.Sc.', 'PG']]],
    ['Biological Sciences', 'BIO', [['B.Sc. Biology', 'B.Sc.', 'UG'], ['M.Sc. Microbiology', 'M.Sc.', 'PG']]],
    ['Chemistry', 'CHM', [['B.Sc. Chemistry', 'B.Sc.', 'UG']]],
    ['Physics', 'PHY', [['B.Sc. Physics', 'B.Sc.', 'UG']]],
  ] },
  { name: 'Faculty of Social Sciences', code: 'FSS', depts: [
    ['Economics', 'ECO', [['B.Sc. Economics', 'B.Sc.', 'UG'], ['M.Sc. Economics', 'M.Sc.', 'PG']]],
    ['Political Science', 'POL', [['B.Sc. Political Science', 'B.Sc.', 'UG']]],
    ['Sociology', 'SOC', [['B.Sc. Sociology', 'B.Sc.', 'UG']]],
    ['Mass Communication', 'MAC', [['B.Sc. Mass Communication', 'B.Sc.', 'UG']]],
  ] },
  { name: 'Faculty of Management Sciences', code: 'FMS', depts: [
    ['Accounting', 'ACC', [['B.Sc. Accounting', 'B.Sc.', 'UG'], ['M.Sc. Accounting', 'M.Sc.', 'PG']]],
    ['Business Administration', 'BUS', [['B.Sc. Business Administration', 'B.Sc.', 'UG'], ['MBA', 'MBA', 'PG']]],
  ] },
  { name: 'Faculty of Arts', code: 'FART', depts: [
    ['English', 'ENG', [['B.A. English', 'B.A.', 'UG']]],
    ['History and International Studies', 'HIS', [['B.A. History and International Studies', 'B.A.', 'UG']]],
  ] },
  { name: 'Faculty of Education', code: 'FEDU', depts: [
    ['Science and Technology Education', 'STE', [['B.Sc.(Ed.) Computer Science', 'B.Sc.(Ed.)', 'UG'], ['M.Ed. Science Education', 'M.Ed.', 'PG']]],
  ] },
  { name: 'Faculty of Law', code: 'FLAW', depts: [['Public Law', 'PUL', [['LL.B. Law', 'LL.B.', 'UG']]]] },
];

const SAMPLE_CH1 = `<h1>CHAPTER ONE</h1><h1>INTRODUCTION</h1><h2>1.1 Background of the Study</h2>
<p>Agriculture remains the backbone of the economy of Plateau State, employing a large share of rural households. Farmers in Bokkos and surrounding local government areas depend on rain-fed production of potatoes, maize and vegetables, yet they have limited access to timely information on weather, pests and market prices.</p>
<p>Mobile phone penetration in the state has grown quickly over the last decade. This creates an opportunity to deliver extension services through simple SMS and voice applications that work on basic handsets. However, few studies have examined whether such services change farming decisions in the local context.</p>
<h2>1.2 Statement of the Problem</h2><p>Extension officers in the study area are few relative to the number of farmers, and many farmers rely on informal advice. Post-harvest losses and poor pricing persist because information arrives late or not at all.</p>`;

export async function seed({ force = false } = {}) {
  migrate();
  if (!force && q.get('SELECT COUNT(*) AS n FROM users').n > 0) return false;
  console.log('Seeding database…');
  const hash = (p) => bcrypt.hashSync(p, 10);
  const pw = hash('Password@123');

  setSetting('features', DEFAULT_FEATURES);
  setSetting('institution', { name: 'Plateau State University, Bokkos', short: 'PLASU', motto: 'Knowledge, Diligence, Integrity' });
  setSetting('session', '2026/2027');
  setSetting('plagiarism_threshold', 25);
  setSetting('ai_threshold', 60);

  const ids = { faculties: {}, depts: {}, programs: {} };
  q.tx(() => {
    for (const f of STRUCTURE) {
      const fid = q.run('INSERT INTO faculties(name, code) VALUES (?,?)', f.name, f.code).id;
      ids.faculties[f.code] = fid;
      for (const [dname, dcode, progs] of f.depts) {
        const did = q.run('INSERT INTO departments(faculty_id, name, code) VALUES (?,?,?)', fid, dname, dcode).id;
        ids.depts[dcode] = did;
        for (const [pname, degree, level] of progs) {
          ids.programs[pname] = q.run('INSERT INTO programs(department_id, name, degree, level, duration) VALUES (?,?,?,?,?)', did, pname, degree, level, level === 'UG' ? '4 years' : degree === 'PhD' ? '3–5 years' : '2 years').id;
        }
      }
    }
  });

  const user = (o) => q.run(`INSERT INTO users(name, email, password_hash, role, status, title, faculty_id, department_id, program_id, matric_no, staff_id, level, research_interests, phone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, o.name, o.email, o.pw || pw, o.role, o.status || 'active', o.title, o.faculty_id, o.department_id, o.program_id, o.matric_no, o.staff_id, o.level, o.research_interests, o.phone).id;

  const F = ids.faculties.FNAS, CSC = ids.depts.CSC, MTH = ids.depts.MTH;
  const superId = user({ name: 'System Owner', email: 'superadmin@plasu.edu.ng', pw: hash('Admin@123'), role: 'superadmin', title: 'Mr.' });
  user({ name: 'ICT Systems Administrator', email: 'sysadmin@plasu.edu.ng', role: 'sysadmin', title: 'Engr.', staff_id: 'PLASU/ICT/001' });
  const dean = user({ name: 'Grace Dalyop', email: 'dean.fnas@plasu.edu.ng', role: 'dean', title: 'Prof.', faculty_id: F, staff_id: 'PLASU/FNAS/010', research_interests: 'Applied statistics, data science' });
  const hod = user({ name: 'Joseph Pam', email: 'hod.csc@plasu.edu.ng', role: 'hod', title: 'Dr.', faculty_id: F, department_id: CSC, staff_id: 'PLASU/CSC/002', research_interests: 'Information security, networks' });
  const hodM = user({ name: 'Ruth Gyang', email: 'hod.mth@plasu.edu.ng', role: 'hod', title: 'Dr.', faculty_id: F, department_id: MTH, staff_id: 'PLASU/MTH/002', research_interests: 'Numerical analysis' });
  q.run('UPDATE faculties SET dean_id = ? WHERE id = ?', dean, F);
  q.run('UPDATE departments SET hod_id = ? WHERE id = ?', hod, CSC);
  q.run('UPDATE departments SET hod_id = ? WHERE id = ?', hodM, MTH);

  const lec1 = user({ name: 'Daniel Bulus', email: 'd.bulus@plasu.edu.ng', role: 'lecturer', title: 'Dr.', faculty_id: F, department_id: CSC, staff_id: 'PLASU/CSC/011', research_interests: 'Machine learning, NLP, agriculture informatics' });
  const lec2 = user({ name: 'Mary Choji', email: 'm.choji@plasu.edu.ng', role: 'lecturer', title: 'Mrs.', faculty_id: F, department_id: CSC, staff_id: 'PLASU/CSC/014', research_interests: 'Software engineering, HCI, e-learning' });
  user({ name: 'Samuel Davou', email: 's.davou@plasu.edu.ng', role: 'lecturer', status: 'pending', title: 'Mr.', faculty_id: F, department_id: CSC, staff_id: 'PLASU/CSC/019', research_interests: 'Cloud computing' });

  const ug = ids.programs['B.Sc. Computer Science'], pg = ids.programs['M.Sc. Computer Science'];
  const students = [
    ['Amina Musa', 'amina.musa@student.plasu.edu.ng', 'PLASU/2022/CSC/0101', ug, 'UG', lec1, 'chapter2'],
    ['John Dakum', 'john.dakum@student.plasu.edu.ng', 'PLASU/2022/CSC/0102', ug, 'UG', lec1, 'topic'],
    ['Blessing Pam', 'blessing.pam@student.plasu.edu.ng', 'PLASU/2022/CSC/0103', ug, 'UG', lec2, 'chapter4'],
    ['Ibrahim Yusuf', 'ibrahim.yusuf@student.plasu.edu.ng', 'PLASU/PG/2025/CSC/007', pg, 'PG', lec1, 'proposal'],
    ['Esther Lar', 'esther.lar@student.plasu.edu.ng', 'PLASU/2022/CSC/0110', ug, 'UG', null, 'registered'],
  ];
  const titles = {
    chapter2: 'Design and Evaluation of an SMS-Based Agricultural Advisory System for Smallholder Farmers in Bokkos LGA',
    chapter4: 'A Machine Learning Approach to Predicting Student Academic Performance in Plateau State University',
    proposal: 'Transformer-Based Detection of Misinformation in Hausa-Language Social Media Posts',
  };
  for (const [name, email, matric, prog, level, sup, stage] of students) {
    const sid = user({ name, email, role: 'student', faculty_id: F, department_id: CSC, program_id: prog, matric_no: matric, level });
    const pid = q.run('INSERT INTO projects(student_id, supervisor_id, level, stage, substatus, session, title) VALUES (?,?,?,?,?,?,?)',
      sid, sup, level, stage, sup ? (stage === 'topic' ? 'Topic under review' : 'In progress') : 'Awaiting supervisor allocation', '2026/2027', titles[stage] || null).id;
    q.run('INSERT INTO progress_events(project_id, stage, label, actor_id) VALUES (?,?,?,?)', pid, 'registered', 'Registration approved', hod);
    if (sup) q.run('INSERT INTO progress_events(project_id, stage, label, actor_id) VALUES (?,?,?,?)', pid, 'registered', 'Supervisor allocated', hod);
    if (stage === 'topic') {
      q.run('INSERT INTO topics(project_id, title, description) VALUES (?,?,?)', pid, 'Development of a Web-Based Hostel Allocation System for PLASU', 'Automating hostel allocation to remove queues and favouritism.');
      q.run('INSERT INTO topics(project_id, title, description) VALUES (?,?,?)', pid, 'Mobile Attendance System Using QR Codes', 'Students scan a lecturer-generated QR code to mark attendance.');
      q.run('INSERT INTO progress_events(project_id, stage, label, actor_id) VALUES (?,?,?,?)', pid, 'topic', 'Topics submitted', sid);
    }
    if (titles[stage]) {
      q.run(`INSERT INTO topics(project_id, title, status, refined_title, feedback, reviewed_by, reviewed_at) VALUES (?,?,?,?,?,?,datetime('now','-40 days'))`,
        pid, titles[stage], 'approved', titles[stage], 'Good topic. Narrow the scope to one LGA.', sup);
      q.run(`INSERT INTO progress_events(project_id, stage, label, actor_id, created_at) VALUES (?,?,?,?,datetime('now','-40 days'))`, pid, 'topic', 'Topic approved', sup);
    }
    if (stage === 'chapter2') {
      q.run(`INSERT INTO submissions(project_id, stage, title, content_html, status, feedback, reviewed_by, reviewed_at, plagiarism_score, ai_score, created_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','-10 days'),?,?,datetime('now','-14 days'))`, pid, 'chapter1', 'Chapter One', SAMPLE_CH1, 'approved', 'Well written. Proceed to Chapter Two.', sup, 3.2, 18);
      q.run(`INSERT INTO progress_events(project_id, stage, label, actor_id, created_at) VALUES (?,?,?,?,datetime('now','-10 days'))`, pid, 'chapter1', 'Chapter One approved', sup);
      q.run('INSERT INTO documents(user_id, title, content_html) VALUES (?,?,?)', sid, 'Chapter Two – Literature Review (draft)', '<h1>CHAPTER TWO</h1><h1>LITERATURE REVIEW</h1><h2>2.1 Introduction</h2><p>This chapter reviews literature on ICT-enabled agricultural extension.</p>');
      q.run('INSERT INTO messages(sender_id, receiver_id, body, created_at) VALUES (?,?,?,datetime(\'now\',\'-2 days\'))', sid, sup, 'Good afternoon sir, I have started Chapter Two. Should I include studies outside Nigeria?');
      q.run('INSERT INTO messages(sender_id, receiver_id, body, created_at) VALUES (?,?,?,datetime(\'now\',\'-1 days\'))', sup, sid, 'Yes, but prioritise West African studies from the last 10 years.');
    }
    if (stage === 'chapter4') {
      q.run(`INSERT INTO submissions(project_id, stage, title, content_html, status, feedback, reviewed_by, reviewed_at, created_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','-3 days'),datetime('now','-5 days'))`, pid, 'chapter4', 'Chapter Four', '<h1>CHAPTER FOUR</h1><p>Results of the random forest model…</p>', 'corrections', 'Add a confusion matrix and discuss the class imbalance.', sup);
      q.run('UPDATE projects SET substatus = ? WHERE id = ?', 'Make corrections', pid);
    }
  }

  // Resources: generated templates, guidelines and referencing links
  for (const [key, d] of Object.entries(DEFAULT_DOCS)) {
    const buf = await buildDocx({ html: d.html, includePrelims: !!d.prelims, includeToc: !!d.prelims, level: d.level === 'PG' ? 'PG' : 'UG', title: d.title,
      meta: { title: 'Title of the Project', student: 'Student Name', matric: 'Matric Number' } });
    const file = `default_${key}.docx`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
    q.run('INSERT INTO resources(kind, title, description, file_path, file_name, level, uploaded_by) VALUES (?,?,?,?,?,?,?)',
      d.kind, d.title, d.description, file, `${d.title.replace(/[^\w]+/g, '_')}.docx`, d.level, superId);
  }
  const links = [
    ['APA Style – Reference Examples (official)', 'https://apastyle.apa.org/style-grammar-guidelines/references/examples', 'Official APA 7th edition reference examples for over 100 source types.'],
    ['Purdue OWL – APA Formatting and Style Guide', 'https://owl.purdue.edu/owl/research_and_citation/apa_style/apa_formatting_and_style_guide/general_format.html', 'Step-by-step tutorials on APA in-text citations and reference lists.'],
    ['Purdue OWL – MLA Formatting and Style Guide', 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_formatting_and_style_guide.html', 'MLA 9th edition guidance for humanities projects.'],
    ['IEEE Reference Guide (PDF)', 'https://journals.ieeeauthorcenter.ieee.org/wp-content/uploads/sites/7/IEEE_Reference_Guide.pdf', 'Official IEEE citation guide for engineering and computing projects.'],
    ['Chicago Manual of Style – Citation Quick Guide', 'https://www.chicagomanualofstyle.org/tools_citationguide.html', 'Notes-bibliography and author-date examples.'],
  ];
  for (const [title, url, description] of links) q.run('INSERT INTO resources(kind, title, url, description, uploaded_by) VALUES (?,?,?,?,?)', 'referencing', title, url, description, superId);

  q.run('INSERT INTO announcements(title, body, audience, created_by) VALUES (?,?,?,?)', 'Welcome to the PLASU Project Management System',
    'All final-year and postgraduate students should submit project topics through the platform. Download the templates and guidelines from the Resources page.', 'all', superId);
  q.run('INSERT INTO posts(user_id, category, title, body) VALUES (?,?,?,?)', lec1, 'Collaboration', 'Looking for students interested in Hausa NLP',
    'I am building a small labelled dataset of Hausa social media posts. Final-year and M.Sc. students interested in co-authoring a paper should reply here.');
  const ms = q.run('INSERT INTO manuscripts(owner_id, title, abstract, keywords, target_journal, status) VALUES (?,?,?,?,?,?)', lec1,
    'Mobile Advisory Services and Potato Yields in Bokkos: Evidence from a Pilot', 'This study evaluates…', 'ICT4D; agriculture; SMS', 'Nigerian Journal of Technology', 'internal_review').id;
  q.run('INSERT INTO manuscript_members(manuscript_id, user_id, role) VALUES (?,?,?)', ms, lec1, 'lead author');
  q.run('INSERT INTO activity_log(user_id, action, entity) VALUES (?,?,?)', superId, 'System initialised with sample data', 'system');
  console.log('Seed complete. Super admin: superadmin@plasu.edu.ng / Admin@123 — other demo users: Password@123');
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  if (process.argv.includes('--reset')) {
    db.close();
    for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
    console.log('Database reset. Restart the server to reseed (it seeds automatically on an empty database).');
  } else {
    await seed({ force: false });
  }
}
