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
