import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
test('standalone bundle parses as a JavaScript module and matches dist',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.equal(html,await readFile(new URL('../dist/index.html',import.meta.url),'utf8'));
 assert.equal((html.match(/<script type="module">/g)||[]).length,1);
 assert.ok(!html.includes('<!-- AXIOM_SCRIPT -->'));
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:script,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.ok(script.includes('const $$='),'Selector helper must survive bundle substitution unchanged');
});
