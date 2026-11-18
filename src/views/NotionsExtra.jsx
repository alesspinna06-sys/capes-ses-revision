import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/bridge.js';
import { useDb, getCourses, updateCourse, addCourse, getRefs, putRef, deleteRef, uid } from '../lib/db.js';
import { mapProgramme, generateThemeCourse, KEY_FIGURES, fetchKeyFigure } from '../lib/ai-capes.js';
import { enqueue } from '../lib/jobs.js';
import { PROGRAMME, CHAMPS, NIVEAUX } from '../data/programme.js';

const champName = (id) => CHAMPS.find((c) => c.id === id)?.label || id;

// ---------------------------------------------------------------------------
// Couverture du programme
// ---------------------------------------------------------------------------
export function ProgrammeCoverage({ go, hasKey }) {
  const toast = useToast();
  const courses = useDb(() => getCourses(), []);
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(null);

  const byTheme = useMemo(() => {
    const m = PROGRAMME.map(() => []);
    (courses || []).forEach((c) => (c.programme?.themes || []).forEach((i) => { if (m[i]) m[i].push(c); }));
    return m;
  }, [courses]);
  if (!courses) return null;

  const usable = courses.filter((c) => (c.text || c.summary || '').trim());
  const toMap = usable.filter((c) => !c.programme || c.programme.at < c.updatedAt - 1000);
  const covered = byTheme.filter((l) => l.length).length;

  const analyse = async (all = false) => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    const list = all ? usable : toMap;
    if (!list.length) return toast({ type: 'success', text: 'Tout est déjà analysé.' });
    try {
      for (let i = 0; i < list.length; i += 20) {
        const batch = list.slice(i, i + 20);
        setBusy(`Analyse des cours ${i + 1}–${i + batch.length} sur ${list.length}…`);
        const liens = await mapProgramme({ themes: PROGRAMME, courses: batch });
        for (let k = 0; k < batch.length; k++) {
          const themes = (liens.find((l) => l.cours === k)?.themes || []).filter((t) => t >= 0 && t < PROGRAMME.length);
          await updateCourse(batch[k].id, { programme: { themes: [...new Set(themes)], at: Date.now() + 2000 } });
        }
      }
      toast({ type: 'success', text: 'Couverture du programme mise à jour.' });
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy('');
  };

  const createFor = async (idx) => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setCreating(idx);
    try {
      const t = PROGRAMME[idx];
      const text = await generateThemeCourse(t);
      const c = await addCourse({
        title: t.theme, titleLocked: true, subject: champName(t.champ), text, sourceType: 'text',
        sourceName: `Cours rédigé par l'IA · ${t.niveau}`, programme: { themes: [idx], at: Date.now() + 5000 },
      });
      enqueue(c.id);
      toast({ type: 'success', text: 'Cours créé : fiche, flashcards et QCM sont en préparation.' });
      go('course', { id: c.id });
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setCreating(null);
  };

  return (
    <>
      <div className="card row wrap" style={{ gap: 16, alignItems: 'center' }}>
        <div className="grow">
          <b style={{ fontSize: 17 }}>{covered} thème{covered > 1 ? 's' : ''} couvert{covered > 1 ? 's' : ''} sur {PROGRAMME.length}</b>
          <div className="progress" style={{ margin: '10px 0 6px', maxWidth: 420 }}><i style={{ transform: `scaleX(${covered / PROGRAMME.length})` }} /></div>
          <div className="small muted">L'IA associe tes cours aux thèmes des programmes de lycée. {toMap.length ? `${toMap.length} cours pas encore analysé${toMap.length > 1 ? 's' : ''}.` : ''}</div>
        </div>
        <button className="btn accent" disabled={!!busy || !usable.length} onClick={() => analyse(false)}>
          {busy ? <><span className="spinner" /> {busy}</> : <><Icon name="sparkles" /> Analyser mes cours</>}
        </button>
      </div>

      {!usable.length && <div className="card" style={{ marginTop: 16 }}><Empty icon="book" title="Aucun cours" text="Importe tes cours pour voir quels thèmes du programme ils couvrent." /></div>}

      {NIVEAUX.map((niv) => (
        <div key={niv}>
          <div className="section-title">{niv}</div>
          <div className="card" style={{ padding: 8 }}>
            {PROGRAMME.map((t, i) => ({ t, i })).filter(({ t }) => t.niveau === niv).map(({ t, i }) => (
              <div key={i} className="prog-row">
                <span className={`prog-dot ${byTheme[i].length ? 'on' : ''}`} aria-hidden="true" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t.theme}</div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    <span className="chip">{champName(t.champ)}</span>
                    {byTheme[i].map((c) => <button key={c.id} className="chip-btn" onClick={() => go('course', { id: c.id })}><Icon name="book" size={12} /> {c.title}</button>)}
                    {!byTheme[i].length && <span className="chip warning">Non couvert</span>}
                  </div>
                </div>
                {!byTheme[i].length && (
                  <button className="btn sm" disabled={creating !== null} onClick={() => createFor(i)} title="L'IA rédige un cours de révision sur ce thème, puis la fiche, les flashcards et les QCM">
                    {creating === i ? <><span className="spinner" /> Rédaction…</> : <><Icon name="plus" size={14} /> Créer un cours</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {usable.length > 0 && (
        <p className="faint small" style={{ marginTop: 12 }}>
          L'association est faite par l'IA : corrige-la en relançant l'analyse après avoir modifié un cours.{' '}
          <button className="link-btn" disabled={!!busy} onClick={() => analyse(true)}>Tout réanalyser</button>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Chiffres clés
// ---------------------------------------------------------------------------
export function KeyFigures({ hasKey }) {
  const toast = useToast();
  const saved = useDb(() => getRefs('figure'), []);
  const [busy, setBusy] = useState(null); // id en cours, ou 'all'
  const [custom, setCustom] = useState('');

  const list = useMemo(() => {
    const byId = new Map((saved || []).map((r) => [r.id, r]));
    const preset = KEY_FIGURES.map((k) => ({ ...k, ...(byId.get(`fig-${k.id}`) || {}), id: `fig-${k.id}`, preset: true }));
    const extra = (saved || []).filter((r) => r.custom);
    return [...preset, ...extra];
  }, [saved]);
  if (!saved) return null;

  const refresh = async (ind) => {
    const data = await fetchKeyFigure(ind);
    await putRef({ ...ind, kind: 'figure', ...data, fetchedAt: Date.now() });
  };
  const refreshOne = async (ind) => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy(ind.id);
    try { await refresh(ind); } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(null);
  };
  const refreshAll = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    setBusy('all');
    for (const ind of list) {
      try { await refresh(ind); } catch (e) { toast({ type: 'error', text: `${ind.name} : ${e.message}` }); if (/quota|recherche|search/i.test(e.message)) break; }
    }
    setBusy(null);
  };
  const addCustom = async () => {
    const name = custom.trim();
    if (!name) return;
    const ind = { id: `fig-${uid()}`, name, scope: 'France, dernière valeur publiée', custom: true, kind: 'figure' };
    await putRef(ind);
    setCustom('');
    refreshOne(ind);
  };

  return (
    <>
      <div className="card row wrap" style={{ gap: 12, alignItems: 'center' }}>
        <div className="grow small muted">
          Gemini cherche la dernière valeur publiée (INSEE, Eurostat, DARES…) et donne ses sources. <b>Vérifie toujours la source</b> avant de citer un chiffre dans une copie.
        </div>
        <button className="btn accent" disabled={!!busy} onClick={refreshAll}>
          {busy === 'all' ? <><span className="spinner" /> Actualisation…</> : <><Icon name="refresh" /> Tout actualiser</>}
        </button>
      </div>
      <div className="grid figures-grid" style={{ marginTop: 16 }}>
        {list.map((f) => (
          <div key={f.id} className="card figure-card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="small" style={{ fontWeight: 650 }}>{f.name}</div>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn icon sm ghost" title="Actualiser" aria-label={`Actualiser ${f.name}`} disabled={!!busy} onClick={() => refreshOne(f)}>
                  {busy === f.id ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
                </button>
                {f.custom && <button className="btn icon sm ghost" title="Retirer" aria-label="Retirer" onClick={() => deleteRef(f.id)}><Icon name="x" size={14} /></button>}
              </div>
            </div>
            {f.fetchedAt ? (
              <>
                <div className="figure-value">{f.valeur || '—'}</div>
                <div className="faint small">{[f.periode, f.source].filter(Boolean).join(' · ')}</div>
                {f.definition && <p className="small muted" style={{ margin: '10px 0 0' }}>{f.definition}</p>}
                {f.evolution && <p className="small" style={{ margin: '6px 0 0' }}>{f.evolution}</p>}
                {f.phrase && <div className="figure-quote selectable">{f.phrase}</div>}
                <div className="row wrap" style={{ gap: 6, marginTop: 'auto', paddingTop: 10 }}>
                  {(f.sources || []).slice(0, 3).map((s) => <button key={s.uri} className="chip-btn" onClick={() => api.openExternal(s.uri)} title="Ouvrir la source"><Icon name="link" size={12} /> {s.title}</button>)}
                  {!f.sources?.length && <span className="chip warning">Aucune source renvoyée : à vérifier</span>}
                </div>
                <div className="faint small" style={{ marginTop: 6 }}>Actualisé le {new Date(f.fetchedAt).toLocaleDateString('fr-FR')}</div>
              </>
            ) : <p className="faint small" style={{ margin: '12px 0 0' }}>{f.scope}. Clique sur ⟳ pour chercher la dernière valeur.</p>}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16, gap: 8, maxWidth: 560 }}>
        <input className="input grow" value={custom} placeholder="Ajouter un indicateur (ex. taux de marge des entreprises)" onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
        <button className="btn" disabled={!custom.trim()} onClick={addCustom}><Icon name="plus" size={15} /> Ajouter</button>
      </div>
    </>
  );
}
