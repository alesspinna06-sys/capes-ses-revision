import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';
import { Segmented, Empty, relDate } from '../components/common.jsx';
import { Timer, SubjectPicker, pickTheme, GradeReport, wordCount, fmtTime } from '../components/capes.jsx';
import { useToast } from '../components/Toast.jsx';
import { useDb, getWorks, getWork, putWork, deleteWork, getCourses, uid } from '../lib/db.js';
import { generateDissertationSubject, analyseSubject, correctDissertation, generateAppliqueeSubject, correctAppliquee, correctPlan } from '../lib/ai-capes.js';
import { useSettings } from '../lib/settings.jsx';
import { markActivity } from '../lib/srs.js';

const TYPES = { dissertation: 'Dissertation', appliquee: 'Épreuve appliquée', plan: 'Plan express' };

export default function EcritsView({ go, route, hasKey }) {
  const [tab, setTab] = useState(route.tab || 'dissertation');
  if (route.workId) return <WorkOpen key={route.workId} id={route.workId} go={go} hasKey={hasKey} />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Écrits</h1>
          <div className="page-sub">Entraîne-toi en conditions réelles : sujet, chrono, copie, puis correction notée.</div>
        </div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'dissertation', label: 'Dissertation', icon: 'pen' },
        { value: 'appliquee', label: 'Épreuve appliquée', icon: 'layers' },
        { value: 'plans', label: 'Plans express', icon: 'clock' },
        { value: 'copies', label: 'Mes copies', icon: 'file' },
      ]} />
      <div key={tab} className="view-enter" style={{ marginTop: 20 }}>
        {tab === 'copies' ? <WorksList go={go} types={['dissertation', 'appliquee', 'plan']} view="ecrits" />
          : tab === 'plans' ? <NewPlan go={go} hasKey={hasKey} />
          : <NewWork type={tab} go={go} hasKey={hasKey} />}
      </div>
    </>
  );
}

/** Ouvre une copie : plan express ou copie complète. */
function WorkOpen({ id, go, hasKey }) {
  const [type, setType] = useState(null);
  useEffect(() => { getWork(id).then((w) => setType(w?.type || 'missing')); }, [id]);
  if (!type) return null;
  return type === 'plan' ? <PlanEditor id={id} go={go} hasKey={hasKey} /> : <WorkEditor id={id} go={go} hasKey={hasKey} />;
}

// ---------------------------------------------------------------------------
// Plans express : problématique + plan en temps limité, corrigés par l'IA
// ---------------------------------------------------------------------------
function NewPlan({ go, hasKey }) {
  const toast = useToast();
  const [pick, setPick] = useState({ champ: 'eco', themeIdx: -1 });
  const [minutes, setMinutes] = useState(15);
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (subject) => {
    const w = { id: uid(), type: 'plan', subject, problematique: '', plan: '', minutes, elapsed: 0, status: 'draft', createdAt: Date.now() };
    await putWork(w);
    go('ecrits', { workId: w.id });
  };
  const draw = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy(true);
    try {
      const subject = await generateDissertationSubject({ champ: pick.champ, theme: pickTheme(pick), courses: [] });
      await create({ sujet: subject.sujet, champ: subject.champ || pick.champ, questions: [] });
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h3 style={{ fontSize: 19, margin: '0 0 4px' }}>Plan express</h3>
        <p className="muted small" style={{ marginTop: 0 }}>Un sujet, quelques minutes, seulement la problématique et le plan détaillé. C'est l'exercice le plus rentable pour la dissertation.</p>
        <SubjectPicker value={pick} onChange={setPick} allowRc={true} />
        <div className="field" style={{ marginTop: 14 }}>
          <label>Temps</label>
          <Segmented value={minutes} onChange={setMinutes} options={[10, 15, 20].map((m) => ({ value: m, label: `${m} min` }))} />
        </div>
        <button className="btn accent lg" style={{ marginTop: 18, width: '100%' }} disabled={busy} onClick={draw}>
          {busy ? <><span className="spinner" /> Tirage du sujet…</> : <><Icon name="clock" /> Tirer un sujet et lancer le chrono</>}
        </button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 19, margin: '0 0 4px' }}>Mon propre sujet</h3>
        <p className="muted small" style={{ marginTop: 0 }}>Un sujet d'annales ou de manuel.</p>
        <textarea className="textarea" style={{ minHeight: 110, fontFamily: 'inherit', fontSize: 15 }} placeholder="Ex. : Les inégalités sont-elles un frein à la croissance ?" value={own} onChange={(e) => setOwn(e.target.value)} />
        <button className="btn primary" style={{ marginTop: 12, width: '100%' }} disabled={!own.trim()} onClick={() => create({ sujet: own.trim(), champ: '', questions: [] })}>
          Lancer le chrono sur ce sujet
        </button>
      </div>
    </div>
  );
}

function PlanEditor({ id, go, hasKey }) {
  const toast = useToast();
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState(false);
  const elapsed = useRef(0);
  const saveT = useRef(null);
  const wRef = useRef(null);
  wRef.current = w;
  useEffect(() => { getWork(id).then((x) => { setW(x); elapsed.current = x?.elapsed || 0; }); }, [id]);
  useEffect(() => () => { clearTimeout(saveT.current); if (wRef.current && !wRef.current.result) putWork({ ...wRef.current, elapsed: Math.round(elapsed.current) }); }, []);
  if (!w) return null;
  const save = (patch) => {
    const next = { ...w, ...patch };
    setW(next);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => putWork({ ...next, elapsed: Math.round(elapsed.current) }), 700);
  };
  const submit = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    clearTimeout(saveT.current);
    setBusy(true);
    try {
      const result = await correctPlan({ sujet: w.subject.sujet, problematique: w.problematique, plan: w.plan, minutes: Math.round(elapsed.current / 60) });
      const next = { ...w, result, status: 'graded', elapsed: Math.round(elapsed.current) };
      setW(next);
      await putWork(next);
      markActivity();
      setTimeout(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };
  const done = !!w.result;
  return (
    <>
      <button className="back-link" onClick={() => go('ecrits', { tab: 'plans' })}><Icon name="left" size={16} /> Plans express</button>
      <div className="card subject-card">
        <div className="row between wrap">
          <span className="chip accent">Plan express · {w.minutes} min</span>
          {!done && <Timer minutes={w.minutes} initialElapsed={w.elapsed || 0} onElapsed={(e) => { elapsed.current = e; }} autoStart label="Temps" />}
        </div>
        <h2 className="subject-title selectable" style={{ marginTop: 14 }}>{w.subject.sujet}</h2>
      </div>
      <div className="card stack" style={{ marginTop: 16, gap: 14 }}>
        <div className="field">
          <label htmlFor="plan-pb">Problématique</label>
          <textarea id="plan-pb" className="textarea" style={{ minHeight: 80, fontFamily: 'inherit', fontSize: 15 }} disabled={done} value={w.problematique}
            onChange={(e) => save({ problematique: e.target.value })} placeholder="Ex. : Dans quelle mesure… ?" />
        </div>
        <div className="field">
          <label htmlFor="plan-plan">Plan détaillé</label>
          <textarea id="plan-plan" className="textarea copy-area" style={{ minHeight: 260 }} disabled={done} value={w.plan}
            onChange={(e) => save({ plan: e.target.value })}
            placeholder={'I. …\n  A. … (mécanisme, auteur, donnée)\n  B. …\nII. …\n  A. …\n  B. …'} />
        </div>
        {!done && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn accent lg" disabled={busy || !w.plan.trim()} onClick={submit}>
              {busy ? <><span className="spinner" /> Correction…</> : <><Icon name="check" /> Faire corriger</>}
            </button>
          </div>
        )}
      </div>
      {done && (
        <>
          <div className="section-title" id="report">Correction</div>
          <GradeReport r={w.result} />
        </>
      )}
    </>
  );
}

function NewWork({ type, go, hasKey }) {
  const toast = useToast();
  const { settings } = useSettings();
  const [pick, setPick] = useState({ champ: 'eco', themeIdx: -1 });
  const [useCourses, setUseCourses] = useState(true);
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const isDiss = type === 'dissertation';

  const create = async (subject) => {
    const w = { id: uid(), type, subject, copie: '', elapsed: 0, status: 'draft', createdAt: Date.now(),
      minutes: isDiss ? settings.examDissertationMin : settings.examAppliqueeMin };
    await putWork(w);
    go('ecrits', { workId: w.id });
  };

  const generate = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy(true);
    try {
      const courses = useCourses ? (await getCourses()).filter((c) => c.status === 'ready') : [];
      const theme = pickTheme(pick);
      const subject = isDiss
        ? await generateDissertationSubject({ champ: pick.champ, theme, courses })
        : await generateAppliqueeSubject({ theme, courses });
      await create(subject);
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="row" style={{ marginBottom: 6 }}><span className="chip accent"><Icon name="sparkles" size={12} /> Sujet généré par l'IA</span></div>
        <h3 style={{ fontSize: 19, margin: '10px 0 4px' }}>{isDiss ? 'Nouveau sujet de dissertation' : "Nouveau sujet d'épreuve appliquée"}</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          {isDiss
            ? `Dissertation de type CAPES${settings.withQuestions ? ' + 2 questions (épistémologie / objectifs d’apprentissage)' : ''}, ${fmtTime(settings.examDissertationMin * 60)} au chrono.`
            : `Séquence pédagogique pour une classe, avec dossier documentaire, ${fmtTime(settings.examAppliqueeMin * 60)} au chrono.`}
        </p>
        <SubjectPicker value={pick} onChange={setPick} allowRc={true} />
        <label className="row small" style={{ marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={useCourses} onChange={(e) => setUseCourses(e.target.checked)} /> S'appuyer sur mes cours importés
        </label>
        <button className="btn accent lg" style={{ marginTop: 18, width: '100%' }} disabled={busy} onClick={generate}>
          {busy ? <><span className="spinner" /> Préparation du sujet…</> : <><Icon name="sparkles" /> Générer un sujet</>}
        </button>
      </div>
      {isDiss && (
        <div className="card">
          <h3 style={{ fontSize: 19, margin: '0 0 4px' }}>Mon propre sujet</h3>
          <p className="muted small" style={{ marginTop: 0 }}>Un sujet d'annales, de prépa ou de manuel : saisis-le et compose.</p>
          <textarea className="textarea" style={{ minHeight: 110, fontFamily: 'inherit', fontSize: 15 }} placeholder="Ex. : La croissance économique est-elle compatible avec la préservation de l'environnement ?" value={own} onChange={(e) => setOwn(e.target.value)} />
          <button className="btn primary" style={{ marginTop: 12, width: '100%' }} disabled={!own.trim()} onClick={() => create({ sujet: own.trim(), champ: '', questions: [] })}>
            Composer sur ce sujet
          </button>
        </div>
      )}
    </div>
  );
}

export function WorksList({ go, types, view }) {
  const works = useDb(async () => (await getWorks()).filter((w) => types.includes(w.type)), [types.join()]);
  if (!works) return null;
  if (!works.length) return <div className="card"><Empty icon="file" title="Aucune copie pour l'instant" text="Tes copies et leurs corrections apparaîtront ici." /></div>;
  const graded = works.filter((w) => w.result?.note != null);
  const avg = graded.length ? graded.reduce((s, w) => s + Number(w.result.note), 0) / graded.length : null;
  return (
    <>
      {avg != null && <div className="faint small" style={{ marginBottom: 12 }}>Moyenne : <b style={{ color: 'var(--text)' }}>{avg.toFixed(1).replace('.', ',')}/20</b> sur {graded.length} copie{graded.length > 1 ? 's' : ''} corrigée{graded.length > 1 ? 's' : ''}</div>}
      <div className="card" style={{ padding: 8 }}>
        {works.map((w) => (
          <div key={w.id} className="list-row" onClick={() => go(view, { workId: w.id })}>
            <span className="chip">{TYPES[w.type] || (w.type === 'lecon' ? 'Leçon' : 'Entretien')}</span>
            <div className="grow">
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.subject?.sujet || w.subject?.intitule || 'Simulation d’entretien'}</div>
              <div className="faint small">{relDate(w.createdAt)}{w.elapsed ? ` · ${fmtTime(w.elapsed)}` : ''}</div>
            </div>
            {w.result?.note != null
              ? <span className={`chip ${w.result.note >= 12 ? 'success' : w.result.note >= 8 ? 'warning' : 'danger'}`}>{String(w.result.note).replace('.', ',')}/20</span>
              : <span className="chip">Brouillon</span>}
            <button className="btn icon sm ghost" title="Supprimer" onClick={(e) => { e.stopPropagation(); deleteWork(w.id); }}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function WorkEditor({ id, go, hasKey }) {
  const toast = useToast();
  const [w, setW] = useState(null);
  const [analysis, setAnalysis] = useState({ open: false, busy: false });
  const [correcting, setCorrecting] = useState(false);
  const elapsed = useRef(0);
  const saveTimer = useRef(null);

  const wRef = useRef(null);
  wRef.current = w;
  useEffect(() => { getWork(id).then((x) => { setW(x); elapsed.current = x?.elapsed || 0; }); }, [id]);
  // En quittant : on enregistre le temps passé et la copie
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (wRef.current && !wRef.current.result) putWork({ ...wRef.current, elapsed: Math.round(elapsed.current) });
  }, []);
  if (!w) return null;
  const s = w.subject || {};
  const isDiss = w.type === 'dissertation';
  const done = !!w.result;

  const update = (patch) => {
    const next = { ...w, ...patch };
    setW(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => putWork({ ...next, elapsed: Math.round(elapsed.current) }), 800); // sauvegarde auto
  };

  const doAnalysis = async () => {
    if (w.analysis) return setAnalysis((a) => ({ ...a, open: !a.open }));
    setAnalysis({ open: true, busy: true });
    try { const md = await analyseSubject(s.sujet); update({ analysis: md }); }
    catch (e) { toast({ type: 'error', text: e.message }); }
    setAnalysis({ open: true, busy: false });
  };

  const submit = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    if (wordCount(w.copie) < 30) return toast({ type: 'error', text: 'Ta copie est trop courte pour être corrigée.' });
    clearTimeout(saveTimer.current); // évite qu'une sauvegarde de brouillon en attente écrase la correction
    setCorrecting(true);
    try {
      const minutes = Math.round(elapsed.current / 60);
      const result = isDiss
        ? await correctDissertation({ sujet: s.sujet, questions: s.questions || [], copie: w.copie, minutes })
        : await correctAppliquee({ subject: s, copie: w.copie, minutes });
      const next = { ...w, result, status: 'graded', elapsed: Math.round(elapsed.current), gradedAt: Date.now() };
      await putWork(next); setW(next); markActivity();
      setTimeout(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setCorrecting(false);
  };

  return (
    <>
      <button className="back-link" onClick={() => go('ecrits', { tab: 'copies' })}><Icon name="left" size={16} /> Écrits</button>
      <div className="row between wrap" style={{ marginBottom: 14 }}>
        <span className="chip accent">{TYPES[w.type]}{s.champ ? ` · ${s.champ}` : ''}{s.niveau ? ` · ${s.niveau}` : ''}</span>
        {!done && <Timer minutes={w.minutes || 360} initialElapsed={w.elapsed || 0} onElapsed={(e) => { elapsed.current = e; }} label="Temps restant" />}
      </div>

      <div className="card subject-card">
        <div className="faint small" style={{ fontWeight: 600, marginBottom: 6 }}>SUJET</div>
        <h2 className="subject-title selectable">{s.sujet || s.intitule}</h2>
        {s.themeProgramme && <div className="faint small" style={{ marginTop: 8 }}>Programme : {s.themeProgramme}</div>}
        {s.questions?.length > 0 && (
          <ol className="clean-list numbered selectable" style={{ marginTop: 14 }}>
            {s.questions.map((q, i) => <li key={i}><b>Question {i + 1}</b> <span className="faint small">({q.type})</span><br />{q.intitule}</li>)}
          </ol>
        )}
        {!isDiss && (
          <>
            <div style={{ marginTop: 14 }}><Markdown text={s.consigne || ''} /></div>
            {s.objectifs?.length > 0 && <><b>Objectifs d'apprentissage</b><ul className="clean-list selectable">{s.objectifs.map((o, i) => <li key={i}>{o}</li>)}</ul></>}
            {s.documents?.length > 0 && (
              <div className="docs-grid">
                {s.documents.map((d, i) => (
                  <div key={i} className="doc selectable">
                    <div className="doc-n">Document {i + 1}</div>
                    <b>{d.titre}</b>
                    <div className="doc-body">{d.contenu}</div>
                    <div className="dt-source">{d.source}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {isDiss && (
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn sm" onClick={doAnalysis} disabled={analysis.busy}>
              {analysis.busy ? <span className="spinner" /> : <Icon name="sparkles" size={14} />} {analysis.open && w.analysis ? "Masquer l'analyse" : 'Aide : analyse du sujet'}
            </button>
            <span className="faint small">(à éviter en conditions d'examen 😉)</span>
          </div>
        )}
        {analysis.open && w.analysis && <div className="card" style={{ marginTop: 14, background: 'var(--chip)' }}><Markdown text={w.analysis} /></div>}
      </div>

      {done ? (
        <>
          <div className="section-title" id="report">Correction</div>
          <GradeReport r={w.result} />
          <div className="section-title">Ma copie <span className="faint small">{wordCount(w.copie)} mots · {fmtTime(w.elapsed || 0)}</span></div>
          <div className="card"><div className="selectable copy-view">{w.copie}</div></div>
        </>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <b>Ma copie</b>
            <span className="faint small">{wordCount(w.copie)} mots · sauvegarde automatique</span>
          </div>
          <textarea
            className="textarea copy-area" spellCheck
            placeholder={isDiss ? 'Introduction (accroche, définitions, problématique, annonce du plan)…\n\nI. …\nA. …' : 'Séance 1 — objectifs, déroulé, activités, documents…'}
            value={w.copie} onChange={(e) => update({ copie: e.target.value })}
          />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn accent lg" disabled={correcting} onClick={submit}>
              {correcting ? <><span className="spinner" /> Correction en cours…</> : <><Icon name="check" /> Rendre ma copie</>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
