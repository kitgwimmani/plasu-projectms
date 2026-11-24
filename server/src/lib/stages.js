// Project workflow stages. `doc: true` means the stage is completed by a supervisor-approved submission.
export const STAGES = {
  UG: [
    { key: 'registered', label: 'Registered' },
    { key: 'topic', label: 'Topic Submission & Approval' },
    { key: 'chapter1', label: 'Chapter One – Introduction', doc: true },
    { key: 'chapter2', label: 'Chapter Two – Literature Review', doc: true },
    { key: 'chapter3', label: 'Chapter Three – Methodology', doc: true },
    { key: 'chapter4', label: 'Chapter Four – Results & Discussion', doc: true },
    { key: 'chapter5', label: 'Chapter Five – Summary & Conclusion', doc: true },
    { key: 'final_draft', label: 'Complete Final Draft', doc: true },
    { key: 'defense', label: 'Project Defense' },
    { key: 'completed', label: 'Completed' },
  ],
  PG: [
    { key: 'registered', label: 'Registered' },
    { key: 'topic', label: 'Topic Submission & Approval' },
    { key: 'proposal', label: 'Research Proposal', doc: true },
    { key: 'proposal_defense', label: 'Proposal Defense / Seminar' },
    { key: 'chapter1', label: 'Chapter One – Introduction', doc: true },
    { key: 'chapter2', label: 'Chapter Two – Literature Review', doc: true },
    { key: 'chapter3', label: 'Chapter Three – Methodology', doc: true },
    { key: 'chapter4', label: 'Chapter Four – Results & Discussion', doc: true },
    { key: 'chapter5', label: 'Chapter Five – Summary & Conclusion', doc: true },
    { key: 'postfield', label: 'Post-Field Seminar' },
    { key: 'final_draft', label: 'Complete Thesis Draft', doc: true },
    { key: 'viva', label: 'Oral Examination (Viva Voce)' },
    { key: 'completed', label: 'Completed' },
  ],
};

export const stagesFor = (level) => STAGES[level === 'PG' ? 'PG' : 'UG'];
export const stageIndex = (level, key) => stagesFor(level).findIndex((s) => s.key === key);
export const stageLabel = (level, key) => stagesFor(level).find((s) => s.key === key)?.label || key;
export const nextStage = (level, key) => {
  const list = stagesFor(level);
  const i = list.findIndex((s) => s.key === key);
  return list[Math.min(i + 1, list.length - 1)].key;
};
export const progressPct = (level, key) => {
  const list = stagesFor(level);
  const i = Math.max(0, list.findIndex((s) => s.key === key));
  return Math.round((i / (list.length - 1)) * 100);
};
