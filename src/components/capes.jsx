// Composants partagés des espaces Écrits / Oral / Notions.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { Ring } from './common.jsx';
import { CHAMPS, PROGRAMME } from '../data/programme.js';

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
};

/** Chronomètre à rebours. `elapsedRef` reçoit le temps écoulé (en s). */
export function Timer({ minutes, initialElapsed = 0, onElapsed, autoStart = false, label }) {
  const [elapsed, setElapsed] = useState(initialElapsed);
  const [running, setRunning] = useState(autoStart);
  const last = useRef(null);
  useEffect(() => {
    if (!running) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      setElapsed((e) => e + (now - last.current) / 1000);
      last.current = now;
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => { onElapsed?.(elapsed); }, [Math.floor(elapsed / 5)]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = minutes * 60;
  const left = total - elapsed;
  const ratio = Math.min(1, elapsed / total);
  const state = left <= 0 ? 'over' : left < total * 0.1 ? 'warn' : '';
  return (
    <div className={`timer ${state}`}>
      <Icon name="clock" size={16} />
      <div>
        {label && <div className="timer-label">{label}</div>}
        <div className="timer-val">{left >= 0 ? fmtTime(left) : `+${fmtTime(-left)}`}</div>
      </div>
      <div className="timer-bar"><i style={{ transform: `scaleX(${ratio})` }} /></div>
      <button className="btn icon sm" onClick={() => setRunning((r) => !r)} title={running ? 'Pause' : 'Démarrer'}>
        <Icon name={running ? 'pause' : 'play'} size={14} />
      </button>
    </div>
  );
}

/** Choix du champ + thème du programme (ou au hasard). */
export function SubjectPicker({ value, onChange, allowRc = true }) {
  const champs = CHAMPS.filter((c) => allowRc || c.id !== 'rc');
  const themes = PROGRAMME.filter((t) => t.champ === value.champ);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap">
        <div className="segmented">
          {champs.map((c) => (
            <button key={c.id} className={value.champ === c.id ? 'on' : ''} onClick={() => onChange({ ...value, champ: c.id, themeIdx: -1 })}>{c.label}</button>
          ))}
        </div>
      </div>
      <select className="select" value={value.themeIdx} onChange={(e) => onChange({ ...value, themeIdx: +e.target.value })}>
        <option value={-1}>🎲 Thème au hasard dans ce champ</option>
        {themes.map((t) => (
          <option key={t.theme} value={PROGRAMME.indexOf(t)}>{t.niveau} — {t.theme}</option>
        ))}
      </select>
    </div>
  );
}

export function pickTheme(value) {
  if (value.themeIdx >= 0) return PROGRAMME[value.themeIdx];
  const list = PROGRAMME.filter((t) => t.champ === value.champ);
  return list[Math.floor(Math.random() * list.length)];
}

export function DataTable({ t }) {
  if (!t) return null;
  return (
    <div className="data-table">
      {t.titre && <div className="dt-title">{t.titre}{t.unite ? <span className="faint"> · {t.unite}</span> : null}</div>}
      <div className="dt-scroll">
        <table>
          <thead><tr>{(t.colonnes || []).map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{(t.lignes || []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {t.source && <div className="dt-source">Source : {t.source}</div>}
    </div>
  );
}

/** Rapport de correction (note, critères, conseils, corrigé). */
export function GradeReport({ r }) {
  const [showCorrige, setShowCorrige] = useState(false);
  if (!r) return null;
  const note = Math.max(0, Math.min(20, Number(r.note) || 0));
  return (
    <div className="stack view-enter" style={{ gap: 16 }}>
      <div className="card row" style={{ gap: 26, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Ring value={note / 20} size={128} stroke={11} />
          <div className="grade-over">{note.toLocaleString('fr-FR')}<small>/20</small></div>
        </div>
        <div className="grow">
          <div className="chip accent" style={{ marginBottom: 8 }}><Icon name="sparkles" size={12} /> Appréciation du correcteur IA</div>
          <div className="selectable" style={{ lineHeight: 1.65 }}>{r.appreciation}</div>
        </div>
      </div>
      {r.criteres?.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Grille d'évaluation</div>
          <div className="stack" style={{ gap: 14 }}>
            {r.criteres.map((c, i) => (
              <div key={i}>
                <div className="row between"><b>{c.critere}</b><span className="chip">{String(c.note).replace(".", ",")}/{c.max}</span></div>
                <div className="progress" style={{ margin: '8px 0 6px' }}><i style={{ transform: `scaleX(${c.max ? c.note / c.max : 0})` }} /></div>
                <div className="small muted selectable">{c.commentaire}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-2">
        <ListCard title="Points forts" icon="check" items={r.pointsForts} tone="success" />
        <ListCard title="À améliorer" icon="alert" items={r.pointsFaibles} tone="warning" />
      </div>
      {r.conseils?.length > 0 && <ListCard title="Conseils pour la prochaine fois" icon="target" items={r.conseils} tone="accent" />}
      {r.corrige && (
        <div className="card">
          <div className="row between">
            <b>Proposition de corrigé</b>
            <button className="btn sm" onClick={() => setShowCorrige((s) => !s)}>{showCorrige ? 'Masquer' : 'Afficher'}</button>
          </div>
          {showCorrige && <div style={{ marginTop: 16 }}><Markdown text={r.corrige} /></div>}
        </div>
      )}
      <p className="faint small" style={{ textAlign: 'center' }}>Correction indicative produite par l'IA : elle aide à progresser mais ne remplace pas l'avis d'un correcteur humain.</p>
    </div>
  );
}

function ListCard({ title, icon, items = [], tone }) {
  if (!items?.length) return null;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}><span className={`chip ${tone}`}><Icon name={icon} size={12} /> {title}</span></div>
      <ul className="clean-list selectable">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

export const wordCount = (t = '') => (t.trim().match(/\S+/g) || []).length;

/** Enregistreur audio (pour s'écouter après l'exposé). Rien n'est sauvegardé sur le disque.
 *  onRecorded(blob, secondes) : appelé à la fin de chaque enregistrement (pour l'analyse par l'IA). */
export function Recorder({ onRecorded }) {
  const [rec, setRec] = useState(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const chunks = useRef([]);
  const startedAt = useRef(0);
  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (url) URL.revokeObjectURL(url);
        const blob = new Blob(chunks.current, { type: mr.mimeType });
        setUrl(URL.createObjectURL(blob));
        onRecorded?.(blob, (Date.now() - startedAt.current) / 1000);
      };
      startedAt.current = Date.now();
      mr.start();
      setRec(mr);
    } catch { setErr("Micro indisponible : autorise l'accès au micro dans les paramètres de Windows."); }
  };
  const stop = () => { rec?.stop(); setRec(null); };
  useEffect(() => () => { rec?.stop(); if (url) URL.revokeObjectURL(url); }, []); // eslint-disable-line
  return (
    <div className="row wrap">
      {rec
        ? <button className="btn danger" onClick={stop}><span className="rec-dot" /> Arrêter l'enregistrement</button>
        : <button className="btn" onClick={start}><Icon name="mic" size={15} /> {url ? 'Recommencer' : "M'enregistrer"}</button>}
      {url && !rec && <audio controls src={url} style={{ height: 36 }} />}
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}

/** Analyse de l'enregistrement de l'exposé : débit, tics, plan, gestion du temps. */
export function OralAnalysis({ a }) {
  if (!a) return null;
  const note = Math.max(0, Math.min(20, Number(a.note) || 0));
  const mmss = (sec) => `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const debit = Number(a.debitMotsMinute) || 0;
  return (
    <div className="stack view-enter" style={{ gap: 16 }}>
      <div className="card row" style={{ gap: 26, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Ring value={note / 20} size={118} stroke={10} />
          <div className="grade-over">{note.toLocaleString('fr-FR')}<small>/20</small></div>
        </div>
        <div className="grow">
          <div className="chip accent" style={{ marginBottom: 8 }}><Icon name="mic" size={12} /> Analyse de ton exposé enregistré</div>
          <div className="selectable" style={{ lineHeight: 1.65 }}>{a.appreciation}</div>
        </div>
      </div>
      <div className="grid oral-metrics">
        <div className="card stat-tile"><div className="faint small">Durée</div><div className="stat-value">{a.dureeSecondes ? mmss(a.dureeSecondes) : '—'}</div></div>
        <div className="card stat-tile"><div className="faint small">Débit</div><div className="stat-value">{debit ? `${Math.round(debit)}` : '—'}</div>
          <div className="faint small">mots / min {debit ? (debit > 170 ? '· un peu rapide' : debit < 110 ? '· un peu lent' : '· confortable') : ''}</div></div>
        <div className="card stat-tile"><div className="faint small">Plan annoncé</div><div className="stat-value" style={{ fontSize: 22 }}>{a.plan?.respecte ? 'Respecté' : 'À revoir'}</div>
          <div className="faint small clamp-2">{a.plan?.annonce}</div></div>
      </div>
      {a.plan?.commentaire && <div className="q-context small">{a.plan.commentaire}</div>}
      {a.parties?.length > 0 && (
        <div className="card">
          <b>Déroulé</b>
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            {a.parties.map((p, i) => <div key={i} className="row between small"><span>{p.titre}</span><span className="faint">{p.debut} → {p.fin}</span></div>)}
          </div>
        </div>
      )}
      {a.tics?.length > 0 && (
        <div className="card">
          <b>Tics de langage</b>
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{a.tics.map((t, i) => <span key={i} className="chip warning">« {t.expression} » × {t.nombre}</span>)}</div>
        </div>
      )}
      <div className="grid grid-2">
        <ListCard title="Points forts" icon="check" items={a.pointsForts} tone="success" />
        <ListCard title="À améliorer" icon="alert" items={a.pointsFaibles} tone="warning" />
      </div>
      {a.conseils?.length > 0 && <ListCard title="Conseils" icon="target" items={a.conseils} tone="accent" />}
      {a.resume && <div className="card small muted selectable"><b style={{ color: 'var(--text)' }}>Ce que le jury a entendu : </b>{a.resume}</div>}
    </div>
  );
}
