// Text analysis: institutional plagiarism check (shingle overlap) and heuristic AI-writing indicator.
import { q } from '../db.js';
import { stripHtml } from './util.js';

const words = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) || []);
const SHINGLE = 5;

function shingles(text) {
  const w = words(text);
  const set = new Set();
  for (let i = 0; i + SHINGLE <= w.length; i++) set.add(w.slice(i, i + SHINGLE).join(' '));
  return set;
}

export const splitSentences = (text) =>
  text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter((s) => s.length > 0);

/**
 * Compares text against every other document stored in the institutional repository
 * (submissions, drafts, manuscripts, approved topics) belonging to other users.
 */
export function plagiarismCheck(html, userId) {
  const text = stripHtml(html);
  const mine = shingles(text);
  const totalWords = words(text).length;
  if (mine.size === 0) return { score: 0, totalWords, sources: [], sentences: [], note: 'Text too short to check (need at least a few sentences).' };

  const corpus = [
    ...q.all(`SELECT s.id, s.title, s.content_html AS body, u.name AS owner, 'Project submission' AS kind
              FROM submissions s JOIN projects p ON p.id = s.project_id JOIN users u ON u.id = p.student_id
              WHERE p.student_id != ? AND s.content_html IS NOT NULL`, userId),
    ...q.all(`SELECT d.id, d.title, d.content_html AS body, u.name AS owner, 'Draft document' AS kind
              FROM documents d JOIN users u ON u.id = d.user_id WHERE d.user_id != ?`, userId),
    ...q.all(`SELECT m.id, m.title, COALESCE(m.abstract,'') || ' ' || COALESCE(m.content_html,'') AS body, u.name AS owner, 'Manuscript' AS kind
              FROM manuscripts m JOIN users u ON u.id = m.owner_id WHERE m.owner_id != ?`, userId),
    ...q.all(`SELECT r.id, r.title, r.description AS body, 'PLASU Repository' AS owner, 'Repository resource' AS kind
              FROM resources r WHERE r.description IS NOT NULL`),
  ];

  const matched = new Set();
  const sources = [];
  for (const doc of corpus) {
    const theirs = shingles(stripHtml(doc.body || ''));
    if (!theirs.size) continue;
    let hits = 0;
    for (const s of mine) if (theirs.has(s)) { hits++; matched.add(s); }
    if (hits > 0) sources.push({ kind: doc.kind, title: doc.title, owner: doc.owner, percent: +(100 * hits / mine.size).toFixed(1), _set: theirs });
  }
  sources.sort((a, b) => b.percent - a.percent);

  const sentences = splitSentences(text).map((s) => {
    const sh = shingles(s);
    let hit = 0;
    for (const x of sh) if (matched.has(x)) hit++;
    const ratio = sh.size ? hit / sh.size : 0;
    const src = ratio > 0 ? sources.find((src) => [...sh].some((x) => src._set.has(x))) : null;
    return { text: s, flagged: ratio >= 0.3, ratio: +ratio.toFixed(2), source: src ? `${src.title} (${src.owner})` : null };
  });

  return {
    score: +(100 * matched.size / mine.size).toFixed(1),
    totalWords,
    sources: sources.slice(0, 15).map(({ _set, ...s }) => s),
    sentences,
    note: 'Similarity is computed against the PLASU institutional repository (all submissions, drafts and manuscripts on this platform). It does not search the public internet.',
  };
}

const AI_PHRASES = [
  'delve', 'delves', 'delving', 'tapestry', 'it is important to note', 'it is worth noting', 'in today\'s', 'ever-evolving',
  'plays a crucial role', 'plays a pivotal role', 'pivotal', 'seamless', 'seamlessly', 'leverage', 'leveraging', 'furthermore',
  'moreover', 'in conclusion', 'overall,', 'navigating', 'navigate the', 'realm', 'landscape', 'holistic', 'robust',
  'multifaceted', 'underscores', 'underscore', 'a testament to', 'harness', 'paramount', 'intricate', 'nuanced', 'foster',
  'in summary', 'additionally', 'crucial', 'comprehensive', 'notably', 'vital role', 'embark', 'unlock', 'elevate', 'showcasing',
];

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

/**
 * Heuristic AI-writing indicator. Combines burstiness (variation in sentence length), vocabulary
 * diversity, characteristic AI phrasing and the absence of contractions/hedges. Indicative only.
 */
export function aiCheck(html) {
  const text = stripHtml(html);
  const sents = splitSentences(text).filter((s) => words(s).length >= 3);
  const w = words(text);
  if (w.length < 60 || sents.length < 4) return { score: null, words: w.length, note: 'Provide at least 60 words (4+ sentences) for a meaningful AI-writing estimate.', sentences: [], signals: [] };

  const lens = sents.map((s) => words(s).length);
  const cv = sd(lens) / (mean(lens) || 1); // human writing typically 0.45–0.8; AI tends to 0.2–0.4
  const burstiness = clamp((0.6 - cv) / 0.35);
  const sample = w.slice(0, 400);
  const ttr = new Set(sample).size / sample.length;
  const lower = text.toLowerCase();
  const phraseHits = AI_PHRASES.filter((p) => lower.includes(p));
  const phraseDensity = clamp((phraseHits.length / (w.length / 100)) / 2.5);
  const contractions = (text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || []).length;
  const noContr = clamp(1 - contractions / (w.length / 150));
  const uniformity = clamp((ttr - 0.45) / 0.25);

  const score = Math.round(100 * clamp(0.38 * burstiness + 0.32 * phraseDensity + 0.15 * noContr + 0.15 * uniformity));

  const sentences = sents.map((s) => {
    const l = s.toLowerCase();
    const hits = AI_PHRASES.filter((p) => l.includes(p));
    return { text: s, flagged: hits.length >= 2 || (hits.length === 1 && words(s).length > 22), phrases: hits };
  });
  const syl = w.reduce((a, x) => a + syllables(x), 0);
  const flesch = Math.round(206.835 - 1.015 * (w.length / sents.length) - 84.6 * (syl / w.length));

  return {
    score,
    band: score >= 65 ? 'High likelihood of AI-generated text' : score >= 40 ? 'Mixed signals – review flagged passages' : 'Likely human-written',
    words: w.length,
    readability: { flesch, label: flesch >= 60 ? 'Plain English' : flesch >= 30 ? 'Academic / difficult' : 'Very difficult' },
    signals: [
      { name: 'Sentence-length uniformity (low burstiness)', value: +(cv).toFixed(2), weight: Math.round(burstiness * 100) },
      { name: 'Characteristic AI phrasing', value: phraseHits.slice(0, 12).join(', ') || 'none', weight: Math.round(phraseDensity * 100) },
      { name: 'Absence of contractions / informal markers', value: contractions, weight: Math.round(noContr * 100) },
      { name: 'Vocabulary diversity (type–token ratio)', value: +ttr.toFixed(2), weight: Math.round(uniformity * 100) },
    ],
    sentences,
    note: 'This is a statistical indicator, not proof. Use it to revise passages in your own voice; supervisors should not treat it as evidence of misconduct on its own.',
  };
}
