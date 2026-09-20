import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeProblem,validateProblem,minimumPartSet,evaluateSolution,solve} from '../public/manavizadeh/solver.js';

const raw=JSON.parse(await readFile(new URL('../public/manavizadeh/verification-example.json',import.meta.url),'utf8'));

test('MPS, doğrulama ve türetilmiş ölçüler',()=>{
  const problem=normalizeProblem(raw);
  assert.deepEqual(validateProblem(problem),[]);
  assert.deepEqual(minimumPartSet(problem.models),['A','A','B']);
  const evaluated=evaluateSolution(problem,{assignment:[0,1,0,1],sequence:['A','B','A']});
  assert.equal(evaluated.gamma,7.5);
  assert.ok(Math.abs(evaluated.objectives.cycle-37.8)<1e-9);
  assert.ok(Math.abs(evaluated.objectives.waste-7.8)<1e-9);
  assert.equal(evaluated.objectives.overload,0);
  assert.equal(evaluated.feasible,true);
  assert.deepEqual(evaluated.stationTasks,[['1','3'],['2','4']]);
});

test('sezgisel sabit tohumla tekrarlanabilir ve dört aday üretir',async()=>{
  const problem=normalizeProblem(raw),params={...problem.search,iterations:800,seed:77};
  const first=await solve(problem,params),second=await solve(problem,params);
  assert.equal(first.candidates.length,4);
  assert.deepEqual(first.best.assignment,second.best.assignment);
  assert.deepEqual(first.best.sequence,second.best.sequence);
  assert.deepEqual(first.best.objectives,second.best.objectives);
});
