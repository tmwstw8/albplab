import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{evaluateSolution,filterSolutionPool,normalizeProblem,objective,solve,validateProblem}from'../public/albp/solver.js';

const raw=JSON.parse(await readFile(new URL('../public/kara/paper-example.json',import.meta.url),'utf8'));
const problem=normalizeProblem(raw);
const benchmarkProblem=normalizeProblem(JSON.parse(await readFile(new URL('../public/kara/default-problem.json',import.meta.url),'utf8')));

test('ALBP problem normalization and validation reuse Kara data',()=>{
  assert.deepEqual(validateProblem(problem),[]);
  assert.equal(problem.tasks.length,10);
  assert.equal(problem.models.length,3);
});

test('SA, GA and VNS produce a deterministic shared solution pool',async()=>{
  const params={algorithms:['SA','GA','VNS'],seed:73,iterations:180,saMaxIterations:180,saInner:10,gaPopulation:12,gaGenerations:8,vnsNeighbors:10,vnsKmax:3};
  const first=await solve(problem,params),second=await solve(problem,params);
  assert.deepEqual(first.runs.map(x=>x.algorithm),['SA','GA','VNS']);
  assert.ok(first.solutions.length>0);
  assert.deepEqual(first.best,second.best);
  assert.deepEqual(first.solutions.map(x=>[x.algorithm,x.solution.stationCount,x.solution.adw]),second.solutions.map(x=>[x.algorithm,x.solution.stationCount,x.solution.adw]));
});

test('all heuristics share assignment feasibility, sequence and objective calculations',async()=>{
  const result=await solve(problem,{algorithms:['SA','GA','VNS'],seed:71,iterations:80,saMaxIterations:80,saInner:5,gaPopulation:8,gaGenerations:4,vnsNeighbors:8});
  const expectedSequence=problem.models.flatMap(model=>Array(model.demand).fill(model.id)).sort();
  for(const {solution}of result.solutions){
    const checked=evaluateSolution(problem,solution.stations,solution.sequence);
    assert.deepEqual(solution,checked);
    assert.deepEqual([...solution.sequence].sort(),expectedSequence);
    assert.equal(solution.stations.flatMap(station=>[...station.forward,...station.backward]).length,problem.tasks.length);
    assert.ok(solution.precedenceFeasible);
    assert.equal(typeof objective(solution),'number');
  }
  for(const run of result.runs)for(const point of run.history){
    assert.ok(Number.isFinite(point.best));
    assert.ok(Number.isFinite(point.current));
  }
  const duplicated=result.solutions[0].solution.stations.map(station=>({forward:[...station.forward],backward:[...station.backward]}));
  duplicated[0].forward.push(duplicated[0].forward[0]);
  assert.equal(evaluateSolution(problem,duplicated,result.solutions[0].solution.sequence).precedenceFeasible,false);
});

test('solution pool filters feasibility, thresholds and Pareto dominance',async()=>{
  const result=await solve(problem,{algorithms:['SA'],seed:19,saMaxIterations:120,saInner:10});
  const feasible=filterSolutionPool(result.solutions,{feasibleOnly:true,maxOverload:0});
  assert.ok(feasible.length>0);
  assert.ok(feasible.every(x=>x.solution.feasible&&x.solution.overload<1e-9));
  const pareto=filterSolutionPool(result.solutions,{paretoOnly:true});
  assert.ok(pareto.length<=result.solutions.length);
  assert.equal(new Set(pareto.map(x=>JSON.stringify(x.solution.stations)+x.solution.sequence.join(','))).size,pareto.length);
});

test('solution pool can be filtered by heuristic before deduplication',async()=>{
  const result=await solve(problem,{algorithms:['SA','GA'],calculations:2,seed:29,saMaxIterations:30,gaPopulation:8,gaGenerations:3});
  const ga=filterSolutionPool(result.solutions,{algorithm:'GA'});
  assert.ok(ga.length>0);
  assert.ok(ga.every(x=>x.algorithm==='GA'));
});

test('large searches retain a bounded best-candidate pool for worker transfer',async()=>{
  const result=await solve(benchmarkProblem,{algorithms:['GA'],calculations:1,seed:37,gaPopulation:30,gaGenerations:20,poolLimit:100});
  assert.ok(result.solutions.length<=100);
  assert.ok(result.poolDropped>0);
  assert.equal(result.poolDropped,result.runs[0].poolDropped);
  assert.ok(result.solutions.some(entry=>entry.solution===result.best));
});

test('GA starts feasible with one task per station and reduces stations automatically',async()=>{
  const result=await solve(problem,{algorithms:['GA'],calculations:1,seed:19,gaPopulation:8,gaGenerations:5,gaBalanceCrossover:.5,gaSequenceCrossover:.1,gaBalanceMutation:.05,gaSequenceMutation:.01});
  assert.ok(result.runs[0].iterations>0&&result.runs[0].iterations<=5);
  assert.ok(result.runs[0].history.length>0);
  assert.equal(result.runs[0].solutions[0].iteration,0);
  assert.equal(result.runs[0].solutions[0].solution.stationCount,problem.tasks.length);
  assert.ok(result.runs[0].solutions[0].solution.feasible);
  assert.ok(result.runs[0].solutions.some(x=>x.solution.feasible&&x.solution.stationCount<problem.tasks.length));
});

test('front-side model phase uses the current number of back stations',()=>{
  const sequence=['A','B','A','B','C'],stations=problem.tasks.map(task=>({forward:[task.id],backward:[]}));
  const solution=evaluateSolution(problem,stations,sequence),byId=new Map(problem.tasks.map(task=>[task.id,task]));
  assert.equal(solution.backStationCount,0);
  for(let j=0;j<stations.length;j++)for(let r=0;r<sequence.length;r++){
    const model=sequence[((r-j+solution.backStationCount-2)%sequence.length+sequence.length)%sequence.length];
    assert.equal(solution.cycleLoads[j][r],byId.get(stations[j].forward[0]).times[model]);
  }
});

test('GA produces feasible results for the 21-task benchmark without a station count',async()=>{
  const benchmark=benchmarkProblem,result=await solve(benchmark,{algorithms:['GA'],calculations:1,seed:42,gaPopulation:8,gaGenerations:3});
  const feasible=filterSolutionPool(result.solutions,{algorithm:'GA',feasibleOnly:true,maxOverload:0});
  assert.ok(feasible.length>0);
  assert.ok(feasible.some(x=>x.solution.stationCount<benchmark.tasks.length));
});

test('VNS shared K-minus-one repair escapes the former 17-station plateau',async()=>{
  const result=await solve(benchmarkProblem,{algorithms:['VNS'],calculations:1,seed:73,iterations:12000,vnsLocalSearchAttempts:10,vnsStagnationLimit:300});
  const feasible=filterSolutionPool(result.solutions,{algorithm:'VNS',feasibleOnly:true,maxOverload:0});
  assert.ok(feasible.length>0);
  assert.ok(Math.min(...feasible.map(entry=>entry.solution.stationCount))<=14);
});

test('total calculation count is distributed in consecutive heuristic blocks',async()=>{
  const result=await solve(problem,{algorithms:['SA','GA','VNS'],calculations:5,seed:31,iterations:40,saMaxIterations:40,saInner:5,gaPopulation:8,gaGenerations:5,vnsNeighbors:5,p1:.7,p2:.5,p3:.5});
  assert.deepEqual(result.runs.map(x=>x.algorithm),['SA','SA','GA','GA','VNS']);
  assert.deepEqual(result.solutions.map(x=>x.run).filter((value,index,all)=>all.indexOf(value)===index),[1,2,3,4,5]);
});

test('Kara published warm start reproduces the four-station paper solution',async()=>{
  const result=await solve(problem,{algorithms:['SA'],calculations:1,seed:7,saMaxIterations:20,usePublishedBenchmark:true});
  assert.equal(result.best.stationCount,4);
  assert.equal(result.best.feasible,true);
  assert.deepEqual(result.best.sequence,['A','B','A','B','C']);
});
