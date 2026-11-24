import HTMLtoDOCX from 'html-to-docx';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../db.js';

const LOGO = path.join(ROOT, '..', 'logo.png');
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PB = '<div class="page-break" style="page-break-after: always;"></div>';
const PB_RE = /<(p|div)[^>]*page-break[^>]*>\s*(?:<br\s*\/?>)?\s*<\/(?:p|div)>/gi;

export const FORMAT_PRESETS = {
  plasu_ug: { label: 'PLASU Undergraduate (TNR 12, double spacing)', font: 'Times New Roman', size: 12, lineHeight: 2.0, margins: { top: 1, bottom: 1, left: 1.5, right: 1 } },
  plasu_pg: { label: 'PLASU Postgraduate (TNR 12, double spacing, 1.5" binding)', font: 'Times New Roman', size: 12, lineHeight: 2.0, margins: { top: 1, bottom: 1, left: 1.5, right: 1 } },
  journal: { label: 'Journal manuscript (TNR 12, 1.5 spacing)', font: 'Times New Roman', size: 12, lineHeight: 1.5, margins: { top: 1, bottom: 1, left: 1, right: 1 } },
  draft: { label: 'Draft (Calibri 11, single spacing)', font: 'Calibri', size: 11, lineHeight: 1.15, margins: { top: 1, bottom: 1, left: 1, right: 1 } },
};

const logoImg = () => {
  try {
    const buf = fs.readFileSync(LOGO);
    const mime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png'; // logo.png is actually JPEG-encoded
    return `<img src="data:${mime};base64,${buf.toString('base64')}" width="110" height="120" />`;
  } catch { return ''; }
};

/** Normalises editor HTML: headings centred and upper-cased, paragraphs justified with the preset's spacing. */
export function normalizeBody(html, preset) {
  const lh = preset.lineHeight;
  const breaks = [];
  const protectedHtml = String(html || '').replace(PB_RE, () => { breaks.push(PB); return `@@PB${breaks.length - 1}@@`; });
  return protectedHtml
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `<h1 style="text-align:center; font-size:${preset.size + 2}pt; font-weight:bold; text-transform:uppercase;">${t.replace(/<[^>]+>/g, '').toUpperCase()}</h1>`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `<h2 style="font-size:${preset.size}pt; font-weight:bold;">${t.replace(/<[^>]+>/g, '').toUpperCase()}</h2>`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `<h3 style="font-size:${preset.size}pt; font-weight:bold;">${t.replace(/<[^>]+>/g, '')}</h3>`)
    .replace(/<p(\s[^>]*)?>/gi, (m, attrs = '') => {
      const centred = /text-align:\s*center/i.test(attrs);
      return `<p style="text-align:${centred ? 'center' : 'justify'}; line-height:${lh}; margin-bottom:6pt;">`;
    })
    .replace(/<div(\s[^>]*)?>/gi, `<p style="text-align:justify; line-height:${lh};">`).replace(/<\/div>/gi, '</p>')
    .replace(/@@PB(\d+)@@/g, (_, i) => breaks[+i]);
}

const toc = (html) => {
  const heads = [...String(html).matchAll(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ lvl: +m[1], t: m[2].replace(/<[^>]+>/g, '').trim() }));
  if (!heads.length) return '';
  return `<h1 style="text-align:center;">TABLE OF CONTENTS</h1>` +
    heads.map((h) => `<p style="margin-left:${h.lvl === 2 ? 0.4 : 0}in;">${esc(h.lvl === 1 ? h.t.toUpperCase() : h.t)}</p>`).join('') + PB;
};

export function preliminaries(meta = {}, level = 'UG') {
  const degree = meta.degree || (level === 'PG' ? 'Master of Science (M.Sc.)' : 'Bachelor of Science (B.Sc.)');
  const kind = level === 'PG' ? 'DISSERTATION/THESIS' : 'PROJECT';
  const dept = meta.department || 'Department of ______________';
  const fac = meta.faculty || 'Faculty of ______________';
  const title = (meta.title || 'PROJECT TITLE').toUpperCase();
  const name = (meta.student || 'STUDENT NAME').toUpperCase();
  const c = 'style="text-align:center;"';
  return `
  <p ${c}>${logoImg()}</p>
  <p ${c}><b>${esc(title)}</b></p><p ${c}>BY</p><p ${c}><b>${esc(name)}</b></p><p ${c}>${esc(meta.matric || '')}</p>
  <p ${c}>A ${kind} SUBMITTED TO THE ${esc(dept.toUpperCase())}, ${esc(fac.toUpperCase())}, PLATEAU STATE UNIVERSITY, BOKKOS, IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF THE DEGREE OF ${esc(degree.toUpperCase())}</p>
  <p ${c}>${esc(meta.date || new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase())}</p>${PB}
  <h1 ${c}>DECLARATION</h1>
  <p style="text-align:justify; line-height:2;">I hereby declare that this ${kind.toLowerCase()} titled "${esc(meta.title || '')}" is my original work carried out under the supervision of ${esc(meta.supervisor || '______________')}. All sources of information have been duly acknowledged by means of references.</p>
  <p>&nbsp;</p><p>____________________________ &nbsp;&nbsp;&nbsp;&nbsp; ______________</p><p>${esc(meta.student || 'Student')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</p>${PB}
  <h1 ${c}>CERTIFICATION</h1>
  <p style="text-align:justify; line-height:2;">This is to certify that this ${kind.toLowerCase()} was carried out by ${esc(meta.student || '______________')} (${esc(meta.matric || '______')}) and meets the regulations governing the award of the degree of ${esc(degree)} of Plateau State University, Bokkos.</p>
  <p>&nbsp;</p><p>____________________________ &nbsp; ______________</p><p>${esc(meta.supervisor || 'Supervisor')} (Supervisor) &nbsp;&nbsp;&nbsp;&nbsp; Date</p>
  <p>&nbsp;</p><p>____________________________ &nbsp; ______________</p><p>${esc(meta.hod || 'Head of Department')} (Head of Department) &nbsp;&nbsp;&nbsp;&nbsp; Date</p>
  <p>&nbsp;</p><p>____________________________ &nbsp; ______________</p><p>External Examiner &nbsp;&nbsp;&nbsp;&nbsp; Date</p>${PB}
  <h1 ${c}>DEDICATION</h1><p style="text-align:center;">${esc(meta.dedication || '[Dedication]')}</p>${PB}
  <h1 ${c}>ACKNOWLEDGEMENTS</h1><p style="text-align:justify; line-height:2;">${esc(meta.acknowledgements || '[Acknowledgements]')}</p>${PB}
  <h1 ${c}>ABSTRACT</h1><p style="text-align:justify; line-height:1.5;">${esc(meta.abstract || '[Abstract: 250–300 words summarising the problem, objectives, methodology, key findings and recommendations.]')}</p>${PB}`;
}

const twip = (inch) => Math.round(inch * 1440);

export async function buildDocx({ html, presetKey = 'plasu_ug', meta = {}, level = 'UG', includePrelims = false, includeToc = true, title = 'Document' }) {
  const preset = FORMAT_PRESETS[presetKey] || FORMAT_PRESETS.plasu_ug;
  const body = normalizeBody(html, preset);
  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>
    ${includePrelims ? preliminaries(meta, level) : ''}${includeToc ? toc(html) : ''}${body}</body></html>`;
  const m = preset.margins;
  return HTMLtoDOCX(full, null, {
    title, creator: meta.student || 'PLASU PMS', font: preset.font, fontSize: preset.size * 2, complexScriptFontSize: preset.size * 2,
    margins: { top: twip(m.top), bottom: twip(m.bottom), left: twip(m.left), right: twip(m.right), header: 720, footer: 720, gutter: 0 },
    footer: true, pageNumber: true, table: { row: { cantSplit: true } },
  }, '<p style="text-align:center;"></p>');
}

/** Default templates & guidelines generated on first run (admins can upload replacements). */
export const DEFAULT_DOCS = {
  ug_template: {
    title: 'PLASU Undergraduate Project Template', kind: 'template', level: 'UG',
    description: 'Pre-formatted undergraduate project template with preliminary pages and the five-chapter structure.',
    html: `<h1>CHAPTER ONE</h1><h1>INTRODUCTION</h1><h2>1.1 Background of the Study</h2><p>[Write the background here.]</p>
      <h2>1.2 Statement of the Problem</h2><p>[...]</p><h2>1.3 Aim and Objectives of the Study</h2><p>[...]</p><h2>1.4 Research Questions</h2><p>[...]</p>
      <h2>1.5 Significance of the Study</h2><p>[...]</p><h2>1.6 Scope and Limitations of the Study</h2><p>[...]</p><h2>1.7 Definition of Terms</h2><p>[...]</p>${PB}
      <h1>CHAPTER TWO</h1><h1>LITERATURE REVIEW</h1><h2>2.1 Introduction</h2><p>[...]</p><h2>2.2 Conceptual Framework</h2><p>[...]</p><h2>2.3 Theoretical Framework</h2><p>[...]</p><h2>2.4 Review of Related Empirical Studies</h2><p>[...]</p><h2>2.5 Summary of Literature Reviewed / Research Gap</h2><p>[...]</p>${PB}
      <h1>CHAPTER THREE</h1><h1>RESEARCH METHODOLOGY</h1><h2>3.1 Introduction</h2><p>[...]</p><h2>3.2 Research Design</h2><p>[...]</p><h2>3.3 Population, Sample and Sampling Technique</h2><p>[...]</p><h2>3.4 Instruments for Data Collection</h2><p>[...]</p><h2>3.5 Validity and Reliability</h2><p>[...]</p><h2>3.6 Method of Data Analysis</h2><p>[...]</p>${PB}
      <h1>CHAPTER FOUR</h1><h1>RESULTS AND DISCUSSION</h1><h2>4.1 Introduction</h2><p>[...]</p><h2>4.2 Data Presentation and Analysis</h2><p>[...]</p><h2>4.3 Discussion of Findings</h2><p>[...]</p>${PB}
      <h1>CHAPTER FIVE</h1><h1>SUMMARY, CONCLUSION AND RECOMMENDATIONS</h1><h2>5.1 Summary</h2><p>[...]</p><h2>5.2 Conclusion</h2><p>[...]</p><h2>5.3 Recommendations</h2><p>[...]</p><h2>5.4 Contribution to Knowledge</h2><p>[...]</p>${PB}
      <h1>REFERENCES</h1><p>[Arrange references alphabetically in APA 7th edition style.]</p>${PB}<h1>APPENDICES</h1><p>[Questionnaire, code listings, data tables, etc.]</p>`,
    prelims: true,
  },
  pg_template: {
    title: 'PLASU Postgraduate Dissertation/Thesis Template', kind: 'template', level: 'PG',
    description: 'Template for M.Sc./PhD dissertations including proposal-aligned chapters and preliminary pages.',
    html: `<h1>CHAPTER ONE</h1><h1>INTRODUCTION</h1><h2>1.1 Background to the Study</h2><p>[...]</p><h2>1.2 Statement of the Research Problem</h2><p>[...]</p><h2>1.3 Research Questions</h2><p>[...]</p><h2>1.4 Aim and Objectives</h2><p>[...]</p><h2>1.5 Research Hypotheses</h2><p>[...]</p><h2>1.6 Justification of the Study</h2><p>[...]</p><h2>1.7 Scope of the Study</h2><p>[...]</p>${PB}
      <h1>CHAPTER TWO</h1><h1>LITERATURE REVIEW</h1><h2>2.1 Conceptual Review</h2><p>[...]</p><h2>2.2 Theoretical Framework</h2><p>[...]</p><h2>2.3 Empirical Review</h2><p>[...]</p><h2>2.4 Gaps in Literature</h2><p>[...]</p>${PB}
      <h1>CHAPTER THREE</h1><h1>MATERIALS AND METHODS</h1><h2>3.1 Study Area / Research Setting</h2><p>[...]</p><h2>3.2 Research Design</h2><p>[...]</p><h2>3.3 Data Collection</h2><p>[...]</p><h2>3.4 Model Specification / Analytical Techniques</h2><p>[...]</p><h2>3.5 Ethical Considerations</h2><p>[...]</p>${PB}
      <h1>CHAPTER FOUR</h1><h1>RESULTS AND DISCUSSION</h1><p>[...]</p>${PB}<h1>CHAPTER FIVE</h1><h1>SUMMARY, CONCLUSION AND RECOMMENDATIONS</h1><h2>5.1 Summary of Findings</h2><p>[...]</p><h2>5.2 Conclusion</h2><p>[...]</p><h2>5.3 Recommendations</h2><p>[...]</p><h2>5.4 Contribution to Knowledge</h2><p>[...]</p><h2>5.5 Suggestions for Further Studies</h2><p>[...]</p>${PB}<h1>REFERENCES</h1><p>[...]</p>`,
    prelims: true, levelPG: true,
  },
  proposal_template: {
    title: 'Research Proposal Template (Postgraduate)', kind: 'template', level: 'PG',
    description: 'Structure for postgraduate research proposals presented at departmental seminar.',
    html: `<h1>RESEARCH PROPOSAL</h1><h2>1. Title</h2><p>[...]</p><h2>2. Background</h2><p>[...]</p><h2>3. Problem Statement</h2><p>[...]</p><h2>4. Aim and Objectives</h2><p>[...]</p><h2>5. Research Questions / Hypotheses</h2><p>[...]</p><h2>6. Brief Literature Review</h2><p>[...]</p><h2>7. Methodology</h2><p>[...]</p><h2>8. Expected Contribution to Knowledge</h2><p>[...]</p><h2>9. Work Plan / Timeline</h2><p>[...]</p><h2>10. Budget (if applicable)</h2><p>[...]</p><h2>References</h2><p>[...]</p>`,
  },
  guidelines: {
    title: 'PLASU Project Writing Guidelines', kind: 'guideline', level: 'ALL',
    description: 'Formatting rules: Times New Roman 12pt, double line spacing, 1.5-inch left margin, APA 7th edition referencing, chapter structure, binding and submission procedure.',
    html: `<h1>PROJECT WRITING GUIDELINES</h1>
      <h2>1. General Format</h2><ul><li>Paper: A4, printed on one side.</li><li>Font: Times New Roman, 12 point for body text; 14 point bold for chapter titles.</li><li>Line spacing: double (2.0) for body text; single for block quotes, tables, figure captions and references.</li><li>Margins: Left 1.5 inches (binding); Top, Right and Bottom 1 inch.</li><li>Alignment: justified body text; chapter headings centred and in capital letters.</li><li>Pagination: preliminary pages in lower-case Roman numerals (i, ii, iii); main text in Arabic numerals starting from Chapter One, centred at the bottom.</li></ul>
      <h2>2. Order of Preliminary Pages</h2><ol><li>Cover page</li><li>Title page</li><li>Declaration</li><li>Certification / Approval page</li><li>Dedication</li><li>Acknowledgements</li><li>Table of Contents</li><li>List of Tables / List of Figures</li><li>Abstract (250–300 words for UG; up to 500 for PG)</li></ol>
      <h2>3. Headings and Numbering</h2><p>Chapters are numbered in words (CHAPTER ONE). Sections use decimal numbering (1.1, 1.1.1). Tables are captioned above (Table 4.1); figures are captioned below (Figure 4.1).</p>
      <h2>4. Referencing</h2><p>Use APA 7th edition unless your department specifies otherwise. Every in-text citation must appear in the reference list and vice versa. Use the Reference Manager in the platform to generate correctly formatted citations.</p>
      <h2>5. Academic Integrity</h2><p>Run the Plagiarism Checker and AI-Writing Checker before each submission. Similarity above 25% will normally be returned for correction. Generative AI tools may only be used as permitted by your supervisor and must be acknowledged.</p>
      <h2>6. Supervision Process</h2><ol><li>Submit at least two candidate topics on the platform.</li><li>Your supervisor approves or refines one topic.</li><li>Submit each chapter for review; respond to corrections until approved.</li><li>Submit the complete draft; your HOD schedules the defense.</li><li>Effect corrections from the panel and submit the final bound copies.</li></ol>
      <h2>7. Submission</h2><p>Submit three spiral-bound copies for the defense and hard-bound copies (UG: black; PG: as specified by the School of Postgraduate Studies) after corrections, with a soft copy uploaded to the platform.</p>`,
  },
  referencing: {
    title: 'PLASU Referencing Guide (APA 7th, Harvard, IEEE)', kind: 'referencing', level: 'ALL',
    description: 'Quick guide to in-text citation and reference list formatting with worked examples for common source types.',
    html: `<h1>REFERENCING GUIDE</h1><h2>Why reference?</h2><p>Referencing acknowledges the work of others, allows readers to locate your sources, and protects you from plagiarism.</p>
      <h2>APA 7th Edition</h2><p><b>In-text:</b> (Okoro, 2021) or Okoro (2021) states…; two authors: (Musa &amp; Bala, 2020); three or more: (Danladi et al., 2019).</p>
      <p><b>Journal article:</b> Okoro, C. A. (2021). Title of the article in sentence case. <i>Journal Name in Title Case, 12</i>(3), 45–60. https://doi.org/xx.xxxx</p>
      <p><b>Book:</b> Musa, A., &amp; Bala, K. (2020). <i>Title of the book in italics</i> (2nd ed.). Publisher.</p>
      <p><b>Website:</b> Author/Organisation. (Year, Month Day). <i>Title of page</i>. Site Name. URL</p>
      <h2>Harvard</h2><p><b>In-text:</b> (Okoro 2021, p. 12). <b>Reference:</b> Okoro, C.A. (2021) 'Title of article', <i>Journal Name</i>, 12(3), pp. 45–60.</p>
      <h2>IEEE</h2><p><b>In-text:</b> numbered in order of appearance [1]. <b>Reference:</b> [1] C. A. Okoro, "Title of article," <i>Journal Abbrev.</i>, vol. 12, no. 3, pp. 45–60, 2021.</p>
      <h2>Common mistakes</h2><ul><li>Citing sources in-text that are missing from the reference list.</li><li>Inconsistent styles within one document.</li><li>Listing references in order of appearance when using APA (they must be alphabetical).</li><li>Copying references from search engines without checking them.</li></ul>`,
  },
};
