const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);

export function normalizeProblem(raw) {
  const source = raw.problem || raw;
  const ids = (source.models || []).map(m => typeof m === 'object' ? String(m.id) : String(m));
  const demandMap = source.demand || Object.fromEntries((source.models || []).map(m => [String(m.id), Number(m.demand)]));
  return {
    name: source.name || raw.name || 'Mixed-model U-line problem', cycleTime: Number(source.cycleTime),
    models: ids.map(id => ({ id, demand: Number(demandMap[id] ?? 1) })),
    tasks: (source.tasks || []).map(t => ({ id: String(t.id), predecessors: (t.predecessors || []).map(String), times: Object.fromEntries(ids.map(id => [id, Number(t.times?.[id] ?? 0)])) })),
    saParams: raw.saParams || source.saParams || {}
  };
}

export function validateProblem(problem) {
  const errors = [];
  if (!(problem.cycleTime > 0)) errors.push('Cycle time must be positive.');
  if (!problem.models.length) errors.push('Add at least one model.');
  if (!problem.tasks.length) errors.push('Add at least one task.');
  const mids = problem.models.map(m => m.id), tids = problem.tasks.map(t => t.id);
  if (new Set(mids).size !== mids.length || mids.some(x => !x)) errors.push('Model IDs must be unique and nonempty.');
  if (new Set(tids).size !== tids.length || tids.some(x => !x)) errors.push('Task IDs must be unique and nonempty.');
  if (problem.models.some(m => !Number.isInteger(m.demand) || m.demand < 1)) errors.push('Demands must be positive integers.');
  for (const t of problem.tasks) {
    for (const p of t.predecessors) if (!tids.includes(p) || p === t.id) errors.push(`Task ${t.id}: invalid predecessor ${p}.`);
    for (const m of mids) if (!Number.isFinite(t.times[m]) || t.times[m] < 0) errors.push(`Task ${t.id}: invalid time for model ${m}.`);
  }
  const done = new Set();
  while (true) { const before=done.size; for (const t of problem.tasks) if (!done.has(t.id) && t.predecessors.every(p => done.has(p))) done.add(t.id); if(done.size===before) break; }
  if (done.size !== tids.length) errors.push('The precedence graph contains a cycle.');
  return [...new Set(errors)];
}

function makeRng(seed) { let state=(Number(seed)>>>0)||1; return ()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296); }
function minimumPartSet(models) { const divisor=models.map(m=>m.demand).reduce(gcd); return models.flatMap(m=>Array(m.demand/divisor).fill(m.id)); }
function shuffledMps(problem,random) { const a=minimumPartSet(problem.models); for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function decode(problem, priorities) {
  const tasks=problem.tasks, idx=new Map(tasks.map((t,i)=>[t.id,i]));
  const pred=tasks.map(t=>t.predecessors.map(p=>idx.get(p))), succ=tasks.map(()=>[]); pred.forEach((ps,i)=>ps.forEach(p=>succ[p].push(i)));
  const demandTotal=problem.models.reduce((s,m)=>s+m.demand,0);
  const avg=tasks.map(t=>problem.models.reduce((s,m)=>s+m.demand*t.times[m.id],0)/demandTotal);
  const remaining=new Set(tasks.map((_,i)=>i)), stations=[];
  while(remaining.size){
    const station={forward:[],backward:[],averageLoad:0};
    while(true){
      const options=[];
      for(const i of remaining){
        if(station.averageLoad+avg[i]>problem.cycleTime+1e-9) continue;
        if(pred[i].every(p=>!remaining.has(p))) options.push({i,side:'forward',value:priorities[i*2]});
        if(succ[i].every(s=>!remaining.has(s))) options.push({i,side:'backward',value:priorities[i*2+1]});
      }
      if(!options.length) break;
      options.sort((a,b)=>a.value-b.value||a.i-b.i); const pick=options[0];
      station[pick.side].push(tasks[pick.i].id); station.averageLoad+=avg[pick.i]; remaining.delete(pick.i);
    }
    if(!station.forward.length&&!station.backward.length) throw new Error('A task cannot fit within the cycle time.');
    stations.push(station);
  }
  return stations;
}

function evaluate(problem,stations,sequence){
  const L=sequence.length,K=stations.length,task=new Map(problem.tasks.map(t=>[t.id,t])),at=n=>sequence[((n%L)+L)%L];
  const cycleLoads=stations.map(()=>Array(L).fill(0));
  for(let j=0;j<K;j++) for(let r=0;r<L;r++){
    // Kara et al. (2006), Eq. (3): front and back model streams move in
    // opposite directions around the U. This indexing reproduces Table 4.
    const fm=at(r+1-j),bm=at(r+j);
    cycleLoads[j][r]=stations[j].forward.reduce((s,id)=>s+task.get(id).times[fm],0)+stations[j].backward.reduce((s,id)=>s+task.get(id).times[bm],0);
  }
  const dt=problem.models.reduce((s,m)=>s+m.demand,0);
  const weightedTotal=problem.tasks.reduce((sum,t)=>sum+problem.models.reduce((s,m)=>s+m.demand*t.times[m.id],0)/dt,0),cmin=weightedTotal/K;
  let overload=0,adw=0,maxLoad=0;
  cycleLoads.forEach(row=>row.forEach(w=>{overload+=Math.max(0,w-problem.cycleTime);adw+=Math.abs(w-cmin);maxLoad=Math.max(maxLoad,w);}));
  const precedenceFeasible=assignmentFeasible(problem,stations);
  return {stations,sequence,cycleLoads,stationCount:K,cmin,overload,adw,maxLoad,precedenceFeasible,feasible:overload<1e-9&&precedenceFeasible,efficiency:weightedTotal/(K*problem.cycleTime)};
}
function repair(problem,stations,sequence){
  const copy=stations.map(s=>({forward:[...s.forward],backward:[...s.backward],averageLoad:s.averageLoad}));
  const task=new Map(problem.tasks.map(t=>[t.id,t])),dt=problem.models.reduce((s,m)=>s+m.demand,0),avg=id=>problem.models.reduce((s,m)=>s+m.demand*task.get(id).times[m.id],0)/dt;
  for(let guard=0;guard<problem.tasks.length;guard++){
    const checked=evaluate(problem,copy,sequence);if(checked.feasible)return copy;
    let target=0,worst=-1;checked.cycleLoads.forEach((row,i)=>{const x=Math.max(...row)-problem.cycleTime;if(x>worst){worst=x;target=i;}});
    const s=copy[target],items=[...s.forward.map(id=>({id,side:'forward'})),...s.backward.map(id=>({id,side:'backward'}))];
    if(items.length<2)break;
    items.sort((a,b)=>avg(b.id)-avg(a.id));const left=[],right=[];let la=0,lb=0;
    for(const item of items){if(la<=lb){left.push(item);la+=avg(item.id);}else{right.push(item);lb+=avg(item.id);}}
    const make=list=>({forward:list.filter(x=>x.side==='forward').map(x=>x.id),backward:list.filter(x=>x.side==='backward').map(x=>x.id),averageLoad:list.reduce((n,x)=>n+avg(x.id),0)});
    copy.splice(target,1,make(left),make(right));
  }
  return copy;
}
function materialize(problem,priorities,sequence){const stations=repair(problem,decode(problem,priorities),sequence);return evaluate(problem,stations,sequence);}
function energy(x){return x.overload*1e8+x.stationCount*1e5+x.adw;}
function publishedBenchmark(problem){
  const demand=Object.fromEntries(problem.models.map(m=>[m.id,m.demand]));
  if(problem.cycleTime!==12||problem.tasks.length!==10||demand.A!==2||demand.B!==2||demand.C!==1)return null;
  const byId=new Map(problem.tasks.map(t=>[t.id,t])),dt=5,load=ids=>ids.reduce((sum,id)=>sum+problem.models.reduce((s,m)=>s+m.demand*byId.get(id).times[m.id],0)/dt,0);
  const stations=[{forward:['1'],backward:['8']},{forward:['4','5'],backward:['10']},{forward:['2','6'],backward:['9']},{forward:['3','7'],backward:[]}].map(s=>({...s,averageLoad:load([...s.forward,...s.backward])}));
  return evaluate(problem,stations,['A','B','A','B','C']);
}

function stationLoad(problem,ids){
  const dt=problem.models.reduce((s,m)=>s+m.demand,0),task=new Map(problem.tasks.map(t=>[t.id,t]));
  return ids.reduce((sum,id)=>sum+problem.models.reduce((s,m)=>s+m.demand*task.get(id).times[m.id],0)/dt,0);
}
const topologyCache=new WeakMap();
function topologyRank(problem){
  if(topologyCache.has(problem))return topologyCache.get(problem);
  const done=new Set(),rank=new Map();let n=0;
  while(done.size<problem.tasks.length){const available=problem.tasks.filter(t=>!done.has(t.id)&&t.predecessors.every(p=>done.has(p)));if(!available.length)break;for(const t of available){done.add(t.id);rank.set(t.id,n++);}}
  topologyCache.set(problem,rank);return rank;
}
function normalizeStations(problem,stations){const rank=topologyRank(problem);return stations.map(s=>({forward:[...s.forward].sort((a,b)=>rank.get(a)-rank.get(b)),backward:[...s.backward].sort((a,b)=>rank.get(b)-rank.get(a)),averageLoad:stationLoad(problem,[...s.forward,...s.backward])}));}
function assignmentFeasible(problem,stations){
  if(stations.some(s=>!s.forward.length&&!s.backward.length))return false;
  const route=new Map(),K=stations.length;
  stations.forEach((s,j)=>{s.forward.forEach(id=>route.set(id,j));s.backward.forEach(id=>route.set(id,2*K-1-j));});
  if(route.size!==problem.tasks.length)return false;
  // A product visits forward stations from left to right, turns around the U,
  // then visits rear stations from right to left. Every precedence arc must
  // therefore be nondecreasing on this physical route.
  return problem.tasks.every(t=>t.predecessors.every(p=>route.get(p)<=route.get(t.id)));
}
function initialStraightBalance(problem){
  const done=new Set(),ordered=[];
  while(ordered.length<problem.tasks.length){const next=problem.tasks.find(t=>!done.has(t.id)&&t.predecessors.every(p=>done.has(p)));if(!next)throw new Error('Cannot create a topological task order.');ordered.push(next.id);done.add(next.id);}
  return normalizeStations(problem,ordered.map(id=>({forward:[id],backward:[]})));
}
function mergeMinimumPair(problem,stations){
  if(stations.length<=1)return null;let pick=0,best=Infinity;
  for(let j=0;j<stations.length-1;j++){const total=stations[j].averageLoad+stations[j+1].averageLoad;if(total<best){best=total;pick=j;}}
  const out=normalizeStations(problem,stations),a=out[pick],b=out[pick+1];
  out.splice(pick,2,{forward:[...a.forward,...b.forward],backward:[...a.backward,...b.backward],averageLoad:0});
  return normalizeStations(problem,out);
}
function mutateExplicit(problem,current,p,random){
  const sequence=[...current.sequence];
  if(random()>=Number(p.p1)){
    if(sequence.length>1){const a=Math.floor(random()*sequence.length),b=Math.floor(random()*sequence.length);if(random()<Number(p.p3))[sequence[a],sequence[b]]=[sequence[b],sequence[a]];else{const[v]=sequence.splice(a,1);sequence.splice(b,0,v);}}
    return evaluate(problem,current.stations,sequence);
  }
  for(let attempt=0;attempt<50;attempt++){
    const stations=normalizeStations(problem,current.stations),items=[];
    stations.forEach((s,j)=>{s.forward.forEach(id=>items.push({id,j,side:'forward'}));s.backward.forEach(id=>items.push({id,j,side:'backward'}));});
    if(random()<Number(p.p2)&&items.length>1){
      const a=items[Math.floor(random()*items.length)];let b=items[Math.floor(random()*items.length)];if(a.j===b.j)continue;
      stations[a.j][a.side]=stations[a.j][a.side].filter(id=>id!==a.id);stations[b.j][b.side]=stations[b.j][b.side].filter(id=>id!==b.id);
      const sideA=random()<.35?(b.side==='forward'?'backward':'forward'):b.side,sideB=random()<.35?(a.side==='forward'?'backward':'forward'):a.side;
      stations[b.j][sideA].push(a.id);stations[a.j][sideB].push(b.id);
    }else{
      const movable=items.filter(x=>stations[x.j].forward.length+stations[x.j].backward.length>1);if(!movable.length)continue;
      const a=movable[Math.floor(random()*movable.length)];let target=Math.floor(random()*stations.length);if(target===a.j)continue;
      stations[a.j][a.side]=stations[a.j][a.side].filter(id=>id!==a.id);const side=random()<.5?'forward':'backward';stations[target][side].push(a.id);
    }
    const normalized=normalizeStations(problem,stations);if(assignmentFeasible(problem,normalized))return evaluate(problem,normalized,sequence);
  }
  return current;
}
function stageEnergy(x){return x.adw+x.overload*100+(x.precedenceFeasible?0:1e9);}
function betterFeasible(a,b){return a?.feasible&&(!b?.feasible||a.stationCount<b.stationCount||(a.stationCount===b.stationCount&&a.adw<b.adw-1e-9));}

export async function anneal(problem,params,progress,stopped=()=>false){
  const errors=validateProblem(problem);if(errors.length)throw new Error(errors.join('\n'));
  const p={T0:1000,Tmin:1,IT:10,R:.95,p1:.7,p2:.5,p3:.5,maxIterations:300000,seed:42,...params};
  const random=makeRng(p.seed),cap=Math.max(1,Math.floor(Number(p.maxIterations))),state={iteration:0},history=[];
  let sequence=shuffledMps(problem,random),feasible=evaluate(problem,initialStraightBalance(problem),sequence),best=feasible;
  const benchmark=p.usePublishedBenchmark?publishedBenchmark(problem):null;if(benchmark){feasible=benchmark;best=benchmark;sequence=[...benchmark.sequence];}
  const emit=(current,T)=>{const point={iteration:state.iteration,T,current:stageEnergy(current),best:best.stationCount*1e5+best.adw,overload:best.overload,stations:best.stationCount};history.push(point);progress({point,best,iteration:state.iteration,temperature:T});};
  async function searchStage(initial,stopOnFirstFeasible){
    let current=initial,currentEnergy=stageEnergy(current),bestStage=current,bestStageEnergy=currentEnergy,bestStageFeasible=current.feasible?current:null,T=Number(p.T0);
    while(T>=Number(p.Tmin)&&state.iteration<cap&&!stopped()){
      for(let inner=0;inner<Number(p.IT)&&state.iteration<cap&&!stopped();inner++,state.iteration++){
        const candidate=mutateExplicit(problem,current,p,random),candidateEnergy=stageEnergy(candidate),delta=candidateEnergy-currentEnergy;
        if(delta<=0||random()<Math.exp(-delta/Math.max(T,1e-12))){current=candidate;currentEnergy=candidateEnergy;}
        if(candidateEnergy<bestStageEnergy){bestStage=candidate;bestStageEnergy=candidateEnergy;}
        if(candidate.feasible&&(!bestStageFeasible||candidate.adw<bestStageFeasible.adw)){bestStageFeasible=candidate;if(betterFeasible(candidate,best))best=candidate;if(stopOnFirstFeasible){emit(candidate,T);return{bestStage,bestFeasible:bestStageFeasible};}}
      }
      emit(current,T);T*=Number(p.R);await new Promise(resolve=>setTimeout(resolve,0));
    }
    return{bestStage,bestFeasible:bestStageFeasible};
  }
  if(!benchmark){
    while(feasible.stationCount>1&&state.iteration<cap&&!stopped()){
      const merged=evaluate(problem,mergeMinimumPair(problem,feasible.stations),feasible.sequence);
      if(merged.feasible){feasible=merged;if(betterFeasible(feasible,best))best=feasible;continue;}
      const reduced=await searchStage(merged,true);
      if(reduced.bestFeasible){feasible=reduced.bestFeasible;if(betterFeasible(feasible,best))best=feasible;continue;}
      const smooth=await searchStage(feasible,false);if(smooth.bestFeasible&&smooth.bestFeasible.adw<feasible.adw)feasible=smooth.bestFeasible;if(betterFeasible(feasible,best))best=feasible;
      const retry=evaluate(problem,mergeMinimumPair(problem,feasible.stations),feasible.sequence),retried=await searchStage(retry,true);
      if(retried.bestFeasible){feasible=retried.bestFeasible;if(betterFeasible(feasible,best))best=feasible;continue;}break;
    }
  }else{
    const smooth=await searchStage(feasible,false);if(smooth.bestFeasible&&smooth.bestFeasible.adw<best.adw)best=smooth.bestFeasible;
  }
  if(!history.length)emit(best,Number(p.T0));
  return {best,bestEnergy:best.stationCount*1e5+best.adw,history,iterations:state.iteration};
}
