// Minimal headless Chrome session over the DevTools protocol, for browser acceptance scripts.
// Starts `next start` on a free port, opens one page and offers small helpers.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';

const which=names=>{for(const n of names){const r=spawnSync('which',[n],{encoding:'utf8'});if(r.status===0&&r.stdout.trim())return r.stdout.trim();}return null;};
const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.unref();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();s.close(()=>resolve(a.port));});});
async function waitJson(url,timeout=45000){const until=Date.now()+timeout;while(Date.now()<until){try{const r=await fetch(url);if(r.ok)return await r.json().catch(()=>({}));}catch{}await sleep(200);}throw new Error('Timed out waiting for '+url);}

export async function startSession({root,path='/',profile,width=1440,height=1000}){
  const port=await freePort();let debugPort=await freePort();while(debugPort===port)debugPort=await freePort();
  const base=`http://127.0.0.1:${port}`,errors=[];
  rmSync(profile,{recursive:true,force:true});mkdirSync(profile,{recursive:true});
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{cwd:root,env:process.env,stdio:'ignore'});
  let chrome=null,ws=null,seq=0;const pending=new Map();
  const close=()=>{try{ws?.close();}catch{}try{chrome?.kill('SIGTERM');}catch{}try{server.kill('SIGTERM');}catch{}};
  try{
    await waitJson(base+path);
    const bin=process.env.CHROME_BIN||which(['google-chrome','google-chrome-stable','chromium','chromium-browser']);
    assert(bin,'Chrome/Chromium is required for browser acceptance');
    chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--hide-scrollbars',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,`--window-size=${width},${height}`,'about:blank'],{stdio:'ignore'});
    await waitJson(`http://127.0.0.1:${debugPort}/json/version`);
    const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
    ws.addEventListener('message',ev=>{
      const msg=JSON.parse(String(ev.data));
      if(msg.id){const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timer);if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);return;}
      if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails?.exception?.description??msg.params.exceptionDetails?.text??'exception');
      if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push('console.error: '+msg.params.args?.map(a=>a.value??a.description??'').join(' '));
    });
  }catch(e){close();throw e;}
  const send=(method,params={},timeout=15000)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},timeout);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const evalValue=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;};
  const waitFor=async(fn,label,timeout=20000)=>{const until=Date.now()+timeout;let last;while(Date.now()<until){try{last=await fn();if(last)return last;}catch{}await sleep(100);}throw new Error('Timed out: '+label+' last='+JSON.stringify(last));};
  const rect=async(selector,index=0)=>evalValue(`(()=>{const e=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
  const mouse=(type,p,extra={})=>send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',...extra});
  const clickAt=async(p,count=1)=>{await mouse('mouseMoved',p);for(let c=1;c<=count;c++){await mouse('mousePressed',p,{clickCount:c});await mouse('mouseReleased',p,{clickCount:c});}};
  // Scroll the element into view first (inspector panels scroll), then click its centre.
  const click=async(selector,index=0)=>{
    await waitFor(()=>rect(selector,index),selector);
    await evalValue(`document.querySelectorAll(${JSON.stringify(selector)})[${index}]?.scrollIntoView({block:'nearest',inline:'nearest'})`);
    return clickAt(await waitFor(()=>rect(selector,index),selector));
  };
  const drag=async(from,to,steps=6)=>{await mouse('mouseMoved',from);await mouse('mousePressed',from,{clickCount:1});for(let i=1;i<=steps;i++)await mouse('mouseMoved',{x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps},{buttons:1});await mouse('mouseReleased',to,{clickCount:1});};
  const key=async(k,code=k,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,modifiers,windowsVirtualKeyCode:k==='Enter'?13:k==='Escape'?27:0});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,modifiers});};
  const type=async text=>send('Input.insertText',{text});
  const text=async selector=>evalValue(`document.querySelector(${JSON.stringify(selector)})?.innerText??null`);
  const count=async selector=>evalValue(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const goto=async url=>{await send('Page.navigate',{url:base+url});};
  const screenshot=async file=>{const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(file,Buffer.from(r.data,'base64'));};
  await goto(path);
  return{base,send,evalValue,waitFor,rect,clickAt,click,drag,key,type,text,count,goto,screenshot,errors,close};
}
