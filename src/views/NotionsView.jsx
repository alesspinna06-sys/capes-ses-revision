import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Segmented, Empty } from '../components/common.jsx';
import { DataTable } from '../components/capes.jsx';
import { useToast } from '../components/Toast.jsx';
import { useDb, getAuthors, putAuthor, deleteAuthor, getCourses, uid } from '../lib/db.js';
import { generateAuthorFiche, generateDataExercise } from '../lib/ai-capes.js';
import { CALCULATORS, fr, parse, randomExercise, checkAnswer } from '../lib/calc.js';
import { PROGRAMME } from '../data/programme.js';
import { markActivity } from '../lib/srs.js';
import { ProgrammeCoverage, KeyFigures } from './NotionsExtra.jsx';

export default function NotionsView({ go, hasKey }) {
  const [tab, setTab] = useState('auteurs');
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Notions, auteurs & calculs</h1>
          <div className="page-sub">Tes fiches auteurs, le glossaire de tes cours et les savoir-faire quantitatifs exigés au concours.</div>
        </div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'auteurs', label: 'Auteurs & notions', icon: 'book' },
        { value: 'calculs', label: 'Calculs SES', icon: 'calc' },
        { value: 'donnees', label: 'Exercices de données', icon: 'chart' },
        { value: 'chiffres', label: 'Chiffres clés', icon: 'target' },
        { value: 'programme', label: 'Couverture du programme', icon: 'clipboard' },
      ]} />
      <div key={tab} className="view-enter" style={{ marginTop: 20 }}>
        {tab === 'auteurs' && <Authors hasKey={hasKey} />}
        {tab === 'calculs' && <Calculs />}
        {tab === 'donnees' && <DataExercises hasKey={hasKey} />}
        {tab === 'chiffres' && <KeyFigures hasKey={hasKey} />}
        {tab === 'programme' && <ProgrammeCoverage go={go} hasKey={hasKey} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function Authors({ hasKey }) {
  const toast = useToast();
  const data = useDb(async () => {
    const [authors, courses] = await Promise.all([getAuthors(), getCourses()]);
    const terms = [];
    courses.forEach((c) => (c.keyTerms || []).forEach((k) => terms.push({ ...k, course: c.title })));
    return { authors, terms };
  }, []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const create = async () => {
    const name = q.trim();
    if (!name) return;
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy(true);
    try {
      const f = await generateAuthorFiche(name);
      const a = { id: uid(), name: f.nom || name, ...f, createdAt: Date.now() };
      await putAuthor(a); setOpen(a.id); setQ('');
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!data) return { authors: [], terms: [] };
    return {
      authors: data.authors.filter((a) => !s || a.name.toLowerCase().includes(s) || (a.courant || '').toLowerCase().includes(s)),
      terms: data.terms.filter((t) => !s || t.term.toLowerCase().includes(s) || t.definition.toLowerCase().includes(s)),
    };
  }, [data, q]);

  if (!data) return null;
  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="search grow">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Rechercher, ou saisir un auteur / une notion (ex. Bourdieu, Schumpeter, capital social)…" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        </div>
        <button className="btn accent" disabled={!q.trim() || busy} onClick={create}>
          {busy ? <><span className="spinner" /> Rédaction…</> : <><Icon name="sparkles" /> Créer la fiche</>}
        </button>
      </div>

      {filtered.authors.length === 0 && filtered.terms.length === 0 && (
        <div className="card"><Empty icon="book" title="Aucune fiche pour l'instant" text="Tape le nom d'un auteur ou d'une notion puis « Créer la fiche ». Les termes clés de tes cours apparaîtront aussi ici." /></div>
      )}

      {filtered.authors.length > 0 && (
        <div className="grid grid-auto">
          {filtered.authors.map((a) => (
            <div key={a.id} className={`card interactive author-card ${open === a.id ? 'open' : ''}`} onClick={() => setOpen(open === a.id ? null : a.id)}>
              <div className="row between">
                <span className="chip accent">{a.type || 'Auteur'}</span>
                <button className="btn icon sm ghost" title="Supprimer" onClick={(e) => { e.stopPropagation(); deleteAuthor(a.id); }}><Icon name="trash" size={14} /></button>
              </div>
              <h3 style={{ fontSize: 18, marginTop: 10 }}>{a.name}</h3>
              <div className="faint small">{[a.dates, a.discipline, a.courant].filter(Boolean).join(' · ')}</div>
              {open !== a.id && <div className="small muted" style={{ marginTop: 8 }}>{(a.theses || [])[0]}</div>}
            </div>
          ))}
        </div>
      )}
      {open && data.authors.find((a) => a.id === open) && <AuthorFiche a={data.authors.find((a) => a.id === open)} />}

      {filtered.terms.length > 0 && (
        <>
          <div className="section-title">Glossaire de mes cours <span className="faint small">{filtered.terms.length} termes</span></div>
          <div className="terms">
            {filtered.terms.slice(0, 120).map((k, i) => <div key={i} className="term selectable"><b>{k.term}</b><span>{k.definition}</span><div className="faint small" style={{ marginTop: 6 }}>{k.course}</div></div>)}
          </div>
        </>
      )}
    </>
  );
}

function AuthorFiche({ a }) {
  const Sec = ({ t, children }) => <div style={{ marginTop: 18 }}><div className="fiche-h">{t}</div>{children}</div>;
  return (
    <div className="card view-enter selectable" style={{ marginTop: 16, padding: '28px 32px' }}>
      <h2 style={{ fontSize: 26 }}>{a.name}</h2>
      <div className="muted">{[a.dates, a.discipline, a.courant].filter(Boolean).join(' · ')}</div>
      {a.theses?.length > 0 && <Sec t="Idées et thèses principales"><ul className="clean-list">{a.theses.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>}
      {a.oeuvres?.length > 0 && <Sec t="Œuvres de référence"><ul className="clean-list">{a.oeuvres.map((o, i) => <li key={i}><i>{o.titre}</i>{o.annee ? ` (${o.annee})` : ''}</li>)}</ul></Sec>}
      {a.concepts?.length > 0 && <Sec t="Concepts"><div className="terms">{a.concepts.map((c, i) => <div key={i} className="term"><b>{c.notion}</b><span>{c.definition}</span></div>)}</div></Sec>}
      {a.usages?.length > 0 && <Sec t="Le mobiliser en dissertation / en classe"><ul className="clean-list">{a.usages.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>}
      {a.critiques?.length > 0 && <Sec t="Limites et débats"><ul className="clean-list">{a.critiques.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>}
      <p className="faint small" style={{ marginTop: 18 }}>Fiche générée par l'IA : vérifie les dates et titres dans tes manuels avant de les citer.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Calculs() {
  const [ex, setEx] = useState(() => randomExercise());
  const [ans, setAns] = useState('');
  const [res, setRes] = useState(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const check = () => {
    const r = checkAnswer(ex, ans);
    if (r === null) return;
    setRes(r); setScore((s) => ({ ok: s.ok + (r ? 1 : 0), total: s.total + 1 })); markActivity();
  };
  const next = () => { setEx(randomExercise()); setAns(''); setRes(null); };

  return (
    <>
      <div className="card train-card">
        <div className="row between">
          <span className="chip accent"><Icon name="zap" size={12} /> Entraînement express</span>
          <span className="faint small">Score : {score.ok}/{score.total}</span>
        </div>
        <div className="q-title selectable" style={{ marginTop: 12 }}>{ex.enonce}</div>
        <div className="row">
          <input className="input" style={{ maxWidth: 220 }} placeholder="Ta réponse" value={ans} disabled={res !== null}
            onChange={(e) => setAns(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (res === null ? check() : next())} autoFocus />
          {ex.unite && <span className="muted">{ex.unite}</span>}
          {res === null
            ? <button className="btn primary" onClick={check} disabled={!ans.trim()}>Vérifier</button>
            : <button className="btn accent" onClick={next}>Suivant <Icon name="right" size={15} /></button>}
        </div>
        {res !== null && (
          <div className={`explain ${res ? 'ok' : 'ko'}`}>
            <div className={`verdict ${res ? 'ok' : 'ko'}`}><Icon name={res ? 'check' : 'x'} /> {res ? 'Exact !' : `Réponse : ${fr(ex.rep)} ${ex.unite}`}</div>
            <div className="small muted">Calcul : {ex.expl} = {fr(ex.rep)} {ex.unite}</div>
          </div>
        )}
      </div>
      <div className="section-title">Calculatrices SES</div>
      <div className="grid grid-2">{CALCULATORS.map((c) => <Calculator key={c.id} c={c} />)}</div>
    </>
  );
}

function Calculator({ c }) {
  const [v, setV] = useState({});
  const vals = Object.fromEntries(c.champs.map((f) => [f.k, f.text ? v[f.k] || '' : parse(v[f.k])]));
  const ready = c.champs.every((f) => (f.text ? (v[f.k] || '').trim() : Number.isFinite(vals[f.k])));
  let out = null;
  try { out = ready ? c.calc(vals) : null; } catch { out = null; }
  return (
    <div className="card calc-card">
      <b>{c.titre}</b>
      <div className="faint small" style={{ margin: '4px 0 12px' }}>{c.formule}</div>
      <div className="calc-fields">
        {c.champs.map((f) => (
          <div key={f.k} className="field">
            <label>{f.l}</label>
            <input className="input" inputMode={f.text ? 'text' : 'decimal'} placeholder={f.ph || ''} value={v[f.k] || ''} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
          </div>
        ))}
      </div>
      {out && (
        <div className="calc-out view-enter">
          {out.resultats.map(([k, val]) => <div key={k} className="row between"><span className="muted small">{k}</span><b>{val}</b></div>)}
          <div className="small selectable" style={{ marginTop: 8 }}>{out.phrase}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function DataExercises({ hasKey }) {
  const toast = useToast();
  const [themeIdx, setThemeIdx] = useState(-1);
  const [ex, setEx] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState({});
  const [answers, setAnswers] = useState({});

  const gen = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy(true);
    try {
      const theme = themeIdx >= 0 ? PROGRAMME[themeIdx] : PROGRAMME[Math.floor(Math.random() * PROGRAMME.length)];
      setEx(await generateDataExercise({ theme })); setShown({}); setAnswers({});
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };

  return (
    <>
      <div className="card row wrap">
        <select className="select grow" value={themeIdx} onChange={(e) => setThemeIdx(+e.target.value)}>
          <option value={-1}>🎲 Thème au hasard</option>
          {PROGRAMME.map((t, i) => <option key={i} value={i}>{t.niveau} — {t.theme}</option>)}
        </select>
        <button className="btn accent" disabled={busy} onClick={gen}>{busy ? <><span className="spinner" /> Création…</> : <><Icon name="sparkles" /> Nouvel exercice</>}</button>
      </div>
      {!ex ? (
        <div className="card" style={{ marginTop: 16 }}><Empty icon="chart" title="Lecture de tableaux et calculs" text="L'IA crée un tableau statistique et des questions progressives : lecture, calcul, comparaison, interprétation." /></div>
      ) : (
        <div className="card view-enter" style={{ marginTop: 16 }}>
          <DataTable t={ex.tableau} />
          <div className="stack" style={{ gap: 16, marginTop: 18 }}>
            {ex.questions.map((q, i) => (
              <div key={i}>
                <b className="selectable">{i + 1}. {q.question}</b>
                <textarea className="textarea" style={{ minHeight: 70, marginTop: 8, fontFamily: 'inherit' }} placeholder="Ta réponse…"
                  value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                {shown[i]
                  ? <div className="explain"><b>Réponse attendue :</b> <span className="selectable">{q.reponse}</span><div className="small muted selectable" style={{ marginTop: 6 }}>{q.explication}</div></div>
                  : <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { setShown({ ...shown, [i]: true }); markActivity(); }}>Voir la correction</button>}
              </div>
            ))}
          </div>
          <p className="faint small" style={{ marginTop: 16 }}>Vérifie les calculs de la correction avec l'onglet « Calculs SES » : l'IA peut se tromper sur un arrondi.</p>
        </div>
      )}
    </>
  );
}
