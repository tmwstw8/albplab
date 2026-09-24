import {evaluateSolution,normalizeProblem,solutionKey,validateProblem} from './solver.js';

export const ARCHIVE_FORMAT='albp-solution-pool';
export const ARCHIVE_VERSION=2;
const algorithmNames=['SA','GA','VNS'],algorithms=new Set(algorithmNames);

function requireObject(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} geçerli bir nesne olmalı.`);return value;}
function requireArray(value,label){if(!Array.isArray(value))throw new Error(`${label} bir dizi olmalı.`);return value;}
function requireTrace(value,label){return requireArray(value,label).map((point,index)=>{requireObject(point,`${label}[${index}]`);for(const key of ['iteration','best','overload'])if(!Number.isFinite(point[key]))throw new Error(`${label}[${index}].${key} geçersiz.`);return point;});}

function restoreSolution(problem,value){
  requireObject(value,'Çözüm');
  const modelIds=new Set(problem.models.map(model=>model.id)),taskIds=new Set(problem.tasks.map(task=>task.id));
  const sequence=requireArray(value.sequence,'Üretim sırası');
  if(!sequence.length||sequence.some(model=>!modelIds.has(model)))throw new Error('Üretim sırası geçersiz model içeriyor.');
  const expected=new Map(problem.models.map(model=>[model.id,model.demand]));
  const divisor=problem.models.map(model=>model.demand).reduce((a,b)=>{while(b)[a,b]=[b,a%b];return a;});
  for(const model of problem.models)expected.set(model.id,model.demand/divisor);
  for(const model of sequence)expected.set(model,expected.get(model)-1);
  if([...expected.values()].some(count=>count!==0))throw new Error('Üretim sırası model talepleriyle eşleşmiyor.');
  const stations=requireArray(value.stations,'İstasyonlar'),assigned=[];
  if(!stations.length)throw new Error('Çözümde istasyon yok.');
  const cleanStations=stations.map((station,index)=>{requireObject(station,`İstasyon ${index+1}`);const forward=requireArray(station.forward,'Ön görevler'),backward=requireArray(station.backward,'Arka görevler');if(!forward.length&&!backward.length)throw new Error(`İstasyon ${index+1} boş.`);assigned.push(...forward,...backward);return{forward:[...forward],backward:[...backward]};});
  if(assigned.length!==taskIds.size||new Set(assigned).size!==taskIds.size||assigned.some(id=>!taskIds.has(id)))throw new Error('İstasyonlardaki görevler problemle eşleşmiyor.');
  return evaluateSolution(problem,cleanStations,[...sequence]);
}

function restoreEntry(problem,value){requireObject(value,'Havuz kaydı');if(!algorithms.has(value.algorithm))throw new Error('Havuz kaydında geçersiz algoritma var.');if(!Number.isInteger(value.run)||value.run<1||!Number.isInteger(value.iteration)||value.iteration<0)throw new Error('Havuz kaydının hesap/iterasyon bilgisi geçersiz.');return{algorithm:value.algorithm,run:value.run,iteration:value.iteration,solution:restoreSolution(problem,value.solution)};}

export function buildPoolArchive({problem,params,result,history,view}){
  if(!result)throw new Error('Dışa aktarılacak çözüm havuzu yok.');
  const taskIndex=new Map(problem.tasks.map((task,index)=>[task.id,index])),modelIndex=new Map(problem.models.map((model,index)=>[model.id,index]));
  const entryIndex=new Map(result.solutions.map((entry,index)=>[entry.solution,index])),entryKeyIndex=new Map(result.solutions.map((entry,index)=>[solutionKey(entry.solution),index])),indexOfSolution=solution=>solution?(entryIndex.get(solution)??entryKeyIndex.get(solutionKey(solution))??null):null;
  const entries=result.solutions.map(entry=>[
    algorithmNames.indexOf(entry.algorithm),entry.run,entry.iteration,
    entry.solution.stations.map(station=>[station.forward.map(id=>taskIndex.get(id)),station.backward.map(id=>taskIndex.get(id))]),
    entry.solution.sequence.map(id=>modelIndex.get(id))
  ]);
  const runs=result.runs.map(run=>({algorithm:run.algorithm,iterations:run.iterations,poolDropped:run.poolDropped||0,bestIndex:indexOfSolution(run.best),history:run.history.map(point=>[point.iteration,point.T,point.current,point.best,point.overload,point.stations])}));
  return{format:ARCHIVE_FORMAT,version:ARCHIVE_VERSION,exportedAt:new Date().toISOString(),problem,params,view,iterations:result.iterations,poolDropped:result.poolDropped||0,bestIndex:indexOfSolution(result.best),entries,runs};
}

export function poolArchiveBlob(archive){
  if(archive.version!==ARCHIVE_VERSION)throw new Error('Dışa aktarma için desteklenmeyen arşiv sürümü.');
  const parts=['{"format":',JSON.stringify(archive.format),',"version":2,"exportedAt":',JSON.stringify(archive.exportedAt),',"problem":',JSON.stringify(archive.problem),',"params":',JSON.stringify(archive.params),',"view":',JSON.stringify(archive.view),',"iterations":',String(archive.iterations),',"bestIndex":',JSON.stringify(archive.bestIndex),',"entries":['];
  archive.entries.forEach((entry,index)=>{if(index)parts.push(',');parts.push(JSON.stringify(entry));});
  parts.push('],"poolDropped":',String(archive.poolDropped||0),',"runs":[');
  archive.runs.forEach((run,index)=>{if(index)parts.push(',');parts.push('{"algorithm":',JSON.stringify(run.algorithm),',"iterations":',String(run.iterations),',"poolDropped":',String(run.poolDropped||0),',"bestIndex":',JSON.stringify(run.bestIndex),',"history":[');run.history.forEach((point,i)=>{if(i)parts.push(',');parts.push(JSON.stringify(point));});parts.push(']}');});
  parts.push(']}');return new Blob(parts,{type:'application/json'});
}

function parseLegacyArchive(raw,problem,params,view){
  const source=requireObject(raw.result,'Sonuçlar');
  const solutions=requireArray(source.solutions,'Çözüm havuzu').map(entry=>restoreEntry(problem,entry));
  const runs=requireArray(source.runs,'Hesaplar').map((run,index)=>{requireObject(run,`Hesap ${index+1}`);if(!algorithms.has(run.algorithm))throw new Error('Hesapta geçersiz algoritma var.');return{...run,best:run.best?restoreSolution(problem,run.best):null,solutions:requireArray(run.solutions,'Hesap çözümleri').map(entry=>restoreEntry(problem,entry)),history:requireTrace(run.history,'Hesap grafiği')};});
  if(!Number.isInteger(source.iterations)||source.iterations<0)throw new Error('Toplam iterasyon sayısı geçersiz.');
  return{problem,params,result:{best:source.best?restoreSolution(problem,source.best):null,solutions,runs,iterations:source.iterations},history:requireTrace(raw.history,'Yakınsama grafiği'),view};
}

function parseCompactArchive(raw,problem,params,view){
  const taskIds=problem.tasks.map(task=>task.id),modelIds=problem.models.map(model=>model.id);
  const idAt=(ids,index,label)=>{if(!Number.isInteger(index)||index<0||index>=ids.length)throw new Error(`Arşivde geçersiz ${label} dizini var.`);return ids[index];};
  const solutions=requireArray(raw.entries,'Çözüm havuzu').map((entry,index)=>{
    requireArray(entry,`Havuz kaydı ${index+1}`);const [algorithmIndex,run,iteration,stationData,modelData]=entry;
    const solution={stations:requireArray(stationData,'İstasyonlar').map(station=>{requireArray(station,'İstasyon');return{forward:requireArray(station[0],'Ön görevler').map(id=>idAt(taskIds,id,'görev')),backward:requireArray(station[1],'Arka görevler').map(id=>idAt(taskIds,id,'görev'))};}),sequence:requireArray(modelData,'Üretim sırası').map(id=>idAt(modelIds,id,'model'))};
    return restoreEntry(problem,{algorithm:idAt(algorithmNames,algorithmIndex,'algoritma'),run,iteration,solution});
  });
  const selectedSolution=index=>index==null?null:(Number.isInteger(index)&&index>=0&&index<solutions.length?solutions[index].solution:(()=>{throw new Error('Arşivde geçersiz en iyi çözüm dizini var.');})());
  const runs=requireArray(raw.runs,'Hesaplar').map((run,index)=>{
    requireObject(run,`Hesap ${index+1}`);if(!algorithms.has(run.algorithm)||!Number.isInteger(run.iterations)||run.iterations<0)throw new Error('Hesap bilgisi geçersiz.');
    const points=requireArray(run.history,'Hesap grafiği').map(values=>{requireArray(values,'Grafik noktası');const [iteration,T,current,best,overload,stations]=values;return{iteration,T,current,best,overload,stations};});
    return{algorithm:run.algorithm,iterations:run.iterations,poolDropped:Number(run.poolDropped)||0,best:selectedSolution(run.bestIndex),solutions:solutions.filter(entry=>entry.run===index+1),history:requireTrace(points,'Hesap grafiği')};
  });
  if(!Number.isInteger(raw.iterations)||raw.iterations<0)throw new Error('Toplam iterasyon sayısı geçersiz.');
  return{problem,params,result:{best:selectedSolution(raw.bestIndex),solutions,runs,iterations:raw.iterations,poolDropped:Number(raw.poolDropped)||0},history:runs.flatMap(run=>run.history),view};
}

export function parsePoolArchive(raw){
  requireObject(raw,'Arşiv');
  if(raw.format!==ARCHIVE_FORMAT||![1,ARCHIVE_VERSION].includes(raw.version))throw new Error('Desteklenmeyen çözüm havuzu dosyası veya sürümü.');
  const problem=normalizeProblem(requireObject(raw.problem,'Problem')),errors=validateProblem(problem);
  if(errors.length)throw new Error(`Arşivdeki problem geçersiz: ${errors.join(' ')}`);
  const params=requireObject(raw.params,'Parametreler'),view=requireObject(raw.view,'Görünüm');
  const archive=raw.version===1?parseLegacyArchive(raw,problem,params,view):parseCompactArchive(raw,problem,params,view);
  if(view.selectedIndex!=null&&(!Number.isInteger(view.selectedIndex)||view.selectedIndex<0||view.selectedIndex>=archive.result.solutions.length))throw new Error('Seçili çözüm dizini geçersiz.');
  return archive;
}
