// Citation formatting for APA 7, MLA 9, Harvard, IEEE and Chicago (author-date).
export const STYLES = [
  { key: 'apa', label: 'APA 7th' }, { key: 'mla', label: 'MLA 9th' }, { key: 'harvard', label: 'Harvard' },
  { key: 'ieee', label: 'IEEE' }, { key: 'chicago', label: 'Chicago (author-date)' },
];
export const REF_TYPES = [
  { key: 'journal', label: 'Journal article' }, { key: 'book', label: 'Book' }, { key: 'chapter', label: 'Book chapter' },
  { key: 'web', label: 'Website / online' }, { key: 'thesis', label: 'Thesis / dissertation' }, { key: 'conference', label: 'Conference paper' }, { key: 'report', label: 'Report' },
];

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const i = (s) => (s ? `<i>${esc(s)}</i>` : '');

export function parseAuthors(str = '') {
  return String(str).split(/;|\n/).map((a) => a.trim()).filter(Boolean).map((a) => {
    if (a.includes(',')) { const [family, given = ''] = a.split(',').map((x) => x.trim()); return { family, given }; }
    const parts = a.split(/\s+/); return { family: parts.pop(), given: parts.join(' ') };
  });
}
const initials = (g, sep = ' ') => g.split(/[\s-]+/).filter(Boolean).map((x) => `${x[0].toUpperCase()}.`).join(sep);
const joinList = (arr, amp = '&', oxford = true) => arr.length <= 1 ? arr.join('') : arr.length === 2 ? `${arr[0]}${oxford && amp === '&' ? ',' : ''} ${amp} ${arr[1]}` : `${arr.slice(0, -1).join(', ')}, ${amp} ${arr.at(-1)}`;
const doiUrl = (r) => (r.doi ? `https://doi.org/${r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : r.url || '');
const end = (s) => (s && !/[.?!]$/.test(s) ? `${s}.` : s);

export function formatRef(r, style = 'apa', n = 1) {
  const A = parseAuthors(r.authors);
  const year = r.year || 'n.d.';
  const vol = r.volume, iss = r.issue, pg = r.pages;
  switch (style) {
    case 'apa': {
      const names = A.length > 20 ? [...A.slice(0, 19), A.at(-1)] : A;
      const au = names.length ? joinList(names.map((a) => `${esc(a.family)}, ${initials(a.given)}`.replace(/, $/, ''))) : '';
      const head = au ? `${au} (${year}).` : '';
      const link = doiUrl(r);
      if (r.type === 'journal' || r.type === 'conference') return `${head} ${esc(end(r.title))} ${i(r.source)}${vol ? `, ${i(vol)}` : ''}${iss ? `(${esc(iss)})` : ''}${pg ? `, ${esc(pg)}` : ''}.${link ? ` ${esc(link)}` : ''}`.trim();
      if (r.type === 'book' || r.type === 'report') return `${head} ${i(r.title)}. ${esc(r.publisher || '')}${r.publisher ? '.' : ''}${link ? ` ${esc(link)}` : ''}`.trim();
      if (r.type === 'chapter') return `${head} ${esc(end(r.title))} In ${i(r.source)}${pg ? ` (pp. ${esc(pg)})` : ''}. ${esc(r.publisher || '')}.`.trim();
      if (r.type === 'thesis') return `${head} ${i(r.title)} [Doctoral dissertation/Master's thesis, ${esc(r.publisher || 'Institution')}].${link ? ` ${esc(link)}` : ''}`.trim();
      return `${head || ''} ${i(r.title)}. ${esc(r.source || r.publisher || '')}${r.source || r.publisher ? '.' : ''} ${esc(r.url || '')}`.trim();
    }
    case 'mla': {
      const au = A.length === 0 ? '' : A.length === 1 ? `${A[0].family}, ${A[0].given}` : A.length === 2 ? `${A[0].family}, ${A[0].given}, and ${A[1].given} ${A[1].family}` : `${A[0].family}, ${A[0].given}, et al`;
      const base = au ? `${esc(end(au))} ` : '';
      if (r.type === 'book' || r.type === 'report' || r.type === 'thesis') return `${base}${i(r.title)}. ${esc(r.publisher || '')}, ${year}.`;
      return `${base}"${esc(end(r.title))}" ${i(r.source)}${vol ? `, vol. ${esc(vol)}` : ''}${iss ? `, no. ${esc(iss)}` : ''}, ${year}${pg ? `, pp. ${esc(pg)}` : ''}.${r.doi ? ` https://doi.org/${esc(r.doi)}.` : r.url ? ` ${esc(r.url)}.` : ''}`;
    }
    case 'harvard': {
      const au = joinList(A.map((a) => `${esc(a.family)}, ${initials(a.given, '')}`.replace(/, $/, '')), 'and', false);
      if (r.type === 'book' || r.type === 'report') return `${au} (${year}) ${i(r.title)}. ${r.place ? `${esc(r.place)}: ` : ''}${esc(r.publisher || '')}.`;
      if (r.type === 'web') return `${au || esc(r.source)} (${year}) ${i(r.title)}. Available at: ${esc(r.url || '')}${r.accessed ? ` (Accessed: ${esc(r.accessed)})` : ''}.`;
      return `${au} (${year}) '${esc(r.title)}', ${i(r.source)}${vol ? `, ${esc(vol)}` : ''}${iss ? `(${esc(iss)})` : ''}${pg ? `, pp. ${esc(pg)}` : ''}.${r.doi ? ` doi:${esc(r.doi)}.` : ''}`;
    }
    case 'ieee': {
      const au = joinList(A.map((a) => `${initials(a.given)} ${esc(a.family)}`.trim()), 'and', false);
      if (r.type === 'book' || r.type === 'report') return `[${n}] ${au}, ${i(r.title)}. ${r.place ? `${esc(r.place)}: ` : ''}${esc(r.publisher || '')}, ${year}.`;
      if (r.type === 'web') return `[${n}] ${au ? `${au}, ` : ''}"${esc(r.title)}," ${esc(r.source || '')}. [Online]. Available: ${esc(r.url || '')}`;
      return `[${n}] ${au}, "${esc(r.title)}," ${i(r.source)}${vol ? `, vol. ${esc(vol)}` : ''}${iss ? `, no. ${esc(iss)}` : ''}${pg ? `, pp. ${esc(pg)}` : ''}, ${year}${r.doi ? `, doi: ${esc(r.doi)}` : ''}.`;
    }
    case 'chicago': {
      const au = A.length === 0 ? '' : A.length === 1 ? `${A[0].family}, ${A[0].given}` : `${A[0].family}, ${A[0].given}, ${A.slice(1, -1).map((a) => `${a.given} ${a.family}`).join(', ')}${A.length > 2 ? ',' : ''} and ${A.at(-1).given} ${A.at(-1).family}`;
      if (r.type === 'book' || r.type === 'report') return `${esc(end(au))} ${year}. ${i(r.title)}. ${r.place ? `${esc(r.place)}: ` : ''}${esc(r.publisher || '')}.`;
      return `${esc(end(au))} ${year}. "${esc(end(r.title))}" ${i(r.source)}${vol ? ` ${esc(vol)}` : ''}${iss ? ` (${esc(iss)})` : ''}${pg ? `: ${esc(pg)}` : ''}.${r.doi ? ` https://doi.org/${esc(r.doi)}.` : ''}`;
    }
    default: return esc(r.title);
  }
}

export function inText(r, style = 'apa', n = 1) {
  const A = parseAuthors(r.authors);
  const year = r.year || 'n.d.';
  const fam = A.length === 0 ? (r.source || r.title || '').split(' ').slice(0, 3).join(' ') : A.length === 1 ? A[0].family : A.length === 2 ? `${A[0].family} ${style === 'apa' ? '&' : 'and'} ${A[1].family}` : `${A[0].family} et al.`;
  if (style === 'ieee') return `[${n}]`;
  if (style === 'mla') return `(${fam}${r.pages ? ` ${r.pages.split(/[-–]/)[0]}` : ''})`;
  if (style === 'apa') return `(${fam}, ${year})`;
  return `(${fam} ${year})`;
}

/** Reference list sorted per style conventions (alphabetical, or citation order for IEEE). */
export function bibliography(refs, style) {
  const list = style === 'ieee' ? refs : [...refs].sort((a, b) => (parseAuthors(a.authors)[0]?.family || a.title || '').localeCompare(parseAuthors(b.authors)[0]?.family || b.title || ''));
  return list.map((r, k) => formatRef(r, style, k + 1));
}
