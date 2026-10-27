import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../resources/js/pages/carnet.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('const enregistrerEngrais ='), source.indexOf('  const enregistrerPhyto ='));

async function enregistrer(produits, manquants, horsPlan = false) {
  const result = { messages: [] };
  const context = {
    en: { produitsManquants: manquants, bac: 'Bac A', zone: 'Module 1' }, melangeE: produits,
    flash: (message) => result.messages.push(message), conflitBac: () => '', horsCalendrier: () => horsPlan,
    melangeAzote: false, cendreProche: null, nomArt: () => 'Nitrate de calcium',
    appliquerSorties: async (products) => { result.sorties = products; return 0; },
    majCumul: async () => {}, centreAuto: () => 'TOM', nomAgent: () => 'Agent', engrais: [],
    setEngrais: () => {}, sauver: (record) => { result.record = record; }, noter: () => {},
    usd: () => '0', DEVISE: 'USD', setEn: () => {}, vEn: {}, setMelangeE: () => {},
  };
  await vm.runInNewContext(`${handler}\nenregistrerEngrais();`, context);
  return result;
}

test('un apport partiel conserve le manquement et ne sort que les produits appliqués', async () => {
  const products = [{ articleId: 'ENG01', dose: '1 kg', qte: '1' }];
  const result = await enregistrer(products, ' Nitrate de potassium indisponible ');
  assert.equal(result.record.engrais[0].produitsManquants, 'Nitrate de potassium indisponible');
  assert.equal(result.sorties, products);
});

test('une rupture totale peut être signalée même hors calendrier sans sortie de stock', async () => {
  const result = await enregistrer([], 'Nitrate de potassium indisponible', true);
  assert.equal(result.record.engrais[0].produits.length, 0);
  assert.equal(result.sorties.length, 0);
});

test('une saisie vide reste refusée', async () => {
  const result = await enregistrer([], '   ');
  assert.equal(result.record, undefined);
  assert.equal(result.messages.length, 1);
});

test('un apport réel hors calendrier exige toujours une justification', async () => {
  const result = await enregistrer([{ articleId: 'ENG01' }], '', true);
  assert.equal(result.record, undefined);
  assert.match(result.messages[0], /hors calendrier/);
});
