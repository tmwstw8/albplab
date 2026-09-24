import { normalizeProblem, validateProblem } from './solver.js';

export const RESULTS_SCHEMA = 'zengin-results-v1';

export const KARA_PUBLISHED_REFERENCE = Object.freeze({
  problemName: 'Kara et al. (2006) illustrative example',
  adw: 41.6,
  sequence: ['A', 'B', 'A', 'B', 'C'],
  stations: [
    { forward: ['1'], backward: ['8'] },
    { forward: ['4', '5'], backward: ['10'] },
    { forward: ['2', '6'], backward: ['9'] },
    { forward: ['3', '7'], backward: [] }
  ]
});

function sameList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => String(value) === expected[index]);
}

function sameCyclicSequence(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length || !expected.length) return false;
  return expected.some((_, offset) => actual.every((value, index) => String(value) === expected[(index + offset) % expected.length]));
}

export function matchesPublishedReference(run) {
  const best = run?.result?.best, problemName = run?.problem?.name;
  if (problemName !== KARA_PUBLISHED_REFERENCE.problemName || !best || Math.abs(Number(best.adw) - KARA_PUBLISHED_REFERENCE.adw) > 1e-6) return false;
  if (!sameCyclicSequence(best.sequence, KARA_PUBLISHED_REFERENCE.sequence) || !Array.isArray(best.stations) || best.stations.length !== KARA_PUBLISHED_REFERENCE.stations.length) return false;
  return best.stations.every((station, index) => sameList(station.forward, KARA_PUBLISHED_REFERENCE.stations[index].forward) && sameList(station.backward, KARA_PUBLISHED_REFERENCE.stations[index].backward));
}

export function createResultsExport({ problem, parameters, runs, exportedAt = new Date().toISOString() }) {
  if (!Array.isArray(runs)) throw new Error('Runs must be an array.');
  return { schema: RESULTS_SCHEMA, exportedAt, problem, parameters, runs };
}

export function parseResultsExport(data) {
  if (data?.schema !== RESULTS_SCHEMA) throw new Error(`Desteklenmeyen sonuç dosyası: schema ${RESULTS_SCHEMA} olmalıdır.`);
  if (!data.problem || !Array.isArray(data.runs)) throw new Error('Sonuç dosyasında problem veya runs alanı eksik.');
  const problem = normalizeProblem(data.problem), errors = validateProblem(problem);
  if (errors.length) throw new Error(errors.join('\n'));
  for (const [index, run] of data.runs.entries()) {
    if (!run?.result?.best?.stations || !Array.isArray(run.result.history)) throw new Error(`Koşu ${index + 1} geçerli bir Zengin sonucu değil.`);
  }
  return { ...data, problem };
}

export function paginateResults(items, visibleCount = 15) {
  const limit = Math.max(0, Math.floor(Number(visibleCount) || 0));
  const visible = items.slice(0, limit);
  return { visible, remaining: Math.max(0, items.length - visible.length) };
}
