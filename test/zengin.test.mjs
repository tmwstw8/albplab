import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { anneal, evaluateSolution, normalizeProblem, validateProblem } from '../public/zengin/solver.js';

test('crossover quantity ve quality doğru hesaplanır', () => {
  const problem = normalizeProblem({
    cycleTime: 30,
    models: [{ id: 'A', demand: 1 }],
    tasks: [
      { id: '1', predecessors: [], times: { A: 15 } },
      { id: '2', predecessors: [], times: { A: 5 } },
      { id: '3', predecessors: [], times: { A: 10 } },
      { id: '4', predecessors: [], times: { A: 10 } }
    ]
  });
  const result = evaluateSolution(problem, [
    { forward: ['1'], backward: ['2'] },
    { forward: ['3'], backward: ['4'] }
  ], ['A']);

  assert.equal(result.crossoverQuantity, 2);
  assert.equal(result.stationMetrics[0].quality, 0.5);
  assert.equal(result.stationMetrics[1].quality, 1);
  assert.equal(result.crossoverQualityTotal, 1.5);
  assert.equal(result.crossoverQualityAvg, 0.75);
  assert.equal(result.crossoverFbad, 10);
});

test('MPS ortalaması ile cycle bazlı ön/arka yükler ayrı tutulur', () => {
  const problem = normalizeProblem({
    cycleTime: 40,
    models: [{ id: 'A', demand: 1 }, { id: 'B', demand: 1 }],
    tasks: [
      { id: '1', predecessors: [], times: { A: 10, B: 20 } },
      { id: '2', predecessors: [], times: { A: 5, B: 20 } }
    ]
  });
  const result = evaluateSolution(problem, [{ forward: ['1'], backward: ['2'] }], ['A', 'B']);
  assert.equal(result.stationMetrics[0].forwardLoad, 15);
  assert.equal(result.stationMetrics[0].backwardLoad, 12.5);
  assert.deepEqual(result.cycleSideLoads[0].map(x => [x.forwardModel, x.backwardModel, x.forwardLoad, x.backwardLoad]), [
    ['B', 'A', 20, 5],
    ['A', 'B', 10, 20]
  ]);
  assert.equal(result.cycleSideLoads[0][0].quality, 0.4);
  assert.ok(Math.abs(result.cycleSideLoads[0][1].quality - 2 / 3) < 1e-12);
});

test('Zengin SA sabit tohumla tekrarlanabilir ve geçerli çözüm üretir', async () => {
  const raw = JSON.parse(await readFile(new URL('../public/zengin/paper-example.json', import.meta.url), 'utf8'));
  const problem = normalizeProblem(raw);
  assert.deepEqual(validateProblem(problem), []);
  const params = { ...problem.saParams, maxIterations: 2500, seed: 77, quantityWeight: 100, qualityWeight: 50, adwWeight: 0.05, sideFlipProbability: 0.35 };
  const first = await anneal(problem, params, () => {});
  const second = await anneal(problem, params, () => {});
  assert.equal(first.best.feasible, true);
  assert.deepEqual(first.best.stations, second.best.stations);
  assert.equal(first.best.crossoverQuantity, second.best.crossoverQuantity);
  assert.equal(first.best.crossoverQualityTotal, second.best.crossoverQualityTotal);
  assert.equal(first.objectiveValue, params.quantityWeight * first.best.crossoverQuantity + params.qualityWeight * first.best.crossoverQualityTotal - params.adwWeight * first.best.adw);
});
