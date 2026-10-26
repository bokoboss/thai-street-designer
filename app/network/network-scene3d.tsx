'use client';
import './scene3d.css';
import {useEffect,useMemo,useRef,useState} from 'react';
import {anchorGround,groundAt,orbitGround} from '../junction/camera3d';
import {clampZoom,PointerGesture} from '../junction/gestures';
import {renderMapTexture,type MapProviderCredentials,type MapReference} from '../junction/map-background';
import {projectBounds,type NetworkProject} from '@/core/network/network-project';
import type {ConnectorReview} from '@/core/road-first/connector-review-geometry';
import {
  ELEVATED,resolveElevatedLinkScene,resolveJunctionSceneFaces,resolveJunctionSceneSurfaces,resolveRoadLinkSceneFaces,resolveRoadLinkSceneSurfaces,type NetworkSceneSurfaceKind
} from '@/core/network/network-scene-geometry';

type Size={w:number;h:number};
type CameraMode='pan'|'orbit';
/** The camera survives leaving and re-entering 3D within this visit (review 2026-10-21: 3D reset every time). */
let rememberedCamera:{yaw:number;pitch:number;zoom:number;pan:{x:number;y:number}}|null=null;
/** Zoom is relative to fitting the whole design; the range reaches lane detail on a large network. */
const ZOOM_MIN=.1,ZOOM_MAX=40;
type DragState={action:'pan'|'rotate';point:{x:number;y:number};screen:{x:number;y:number}}|null;

export default function NetworkScene3D({
  project,mapReference,mapCredentials,active,fitKey=0,connectorReview=null
}:{project:NetworkProject;mapReference:MapReference;mapCredentials:MapProviderCredentials;active:boolean;fitKey?:number;connectorReview?:ConnectorReview|null}){
  const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<DragState>(null),gestures=useRef(new PointerGesture()),modeRef=useRef<CameraMode>('pan'),
    [size,setSize]=useState<Size>({w:900,h:650}),[yaw,setYaw]=useState(rememberedCamera?.yaw??-35),[pitch,setPitch]=useState(rememberedCamera?.pitch??52),[zoom,setZoom]=useState(rememberedCamera?.zoom??.92),
    [pan,setPan]=useState(rememberedCamera?.pan??{x:0,y:0}),[mode,setMode]=useState<CameraMode>('pan'),
    [mapTexture,setMapTexture]=useState<{key:string;image:HTMLCanvasElement|null}|null>(null),[detailImage,setDetailImage]=useState<HTMLImageElement|null>(null);
  const camera=useRef({yaw,pitch,zoom,pan});
  useEffect(()=>{camera.current={yaw,pitch,zoom,pan};rememberedCamera={yaw,pitch,zoom,pan};},[yaw,pitch,zoom,pan]);

  const scene=useMemo(()=>{
      if(!active)return{junctionSurfaces:[],linkSurfaces:[],furnitureFaces:[],elevated:{faces:[],lines:[]},bounds:{x:-80,y:-80,w:160,h:160}};
      return{
        junctionSurfaces:resolveJunctionSceneSurfaces(project),
        linkSurfaces:resolveRoadLinkSceneSurfaces(project),
        furnitureFaces:[...resolveJunctionSceneFaces(project),...resolveRoadLinkSceneFaces(project)],
        elevated:resolveElevatedLinkScene(project),
        bounds:projectBounds(project,45)
      };
    },[active,project]),
    {junctionSurfaces,linkSurfaces,furnitureFaces,elevated,bounds}=scene,
    junctionSurfaceCount=junctionSurfaces.length,linkSurfaceCount=linkSurfaces.length,furnitureFaceCount=furnitureFaces.length,
    center={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},extent=Math.max(80,Math.max(bounds.w,bounds.h)/2),
    mapKey=[mapReference.enabled,mapReference.basemap,mapReference.lat,mapReference.lng,mapReference.zoom,mapReference.offsetX,mapReference.offsetY,extent.toFixed(2),center.x.toFixed(2),center.y.toFixed(2)].join(':');

  useEffect(()=>{
    if(!active||!canvas.current)return;
    const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r)setSize({w:Math.max(1,r.width),h:Math.max(1,r.height)});});
    observer.observe(canvas.current);return()=>observer.disconnect();
  },[active]);

  useEffect(()=>{
    if(!active||!mapReference.enabled)return;
    let stale=false;
    renderMapTexture(mapReference,mapCredentials,extent,1200,{x:center.x,y:center.y}).then(image=>{if(!stale)setMapTexture({key:mapKey,image});});
    return()=>{stale=true;};
  },[active,mapReference,mapCredentials,extent,center.x,center.y,mapKey]);

  useEffect(()=>{
    if(!active)return;
    // Lane lines, arrows, crossings and stop lines come from the same 2D drawing (network page or /design plan).
    const source=document.querySelector<SVGSVGElement>('svg[data-design-plan="true"],svg[data-network-plan="true"]');
    if(!source)return;
    let stale=false,url='';
    const copy=source.cloneNode(true) as SVGSVGElement;
    // Raised links draw their own lines at their level; their flat markings would land on the ground.
    copy.querySelectorAll('[data-network-link-elevated="true"] [data-scene-detail="true"]').forEach(n=>n.remove());
    const details=[...copy.querySelectorAll('[data-scene-detail="true"]')];
    if(!details.length)return;
    const ancestors=new Set<Element>();
    for(const detail of details){
      let parent:Element|null=detail.parentElement;
      while(parent&&parent!==copy){ancestors.add(parent);parent=parent.parentElement;}
    }
    for(const el of [...copy.querySelectorAll('*')]){
      const tag=el.tagName.toLowerCase();
      if(tag==='defs'||el.closest('defs')||tag==='style'||el.closest('[data-scene-detail="true"]')||ancestors.has(el))continue;
      el.remove();
    }
    copy.classList.remove('network-plan-hidden');
    copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
    copy.setAttribute('viewBox',`${center.x-extent} ${center.y-extent} ${extent*2} ${extent*2}`);
    copy.setAttribute('width','1800');copy.setAttribute('height','1800');
    const img=new Image();
    img.onload=()=>{if(!stale)setDetailImage(img);};
    img.onerror=()=>{if(!stale)setDetailImage(null);};
    url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));
    img.src=url;
    return()=>{stale=true;if(url)URL.revokeObjectURL(url);};
  },[active,project,extent,center.x,center.y]);

  useEffect(()=>{if(!active){gestures.current.clear();drag.current=null;}},[active]);
  useEffect(()=>{
    const el=canvas.current;if(!active||!el)return;
    const prevent=(e:WheelEvent)=>e.preventDefault();el.addEventListener('wheel',prevent,{passive:false});
    return()=>el.removeEventListener('wheel',prevent);
  },[active]);

  const mapImage=mapReference.enabled&&mapTexture?.key===mapKey?mapTexture.image:null;
  const viewport=(r:DOMRect)=>({width:r.width,height:r.height,extent,rotation:0});
  const applyCamera=(next:typeof camera.current)=>{camera.current=next;setYaw(next.yaw);setPitch(next.pitch);setZoom(next.zoom);setPan(next.pan);};
  const resetGestures=()=>{gestures.current.clear();drag.current=null;};
  const setCameraMode=(next:CameraMode)=>{modeRef.current=next;resetGestures();setMode(next);};
  const fitView=()=>applyCamera({...camera.current,zoom:.92,pan:{x:0,y:0}});
  // The workspace "fit" button fits the view that is open (fitKey changes on each press).
  const firstFit=useRef(fitKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(fitKey!==firstFit.current)fitView();},[fitKey]);
  const isoView=()=>applyCamera({yaw:-35,pitch:52,zoom:.92,pan:{x:0,y:0}});
  // Pitch 0 looks straight down (the projection compresses depth by cos(pitch)).
  const topView=()=>applyCamera({yaw:0,pitch:0,zoom:.92,pan:{x:0,y:0}});
  const zoomBy=(factor:number)=>applyCamera({...camera.current,zoom:clampZoom(camera.current.zoom*factor,ZOOM_MIN,ZOOM_MAX)});

  useEffect(()=>{
    if(!active)return;
    const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx)return;
    const sceneSurfaces=[...junctionSurfaces,...linkSurfaces],
      ratio=Math.min(window.devicePixelRatio||1,2);c.width=size.w*ratio;c.height=size.h*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);
    const w=size.w,h=size.h,a=yaw*Math.PI/180,p=pitch*Math.PI/180,scale=Math.min(w,h)/(extent*2)*zoom;
    const projectPoint=(x:number,y:number,z=0)=>{
      const rx=(x-center.x)*Math.cos(a)-(y-center.y)*Math.sin(a),ry=(x-center.x)*Math.sin(a)+(y-center.y)*Math.cos(a);
      return{x:w/2+pan.x*w+rx*scale,y:h/2+pan.y*h+(ry*Math.cos(p)-z*Math.sin(p))*scale};
    };
    const drawPlane=(image:HTMLCanvasElement|HTMLImageElement,z:number,alpha:number)=>{
      const o=projectPoint(center.x-extent,center.y-extent,z),x=projectPoint(center.x+extent,center.y-extent,z),y=projectPoint(center.x-extent,center.y+extent,z);
      ctx.save();ctx.globalAlpha=alpha;ctx.transform((x.x-o.x)/image.width,(x.y-o.y)/image.width,(y.x-o.x)/image.height,(y.y-o.y)/image.height,o.x,o.y);ctx.drawImage(image,0,0);ctx.restore();
    };
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#e9eff2';ctx.fillRect(0,0,w,h);
    const ground=[projectPoint(center.x-extent,center.y-extent),projectPoint(center.x+extent,center.y-extent),projectPoint(center.x+extent,center.y+extent),projectPoint(center.x-extent,center.y+extent)];
    ctx.beginPath();ground.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle='#dfe7e9';ctx.fill();
    if(mapImage)drawPlane(mapImage,0,Math.max(.1,Math.min(1,mapReference.opacity)));

    const surfaceFill:Record<NetworkSceneSurfaceKind,string>={road:'#3f4c56',median:'#83957a',bike:'#467d70',motorcycle:'#526c91',shoulder:'#66727c',buffer:'#899396',sidewalk:'#b9c5cc','structure-walk':'#c9cfd2',barrier:'#d3d8da'},
      depth=(item:{points:{x:number;y:number;z?:number}[];base?:number[]})=>item.points.reduce((sum,q,i)=>sum+(q.x-center.x)*Math.sin(a)+(q.y-center.y)*Math.cos(a)-((q.z??0)+(item.base?.[i]??0))*.2,0)/(item.points.length||1),
      drawSurface=(surface:(typeof sceneSurfaces)[number])=>{
        const top=surface.points.map((q,i)=>projectPoint(q.x,q.y,surface.z+(surface.base?.[i]??0)));
        if(surface.z>.08){
          const bottom=surface.points.map((q,i)=>projectPoint(q.x,q.y,surface.base?.[i]??0));
          ctx.fillStyle='rgba(80,92,96,.28)';
          for(let i=0;i<top.length;i++){const j=(i+1)%top.length;ctx.beginPath();ctx.moveTo(bottom[i].x,bottom[i].y);ctx.lineTo(bottom[j].x,bottom[j].y);ctx.lineTo(top[j].x,top[j].y);ctx.lineTo(top[i].x,top[i].y);ctx.closePath();ctx.fill();}
        }
        ctx.beginPath();top.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=surfaceFill[surface.kind];ctx.fill();
        ctx.strokeStyle='rgba(245,248,249,.32)';ctx.lineWidth=.45;ctx.stroke();
      };
    // Painter's order (Phase 4A): below-ground roads and trough walls, then the ground (which hides a tunnel under the crossing road)
    // with the flat marking texture, then deck sides, raised roads and parapets.
    const drawFace=(face:{points:{x:number;y:number;z:number}[];color:string})=>{const ps=face.points.map(q=>projectPoint(q.x,q.y,q.z));ctx.beginPath();ps.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=face.color;ctx.fill();},
      drawLine=(line:(typeof elevated.lines)[number])=>{ctx.beginPath();line.points.forEach((q,i)=>{const p2=projectPoint(q.x,q.y,q.z);if(i)ctx.lineTo(p2.x,p2.y);else ctx.moveTo(p2.x,p2.y);});
        ctx.setLineDash(line.dashed?[6,8]:[]);ctx.strokeStyle='#e7ecef';ctx.lineWidth=line.dashed?1:1.3;ctx.stroke();ctx.setLineDash([]);},
      levelOf=(v:{base?:number[]})=>{const b=v.base??[];return b.some(z=>z>ELEVATED)?1:b.some(z=>z< -ELEVATED)?-1:0;},
      byLayer=(layer:string)=>elevated.faces.filter(f=>f.layer===layer).sort((u,v)=>depth(u)-depth(v)),
      lineLevel=(l:(typeof elevated.lines)[number])=>l.points.some(q=>q.z>ELEVATED)?1:-1,
      down=sceneSurfaces.filter(v=>levelOf(v)<0),ground0=sceneSurfaces.filter(v=>levelOf(v)===0),up=sceneSurfaces.filter(v=>levelOf(v)>0);
    down.filter(v=>v.z<.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    down.filter(v=>v.z>=.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    elevated.lines.filter(l=>lineLevel(l)<0).forEach(drawLine);
    byLayer('below').forEach(drawFace);
    ground0.filter(v=>v.z<.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    if(detailImage)drawPlane(detailImage,.082,1);
    ground0.filter(v=>v.z>=.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    byLayer('deck').forEach(drawFace);
    up.filter(v=>v.z<.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    up.filter(v=>v.z>=.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    elevated.lines.filter(l=>lineLevel(l)>0).forEach(drawLine);
    byLayer('top').forEach(drawFace);
    for(const face of [...furnitureFaces].sort((u,v)=>depth(u)-depth(v))){
      const ps=face.points.map(q=>projectPoint(q.x,q.y,q.z));ctx.beginPath();ps.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=face.color;ctx.fill();
    }
    // Screen-space engineering review overlay, AFTER pavement/furniture. Never baked into plan texture
    // or interpreted as lane markings, a swept path, traffic capacity or physical connector geometry.
    if(connectorReview?.lines.length){
      ctx.save();ctx.setLineDash([6,6]);ctx.lineWidth=2;
      for(const line of connectorReview.lines){
        const a=projectPoint(line.start.x,line.start.y,connectorReview.elevation+1.2),
          b=projectPoint(line.end.x,line.end.y,connectorReview.elevation+1.2);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.strokeStyle=line.origin==='manual'?'#24c6ad':'#f5bb48';ctx.stroke();
        ctx.setLineDash([]);ctx.fillStyle=line.origin==='manual'?'#24c6ad':'#f5bb48';
        for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
        ctx.setLineDash([6,6]);
      }
      ctx.restore();
    }
  },[active,size,yaw,pitch,zoom,pan,extent,center.x,center.y,mapImage,mapReference.opacity,detailImage,junctionSurfaces,linkSurfaces,furnitureFaces,elevated,connectorReview]);

  function begin(e:React.PointerEvent<HTMLCanvasElement>){
    const action=e.pointerType==='mouse'
      // Same as the 2D plan: middle button pans; right button or Shift+drag orbits; left follows the Pan/Orbit choice.
      ?(e.button===1?'pan':e.button===2||e.shiftKey?'rotate':e.button===0?(modeRef.current==='orbit'?'rotate':'pan'):'none')
      :(modeRef.current==='orbit'?'rotate':'pan');
    if(action==='none')return;
    e.preventDefault();
    const r=e.currentTarget.getBoundingClientRect(),screen={x:e.clientX-r.x,y:e.clientY-r.y};
    gestures.current.down(e.pointerId,{x:e.clientX,y:e.clientY});
    drag.current={action,point:groundAt(camera.current,viewport(r),screen),screen};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:React.PointerEvent<HTMLCanvasElement>){
    const g=gestures.current.move(e.pointerId,{x:e.clientX,y:e.clientY});if(!g)return;
    const current=camera.current,r=e.currentTarget.getBoundingClientRect(),v=viewport(r);
    if(g.count===1&&drag.current?.action==='rotate'){
      applyCamera(orbitGround(current,v,drag.current.point,drag.current.screen,g.dx,g.dy));return;
    }
    const nextZoom=clampZoom(current.zoom*g.factor,ZOOM_MIN,ZOOM_MAX),ratio=nextZoom/current.zoom,
      nextPan={
        x:(g.after.x-r.x-r.width/2-(g.before.x-r.x-r.width/2-current.pan.x*r.width)*ratio)/r.width,
        y:(g.after.y-r.y-r.height/2-(g.before.y-r.y-r.height/2-current.pan.y*r.height)*ratio)/r.height
      };
    applyCamera({...current,zoom:nextZoom,pan:nextPan});
  }
  function end(e:React.PointerEvent<HTMLCanvasElement>){
    gestures.current.up(e.pointerId);if(!gestures.current.count)drag.current=null;
    try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
  }
  function wheel(e:React.WheelEvent<HTMLCanvasElement>){
    e.preventDefault();
    const r=e.currentTarget.getBoundingClientRect(),v=viewport(r),screen={x:e.clientX-r.x,y:e.clientY-r.y},current=camera.current,
      point=groundAt(current,v,screen),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?r.height:1),
      nextZoom=clampZoom(current.zoom*Math.exp(-Math.max(-500,Math.min(500,delta))*.002),ZOOM_MIN,ZOOM_MAX);
    applyCamera(anchorGround({...current,zoom:nextZoom},v,point,screen));
  }

  if(!active)return null;
  return <div className="network-scene3d">
    <canvas ref={canvas} tabIndex={0} aria-label="Network 3D overview" data-network-scene-mode="resolved"
      data-network-scene-junction-surfaces={junctionSurfaceCount} data-network-scene-link-surfaces={linkSurfaceCount}
      data-network-scene-detail-texture={detailImage?'true':'false'} data-network-scene-furniture-faces={furnitureFaceCount} data-network-scene-raised={elevated.faces.filter(f=>f.layer!=="below").length} data-network-scene-below={elevated.faces.filter(f=>f.layer==="below").length}
      data-network-camera-mode={mode} data-network-camera-yaw={yaw.toFixed(3)} data-network-camera-pitch={pitch.toFixed(3)}
      data-network-camera-zoom={zoom.toFixed(4)} data-network-camera-pan-x={pan.x.toFixed(5)} data-network-camera-pan-y={pan.y.toFixed(5)}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onAuxClick={e=>e.preventDefault()} onContextMenu={e=>e.preventDefault()} onWheel={wheel} onDoubleClick={fitView}/>
    <div className="network-scene-note"><b>มุมมอง 3D ของโครงข่าย</b>{!!connectorReview?.lines.length&&<span data-network-connector-review="true">เส้นประสีเหลือง/เขียวเป็นการจับคู่ช่องสำหรับตรวจแบบเท่านั้น ไม่ใช่เครื่องหมายถนนหรือแนวรถวิ่ง</span>}<span>ลากซ้าย = {mode==='pan'?'เลื่อน':'หมุน'} · ลากปุ่มกลาง = เลื่อน · ลากขวาหรือ Shift+ลาก = หมุน · ล้อเมาส์ = ซูม</span>{mapReference.enabled&&<span>{mapImage?'แสดงแผนที่อ้างอิงบนพื้น':'กำลังเตรียมแผนที่…'}</span>}</div>
    <div className="network-scene-tools">
      <div className="network-camera-mode">
        <button data-network-camera-control="pan" aria-pressed={mode==='pan'} onClick={()=>setCameraMode('pan')}>Pan</button>
        <button data-network-camera-control="orbit" aria-pressed={mode==='orbit'} onClick={()=>setCameraMode('orbit')}>Orbit</button>
      </div>
      <div className="network-camera-actions">
        <button data-network-camera-control="zoom-in" title="Zoom in" onClick={()=>zoomBy(1.18)}>＋</button>
        <button data-network-camera-control="zoom-out" title="Zoom out" onClick={()=>zoomBy(.84)}>−</button>
        <button data-network-camera-control="fit" onClick={fitView}>Fit</button>
        <button data-network-camera-control="iso" onClick={isoView}>Iso</button>
        <button data-network-camera-control="top" onClick={topView}>Top</button>
      </div>
      <span className="network-camera-status">Yaw {Math.round(yaw)}° · Pitch {Math.round(pitch)}° · Zoom {Math.round(zoom*100)}%</span>
    </div>
  </div>;
}
