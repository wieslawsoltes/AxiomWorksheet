import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneBatch, clipLine } from '../src/renderer.js';
const bounds = {x:0,y:0,w:100,h:80};
test('clipping preserves contained segments',()=>assert.deepEqual(clipLine(10,20,90,60,bounds),[10,20,90,60]));
test('clipping rejects external parallel segments',()=>assert.equal(clipLine(-5,0,-5,90,bounds),null));
test('clipping handles two opposite intersections',()=>assert.deepEqual(clipLine(-10,40,110,40,bounds),[0,40,100,40]));
test('clipping handles vertical intersections',()=>assert.deepEqual(clipLine(50,-40,50,120,bounds),[50,0,50,80]));
test('clipping preserves boundary edges',()=>assert.deepEqual(clipLine(0,0,100,0,bounds),[0,0,100,0]));
test('clipping handles degenerate contained points',()=>assert.deepEqual(clipLine(5,5,5,5,bounds),[5,5,5,5]));
test('clipping rejects disjoint corners',()=>assert.equal(clipLine(-10,70,30,120,bounds),null));
test('rectangle meshes use two triangles and a 24-byte stride',()=>{
 const batch=new SceneBatch();batch.rect(1,2,3,4,'#804020',.5);
 assert.equal(batch.used,6*6);assert.equal(batch.used*4,6*24);
 assert.equal(batch.commands.length,1);assert.deepEqual([...batch.data.slice(0,2)],[1,2]);
 assert.ok(Math.abs(batch.data[2]-128/255)<1e-7);assert.equal(batch.data[5],.5);
});
test('line mesh contains opaque core and transparent feather vertices',()=>{
 const batch=new SceneBatch();batch.line(0,0,100,50,2,'#19866b');
 assert.equal(batch.used,18*6);assert.equal(batch.commands.length,1);
 const alpha=Array.from({length:18},(_,i)=>batch.data[i*6+5]);
 assert.ok(alpha.includes(0));assert.ok(alpha.includes(1));
 assert.ok([...batch.data.slice(0,batch.used)].every(Number.isFinite));
});
test('mesh skips degenerate primitives',()=>{
 const batch=new SceneBatch();batch.line(1,1,1,1);batch.rect(0,0,0,10,'#ffffff');
 assert.equal(batch.used,0);assert.equal(batch.commands.length,0);
});
test('mesh buffer grows geometrically without losing earlier vertices',()=>{
 const batch=new SceneBatch(),capacity=batch.data.length;
 for(let i=0;i<3000;i++)batch.rect(i,0,1,1,'#ffffff');
 assert.ok(batch.data.length>capacity);assert.equal(batch.used,3000*36);
 assert.equal(batch.data[0],0);assert.equal(batch.data[2999*36],2999);
});
test('mesh reset reuses allocated memory',()=>{
 const batch=new SceneBatch();batch.rect(0,0,1,1,'#ffffff');const data=batch.data;
 batch.reset();assert.equal(batch.data,data);assert.equal(batch.used,0);assert.equal(batch.commands.length,0);
});
