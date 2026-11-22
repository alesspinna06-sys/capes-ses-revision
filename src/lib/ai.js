// Toute la logique IA : prompts, schémas JSON structurés, génération.
import { api } from './bridge.js';
import { getSettings } from './settings.jsx';
import { uid } from './db.js';
import { newSrs } from './srs.js';
import { prepareImage, blobToBase64 } from './extract.js';

const MAX_CHARS = 120_000; // ~30 000 mots : largement assez pour un cours

export const SYSTEM = `Tu es un préparateur expert du CAPES externe de Sciences économiques et sociales (SES) et un ancien membre de jury. Tu aides un candidat libre à préparer le concours.
Règles :
- Tu maîtrises la science économique, la sociologie et la science politique au niveau universitaire (licence/master), l'histoire de la pensée et l'épistémologie, ainsi que les programmes de SES du lycée (seconde, première, terminale) et leur didactique.
- Quand un cours est fourni, tu t'appuies d'abord sur son contenu. Tu complètes avec des connaissances académiques classiques et consensuelles, en citant des auteurs et travaux réels (ex. Smith, Ricardo, Keynes, Schumpeter, Solow, Akerlof, Stiglitz, Tirole, Piketty, Durkheim, Weber, Bourdieu, Boudon, Becker, Lahire, Elias, Goffman, Hirschman, Olson, Lazarsfeld, Michelat et Simon, Tiberj, Peugny…) sans jamais inventer de référence, de date ou de chiffre. En cas de doute sur un chiffre, donne un ordre de grandeur et indique-le.
- Tu utilises le vocabulaire exigé par le jury (mécanismes, notions du programme, outils quantitatifs : taux de variation, indices, élasticités, médiane, déciles, etc.).
- Tu écris en français, de façon claire, structurée et exigeante, comme un correcteur bienveillant mais précis.`;

export async function call({ parts, schema, temperature }) {
  const { model } = getSettings();
  const res = await api.gemini.generate({ model, system: SYSTEM, parts, schema, temperature });
  if (!res.ok) throw new Error(res.error);
  if (!schema) return res.text;
  try { return JSON.parse(res.text); }
  catch {
    const m = res.text.match(/[[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]);
    throw new Error("La réponse de l'IA n'était pas au bon format. Réessaie.");
  }
}

const courseBlock = (course) =>
  `TITRE DU COURS : ${course.title}\n${course.subject ? `MATIÈRE : ${course.subject}\n` : ''}\n--- CONTENU DU COURS ---\n${(course.text || '').slice(0, MAX_CHARS)}\n--- FIN DU COURS ---`;

// ---------------------------------------------------------------------------
// 1. OCR : photos / PDF scannés -> texte structuré
// ---------------------------------------------------------------------------
const OCR_PROMPT = `Transcris fidèlement et intégralement le texte de ce(s) document(s) de cours (manuscrit ou imprimé), dans l'ordre des pages.
- Restitue la structure en Markdown : titres (#, ##), listes (-), numérotations.
- Corrige uniquement les coupures de mots évidentes, ne reformule pas.
- Décris brièvement les schémas et graphiques entre crochets, ex. [Graphique : évolution du taux de chômage en France 1975-2023, en %].
- Si un mot est illisible, écris [illisible].
- Ne rajoute aucun commentaire avant ou après la transcription.`;

/** images : tableau de Blob/File. Traité par lots de 6 pour rester léger. */
export async function ocrImages(images, onProgress) {
  const chunks = [];
  for (let i = 0; i < images.length; i += 6) chunks.push(images.slice(i, i + 6));
  const texts = [];
  for (let c = 0; c < chunks.length; c++) {
    onProgress?.(`Lecture des pages ${c * 6 + 1}–${Math.min((c + 1) * 6, images.length)} sur ${images.length}…`);
    const parts = [];
    for (const img of chunks[c]) parts.push({ inlineData: await prepareImage(img) });
    parts.push({ text: OCR_PROMPT });
    texts.push(await call({ parts, temperature: 0.1 }));
  }
  return texts.join('\n\n').trim();
}

export async function ocrPdf(file) {
  if (file.size > 18 * 1024 * 1024) throw new Error('PDF scanné trop lourd (> 18 Mo) : découpe-le en plusieurs fichiers.');
  const data = await blobToBase64(file);
  return call({ parts: [{ inlineData: { mimeType: 'application/pdf', data } }, { text: OCR_PROMPT }], temperature: 0.1 });
}

// ---------------------------------------------------------------------------
// 2. Fiche de synthèse
// ---------------------------------------------------------------------------
const SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Titre court et explicite du cours' },
    subject: { type: 'STRING', description: 'Champ : Science économique, Sociologie, Science politique, Regards croisés, Histoire de la pensée, Épistémologie, Didactique, ou Méthodologie' },
    summary: { type: 'STRING', description: 'Fiche de synthèse complète au format Markdown' },
    keyTerms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { term: { type: 'STRING' }, definition: { type: 'STRING' } },
        required: ['term', 'definition'],
      },
    },
    diagrams: {
      type: 'ARRAY',
      description: 'Schémas recréés à partir des images du cours (vide s’il n’y en a pas ou s’ils ne servent pas à la révision)',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER', description: 'Numéro réutilisé dans le texte : [[schema:id]]' },
          title: { type: 'STRING', description: 'Légende courte du schéma' },
          svg: { type: 'STRING', description: 'Code SVG autonome (<svg viewBox=…>…</svg>)' },
        },
        required: ['id', 'title', 'svg'],
      },
    },
  },
  required: ['title', 'subject', 'summary', 'keyTerms', 'diagrams'],
};

/**
 * Nettoie un SVG produit par l'IA avant de l'afficher : seulement des balises
 * graphiques, sans script, sans événement, sans lien externe. Renvoie null sinon.
 */
export function sanitizeSvg(svg = '') {
  let s = String(svg).trim().replace(/^```(?:svg|xml)?\s*/i, '').replace(/```$/, '').trim();
  const start = s.search(/<svg[\s>]/i);
  if (start < 0) return null;
  s = s.slice(start);
  const end = s.toLowerCase().lastIndexOf('</svg>');
  if (end < 0) return null;
  s = s.slice(0, end + 6);
  if (/<\s*(script|foreignobject|iframe|object|embed|image)/i.test(s)) return null;
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')(?!#)[^"']*\2/gi, '');
  if (!/^<svg[\s\S]*<\/svg>$/i.test(s)) return null;
  if (!/viewBox=/i.test(s)) s = s.replace(/<svg/i, '<svg viewBox="0 0 600 400"');
  return s;
}

export async function generateSummary(course, media = []) {
  const visual = media.length > 0 ? `

DOCUMENTS VISUELS JOINTS : ${media.length} image(s) ou page(s) du cours d'origine (diapositives, graphiques, schémas de manuel).
- Lis-les attentivement : une courbe (offre/demande, IS-LM, Phillips…), un circuit économique, un tableau de données ou un schéma de la pensée peut contenir une notion absente du texte.
- Si un document apporte quelque chose à la révision (circuit, courbe, modèle, enchaînement causal, classification d'auteurs, tableau de données), RECRÉE-LE en SVG dans "diagrams" : un élément par schéma, avec un "id" (1, 2, 3…).
- Règles du SVG : <svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg"> autonome, largeur 600 maximum, fond transparent (pas de rectangle de fond), texte en français, font-size 14 ou plus, font-family="sans-serif", traits et formes simples, couleurs sobres (#4f46e5, #8b5cf6, #64748b, #22c55e, #f59e0b), pas de script, pas d'image externe.
- Reproduis fidèlement les étiquettes, les axes et les flèches. N'invente aucune donnée qui n'est pas dans le document.
- Dans "summary", écris la ligne [[schema:id]] seule, à l'endroit où le schéma doit apparaître, sans le redécrire en texte.
- Si aucun document n'est utile, renvoie "diagrams" vide.` : `

Aucun document visuel n'est joint : "diagrams" doit être vide.`;
  const prompt = `${courseBlock(course)}${visual}

Rédige une FICHE DE RÉVISION structurée de ce cours.
Format du champ "summary" (Markdown) :
- Une phrase d'introduction qui situe le cours.
- Des sections "## …" et sous-sections "### …" qui suivent la logique du cours : notions et définitions, mécanismes (enchaînements causaux explicites « A → B → C »), auteurs et théories (avec la thèse de chacun), débats et limites, ordres de grandeur et données clés, lien avec les programmes de lycée.
- Des listes à puces concises, avec **gras** pour les notions importantes.
- SURLIGNE chaque notion clé, auteur ou mécanisme essentiel avec la syntaxe ==terme== (ex. ==productivité globale des facteurs==, ==Durkheim==, ==socialisation primaire==, ==paradoxe d'Olson==, ==taux de marge==).
- Termine par "## À retenir" avec 5 à 8 points essentiels.
- Pas de tableau, pas de HTML.
Le champ "keyTerms" contient une définition (ou la thèse principale de l'auteur) d'une à deux phrases POUR CHAQUE terme surligné dans "summary" (même orthographe), auxquels s'ajoutent 4 à 10 autres notions ou auteurs clés. Les termes surlignés doivent tous figurer dans "keyTerms" : le lecteur voit la définition en survolant le mot.`;
  const parts = [...media.map((m) => ({ inlineData: { mimeType: m.mimeType, data: m.data } })), { text: prompt }];
  const r = await call({ parts, schema: SUMMARY_SCHEMA, temperature: 0.3 });
  const diagrams = (r.diagrams || [])
    .map((d) => ({ id: d.id, title: String(d.title || '').trim(), svg: sanitizeSvg(d.svg) }))
    .filter((d) => d.svg);
  return { ...r, diagrams };
}

// ---------------------------------------------------------------------------
// 3. Flashcards
// ---------------------------------------------------------------------------
export const CARD_CATEGORIES = ['Notion', 'Mécanisme', 'Auteur', 'Données & calculs', 'Histoire de la pensée', 'Didactique', 'Autre'];

const CARDS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING', description: 'Recto : notion, auteur, mécanisme ou question courte' },
          back: { type: 'STRING', description: 'Verso : réponse précise' },
          category: { type: 'STRING', enum: CARD_CATEGORIES },
        },
        required: ['front', 'back', 'category'],
      },
    },
  },
  required: ['cards'],
};

/** Consigne des flashcards (aussi utilisée pour Claude, sans API). */
export function flashcardsPrompt(course, count, existing = []) {
  const avoid = existing.length
    ? `\n\nCes cartes existent déjà, NE LES RÉPÈTE PAS (couvre d'autres notions) :\n${existing.slice(0, 150).map((c) => `- ${c.front}`).join('\n')}`
    : '';
  const prompt = `${courseBlock(course)}

Génère ${count} flashcards de révision à partir de ce cours.
- Recto ("front") : une notion, un auteur, un mécanisme ou une question courte (ex. « Définition de la PGF », « Thèse de Boudon sur l'inégalité des chances », « Comment calculer un taux de variation ? »).
- Verso ("back") : la réponse exacte en 1 à 4 phrases ou une courte liste ; pour un mécanisme, l'enchaînement causal ; pour un auteur, sa thèse, son œuvre de référence et l'usage en dissertation.
- Varie les angles : définitions du programme, mécanismes, auteurs et théories, données et calculs, histoire de la pensée, objectifs d'apprentissage du lycée.
- Une seule notion par carte.${avoid}`;
  return prompt;
}

/** Cartes brutes ({front, back, category}) → flashcards du logiciel. */
export function toCards(cards, courseId) {
  const now = Date.now();
  return (cards || [])
    .filter((c) => c.front && c.back)
    .map((c) => ({ id: uid(), courseId, front: String(c.front).trim(), back: String(c.back).trim(), category: CARD_CATEGORIES.includes(c.category) ? c.category : 'Autre', srs: newSrs(), createdAt: now }));
}

export async function generateFlashcards(course, count, existing = []) {
  const { cards = [] } = await call({ parts: [{ text: flashcardsPrompt(course, count, existing) }], schema: CARDS_SCHEMA, temperature: 0.5 });
  return toCards(cards, course.id);
}

// ---------------------------------------------------------------------------
// 4. QCM & études de documents
// ---------------------------------------------------------------------------
const QUESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['qcm', 'cas'] },
          context: { type: 'STRING', description: 'Document (texte ou tableau en texte, avec source) pour une étude de document ; vide pour un QCM simple' },
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correct: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Index (à partir de 0) des bonnes réponses' },
          explanation: { type: 'STRING', description: 'Correction détaillée et justification théorique' },
          difficulty: { type: 'INTEGER', description: '1 facile, 2 moyen, 3 difficile' },
        },
        required: ['kind', 'question', 'options', 'correct', 'explanation', 'difficulty'],
      },
    },
  },
  required: ['questions'],
};

export function normalizeQuestions(list, courseId, extra = {}) {
  const now = Date.now();
  return (list || [])
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2 && Array.isArray(q.correct) && q.correct.length)
    .map((q) => ({
      id: uid(),
      courseId,
      kind: q.kind === 'cas' ? 'cas' : 'qcm',
      context: (q.context || '').trim(),
      question: q.question.trim(),
      options: q.options.map((o) => String(o).replace(/^[A-E][).:-]\s*/, '').trim()),
      correct: [...new Set(q.correct.filter((i) => i >= 0 && i < q.options.length))],
      explanation: (q.explanation || '').trim(),
      difficulty: Math.min(3, Math.max(1, q.difficulty || 2)),
      stats: { seen: 0, right: 0 },
      createdAt: now,
      ...extra,
    }))
    .filter((q) => q.correct.length);
}

/** Consigne des QCM (aussi utilisée pour Claude, sans API). */
export function questionsPrompt(course, count, existing = []) {
  const avoid = existing.length
    ? `\n\nCes questions existent déjà, NE LES RÉPÈTE PAS :\n${existing.slice(0, 100).map((q) => `- ${q.question}`).join('\n')}`
    : '';
  const nCas = Math.max(1, Math.round(count / 4));
  const prompt = `${courseBlock(course)}

Génère ${count} questions d'entraînement sur ce cours, dont environ ${nCas} études de documents.
- "qcm" : question directe avec 4 ou 5 propositions ; une OU plusieurs bonnes réponses.
- "cas" : une ÉTUDE DE DOCUMENT : dans "context", un court document réaliste (extrait de texte d'auteur résumé, ou petit tableau de données écrit en texte avec source plausible et unités), puis une question de lecture, de calcul (taux de variation, part, indice, élasticité…) ou d'interprétation (mécanisme, auteur mobilisable).
- Les distracteurs doivent être plausibles (notions voisines, confusions fréquentes).
- "explanation" : explique pourquoi chaque bonne réponse est juste ET pourquoi les distracteurs sont faux, en t'appuyant sur le cours.
- Mélange les niveaux de difficulté.${avoid}`;
  return prompt;
}

export async function generateQuestions(course, count, existing = []) {
  const { questions } = await call({ parts: [{ text: questionsPrompt(course, count, existing) }], schema: QUESTIONS_SCHEMA, temperature: 0.6 });
  return normalizeQuestions(questions, course.id);
}

/** Questions transversales : relient le nouveau cours aux cours déjà étudiés. */
export async function generateCrossQuestions(course, others) {
  if (!others.length) return [];
  const digest = others.slice(0, 8).map((o) =>
    `### ${o.title}${o.subject ? ` (${o.subject})` : ''}\nNotions : ${(o.keyTerms || []).map((k) => k.term).slice(0, 15).join(', ') || (o.summary || o.text || '').slice(0, 600)}`
  ).join('\n\n');
  const prompt = `NOUVEAU COURS :\n${courseBlock({ ...course, text: course.summary || course.text })}

COURS DÉJÀ ÉTUDIÉS :\n${digest}

Génère 3 à 4 questions TRANSVERSALES (de préférence des études de documents) qui obligent à mobiliser à la fois le nouveau cours et au moins un des cours déjà étudiés (regards croisés économie/sociologie, mêmes mécanismes dans deux chapitres, auteurs qui se répondent…). Mêmes règles de format que pour un QCM.`;
  const { questions } = await call({ parts: [{ text: prompt }], schema: QUESTIONS_SCHEMA, temperature: 0.6 });
  return normalizeQuestions(questions, course.id, { cross: true, relatedTitles: others.slice(0, 8).map((o) => o.title) });
}

/** Petit test de la clé API */
export async function testConnection() {
  const text = await call({ parts: [{ text: 'Réponds uniquement par le mot : OK' }], temperature: 0 });
  return text.trim();
}
