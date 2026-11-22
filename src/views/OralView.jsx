import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';
import { Segmented } from '../components/common.jsx';
import { Timer, SubjectPicker, pickTheme, GradeReport, DataTable, Recorder, OralAnalysis, fmtTime } from '../components/capes.jsx';
import { api } from '../lib/bridge.js';
import { toWav16k } from '../lib/audio.js';
import { useToast } from '../components/Toast.jsx';
import { getWork, putWork, getCourses, uid } from '../lib/db.js';
import { generateLeconSubject, generateEntretienSubject, generateJuryQuestions, evaluateOral, analyseOralAudio } from '../lib/ai-capes.js';
import { useSettings } from '../lib/settings.jsx';
import { markActivity } from '../lib/srs.js';
import { WorksList } from './EcritsView.jsx';

export default function OralView({ go, route, hasKey }) {
  const [tab, setTab] = useState(route.tab || 'lecon');
  if (route.workId) return <OralSession key={route.workId} id={route.workId} go={go} hasKey={hasKey} />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Oral</h1>
          <div className="page-sub">Simulations d'oral : préparation chronométrée, exposé, puis questions d'un jury IA et grille d'évaluation.</div>
        </div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'lecon', label: 'Épreuve de leçon', icon: 'users' },
        { value: 'entretien', label: "Épreuve d'entretien", icon: 'scale' },
        { value: 'historique', label: 'Historique', icon: 'file' },
      ]} />
      <div key={tab} className="view-enter" style={{ marginTop: 20 }}>
        {tab === 'historique' ? <WorksList go={go} types={['lecon', 'entretien']} view="oral" /> : <NewOral kind={tab} go={go} hasKey={hasKey} />}
      </div>
    </>
  );
}

function NewOral({ kind, go, hasKey }) {
  const toast = useToast();
  const { settings } = useSettings();
  const [pick, setPick] = useState({ champ: 'socio', themeIdx: -1 });
  const [busy, setBusy] = useState(false);
  const isLecon = kind === 'lecon';

  const start = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy(true);
    try {
      const subject = isLecon
        ? await generateLeconSubject({ champ: pick.champ, theme: pickTheme(pick), courses: (await getCourses()).filter((c) => c.status === 'ready') })
        : await generateEntretienSubject();
      const w = { id: uid(), type: kind, subject, notes: '', qa: [], phase: 'prep', elapsed: 0, createdAt: Date.now() };
      await putWork(w);
      go('oral', { workId: w.id });
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h3 style={{ fontSize: 19, margin: '0 0 4px' }}>{isLecon ? 'Nouvelle leçon' : "Nouvelle simulation d'entretien"}</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          {isLecon
            ? `Préparation ${fmtTime(settings.examLeconPrepMin * 60)}, exposé ${settings.examLeconExposeMin} min, puis questions du jury et exercice sur données quantitatives.`
            : `Présentation de ton parcours puis deux mises en situation professionnelles (${settings.examEntretienMin} min au total).`}
        </p>
        {isLecon && <SubjectPicker value={pick} onChange={setPick} />}
        <button className="btn accent lg" style={{ marginTop: 18, width: '100%' }} disabled={busy} onClick={start}>
          {busy ? <><span className="spinner" /> Tirage du sujet…</> : <><Icon name="play" size={16} /> Tirer un sujet</>}
        </button>
      </div>
      <div className="card">
        <b>Comment ça se passe</b>
        <ol className="clean-list numbered small" style={{ marginTop: 10 }}>
          <li><b>Préparation</b> : chrono lancé, tu prends tes notes et construis ton plan dans l'app.</li>
          <li><b>Exposé</b> : présente à voix haute. Tu peux t'enregistrer pour te réécouter.</li>
          <li><b>Jury</b> : l'IA lit tes notes et te pose ses questions, une par une. Réponds par écrit, comme tu le dirais à l'oral.</li>
          <li><b>Bilan</b> : note sur 20, grille, réponses attendues.</li>
        </ol>
      </div>
    </div>
  );
}

function OralSession({ id, go, hasKey }) {
  const toast = useToast();
  const { settings } = useSettings();
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState('');
  const [qi, setQi] = useState(0);
  const [audio, setAudio] = useState(null); // dernier enregistrement { blob, seconds }
  const elapsed = useRef(0);
  const saveT = useRef(null);
  const wRef = useRef(null);
  wRef.current = w;

  useEffect(() => { getWork(id).then((x) => { setW(x); setQi(Math.max(0, (x?.qa || []).findIndex((q) => !q.a))); }); }, [id]);
  useEffect(() => () => { clearTimeout(saveT.current); if (wRef.current) putWork(wRef.current); }, []);
  if (!w) return null;

  const isLecon = w.type === 'lecon';
  const s = w.subject || {};
  const save = (patch) => {
    const next = { ...w, ...patch };
    setW(next);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => putWork(next), 600);
    return next;
  };

  const toJury = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy('Le jury prend connaissance de ton exposé…');
    try {
      const { questions } = await generateJuryQuestions({ kind: w.type, subject: s, notes: w.notes });
      const next = save({ phase: 'jury', qa: questions.map((q) => ({ q, a: '' })), elapsed: Math.round(elapsed.current) });
      await putWork(next); setQi(0);
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy('');
  };

  const finish = async () => {
    setBusy('Le jury délibère…');
    try {
      const result = await evaluateOral({ kind: w.type, subject: s, notes: w.notes, qa: w.qa });
      const next = save({ phase: 'done', result });
      await putWork(next); markActivity();
      setTimeout(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy('');
  };

  // Analyse de l'enregistrement : conversion en WAV, envoi à Gemini, écoute et bilan de la forme
  const analyseAudio = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    if (!audio) return;
    try {
      setBusy('Préparation de l’enregistrement…');
      const wav = await toWav16k(audio.blob);
      if (wav.seconds < 20) throw new Error('Enregistrement trop court (moins de 20 secondes).');
      setBusy('Envoi de l’enregistrement à Gemini…');
      const up = await api.gemini.upload({ data: wav.data, mimeType: 'audio/wav', displayName: 'expose-capes.wav' });
      if (!up.ok) throw new Error(up.error);
      setBusy('Le jury écoute ton exposé…');
      const oralAnalysis = await analyseOralAudio({
        kind: w.type, subject: s, file: up, durationSec: wav.seconds,
        minutes: isLecon ? settings.examLeconExposeMin : 15,
      });
      const next = save({ oralAnalysis: { ...oralAnalysis, at: Date.now() } });
      await putWork(next);
      setTimeout(() => document.getElementById('oral-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy('');
  };

  const steps = ['prep', 'jury', 'done'];
  const stepLabels = { prep: isLecon ? 'Préparation & exposé' : 'Préparation', jury: 'Questions du jury', done: 'Bilan' };

  return (
    <>
      <button className="back-link" onClick={() => go('oral', { tab: 'historique' })}><Icon name="left" size={16} /> Oral</button>
      <div className="stepper">
        {steps.map((st, i) => (
          <div key={st} className={`step ${w.phase === st ? 'on' : steps.indexOf(w.phase) > i ? 'done' : ''}`}>
            <span>{steps.indexOf(w.phase) > i ? <Icon name="check" size={12} /> : i + 1}</span>{stepLabels[st]}
          </div>
        ))}
      </div>

      <div className="card subject-card">
        <div className="row between wrap">
          <span className="chip accent">{isLecon ? `Leçon · ${s.niveau || ''}` : "Épreuve d'entretien"}</span>
          {w.phase === 'prep' && (
            <Timer minutes={isLecon ? settings.examLeconPrepMin : 15} initialElapsed={w.elapsed || 0} onElapsed={(e) => { elapsed.current = e; }} autoStart label="Préparation" />
          )}
        </div>
        {isLecon ? (
          <>
            <h2 className="subject-title selectable" style={{ marginTop: 14 }}>{s.sujet}</h2>
            {s.consigne && <div style={{ marginTop: 10 }}><Markdown text={s.consigne} /></div>}
            {s.exercice && (
              <div style={{ marginTop: 16 }}>
                <b>Exercice — représentations graphiques et données quantitatives</b>
                <DataTable t={s.exercice.tableau} />
                <ol className="clean-list numbered selectable">{(s.exercice.questions || []).map((q, i) => <li key={i}>{q}</li>)}</ol>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 style={{ margin: '14px 0 6px' }}>1. Présentation</h3>
            <div className="selectable muted">{s.presentationConsigne}</div>
            {(s.situations || []).map((x, i) => (
              <div key={i} className="q-context selectable" style={{ marginTop: 14 }}>
                <b>Mise en situation {i + 1} — {x.titre}</b>
                <div style={{ margin: '6px 0' }}>{x.situation}</div>
                <i>{x.question}</i>
              </div>
            ))}
          </>
        )}
      </div>

      {w.phase === 'prep' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <b>{isLecon ? 'Mes notes de préparation (plan, idées, réponses à l’exercice)' : 'Mes notes (présentation + pistes de réponse)'}</b>
            <span className="faint small">Le jury lira ces notes</span>
          </div>
          <textarea className="textarea copy-area" style={{ minHeight: 280 }} value={w.notes}
            placeholder={isLecon ? 'Accroche…\nProblématique…\nI. …\nA. … (document / activité élève)\n\nExercice : 1) …' : 'Parcours, motivations…\nSituation 1 : …\nSituation 2 : …'}
            onChange={(e) => save({ notes: e.target.value })} />
          <div className="row between wrap" style={{ marginTop: 14 }}>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted">Exposé à voix haute ({isLecon ? settings.examLeconExposeMin : 15} min) :</span>
              <Recorder onRecorded={(blob, seconds) => setAudio({ blob, seconds })} />
              {audio && (
                <button className="btn sm" disabled={!!busy} onClick={analyseAudio}
                  title="Gemini écoute l'enregistrement : débit, tics de langage, plan annoncé et respecté, temps par partie">
                  {busy && /enregistrement|écoute/.test(busy) ? <><span className="spinner" /> {busy}</> : <><Icon name="sparkles" size={14} /> Faire analyser mon exposé ({Math.round(audio.seconds / 60) || '<1'} min)</>}
                </button>
              )}
            </div>
            <button className="btn accent lg" disabled={!!busy} onClick={toJury}>
              {busy ? <><span className="spinner" /> {busy}</> : <><Icon name="users" /> Passer devant le jury</>}
            </button>
          </div>
        </div>
      )}

      {w.phase === 'jury' && (
        <div className="card view-enter" style={{ marginTop: 16 }} key={qi}>
          <div className="row between"><span className="chip">Question {qi + 1} / {w.qa.length}</span>
            <div className="progress" style={{ width: 200 }}><i style={{ transform: `scaleX(${(qi + 1) / w.qa.length})` }} /></div></div>
          <div className="q-title selectable" style={{ marginTop: 14 }}>{w.qa[qi]?.q}</div>
          <textarea className="textarea" style={{ minHeight: 150, fontFamily: 'inherit', fontSize: 15 }} placeholder="Ta réponse, comme tu la formulerais à l'oral…" autoFocus
            value={w.qa[qi]?.a || ''} onChange={(e) => save({ qa: w.qa.map((x, i) => (i === qi ? { ...x, a: e.target.value } : x)) })} />
          <div className="row between" style={{ marginTop: 14 }}>
            <button className="btn ghost" disabled={qi === 0} onClick={() => setQi(qi - 1)}><Icon name="left" size={15} /> Précédente</button>
            {qi + 1 < w.qa.length
              ? <button className="btn primary" onClick={() => setQi(qi + 1)}>Question suivante <Icon name="right" size={15} /></button>
              : <button className="btn accent lg" disabled={!!busy} onClick={finish}>{busy ? <><span className="spinner" /> {busy}</> : <><Icon name="check" /> Terminer l'oral</>}</button>}
          </div>
        </div>
      )}

      {w.oralAnalysis && (
        <>
          <div className="section-title" id="oral-analysis">Analyse de l'enregistrement</div>
          <OralAnalysis a={w.oralAnalysis} />
        </>
      )}

      {w.phase === 'done' && (
        <>
          <div className="section-title" id="report">Bilan du jury</div>
          <GradeReport r={w.result} />
          <div className="section-title">Échange avec le jury</div>
          <div className="card stack selectable">
            {w.qa.map((x, i) => (
              <div key={i}><b>Q{i + 1}. {x.q}</b><div className="muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{x.a || '—'}</div></div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
