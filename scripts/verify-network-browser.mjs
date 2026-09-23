import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const port=3017,debugPort=9227,baseUrl=`http://127.0.0.1:${port}/`,artifactDir='artifacts',profileDir='.sites-runtime/chrome-network-acceptance';
mkdirSync(artifactDir,{recursive:true});rmSync(profileDir,{recursive:true,force:true});

function commandPath(names){
  for(const name of names){
    const r=spawnSync('which',[name],{encoding:'utf8'});
    if(r.status===0&&r.stdout.trim())return r.stdout.trim();
  }
  return null;
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
let chrome=null,ws=null;
const shutdown=()=>{
  try{ws?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  try{server.kill('SIGTERM');}catch{}
};
process.on('SIGINT',()=>{shutdown();process.exit(130);});
process.on('SIGTERM',()=>{shutdown();process.exit(143);});

try{
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
  let seq=0;const pending=new Map(),runtimeErrors=[];
  ws.addEventListener('message',event=>{
    const msg=JSON.parse(String(event.data));
    if(msg.id){
      const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);
      if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);
      return;
    }
    if(msg.method==='Runtime.exceptionThrown')runtimeErrors.push(msg.params.exceptionDetails?.text??'Runtime exception');
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')runtimeErrors.push('console.error: '+msg.params.args?.map(v=>v.value??v.description??'').join(' '));
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
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
  async function rectByText(selector,text,index=0){
    return await evalValue(`(()=>{const es=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>(e.textContent||'').includes(${JSON.stringify(text)}));const e=es[${index}];if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
  }
  async function clickAt(p,count=1){
    assert(p&&Number.isFinite(p.x)&&Number.isFinite(p.y),'Missing click target');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:count});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:count});
  }
  async function clickSelector(selector,index=0){const p=await waitFor(()=>rectBySelector(selector,index),selector);await clickAt(p);}
  async function clickText(selector,text,index=0){const p=await waitFor(()=>rectByText(selector,text,index),selector+' text '+text);await clickAt(p);}
  async function dragSelector(selector,dx,dy){
    const p=await waitFor(()=>rectBySelector(selector),selector);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});
    await sleep(80);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});
  }
  const project=()=>evalValue(`(()=>{try{return JSON.parse(localStorage.getItem('thai-street-network-project-v1')||'null')}catch{return null}})()`);

  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'Network workspace load');
  await evalValue(`localStorage.clear();location.reload();true`);
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'clean reload');
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===2&&p?.links?.length===1;},'default project persistence');
  await clickText('.network-header-actions button','Fit');await sleep(180);

  await clickSelector('button[title="ทางแยก"]');
  const plan=await rectBySelector('svg[data-network-plan="true"]');
  await clickAt({x:plan.x+plan.w*.25,y:plan.y-plan.h*.27});
  await waitFor(async()=>{const p=await project();return p?.junctions?.length===3;},'create J-3');
  await clickText('.network-header-actions button','Fit');await sleep(180);

  await clickSelector('button[title="เชื่อมถนน"]');
  await clickSelector('[data-network-port="J-1:1"]');
  await waitFor(()=>evalValue(`document.querySelector('[data-network-port="J-1:1"]')?.getAttribute('data-network-port-state')==='source'`),'source port state');
  await clickSelector('[data-network-port="J-3:3"]');
  await waitFor(async()=>{const p=await project();return p?.links?.length===2&&p.links.some(l=>l.id==='L-2');},'connect L-2');

  await clickSelector('[data-network-link="L-2"]');
  await clickText('button','＋ PI / จุดแนว');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.via?.length===1;},'add PI');
  const beforeDrag=await project(),beforeVia=beforeDrag.links.find(l=>l.id==='L-2').via[0];
  await dragSelector('[data-link-via="0"]',34,-24);
  await waitFor(async()=>{const p=await project(),v=p?.links?.find(l=>l.id==='L-2')?.via?.[0];return v&&Math.hypot(v.x-beforeVia.x,v.y-beforeVia.y)>1;},'drag PI');

  await clickSelector('[data-network-junction-hit="J-3:3"]');
  const lanePlus=await waitFor(()=>evalValue(`(()=>{const row=[...document.querySelectorAll('.network-step-row')].find(e=>(e.textContent||'').includes('เลนเข้า'));const b=row?.querySelectorAll('button');if(!b?.length)return null;const r=b[b.length-1].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`),'incoming lane plus');
  await clickAt(lanePlus);
  await waitFor(async()=>{const p=await project();return p?.junctions?.find(j=>j.id==='J-3')?.design?.arms?.[3]?.incoming===3;},'lane mismatch edit');

  await clickSelector('[data-network-link="L-2"]');
  await waitFor(()=>evalValue(`!!document.querySelector('.network-lane-transition')`),'lane transition controls');
  await clickText('.network-lane-transition button','ริมทาง / Curb');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.forwardLaneTransition?.side==='curb';},'curb lane transition');
  await evalValue(`(()=>{const s=[...document.querySelectorAll('label')].find(e=>(e.textContent||'').includes('การต่อหน้าตัด'))?.querySelector('select');if(!s)return false;s.value='linear';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.mode==='linear';},'resolved section transition');

  await clickText('.network-header-actions button','Undo');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.mode==='review';},'undo section mode');
  await clickText('.network-header-actions button','Redo');
  await waitFor(async()=>{const p=await project();return p?.links?.find(l=>l.id==='L-2')?.sectionProfile?.mode==='linear';},'redo section mode');

  const persisted=await project();
  assert.equal(persisted.junctions.length,3);assert.equal(persisted.links.length,2);assert.equal(persisted.links.find(l=>l.id==='L-2').via.length,1);
  await send('Page.reload',{ignoreCache:true});
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.network-workspace')`),'reload persisted project');
  await waitFor(async()=>{const p=await project(),l=p?.links?.find(v=>v.id==='L-2');return p?.junctions?.length===3&&p?.links?.length===2&&l?.via?.length===1&&l?.sectionProfile?.mode==='linear'&&l?.sectionProfile?.forwardLaneTransition?.side==='curb';},'persistence after reload');

  await clickSelector('[data-network-link="L-2"]');
  await waitFor(()=>evalValue(`!!document.querySelector('.network-section-dock')&&document.querySelector('.network-section-dock')?.textContent?.includes('Station')`),'RoadLink section dock');
  await clickText('.network-view-mode button','3D Overview');
  await waitFor(()=>evalValue(`!!document.querySelector('canvas[aria-label="Network 3D overview"]')&&document.body.textContent.includes('Resolved Network 3D')`),'resolved Network 3D');
  await sleep(600);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(artifactDir+'/network-browser-acceptance.png',Buffer.from(shot.data,'base64'));

  assert.equal(runtimeErrors.length,0,'Browser runtime errors: '+runtimeErrors.join(' | '));
  console.log('PASS browser acceptance: create → connect → PI drag → lane transition → undo/redo → reload → section dock → resolved 3D');
}catch(error){
  if(ws&&ws.readyState===WebSocket.OPEN){
    try{
      const diagnostic=await new Promise((resolve,reject)=>{
        const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:`({notice:document.querySelector('.network-status')?.textContent,ports:[...document.querySelectorAll('[data-network-port]')].map(e=>({key:e.getAttribute('data-network-port'),state:e.getAttribute('data-network-port-state')})),storage:localStorage.getItem('thai-street-network-project-v1')})`,returnByValue:true}}));
      });
      writeFileSync(artifactDir+'/network-browser-diagnostic.json',JSON.stringify(diagnostic.result?.value??diagnostic,null,2));
      const shot=await new Promise((resolve,reject)=>{
        const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method:'Page.captureScreenshot',params:{format:'png',captureBeyondViewport:false}}));
      });
      writeFileSync(artifactDir+'/network-browser-failure.png',Buffer.from(shot.data,'base64'));
    }catch{}
  }
  throw error;
}finally{
  shutdown();
  await sleep(200);
  if(server.exitCode&&server.exitCode!==0)console.error(serverLog);
}
