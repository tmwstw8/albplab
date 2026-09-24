const gcd=(a,b)=>b?gcd(b,a%b):Math.abs(a);
const problemCache=new WeakMap(),detailCache=new WeakMap();

function derived(problem){
  let value=problemCache.get(problem);if(value)return value;
  const taskMap=new Map(problem.tasks.map(task=>[task.id,task])),taskIds=problem.tasks.map(task=>task.id),taskIdSet=new Set(taskIds),successors=new Map(taskIds.map(id=>[id,[]]));
  for(const task of problem.tasks)for(const predecessor of task.predecessors)successors.get(predecessor)?.push(task.id);
  const done=new Set(),topology=[];while(topology.length<problem.tasks.length){const available=problem.tasks.filter(task=>!done.has(task.id)&&task.predecessors.every(id=>done.has(id)));if(!available.length)throw new Error('Cannot create a topological task order.');for(const task of available){done.add(task.id);topology.push(task.id);}}
  const topologyRank=new Map(topology.map((id,index)=>[id,index])),totalDemand=problem.models.reduce((sum,model)=>sum+model.demand,0),averageLoad=new Map();let weightedTotal=0;
  for(const task of problem.tasks){const load=problem.models.reduce((sum,model)=>sum+model.demand*task.times[model.id],0)/totalDemand;averageLoad.set(task.id,load);weightedTotal+=load;}
  value={taskMap,taskIds,taskIdSet,successors,topology,topologyRank,totalDemand,averageLoad,weightedTotal};problemCache.set(problem,value);return value;
}

export function normalizeProblem(raw){
  const source=raw.problem||raw;
  const ids=(source.models||[]).map(m=>String(typeof m==='object'?m.id:m));
  const demand=source.demand||Object.fromEntries((source.models||[]).map(m=>[String(m.id),Number(m.demand)]));
  return{name:source.name||raw.name||'Mixed-model U-line problem',cycleTime:Number(source.cycleTime),models:ids.map(id=>({id,demand:Number(demand[id]??1)})),tasks:(source.tasks||[]).map(t=>({id:String(t.id),predecessors:(t.predecessors||[]).map(String),times:Object.fromEntries(ids.map(id=>[id,Number(t.times?.[id]??0)]))})),searchParams:raw.searchParams||source.searchParams||raw.saParams||source.saParams||{}};
}

export function validateProblem(problem){
  const errors=[];
  if(!(problem.cycleTime>0))errors.push('Cycle time must be positive.');
  if(!problem.models.length)errors.push('Add at least one model.');
  if(!problem.tasks.length)errors.push('Add at least one task.');
  const mids=problem.models.map(m=>m.id),tids=problem.tasks.map(t=>t.id);
  if(new Set(mids).size!==mids.length||mids.some(x=>!x))errors.push('Model IDs must be unique and nonempty.');
  if(new Set(tids).size!==tids.length||tids.some(x=>!x))errors.push('Task IDs must be unique and nonempty.');
  if(problem.models.some(m=>!Number.isInteger(m.demand)||m.demand<1))errors.push('Demands must be positive integers.');
  for(const t of problem.tasks){for(const p of t.predecessors)if(!tids.includes(p)||p===t.id)errors.push(`Task ${t.id}: invalid predecessor ${p}.`);for(const m of mids)if(!Number.isFinite(t.times[m])||t.times[m]<0)errors.push(`Task ${t.id}: invalid time for model ${m}.`);}
  const done=new Set();while(true){const before=done.size;for(const t of problem.tasks)if(!done.has(t.id)&&t.predecessors.every(p=>done.has(p)))done.add(t.id);if(done.size===before)break;}
  if(done.size!==tids.length)errors.push('The precedence graph contains a cycle.');
  return[...new Set(errors)];
}

function makeRng(seed){let state=(Number(seed)>>>0)||1;return()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);}
function minimumPartSet(models){const divisor=models.map(m=>m.demand).reduce(gcd);return models.flatMap(m=>Array(m.demand/divisor).fill(m.id));}
function shuffle(values,random){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function assignmentFeasible(problem,stations){
  const route=new Map(),known=derived(problem).taskIdSet,K=stations.length;
  for(let j=0;j<K;j++)for(const [side,position] of [['forward',j],['backward',2*K-1-j]])for(const id of stations[j][side]){
    if(!known.has(id)||route.has(id))return false;
    route.set(id,position);
  }
  return route.size===problem.tasks.length&&problem.tasks.every(t=>t.predecessors.every(p=>route.get(p)<=route.get(t.id)));
}
function evaluateCandidate(problem,stations,sequence,includeMatrix=false){
  const cache=derived(problem),L=sequence.length,K=stations.length,task=cache.taskMap,at=n=>sequence[((n%L)+L)%L],cycleLoads=includeMatrix?stations.map(()=>Array(L).fill(0)):null;
  const backStationCount=stations.filter(station=>station.backward.length>0).length;
  const cmin=cache.weightedTotal/K;let overload=0,adw=0,maxLoad=0;
  for(let j=0;j<K;j++)for(let r=0;r<L;r++){const fm=at(r-j+backStationCount-2),bm=at(r+j),load=stations[j].forward.reduce((sum,id)=>sum+task.get(id).times[fm],0)+stations[j].backward.reduce((sum,id)=>sum+task.get(id).times[bm],0);if(cycleLoads)cycleLoads[j][r]=load;overload+=Math.max(0,load-problem.cycleTime);adw+=Math.abs(load-cmin);maxLoad=Math.max(maxLoad,load);}
  const precedenceFeasible=assignmentFeasible(problem,stations),result={stations,sequence,stationCount:K,backStationCount,cmin,overload,adw,maxLoad,precedenceFeasible,feasible:overload<1e-9&&precedenceFeasible,efficiency:cache.weightedTotal/(K*problem.cycleTime)};if(cycleLoads)result.cycleLoads=cycleLoads;return result;
}
export function evaluateSolution(problem,stations,sequence){return evaluateCandidate(problem,stations,sequence,true);}
function detailedSolution(problem,solution){if(solution.cycleLoads)return solution;let detailed=detailCache.get(solution);if(!detailed){detailed=evaluateSolution(problem,solution.stations,solution.sequence);detailCache.set(solution,detailed);}return detailed;}

export function objective(x){return(x.feasible?0:1e12)+(x.precedenceFeasible?0:1e12)+x.stationCount*1e6+x.adw;}
function searchCost(solution,p){return solution.adw+(p.penaltyEnabled?Math.max(0,Number(p.penaltyLambda)||0)*solution.overload:0);}
function better(a,b){return!b||objective(a)<objective(b)-1e-9;}
export function solutionKey(x){return`${x.stations.map(s=>`${s.forward.join(',')}>${s.backward.join(',')}`).join('|')}::${x.sequence.join(',')}`;}
function collector(problem,algorithm,run,limit=2000){
  const map=new Map();let dropped=0;
  const trim=()=>{if(map.size<=limit)return;const keep=[...map.entries()].sort((a,b)=>objective(a[1].solution)-objective(b[1].solution)||a[1].iteration-b[1].iteration).slice(0,limit);dropped+=map.size-keep.length;map.clear();for(const [key,value]of keep)map.set(key,value);};
  return{add(solution,iteration){const full=detailedSolution(problem,solution),key=solutionKey(full),old=map.get(key);if(!old||better(full,old.solution))map.set(key,{algorithm,run,iteration,solution:full});if(map.size>limit+Math.max(25,Math.ceil(limit*.1)))trim();},values(){trim();return[...map.values()];},dropped(){return dropped;}};
}
function point(iteration,best,current,phase){return{iteration,T:phase,current:objective(current),best:objective(best),overload:best.overload,stations:best.stationCount};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function topologicalOrder(problem){return derived(problem).topology;}
function topologyRank(problem){return derived(problem).topologyRank;}
function normalizeStations(problem,stations){const rank=topologyRank(problem),loads=derived(problem).averageLoad;return stations.map(s=>({forward:[...s.forward].sort((a,b)=>rank.get(a)-rank.get(b)),backward:[...s.backward].sort((a,b)=>rank.get(b)-rank.get(a)),averageLoad:[...s.forward,...s.backward].reduce((sum,id)=>sum+loads.get(id),0)}));}
function candidateFromStations(problem,stations,sequence){return evaluateCandidate(problem,normalizeStations(problem,stations),sequence);}
function canonicalStations(problem,stations,p,preferredBack=null){
  const cache=derived(problem),assignments=stations.map(station=>[...station.forward,...station.backward]),ids=cache.taskIds,flat=assignments.flat();
  if(flat.length!==ids.length||new Set(flat).size!==ids.length||ids.some(id=>!flat.includes(id)))return null;
  const stationOf=new Map();assignments.forEach((tasks,index)=>tasks.forEach(id=>stationOf.set(id,index)));
  const successors=cache.successors,order=cache.topology,frontOK=new Map(),backOK=new Map(),canBack=new Map(),preference=preferredBack||new Set(stations.flatMap(station=>station.backward));
  for(const id of order){const v=stationOf.get(id),task=cache.taskMap.get(id);frontOK.set(id,task.predecessors.every(before=>stationOf.get(before)<=v));backOK.set(id,successors.get(id).every(after=>stationOf.get(after)<=v));}
  if(p.physicalRoute!==false)for(let i=order.length-1;i>=0;i--){const id=order[i],v=stationOf.get(id);canBack.set(id,backOK.get(id)&&successors.get(id).every(after=>stationOf.get(after)!==v||canBack.get(after)));}
  else for(const id of order)canBack.set(id,backOK.get(id));
  const directions=new Map();
  const flexible=[];for(const id of order){const v=stationOf.get(id),task=cache.taskMap.get(id),forcedBack=p.physicalRoute!==false&&task.predecessors.some(before=>stationOf.get(before)===v&&directions.get(before)==='backward'),front=frontOK.get(id),back=canBack.get(id);let direction=null;if(forcedBack)direction=back?'backward':null;else if(front&&back){direction=p.freeLanes!==false&&preference.has(id)?'backward':'forward';flexible.push(id);}else if(front)direction='forward';else if(back)direction='backward';if(!direction)return null;directions.set(id,direction);}
  return{stations:normalizeStations(problem,assignments.map(tasks=>({forward:tasks.filter(id=>directions.get(id)==='forward'),backward:tasks.filter(id=>directions.get(id)==='backward')}))),flexible};
}
function canonicalCandidate(problem,stations,sequence,p,preferredBack=null){const normalized=canonicalStations(problem,stations,p,preferredBack);if(!normalized)return null;const candidate=evaluateCandidate(problem,normalized.stations,sequence);Object.defineProperty(candidate,'_flexibleTasks',{value:normalized.flexible,enumerable:false});return candidate;}
function initialStraightBalance(problem){return normalizeStations(problem,topologicalOrder(problem).map(id=>({forward:[id],backward:[]})));}
function mergeMinimumPair(problem,stations){if(stations.length<=1)return null;let pick=0,best=Infinity;for(let j=0;j<stations.length-1;j++){const total=stations[j].averageLoad+stations[j+1].averageLoad;if(total<best){best=total;pick=j;}}const out=normalizeStations(problem,stations),a=out[pick],b=out[pick+1];out.splice(pick,2,{forward:[...a.forward,...b.forward],backward:[...a.backward,...b.backward],averageLoad:0});return normalizeStations(problem,out);}
const MOVE_TYPES=['balance-swap','balance-insert','sequence-swap','sequence-insert'];
function preferredBack(solution){return new Set(solution.stations.flatMap(station=>station.backward));}
function sequenceNeighbor(problem,current,type,random,p){
  const sequence=[...current.sequence];if(sequence.length<2)return current;
  if(type==='sequence-swap'){let a=0,b=0,guard=0;do{a=Math.floor(random()*sequence.length);b=Math.floor(random()*sequence.length);guard++;}while((a===b||sequence[a]===sequence[b])&&guard<500);if(a===b||sequence[a]===sequence[b])return current;[sequence[a],sequence[b]]=[sequence[b],sequence[a]];}
  else{let a=0,b=0,guard=0;do{a=Math.floor(random()*sequence.length);b=Math.floor(random()*sequence.length);guard++;}while(a===b&&guard<500);if(a===b)return current;const[value]=sequence.splice(a,1);sequence.splice(b,0,value);}
  return canonicalCandidate(problem,current.stations,sequence,p,preferredBack(current))||current;
}
function balanceNeighbor(problem,current,type,random,p){
  const assignments=current.stations.map(station=>[...station.forward,...station.backward]),back=preferredBack(current),ids=problem.tasks.map(task=>task.id),stationOf=()=>{const map=new Map();assignments.forEach((tasks,index)=>tasks.forEach(id=>map.set(id,index)));return map;};
  for(let attempt=0;attempt<2000;attempt++){
    const map=stationOf(),copy=assignments.map(tasks=>[...tasks]);
    if(type==='balance-swap'){const a=ids[Math.floor(random()*ids.length)],b=ids[Math.floor(random()*ids.length)],sa=map.get(a),sb=map.get(b);if(a===b||sa===sb)continue;copy[sa][copy[sa].indexOf(a)]=b;copy[sb][copy[sb].indexOf(b)]=a;}
    else{const movable=ids.filter(id=>copy[map.get(id)].length>1);if(!movable.length)return current;const a=movable[Math.floor(random()*movable.length)],source=map.get(a),target=Math.floor(random()*copy.length);if(source===target)continue;copy[source].splice(copy[source].indexOf(a),1);copy[target].push(a);}
    const stations=copy.map(tasks=>({forward:tasks,backward:[]})),candidate=canonicalCandidate(problem,stations,current.sequence,p,back);if(candidate)return candidate;
  }
  return current;
}
function laneFlipNeighbor(problem,current,random,p){
  const flexible=current._flexibleTasks||canonicalStations(problem,current.stations,p,preferredBack(current))?.flexible||[];if(!flexible.length)return current;const id=flexible[Math.floor(random()*flexible.length)],toggled=preferredBack(current);if(toggled.has(id))toggled.delete(id);else toggled.add(id);return canonicalCandidate(problem,current.stations,current.sequence,p,toggled)||current;
}
function neighborOfType(problem,current,type,random,p){if(type.startsWith('sequence'))return sequenceNeighbor(problem,current,type,random,p);if(type==='lane-flip')return laneFlipNeighbor(problem,current,random,p);return balanceNeighbor(problem,current,type,random,p);}
function randomNeighbor(problem,current,p,random){if(p.freeLanes!==false&&random()<Number(p.pLane))return neighborOfType(problem,current,'lane-flip',random,p);if(random()<Number(p.p1))return neighborOfType(problem,current,random()<Number(p.p2)?'balance-swap':'balance-insert',random,p);return neighborOfType(problem,current,random()<Number(p.p3)?'sequence-swap':'sequence-insert',random,p);}
function publishedBenchmark(problem){const demand=Object.fromEntries(problem.models.map(m=>[m.id,m.demand]));if(problem.cycleTime!==12||problem.tasks.length!==10||demand.A!==2||demand.B!==2||demand.C!==1)return null;return candidateFromStations(problem,[{forward:['1'],backward:['8']},{forward:['4','5'],backward:['10']},{forward:['2','6'],backward:['9']},{forward:['3','7'],backward:[]}],['A','B','A','B','C']);}
function zhanSequenceChild(a,b,left,right){const n=a.length;if(n<2)return[...a];const child=Array(n).fill(null),need=new Map(),used=new Map();for(const value of a)need.set(value,(need.get(value)||0)+1);for(let i=left;i<=right;i++){child[i]=a[i];used.set(a[i],(used.get(a[i])||0)+1);}let position=(right+1)%n;for(let offset=0;offset<n;offset++){const value=b[(right+1+offset)%n];if((used.get(value)||0)>=(need.get(value)||0))continue;while(child[position]!==null)position=(position+1)%n;child[position]=value;used.set(value,(used.get(value)||0)+1);}return child;}
function sequenceCrossover(a,b,random){if(a.length<2)return[...a];let left=Math.floor(random()*a.length),right=Math.floor(random()*a.length);if(left>right)[left,right]=[right,left];return zhanSequenceChild(a,b,left,right);}
function assignmentCrossover(problem,left,right,random,p){
  if(left.stationCount!==right.stationCount)return left;const K=left.stationCount,ids=problem.tasks.map(task=>task.id),stationMap=solution=>{const map=new Map();solution.stations.forEach((station,index)=>[...station.forward,...station.backward].forEach(id=>map.set(id,index)));return map;},a=stationMap(left),b=stationMap(right);
  for(let attempt=0;attempt<30;attempt++){const groups=Array.from({length:K},()=>[]);for(const id of ids)groups[(random()<.5?a:b).get(id)].push(id);if(groups.some(group=>!group.length))continue;const back=new Set();for(const id of ids)if((random()<.5?preferredBack(left):preferredBack(right)).has(id))back.add(id);const candidate=canonicalCandidate(problem,groups.map(tasks=>({forward:tasks,backward:[]})),left.sequence,p,back);if(candidate)return candidate;}return left;
}

async function runShared(problem,p,progress,stopped,algorithm){
  const random=makeRng(p.seed),pool=collector(problem,algorithm,p.runNumber,p.poolLimitPerRun),history=[],cap=Math.max(1,Math.floor(Number(algorithm==='SA'?p.saMaxIterations:algorithm==='VNS'?p.iterations:p.gaGenerations))),state={iteration:0},sequence=shuffle(minimumPartSet(problem.models),random);
  let feasible=canonicalCandidate(problem,initialStraightBalance(problem),sequence,p),best=feasible,k1=0,k2=0;if(!feasible?.feasible)throw new Error('En az bir görev tek başına çevrim süresini aşıyor; uygulanabilir başlangıç oluşturulamadı.');
  if(algorithm==='SA'&&p.usePublishedBenchmark){const benchmark=publishedBenchmark(problem);if(benchmark)feasible=best=benchmark;}
  pool.add(feasible,0);
  const remember=solution=>{pool.add(solution,state.iteration);if(solution.feasible&&better(solution,best))best=solution;};
  const noticeBest=solution=>{if(solution.feasible&&better(solution,best)){best=solution;pool.add(solution,state.iteration);}};
  const emit=(current,phase)=>{const trace={iteration:state.iteration,T:phase,current:searchCost(current,p),best:searchCost(best,p),overload:best.overload,stations:best.stationCount};history.push(trace);progress({algorithm,point:trace,best:detailedSolution(problem,best),iteration:state.iteration});};
  const saPhase=async initial=>{let current=initial,currentCost=searchCost(current,p),bestStage=current,bestCost=currentCost,T=Number(p.saT0);while(T>=Number(p.saTmin)&&state.iteration<cap&&!stopped()){for(let n=0;n<Number(p.saInner)&&state.iteration<cap&&!stopped();n++){state.iteration++;const candidate=randomNeighbor(problem,current,p,random),cost=searchCost(candidate,p),delta=cost-currentCost;if(delta<=0||random()<=Math.exp(-delta/Math.max(T,1e-12))){current=candidate;currentCost=cost;remember(current);}else noticeBest(candidate);if(currentCost<=bestCost){bestStage=current;bestCost=currentCost;if(bestStage.feasible){emit(bestStage,T);return{found:true,solution:bestStage};}}}emit(current,T);T*=Number(p.saCooling);await tick();}return{found:false,solution:bestStage,aborted:state.iteration>=cap||stopped()};};
  const vnsPhase=async initial=>{let current=initial,bestStage=initial,bestCost=searchCost(initial,p),stagnation=0,k=0;const types=p.freeLanes!==false?[...MOVE_TYPES,'lane-flip']:MOVE_TYPES,attempts=Math.max(1,Math.floor(p.vnsLocalSearchAttempts));while(stagnation<Number(p.vnsStagnationLimit)&&state.iteration<cap&&!stopped()){state.iteration++;const type=types[k],shaken=neighborOfType(problem,current,type,random,p);let local=shaken,localCost=searchCost(local,p);noticeBest(local);for(let n=0;n<attempts;n++){const candidate=neighborOfType(problem,local,type,random,p),cost=searchCost(candidate,p);noticeBest(candidate);if(cost<localCost){local=candidate;localCost=cost;}}const improved=localCost<searchCost(current,p);current=local;remember(current);k=improved?0:(k+1)%types.length;if(localCost<=bestCost){const strict=localCost<bestCost;bestStage=local;bestCost=localCost;stagnation=strict?0:stagnation+1;if(bestStage.feasible){emit(bestStage,Number(p.vnsStagnationLimit)-stagnation);return{found:true,solution:bestStage};}}else stagnation++;if(state.iteration%20===0)emit(current,Number(p.vnsStagnationLimit)-stagnation);if(state.iteration%100===0)await tick();}emit(bestStage,0);return{found:false,solution:bestStage,aborted:state.iteration>=cap||stopped()};};
  const gaPhase=async initial=>{const size=Math.max(4,Math.floor(p.gaPopulation)),elite=Math.min(size-1,Math.max(0,Math.floor(p.gaElite))),tournamentSize=Math.max(2,Math.floor(p.gaTournament));let population=[initial];while(population.length<size){let candidate=initial;for(let n=0;n<1+Math.floor(random()*6);n++)candidate=randomNeighbor(problem,candidate,p,random);population.push(candidate);noticeBest(candidate);}let bestStage=initial,bestCost=searchCost(initial,p),stagnation=0;const tournament=()=>{let winner=null;for(let n=0;n<tournamentSize;n++){const candidate=population[Math.floor(random()*population.length)];if(!winner||searchCost(candidate,p)<searchCost(winner,p))winner=candidate;}return winner;};while(stagnation<Number(p.gaStagnationLimit)&&state.iteration<cap&&!stopped()){state.iteration++;population.sort((a,b)=>searchCost(a,p)-searchCost(b,p));const next=population.slice(0,elite);while(next.length<size){const left=tournament(),right=tournament();let child=left;if(random()<Number(p.gaBalanceCrossover))child=assignmentCrossover(problem,left,right,random,p);if(random()<Number(p.gaSequenceCrossover))child=canonicalCandidate(problem,child.stations,sequenceCrossover(left.sequence,right.sequence,random),p,preferredBack(child))||child;if(random()<Number(p.gaBalanceMutation))child=neighborOfType(problem,child,random()<Number(p.p2)?'balance-swap':'balance-insert',random,p);if(random()<Number(p.gaSequenceMutation))child=neighborOfType(problem,child,random()<Number(p.p3)?'sequence-swap':'sequence-insert',random,p);next.push(child);noticeBest(child);}population=next;const generationBest=[...population].sort((a,b)=>searchCost(a,p)-searchCost(b,p))[0],cost=searchCost(generationBest,p);remember(generationBest);if(cost<=bestCost){const strict=cost<bestCost;bestStage=generationBest;bestCost=cost;stagnation=strict?0:stagnation+1;if(bestStage.feasible){emit(bestStage,Number(p.gaStagnationLimit)-stagnation);return{found:true,solution:bestStage};}}else stagnation++;emit(generationBest,Number(p.gaStagnationLimit)-stagnation);await tick();}return{found:false,solution:bestStage,aborted:state.iteration>=cap||stopped()};};
  const smoother=algorithm==='SA'?saPhase:algorithm==='VNS'?vnsPhase:gaPhase;
  while(feasible.stationCount>1&&state.iteration<cap&&!stopped()){
    const merged=canonicalCandidate(problem,mergeMinimumPair(problem,feasible.stations),feasible.sequence,p,preferredBack(feasible));if(!merged)break;remember(merged);if(merged.feasible){feasible=merged;k1=0;k2=0;emit(feasible,algorithm==='SA'?Number(p.saT0):0);continue;}
    k2=0;const reduced=await smoother(merged);if(reduced.found){feasible=reduced.solution;k1=0;continue;}if(reduced.aborted)break;
    if(k1===0){k1=1;k2=1;const restart=await smoother(feasible);if(restart.found){feasible=restart.solution;k1=restart.solution.feasible?0:k1;continue;}if(restart.aborted)break;continue;}if(k2===0)break;
  }
  if(!history.length)emit(best,algorithm==='SA'?Number(p.saT0):0);pool.add(best,state.iteration);return{algorithm,best:detailedSolution(problem,best),solutions:pool.values(),history,iterations:state.iteration,poolDropped:pool.dropped()};
}
const runSA=(problem,p,progress,stopped)=>runShared(problem,p,progress,stopped,'SA');
const runGA=(problem,p,progress,stopped)=>runShared(problem,p,progress,stopped,'GA');
const runVNS=(problem,p,progress,stopped)=>runShared(problem,p,progress,stopped,'VNS');

export function filterSolutionPool(entries,filters={}){
  const selected=filters.algorithm?entries.filter(entry=>entry.algorithm===filters.algorithm):entries,unique=new Map();for(const entry of selected){const key=solutionKey(entry.solution);if(!unique.has(key)||better(entry.solution,unique.get(key).solution))unique.set(key,entry);}
  let out=[...unique.values()].filter(({solution:s})=>(!filters.feasibleOnly||s.feasible)&&(filters.maxStations==null||s.stationCount<=filters.maxStations)&&(filters.maxOverload==null||s.overload<=filters.maxOverload+1e-9)&&(filters.maxAdw==null||s.adw<=filters.maxAdw+1e-9)&&(filters.minEfficiency==null||s.efficiency+1e-12>=filters.minEfficiency));
  if(filters.paretoOnly)out=out.filter((x,i)=>!out.some((y,j)=>i!==j&&y.solution.stationCount<=x.solution.stationCount&&y.solution.overload<=x.solution.overload+1e-9&&y.solution.adw<=x.solution.adw+1e-9&&(y.solution.stationCount<x.solution.stationCount||y.solution.overload<x.solution.overload-1e-9||y.solution.adw<x.solution.adw-1e-9)));
  return out.sort((a,b)=>objective(a.solution)-objective(b.solution));
}

export async function solve(problem,params={},progress=()=>{},stopped=()=>false){
  const errors=validateProblem(problem);if(errors.length)throw new Error(errors.join('\n'));
  const p={algorithms:['SA','GA','VNS'],calculations:3,seed:42,iterations:12000,saT0:1000,saTmin:1,saInner:10,saCooling:.95,saMaxIterations:300000,p1:.7,p2:.5,p3:.5,pLane:.15,freeLanes:true,physicalRoute:true,penaltyEnabled:false,penaltyLambda:50,usePublishedBenchmark:false,gaPopulation:100,gaGenerations:200,gaBalanceCrossover:.5,gaSequenceCrossover:.1,gaBalanceMutation:.05,gaSequenceMutation:.01,gaTournament:3,gaElite:2,gaStagnationLimit:40,vnsLocalSearchAttempts:10,vnsStagnationLimit:300,poolLimit:6000,...params};
  p.algorithms=[...new Set(p.algorithms)].filter(x=>['SA','GA','VNS'].includes(x));if(!p.algorithms.length)throw new Error('Select at least one heuristic.');
  p.calculations=Math.max(1,Math.floor(Number(p.calculations)||1));
  const base=Math.floor(p.calculations/p.algorithms.length),remainder=p.calculations%p.algorithms.length,schedule=p.algorithms.flatMap((algorithm,index)=>Array(base+(index<remainder?1:0)).fill(algorithm));
  p.poolLimit=Math.max(100,Math.floor(Number(p.poolLimit)||6000));p.poolLimitPerRun=Math.max(10,Math.floor(p.poolLimit/schedule.length));
  const runners={SA:runSA,GA:runGA,VNS:runVNS},runs=[];for(let i=0;i<schedule.length&&!stopped();i++){const algorithm=schedule[i],algorithmParams={...p,runNumber:i+1,seed:(Number(p.seed)+i*2654435761)>>>0};runs.push(await runners[algorithm](problem,algorithmParams,x=>progress({...x,runNumber:i+1,algorithmIndex:i,algorithmCount:schedule.length}),stopped));}
  const solutions=runs.flatMap(run=>run.solutions),best=solutions.map(x=>x.solution).sort((a,b)=>objective(a)-objective(b))[0]||runs.map(x=>x.best).sort((a,b)=>objective(a)-objective(b))[0];return{best,solutions,runs,iterations:runs.reduce((sum,x)=>sum+x.iterations,0),poolDropped:runs.reduce((sum,x)=>sum+(x.poolDropped||0),0)};
}
