import { anneal, normalizeProblem } from './solver.js';
let cancel=false;
self.onmessage=async e=>{if(e.data.type==='stop'){cancel=true;return;}if(e.data.type!=='start')return;cancel=false;try{const result=await anneal(normalizeProblem(e.data.problem),e.data.params,x=>self.postMessage({type:'progress',payload:x}),()=>cancel);self.postMessage({type:'done',result,cancelled:cancel});}catch(error){self.postMessage({type:'error',message:error.message});}};
