// Junction editor golden visual suite (opened from /design as the advanced junction editor). Kept from the retired
// Network browser acceptance: no-median crosswalk, asymmetric auxiliary lanes, Slip acceleration and crossing, roundabout.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const artifactDir='artifacts',profileDir='.test-build/chrome-junction-goldens';
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
  writeFileSync(artifactDir+'/junction-goldens-report.json',JSON.stringify({...report,...extra,currentCheckpoint:checkpoint},null,2));
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

const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
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
  const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl+'junction')}`,{method:'PUT'}).then(r=>r.json());
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
  await send('Page.navigate',{url:baseUrl+'junction'});

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
  async function captureScreenshot(name){
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},20000);
    const bytes=Buffer.from(shot.data,'base64');assert(bytes.length>5000,'Screenshot is unexpectedly small: '+name);
    writeFileSync(artifactDir+'/'+name,bytes);
    return{file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const goldenArtifacts=[];
  async function goldenScreenshot(id,contract){
    const meta=await captureScreenshot('junction-goldens-golden-'+id+'.png');
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
  mark('font-check');
  await waitFor(()=>evalValue(`document.readyState==='complete'&&!!document.querySelector('.junction-app')`),'Junction editor load');
  const thaiFontReady=await evalValue(`document.fonts.check('12px "Noto Sans Thai"','ภาษาไทย')||document.fonts.check('12px Tahoma','ภาษาไทย')`);
  assert(thaiFontReady,'Visual acceptance requires a Thai-capable font so golden screenshots do not hide labels as missing glyphs');

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

  writeFileSync(artifactDir+'/junction-goldens-golden-manifest.json',JSON.stringify({schema:1,viewport:{width:1440,height:1000},artifacts:goldenArtifacts},null,2));
  assert.equal(runtimeErrors.length,0,'Browser runtime errors: '+runtimeErrors.join(' | '));
  report.status='pass';report.runtimeErrors=runtimeErrors;report.finishedAt=new Date().toISOString();
  writeReport({durationMs:Date.now()-started,goldenArtifacts});
  console.log('PASS junction editor golden visual suite: no-median crosswalk + asymmetric auxiliary + Slip acceleration + Slip crossing + roundabout');
}catch(error){
  report.status='fail';report.runtimeErrors=runtimeErrors;report.finishedAt=new Date().toISOString();
  if(ws&&ws.readyState===WebSocket.OPEN){
    try{
      const diagnostic=await new Promise((resolve,reject)=>{
        const id=++seq,timer=globalThis.setTimeout(()=>{pending.delete(id);reject(new Error('Diagnostic CDP timeout'));},8000);
        pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:`({notice:document.querySelector('.network-status')?.textContent,ports:[...document.querySelectorAll('[data-network-port]')].map(e=>({key:e.getAttribute('data-network-port'),state:e.getAttribute('data-network-port-state')})),storage:localStorage.getItem('thai-street-network-project-v1')})`,returnByValue:true}}));
      });
      writeFileSync(artifactDir+'/junction-goldens-diagnostic.json',JSON.stringify({checkpoint,runtimeErrors,diagnostic:diagnostic.result?.value??diagnostic},null,2));
      await captureScreenshot('junction-goldens-failure.png');
    }catch{}
  }
  writeReport({durationMs:Date.now()-started,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error),serverLogTail:serverLog.slice(-5000)});
  throw error;
}finally{
  shutdown();
  await sleep(200);
  if(server.exitCode&&server.exitCode!==0)console.error(serverLog);
}
