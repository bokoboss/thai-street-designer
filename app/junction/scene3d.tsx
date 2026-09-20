'use client';
import {useEffect,useRef,useState,useMemo,useImperativeHandle} from 'react';
import {PointerGesture,clampZoom} from './gestures';
import {ContextMenu,ContextMenuTrigger,ContextMenuContent,ContextMenuItem,ContextMenuSeparator} from '@/components/ui/context-menu';
import {groundAt,anchorGround,orbitGround,pointerAction} from './camera3d';
import type {Design} from './model';
import {edges,armIslands,rotate,armTurn,activeIds,armMouth} from './geometry';
import {furnitureFaces} from './furniture3d';
import {buildVisibility,visibleOrder,cameraDirection} from './visibility3d';
type V={x:number;y:number;z:number};
type Face={points:V[];color:string};
const vertex=(x:number,y:number,z:number):V=>({x,y,z});
function prism(points:{x:number;y:number}[],height:number,color:string,side:string):Face[]{return [{points:points.map(p=>({...p,z:height})),color},...points.map((p,i)=>{const q=points[(i+1)%points.length];return {points:[{...p,z:0},{...q,z:0},{...q,z:height},{...p,z:height}],color:side};})];}
export type SceneHandle={exportCanvas:(width:number,transparent:boolean)=>Promise<HTMLCanvasElement>};
export default function Scene3D({d,active,ref,onSave,onNotice}:{d:Design;active:boolean;ref?:React.Ref<SceneHandle>;onSave:(format:'png'|'jpeg')=>void;onNotice:(message:string)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),[yaw,setYaw]=useState(-30),[pitch,setPitch]=useState(52),[zoom,setZoom]=useState(1),[texture,setTexture]=useState<HTMLImageElement|null>(null),[size,setSize]=useState({w:900,h:650});const gestures=useRef(new PointerGesture()),textureTask=useRef<Promise<HTMLImageElement|null>>(Promise.resolve(null));const [pan,setPan]=useState({x:0,y:0}),[mode,setMode]=useState('pan');const camera=useRef({yaw,pitch,zoom,pan});useEffect(()=>{camera.current={yaw,pitch,zoom,pan};},[yaw,pitch,zoom,pan]);
 const drag=useRef<{action:string;point:{x:number;y:number};screen:{x:number;y:number}}|null>(null);
 const extent=Math.max(115,...activeIds(d).map(i=>d.arms[i].length+20));
 const faces=useMemo(()=>{const fs:Face[]=[],edgeSet=edges(d);for(const e of edgeSet){const ps=[...e.outer,...e.walk.slice().reverse()].map(p=>rotate(p,armTurn(d,e.i)));fs.push(...prism(ps,.18,'#bdc9ce','#8d9ca4'));if(e.island.length)fs.push(...prism(e.island.map(p=>rotate(p,armTurn(d,e.i))),.18,'#c7cdbd','#9caa9d'));}
 for(const i of activeIds(d)){const polygons=armIslands(d,i,edgeSet);for(const polygon of polygons){const ps=polygon.map(p=>rotate(p,armTurn(d,i)));fs.push(...prism(ps,.2,'#86a58a','#b6ad77'));}}
 if(d.type==='roundabout'){const ps=Array.from({length:80},(_,i)=>({x:d.radius*Math.cos(i/80*Math.PI*2),y:d.radius*Math.sin(i/80*Math.PI*2)}));fs.push(...prism(ps,.25,'#86a58a','#b6ad77'));}
 fs.push(...furnitureFaces(d));
 return fs;},[d]);
 const visibility=useMemo(()=>buildVisibility(faces),[faces]);
 useEffect(()=>{if(!active)return;const c=canvas.current;if(!c)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({w:r.width,h:r.height});});observer.observe(c);return()=>observer.disconnect();},[active]);
 useEffect(()=>{if(!active)return;let stale=false,url='';const source=document.querySelector<SVGSVGElement>('.j-drawing > svg');if(!source)return;const copy=source.cloneNode(true) as SVGSVGElement;copy.querySelectorAll('[data-background],[data-selection],[data-scale],[data-road-name],[data-road-object],[data-traffic-signal]').forEach(n=>n.remove());copy.querySelector('g')?.removeAttribute('transform');copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('viewBox',`${-extent} ${-extent} ${extent*2} ${extent*2}`);copy.setAttribute('width','1800');copy.setAttribute('height','1800');const img=new Image();textureTask.current=new Promise(resolve=>{img.onload=()=>{if(!stale)setTexture(img);resolve(img);};img.onerror=()=>resolve(null);});url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));img.src=url;return()=>{stale=true;URL.revokeObjectURL(url);};},[d,active,extent]);
 function draw(ctx:CanvasRenderingContext2D,w:number,h:number,background:string|null,img:HTMLImageElement|null){
 ctx.clearRect(0,0,w,h);if(background){ctx.fillStyle=background;ctx.fillRect(0,0,w,h);}
 const a=(yaw+d.rotation)*Math.PI/180,p=pitch*Math.PI/180,scale=Math.min(w,h)/(extent*2)*zoom;
 const project=(v:V)=>{const x=v.x*Math.cos(a)-v.y*Math.sin(a),y=v.x*Math.sin(a)+v.y*Math.cos(a);return {x:w/2+pan.x*w+x*scale,y:h/2+pan.y*h+(y*Math.cos(p)-v.z*Math.sin(p))*scale,depth:y*Math.sin(p)+v.z*Math.cos(p)};};
 if(img){const origin=project(vertex(-extent,-extent,0)),x=project(vertex(extent,-extent,0)),y=project(vertex(-extent,extent,0));ctx.save();ctx.transform((x.x-origin.x)/1800,(x.y-origin.y)/1800,(y.x-origin.x)/1800,(y.y-origin.y)/1800,origin.x,origin.y);ctx.drawImage(img,0,0,1800,1800);ctx.restore();}
 for(const f of visibleOrder(visibility,cameraDirection(yaw+d.rotation,pitch))){ctx.beginPath();f.points.map(project).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();}
 }
 useEffect(()=>{if(!active)return;const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx)return;const ratio=Math.min(window.devicePixelRatio||1,2);c.width=size.w*ratio;c.height=size.h*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);draw(ctx,size.w,size.h,'#e9eff2',texture);},[active,size,texture,faces,yaw,pitch,zoom,pan,extent,d.rotation]);
 useEffect(()=>{if(!active){gestures.current.clear();drag.current=null;}},[active]);
 useEffect(()=>{const el=canvas.current;if(!active||!el)return;const prevent=(e:WheelEvent)=>e.preventDefault();el.addEventListener('wheel',prevent,{passive:false});return()=>el.removeEventListener('wheel',prevent);},[active]);
 async function exportCanvas(width:number,transparent:boolean){const img=await textureTask.current;if(!img)throw Error('กำลังเตรียมภาพ 3D กรุณาลองอีกครั้ง');const c=document.createElement('canvas');c.width=width;c.height=Math.max(1,Math.round(width*size.h/size.w));const ctx=c.getContext('2d');if(!ctx)throw Error('ไม่สามารถสร้างภาพได้');draw(ctx,c.width,c.height,transparent?null:'#ffffff',img);return c;}
 useImperativeHandle(ref,()=>({exportCanvas}));
 function copyImage(){if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined'){onNotice('เบราว์เซอร์นี้ไม่รองรับคัดลอกภาพ ใช้บันทึกภาพ PNG แทน');return;}
 const blob=exportCanvas(2400,true).then(c=>new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('สร้างภาพไม่ได้')),'image/png')));
 // Start clipboard.write during the menu gesture; defer only PNG encoding.
 try{navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(()=>onNotice('คัดลอกภาพ 3D แล้ว พร้อมวางในเอกสารหรือแชท')).catch(()=>onNotice('คัดลอกภาพไม่ได้ กรุณาอนุญาตคลิปบอร์ดหรือใช้บันทึกภาพ PNG'));}catch{void blob.catch(()=>{});onNotice('คัดลอกภาพไม่ได้ ใช้บันทึกภาพ PNG แทน');}}
 function viewport(r:DOMRect){return {width:r.width,height:r.height,extent,rotation:d.rotation};}
 function applyCamera(c:typeof camera.current){camera.current=c;setYaw(c.yaw);setPitch(c.pitch);setZoom(c.zoom);setPan(c.pan);}
 function begin(e:React.PointerEvent<HTMLCanvasElement>){const action=pointerAction(e.pointerType,e.button,mode);if(action==='none')return;e.preventDefault();const r=e.currentTarget.getBoundingClientRect(),screen={x:e.clientX-r.x,y:e.clientY-r.y};gestures.current.down(e.pointerId,{x:e.clientX,y:e.clientY});drag.current={action,point:groundAt(camera.current,viewport(r),screen),screen};e.currentTarget.setPointerCapture(e.pointerId);}
 function end(e:React.PointerEvent<HTMLCanvasElement>){gestures.current.up(e.pointerId);drag.current=null;}
 function wheel(e:React.WheelEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect(),v=viewport(r),screen={x:e.clientX-r.x,y:e.clientY-r.y},current=camera.current,point=groundAt(current,v,screen),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?r.height:1);applyCamera(anchorGround({...current,zoom:clampZoom(current.zoom*Math.exp(-Math.max(-500,Math.min(500,delta))*.002))},v,point,screen));}
 function resetCamera(){gestures.current.clear();drag.current=null;setYaw(-30);setPitch(52);setZoom(1);setPan({x:0,y:0});}
 function move(e:React.PointerEvent<HTMLCanvasElement>){const g=gestures.current.move(e.pointerId,{x:e.clientX,y:e.clientY});if(!g)return;const current=camera.current;
 if(g.count===1&&drag.current?.action==='rotate'){applyCamera(orbitGround(current,viewport(e.currentTarget.getBoundingClientRect()),drag.current.point,drag.current.screen,g.dx,g.dy));return;}
 const r=e.currentTarget.getBoundingClientRect(),nextZoom=clampZoom(current.zoom*g.factor),ratio=nextZoom/current.zoom,nextPan={x:(g.after.x-r.x-r.width/2-(g.before.x-r.x-r.width/2-current.pan.x*r.width)*ratio)/r.width,y:(g.after.y-r.y-r.height/2-(g.before.y-r.y-r.height/2-current.pan.y*r.height)*ratio)/r.height};camera.current={...current,zoom:nextZoom,pan:nextPan};setZoom(nextZoom);setPan(nextPan);
 }
 if(!active)return null;return <div className="j-scene"><ContextMenu onOpenChange={open=>{if(open){gestures.current.clear();drag.current=null;}}}><ContextMenuTrigger asChild><canvas ref={canvas} tabIndex={0} aria-label="แบบสามมิติ คลิกซ้ายเลื่อน คลิกกลางหมุน ล้อเมาส์ซูม คลิกขวาเมนูภาพ" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onAuxClick={e=>e.preventDefault()} onWheel={wheel}/></ContextMenuTrigger><ContextMenuContent><ContextMenuItem onSelect={()=>onSave('png')}>บันทึกภาพ PNG · โปร่งใส</ContextMenuItem><ContextMenuItem onSelect={()=>onSave('jpeg')}>บันทึกภาพ JPEG · พื้นขาว</ContextMenuItem><ContextMenuItem onSelect={copyImage}>คัดลอกภาพ 3D</ContextMenuItem><ContextMenuSeparator/><ContextMenuItem onSelect={resetCamera}>คืนมุมมองเริ่มต้น</ContextMenuItem></ContextMenuContent></ContextMenu><div className="j-scene-note">เมาส์: ซ้ายเลื่อน · กลางหมุน · ล้อซูม · ขวาเมนูภาพ<br/>สัมผัส: นิ้วเดียว{mode==='rotate'?'หมุน':'เลื่อน'} · สองนิ้วเลื่อนและบีบซูม</div><div className="j-scene-tools"><button aria-pressed={mode==='rotate'} onClick={()=>setMode('rotate')}>นิ้วเดียวหมุน</button><button aria-pressed={mode==='pan'} onClick={()=>setMode('pan')}>นิ้วเดียวเลื่อน</button><button aria-label="ซูมออก 3D" onClick={()=>setZoom(z=>clampZoom(z/1.2))}>−</button><span aria-live="polite">{Math.round(zoom*100)}%</span><button aria-label="ซูมเข้า 3D" onClick={()=>setZoom(z=>clampZoom(z*1.2))}>＋</button><button onClick={resetCamera}>พอดีภาพ 3D</button><button onClick={()=>setPitch(10)}>มุมต่ำ</button><button onClick={()=>setPitch(78)}>มุมสูง</button></div></div>;
}
