// IA spécifique au CAPES SES : sujets, corrections, oraux, fiches auteurs, données.
import { call } from './ai.js';
import { api } from './bridge.js';
import { getSettings } from './settings.jsx';
import { champLabel } from '../data/programme.js';

const S = (type, extra = {}) => ({ type, ...extra });
const ARR = (items, extra = {}) => ({ type: 'ARRAY', items, ...extra });
const OBJ = (properties, required = Object.keys(properties)) => ({ type: 'OBJECT', properties, required });

const TABLE = OBJ({
  titre: S('STRING'),
  colonnes: ARR(S('STRING')),
  lignes: ARR(ARR(S('STRING'))),
  source: S('STRING', { description: "Source réelle si tu en es sûr (Insee, Eurostat, OCDE…), sinon « Données illustratives d'entraînement »" }),
  unite: S('STRING'),
});

const coursesDigest = (courses = []) =>
  courses.length
    ? `\nCOURS DU CANDIDAT (à utiliser en priorité pour coller à ce qu'il a travaillé) :\n${courses.slice(0, 6).map((c) => `- ${c.title} : ${(c.keyTerms || []).map((k) => k.term).slice(0, 12).join(', ')}`).join('\n')}`
    : '';

// ---------------------------------------------------------------------------
// ÉCRIT 1 — Dissertation (+ 2 questions)
// ---------------------------------------------------------------------------
export async function generateDissertationSubject({ champ, theme, courses }) {
  const { withQuestions } = getSettings();
  const prompt = `Propose un sujet de DISSERTATION de niveau CAPES externe de SES.
Champ : ${champLabel(champ)}.${theme ? `\nThème du programme de lycée à couvrir : « ${theme.theme} » (${theme.niveau}).` : ''}${coursesDigest(courses)}
Exigences :
- Un intitulé court, problématisable, du type de ceux des concours (question ouverte ou formulation « X et Y », « Dans quelle mesure… », « … : une notion pertinente ? »).
- Le sujet doit pouvoir être traité en 6 heures, sans document, en mobilisant théories, auteurs et ordres de grandeur.
${withQuestions ? `- Ajoute DEUX questions courtes (notées sur 8 points au total) : la première d'épistémologie ou d'histoire de la pensée ; la seconde sur les objectifs d'apprentissage d'un point précis des programmes de SES du lycée. Si la dissertation relève de l'économie, les questions portent sur la sociologie et/ou la science politique, et inversement.` : '- Ne propose pas de questions annexes (tableau "questions" vide).'}`;
  return call({
    parts: [{ text: prompt }],
    temperature: 0.9,
    schema: OBJ({
      sujet: S('STRING'),
      champ: S('STRING'),
      themeProgramme: S('STRING'),
      questions: ARR(OBJ({ intitule: S('STRING'), type: S('STRING', { enum: ['Épistémologie / histoire de la pensée', 'Objectifs d’apprentissage'] }) })),
    }),
  });
}

export async function analyseSubject(sujet) {
  return call({
    temperature: 0.4,
    parts: [{ text: `Sujet : « ${sujet} »

Fais l'ANALYSE DU SUJET comme le ferait un préparateur, en Markdown, sans rédiger la dissertation :
## Définition des termes
## Délimitation (espace, temps, champ)
## Enjeux et paradoxes
## Problématique(s) possible(s)
## Pistes de plan (2 ou 3 plans possibles, en titres de parties)
## Auteurs, théories et données mobilisables
## Pièges à éviter
Surligne les notions clés avec ==notion==.` }],
  });
}

const GRADE_SCHEMA = OBJ({
  note: S('NUMBER', { description: 'Note globale sur 20, au demi-point' }),
  appreciation: S('STRING', { description: 'Appréciation générale en 3 à 5 phrases, ton de correcteur de concours' }),
  criteres: ARR(OBJ({ critere: S('STRING'), note: S('NUMBER'), max: S('NUMBER'), commentaire: S('STRING') })),
  pointsForts: ARR(S('STRING')),
  pointsFaibles: ARR(S('STRING')),
  conseils: ARR(S('STRING')),
  corrige: S('STRING', { description: 'Proposition de corrigé en Markdown (plan détaillé, ou éléments attendus)' }),
});

export async function correctDissertation({ sujet, questions = [], copie, minutes }) {
  const q = questions.length ? `\nQUESTIONS (8 points au total) :\n${questions.map((x, i) => `${i + 1}. ${x.intitule}`).join('\n')}` : '';
  const prompt = `Tu corriges une copie de l'épreuve écrite disciplinaire du CAPES externe de SES, avec l'exigence d'un jury.
SUJET DE DISSERTATION : « ${sujet} »${q}
${minutes ? `Temps utilisé par le candidat : ${minutes} min.` : ''}

--- COPIE DU CANDIDAT ---
${copie.slice(0, 60000)}
--- FIN DE LA COPIE ---

Barème : ${questions.length ? 'dissertation sur 12 points + questions sur 8 points' : 'dissertation sur 20 points'}.
Critères à évaluer (un objet par critère, notes cohérentes avec le total) : analyse du sujet et définitions ; problématique ; plan et progression de l'argumentation ; maîtrise des connaissances (mécanismes, théories, auteurs) ; mobilisation d'ordres de grandeur et de faits ; rigueur et expression${questions.length ? ' ; questions (épistémologie / objectifs d’apprentissage)' : ''}.
Si la copie est très incomplète (simple plan, introduction seule), note-la comme telle et explique ce qui manque.
Dans "corrige", propose un plan détaillé (I/A/1…) avec les auteurs et données attendus${questions.length ? ', puis les éléments de réponse aux questions' : ''}. Surligne les notions avec ==notion==.`;
  return call({ parts: [{ text: prompt }], schema: GRADE_SCHEMA, temperature: 0.3 });
}

// ---------------------------------------------------------------------------
// ÉCRIT 2 — Épreuve disciplinaire appliquée (séquence pédagogique)
// ---------------------------------------------------------------------------
export async function generateAppliqueeSubject({ theme, courses }) {
  const prompt = `Propose un sujet d'entraînement pour l'ÉPREUVE ÉCRITE DISCIPLINAIRE APPLIQUÉE du CAPES externe de SES : le candidat doit concevoir une séquence pédagogique pour un niveau donné, incluant les travaux et évaluations destinés aux élèves.
Thème du programme : « ${theme.theme} » (classe de ${theme.niveau}).${coursesDigest(courses)}
Fournis :
- "consigne" : la consigne complète en Markdown (ce que le candidat doit produire : objectifs d'apprentissage visés, progression en séances, activités, usage des documents, évaluation).
- "objectifs" : 3 à 5 objectifs d'apprentissage formulés comme dans le programme officiel (« Savoir… », « Comprendre… »).
- "documents" : un dossier de 3 ou 4 documents COURTS exploitables en classe (résumé d'un texte d'auteur, tableau statistique, extrait de presse). Pour les tableaux, écris-les en texte lisible ligne par ligne. Indique une source réelle seulement si tu en es sûr ; sinon « Document d'entraînement (données illustratives) ».`;
  return call({
    parts: [{ text: prompt }],
    temperature: 0.8,
    schema: OBJ({
      intitule: S('STRING'),
      niveau: S('STRING'),
      consigne: S('STRING'),
      objectifs: ARR(S('STRING')),
      documents: ARR(OBJ({ titre: S('STRING'), contenu: S('STRING'), source: S('STRING') })),
    }),
  });
}

export async function correctAppliquee({ subject, copie, minutes }) {
  const prompt = `Tu corriges une copie de l'épreuve écrite disciplinaire APPLIQUÉE du CAPES externe de SES.
SUJET : ${subject.intitule} (classe de ${subject.niveau})
CONSIGNE : ${subject.consigne}
OBJECTIFS VISÉS : ${(subject.objectifs || []).join(' ; ')}
DOCUMENTS : ${(subject.documents || []).map((d, i) => `Doc ${i + 1} — ${d.titre}`).join(' ; ')}
${minutes ? `Temps utilisé : ${minutes} min.` : ''}

--- COPIE ---
${copie.slice(0, 60000)}
--- FIN ---

Note sur 20. Critères : maîtrise scientifique des notions et mécanismes ; conformité au programme et aux objectifs d'apprentissage ; cohérence et progressivité de la séquence ; pertinence des activités et de l'exploitation des documents ; qualité et alignement des évaluations ; prise en compte des élèves (différenciation, savoir-faire quantitatifs) ; expression.
Dans "corrige", propose une séquence-type en Markdown (séances, activités, évaluation).`;
  return call({ parts: [{ text: prompt }], schema: GRADE_SCHEMA, temperature: 0.3 });
}

// ---------------------------------------------------------------------------
// ORAL 1 — Leçon
// ---------------------------------------------------------------------------
export async function generateLeconSubject({ champ, theme, courses }) {
  const prompt = `Propose un sujet d'entraînement pour l'ÉPREUVE DE LEÇON du CAPES externe de SES.
Champ : ${champLabel(champ)}.${theme ? ` Thème du programme : « ${theme.theme} » (${theme.niveau}).` : ''}${coursesDigest(courses)}
Le candidat doit présenter une leçon (environ 20 minutes) montrant sa démarche d'enseignement pour une classe donnée, puis répondre au jury. Le sujet comprend aussi un EXERCICE sur représentations graphiques et données quantitatives, préparé pendant la préparation.
Fournis :
- "sujet" : l'intitulé de la leçon ;
- "niveau" : la classe ;
- "consigne" : ce que le jury attend (Markdown court) ;
- "exercice" : un tableau de données (5 à 8 lignes) et 3 questions de lecture/calcul (taux de variation, coefficient multiplicateur, indice, part, points de pourcentage, médiane…).`;
  return call({
    parts: [{ text: prompt }],
    temperature: 0.9,
    schema: OBJ({
      sujet: S('STRING'),
      niveau: S('STRING'),
      consigne: S('STRING'),
      exercice: OBJ({ tableau: TABLE, questions: ARR(S('STRING')) }),
    }),
  });
}

// ---------------------------------------------------------------------------
// ORAL 2 — Épreuve d'entretien
// ---------------------------------------------------------------------------
export async function generateEntretienSubject() {
  const prompt = `Prépare une simulation de l'ÉPREUVE D'ENTRETIEN du CAPES externe : une présentation du candidat (parcours, motivations) puis deux mises en situation professionnelles évaluant l'appropriation des valeurs de la République (liberté, égalité, fraternité, laïcité, refus des discriminations…) et des exigences du service public (droits et obligations du fonctionnaire, neutralité, relation avec les familles, harcèlement, égalité filles-garçons, climat scolaire, éducation à la citoyenneté…).
Une situation concerne l'enseignement (classe), l'autre la vie scolaire / l'établissement. Elles doivent être réalistes, en 4 à 6 phrases, et se terminer par une question au candidat.`;
  return call({
    parts: [{ text: prompt }],
    temperature: 0.9,
    schema: OBJ({
      presentationConsigne: S('STRING'),
      situations: ARR(OBJ({ titre: S('STRING'), situation: S('STRING'), question: S('STRING') })),
    }),
  });
}

// Questions du jury (leçon ou entretien) à partir des notes du candidat
export async function generateJuryQuestions({ kind, subject, notes }) {
  const ctx = kind === 'lecon'
    ? `ÉPREUVE DE LEÇON. Sujet : « ${subject.sujet} » (${subject.niveau}).`
    : `ÉPREUVE D'ENTRETIEN. Situations : ${(subject.situations || []).map((s) => s.titre).join(' ; ')}.`;
  const prompt = `${ctx}
Voici les notes / le plan de l'exposé du candidat :
---
${(notes || '(le candidat n’a pas laissé de notes)').slice(0, 20000)}
---
Joue le jury. Pose ${kind === 'lecon' ? '8' : '6'} questions, dans l'ordre d'un vrai entretien : d'abord pour approfondir ou corriger l'exposé (notions, mécanismes, choix didactiques), puis ${kind === 'lecon' ? "pour élargir à l'autre champ (sociologie/science politique ou économie), à l'épistémologie et à l'exploitation des données" : 'pour tester les valeurs de la République, la posture professionnelle et la connaissance du système éducatif'}. Questions courtes, précises, parfois déstabilisantes comme au concours.`;
  return call({ parts: [{ text: prompt }], temperature: 0.7, schema: OBJ({ questions: ARR(S('STRING')) }) });
}

export async function evaluateOral({ kind, subject, notes, qa }) {
  const ctx = kind === 'lecon' ? `ÉPREUVE DE LEÇON — sujet « ${subject.sujet} » (${subject.niveau})` : "ÉPREUVE D'ENTRETIEN";
  const prompt = `${ctx}
NOTES / EXPOSÉ DU CANDIDAT :
${(notes || '(aucune)').slice(0, 20000)}

ÉCHANGE AVEC LE JURY :
${qa.map((x, i) => `Q${i + 1}. ${x.q}\nR${i + 1}. ${x.a || '(pas de réponse)'}`).join('\n\n')}

Évalue comme un jury, note sur 20. Critères : ${kind === 'lecon'
    ? 'maîtrise scientifique ; pertinence de la démarche didactique et adéquation au programme ; construction de la leçon ; exploitation des données quantitatives ; qualité des réponses au jury (réactivité, précision, honnêteté intellectuelle) ; communication'
    : 'connaissance des valeurs de la République et du cadre institutionnel ; analyse des situations ; posture et éthique professionnelles ; capacité à se projeter dans le métier ; qualité des réponses ; communication'}.
Dans "corrige", indique en Markdown les réponses attendues pour chaque question du jury.`;
  return call({ parts: [{ text: prompt }], schema: GRADE_SCHEMA, temperature: 0.3 });
}

// ---------------------------------------------------------------------------
// Fiches auteurs / notions et exercices de données
// ---------------------------------------------------------------------------
export async function generateAuthorFiche(name) {
  const prompt = `Rédige une FICHE de révision CAPES SES sur : « ${name} » (auteur, ou notion/théorie si ce n'est pas un auteur).
Sois rigoureux : n'invente aucune œuvre ni date ; si tu n'es pas sûr d'une date, laisse le champ vide. N'invente pas de citation.`;
  return call({
    parts: [{ text: prompt }],
    temperature: 0.3,
    schema: OBJ({
      nom: S('STRING'),
      type: S('STRING', { enum: ['Auteur', 'Notion', 'Théorie'] }),
      dates: S('STRING'),
      discipline: S('STRING'),
      courant: S('STRING'),
      oeuvres: ARR(OBJ({ titre: S('STRING'), annee: S('STRING') })),
      theses: ARR(S('STRING'), { description: 'Idées et thèses principales' }),
      concepts: ARR(OBJ({ notion: S('STRING'), definition: S('STRING') })),
      usages: ARR(S('STRING'), { description: 'Thèmes du programme / sujets où le mobiliser, et comment' }),
      critiques: ARR(S('STRING'), { description: 'Limites, débats, auteurs qui répondent' }),
    }),
  });
}

export async function generateDataExercise({ theme }) {
  const prompt = `Crée un exercice de LECTURE ET DE TRAITEMENT DE DONNÉES de niveau CAPES SES${theme ? ` sur le thème « ${theme.theme} »` : ''}.
Un tableau (5 à 8 lignes, 3 à 5 colonnes) avec unité et source (réelle seulement si tu es sûr des chiffres, sinon « Données illustratives d'entraînement »), puis 4 questions progressives : lecture d'une donnée (phrase « Selon … , en …, … »), calcul (taux de variation, coefficient multiplicateur, indice base 100, part, points de pourcentage, TCAM), comparaison, puis interprétation (mécanisme explicatif). Pour chaque question, donne la réponse attendue (calculs détaillés, résultats arrondis cohérents avec le tableau) et une explication.`;
  return call({
    parts: [{ text: prompt }],
    temperature: 0.8,
    schema: OBJ({ tableau: TABLE, questions: ARR(OBJ({ question: S('STRING'), reponse: S('STRING'), explication: S('STRING') })) }),
  });
}

// ---------------------------------------------------------------------------
// PLANS EXPRESS — problématique + plan en temps limité
// ---------------------------------------------------------------------------
export async function correctPlan({ sujet, problematique, plan, minutes }) {
  const prompt = `Tu es membre du jury du CAPES externe de SES. Un candidat s'entraîne à construire rapidement problématique et plan de dissertation${minutes ? ` (en ${minutes} minutes)` : ''}.
SUJET : « ${sujet} »
PROBLÉMATIQUE PROPOSÉE : ${problematique || '(aucune)'}
PLAN PROPOSÉ :
${plan || '(aucun)'}

Évalue uniquement problématique et plan (pas de rédaction attendue). Critères (total sur 20) : définition et délimitation des termes du sujet (4) ; problématique (5) ; pertinence et cohérence du plan, réponse à la problématique (6) ; mobilisation de mécanismes, d'auteurs et de données dans les sous-parties (5).
Dans "corrige" : une problématique possible, puis un plan détaillé (I/A/B, II/A/B, éventuellement III) avec, pour chaque sous-partie, l'idée directrice, les mécanismes, auteurs et ordres de grandeur attendus. Surligne les notions avec ==notion==.`;
  return call({ parts: [{ text: prompt }], schema: GRADE_SCHEMA, temperature: 0.3 });
}

// ---------------------------------------------------------------------------
// ORAL — analyse de l'enregistrement audio de l'exposé
// ---------------------------------------------------------------------------
const ORAL_SCHEMA = OBJ({
  note: S('NUMBER', { description: 'Note sur 20 de la prestation orale (forme et structure, pas seulement le fond)' }),
  appreciation: S('STRING', { description: 'Appréciation en 3 à 5 phrases' }),
  resume: S('STRING', { description: 'Ce que le candidat a dit, en 3 à 5 phrases' }),
  dureeSecondes: S('NUMBER'),
  debitMotsMinute: S('NUMBER', { description: 'Débit estimé en mots par minute' }),
  tics: ARR(OBJ({ expression: S('STRING'), nombre: S('NUMBER') }), { description: 'Mots parasites et tics de langage (euh, du coup, voilà…) avec leur nombre approximatif' }),
  plan: OBJ({ annonce: S('STRING', { description: 'Plan annoncé, ou « non annoncé »' }), respecte: S('BOOLEAN'), commentaire: S('STRING') }),
  parties: ARR(OBJ({ titre: S('STRING'), debut: S('STRING', { description: 'mm:ss' }), fin: S('STRING', { description: 'mm:ss' }) })),
  pointsForts: ARR(S('STRING')),
  pointsFaibles: ARR(S('STRING')),
  conseils: ARR(S('STRING')),
});
export async function analyseOralAudio({ kind, subject, file, durationSec, minutes }) {
  const sujet = kind === 'lecon' ? `Épreuve de leçon. Sujet : « ${subject?.sujet || ''} »` : "Épreuve d'entretien (présentation du parcours et mises en situation).";
  const prompt = `Tu es membre du jury du CAPES externe de SES. Écoute attentivement l'enregistrement de l'exposé oral d'un candidat.
${sujet}
Durée de l'enregistrement : environ ${Math.round(durationSec / 60)} min ${Math.round(durationSec % 60)} s. Temps prévu : ${minutes} min.

Analyse la FORME de l'oral autant que le fond : clarté de l'introduction et de l'annonce du plan, respect du plan annoncé, transitions, gestion du temps par partie (repère les débuts et fins de parties en mm:ss), débit (trop rapide au-delà d'environ 170 mots/min, trop lent en dessous de 110), hésitations et tics de langage (compte-les), registre de langue, précision du vocabulaire de SES, conclusion.
Base-toi uniquement sur ce que tu entends. Si l'audio est inaudible ou vide, dis-le dans "appreciation" et mets une note de 0.`;
  return call({ parts: [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } }, { text: prompt }], schema: ORAL_SCHEMA, temperature: 0.2 });
}

// ---------------------------------------------------------------------------
// COUVERTURE DU PROGRAMME
// ---------------------------------------------------------------------------
const MAP_SCHEMA = OBJ({
  liens: ARR(OBJ({ cours: S('INTEGER', { description: 'Numéro du cours' }), themes: ARR(S('INTEGER'), { description: 'Numéros des thèmes couverts (vide si aucun)' }) })),
});
export async function mapProgramme({ themes, courses }) {
  const prompt = `Associe chaque cours aux thèmes du programme de SES du lycée qu'il permet de traiter (un cours peut couvrir plusieurs thèmes, ou aucun).
THÈMES :
${themes.map((t, i) => `${i}. [${t.niveau}] ${t.theme}`).join('\n')}

COURS :
${courses.map((c, i) => `${i}. ${c.title}${c.subject ? ` (${c.subject})` : ''} — notions : ${(c.keyTerms || []).map((k) => k.term).slice(0, 18).join(', ') || (c.summary || c.text || '').slice(0, 500)}`).join('\n')}

Un cours couvre un thème seulement s'il en apporte une part substantielle des notions et mécanismes. Renvoie un élément par cours.`;
  const { liens = [] } = await call({ parts: [{ text: prompt }], schema: MAP_SCHEMA, temperature: 0.1 });
  return liens;
}

export async function generateThemeCourse(t) {
  const prompt = `Rédige un COURS DE RÉVISION complet pour un candidat au CAPES externe de SES, sur ce thème du programme de ${t.niveau} :
« ${t.theme} » (${champLabel(t.champ)}).
Structure en Markdown : # titre, puis ## sections : enjeux et définitions ; mécanismes (enchaînements causaux explicites) ; auteurs et théories (thèse de chacun) ; débats ; ordres de grandeur utiles (en précisant que les chiffres sont à vérifier et à actualiser) ; objectifs d'apprentissage du programme et pistes didactiques.
Uniquement des connaissances établies : n'invente ni référence ni chiffre précis douteux. 1 500 à 2 500 mots.`;
  return call({ parts: [{ text: prompt }], temperature: 0.4 });
}

// ---------------------------------------------------------------------------
// CHIFFRES CLÉS — dernière valeur trouvée par la recherche Google
// ---------------------------------------------------------------------------
export const KEY_FIGURES = [
  { id: 'chomage', name: 'Taux de chômage', scope: 'France, au sens du BIT, dernier trimestre publié par l’INSEE' },
  { id: 'emploi', name: "Taux d'emploi des 15-64 ans", scope: 'France, INSEE, dernière valeur' },
  { id: 'croissance', name: 'Croissance du PIB en volume', scope: 'France, dernière année complète et dernier trimestre' },
  { id: 'inflation', name: 'Inflation (glissement annuel des prix)', scope: 'France, indice des prix à la consommation, dernier mois publié' },
  { id: 'dette', name: 'Dette publique (en % du PIB)', scope: 'France, au sens de Maastricht' },
  { id: 'deficit', name: 'Déficit public (en % du PIB)', scope: 'France, dernière année' },
  { id: 'po', name: 'Taux de prélèvements obligatoires', scope: 'France, en % du PIB' },
  { id: 'depense', name: 'Dépense publique (en % du PIB)', scope: 'France' },
  { id: 'pauvrete', name: 'Taux de pauvreté monétaire', scope: 'France, seuil à 60 % du niveau de vie médian, INSEE' },
  { id: 'gini', name: 'Indice de Gini des niveaux de vie', scope: 'France, après redistribution, INSEE' },
  { id: 'd9d1', name: 'Rapport interdécile D9/D1 des niveaux de vie', scope: 'France, INSEE' },
  { id: 'patrimoine', name: 'Part du patrimoine détenue par les 10 % les plus riches', scope: 'France, INSEE' },
  { id: 'epargne', name: "Taux d'épargne des ménages", scope: 'France, INSEE' },
  { id: 'ges', name: 'Émissions de gaz à effet de serre', scope: 'France, empreinte ou émissions territoriales, en Mt CO2e' },
  { id: 'abstention', name: "Taux d'abstention à la dernière élection nationale", scope: 'France' },
  { id: 'syndicalisation', name: 'Taux de syndicalisation', scope: 'France, salariés, DARES' },
];
const parseJson = (text) => {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse de l'IA inattendue. Réessaie.");
  return JSON.parse(m[0]);
};
export async function fetchKeyFigure(ind) {
  const today = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const prompt = `Nous sommes en ${today}. Cherche avec la recherche Google la DERNIÈRE valeur publiée de cet indicateur :
« ${ind.name} » — ${ind.scope || ''}
Privilégie les sources officielles (INSEE, Eurostat, DARES, DREES, Banque de France, ministères, OCDE).
Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"valeur": "la valeur avec son unité", "periode": "période ou date de la donnée", "source": "organisme", "definition": "définition en une phrase", "evolution": "tendance récente en une phrase, avec la valeur précédente si connue", "phrase": "une phrase prête à citer dans une copie, avec la source et la date"}
Si tu ne trouves pas de donnée fiable, mets "valeur": "" et explique-le dans "definition".`;
  const { model } = getSettings();
  const res = await api.gemini.generate({ model, parts: [{ text: prompt }], temperature: 0.1, search: true });
  if (!res.ok) throw new Error(res.error);
  return { ...parseJson(res.text), sources: res.sources || [] };
}
