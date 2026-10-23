import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startSession} from './test-support/cdp-browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/alignment-legacy.json',import.meta.url),'utf8')).project;
const b=await startSession({root,path:'/design',profile:'.test-build/chrome-alignment'});
try{
 await b.waitFor(()=>b.count('[data-design-ready="true"]'),'ready');
 await b.evalValue(`localStorage.setItem('thai-street-road-first-v1',${JSON.stringify(JSON.stringify(fixture))})`);
 await b.send('Page.reload');await b.waitFor(()=>b.count('[data-alignment-review]'),'legacy loaded');
 const current=()=>b.evalValue(`JSON.parse(localStorage.getItem('thai-street-road-first-v1')).scenarios[0].project`);
 assert.deepEqual(await current(),fixture,'opening does not migrate');
 await b.click('[data-alignment-review]');await b.waitFor(()=>b.count('dialog[open]'),'preview');
 await b.screenshot('artifacts/alignment-upgrade-preview.png');
 assert.match(await b.text('[data-alignment-changes]'),/2000\.000/);
 await b.click('[data-alignment-cancel]');assert.deepEqual(await current(),fixture,'cancel unchanged');
 await b.click('[data-alignment-review]');await b.click('[data-alignment-confirm]');
 await b.waitFor(async()=>(await current()).schemaVersion===2,'confirmed');
 const upgraded=await current();assert.equal(upgraded.roads[0].alignment,'arc');assert.deepEqual(upgraded.roads[0].origin,fixture.roads[0].origin);
 await b.click('[data-design-undo]');await b.waitFor(async()=>(await current()).schemaVersion===1,'undo all');assert.deepEqual(await current(),fixture);
 await b.click('[data-design-redo]');await b.waitFor(async()=>(await current()).schemaVersion===2,'redo all');
 await b.send('Page.reload');await b.waitFor(()=>b.count('[data-design-ready="true"]'),'reopened');assert.deepEqual(await current(),upgraded);
 await b.click('[data-design-view="3d"]');await b.waitFor(()=>b.count('.network-scene3d'),'3D');await b.screenshot('artifacts/alignment-upgrade-3d.png');
 assert.deepEqual(b.errors,[]);
 console.log('PASS alignment browser: open legacy unchanged; preview/cancel; confirm; undo/redo; reload; shared 3D. Conversion: 2 clicks (preview, confirm).');
}finally{b.close();}
