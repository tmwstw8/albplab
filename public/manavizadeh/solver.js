const gcd=(a,b)=>b?gcd(b,a%b):Math.abs(a);
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

export function minimumPartSet(models){
  if(!models.length)return [];
  const divisor=models.map(model=>model.demand).reduce(gcd);
  return models.flatMap(model=>Array(model.demand/divisor).fill(model.id));
}

export function normalizeProblem(raw){
  const source=raw.problem||raw;
  const models=(source.models||[]).map(model=>typeof model==='object'?{id:String(model.id),demand:Number(model.demand)}:{id:String(model),demand:Number(source.demand?.[model]??1)});
  const modelIds=models.map(model=>model.id);
  const stationCount=Math.max(1,Math.floor(finite(source.stationCount,4)));
  const tasks=(source.tasks||[]).map((task,index)=>({
    id:String(task.id??index+1),
    times:Object.fromEntries(modelIds.map(id=>[id,finite(task.times?.[id],0)])),
    stations:Array.from({length:stationCount},(_,station)=>({
      rate:finite(task.stations?.[station]?.rate??task.stationRates?.[station],1),
      waste:finite(task.stations?.[station]?.waste??task.stationWaste?.[station],0)
    }))
  }));
  const mpsLength=models.length?minimumPartSet(models).length:0;
  const positions=Array.from({length:mpsLength},(_,position)=>Object.fromEntries(modelIds.map(id=>[id,{
    rate:finite(source.positions?.[position]?.[id]?.rate,1),
    waste:finite(source.positions?.[position]?.[id]?.waste,1)
  }])));
  return {
    name:source.name||'Manavizadeh 2015 MMAL problemi',models,tasks,positions,stationCount,
    lineType:source.lineType==='straight'?'straight':'u',
    minimumTasks:Math.max(0,Math.floor(finite(source.minimumTasks,1))),
    speed:Math.max(.001,finite(source.speed,1)),
    lineLength:Math.max(.001,finite(source.lineLength,25)),
    rho:Math.min(1,Math.max(0,finite(source.rho,.5))),
    cycleLimits:Object.fromEntries(modelIds.map(id=>[id,finite(source.cycleLimits?.[id],NaN)])),
    search:{...(raw.search||source.search||{})}
  };
}

export function validateProblem(problem){
  const errors=[];
  if(!problem.models.length)errors.push('En az bir model ekleyin.');
  if(!problem.tasks.length)errors.push('En az bir görev ekleyin.');
  if(!Number.isInteger(problem.stationCount)||problem.stationCount<1)errors.push('İstasyon sayısı pozitif bir tam sayı olmalı.');
  if(problem.minimumTasks*problem.stationCount>problem.tasks.length)errors.push('LB × istasyon sayısı görev sayısını aşamaz.');
  if(!(problem.speed>0)||!(problem.lineLength>0))errors.push('Konveyör hızı ve istasyon boyu pozitif olmalı.');
  if(problem.rho<0||problem.rho>1)errors.push('ρ, 0 ile 1 arasında olmalı.');
  const modelIds=problem.models.map(model=>model.id),taskIds=problem.tasks.map(task=>task.id);
  if(modelIds.some(id=>!id)||new Set(modelIds).size!==modelIds.length)errors.push('Model kimlikleri boş olamaz ve benzersiz olmalı.');
  if(taskIds.some(id=>!id)||new Set(taskIds).size!==taskIds.length)errors.push('Görev kimlikleri boş olamaz ve benzersiz olmalı.');
  if(problem.models.some(model=>!Number.isInteger(model.demand)||model.demand<1))errors.push('Talepler pozitif tam sayı olmalı.');
  for(const task of problem.tasks){
    for(const id of modelIds)if(!Number.isFinite(task.times[id])||task.times[id]<0)errors.push(`Görev ${task.id}: ${id} süresi geçersiz.`);
    if(task.stations.length!==problem.stationCount)errors.push(`Görev ${task.id}: istasyon katsayı sayısı geçersiz.`);
    task.stations.forEach((factor,index)=>{if(!(factor.rate>=0)||!(factor.waste>=0))errors.push(`Görev ${task.id}, istasyon ${index+1}: katsayılar negatif olamaz.`);});
  }
  if(problem.positions.length!==minimumPartSet(problem.models).length)errors.push('Pozisyon katsayı sayısı MPS uzunluğuyla eşleşmiyor.');
  return [...new Set(errors)];
}

function makeRng(seed){let state=(Number(seed)>>>0)||1;return()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);}
function shuffled(values,random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function derived(problem){
  const totals=Object.fromEntries(problem.models.map(model=>[model.id,problem.tasks.reduce((sum,task)=>sum+task.times[model.id],0)]));
  const cycleLimits=Object.fromEntries(problem.models.map(model=>[model.id,Number.isFinite(problem.cycleLimits[model.id])&&problem.cycleLimits[model.id]>0?problem.cycleLimits[model.id]:totals[model.id]/model.demand]));
  const baseMps=minimumPartSet(problem.models),totalMpsTime=baseMps.reduce((sum,id)=>sum+totals[id],0);
  return {totals,cycleLimits,baseMps,gamma:totalMpsTime/Math.max(1,baseMps.length*problem.stationCount)};
}

function assignmentCounts(assignment,stationCount){const counts=Array(stationCount).fill(0);assignment.forEach(station=>counts[station]++);return counts;}
function initialSolution(problem,random){
  const order=shuffled(problem.tasks.map((_,index)=>index),random),assignment=Array(problem.tasks.length);
  order.forEach((taskIndex,index)=>assignment[taskIndex]=index%problem.stationCount);
  return {assignment,sequence:shuffled(minimumPartSet(problem.models),random)};
}

export function evaluateSolution(problem,solution){
  const d=derived(problem),K=problem.stationCount,I=solution.sequence.length;
  const stationTasks=Array.from({length:K},()=>[]);
  solution.assignment.forEach((station,taskIndex)=>stationTasks[station]?.push(problem.tasks[taskIndex].id));
  const loads=Array.from({length:K},()=>Object.fromEntries(problem.models.map(model=>[model.id,0])));
  problem.tasks.forEach((task,index)=>{const station=solution.assignment[index];for(const model of problem.models)loads[station][model.id]+=task.times[model.id];});
  let cycle=0,waste=0;
  for(let j=0;j<problem.tasks.length;j++){
    const task=problem.tasks[j],station=solution.assignment[j],factor=task.stations[station];
    for(let i=0;i<I;i++){
      const model=solution.sequence[i],position=problem.positions[i][model];
      cycle+=task.times[model]*factor.rate*position.rate;
      waste+=factor.waste*position.waste;
    }
  }
  let balanceOverload=0,capacityViolation=0;
  for(let station=0;station<K;station++)for(const model of problem.models){
    const excess=Math.max(0,loads[station][model.id]-d.cycleLimits[model.id]);
    balanceOverload+=excess;capacityViolation+=excess;
  }
  const startPositions=Array.from({length:I},()=>Array(K).fill(0)),utility=Array.from({length:I},()=>Array(K).fill(0));
  for(let station=0;station<K;station++){
    let start=0;
    for(let i=0;i<I;i++){
      startPositions[i][station]=start;
      const work=loads[station][solution.sequence[i]],distance=start+problem.speed*work;
      utility[i][station]=Math.max(0,distance-problem.lineLength)/problem.speed;
      start=Math.max(0,Math.min(distance-d.gamma*problem.speed,Math.max(0,problem.lineLength-d.gamma*problem.speed)));
    }
  }
  const sequenceOverload=utility.flat().reduce((sum,value)=>sum+value,0);
  const overload=problem.rho*balanceOverload+(1-problem.rho)*sequenceOverload;
  const counts=assignmentCounts(solution.assignment,K),minimumViolation=counts.reduce((sum,count)=>sum+Math.max(0,problem.minimumTasks-count),0);
  const violation=capacityViolation+minimumViolation;
  return {...solution,stationTasks,loads,startPositions,utility,objectives:{cycle,waste,overload},balanceOverload,sequenceOverload,capacityViolation,minimumViolation,violation,feasible:violation<1e-9,gamma:d.gamma,cycleLimits:d.cycleLimits};
}

function clone(solution){return {assignment:[...solution.assignment],sequence:[...solution.sequence]};}
function mutate(problem,solution,random){
  const next=clone(solution),counts=assignmentCounts(next.assignment,problem.stationCount);
  if(random()<.58&&problem.tasks.length>1){
    if(random()<.5){
      const a=Math.floor(random()*next.assignment.length),b=Math.floor(random()*next.assignment.length);
      [next.assignment[a],next.assignment[b]]=[next.assignment[b],next.assignment[a]];
    }else{
      const movable=next.assignment.map((station,index)=>({station,index})).filter(item=>counts[item.station]>problem.minimumTasks);
      if(movable.length){const pick=movable[Math.floor(random()*movable.length)];let target=Math.floor(random()*problem.stationCount);if(target===pick.station)target=(target+1)%problem.stationCount;next.assignment[pick.index]=target;}
    }
  }else if(next.sequence.length>1){
    const a=Math.floor(random()*next.sequence.length);let b=Math.floor(random()*next.sequence.length);if(b===a)b=(b+1)%next.sequence.length;
    [next.sequence[a],next.sequence[b]]=[next.sequence[b],next.sequence[a]];
  }
  return next;
}

function penalty(evaluation){return evaluation.violation*1e7+evaluation.minimumViolation*1e8;}
async function search(problem,initial,iterations,params,objective,random,onPoint,state,stopped){
  let current=evaluateSolution(problem,initial),currentEnergy=objective(current)+penalty(current),best=current,bestEnergy=currentEnergy;
  const stride=Math.max(25,Math.floor(iterations/80));
  for(let local=0;local<iterations&&!stopped();local++,state.iteration++){
    const candidate=evaluateSolution(problem,mutate(problem,current,random)),candidateEnergy=objective(candidate)+penalty(candidate);
    const relative=(candidateEnergy-currentEnergy)/Math.max(1,Math.abs(currentEnergy));
    const temperature=Math.max(1e-6,params.temperature*Math.pow(params.cooling,local/40));
    if(relative<=0||random()<Math.exp(-relative/temperature)){current=candidate;currentEnergy=candidateEnergy;}
    if(candidateEnergy<bestEnergy){best=candidate;bestEnergy=candidateEnergy;}
    if(local%stride===0){onPoint({iteration:state.iteration,stage:state.stage,bestScore:bestEnergy,objectives:best.objectives});await new Promise(resolve=>setTimeout(resolve,0));}
  }
  return best;
}

function chooseCandidate(candidates,weights){
  const keys=['cycle','waste','overload'],multi=candidates.find(candidate=>candidate.source==='Çok amaç');
  const ideal=Object.fromEntries(keys.map(key=>[key,Math.min(...candidates.map(candidate=>candidate.objectives[key]))]));
  const high=Object.fromEntries(keys.map(key=>[key,Math.max(...candidates.map(candidate=>candidate.objectives[key]))]));
  for(const candidate of candidates){
    candidate.improvements=keys.filter(key=>candidate.objectives[key]<multi.objectives[key]-1e-9).length;
    candidate.worsenings=keys.filter(key=>candidate.objectives[key]>multi.objectives[key]+1e-9).length;
    candidate.dominatesMulti=candidate.improvements>0&&candidate.worsenings===0;
    candidate.distance=keys.reduce((sum,key,index)=>sum+weights[index]*(candidate.objectives[key]-ideal[key])/Math.max(1e-9,high[key]-ideal[key]),0);
  }
  return [...candidates].sort((a,b)=>Number(b.feasible)-Number(a.feasible)||Number(b.dominatesMulti)-Number(a.dominatesMulti)||a.distance-b.distance||a.violation-b.violation)[0];
}

export async function solve(problem,rawParams={},progress=()=>{},stopped=()=>false){
  const errors=validateProblem(problem);if(errors.length)throw new Error(errors.join('\n'));
  const params={temperature:1,cooling:.965,iterations:16000,seed:42,weightCycle:1,weightWaste:1,weightOverload:1,...rawParams};
  const random=makeRng(params.seed),state={iteration:0,stage:'z₁'},history=[],total=Math.max(400,Math.floor(params.iterations)),perStage=Math.max(100,Math.floor(total/4));
  const emit=point=>{history.push(point);progress({point});};
  const seed=initialSolution(problem,random);
  state.stage='z₁';const z1=await search(problem,seed,perStage,params,x=>x.objectives.cycle,random,emit,state,stopped);z1.source='z₁ en iyi';
  state.stage='z₂';const z2=await search(problem,seed,perStage,params,x=>x.objectives.waste,random,emit,state,stopped);z2.source='z₂ en iyi';
  state.stage='z₃';const z3=await search(problem,seed,perStage,params,x=>x.objectives.overload,random,emit,state,stopped);z3.source='z₃ en iyi';
  const scales=[Math.max(1e-9,z1.objectives.cycle),Math.max(1e-9,z2.objectives.waste),Math.max(1e-9,z3.objectives.overload||1)];
  const weights=[params.weightCycle,params.weightWaste,params.weightOverload].map(value=>Math.max(0,Number(value)||0)),weightTotal=weights.reduce((sum,value)=>sum+value,0)||1;
  const combined=evaluation=>weights.reduce((sum,weight,index)=>sum+weight*[evaluation.objectives.cycle,evaluation.objectives.waste,evaluation.objectives.overload][index]/scales[index],0)/weightTotal;
  state.stage='Çok amaç';const multi=await search(problem,seed,total-perStage*3,params,combined,random,emit,state,stopped);multi.source='Çok amaç';
  const candidates=[z1,z2,z3,multi],best=chooseCandidate(candidates,weights);
  return {best,candidates,history,iterations:state.iteration,params,stopped:stopped()};
}
