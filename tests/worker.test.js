/** Tests the actual worker message handler on a real Node background thread.
 * This validates message cloning, ordering and persistent kernel state, not browser worker startup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {beamExample} from '../src/document.js';
const kernelURL=new URL('../src/kernel.js',import.meta.url);
const source=(await readFile(new URL('../src/worker.js',import.meta.url),'utf8'))
 .replace("'./kernel.js'",JSON.stringify(kernelURL.href));
const bridge=`import {parentPort} from 'node:worker_threads';
 globalThis.self={postMessage:data=>parentPort.postMessage(data)};
 ${source}
 parentPort.on('message',data=>self.onmessage({data}));`;
const start=()=>new Worker(new URL('data:text/javascript,'+encodeURIComponent(bridge)));
function request(worker,id,document){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{cleanup();reject(Error('Worker test timed out'));},5000);
  const cleanup=()=>{clearTimeout(timer);worker.off('message',receive);worker.off('error',fail);};
  const receive=data=>{if(data.id===id){cleanup();resolve(data);}};
  const fail=error=>{cleanup();reject(error);};
  worker.on('message',receive);worker.on('error',fail);worker.postMessage({type:'calculate',id,document});
 });
}
test('worker returns cloneable quantities, user functions, and plot samples',async t=>{
 const worker=start();t.after(()=>worker.terminate());
 const result=await request(worker,17,beamExample());
 assert.equal(result.id,17);assert.equal(result.errors,0);assert.equal(result.fatal,undefined);
 assert.ok(Math.abs(result.results['tip-deflection'].formatted.magnitude-3.968253968253969)<1e-12);
 assert.ok(result.variables.some(v=>v.formatted.kind==='function'));
 assert.ok(Object.values(result.results).some(r=>r.plot?.series[0].points.length>500));
});
test('worker preserves its incremental cache between messages',async t=>{
 const worker=start();t.after(()=>worker.terminate());const doc=beamExample();
 await request(worker,1,doc);const cached=await request(worker,2,doc);
 assert.ok(cached.cacheHits>0);assert.equal(cached.plotCacheHits,1);
 doc.regions.find(r=>r.id==='length').source='L := 4 m';
 const updated=await request(worker,3,doc);assert.equal(updated.errors,0);
 assert.ok(Math.abs(updated.results['tip-deflection'].formatted.magnitude-3.968253968253969*(4/3)**4)<1e-10);
});
test('worker serializes fatal failures instead of throwing across the channel',async t=>{
 const worker=start();t.after(()=>worker.terminate());
 const result=await request(worker,8,{});assert.equal(result.id,8);assert.equal(typeof result.fatal,'string');
 const recovery=await request(worker,9,beamExample());assert.equal(recovery.errors,0);
});
