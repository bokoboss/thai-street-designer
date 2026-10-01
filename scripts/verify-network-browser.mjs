import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
  async function clickSelector(selector,index=0){
    await waitFor(()=>evalValue(`(()=>{const e=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!e)return false;e.scrollIntoView({block:'center',inline:'nearest'});return true;})()`),selector);
    await sleep(60);
    const p=await waitFor(()=>rectBySelector(selector,index),selector);
    assert(p.y>=0&&p.y<=1000&&p.x>=0&&p.x<=1440,'Click target must be inside the emulated viewport after scroll: '+selector+' '+JSON.stringify(p));
    await clickAt(p);
  }
  async function keyPress(key,code=key,modifiers=0){
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});
  }
  async function focusWorkspace(){assert(await evalValue(`(()=>{const el=document.querySelector('.network-workspace');if(!el)return false;el.focus();return document.activeElement===el;})()`),'Network workspace must accept keyboard focus');}
  async function dragSelector(selector,dx,dy,modifiers=0){
    const p=await waitFor(()=>rectBySelector(selector),selector);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,modifiers});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1,modifiers});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1,modifiers});
    await sleep(80);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1,modifiers});
  }
  async function smoothDragSelector(selector,dx,dy,steps=10,modifiers=0){
    const p=await waitFor(()=>rectBySelector(selector),selector);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,modifiers});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1,modifiers});
    for(let i=1;i<=steps;i++){
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/steps,y:p.y+dy*i/steps,button:'left',buttons:1,modifiers});
      await sleep(18);
    }
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1,modifiers});
  }
  async function captureScreenshot(name){
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},20000);
    const bytes=Buffer.from(shot.data,'base64');assert(bytes.length>5000,'Screenshot is unexpectedly small: '+name);
    writeFileSync(artifactDir+'/'+name,bytes);
    return{file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  async function screenshot(name){return (await captureScreenshot(name)).bytes;}
  const goldenArtifacts=[];
  async function goldenScreenshot(id,contract){
    const meta=await captureScreenshot('network-browser-golden-'+id+'.png');
    const item={id,...meta,contract};goldenArtifacts.push(item);return item;
  }
  async function loadJunctionGolden(id,mutateBody,contractBody){
    mark('golden-'+id);
    await send('Page.navigate',{url:baseUrl+'junction/'});
    await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.junction-app')`),'Junction workspace '+id);
    await evalValue(`localStorage.clear();true`);
    await send('Page.reload',{ignoreCache:true});
    await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.junction-app')`),'clean Junction workspace '+id);
    await waitFor(()=>evalValue(`!!localStorage.getItem('thai-street-design-v2')`),'default Junction autosave '+id,7000);
    const title='Golden · '+id;
    await evalValue(`(()=>{const d=JSON.parse(localStorage.getItem('thai-street-design-v2'));d.title=${JSON.stringify(title)};${mutateBody};localStorage.setItem('thai-street-design-v2',JSON.stringify(d));return true;})()`);
    await send('Page.reload',{ignoreCache:true});
    await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.junction-app')`),'reload Junction golden '+id);
    await clickSelector('[data-junction-file-menu="true"]');
    const loadState=await waitFor(()=>evalValue(`(()=>{const open=!!document.querySelector('[data-junction-open-latest="true"]'),recovery=document.body.textContent?.includes('ดาวน์โหลดข้อมูลเดิม')??false,footer=document.querySelector('.j-footer')?.textContent??'';return open||recovery?{open,recovery,footer}:null;})()`),'Junction golden loader state '+id);
    assert(loadState.open,'Golden fixture rejected by Junction loader: '+id+' '+JSON.stringify(loadState));
    await clickSelector('[data-junction-open-latest="true"]');
    await waitFor(()=>evalValue(`document.querySelector('input[aria-label="ชื่อแบบ"]')?.value===${JSON.stringify(title)}`),'activate Junction golden '+id);
    await evalValue(`(()=>{const b=[...document.querySelectorAll('.j-zoom button')].find(v=>v.textContent?.trim()==='พอดีภาพ');b?.click();return !!b;})()`);
    await sleep(180);
    const contract=await evalValue(`(()=>{${contractBody}})()`);
    assert(contract?.ok,'Golden visual contract failed: '+id+' '+JSON.stringify(contract));
    return goldenScreenshot(id,contract);
  }
  const scenarioWorkspace=()=>evalValue(`(()=>{try{return JSON.parse(localStorage.getItem('thai-street-network-project-v1')||'null')}catch{return null}})()`);
  const project=()=>evalValue(`(()=>{try{const w=JSON.parse(localStorage.getItem('thai-street-network-project-v1')||'null');if(w?.workspaceVersion===1&&Array.isArray(w.scenarios))return w.scenarios.find(s=>s.id===w.activeScenarioId)?.project??null;return w}catch{return null}})()`);
  const projectSummary=p=>({version:p?.version??p?.schemaVersion,junctions:p?.junctions?.length??0,links:p?.links?.length??0,link2:p?.links?.find(v=>v.id==='L-2')??null});

  mark('workspace-load');
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'Network workspace load');
  await evalValue(`localStorage.clear();location.reload();true`);
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'clean reload');
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===2&&p?.links?.length===1;},'default project persistence');
  const initial2d=await evalValue(`(()=>{const svg=document.querySelector('svg[data-network-plan="true"]'),z=document.querySelector('.network-zoom'),body=document.querySelector('.network-body');return {span:Number(svg?.getAttribute('data-network-view-span')||0),zoom:Number(z?.getAttribute('data-network-zoom-value')||0),viewWidth:svg?.viewBox?.baseVal?.width||0,inspector:body?.getAttribute('data-network-inspector')};})()`);
  assert(initial2d.span>=590&&Math.abs(initial2d.zoom-1)<1e-8&&initial2d.viewWidth>=590,'2D 100% must start with the wider Network-scale view');
  assert.equal(initial2d.inspector,'open','Inspector should open by default');
  const initialScenarioWorkspace=await scenarioWorkspace();assert.equal(initialScenarioWorkspace?.workspaceVersion,1,'Network storage must use the scenario workspace wrapper');assert.equal(initialScenarioWorkspace?.activeScenarioId,'existing');assert.equal(initialScenarioWorkspace?.scenarios?.length,1);assert.equal(initialScenarioWorkspace.scenarios[0].name,'Existing');
  mark('scenario-isolation');
  await clickSelector('[data-network-scenario-add]');
  await waitFor(async()=>{const w=await scenarioWorkspace();return w?.scenarios?.length===2&&w.activeScenarioId==='alt-1'&&w.scenarios.find(s=>s.id==='alt-1')?.name==='Alt A';},'create Alt A from Existing');
  let scenarioPlan=await rectBySelector('svg[data-network-plan="true"]');await clickSelector('[data-network-tool="junction"]');await clickAt({x:scenarioPlan.x+scenarioPlan.w*.18,y:scenarioPlan.y-scenarioPlan.h*.18});
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===3;},'edit Alt A independently');
  const laneArm=await evalValue(`(()=>{const w=JSON.parse(localStorage.getItem('thai-street-network-project-v1')||'null'),p=w.scenarios.find(s=>s.id===w.activeScenarioId).project,j=p.junctions.find(v=>v.id==='J-1');return j.design.arms.findIndex((a,i)=>j.design.enabled[i]&&a.incoming<4)})()`);assert(laneArm>=0,'Alt comparison test needs one editable incoming lane');
  const scenarioLaneBefore=(await project()).junctions.find(j=>j.id==='J-1').design.arms[laneArm].incoming;
  await clickSelector('[data-network-tool="select"]');await clickSelector(`[data-network-junction-hit="J-1:${laneArm}"]`);await clickSelector('[data-network-context-action="incoming-inc"]');
  await waitFor(async()=>{const p=await project();return p?.junctions?.find(j=>j.id==='J-1')?.design?.arms?.[laneArm]?.incoming===scenarioLaneBefore+1;},'edit existing Junction lane only in Alt A');
  await waitFor(()=>evalValue(`(()=>{const bar=document.querySelector('[data-network-comparison="true"]'),junctions=document.querySelector('[data-network-comparison-metric="junctions"]'),lanes=document.querySelector('[data-network-comparison-metric="mainLanes"]');return bar?.getAttribute('data-network-comparison-active')==='alt-1'&&bar?.getAttribute('data-network-comparison-reference')==='existing'&&Number(junctions?.getAttribute('data-network-comparison-delta'))===1&&Number(lanes?.getAttribute('data-network-comparison-delta'))>0;})()`),'Alt A semantic comparison against Existing');
  assert(await evalValue(`!!document.querySelector('[data-network-comparison-object="added"]')`),'comparison summary must identify the added Alt A junction');
  assert(await evalValue(`!!document.querySelector('[data-network-comparison-presentation-summary="true"]')&&!!document.querySelector('.network-comparison-legend .active')&&!!document.querySelector('.network-comparison-legend .reference')`),'comparison presentation summary and Active/Reference legend must be visible');
  assert.equal(await evalValue(`!!document.querySelector('[data-network-comparison-ghost="true"]')`),false,'comparison ghost must remain opt-in until an inspection action');
  await clickSelector('[data-network-comparison-filter="lanes"]');
  await waitFor(()=>evalValue(`Number(document.querySelector('[data-network-comparison-filter="lanes"]')?.getAttribute('data-network-comparison-filter-count')||0)>=1&&!!document.querySelector('[data-network-comparison-inspect="junction:J-1"]')`),'Lanes comparison filter');
  const comparisonZoomBefore=Number(await evalValue(`document.querySelector('.network-zoom')?.getAttribute('data-network-zoom-value')||1`));
  await clickSelector('[data-network-comparison-inspect="junction:J-1"]');
  await waitFor(()=>evalValue(`!!document.querySelector('[data-network-comparison-inspection="junction:J-1"]')&&!!document.querySelector('[data-network-junction="J-1"][data-network-comparison-active-focus="true"]')&&!!document.querySelector('[data-network-comparison-junction="J-1"][data-network-comparison-reference-focus="true"]')`),'comparison navigate + active/reference highlight');
  assert(await evalValue(`document.querySelector('[data-network-comparison-detail="Main lanes"]')?.classList.contains('changed')===true`),'before/after inspector must mark changed main-lane values');
  assert(await evalValue(`Number(document.querySelector('.network-zoom')?.getAttribute('data-network-zoom-value')||1)>${comparisonZoomBefore}`),'comparison inspection should zoom toward the focused object');
  await waitFor(()=>evalValue(`document.querySelectorAll('[data-network-comparison-junction]').length===2&&!!document.querySelector('[data-network-comparison-ghost="true"]')`),'inspection auto-enables the read-only Existing ghost');
  const comparisonGoldenContract=await evalValue(`(()=>{const active=document.querySelector('[data-network-junction="J-1"][data-network-comparison-active-focus="true"]'),reference=document.querySelector('[data-network-comparison-junction="J-1"][data-network-comparison-reference-focus="true"]'),summary=document.querySelector('[data-network-comparison-presentation-summary="true"]');return{ok:!!active&&!!reference&&!!summary&&!!document.querySelector('[data-network-comparison-ghost="true"]'),activeFocus:!!active,referenceFocus:!!reference,summary:!!summary};})()`);
  assert(comparisonGoldenContract?.ok,'Scenario comparison golden contract failed');
  await goldenScreenshot('scenario-comparison',comparisonGoldenContract);
  assert(await evalValue(`!!document.querySelector('[data-network-comparison-select-active]')`),'changed active object must expose a direct Select Active action');
  await clickSelector('[data-network-comparison-select-active]');
  await waitFor(()=>evalValue(`!!document.querySelector('[data-network-junction="J-1"] [data-network-instance-selection="true"]')`),'comparison review can select the focused Active object for editing without touching Reference');
  await clickSelector('[data-network-comparison-filter="all"]');
  await clickSelector('[data-network-comparison-next]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-comparison-focused="true"]')?.getAttribute('data-network-comparison-inspect')!=='junction:J-1'`),'comparison review advances to the next filtered change');
  await clickSelector('[data-network-comparison-prev]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-comparison-focused="true"]')?.getAttribute('data-network-comparison-inspect')==='junction:J-1'`),'comparison review returns to the previous change');
  await clickSelector('[data-network-comparison-export="svg"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-comparison-actions')?.getAttribute('data-network-comparison-export-status')?.endsWith('.svg')===true`),'comparison SVG export completes with deterministic presentation metadata');
  await clickSelector('[data-network-action="fit"]');await sleep(120);
  await clickSelector('[data-network-scenario="existing"]');
  await waitFor(async()=>{const w=await scenarioWorkspace(),p=await project();return w?.activeScenarioId==='existing'&&p?.junctions?.length===2;},'Existing remains unchanged after Alt edit');
  await waitFor(()=>evalValue(`(()=>{const bar=document.querySelector('[data-network-comparison="true"]'),metric=document.querySelector('[data-network-comparison-metric="junctions"]');return bar?.getAttribute('data-network-comparison-reference')==='alt-1'&&Number(metric?.getAttribute('data-network-comparison-delta'))===-1;})()`),'reverse comparison direction on Existing');
  await clickSelector('[data-network-scenario="alt-1"]');
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===3;},'Alt A restores its own geometry');
  await clickSelector('[data-network-scenario-delete]');
  await waitFor(async()=>{const w=await scenarioWorkspace(),p=await project();return w?.activeScenarioId==='existing'&&w?.scenarios?.length===1&&p?.junctions?.length===2;},'delete Alt A and return Existing');
  await waitFor(()=>evalValue(`!document.querySelector('[data-network-comparison="true"]')&&!document.querySelector('[data-network-comparison-ghost="true"]')&&!document.querySelector('[data-network-comparison-active-focus="true"]')`),'comparison UI and focus clear when no reference scenario remains');
  await clickSelector('[data-network-action="toggle-inspector"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-body')?.getAttribute('data-network-inspector')==='closed'`),'collapse Inspector');
  await clickSelector('[data-network-action="toggle-inspector"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-body')?.getAttribute('data-network-inspector')==='open'`),'reopen Inspector');
  for(let i=0;i<7;i++)await clickSelector('[data-network-zoom-action="out"]');
  await waitFor(()=>evalValue(`Number(document.querySelector('.network-zoom')?.getAttribute('data-network-zoom-value')||1)<.35`),'2D zoom below legacy 35% floor');
  await clickSelector('[data-network-zoom-action="fit"]');await sleep(180);

  mark('endpoint-arm-drag');
  const armAngleBefore=(await project()).junctions.find(j=>j.id==='J-1').design.arms[1].angle;
  await smoothDragSelector('[data-network-junction-hit="J-1:1"]',31,-17,12);
  const bodyDragArm=(await project()).junctions.find(j=>j.id==='J-1').design.arms[1];
  assert(Math.abs(bodyDragArm.angle-armAngleBefore)<1e-8,'dragging the Arm body must select only and must not edit geometry');
  const gripRect=await waitFor(()=>rectBySelector('[data-network-arm-handle="J-1:1"]'),'Arm endpoint grip hit target');
  assert(gripRect.w>=14&&gripRect.h>=14,'Arm endpoint grip must retain a usable screen-space hit target');
  await smoothDragSelector('[data-network-arm-handle="J-1:1"]',31,-17,12);
  const freeArm=await waitFor(async()=>{const p=await project(),arm=p?.junctions?.find(j=>j.id==='J-1')?.design?.arms?.[1];return arm&&Math.abs(arm.angle-armAngleBefore)>.05?arm:null;},'endpoint Arm drag');
  assert(Math.abs(freeArm.angle-Math.round(freeArm.angle))>.001,'normal endpoint drag must preserve a fractional angle instead of integer snapping');
  await smoothDragSelector('[data-network-arm-handle="J-1:1"]',22,13,10,8);
  const snappedArm=await waitFor(async()=>{const p=await project(),j=p?.junctions?.find(v=>v.id==='J-1'),arm=j?.design?.arms?.[1];if(!j||!arm)return null;const world=((j.rotation+j.design.rotation+arm.angle)%360+360)%360;return Math.abs(world/15-Math.round(world/15))<.001?{arm,world}:null;},'Shift endpoint Arm snap 15 degrees');
  assert(Math.abs(snappedArm.world/15-Math.round(snappedArm.world/15))<.001,'Shift endpoint drag must snap Arm world heading to 15 degree increments');

  mark('create-junction');
  await clickSelector('[data-network-tool="junction"]');
  const plan=await rectBySelector('svg[data-network-plan="true"]');
  await clickAt({x:plan.x+plan.w*.25,y:plan.y-plan.h*.27});
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===3;},'create J-3');
  await clickSelector('[data-network-action="fit"]');await sleep(180);

  mark('connect-link');
  await clickSelector('[data-network-tool="link"]');
  await clickSelector('[data-network-port="J-1:3"]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-port="J-1:3"]')?.getAttribute('data-network-port-state')==='source'`),'source port state');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-port="J-3:3"]')?.getAttribute('data-network-port-state')==='facing-invalid'`),'reject target port facing away from source');
  await clickSelector('[data-network-port="J-3:2"]');
  await waitFor(async()=>{const p=await project();return p?.links?.length===2&&p.links.some(l=>l.id==='L-2');},'connect L-2');

  mark('linked-junction-facing-guard');
  await clickSelector('[data-network-junction-hit="J-3:2"]');
  const rotationBefore=await evalValue(`Number(document.querySelector('[data-network-junction-rotation]')?.value)`);
  await evalValue(`(()=>{const el=document.querySelector('[data-network-junction-rotation]');el.focus();el.value=String((Number(el.value)+180)%360);el.dispatchEvent(new Event('input',{bubbles:true}));el.blur();return true;})()`);
  await waitFor(()=>evalValue(`document.querySelector('.network-status')?.textContent?.includes('Road Link')===true`),'linked Junction rotation rejected by facing guardrail');
  const rotationAfter=await evalValue(`Number(document.querySelector('[data-network-junction-rotation]')?.value)`);
  assert.equal(rotationAfter,rotationBefore,'rejected linked-Junction rotation must restore the committed rotation');

  mark('safe-cascade-delete');
  await focusWorkspace();await keyPress('Delete','Delete');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-delete="true"]')?.getAttribute('data-network-delete-armed')==='true'`),'keyboard Delete arms linked Junction deletion');
  const safeDeleteState=await project();assert(safeDeleteState.junctions.some(j=>j.id==='J-3')&&safeDeleteState.links.some(l=>l.id==='L-2'),'first keyboard Delete must not mutate linked Junction or RoadLink');
  await keyPress('Escape','Escape');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-delete="true"]')?.getAttribute('data-network-delete-armed')==='false'`),'Escape cancels armed linked Junction deletion');
  assert((await project()).junctions.some(j=>j.id==='J-3'),'Escape must preserve selected Junction engineering state');
  await keyPress('Delete','Delete');await waitFor(()=>evalValue(`document.querySelector('[data-network-delete="true"]')?.getAttribute('data-network-delete-armed')==='true'`),'keyboard Delete re-arms cascade');
  await keyPress('Delete','Delete');
  await waitFor(async()=>{const p=await project();return !p.junctions.some(j=>j.id==='J-3')&&!p.links.some(l=>l.id==='L-2');},'confirmed linked Junction cascade delete by keyboard');
  await keyPress('z','KeyZ',2);
  await waitFor(async()=>{const p=await project();return p.junctions.some(j=>j.id==='J-3')&&p.links.some(l=>l.id==='L-2');},'Ctrl+Z restores Junction and cascaded RoadLink atomically');
  await keyPress('Z','KeyZ',10);
  await waitFor(async()=>{const p=await project();return !p.junctions.some(j=>j.id==='J-3')&&!p.links.some(l=>l.id==='L-2');},'Ctrl+Shift+Z redoes cascade delete');
  await keyPress('z','KeyZ',2);
  await waitFor(async()=>{const p=await project();return p.junctions.some(j=>j.id==='J-3')&&p.links.some(l=>l.id==='L-2');},'Ctrl+Z restores cascade again for continuing release flow');

  mark('safe-reconnect-controls');
  await clickSelector('[data-network-link="L-2"]');
  const reconnectControl=await evalValue(`(()=>{const from=document.querySelector('[data-network-reconnect="from"]'),to=document.querySelector('[data-network-reconnect="to"]');return{from:!!from,to:!!to,fromValue:from?.value,toValue:to?.value,fromOptions:from?.options.length??0,toOptions:to?.options.length??0};})()`);
  assert(reconnectControl.from&&reconnectControl.to,'selected RoadLink must expose FROM and TO safe reconnect controls');
  const reconnectControlProject=await project(),reconnectControlLink=reconnectControlProject.links.find(l=>l.id==='L-2');
  assert.equal(reconnectControl.fromValue,reconnectControlLink.from.junctionId+':'+reconnectControlLink.from.armId);assert.equal(reconnectControl.toValue,reconnectControlLink.to.junctionId+':'+reconnectControlLink.to.armId);
  assert(reconnectControl.fromOptions>=1&&reconnectControl.toOptions>=1,'reconnect controls must always retain the committed endpoint even when no alternative port is safe');

  mark('edit-alignment');
  await clickSelector('[data-network-link="L-2"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-context-bar')?.getAttribute('data-network-context-kind')==='link'`),'RoadLink contextual command bar');
  await clickSelector('[data-network-context-action="add-pi"]');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.via?.length===1;},'add PI');
  const beforeDrag=await project(),beforeVia=beforeDrag.links.find(l=>l.id==='L-2').via[0];
  await dragSelector('[data-link-via="0"]',34,-24);
  await waitFor(async()=>{const p=await project(),v=p?.links?.find(l=>l.id==='L-2')?.via?.[0];return v&&Math.hypot(v.x-beforeVia.x,v.y-beforeVia.y)>1;},'drag PI');

  mark('create-lane-mismatch');
  await clickSelector('[data-network-junction-hit="J-3:2"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-context-bar')?.getAttribute('data-network-context-kind')==='arm'`),'Arm contextual command bar');
  const laneBefore=(await project()).junctions.find(j=>j.id==='J-3').design.arms[2].incoming;
  assert(laneBefore<4,'Golden flow needs room to add one incoming lane');
  await clickSelector('[data-network-context-action="incoming-inc"]');
  await waitFor(async()=>{const p=await project();return p?.junctions?.find(j=>j.id==='J-3')?.design?.arms?.[2]?.incoming===laneBefore+1;},'lane mismatch edit');

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
  mark('release-interaction-sweep');
  const interactionWorkspace=JSON.stringify(await scenarioWorkspace()),interactionViewBox=await evalValue(`document.querySelector('svg[data-network-plan="true"]')?.getAttribute('viewBox')`);
  await focusWorkspace();await keyPress('i','KeyI');
  await waitFor(()=>evalValue(`document.querySelector('.network-body')?.getAttribute('data-network-inspector')==='closed'`),'I shortcut hides Inspector');
  assert.equal(JSON.stringify(await scenarioWorkspace()),interactionWorkspace,'Inspector shortcut must not mutate engineering/scenario state');
  assert.equal(await evalValue(`document.querySelector('svg[data-network-plan="true"]')?.getAttribute('viewBox')`),interactionViewBox,'Inspector toggle must preserve world viewport');
  await keyPress('i','KeyI');
  await waitFor(()=>evalValue(`document.querySelector('.network-body')?.getAttribute('data-network-inspector')==='open'`),'I shortcut restores Inspector');
  assert(await evalValue(`document.querySelector('.network-context-bar')?.getAttribute('data-network-context-kind')==='link'`),'Inspector toggle must preserve selected RoadLink context');
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
  const finalProject=await project();

  mark('design-summary');
  assert(await evalValue(`!!document.querySelector('[data-network-design-summary="true"]')&&Number(document.querySelector('[data-network-design-summary="true"]')?.getAttribute('data-network-design-finding-count'))>=0`),'Inspector must expose canonical Design Summary from active engineering state');

  mark('unified-network-export');
  await clickSelector('[data-network-export-menu="true"]');
  assert(await evalValue(`!!document.querySelector('[data-network-export="current-svg"]')&&!!document.querySelector('[data-network-export="current-png"]')&&!!document.querySelector('[data-network-export="full-svg"]')&&!!document.querySelector('[data-network-export="full-png"]')`),'Export menu must expose Current/Full × SVG/PNG');
  await clickSelector('[data-network-export="full-svg"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-export-menu')?.getAttribute('data-network-export-status')?.endsWith('-full.svg')===true`),'Full Network SVG export');
  await evalValue(`(()=>{const d=document.querySelector('.network-export-menu');if(d&&!d.open)d.open=true;return !!d?.open;})()`);
  await clickSelector('[data-network-export="current-png"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-export-menu')?.getAttribute('data-network-export-status')?.endsWith('-current.png')===true`),'Current View PNG export');
  await evalValue(`(()=>{const d=document.querySelector('.network-export-menu');if(d&&!d.open)d.open=true;return !!d?.open;})()`);
  await clickSelector('[data-network-export="report-html"]');
  await waitFor(()=>evalValue(`document.querySelector('.network-export-menu')?.getAttribute('data-network-export-status')?.endsWith('.html')===true`),'Design Summary HTML export');

  mark('project-file-workflow');
  await clickSelector('[data-network-file-menu="true"]');
  assert(await evalValue(`!!document.querySelector('[data-network-file-action="new"]')&&!!document.querySelector('[data-network-file-action="open"]')&&!!document.querySelector('[data-network-file-action="save"]')&&!!document.querySelector('[data-network-file-action="save-as"]')`),'File menu must expose New / Open / Save / Save As');
  const fileWorkspace=await scenarioWorkspace();fileWorkspace.scenarios.find(s=>s.id===fileWorkspace.activeScenarioId).project.title='Project File Acceptance';
  const fileEnvelope=JSON.stringify({format:'thai-street-designer-network',fileVersion:1,workspace:fileWorkspace});
  await evalValue(`(()=>{const input=document.querySelector('[data-network-file-input="true"]'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(fileEnvelope)}],'acceptance.tsd.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitFor(()=>evalValue(`document.querySelector('.network-viewbar b')?.textContent==='Project File Acceptance'`),'open portable Project JSON');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')==='false'&&document.querySelector('[data-network-file-status="true"]')?.textContent?.includes('acceptance.tsd.json')===true`),'opened Project becomes clean file baseline');
  mark('project-file-recovery');
  const cleanWorkspaceBeforeReject=JSON.stringify(await scenarioWorkspace()),cleanSessionBeforeReject=await evalValue(`localStorage.getItem('thai-street-network-project-file-session-v1')`);
  await evalValue(`(()=>{const input=document.querySelector('[data-network-file-input="true"]'),dt=new DataTransfer();dt.items.add(new File(['{malformed'],'broken.tsd.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitFor(()=>evalValue(`document.querySelector('.network-status')?.textContent?.includes('เปิด Project ไม่สำเร็จ')===true`),'malformed Project reports Open failure');
  assert.equal(JSON.stringify(await scenarioWorkspace()),cleanWorkspaceBeforeReject,'malformed Project must leave clean engineering workspace untouched');
  assert.equal(await evalValue(`localStorage.getItem('thai-street-network-project-file-session-v1')`),cleanSessionBeforeReject,'malformed Project must preserve clean file association');
  assert(await evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')==='false'&&document.querySelector('[data-network-file-status="true"]')?.textContent?.includes('acceptance.tsd.json')===true`),'malformed Project must preserve clean baseline status');
  const fileScenarioCount=(await scenarioWorkspace()).scenarios.length;assert(fileScenarioCount<6,'Project file dirty-state test requires scenario capacity');
  await clickSelector('[data-network-scenario-add]');
  await waitFor(async()=>{const w=await scenarioWorkspace();return w?.scenarios?.length===fileScenarioCount+1;},'duplicate scenario as deterministic Project edit');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')==='true'`),'Project edit marks opened file dirty');
  const dirtyWorkspaceBeforeReject=JSON.stringify(await scenarioWorkspace()),dirtySessionBeforeReject=await evalValue(`localStorage.getItem('thai-street-network-project-file-session-v1')`),
    unsupportedEnvelope=JSON.stringify({format:'thai-street-designer-network',fileVersion:99,workspace:await scenarioWorkspace()});
  await evalValue(`(()=>{const input=document.querySelector('[data-network-file-input="true"]'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(unsupportedEnvelope)}],'future-version.tsd.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitFor(()=>evalValue(`document.querySelector('.network-status')?.textContent?.includes('Unsupported Thai Street Designer project file version')===true`),'unsupported Project version reports Open failure');
  assert.equal(JSON.stringify(await scenarioWorkspace()),dirtyWorkspaceBeforeReject,'unsupported Project must leave dirty engineering workspace untouched');
  assert.equal(await evalValue(`localStorage.getItem('thai-street-network-project-file-session-v1')`),dirtySessionBeforeReject,'unsupported Project must preserve saved file baseline metadata');
  assert.equal(await evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')`),'true','unsupported Project must preserve dirty status');
  await send('Page.reload',{ignoreCache:true});await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'reload dirty Project file session');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')==='true'&&document.querySelector('[data-network-file-status="true"]')?.textContent?.includes('acceptance.tsd.json')===true`),'reload preserves file name and dirty baseline');
  await clickSelector('[data-network-file-menu="true"]');await clickSelector('[data-network-file-action="save"]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')==='false'`),'Save refreshes file baseline');
  await send('Page.reload',{ignoreCache:true});await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'reload saved Project file session');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')==='false'&&document.querySelector('[data-network-file-status="true"]')?.textContent?.includes('acceptance.tsd.json')===true`),'reload preserves clean file association');
  await clickSelector('[data-network-file-menu="true"]');await clickSelector('[data-network-file-action="new"]');
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===2&&p?.links?.length===1;},'New Project resets engineering workspace without touching schema');
  assert.equal(await evalValue(`document.querySelector('[data-network-file-status="true"]')?.getAttribute('data-network-file-dirty')`),'true','new unsaved Project must be marked dirty');
  assert.equal(await evalValue(`localStorage.getItem('thai-street-network-project-file-session-v1')`),null,'New Project must clear prior file association metadata');

  mark('parallel-corridor-inspector');
  await evalValue(`(()=>{const key='thai-street-network-project-v1',w=JSON.parse(localStorage.getItem(key)),p=w.scenarios.find(s=>s.id===w.activeScenarioId).project,clone=(source,id,name,x,y)=>{const j=structuredClone(source);j.id=id;j.name=name;j.x=x;j.y=y;return j},a=p.junctions[0],b=p.junctions[1],j3=clone(a,'J-3','Frontage A',a.x,a.y+120),j4=clone(b,'J-4','Frontage B',b.x,b.y+120),j5=clone(a,'J-5','Frontage C',a.x,a.y-120),j6=clone(b,'J-6','Frontage D',b.x,b.y-120);p.junctions.push(j3,j4,j5,j6);p.links.push({id:'L-2',name:'Frontage Left Candidate',from:{junctionId:'J-3',armId:0},to:{junctionId:'J-4',armId:2},via:[],sectionProfile:{mode:'review'},components:[]},{id:'L-3',name:'Frontage Right Candidate',from:{junctionId:'J-5',armId:0},to:{junctionId:'J-6',armId:2},via:[],sectionProfile:{mode:'review'},components:[]});p.parallelCorridors=[];localStorage.setItem(key,JSON.stringify(w));return true;})()`);
  await send('Page.reload',{ignoreCache:true});await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'reload parallel-corridor fixture');
  await waitFor(async()=>{const p=await project();return p?.schemaVersion===4&&p?.links?.length===3&&p?.parallelCorridors?.length===0;},'parallel-corridor fixture v4');
  await clickSelector('[data-network-link="L-1"]');await clickSelector('[data-network-parallel-action="start"]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-parallel-panel]')?.getAttribute('data-network-parallel-draft')==='L-1'&&!!document.querySelector('[data-network-parallel-role="draft-mainline"]')`),'stage mainline without engineering-state mutation');
  assert.equal((await project()).parallelCorridors.length,0,'staging a mainline must remain UI-only until a frontage Link is chosen');
  await focusWorkspace();await keyPress('Escape','Escape');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-parallel-panel]')?.getAttribute('data-network-parallel-draft')===null&&!document.querySelector('[data-network-parallel-role="draft-mainline"]')`),'Escape cancels UI-only parallel-corridor draft');
  assert.equal((await project()).parallelCorridors.length,0,'cancelling a draft must not mutate engineering state');
  await clickSelector('[data-network-parallel-action="start"]');await waitFor(()=>evalValue(`document.querySelector('[data-network-parallel-panel]')?.getAttribute('data-network-parallel-draft')==='L-1'`),'restage mainline after Escape');
  await clickSelector('[data-network-link="L-2"]');await clickSelector('[data-network-parallel-action="finalize-left"]');
  await waitFor(async()=>{const p=await project(),g=p?.parallelCorridors?.[0];return g?.mainlineLinkIds?.[0]==='L-1'&&g?.frontage?.find(v=>v.side==='left')?.linkIds?.[0]==='L-2';},'create parallel corridor from staged mainline + left frontage');
  assert(await evalValue(`!!document.querySelector('[data-network-parallel-role="mainline"][data-network-parallel-corridor="PC-1"]')&&!!document.querySelector('[data-network-parallel-role="left"][data-network-parallel-corridor="PC-1"]')`),'selected group must highlight mainline and frontage members on canvas');
  await clickSelector('[data-network-action="undo"]');await waitFor(async()=>!(await project())?.parallelCorridors?.length,'Undo removes corridor relationship atomically');
  await clickSelector('[data-network-action="redo"]');await waitFor(async()=>!!(await project())?.parallelCorridors?.length,'Redo restores corridor relationship atomically');
  await clickSelector('[data-network-link="L-3"]');await clickSelector('[data-network-parallel-action="add-right"]');
  await waitFor(async()=>{const g=(await project())?.parallelCorridors?.[0];return g?.frontage?.some(v=>v.side==='left'&&v.linkIds.includes('L-2'))&&g?.frontage?.some(v=>v.side==='right'&&v.linkIds.includes('L-3'));},'add ungrouped RoadLink to existing corridor as right frontage');
  await clickSelector('[data-network-link="L-2"]');await waitFor(()=>evalValue(`document.querySelector('[data-network-parallel-panel]')?.getAttribute('data-network-parallel-panel')==='member'&&document.querySelectorAll('[data-network-parallel-member]').length===3`),'group member Inspector list');
  await clickSelector('[data-network-parallel-action="remove-member"]');await waitFor(async()=>{const p=await project(),g=p?.parallelCorridors?.[0];return p?.links?.some(v=>v.id==='L-2')&&g?.frontage?.length===1&&g.frontage[0].side==='right';},'remove frontage membership without deleting RoadLink geometry');
  await clickSelector('[data-network-action="undo"]');await waitFor(async()=>{const g=(await project())?.parallelCorridors?.[0];return g?.frontage?.length===2;},'Undo restores removed corridor membership');
  await clickSelector('[data-network-link="L-2"]');await waitFor(()=>evalValue(`document.querySelector('[data-network-parallel-panel]')?.getAttribute('data-network-parallel-panel')==='member'`),'reselect restored corridor member after Undo clears selection');
  await clickSelector('[data-network-parallel-action="dissolve"]');await waitFor(async()=>{const p=await project();return p?.parallelCorridors?.length===0&&p?.links?.length===3;},'Dissolve removes only relationship metadata');
  await clickSelector('[data-network-action="undo"]');await waitFor(async()=>{const p=await project();return p?.parallelCorridors?.length===1&&p?.links?.length===3;},'Undo restores dissolved group');

  mark('parallel-corridor-assisted-seed');
  await clickSelector('[data-network-link="L-3"]');await clickSelector('[data-network-parallel-action="remove-member"]');
  await waitFor(async()=>{const p=await project(),g=p?.parallelCorridors?.[0];return p?.links?.length===3&&g?.frontage?.length===1&&g.frontage[0].side==='left';},'prepare existing corridor with missing right frontage');
  const seedSourceSnapshot=JSON.stringify(await evalValue(`(()=>{const w=JSON.parse(localStorage.getItem('thai-street-network-project-v1')),p=w.scenarios.find(s=>s.id===w.activeScenarioId).project;return{junctions:p.junctions.filter(j=>j.id==='J-1'||j.id==='J-2'),link:p.links.find(l=>l.id==='L-1')}})()`));
  await clickSelector('[data-network-link="L-1"]');
  await waitFor(()=>evalValue(`!!document.querySelector('[data-network-parallel-seed-action="right"]')&&!!document.querySelector('[data-network-parallel-seed-offset]')`),'missing-side assisted seed controls');
  await clickSelector('[data-network-parallel-seed-offset]');
  await evalValue(`(()=>{const input=document.querySelector('[data-network-parallel-seed-offset]');if(!input)return false;input.focus();input.select();return document.activeElement===input;})()`);
  await send('Input.insertText',{text:'45'});
  await waitFor(()=>evalValue(`document.querySelector('[data-network-parallel-seed-offset]')?.value==='45'`),'controlled assisted seed offset input');
  await clickSelector('[data-network-parallel-seed-action="right"]');
  await waitFor(async()=>{const p=await project(),g=p?.parallelCorridors?.[0],right=g?.frontage?.find(v=>v.side==='right');return p?.junctions?.length===8&&p?.links?.length===4&&right?.linkIds?.length===1;},'assisted right frontage seed commits generated Junction/RoadLink objects atomically');
  const seededProject=await project(),seededGroup=seededProject.parallelCorridors[0],seededRight=seededGroup.frontage.find(v=>v.side==='right'),seededLinkId=seededRight.linkIds[0],seededLink=seededProject.links.find(v=>v.id===seededLinkId),seededNodes=[seededLink.from.junctionId,seededLink.to.junctionId].map(id=>seededProject.junctions.find(j=>j.id===id));
  assert(seededNodes.every(j=>j&&Math.abs(j.y+45)<1e-6),'assisted right seed must apply the explicit centerline offset');
  assert(seededNodes.every(j=>j.design.slips.length===0&&j.design.arms.every(a=>a.length<=60&&!a.signal&&!a.crossing&&!a.stop)),'assisted seed nodes must strip copied junction treatments');
  assert.equal(JSON.stringify({junctions:seededProject.junctions.filter(j=>j.id==='J-1'||j.id==='J-2'),link:seededProject.links.find(l=>l.id==='L-1')}),seedSourceSnapshot,'assisted seed must leave source mainline geometry untouched');
  await clickSelector('[data-network-action="undo"]');await waitFor(async()=>{const p=await project(),g=p?.parallelCorridors?.[0];return p?.junctions?.length===6&&p?.links?.length===3&&g?.frontage?.length===1&&g.frontage[0].side==='left';},'Undo removes assisted seed Junctions, RoadLink and membership in one transaction');
  await clickSelector('[data-network-action="redo"]');await waitFor(async()=>{const p=await project(),g=p?.parallelCorridors?.[0];return p?.junctions?.length===8&&p?.links?.length===4&&g?.frontage?.some(v=>v.side==='right');},'Redo restores assisted frontage seed atomically');

  mark('golden-junction-suite');
  await loadJunctionGolden('no-median-crosswalk',
    `const a=d.arms[0];a.median=0;a.medianOffset=0;a.crossing=true;a.stop=true;a.signal=false;a.crossOffset=4;a.laneMarkings=undefined`,
    `const svg=document.querySelector('[data-junction-plan="true"]'),cross=svg?.querySelector('[data-crosswalk-arm="0"]'),center=svg?.querySelector('[data-centerline="true"]'),stripes=cross?.querySelectorAll('[data-crosswalk-stripe="true"]').length??0,start=Number(cross?.getAttribute('data-crosswalk-span-start')),end=Number(cross?.getAttribute('data-crosswalk-span-end')),span=Math.abs(end-start);return{ok:!!svg&&!!cross&&center?.getAttribute('data-centerline-stop-trimmed')==='true'&&stripes>=8&&span>12,crosswalkStripes:stripes,crosswalkSpan:+span.toFixed(2),centerlineTrimmed:center?.getAttribute('data-centerline-stop-trimmed')};`
  );
  await loadJunctionGolden('asymmetric-auxiliary',
    `d.arms[0].angle=12;d.arms[1].angle=100;d.arms[2].angle=192;d.arms[3].angle=282;const a=d.arms[0];a.median=5;a.incomingSection={width:3.5,walk:2.5,bands:[{id:'gold-bike',type:'bike',width:1.5}]};a.outgoingSection={width:3.25,walk:1.5,bands:[{id:'gold-shoulder',type:'shoulder',width:1}]};a.incomingPockets={left:{lanes:0,length:25,taper:15},right:{lanes:1,length:30,taper:20,width:3.25,allocation:'auto'}};a.outgoingPockets={left:{lanes:1,length:25,taper:20,width:3,allocation:'auto'},right:{lanes:0,length:25,taper:15}};a.laneMarkings=undefined`,
    `const svg=document.querySelector('[data-junction-plan="true"]'),inPocket=svg?.querySelectorAll('[data-pocket-lane="incoming-right"]').length??0,outPocket=svg?.querySelectorAll('[data-pocket-lane="outgoing-left"]').length??0,bike=svg?.querySelectorAll('[data-band="bike"]').length??0,shoulder=svg?.querySelectorAll('[data-band="shoulder"]').length??0,walkIn=svg?.querySelectorAll('[data-resolved-sidewalk="incoming"]').length??0,walkOut=svg?.querySelectorAll('[data-resolved-sidewalk="outgoing"]').length??0;return{ok:!!svg&&inPocket===1&&outPocket===1&&bike>=1&&shoulder>=1&&walkIn>=1&&walkOut>=1,inPocket,outPocket,bike,shoulder,walkIn,walkOut};`
  );
  await loadJunctionGolden('slip-acceleration',
    `d.arms.forEach(a=>a.length=180);d.slips=[{id:'slip-0',fromArm:0,toArm:1,width:4,radius:22,approach:{mode:'direct'},departure:{mode:'acceleration',width:4,length:40,merge:25,separator:'raised',separatorWidth:1.5},crossing:{enabled:false,offset:10}}]`,
    `const svg=document.querySelector('[data-junction-plan="true"]'),overlay=svg?.querySelectorAll('[data-slip-overlay="true"]').length??0,departure=svg?.querySelectorAll('[data-slip-departure-pavement="true"]').length??0,island=svg?.querySelectorAll('[data-slip-receiving-island="true"]').length??0,gore=svg?.querySelectorAll('[data-slip-acceleration-gore="true"]').length??0,crossing=svg?.querySelectorAll('[data-slip-crossing="true"]').length??0;return{ok:!!svg&&overlay===1&&departure===1&&island===1&&gore===0&&crossing===0,overlay,departure,island,gore,crossing};`
  );
  await loadJunctionGolden('slip-crossing',
    `d.arms.forEach(a=>a.length=180);d.slips=[{id:'slip-0',fromArm:0,toArm:1,width:4,radius:22,approach:{mode:'direct'},departure:{mode:'direct'},crossing:{enabled:true,offset:10}}]`,
    `const svg=document.querySelector('[data-junction-plan="true"]'),overlay=svg?.querySelectorAll('[data-slip-overlay="true"]').length??0,crossing=svg?.querySelectorAll('[data-slip-crossing="true"]').length??0,stop=svg?.querySelectorAll('[data-slip-stop="true"]').length??0,stripes=svg?.querySelectorAll('[data-slip-crossing-stripe="true"]').length??0;return{ok:!!svg&&overlay===1&&crossing===1&&stop===1&&stripes>=3,overlay,crossing,stop,stripes};`
  );
  await loadJunctionGolden('roundabout-single-lane',
    `d.type='roundabout';d.slips=[];d.ring=1;d.circulation=5.5;d.arms=d.arms.map(a=>({...a,incoming:1,outgoing:1,median:2,signal:false,crossing:true,crossOffset:9,length:140}))`,
    `const svg=document.querySelector('[data-junction-plan="true"]'),central=svg?.querySelectorAll('[data-central-island="true"]').length??0,apron=svg?.querySelectorAll('[data-truck-apron="true"]').length??0,splitter=svg?[...svg.querySelectorAll('[data-median-profile="splitter-and-median"]')].filter(v=>!v.closest('mask')).length:0,crosswalk=svg?.querySelectorAll('[data-crosswalk="true"]').length??0,signals=svg?.querySelectorAll('[data-traffic-signal="true"]').length??0;return{ok:!!svg&&central===1&&apron===1&&splitter===4&&crosswalk===4&&signals===0,central,apron,splitter,crosswalk,signals};`
  );

  writeFileSync(artifactDir+'/network-browser-golden-manifest.json',JSON.stringify({schema:1,viewport:{width:1440,height:1000},artifacts:goldenArtifacts},null,2));
  assert.equal(runtimeErrors.length,0,'Browser runtime errors: '+runtimeErrors.join(' | '));
  report.status='pass';report.runtimeErrors=runtimeErrors;report.finishedAt=new Date().toISOString();
  writeReport({durationMs:Date.now()-started,screenshots:{planBytes:shot2d,scene3dBytes:shot3d},goldenArtifacts,sceneCounts,finalProject:projectSummary(finalProject)});
  console.log('PASS browser acceptance + golden visual suite: assisted frontage seed + parallel/frontage Inspector relationship workflow + keyboard release sweep + rejected-file recovery + persistent project-file dirty baseline + Design Summary/report + unified Current/Full Network export + project file open/new + linked-Junction facing guard + safe cascade delete/undo + safe reconnect controls + scenario comparison + no-median crosswalk + asymmetric auxiliary + Slip acceleration + Slip crossing + roundabout → endpoint-only Arm drag + corridor continuity + resolved 3D');
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
