// Textes propres à la discipline, utilisés par les fonctions IA communes (ai-extra.js).
// Ce fichier est le seul à différer entre Ortho Révision et CAPES SES Révision.
export const DOMAIN = {
  audience: 'un candidat libre au CAPES externe de Sciences économiques et sociales',
  diagramIdeas:
    'enchaînement causal (A → B → C), circuit économique, courbe théorique stylisée (offre/demande, courbe de Phillips…) ' +
    'sans aucune donnée chiffrée inventée, tableau comparatif d’auteurs ou de théories, frise chronologique de la pensée, ' +
    'carte mentale des notions, typologie',
  newsFocus:
    'actualité économique, sociale et politique récente en France et en Europe : derniers chiffres de l’INSEE, d’Eurostat, ' +
    'de la Banque de France ou de l’OFCE, réformes, débats publics, travaux de chercheurs, utilisables comme exemple ou accroche ' +
    'dans une dissertation ou une leçon',
};

// Fonctions propres à ce logiciel
DOMAIN.features = { diagramQuiz: false };

// Cours complet : indications pour la retranscription
DOMAIN.subjectHint = 'Champ : Science économique, Sociologie, Science politique, Regards croisés, Histoire de la pensée, Épistémologie, Didactique, ou Méthodologie';
DOMAIN.termKinds = 'notion clé, auteur ou mécanisme essentiel';
DOMAIN.termExamples = "==productivité globale des facteurs==, ==Durkheim==, ==socialisation primaire==, ==paradoxe d'Olson==";
// Libellé des questions générées (barre de progression)
DOMAIN.questionsLabel = 'QCM et études de documents';

// Extrait montré dans Réglages › Apparence des cours
DOMAIN.styleSample = "## La mobilité sociale\n>[def] La **mobilité sociale** désigne le changement de position sociale d'un individu au cours de sa vie ou par rapport à ses parents.\nPour @@Pierre Bourdieu@@ (^^1964^^), l'école contribue à la ==reproduction sociale==.\n>[ex] Un fils d'ouvrier qui devient cadre connaît une mobilité ascendante.\n>[piege] Ne pas confondre mobilité observée et fluidité sociale.";
