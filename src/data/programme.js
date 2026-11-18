// Programmes de SES du lycée (programmes de 2019) — base des sujets générés.
// ⚠️ Vérifie sur eduscol / le Bulletin officiel si un programme a été modifié
// depuis : tu peux éditer librement cette liste (puis relancer l'app).
export const CHAMPS = [
  { id: 'eco', label: 'Science économique' },
  { id: 'socio', label: 'Sociologie et science politique' },
  { id: 'rc', label: 'Regards croisés' },
];

export const PROGRAMME = [
  // ---- Seconde
  { niveau: 'Seconde', champ: 'rc', theme: 'Comment les économistes, les sociologues et les politistes raisonnent-ils et travaillent-ils ?' },
  { niveau: 'Seconde', champ: 'eco', theme: 'Comment crée-t-on des richesses et comment les mesure-t-on ?' },
  { niveau: 'Seconde', champ: 'eco', theme: 'Comment se forment les prix sur un marché ?' },
  { niveau: 'Seconde', champ: 'socio', theme: 'Comment devenons-nous des acteurs sociaux ?' },
  { niveau: 'Seconde', champ: 'socio', theme: "Comment s'organise la vie politique ?" },
  { niveau: 'Seconde', champ: 'rc', theme: "Quelles relations entre le diplôme, l'emploi et le salaire ?" },
  // ---- Première
  { niveau: 'Première', champ: 'eco', theme: 'Comment un marché concurrentiel fonctionne-t-il ?' },
  { niveau: 'Première', champ: 'eco', theme: 'Comment les marchés imparfaitement concurrentiels fonctionnent-ils ?' },
  { niveau: 'Première', champ: 'eco', theme: 'Quelles sont les principales défaillances du marché ?' },
  { niveau: 'Première', champ: 'eco', theme: 'Comment les agents économiques se financent-ils ?' },
  { niveau: 'Première', champ: 'eco', theme: "Qu'est-ce que la monnaie et comment est-elle créée ?" },
  { niveau: 'Première', champ: 'socio', theme: 'Comment la socialisation contribue-t-elle à expliquer les différences de comportement des individus ?' },
  { niveau: 'Première', champ: 'socio', theme: 'Comment se construisent et évoluent les liens sociaux ?' },
  { niveau: 'Première', champ: 'socio', theme: 'Quels processus sociaux contribuent à la déviance ?' },
  { niveau: 'Première', champ: 'socio', theme: "Comment se forme et s'exprime l'opinion publique ?" },
  { niveau: 'Première', champ: 'socio', theme: 'Voter : une affaire individuelle ou collective ?' },
  { niveau: 'Première', champ: 'rc', theme: "Comment l'assurance et la protection sociale contribuent-elles à la gestion des risques dans les sociétés développées ?" },
  { niveau: 'Première', champ: 'rc', theme: 'Comment les entreprises sont-elles organisées et gouvernées ?' },
  // ---- Terminale
  { niveau: 'Terminale', champ: 'eco', theme: 'Quels sont les sources et les défis de la croissance économique ?' },
  { niveau: 'Terminale', champ: 'eco', theme: "Quels sont les fondements du commerce international et de l'internationalisation de la production ?" },
  { niveau: 'Terminale', champ: 'eco', theme: 'Comment lutter contre le chômage ?' },
  { niveau: 'Terminale', champ: 'eco', theme: 'Comment expliquer les crises financières et réguler le système financier ?' },
  { niveau: 'Terminale', champ: 'eco', theme: 'Quelles politiques économiques dans le cadre européen ?' },
  { niveau: 'Terminale', champ: 'socio', theme: 'Comment est structurée la société française actuelle ?' },
  { niveau: 'Terminale', champ: 'socio', theme: "Quelle est l'action de l'École sur les destins individuels et sur l'évolution de la société ?" },
  { niveau: 'Terminale', champ: 'socio', theme: 'Quels sont les caractéristiques contemporaines et les facteurs de la mobilité sociale ?' },
  { niveau: 'Terminale', champ: 'socio', theme: "Quelles mutations du travail et de l'emploi ?" },
  { niveau: 'Terminale', champ: 'socio', theme: "Comment expliquer l'engagement politique dans les sociétés démocratiques ?" },
  { niveau: 'Terminale', champ: 'rc', theme: 'Quelles inégalités sont compatibles avec les différentes conceptions de la justice sociale ?' },
  { niveau: 'Terminale', champ: 'rc', theme: 'Comment les pouvoirs publics peuvent-ils prendre en charge les questions environnementales ?' },
];

export const NIVEAUX = ['Seconde', 'Première', 'Terminale'];
export const champLabel = (id) => CHAMPS.find((c) => c.id === id)?.label || id;
export const randomTheme = (filter = () => true) => {
  const list = PROGRAMME.filter(filter);
  return list[Math.floor(Math.random() * list.length)];
};
