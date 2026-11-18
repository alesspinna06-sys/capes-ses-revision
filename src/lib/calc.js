// Outils quantitatifs des SES : calculs exacts (sans IA) + exercices aléatoires.
export const fr = (x, d = 2) =>
  Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—';
export const parse = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const sens = (x, hausse = 'augmenté', baisse = 'diminué') => (x >= 0 ? hausse : baisse);

export const CALCULATORS = [
  {
    id: 'tv', titre: 'Taux de variation & coefficient multiplicateur',
    champs: [{ k: 'v0', l: 'Valeur de départ (V₀)' }, { k: 'v1', l: "Valeur d'arrivée (V₁)" }],
    formule: 'Taux = (V₁ − V₀) / V₀ × 100 · CM = V₁ / V₀ = 1 + taux/100',
    calc: ({ v0, v1 }) => {
      const t = ((v1 - v0) / v0) * 100, cm = v1 / v0;
      return { resultats: [['Taux de variation', `${fr(t)} %`], ['Coefficient multiplicateur', fr(cm, 3)]],
        phrase: `La valeur a ${sens(t)} de ${fr(Math.abs(t))} % : elle a été multipliée par ${fr(cm, 3)}.` };
    },
  },
  {
    id: 'cumul', titre: 'Taux successifs → taux global et taux moyen',
    champs: [{ k: 'taux', l: 'Taux successifs en % (séparés par ; )', text: true, ph: '2 ; -1,5 ; 3' }],
    formule: 'CM global = CM₁ × CM₂ × … · Taux moyen = (CM global^(1/n) − 1) × 100',
    calc: ({ taux }) => {
      const list = String(taux).split(/[;\n]/).map(parse).filter(Number.isFinite);
      if (!list.length) return null;
      const cm = list.reduce((p, t) => p * (1 + t / 100), 1);
      const moy = (Math.pow(cm, 1 / list.length) - 1) * 100;
      return { resultats: [['CM global', fr(cm, 4)], ['Taux global', `${fr((cm - 1) * 100)} %`], ['Taux moyen par période', `${fr(moy)} %`]],
        phrase: `Sur ${list.length} périodes, la variation globale est de ${fr((cm - 1) * 100)} % (et non ${fr(list.reduce((a, b) => a + b, 0))} % : les taux ne s'additionnent pas).` };
    },
  },
  {
    id: 'indice', titre: 'Indice base 100',
    champs: [{ k: 'v', l: 'Valeur à la date t' }, { k: 'ref', l: 'Valeur à la date de référence' }],
    formule: 'Indice = Vₜ / V_réf × 100',
    calc: ({ v, ref }) => {
      const i = (v / ref) * 100;
      return { resultats: [['Indice', fr(i, 1)], ['Variation depuis la base', `${fr(i - 100, 1)} %`]],
        phrase: `Indice ${fr(i, 1)} : la valeur a ${sens(i - 100)} de ${fr(Math.abs(i - 100), 1)} % depuis la date de référence.` };
    },
  },
  {
    id: 'tcam', titre: 'Taux de croissance annuel moyen (TCAM)',
    champs: [{ k: 'v0', l: 'Valeur initiale' }, { k: 'vn', l: 'Valeur finale' }, { k: 'n', l: "Nombre d'années (n)" }],
    formule: 'TCAM = ((Vₙ / V₀)^(1/n) − 1) × 100',
    calc: ({ v0, vn, n }) => {
      const t = (Math.pow(vn / v0, 1 / n) - 1) * 100;
      return { resultats: [['TCAM', `${fr(t)} % par an`]],
        phrase: `En moyenne, la valeur a ${sens(t, 'progressé', 'reculé')} de ${fr(Math.abs(t))} % par an pendant ${fr(n, 0)} ans.` };
    },
  },
  {
    id: 'part', titre: 'Part (proportion)',
    champs: [{ k: 'p', l: 'Partie' }, { k: 't', l: 'Total (ensemble)' }],
    formule: 'Part = partie / total × 100',
    calc: ({ p, t }) => ({ resultats: [['Part', `${fr((p / t) * 100)} %`]], phrase: `La partie représente ${fr((p / t) * 100)} % de l'ensemble.` }),
  },
  {
    id: 'points', titre: 'Points de pourcentage vs pourcentage',
    champs: [{ k: 'a', l: 'Taux de départ (%)' }, { k: 'b', l: "Taux d'arrivée (%)" }],
    formule: 'Écart = b − a (en points) · Variation relative = (b − a) / a × 100 (en %)',
    calc: ({ a, b }) => ({
      resultats: [['Écart absolu', `${fr(b - a)} points`], ['Variation relative', `${fr(((b - a) / a) * 100)} %`]],
      phrase: `Le taux passe de ${fr(a)} % à ${fr(b)} % : il ${b >= a ? 'gagne' : 'perd'} ${fr(Math.abs(b - a))} points de pourcentage, soit une ${b >= a ? 'hausse' : 'baisse'} de ${fr(Math.abs(((b - a) / a) * 100))} %.`,
    }),
  },
  {
    id: 'reel', titre: 'Variation réelle (en volume) / nominale',
    champs: [{ k: 'tn', l: 'Variation nominale (%)' }, { k: 'tp', l: 'Inflation / variation des prix (%)' }],
    formule: 'CM réel = CM nominal / CM prix · taux réel ≈ taux nominal − inflation',
    calc: ({ tn, tp }) => {
      const r = ((1 + tn / 100) / (1 + tp / 100) - 1) * 100;
      return { resultats: [['Variation réelle exacte', `${fr(r)} %`], ['Approximation', `${fr(tn - tp)} %`]],
        phrase: `En tenant compte de la hausse des prix, la grandeur a ${sens(r)} de ${fr(Math.abs(r))} % en volume (pouvoir d'achat).` };
    },
  },
  {
    id: 'elast', titre: 'Élasticité',
    champs: [{ k: 'dq', l: 'Variation de la quantité (%)' }, { k: 'dx', l: 'Variation du prix ou du revenu (%)' }],
    formule: 'e = (ΔQ/Q) / (ΔX/X)',
    calc: ({ dq, dx }) => {
      const e = dq / dx, a = Math.abs(e);
      const nat = a > 1 ? 'élastique (|e| > 1)' : a < 1 ? 'peu élastique / rigide (|e| < 1)' : 'unitaire';
      return { resultats: [['Élasticité', fr(e, 2)]],
        phrase: `Quand X varie de 1 %, la quantité varie de ${fr(e, 2)} % : la demande est ${nat}.` };
    },
  },
];

// ---------- Exercices aléatoires ---------------------------------------------
const rnd = (a, b, step = 1) => Math.round((a + Math.random() * (b - a)) / step) * step;
const GEN = [
  () => { const v0 = rnd(800, 3000, 10), v1 = Math.round(v0 * (1 + rnd(-25, 40) / 100));
    return { enonce: `Le PIB d'un pays passe de ${fr(v0, 0)} à ${fr(v1, 0)} Md€. Quel est le taux de variation (en %) ?`, rep: ((v1 - v0) / v0) * 100, unite: '%',
      expl: `(${fr(v1, 0)} − ${fr(v0, 0)}) / ${fr(v0, 0)} × 100` }; },
  () => { const t = rnd(-30, 80); return { enonce: `Une variable ${t >= 0 ? 'augmente' : 'diminue'} de ${fr(Math.abs(t), 0)} %. Quel est le coefficient multiplicateur ?`, rep: 1 + t / 100, unite: '',
    expl: `CM = 1 + ${fr(t, 0)}/100` }; },
  () => { const ref = rnd(200, 900, 5), v = Math.round(ref * (1 + rnd(-20, 60) / 100));
    return { enonce: `Le nombre de chômeurs était de ${fr(ref, 0)} milliers en 2015 (base 100) et de ${fr(v, 0)} milliers en 2023. Quel est l'indice en 2023 ?`, rep: (v / ref) * 100, unite: '',
      expl: `${fr(v, 0)} / ${fr(ref, 0)} × 100` }; },
  () => { const v0 = rnd(100, 500), n = rnd(3, 15), vn = Math.round(v0 * Math.pow(1 + rnd(-3, 6, 0.5) / 100, n));
    return { enonce: `Une production passe de ${fr(v0, 0)} à ${fr(vn, 0)} en ${n} ans. Quel est le taux de croissance annuel moyen (en %) ?`, rep: (Math.pow(vn / v0, 1 / n) - 1) * 100, unite: '%',
      expl: `((${fr(vn, 0)} / ${fr(v0, 0)})^(1/${n}) − 1) × 100` }; },
  () => { const t = rnd(5000, 40000, 100), p = rnd(t * 0.05, t * 0.6, 10);
    return { enonce: `Sur ${fr(t, 0)} salariés, ${fr(p, 0)} sont en CDD. Quelle est la part des CDD (en %) ?`, rep: (p / t) * 100, unite: '%', expl: `${fr(p, 0)} / ${fr(t, 0)} × 100` }; },
  () => { const a = rnd(4, 25, 0.5), b = Math.max(0.5, a + rnd(-5, 5, 0.5)) ;
    return { enonce: `Le taux de chômage passe de ${fr(a, 1)} % à ${fr(b, 1)} %. De combien de POINTS a-t-il varié ?`, rep: b - a, unite: 'points', expl: `${fr(b, 1)} − ${fr(a, 1)}` }; },
  () => { const t1 = rnd(-5, 10), t2 = rnd(-5, 10); const cm = (1 + t1 / 100) * (1 + t2 / 100);
    return { enonce: `Un prix ${t1 >= 0 ? 'augmente' : 'baisse'} de ${Math.abs(t1)} % puis ${t2 >= 0 ? 'augmente' : 'baisse'} de ${Math.abs(t2)} %. Quel est le taux de variation global (en %) ?`, rep: (cm - 1) * 100, unite: '%',
      expl: `(1 + ${t1}/100) × (1 + ${t2}/100) − 1, × 100` }; },
];

export function randomExercise() {
  const e = GEN[Math.floor(Math.random() * GEN.length)]();
  return { ...e, id: Math.random().toString(36).slice(2) };
}

export function checkAnswer(ex, input) {
  const v = parse(input);
  if (!Number.isFinite(v)) return null;
  const tol = Math.max(0.06, Math.abs(ex.rep) * 0.005);
  return Math.abs(v - ex.rep) <= tol;
}
