import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Loading, PageHead, toast, toastErr, useFetch } from '../components/ui.jsx';

const FEATURES = [
  ['registration', 'Self-registration', 'Allow students and staff to request accounts from the sign-in page'],
  ['editor', 'Writing Studio', 'Online word processor with autosave, structure templates and formatting'],
  ['plagiarism', 'Plagiarism checker', 'Similarity check against the institutional repository'],
  ['ai_checker', 'AI-writing checker', 'Heuristic indicator of AI-generated text'],
  ['references', 'Reference manager', 'Personal reference library with citation styles and DOI lookup'],
  ['resources', 'Templates & guidelines', 'Downloadable templates, guidelines and referencing materials'],
  ['chat', 'Messaging', 'Direct chat between students, supervisors and colleagues'],
  ['announcements', 'Announcements', 'Broadcast notices from admins, deans and HODs'],
  ['community', 'Community & networking', 'Discussion forum and researcher directory'],
  ['manuscripts', 'Manuscript support', 'Collaborative publication pipeline for papers'],
  ['defenses', 'Defense scheduling', 'Seminars, defenses and viva voce scheduling'],
];

export default function Settings() {
  const { data, loading } = useFetch('/admin/settings');
  const { refresh } = useAuth();
  const [s, setS] = useState(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (loading || !s) return <Loading />;
  const save = async () => {
    try { setS(await api.put('/admin/settings', s)); await refresh(); toast('Settings saved'); } catch (e) { toastErr(e); }
  };
  const feat = s.features || {};
  return (
    <div>
      <PageHead title="Settings & Features" sub="Configure the platform and switch modules on or off for all users"><button className="btn" onClick={save}>Save changes</button></PageHead>
      <div className="grid2">
        <div className="card">
          <h3>Institution</h3>
          <div className="stack">
            <Field label="Institution name"><input value={s.institution?.name || ''} onChange={(e) => setS({ ...s, institution: { ...s.institution, name: e.target.value } })} /></Field>
            <Field label="Motto"><input value={s.institution?.motto || ''} onChange={(e) => setS({ ...s, institution: { ...s.institution, motto: e.target.value } })} /></Field>
            <Field label="Current academic session" hint="Applied to new projects"><input value={s.session || ''} onChange={(e) => setS({ ...s, session: e.target.value })} placeholder="2026/2027" /></Field>
          </div>
          <h3 className="mt">Integrity thresholds</h3>
          <div className="grid2">
            <Field label="Similarity warning (%)"><input type="number" min={0} max={100} value={s.plagiarism_threshold ?? 25} onChange={(e) => setS({ ...s, plagiarism_threshold: +e.target.value })} /></Field>
            <Field label="AI indicator warning (%)"><input type="number" min={0} max={100} value={s.ai_threshold ?? 60} onChange={(e) => setS({ ...s, ai_threshold: +e.target.value })} /></Field>
          </div>
        </div>
        <div className="card">
          <h3>Modules</h3>
          <div className="toggles">
            {FEATURES.map(([k, label, desc]) => (
              <label key={k} className="toggle-row">
                <span><strong>{label}</strong><small className="muted">{desc}</small></span>
                <input type="checkbox" className="switch" checked={feat[k] !== false} onChange={(e) => setS({ ...s, features: { ...feat, [k]: e.target.checked } })} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
