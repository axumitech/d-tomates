import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../resources/js/pages/carnet.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('const rapport = () =>'), source.indexOf('  const rapportDetaille ='));
const context = {
  tachesServeur: [], zonesBureau: ['Module 1'], presence: [], NOM_BUREAU: 'Tomate', date: '2026-10-27',
  travaux: [{ zone: 'Module 1', tache: 'Taille / ébourgeonnage', qte: '1320', unite: 'plants',
    personnes: '5', heures: '4', par: 'MANDE DJUBA, Nowedi', coutMO: 39.78 }],
  engrais: [], alertesStock: 0, problemes: [], window: { location: { origin: 'https://example.test' } },
  usd: (value) => Number(value).toFixed(2), DEVISE: 'USD', courtNom: (name) => name,
};
const rapport = (overrides = {}) => vm.runInNewContext(`${handler}\nrapport();`, { ...context, ...overrides });

test('le rapport principal inclut le travail du carnet sans tâche serveur', () => {
  const text = rapport();
  assert.match(text, /Travaux saisis dans le carnet : 1/);
  assert.match(text, /Module 1 — Taille \/ ébourgeonnage — 1320 plants · 5 pers. × 4 h — MANDE DJUBA, Nowedi — 39.78 USD/);
  assert.match(text, /exécutées \/ validées : 0/);
});

test('les travaux restent visibles quand le suivi serveur est indisponible', () => {
  assert.match(rapport({ tachesServeur: null }), /1320 plants/);
});

test('une journée sans travail est indiquée et les anciens noms restent lisibles', () => {
  assert.match(rapport({ travaux: [] }), /Travaux saisis dans le carnet : 0/);
  assert.match(rapport({ travaux: [{ ...context.travaux[0], par: undefined, qui: 'Agent' }] }), /— Agent —/);
});

test('le manquement de fertilisation figure aussi dans le rapport principal', () => {
  assert.match(rapport({ engrais: [{ zone: 'Module 1', bac: 'Bac A', produitsManquants: 'Nitrate de potassium' }] }),
    /MANQUEMENT FERTILISATION — Module 1 — Bac A : Nitrate de potassium/);
});

test('les catégories distinguent validations, preuves, corrections et absence de déclaration', () => {
  const text = rapport({ tachesServeur: [
    { zone: 'Module 1', category: 'Conduite', status: 'done', work_date: '2026-10-27' },
    { zone: 'Module 1', category: 'Conduite', status: 'pending_review', work_date: '2026-10-27' },
    { zone: 'Module 1', category: 'Conduite', status: 'correction_requested', work_date: '2026-10-26' },
    { zone: 'Module 1', category: 'Irrigation', status: 'todo', work_date: '2026-10-27' },
    { zone: 'Module 1', status: 'justified', work_date: '2026-10-27' },
    { zone: 'Module 2', category: 'Conduite', status: 'done', work_date: '2026-10-27' },
  ] });
  assert.match(text, /Activités à suivre : 5 · exécutées \/ validées : 1 · à valider : 1 · à corriger : 1 · sans exécution déclarée : 2/);
  assert.match(text, /dont 1 des jours précédents/);
  assert.match(text, /Conduite : 1 sur 3 validées · 1 à valider · 1 à corriger · 0 sans exécution déclarée/);
  assert.match(text, /Irrigation : 0 sur 1 validées · 0 à valider · 0 à corriger · 1 sans exécution déclarée/);
  assert.match(text, /Autres : 0 sur 1 validées/);
});

test('le bilan présente les familles métier et leurs types en validées sur dues', () => {
  const task = (category, nom, status = 'todo') => ({ zone: 'Module 1', category, nom, status, work_date: '2026-10-27' });
  const text = rapport({ tachesServeur: [
    task('Phyto', 'Pulvérisation fongicide — vendredi soir', 'done'),
    task('Phyto', 'Drench fongicide du substrat', 'pending_review'),
    task('Phytosanitaire', 'Application herbicide'),
    task('Phyto', 'Application pesticide', 'done'),
    task('Fertigation', 'Fertigation — lundi', 'done'),
    task('Fertilisation', 'Foliaire potassium + calcium'),
    task('Entretien', 'Désherbage manuel'),
  ] });
  assert.match(text, /Phytosanitaire : 2 sur 4 validées/);
  assert.match(text, /  - Fongicides : 1 sur 2 validées · 1 à valider/);
  assert.match(text, /  - Herbicides : 0 sur 1 validées/);
  assert.match(text, /  - Pesticides : 1 sur 1 validées/);
  assert.match(text, /Fertilisation : 1 sur 2 validées/);
  assert.match(text, /  - Fertigation : 1 sur 1 validées/);
  assert.match(text, /Entretien : 0 sur 1 validées/);
  assert.match(text, /  - Désherbage manuel : 0 sur 1 validées/);
});
