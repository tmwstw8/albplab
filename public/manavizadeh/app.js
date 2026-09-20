import {normalizeProblem,validateProblem,minimumPartSet} from './solver.js';
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const fmt=(value,digits=2)=>Number(value).toLocaleString('tr-TR',{maximumFractionDigits:digits,minimumFractionDigits:digits});
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let current=null,worker=null,restartTimer=null,continuous=false,startedAt=0,trace=[],lastResult=null,lastSvg='',archive=[],runCounter=0;

function parseModels(){return $('#models').value.split(',').map(value=>value.trim()).filter(Boolean).map(value=>{const [id,demand]=value.split(':');return{id:(id||'').trim(),demand:Number(demand)};});}
function inputNumber(element,fallback=0){const value=Number(element?.value);return Number.isFinite(value)?value:fallback;}
function readProblem(){
  const models=parseModels(),stationCount=Math.max(1,Math.floor(inputNumber($('#stationCount'),1))),modelIds=models.map(model=>model.id);
  const tasks=$$('#taskTable tbody tr').map(row=>({
    id:row.querySelector('[data-task-id]').value.trim(),
    times:Object.fromEntries(modelIds.map(id=>[id,inputNumber(row.querySelector(`[data-time="${CSS.escape(id)}"]`))])),
    stations:Array.from({length:stationCount},(_,station)=>({
      rate:inputNumber($(`[data-rate-task="${CSS.escape(row.dataset.taskKey)}"][data-station="${station}"]`),1),
      waste:inputNumber($(`[data-waste-task="${CSS.escape(row.dataset.taskKey)}"][data-station="${station}"]`),0)
    }))
  }));
  const length=models.length?minimumPartSet(models).length:0;
  const positions=Array.from({length},(_,position)=>Object.fromEntries(modelIds.map(id=>[id,{
    rate:inputNumber($(`[data-position="${position}"][data-model="${CSS.escape(id)}"][data-kind="rate"]`),1),
    waste:inputNumber($(`[data-position="${position}"][data-model="${CSS.escape(id)}"][data-kind="waste"]`),1)
  }])));
  const cycleLimits=Object.fromEntries(modelIds.map(id=>[id,current?.cycleLimits?.[id]]));
  return normalizeProblem({name:$('#name').value.trim(),lineType:$('#lineType').value,stationCount,minimumTasks:inputNumber($('#minimumTasks')),speed:inputNumber($('#speedInput'),1),lineLength:inputNumber($('#lineLength'),25),rho:inputNumber($('#rho'),.5),models,tasks,positions,cycleLimits,search:readParams()});
}
function readParams(){return Object.fromEntries($$('[data-param]').map(element=>[element.dataset.param,inputNumber(element)]));}

function loadRaw(raw){
  current=normalizeProblem(raw);$('#name').value=current.name;$('#lineType').value=current.lineType;$('#stationCount').value=current.stationCount;$('#minimumTasks').value=current.minimumTasks;$('#speedInput').value=current.speed;$('#lineLength').value=current.lineLength;$('#rho').value=current.rho;$('#models').value=current.models.map(model=>`${model.id}:${model.demand}`).join(', ');
  const defaults={temperature:1,cooling:.965,iterations:16000,seed:42,weightCycle:1,weightWaste:1,weightOverload:1,...current.search};
  for(const [key,value] of Object.entries(defaults)){const element=$(`[data-param="${key}"]`);if(element)element.value=value;}
  renderEditors();validateUi();resetResults();
}
function renderEditors(){renderTasks();renderStationFactors();renderPositionFactors();}
function renderTasks(){
  $('#taskHead').innerHTML='<th>ID</th>'+current.models.map(model=>`<th>${esc(model.id)} · t<sub>jm</sub></th>`).join('')+'<th></th>';
  $('#taskTable tbody').innerHTML=current.tasks.map((task,index)=>`<tr data-task-key="${index}"><td><input data-task-id value="${esc(task.id)}"></td>${current.models.map(model=>`<td><input type="number" min="0" step="any" data-time="${esc(model.id)}" value="${task.times[model.id]}"></td>`).join('')}<td><button class="task-delete" aria-label="${esc(task.id)} görevini sil">×</button></td></tr>`).join('');
}
function renderStationFactors(){
  const head=current.tasks.map(task=>`<th colspan="2">${esc(task.id)}</th>`).join(''),sub=current.tasks.map(()=>'<th>a<sub>jk</sub></th><th>z<sub>jk</sub></th>').join('');
  let body='';for(let station=0;station<current.stationCount;station++){body+=`<tr><th>S${station+1}</th>${current.tasks.map((task,index)=>`<td><input type="number" min="0" step="any" data-rate-task="${index}" data-station="${station}" value="${task.stations[station]?.rate??1}"></td><td><input type="number" min="0" step="any" data-waste-task="${index}" data-station="${station}" value="${task.stations[station]?.waste??0}"></td>`).join('')}</tr>`;}
  $('#stationFactors').innerHTML=`<table class="coefficient-table"><thead><tr><th>İst.</th>${head}</tr><tr><th></th>${sub}</tr></thead><tbody>${body}</tbody></table>`;
}
function renderPositionFactors(){
  const length=minimumPartSet(current.models).length,head=current.models.map(model=>`<th colspan="2">${esc(model.id)}</th>`).join(''),sub=current.models.map(()=>'<th>a<sub>im</sub></th><th>β<sub>im</sub></th>').join('');
  let body='';for(let position=0;position<length;position++){body+=`<tr><th>${position+1}</th>${current.models.map(model=>{const factor=current.positions[position]?.[model.id]||{rate:1,waste:1};return`<td><input type="number" min="0" step="any" data-position="${position}" data-model="${esc(model.id)}" data-kind="rate" value="${factor.rate}"></td><td><input type="number" min="0" step="any" data-position="${position}" data-model="${esc(model.id)}" data-kind="waste" value="${factor.waste}"></td>`;}).join('')}</tr>`;}
  $('#positionFactors').innerHTML=`<table class="coefficient-table"><thead><tr><th>i</th>${head}</tr><tr><th></th>${sub}</tr></thead><tbody>${body}</tbody></table>`;
}
function restructure(){try{current=readProblem();renderEditors();validateUi();}catch(error){$('#validation').textContent=error.message;}}
function validateUi(){try{const errors=validateProblem(readProblem());$('#validation').textContent=errors.join('\n');return !errors.length;}catch(error){$('#validation').textContent=error.message;return false;}}
function resetResults(){lastResult=null;lastSvg='';trace=[];drawChart();$('#layout').className='layout-empty';$('#layout').textContent='İstasyon dizilimi için hesaplamayı çalıştırın.';$('#assignmentTable').innerHTML='';$('#candidateTable').innerHTML='';$('#downloadSvg').disabled=true;}

function startSearch(){if(!validateUi())return;current=readProblem();continuous=$('#continuousSearch').checked;$('#continuousSearch').disabled=true;runOnce();}
function runOnce(){
  const params=readParams();if(continuous||$('#randomSeed').checked){params.seed=crypto.getRandomValues(new Uint32Array(1))[0]||1;$('[data-param="seed"]').value=params.seed;}
  startedAt=performance.now();trace=[];drawChart();setBusy(true);$('#status').textContent=continuous?`Sürekli arama · ${archive.length} sonuç`:'Hesaplanıyor…';$('#runSeed').textContent=`Tohum ${params.seed}`;
  worker?.terminate();const runWorker=new Worker('./worker.js',{type:'module'});worker=runWorker;
  runWorker.onmessage=event=>{
    if(event.data.type==='progress'){trace.push(event.data.payload.point);renderProgress(event.data.payload.point);return;}
    if(event.data.type==='error'){if(worker===runWorker)worker=null;if(continuous){$('#validation').textContent=`Tohum ${params.seed}: ${event.data.message}`;restartTimer=setTimeout(()=>{restartTimer=null;if(continuous)runOnce();else finish();},180);}else{showError(event.data.message);finish();}return;}
    if(event.data.type==='done'){
      if(worker===runWorker)worker=null;
      const seconds=Math.max(.001,(performance.now()-startedAt)/1000);lastResult=event.data.result;renderResult(lastResult);if(!event.data.cancelled)storeResult(lastResult,params.seed,seconds);
      if(continuous&&!event.data.cancelled){$('#status').textContent=`Sürekli arama · ${archive.length} sonuç`;restartTimer=setTimeout(()=>{restartTimer=null;if(continuous)runOnce();else finish();},140);}else{$('#status').textContent=event.data.cancelled?'Durduruldu':'Hesaplama tamamlandı';continuous=false;finish();}
    }
  };
  worker.postMessage({type:'start',problem:current,params});
}
function setBusy(busy){$('#run').disabled=busy;$('#runAgain').disabled=busy;$('#stop').disabled=!busy;}
function finish(){setBusy(false);$('#continuousSearch').disabled=false;}
function showError(message){$('#validation').textContent=message;$('#status').textContent='Hesaplama başarısız';}
function renderProgress(point){const seconds=Math.max(.001,(performance.now()-startedAt)/1000);$('#calcSpeed').textContent=`${Math.round(point.iteration/seconds).toLocaleString('tr-TR')} iter/s`;$('#elapsed').textContent=`${seconds.toFixed(2)} s`;$('#iteration').textContent=`${point.iteration.toLocaleString('tr-TR')} · ${point.stage}`;drawChart();}

function renderResult(result){
  const best=result.best,o=best.objectives;$('#mCycle').textContent=fmt(o.cycle);$('#mWaste').textContent=fmt(o.waste);$('#mOverload').textContent=fmt(o.overload);$('#mSource').textContent=best.source;$('#mGamma').textContent=fmt(best.gamma);$('#mFeasible').textContent=best.feasible?'Uygun':'İhlal var';$('#sequence').textContent=`Sıra ${best.sequence.join(' · ')}`;
  renderLayout(best);renderAssignments(best);renderCandidates(result.candidates);
}
function storeResult(result,seed,seconds){archive.unshift({id:++runCounter,result,seed,seconds});renderHistory();}
function renderHistory(){
  $('#clearHistory').disabled=!archive.length;if(!archive.length){$('#historyBest').innerHTML='';$('#runHistoryBody').innerHTML='<tr><td colspan="8" class="history-empty">Tamamlanan hesaplamalar burada görünecek.</td></tr>';return;}
  const mins=['cycle','waste','overload'].map(key=>Math.min(...archive.map(item=>item.result.best.objectives[key])));
  $('#historyBest').innerHTML=`<span><b>${fmt(mins[0])}</b> min z₁</span><span><b>${fmt(mins[1])}</b> min z₂</span><span><b>${fmt(mins[2])}</b> min z₃</span><span><b>${archive.filter(item=>item.result.best.feasible).length}</b> uygun çözüm</span>`;
  $('#runHistoryBody').innerHTML=archive.map(item=>{const o=item.result.best.objectives;return`<tr><td>${item.id}</td><td>${item.seed}</td><td>${fmt(o.cycle)}</td><td>${fmt(o.waste)}</td><td>${fmt(o.overload)}</td><td>${esc(item.result.best.source)}</td><td>${item.seconds.toFixed(2)} s</td><td><button class="secondary history-show" data-run="${item.id}">Göster</button></td></tr>`;}).join('');
}
function renderCandidates(candidates){
  const multi=candidates.find(candidate=>candidate.source==='Çok amaç');
  const rows=candidates.map(candidate=>{const o=candidate.objectives,delta=key=>multi.objectives[key]?100*(multi.objectives[key]-o[key])/multi.objectives[key]:0;return`<tr class="${candidate===lastResult.best?'chosen-row':''}"><th>${esc(candidate.source)}</th><td>${fmt(o.cycle)}</td><td>${fmt(o.waste)}</td><td>${fmt(o.overload)}</td><td>${candidate.improvements}</td><td>${candidate.worsenings}</td><td>${fmt(candidate.distance,3)}</td><td>${candidate.feasible?'Evet':'Hayır'}</td><td>${candidate.source==='Çok amaç'?'Referans':`${delta('cycle')>=0?'+':''}${fmt(delta('cycle'),1)} / ${delta('waste')>=0?'+':''}${fmt(delta('waste'),1)} / ${delta('overload')>=0?'+':''}${fmt(delta('overload'),1)}%`}</td></tr>`;}).join('');
  $('#candidateTable').innerHTML=`<table class="results-table"><thead><tr><th>Aday grup</th><th>z₁</th><th>z₂</th><th>z₃</th><th>İyileşen</th><th>Kötüleşen</th><th>Normalize sapma</th><th>Uygun</th><th>Çok-amaca göre Δ z₁/z₂/z₃</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderAssignments(best){
  const rows=best.stationTasks.map((ids,station)=>{const taskObjects=current.tasks.filter(task=>ids.includes(task.id)),avgRate=taskObjects.length?taskObjects.reduce((sum,task)=>sum+task.stations[station].rate,0)/taskObjects.length:0,waste=taskObjects.reduce((sum,task)=>sum+task.stations[station].waste,0);return`<tr><th>S${station+1}</th><td>${esc(ids.join(', ')||'—')}</td><td>${ids.length}</td>${current.models.map(model=>{const load=best.loads[station][model.id],limit=best.cycleLimits[model.id];return`<td class="${load>limit+1e-9?'load-over':''}">${fmt(load,1)} / ${fmt(limit,1)}</td>`;}).join('')}<td>${fmt(avgRate,3)}</td><td>${fmt(waste,2)}</td></tr>`;}).join('');
  $('#assignmentTable').innerHTML=`<table class="results-table"><thead><tr><th>İstasyon</th><th>Atanan görevler</th><th>Adet</th>${current.models.map(model=>`<th>${esc(model.id)} yükü / C<sub>m</sub></th>`).join('')}<th>Ort. a<sub>jk</sub></th><th>Σ z<sub>jk</sub></th></tr></thead><tbody>${rows}</tbody></table><p class="matrix-hint">Dengeleme aşımı: ${fmt(best.balanceOverload)} · Sıralama utility işi: ${fmt(best.sequenceOverload)} · z₃ = ρ × dengeleme + (1−ρ) × sıralama.</p>`;
}

function layoutPositions(count,type){
  if(type==='straight')return Array.from({length:count},(_,index)=>({x:100+index*155,y:220}));
  const top=Math.ceil(count/2),positions=[];for(let index=0;index<top;index++)positions.push({x:115+index*170,y:155});for(let index=top;index<count;index++)positions.push({x:115+(count-1-index)*170,y:355});return positions;
}
function solutionSvg(best){
  const positions=layoutPositions(current.stationCount,current.lineType),maxX=Math.max(...positions.map(position=>position.x)),W=Math.max(900,maxX+190),H=current.lineType==='u'?500:380;
  const route=current.lineType==='u'?`<path d="M45 155 H${maxX+75} Q${maxX+135} 155 ${maxX+135} 215 V295 Q${maxX+135} 355 ${maxX+75} 355 H45" class="route" marker-end="url(#arrow)"/><text x="25" y="137" class="muted">giriş</text><text x="25" y="382" class="muted">çıkış</text>`:`<path d="M45 220 H${maxX+95}" class="route" marker-end="url(#arrow)"/><text x="25" y="202" class="muted">giriş</text>`;
  const stations=positions.map((position,index)=>{const ids=best.stationTasks[index],width=Math.max(112,ids.length*43+30),circles=ids.map((id,item)=>{const x=position.x+(item-(ids.length-1)/2)*42;return`<circle cx="${x}" cy="${position.y}" r="17" class="task"/><text x="${x}" y="${position.y+4}" text-anchor="middle" class="task-text">${esc(id)}</text>`;}).join('');return`<g><rect x="${position.x-width/2}" y="${position.y-52}" width="${width}" height="104" rx="12" class="zone"/><text x="${position.x}" y="${position.y-63}" text-anchor="middle" class="station">S${index+1}</text>${circles}<text x="${position.x}" y="${position.y+36}" text-anchor="middle" class="count">${ids.length} görev</text></g>`;}).join('');
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="svgTitle svgDesc"><title id="svgTitle">${current.lineType==='u'?'U biçimli':'Düz'} istasyon dizilimi</title><desc id="svgDesc">${current.stationCount} istasyon; model sırası ${best.sequence.join(', ')}</desc><style>.route{fill:none;stroke:#7d8984;stroke-width:5;stroke-linecap:round}.arrow{fill:#7d8984}.zone{fill:#f4f6f5;stroke:#96a29d;stroke-width:1.5;stroke-dasharray:6 5}.task{fill:#fff;stroke:#175e4b;stroke-width:2}.task-text,.station,.count,.caption,.muted{font-family:Inter,Arial,sans-serif;fill:#17201d}.task-text{font-size:12px}.station{font-size:13px;font-weight:700}.count,.muted{font-size:11px;fill:#66716d}.caption{font-size:13px}</style><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L0,7 L8,3.5 z" class="arrow"/></marker></defs><text x="45" y="35" class="caption">MS = ${best.sequence.map(esc).join(' → ')}</text><text x="45" y="54" class="muted">γ = ${fmt(best.gamma)} · ${current.lineType==='u'?'U-hat':'düz hat'}</text>${route}${stations}</svg>`;
}
function renderLayout(best){lastSvg=solutionSvg(best);$('#layout').className='';$('#layout').innerHTML=lastSvg;$('#downloadSvg').disabled=false;}
function drawChart(){
  const svg=$('#chart'),W=900,H=210,m={l:64,r:25,t:24,b:34};if(trace.length<2){svg.innerHTML='<text x="450" y="105" text-anchor="middle" class="chart-axis">Canlı arama izi burada görünecek.</text>';return;}
  const values=trace.map(point=>Math.log10(1+Math.max(0,point.bestScore))),xmax=Math.max(...trace.map(point=>point.iteration),1),low=Math.min(...values),high=Math.max(...values),x=value=>m.l+value/xmax*(W-m.l-m.r),y=value=>m.t+(1-(value-low)/Math.max(.0001,high-low))*(H-m.t-m.b);
  let grid='';for(let index=0;index<=4;index++){const yy=m.t+index*(H-m.t-m.b)/4;grid+=`<line x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}" class="chart-grid"/><text x="${m.l-8}" y="${yy+4}" text-anchor="end" class="chart-axis">${(high-index*(high-low)/4).toFixed(1)}</text>`;}
  const path=values.map((value,index)=>`${index?'L':'M'}${x(trace[index].iteration).toFixed(1)},${y(value).toFixed(1)}`).join(' '),stageMarks=trace.filter((point,index)=>index&&trace[index-1].stage!==point.stage).map(point=>`<text x="${x(point.iteration)}" y="18" class="legend">${esc(point.stage)}</text>`).join('');
  svg.innerHTML=`${grid}<path d="${path}" class="chart-line"/><text x="${m.l}" y="16" class="legend">log₁₀(1 + amaç/ceza)</text><text x="${W-m.r}" y="${H-9}" text-anchor="end" class="chart-axis">${xmax.toLocaleString('tr-TR')} iterasyon</text>${stageMarks}`;
}

$('#file').addEventListener('change',async event=>{try{loadRaw(JSON.parse(await event.target.files[0].text()));}catch(error){showError(`JSON okunamadı: ${error.message}`);}event.target.value='';});
$('#preset').addEventListener('change',event=>fetch(`./${event.target.value}`).then(response=>response.json()).then(loadRaw).catch(error=>showError(error.message)));
$('#models').addEventListener('change',restructure);$('#stationCount').addEventListener('change',restructure);
$('#taskTable').addEventListener('click',event=>{if(!event.target.classList.contains('task-delete'))return;current=readProblem();const index=[...event.currentTarget.tBodies[0].rows].indexOf(event.target.closest('tr'));current.tasks.splice(index,1);renderEditors();validateUi();});
$('#addTask').addEventListener('click',()=>{current=readProblem();const id=String(current.tasks.length+1);current.tasks.push({id,times:Object.fromEntries(current.models.map(model=>[model.id,0])),stations:Array.from({length:current.stationCount},()=>({rate:1,waste:0}))});renderEditors();validateUi();});
$('#mirrorStations').addEventListener('click',()=>{current=readProblem();for(const task of current.tasks)for(let station=0;station<Math.floor(current.stationCount/2);station++)task.stations[current.stationCount-1-station]={...task.stations[station]};renderStationFactors();});
$('#resetStationFactors').addEventListener('click',()=>{$$('#stationFactors [data-rate-task]').forEach(input=>input.value=1);$$('#stationFactors [data-waste-task]').forEach(input=>input.value=0);});
$('#resetPositionFactors').addEventListener('click',()=>{$$('#positionFactors input').forEach(input=>input.value=1);});
$('#paperDefaults').addEventListener('click',()=>{const defaults={temperature:1,cooling:.965,iterations:16000,weightCycle:1,weightWaste:1,weightOverload:1};for(const[key,value]of Object.entries(defaults))$(`[data-param="${key}"]`).value=value;});
$('#randomSeed').addEventListener('change',()=>{$('[data-param="seed"]').disabled=$('#randomSeed').checked;});
$('#continuousSearch').addEventListener('change',()=>{$('#run').textContent=$('#continuousSearch').checked?'Sürekli hesaplamayı başlat':'Hesapla';});
$('#run').addEventListener('click',startSearch);$('#runAgain').addEventListener('click',startSearch);$('#stop').addEventListener('click',()=>{continuous=false;if(restartTimer){clearTimeout(restartTimer);restartTimer=null;}if(worker){$('#status').textContent='Durduruluyor…';worker.postMessage({type:'stop'});}else{$('#status').textContent='Durduruldu';finish();}});
$('#clearHistory').addEventListener('click',()=>{archive=[];renderHistory();});
$('#runHistoryBody').addEventListener('click',event=>{const button=event.target.closest('[data-run]');if(!button)return;const item=archive.find(entry=>entry.id===Number(button.dataset.run));if(item){lastResult=item.result;renderResult(item.result);$('#status').textContent=`Saklanan çalışma ${item.id}`;$('#runSeed').textContent=`Tohum ${item.seed}`;}});
$('#downloadSvg').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([lastSvg],{type:'image/svg+xml'})),link=document.createElement('a');link.href=url;link.download='manavizadeh-istasyon-dizilimi.svg';link.click();URL.revokeObjectURL(url);});
$$('input,select').forEach(element=>{if(!['models','stationCount','preset','randomSeed','continuousSearch'].includes(element.id))element.addEventListener('input',validateUi);});

$('#randomSeed').dispatchEvent(new Event('change'));fetch('./article-teaching-example.json').then(response=>response.json()).then(loadRaw).catch(error=>showError(error.message));
