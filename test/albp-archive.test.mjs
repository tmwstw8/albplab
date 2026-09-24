import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildPoolArchive,parsePoolArchive,poolArchiveBlob} from '../public/albp/archive.js';
import {normalizeProblem,solve} from '../public/albp/solver.js';

const raw=JSON.parse(await readFile(new URL('../public/kara/paper-example.json',import.meta.url),'utf8'));
const problem=normalizeProblem(raw);

test('solution pool archive restores runs, all candidates, chart and selected view',async()=>{
  const params={algorithms:['GA','VNS'],calculations:2,seed:17,gaPopulation:8,gaGenerations:3,iterations:25,vnsNeighbors:5};
  const history=[];
  const result=await solve(problem,params,event=>history.push(event.point));
  const view={filters:{fAlgorithm:'GA',fFeasible:true,fOverload:'0'},sort:{key:'adw',direction:'asc'},visibleLimit:40,selectedIndex:0,selectedCycle:1,traceTitle:'VNS yakınsaması · hesap 2'};
  const archive=buildPoolArchive({problem,params,result,history,view});
  const restored=parsePoolArchive(JSON.parse(await poolArchiveBlob(archive).text()));
  assert.equal(restored.result.runs.length,2);
  assert.equal(restored.result.solutions.length,result.solutions.length);
  assert.deepEqual(restored.history,history);
  assert.deepEqual(restored.view,view);
  assert.deepEqual(restored.result.solutions[0].solution.cycleLoads,result.solutions[0].solution.cycleLoads);
  assert.deepEqual(restored.result.runs.map(run=>run.history),result.runs.map(run=>run.history));
});

test('archive rejects unsupported files and invalid task assignments',async()=>{
  const result=await solve(problem,{algorithms:['GA'],calculations:1,gaPopulation:4,gaGenerations:1});
  const archive=buildPoolArchive({problem,params:{algorithms:['GA']},result,history:[],view:{selectedIndex:null}});
  assert.throws(()=>parsePoolArchive({...archive,version:3}),/Desteklenmeyen/);
  const corrupted=JSON.parse(JSON.stringify(archive));
  corrupted.entries[0][3][0][0].push(999);
  assert.throws(()=>parsePoolArchive(corrupted),/görev dizini/);
});

test('compact export streams a large pool without serializing the entire result twice',async()=>{
  const result=await solve(problem,{algorithms:['GA'],calculations:1,gaPopulation:4,gaGenerations:1});
  const entry=result.solutions[0];
  const large={...result,solutions:Array.from({length:50000},(_,iteration)=>({...entry,iteration}))};
  const archive=buildPoolArchive({problem,params:{algorithms:['GA']},result:large,history:[],view:{selectedIndex:null}});
  const blob=poolArchiveBlob(archive);
  const exported=JSON.parse(await blob.text());
  assert.equal(exported.entries.length,50000);
  assert.ok(blob.size<15_000_000);
});

test('previous version-1 archives remain importable',async()=>{
  const legacy=JSON.parse(await readFile(new URL('./fixtures/albp-import.json',import.meta.url),'utf8'));
  const restored=parsePoolArchive(legacy);
  assert.equal(restored.result.solutions.length,1);
  assert.equal(restored.history.length,2);
});
