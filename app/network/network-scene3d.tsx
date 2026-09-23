'use client';
import {useEffect,useRef,useState} from 'react';
import {anchorGround,groundAt,orbitGround} from '../junction/camera3d';
import {clampZoom,PointerGesture} from '../junction/gestures';
import {renderMapTexture,type MapReference} from '../junction/map-background';
import {projectBounds,type NetworkProject} from '@/lib/network-project';
import {
  resolveJunctionSceneFaces,resolveJunctionSceneSurfaces,resolveRoadLinkSceneSurfaces,type NetworkSceneSurfaceKind
} from '@/lib/network-scene-geometry';

type Size={w:number;h:number};
type CameraMode='pan'|'orbit';
type DragState={action:'pan'|'rotate';point:{x:number;y:number};screen:{x:number;y:number}}|null;

export default function NetworkScene3D({
  project,mapReference,active
}:{project:NetworkProject;mapReference:MapReference;active:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<DragState>(null),gestures=useRef(new PointerGesture()),modeRef=useRef<CameraMode>('pan'),
    [size,setSize]=useState<Size>({w:900,h:650}),[yaw,setYaw]=useState(-35),[pitch,setPitch]=useState(52),[zoom,setZoom]=useState(.92),
    [pan,setPan]=useState({x:0,y:0}),[mode,setMode]=useState<CameraMode>('pan'),
    [mapTexture,setMapTexture]=useState<{key:string;image:HTMLCanvasElement|null}|null>(null),[detailImage,setDetailImage]=useState<HTMLImageElement|null>(null);
  const camera=useRef({yaw,pitch,zoom,pan});
  useEffect(()=>{camera.current={yaw,pitch,zoom,pan};},[yaw,pitch,zoom,pan]);

  const junctionSurfaceCount=resolveJunctionSceneSurfaces(project).length,
    linkSurfaceCount=resolveRoadLinkSceneSurfaces(project).length,
    furnitureFaceCount=resolveJunctionSceneFaces(project).length,
    bounds=projectBounds(project,45),center={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},extent=Math.max(80,Math.max(bounds.w,bounds.h)/2),
    mapKey=[mapReference.enabled,mapReference.basemap,mapReference.lat,mapReference.lng,mapReference.zoom,mapReference.offsetX,mapReference.offsetY,extent.toFixed(2),center.x.toFixed(2),center.y.toFixed(2)].join(':');

  useEffect(()=>{
    if(!active||!canvas.current)return;
    const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r)setSize({w:Math.max(1,r.width),h:Math.max(1,r.height)});});
    observer.observe(canvas.current);return()=>observer.disconnect();
  },[active]);

  useEffect(()=>{
    if(!active||!mapReference.enabled)return;
    let stale=false;
    renderMapTexture(mapReference,extent,1200,{x:center.x,y:center.y}).then(image=>{if(!stale)setMapTexture({key:mapKey,image});});
    return()=>{stale=true;};
  },[active,mapReference,extent,center.x,center.y,mapKey]);

  useEffect(()=>{
    if(!active)return;
    const source=document.querySelector<SVGSVGElement>('svg[data-network-plan="true"]');
    if(!source)return;
    let stale=false,url='';
    const copy=source.cloneNode(true) as SVGSVGElement,details=[...copy.querySelectorAll('[data-scene-detail="true"]')];
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
  const isoView=()=>applyCamera({yaw:-35,pitch:52,zoom:.92,pan:{x:0,y:0}});
  const topView=()=>applyCamera({yaw:0,pitch:78,zoom:.92,pan:{x:0,y:0}});
  const zoomBy=(factor:number)=>applyCamera({...camera.current,zoom:clampZoom(camera.current.zoom*factor,.25,5)});

  useEffect(()=>{
    if(!active)return;
    const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx)return;
    const junctionSurfaces=resolveJunctionSceneSurfaces(project),linkSurfaces=resolveRoadLinkSceneSurfaces(project),
      sceneSurfaces=[...junctionSurfaces,...linkSurfaces],furnitureFaces=resolveJunctionSceneFaces(project),
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

    const surfaceFill:Record<NetworkSceneSurfaceKind,string>={road:'#3f4c56',median:'#83957a',bike:'#467d70',motorcycle:'#526c91',shoulder:'#66727c',buffer:'#899396',sidewalk:'#b9c5cc'},
      depth=(item:{points:{x:number;y:number;z?:number}[]})=>item.points.reduce((sum,q)=>sum+(q.x-center.x)*Math.sin(a)+(q.y-center.y)*Math.cos(a)-(q.z??0)*.2,0)/(item.points.length||1),
      drawSurface=(surface:(typeof sceneSurfaces)[number])=>{
        const top=surface.points.map(q=>projectPoint(q.x,q.y,surface.z));
        if(surface.z>.08){
          const bottom=surface.points.map(q=>projectPoint(q.x,q.y,0));
          ctx.fillStyle='rgba(80,92,96,.28)';
          for(let i=0;i<top.length;i++){const j=(i+1)%top.length;ctx.beginPath();ctx.moveTo(bottom[i].x,bottom[i].y);ctx.lineTo(bottom[j].x,bottom[j].y);ctx.lineTo(top[j].x,top[j].y);ctx.lineTo(top[i].x,top[i].y);ctx.closePath();ctx.fill();}
        }
        ctx.beginPath();top.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=surfaceFill[surface.kind];ctx.fill();
        ctx.strokeStyle='rgba(245,248,249,.32)';ctx.lineWidth=.45;ctx.stroke();
      };
    sceneSurfaces.filter(v=>v.z<.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    if(detailImage)drawPlane(detailImage,.082,1);
    sceneSurfaces.filter(v=>v.z>=.1).sort((u,v)=>depth(u)-depth(v)).forEach(drawSurface);
    for(const face of [...furnitureFaces].sort((u,v)=>depth(u)-depth(v))){
      const ps=face.points.map(q=>projectPoint(q.x,q.y,q.z));ctx.beginPath();ps.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=face.color;ctx.fill();
    }
  },[active,size,yaw,pitch,zoom,pan,extent,center.x,center.y,mapImage,mapReference.opacity,detailImage,project]);

  function begin(e:React.PointerEvent<HTMLCanvasElement>){
    const action=e.pointerType==='mouse'
      ?(e.button===1||e.shiftKey?'rotate':e.button===0?(modeRef.current==='orbit'?'rotate':'pan'):'none')
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
    const nextZoom=clampZoom(current.zoom*g.factor,.25,5),ratio=nextZoom/current.zoom,
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
      nextZoom=clampZoom(current.zoom*Math.exp(-Math.max(-500,Math.min(500,delta))*.002),.25,5);
    applyCamera(anchorGround({...current,zoom:nextZoom},v,point,screen));
  }

  if(!active)return null;
  return <div className="network-scene3d">
    <canvas ref={canvas} tabIndex={0} aria-label="Network 3D overview" data-network-scene-mode="resolved"
      data-network-scene-junction-surfaces={junctionSurfaceCount} data-network-scene-link-surfaces={linkSurfaceCount}
      data-network-scene-detail-texture={detailImage?'true':'false'} data-network-scene-furniture-faces={furnitureFaceCount}
      data-network-camera-mode={mode} data-network-camera-yaw={yaw.toFixed(3)} data-network-camera-pitch={pitch.toFixed(3)}
      data-network-camera-zoom={zoom.toFixed(4)} data-network-camera-pan-x={pan.x.toFixed(5)} data-network-camera-pan-y={pan.y.toFixed(5)}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onAuxClick={e=>e.preventDefault()} onWheel={wheel} onDoubleClick={fitView}/>
    <div className="network-scene-note"><b>Resolved Network 3D</b><span>Geometry = Junction + Slip + RoadLink semantic surfaces</span><span>Markings = detail-only semantic overlay · Signals / trees / lights = shared 3D furniture resolver</span><span>ซ้ายลาก = {mode==='pan'?'Pan':'Orbit'} · กลางลากหรือ Shift+ลาก = Orbit · Wheel = Zoom</span>{mapReference.enabled&&<span>{mapImage?'Map reference บนพื้น 3D':'กำลังเตรียม map texture…'}</span>}</div>
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
