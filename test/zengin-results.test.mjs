import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultsExport, matchesPublishedReference, paginateResults, parseResultsExport } from '../public/zengin/results.js';

const problem = {
  name: 'Round-trip', cycleTime: 10,
  models: [{ id: 'A', demand: 1 }],
  tasks: [{ id: '1', predecessors: [], times: { A: 5 } }]
};
const run = {
  id: 1, seed: 77, seedSource: 'fixed', runParams: { seed: 77, T0: 1000 },
  result: { best: { stations: [{ forward: ['1'], backward: [] }] }, history: [], iterations: 10 }
};

test('sonuç dışa/içe aktarma şeması seed ayrıntılarını korur', () => {
  const exported = createResultsExport({ problem, parameters: { T0: 1000 }, runs: [run], exportedAt: '2026-09-21T00:00:00.000Z' });
  const parsed = parseResultsExport(JSON.parse(JSON.stringify(exported)));
  assert.equal(parsed.schema, 'zengin-results-v1');
  assert.equal(parsed.runs[0].seed, 77);
  assert.equal(parsed.runs[0].seedSource, 'fixed');
  assert.equal(parsed.runs[0].runParams.T0, 1000);
});

test('sonuç listesi ilk 15 kaydı gösterir ve kalanı sayar', () => {
  const items = Array.from({ length: 31 }, (_, id) => ({ id: id + 1 }));
  const first = paginateResults(items, 15), second = paginateResults(items, 30);
  assert.equal(first.visible.length, 15);
  assert.equal(first.remaining, 16);
  assert.equal(second.visible.length, 30);
  assert.equal(second.remaining, 1);
});

test('makaledeki ADW 41.60 çözümü station ve döngüsel sequence eşleşince işaretlenir', () => {
  const published = {
    problem: { name: 'Kara et al. (2006) illustrative example' },
    result: { best: {
      adw: 41.599999999999994,
      sequence: ['A', 'B', 'A', 'B', 'C'],
      stations: [
        { forward: ['1'], backward: ['8'] },
        { forward: ['4', '5'], backward: ['10'] },
        { forward: ['2', '6'], backward: ['9'] },
        { forward: ['3', '7'], backward: [] }
      ]
    } }
  };
  assert.equal(matchesPublishedReference(published), true);
  assert.equal(matchesPublishedReference({ ...published, result: { best: { ...published.result.best, sequence: ['B', 'A', 'B', 'C', 'A'] } } }), true);
  assert.equal(matchesPublishedReference({ ...published, result: { best: { ...published.result.best, sequence: ['A', 'B', 'C', 'A', 'B'] } } }), true);
  assert.equal(matchesPublishedReference({ ...published, result: { best: { ...published.result.best, sequence: ['A', 'A', 'B', 'B', 'C'] } } }), false);
  assert.equal(matchesPublishedReference({ ...published, result: { best: { ...published.result.best, stations: published.result.best.stations.toReversed() } } }), false);
});
