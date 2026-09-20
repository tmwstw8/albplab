import { normalizeProblem, validateProblem } from './solver.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let models=[],tasks=[],worker=null,history=[],lastResult=null,lastSvg='',selectedCycle=0,runStartedAt=0,continuousActive=false,runArchive=[],runCounter=0,searchProblem=null,searchBaseParams=null,historySort={key:'id',direction:'desc'};

function parseModels(){return $('#models').value.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const[id,demand]=x.split(':');return{id:(id||'').trim(),demand:Number(demand)};});}
function readTasks(){return $$('#taskTable tbody tr').map(tr=>({id:tr.querySelector('[data-k=id]').value.trim(),predecessors:tr.querySelector('[data-k=pred]').value.split(',').map(x=>x.trim()).filter(Boolean),times:Object.fromEntries(models.map(m=>[m.id,Number(tr.querySelector(`[data-model="${CSS.escape(m.id)}"]`)?.value||0)]))}));}
function problemFromUi(){models=parseModels();tasks=readTasks();return{name:$('#name').value.trim(),cycleTime:Number($('#cycle').value),models,tasks};}

function renderTasks(){
  models=parseModels(); const head=$('#taskHead');head.innerHTML='<th>ID</th><th>Predecessors</th>'+models.map(m=>`<th>${escapeHtml(m.id)} time</th>`).join('')+'<th></th>';
  const body=$('#taskTable tbody');body.innerHTML='';
  for(const task of tasks){const tr=document.createElement('tr');tr.innerHTML=`<td><input data-k="id" value="${escapeHtml(task.id)}"></td><td><input data-k="pred" value="${escapeHtml((task.predecessors||[]).join(', '))}"></td>${models.map(m=>`<td><input type="number" min="0" step="any" data-model="${escapeHtml(m.id)}" value="${Number(task.times?.[m.id]||0)}"></td>`).join('')}<td><button class="task-delete" aria-label="Delete task">×</button></td>`;body.append(tr);}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function loadRaw(raw){const p=normalizeProblem(raw);models=p.models;tasks=p.tasks;$('#name').value=p.name;$('#cycle').value=p.cycleTime;$('#models').value=models.map(m=>`${m.id}:${m.demand}`).join(', ');renderTasks();const params={...raw.saParams,...p.saParams};for(const[k,v]of Object.entries(params)){const el=$(`[data-param="${k}"]`);if(el)el.value=v;}validateUi();}
function validateUi(){try{const p=problemFromUi(),errors=validateProblem(p);$('#validation').textContent=errors.join('\n');return !errors.length;}catch(e){$('#validation').textContent=e.message;return false;}}
function params(){return Object.fromEntries($$('[data-param]').map(x=>[x.dataset.param,Number(x.value)]));}

function startSearch(){if(!validateUi())return;continuousActive=$('#continuousSearch').checked;searchProblem=problemFromUi();searchBaseParams={...params(),usePublishedBenchmark:$('#publishedBenchmark').checked};$('#continuousSearch').disabled=true;runOnce();}
function runOnce(){
  if(continuousActive||$('#randomSeed').checked){const randomSeed=crypto.getRandomValues(new Uint32Array(1))[0]||1;$('[data-param="seed"]').value=randomSeed;}
  const runParams={...searchBaseParams,seed:Number($('[data-param="seed"]').value)};runStartedAt=performance.now();history=[];drawChart();$('#run').disabled=true;$('#runAgain').disabled=true;$('#stop').disabled=false;$('#status').textContent=continuousActive?`Continuous search · ${runArchive.length} stored`:'Annealing…';$('#runSeed').textContent=`Seed ${runParams.seed}`;$('#speed').textContent='Calculating…';$('#elapsed').textContent='0.00 s';
  worker?.terminate();worker=new Worker('./worker.js',{type:'module'});
  worker.onmessage=e=>{if(e.data.type==='progress'){history.push(e.data.payload.point);renderLive(e.data.payload.best,e.data.payload.point);}else if(e.data.type==='done'){const seconds=Math.max(.001,(performance.now()-runStartedAt)/1000);lastResult=e.data.result;history=e.data.result.history;renderLive(lastResult.best,history.at(-1));renderSolution(lastResult.best);if(!e.data.cancelled)storeResult(lastResult,runParams.seed,seconds,false);if(continuousActive&&!e.data.cancelled){$('#status').textContent=`Continuous search · ${runArchive.length} stored`;setTimeout(()=>{if(continuousActive)runOnce();else finish();},120);}else{continuousActive=false;$('#status').textContent=e.data.cancelled?'Stopped':'Run complete';finish();}}else if(continuousActive){$('#validation').textContent=`Seed ${runParams.seed} failed: ${e.data.message}\nContinuing with a new seed…`;$('#status').textContent='Run failed · continuing';setTimeout(()=>{if(continuousActive)runOnce();else finish();},250);}else{showError(e.data.message);finish();}};
  worker.postMessage({type:'start',problem:searchProblem,params:runParams});
}
function finish(){$('#run').disabled=false;$('#runAgain').disabled=false;$('#stop').disabled=true;$('#continuousSearch').disabled=false;}
function showError(message){$('#validation').textContent=message;$('#status').textContent='Run failed';}
function multistationCount(best){return best.stations.filter(s=>s.forward.length&&s.backward.length).length;}
function renderLive(best,point){const seconds=Math.max(.001,(performance.now()-runStartedAt)/1000),rate=Math.round(point.iteration/seconds);$('#mStations').textContent=best.stationCount;$('#mMulti').textContent=multistationCount(best);$('#mAdw').textContent=best.adw.toFixed(2);$('#mOver').textContent=best.overload.toFixed(2);$('#mPrec').textContent=best.precedenceFeasible?'✓':'Invalid';$('#mEff').textContent=`${(best.efficiency*100).toFixed(1)}%`;$('#speed').textContent=`${rate.toLocaleString()} iter/s`;$('#elapsed').textContent=`${seconds.toFixed(2)} s`;$('#temperature').textContent=`T ${point.T.toFixed(3)} · ${point.iteration.toLocaleString()} iterations`;drawChart();}

function storeResult(result,seed,seconds,cancelled){
  const entry={id:++runCounter,seed,result,seconds,cancelled,speed:Math.round(result.iterations/seconds)};runArchive.unshift(entry);renderHistory();
}
function renderHistory(){
  $('#clearHistory').disabled=!runArchive.length;
  const value=(x,key)=>{const b=x.result.best;return({id:x.id,seed:x.seed,stations:b.stationCount,multi:multistationCount(b),adw:b.adw,overload:b.overload,efficiency:b.efficiency,speed:x.speed,seconds:x.seconds})[key];};
  $$('#historyTable .sort-button').forEach(button=>{const active=button.dataset.sort===historySort.key;button.classList.toggle('is-sorted',active);button.setAttribute('aria-label',`${button.textContent.replace(/[▲▼]/g,'').trim()}${active?`, sorted ${historySort.direction==='asc'?'ascending':'descending'}`:''}`);button.textContent=button.textContent.replace(/\s*[▲▼]$/,'')+(active?(historySort.direction==='asc'?' ▲':' ▼'):'');});
  if(!runArchive.length){$('#historyBest').innerHTML='';$('#runHistoryBody').innerHTML='<tr><td colspan="10" class="history-empty">Completed calculations will appear here.</td></tr>';return;}
  const bestStations=Math.min(...runArchive.map(x=>value(x,'stations'))),bestMulti=Math.max(...runArchive.map(x=>value(x,'multi'))),bestAdw=Math.min(...runArchive.map(x=>value(x,'adw'))),bestEfficiency=Math.max(...runArchive.map(x=>value(x,'efficiency')));
  $('#historyBest').innerHTML=`<span><b>${bestStations}</b> min stations</span><span><b>${bestMulti}</b> max multistations</span><span><b>${bestAdw.toFixed(2)}</b> min ADW</span><span><b>${(bestEfficiency*100).toFixed(1)}%</b> max efficiency</span>`;
  const overall=[...runArchive].sort((a,b)=>value(a,'stations')-value(b,'stations')||value(a,'adw')-value(b,'adw')||value(b,'efficiency')-value(a,'efficiency'))[0].id;
  const sorted=[...runArchive].sort((a,b)=>{const d=value(a,historySort.key)-value(b,historySort.key);return(historySort.direction==='asc'?1:-1)*(d||a.id-b.id);});
  $('#runHistoryBody').innerHTML=sorted.map(x=>{const b=x.result.best,s=value(x,'stations'),m=value(x,'multi'),a=value(x,'adw'),e=value(x,'efficiency');return`<tr class="${x.id===overall?'best-overall-row':''}"><td>${x.id}</td><td>${x.seed}</td><td class="${s===bestStations?'best-cell':''}">${s}</td><td class="${m===bestMulti?'best-cell':''}">${m}</td><td class="${Math.abs(a-bestAdw)<1e-9?'best-cell':''}">${a.toFixed(2)}</td><td>${b.overload.toFixed(2)}</td><td class="${Math.abs(e-bestEfficiency)<1e-12?'best-cell':''}">${(e*100).toFixed(1)}%</td><td>${x.speed.toLocaleString()} iter/s</td><td>${x.seconds.toFixed(2)} s</td><td><button class="secondary history-show" data-run-id="${x.id}">Show</button></td></tr>`;}).join('');
}
function showStoredResult(id){const x=runArchive.find(r=>r.id===id);if(!x)return;lastResult=x.result;history=x.result.history;renderSolution(lastResult.best);const point=history.at(-1);$('#mStations').textContent=lastResult.best.stationCount;$('#mMulti').textContent=multistationCount(lastResult.best);$('#mAdw').textContent=lastResult.best.adw.toFixed(2);$('#mOver').textContent=lastResult.best.overload.toFixed(2);$('#mPrec').textContent=lastResult.best.precedenceFeasible?'✓':'Invalid';$('#mEff').textContent=`${(lastResult.best.efficiency*100).toFixed(1)}%`;$('#runSeed').textContent=`Seed ${x.seed}`;$('#speed').textContent=`${x.speed.toLocaleString()} iter/s`;$('#elapsed').textContent=`${x.seconds.toFixed(2)} s`;$('#temperature').textContent=`T ${point.T.toFixed(3)} · ${point.iteration.toLocaleString()} iterations`;$('#status').textContent=`Stored run ${x.id}`;drawChart();}

function drawChart(){
  const svg=$('#chart'),W=900,H=210,m={l:66,r:54,t:20,b:36};svg.innerHTML='';if(history.length<2){svg.innerHTML='<text x="450" y="105" text-anchor="middle" class="chart-axis">The live trace appears here.</text>';return;}
  const xs=history.map(x=>x.iteration),ys=history.map(x=>x.best),os=history.map(x=>x.overload),xmax=Math.max(...xs,1),ymin=Math.min(...ys),ymax=Math.max(...ys),omax=Math.max(...os,1);
  const x=v=>m.l+(v/xmax)*(W-m.l-m.r),y=v=>m.t+(1-(v-ymin)/Math.max(1,ymax-ymin))*(H-m.t-m.b),yo=v=>m.t+(1-v/omax)*(H-m.t-m.b);
  for(let i=0;i<=4;i++){const yy=m.t+i*(H-m.t-m.b)/4;svg.insertAdjacentHTML('beforeend',`<line x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}" class="chart-grid"/><text x="${m.l-8}" y="${yy+4}" text-anchor="end" class="chart-axis">${(ymax-i*(ymax-ymin)/4).toExponential(1)}</text><text x="${W-m.r+8}" y="${yy+4}" class="chart-axis">${(omax-i*omax/4).toFixed(0)}</text>`);}
  const path=(arr,fy)=>arr.map((v,i)=>`${i?'L':'M'}${x(history[i].iteration).toFixed(1)},${fy(v).toFixed(1)}`).join(' ');
  svg.insertAdjacentHTML('beforeend',`<path d="${path(ys,y)}" class="chart-line"/><path d="${path(os,yo)}" class="chart-over"/><text x="${m.l}" y="${H-10}" class="chart-axis">0</text><text x="${W-m.r}" y="${H-10}" text-anchor="end" class="chart-axis">${xmax.toLocaleString()} iterations</text><text x="${m.l}" y="14" class="legend">● best energy</text><text x="${m.l+110}" y="14" class="legend">--- overload (right axis)</text>`);
}

function modelAt(sequence,index){const n=sequence.length;return sequence[((index%n)+n)%n];}
function solutionSvg(result,cycle){
  const K=result.stationCount,space=140,left=115,top=158,bottom=370,bend=left+(K-1)*space+76,W=Math.max(900,bend+155),H=465;
  const stationGroups=result.stations.map((s,j)=>{
    const x=left+j*space,front=s.forward,back=s.backward,cross=front.length&&back.length;
    const fw=Math.max(82,front.length*42+24),bw=Math.max(82,back.length*42+24),boxW=Math.max(fw,bw);
    const rectY=cross?top-43:(front.length?top-43:bottom-43),rectH=cross?bottom-top+86:86;
    const frontModel=modelAt(result.sequence,cycle+1-j),backModel=modelAt(result.sequence,cycle+j);
    const circles=(ids,y)=>ids.map((id,n)=>{const px=x+(n-(ids.length-1)/2)*42;return`<circle cx="${px}" cy="${y}" r="17" class="task-circle"/><text x="${px}" y="${y+4}" text-anchor="middle" class="task-text">${escapeHtml(id)}</text>`;}).join('');
    return`<g class="workstation"><rect x="${x-boxW/2}" y="${rectY}" width="${boxW}" height="${rectH}" rx="12" class="station-zone ${cross?'crossover':'classic'}"/><circle cx="${x-boxW/2+10}" cy="${rectY-10}" r="4" class="${cross?'cross-dot':'classic-dot'}"/><text x="${x}" y="${rectY-6}" text-anchor="middle" class="station-name">S${j+1}</text>${front.length?`<text x="${x}" y="${top-66}" text-anchor="middle" class="model-name">${escapeHtml(frontModel)}</text>`:''}${back.length?`<text x="${x}" y="${bottom+72}" text-anchor="middle" class="model-name">${escapeHtml(backModel)}</text>`:''}${circles(front,top)}${circles(back,bottom)}<text x="${x}" y="${cross?(top+bottom)/2+5:(front.length?top+58:bottom-52)}" text-anchor="middle" class="station-index">${j+1}</text></g>`;
  }).join('');
  const seq=result.sequence.map(escapeHtml).join(' → ');
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="lt ld"><title id="lt">U-shaped assembly line for cycle ${cycle+1}</title><desc id="ld">${K} workstations. Model sequence ${seq}.</desc><style>.route{fill:none;stroke:#7d8984;stroke-width:4}.route-arrow{fill:#7d8984}.station-zone{fill:#f4f6f5;stroke:#96a29d;stroke-width:1.5;stroke-dasharray:6 5}.station-zone.crossover{fill:#e9f2ee}.task-circle{fill:#fff;stroke:#175e4b;stroke-width:2}.task-text,.station-name,.caption,.legend-text{fill:#17201d;font-family:Inter,Arial,sans-serif}.task-text{font-size:12px}.station-name{font-size:12px}.model-name{fill:#175e4b;font:700 15px Inter,Arial,sans-serif}.station-index{fill:#66716d38;font:700 21px Inter,Arial,sans-serif}.caption{font-size:13px}.subcaption,.legend-text{fill:#66716d;font:11px Inter,Arial,sans-serif}.cross-dot{fill:#175e4b}.classic-dot{fill:#89948f}</style><defs><marker id="flow-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L0,7 L8,3.5 z" class="route-arrow"/></marker></defs><text x="54" y="34" class="caption">MS = ${seq}</text><text x="54" y="52" class="subcaption">cycle ${cycle+1} of ${result.sequence.length}</text><circle cx="${W-205}" cy="34" r="4" class="cross-dot"/><text x="${W-195}" y="38" class="legend-text">crossover</text><circle cx="${W-115}" cy="34" r="4" class="classic-dot"/><text x="${W-105}" y="38" class="legend-text">classic</text><path d="M48 ${top} H${bend} Q${bend+76} ${top} ${bend+76} ${top+76} V${bottom-76} Q${bend+76} ${bottom} ${bend} ${bottom} H48" class="route" marker-end="url(#flow-arrow)"/><text x="26" y="${top-15}" class="subcaption">entry</text><text x="26" y="${bottom+26}" class="subcaption">exit</text>${stationGroups}</svg>`;
}
function renderLayout(result){lastSvg=solutionSvg(result,selectedCycle);$('#layout').className='';$('#layout').innerHTML=lastSvg;$('#downloadSvg').disabled=false;}
function renderMatrix(result){
  const K=result.stationCount,L=result.sequence.length;
  let h='<table class="results-table"><thead><tr><th>Workstation</th>'+result.stations.map((_,j)=>`<th colspan="3">Station ${j+1}</th>`).join('')+'</tr><tr><th>[{SF<sub>j</sub>}, {SB<sub>j</sub>}]</th>'+result.stations.map(s=>`<th colspan="3">[{${escapeHtml(s.forward.join(', ')||'∅')}}, {${escapeHtml(s.backward.join(', ')||'∅')}}]</th>`).join('')+'</tr><tr><th>Cycle</th>'+result.stations.map(()=>'<th>α<sub>j</sub><sup>r</sup></th><th>β<sub>j</sub><sup>r</sup></th><th>W<sub>jr</sub></th>').join('')+'</tr></thead><tbody>';
  for(let r=0;r<L;r++){
    h+=`<tr data-cycle="${r}" aria-selected="${r===selectedCycle}" class="${r===selectedCycle?'cycle-selected':''}"><th><button class="cycle-button" data-cycle="${r}" aria-label="Show cycle ${r+1} in layout">${r+1}</button></th>`;
    for(let j=0;j<K;j++){const s=result.stations[j],a=s.forward.length?modelAt(result.sequence,r+1-j):'—',b=s.backward.length?modelAt(result.sequence,r+j):'—',w=result.cycleLoads[j][r];h+=`<td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td><td class="${w>Number($('#cycle').value)?'load-over':''}">${w.toFixed(1)}</td>`;}
    h+='</tr>';
  }
  $('#matrix').innerHTML=h+'</tbody></table><p class="matrix-hint">Select a cycle row to update the model flow in the layout.</p>';
}
function selectCycle(cycle){if(!lastResult)return;selectedCycle=Math.max(0,Math.min(lastResult.best.sequence.length-1,cycle));renderLayout(lastResult.best);renderMatrix(lastResult.best);$('#sequence').textContent=`Sequence ${lastResult.best.sequence.join(' · ')} · Cycle ${selectedCycle+1}`;}
function renderSolution(result){selectedCycle=0;renderLayout(result);renderMatrix(result);$('#sequence').textContent=`Sequence ${result.sequence.join(' · ')} · Cycle 1`;}

$('#file').addEventListener('change',async e=>{try{loadRaw(JSON.parse(await e.target.files[0].text()));}catch(err){showError(`Could not import JSON: ${err.message}`);}e.target.value='';});
$('#preset').addEventListener('change',e=>fetch(`./${e.target.value}`).then(r=>r.json()).then(loadRaw).catch(err=>showError(err.message)));
$('#models').addEventListener('change',()=>{tasks=readTasks();renderTasks();validateUi();});
$('#taskTable').addEventListener('input',validateUi);$('#cycle').addEventListener('input',validateUi);
$('#matrix').addEventListener('click',e=>{const row=e.target.closest('tr[data-cycle]');if(row)selectCycle(Number(row.dataset.cycle));});
$('#runHistoryBody').addEventListener('click',e=>{const button=e.target.closest('.history-show');if(button)showStoredResult(Number(button.dataset.runId));});
$('#historyTable thead').addEventListener('click',e=>{const button=e.target.closest('.sort-button');if(!button)return;const key=button.dataset.sort;if(historySort.key===key)historySort.direction=historySort.direction==='asc'?'desc':'asc';else{historySort.key=key;historySort.direction=['id','seed','multi','efficiency','speed'].includes(key)?'desc':'asc';}renderHistory();});
$('#taskTable').addEventListener('click',e=>{if(e.target.classList.contains('task-delete')){const i=[...e.currentTarget.tBodies[0].rows].indexOf(e.target.closest('tr'));tasks=readTasks();tasks.splice(i,1);renderTasks();validateUi();}});
$('#addTask').onclick=()=>{tasks=readTasks();tasks.push({id:String(tasks.length+1),predecessors:[],times:Object.fromEntries(parseModels().map(m=>[m.id,0]))});renderTasks();};
$('#paperDefaults').onclick=()=>{const d={T0:1000,Tmin:1,IT:10,R:.95,p1:.7,p2:.5,p3:.5,maxIterations:300000};for(const[k,v]of Object.entries(d))$(`[data-param="${k}"]`).value=v;};
function syncSeedMode(){$('[data-param="seed"]').disabled=$('#randomSeed').checked;}
$('#randomSeed').addEventListener('change',syncSeedMode);syncSeedMode();
function syncContinuousLabel(){$('#run').textContent=$('#continuousSearch').checked?'Start continuous search':'Run annealing';}
$('#continuousSearch').addEventListener('change',syncContinuousLabel);syncContinuousLabel();
$('#run').onclick=startSearch;$('#runAgain').onclick=startSearch;$('#stop').onclick=()=>{continuousActive=false;$('#status').textContent='Stopping…';worker?.postMessage({type:'stop'});};
$('#clearHistory').onclick=()=>{runArchive=[];renderHistory();};
$('#downloadSvg').onclick=()=>{const blob=new Blob([lastSvg],{type:'image/svg+xml'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='u-line-layout.svg';a.click();URL.revokeObjectURL(a.href);};

fetch('../MMU_21Task_180s.json').then(r=>r.ok?r.json():fetch('./example-problem.json').then(x=>x.json())).then(loadRaw).catch(()=>loadRaw({cycleTime:180,models:[{id:'A',demand:1}],tasks:[]}));
