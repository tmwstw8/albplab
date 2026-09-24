import{normalizeProblem,solve}from'./solver.js';
import{buildPoolArchive,poolArchiveBlob}from'./archive.js';
let cancel=false;
self.onmessage=async e=>{if(e.data.type==='stop'){cancel=true;return;}if(e.data.type!=='start')return;cancel=false;try{const problem=normalizeProblem(e.data.problem),result=await solve(problem,e.data.params,x=>self.postMessage({type:'progress',payload:x}),()=>cancel),archive=buildPoolArchive({problem,params:e.data.params,result,history:[],view:{}}),resultBlob=poolArchiveBlob(archive);self.postMessage({type:'done',resultBlob,poolDropped:result.poolDropped||0,cancelled:cancel});}catch(error){self.postMessage({type:'error',message:error.message});}};
