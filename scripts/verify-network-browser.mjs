import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const artifactDir='artifacts',profileDir='.sites-runtime/chrome-network-acceptance';
mkdirSync(artifactDir,{recursive:true});rmSync(profileDir,{recursive:true,force:true});

function commandPath(names){
  for(const name of names){
    const r=spawnSync('which',[name],{encoding:'utf8'});
    if(r.status===0&&r.stdout.trim())return r.stdout.trim();
  }
  return null;
}
function freePort(){
  return new Promise((resolve,reject)=>{
    const server=createServer();server.unref();server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address(),port=typeof address==='object'&&address?address.port:0;
      server.close(error=>error?reject(error):resolve(port));
    });
  });
}
const port=Number(process.env.TSD_BROWSER_PORT)||await freePort();
let debugPort=Number(process.env.TSD_CDP_PORT)||await freePort();
while(debugPort===port)debugPort=await freePort();
const baseUrl=`http://127.0.0.1:${port}/`,started=Date.now();
const report={schema:1,status:'running',startedAt:new Date().toISOString(),baseUrl,checkpoints:[],runtimeErrors:[]};
let checkpoint='boot';
function mark(name,details={}){
  checkpoint=name;report.checkpoints.push({name,atMs:Date.now()-started,...details});
}
function writeReport(extra={}){
  writeFileSync(artifactDir+'/network-browser-report.json',JSON.stringify({...report,...extra,currentCheckpoint:checkpoint},null,2));
}
async function waitForHttp(url,timeout=45000){
  const until=Date.now()+timeout;
  while(Date.now()<until){
    try{const r=await fetch(url);if(r.ok)return;}catch{}
    await sleep(250);
  }
  throw new Error('Timed out waiting for '+url);
}
async function waitForJson(url,timeout=30000){
  const until=Date.now()+timeout;
  while(Date.now()<until){
    try{const r=await fetch(url);if(r.ok)return await r.json();}catch{}
    await sleep(200);
  }
  throw new Error('Timed out waiting for '+url);
}

const server=spawn(process.execPath,['scripts/run-next.mjs','start','-p',String(port)],{cwd:root,env:{...process.env,TSD_BUILD_TARGET:'vercel'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
let chrome=null,ws=null,seq=0;const pending=new Map();let runtimeErrors=[];
const shutdown=()=>{
  try{ws?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  try{server.kill('SIGTERM');}catch{}
};
process.on('SIGINT',()=>{shutdown();process.exit(130);});
process.on('SIGTERM',()=>{shutdown();process.exit(143);});

try{
  mark('server-start');
  await waitForHttp(baseUrl);
  const chromePath=process.env.CHROME_BIN||commandPath(['google-chrome','google-chrome-stable','chromium','chromium-browser']);
  assert(chromePath,'Chrome/Chromium is required for browser acceptance');
  chrome=spawn(chromePath,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,'--window-size=1440,1000','about:blank'
  ],{stdio:'ignore'});
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl)}`,{method:'PUT'}).then(r=>r.json());
  assert(target.webSocketDebuggerUrl,'Chrome did not return a CDP websocket target');

  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  runtimeErrors=[];
  ws.addEventListener('message',event=>{
    const msg=JSON.parse(String(event.data));
    if(msg.id){
      const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timer);
      if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);
      return;
    }
    if(msg.method==='Runtime.exceptionThrown')runtimeErrors.push(msg.params.exceptionDetails?.text??'Runtime exception');
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')runtimeErrors.push('console.error: '+msg.params.args?.map(v=>v.value??v.description??'').join(' '));
  });
  const send=(method,params={},timeout=15000)=>new Promise((resolve,reject)=>{
    const id=++seq,timer=globalThis.setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout after ${timeout} ms: ${method}`));},timeout);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:baseUrl});

  async function evalValue(expression){
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.text??'Runtime evaluate failed');
    return r.result?.value;
  }
  async function waitFor(fn,label,timeout=20000){
    const until=Date.now()+timeout;let last;
    while(Date.now()<until){
      try{last=await fn();if(last)return last;}catch{}
      await sleep(120);
    }
    throw new Error('Timed out: '+label+'; last='+JSON.stringify(last));
  }
  async function rectBySelector(selector,index=0){
    return await evalValue(`(()=>{const e=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
  }
  async function clickAt(p,count=1){
    assert(p&&Number.isFinite(p.x)&&Number.isFinite(p.y),'Missing click target');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:count});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:count});
  }
  async function clickSelector(selector,index=0){const p=await waitFor(()=>rectBySelector(selector,index),selector);await clickAt(p);}
  async function dragSelector(selector,dx,dy){
    const p=await waitFor(()=>rectBySelector(selector),selector);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});
    await sleep(80);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});
  }
  async function screenshot(name){
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},20000);
    const bytes=Buffer.from(shot.data,'base64');assert(bytes.length>5000,'Screenshot is unexpectedly small: '+name);
    writeFileSync(artifactDir+'/'+name,bytes);return bytes.length;
  }
  const project=()=>evalValue(`(()=>{try{return JSON.parse(localStorage.getItem('thai-street-network-project-v1')||'null')}catch{return null}})()`);
  const projectSummary=p=>({version:p?.version,junctions:p?.junctions?.length??0,links:p?.links?.length??0,link2:p?.links?.find(v=>v.id==='L-2')??null});

  mark('workspace-load');
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'Network workspace load');
  await evalValue(`localStorage.clear();location.reload();true`);
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'clean reload');
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===2&&p?.links?.length===1;},'default project persistence');
  const initial2d=await evalValue(`(()=>{const svg=document.querySelector('svg[data-network-plan="true"]'),z=document.querySelector('.network-zoom'),body=document.querySelector('.network-body');return {span:Number(svg?.getAttribute('data-network-view-span')||0),zoom:Number(z?.getAttribute('data-network-zoom-value')||0),viewWidth:svg?.viewBox?.baseVal?.width||0,inspector:body?.getAttribute('data-network-inspector')};})()`);
  assert(initial2d.span>=590&&Math.abs(initial2d.zoom-1)<1e-8&&initial2d.viewWidth>=590,'2D 100% must start with the wider Network-scale view');
  assert.equal(initial2d.inspector,'open','Inspector should open by default');
  await clickSelector('[data-network-action="toggle-inspector"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-body')?.getAttribute('data-network-inspector')==='closed'`),'collapse Inspector');
  await clickSelector('[data-network-action="toggle-inspector"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-body')?.getAttribute('data-network-inspector')==='open'`),'reopen Inspector');
  for(let i=0;i<7;i++)await clickSelector('[data-network-zoom-action="out"]');
  await waitFor(()=>evalValue(`Number(document.querySelector('.network-zoom')?.getAttribute('data-network-zoom-value')||1)<.35`),'2D zoom below legacy 35% floor');
  await clickSelector('[data-network-zoom-action="fit"]');await sleep(180);

  mark('create-junction');
  await clickSelector('[data-network-tool="junction"]');
  const plan=await rectBySelector('svg[data-network-plan="true"]');
  await clickAt({x:plan.x+plan.w*.25,y:plan.y-plan.h*.27});
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===3;},'create J-3');
  await clickSelector('[data-network-action="fit"]');await sleep(180);

  mark('connect-link');
  await clickSelector('[data-network-tool="link"]');
  await clickSelector('[data-network-port="J-1:1"]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-port="J-1:1"]')?.getAttribute('data-network-port-state')==='source'`),'source port state');
  await clickSelector('[data-network-port="J-3:3"]');
  await waitFor(async()=>{const p=await project();return p?.links?.length===2&&p.links.some(l=>l.id==='L-2');},'connect L-2');

  mark('edit-alignment');
  await clickSelector('[data-network-link="L-2"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-context-bar')?.getAttribute('data-network-context-kind')==='link'`),'RoadLink contextual command bar');
  await clickSelector('[data-network-context-action="add-pi"]');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.via?.length===1;},'add PI');
  const beforeDrag=await project(),beforeVia=beforeDrag.links.find(l=>l.id==='L-2').via[0];
  await dragSelector('[data-link-via="0"]',34,-24);
  await waitFor(async()=>{const p=await project(),v=p?.links?.find(l=>l.id==='L-2')?.via?.[0];return v&&Math.hypot(v.x-beforeVia.x,v.y-beforeVia.y)>1;},'drag PI');

  mark('create-lane-mismatch');
  await clickSelector('[data-network-junction-hit="J-3:3"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-context-bar')?.getAttribute('data-network-context-kind')==='arm'`),'Arm contextual command bar');
  const laneBefore=(await project()).junctions.find(j=>j.id==='J-3').design.arms[3].incoming;
  assert(laneBefore<4,'Golden flow needs room to add one incoming lane');
  await clickSelector('[data-network-context-action="incoming-inc"]');
  await waitFor(async()=>{const p=await project();return p?.junctions?.find(j=>j.id==='J-3')?.design?.arms?.[3]?.incoming===laneBefore+1;},'lane mismatch edit');

  mark('resolve-section');
  await clickSelector('[data-network-link="L-2"]');
  await waitFor(()=>evalValue(`!!document.querySelector('[data-network-transition-side="forward-curb"]')`),'lane transition controls');
  await clickSelector('[data-network-transition-side="forward-curb"]');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.forwardLaneTransition?.side==='curb';},'curb lane transition');
  const sectionEnabled=await evalValue(`!document.querySelector('select[data-network-section-mode="link"]')?.disabled`);
  assert.equal(sectionEnabled,true,'Resolved section mode should be enabled after explicit lane transition');
  await evalValue(`(()=>{const s=document.querySelector('select[data-network-section-mode="link"]');if(!s)return false;s.value='linear';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.mode==='linear';},'resolved section transition');

  mark('undo-redo');
  await clickSelector('[data-network-action="undo"]');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.mode==='review';},'undo section mode');
  await waitFor(()=>evalValue(`(()=>{const b=document.querySelector('[data-network-action="redo"]');return !!b&&!b.disabled;})()`),'Redo enabled after Undo');
  await clickSelector('[data-network-action="redo"]');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.mode==='linear';},'redo section mode');

  mark('reload-persistence');
  const persisted=await project();
  assert.equal(persisted.junctions.length,3);assert.equal(persisted.links.length,2);assert.equal(persisted.links.find(l=>l.id==='L-2').via.length,1);
  await send('Page.reload',{ignoreCache:true});
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'reload persisted project');
  await waitFor(async()=>{const p=await project(),l=p?.links?.find(v=>v.id==='L-2');return p?.junctions?.length===3&&p?.links?.length===2&&l?.via?.length===1&&l?.sectionProfile?.mode==='linear'&&l?.sectionProfile?.forwardLaneTransition?.side==='curb';},'persistence after reload');

  mark('section-dock');
  await clickSelector('[data-network-link="L-2"]');
  await waitFor(()=>evalValue(`!!document.querySelector('[aria-label="Road Link section profile"]')&&document.querySelector('[aria-label="Road Link section profile"]')?.textContent?.includes('Station')`),'RoadLink section dock');
  const shot2d=await screenshot('network-browser-2d.png');

  mark('resolved-3d');
  await clickSelector('[data-network-view="3d"]');
  await waitFor(()=>evalValue(`!!document.querySelector('canvas[aria-label="Network 3D overview"][data-network-scene-mode="resolved"]')&&document.body.textContent.includes('Resolved Network 3D')`),'resolved Network 3D');
  await waitFor(()=>evalValue(`document.querySelector('canvas[aria-label="Network 3D overview"]')?.getAttribute('data-network-scene-detail-texture')==='true'`),'3D semantic marking detail overlay');
  const sceneCounts=await evalValue(`(()=>{const c=document.querySelector('canvas[aria-label="Network 3D overview"]');return {junction:Number(c?.getAttribute('data-network-scene-junction-surfaces')||0),link:Number(c?.getAttribute('data-network-scene-link-surfaces')||0),detail:c?.getAttribute('data-network-scene-detail-texture')==='true',furniture:Number(c?.getAttribute('data-network-scene-furniture-faces')||0)};})()`);
  assert(sceneCounts.junction>0,'Resolved 3D must contain Junction semantic surfaces');assert(sceneCounts.link>0,'Resolved 3D must contain RoadLink semantic surfaces');assert.equal(sceneCounts.detail,true,'Resolved 3D must restore exact semantic markings through the detail-only overlay');
  const cameraBefore=await evalValue(`(()=>{const c=document.querySelector('canvas[aria-label="Network 3D overview"]');return {mode:c?.getAttribute('data-network-camera-mode'),zoom:Number(c?.getAttribute('data-network-camera-zoom')||0)};})()`);
  assert.equal(cameraBefore.mode,'pan','Network 3D should start in Pan mode');
  await clickSelector('[data-network-camera-control="orbit"]');
  await waitFor(()=>evalValue(`document.querySelector('canvas[aria-label="Network 3D overview"]')?.getAttribute('data-network-camera-mode')==='orbit'`),'3D Orbit mode');
  await clickSelector('[data-network-camera-control="top"]');
  await waitFor(()=>evalValue(`(()=>{const c=document.querySelector('canvas[aria-label="Network 3D overview"]');return Math.abs(Number(c?.getAttribute('data-network-camera-yaw')||99))<.1&&Number(c?.getAttribute('data-network-camera-pitch')||0)>77;})()`),'3D Top view');
  await clickSelector('[data-network-camera-control="iso"]');
  await waitFor(()=>evalValue(`(()=>{const c=document.querySelector('canvas[aria-label="Network 3D overview"]');return Math.abs(Number(c?.getAttribute('data-network-camera-yaw')||0)+35)<.1&&Math.abs(Number(c?.getAttribute('data-network-camera-pitch')||0)-52)<.1;})()`),'3D Iso view');
  await clickSelector('[data-network-camera-control="zoom-in"]');
  await waitFor(()=>evalValue(`Number(document.querySelector('canvas[aria-label="Network 3D overview"]')?.getAttribute('data-network-camera-zoom')||0)>${cameraBefore.zoom}`),'3D zoom control');
  await clickSelector('[data-network-camera-control="pan"]');
  await waitFor(()=>evalValue(`document.querySelector('canvas[aria-label="Network 3D overview"]')?.getAttribute('data-network-camera-mode')==='pan'`),'3D Pan mode');
  await clickSelector('[data-network-camera-control="fit"]');
  await waitFor(()=>evalValue(`(()=>{const c=document.querySelector('canvas[aria-label="Network 3D overview"]');return Math.abs(Number(c?.getAttribute('data-network-camera-pan-x')||0))<.001&&Math.abs(Number(c?.getAttribute('data-network-camera-pan-y')||0))<.001;})()`),'3D Fit recenters camera');
  await sleep(600);
  const shot3d=await screenshot('network-browser-3d.png');

  assert.equal(runtimeErrors.length,0,'Browser runtime errors: '+runtimeErrors.join(' | '));
  const finalProject=await project();
  report.status='pass';report.runtimeErrors=runtimeErrors;report.finishedAt=new Date().toISOString();
  writeReport({durationMs:Date.now()-started,screenshots:{planBytes:shot2d,scene3dBytes:shot3d},sceneCounts,finalProject:projectSummary(finalProject)});
  console.log('PASS browser acceptance: contextual edit → port-tangent Link continuity → persistence → resolved 3D geometry + semantic marking detail');
}catch(error){
  report.status='fail';report.runtimeErrors=runtimeErrors;report.finishedAt=new Date().toISOString();
  if(ws&&ws.readyState===WebSocket.OPEN){
    try{
      const diagnostic=await new Promise((resolve,reject)=>{
        const id=++seq,timer=globalThis.setTimeout(()=>{pending.delete(id);reject(new Error('Diagnostic CDP timeout'));},8000);
        pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:`({notice:document.querySelector('.network-status')?.textContent,ports:[...document.querySelectorAll('[data-network-port]')].map(e=>({key:e.getAttribute('data-network-port'),state:e.getAttribute('data-network-port-state')})),storage:localStorage.getItem('thai-street-network-project-v1')})`,returnByValue:true}}));
      });
      writeFileSync(artifactDir+'/network-browser-diagnostic.json',JSON.stringify({checkpoint,runtimeErrors,diagnostic:diagnostic.result?.value??diagnostic},null,2));
      await screenshot('network-browser-failure.png');
    }catch{}
  }
  writeReport({durationMs:Date.now()-started,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error),serverLogTail:serverLog.slice(-5000)});
  throw error;
}finally{
  shutdown();
  await sleep(200);
  if(server.exitCode&&server.exitCode!==0)console.error(serverLog);
}
