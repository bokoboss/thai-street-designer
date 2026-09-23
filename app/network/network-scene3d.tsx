'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {renderMapTexture,type MapReference} from '../junction/map-background';
import {projectBounds,type NetworkProject} from '@/lib/network-project';
import {
  resolveJunctionSceneSurfaces,resolveRoadLinkSceneSurfaces,type NetworkSceneSurfaceKind
} from '@/lib/network-scene-geometry';

type Size={w:number;h:number};
type DragState={x:number;y:number;yaw:number;pitch:number}|null;

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

export default function NetworkScene3D({
  project,mapReference,active
}:{project:NetworkProject;mapReference:MapReference;active:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<DragState>(null),
    [size,setSize]=useState<Size>({w:900,h:650}),[yaw,setYaw]=useState(-32),[pitch,setPitch]=useState(56),[zoom,setZoom]=useState(1),
    [mapTexture,setMapTexture]=useState<{key:string;image:HTMLCanvasElement|null}|null>(null);
  const junctionSurfaces=useMemo(()=>resolveJunctionSceneSurfaces(project),[project]),
    linkSurfaces=useMemo(()=>resolveRoadLinkSceneSurfaces(project),[project]),
    sceneSurfaces=useMemo(()=>[...junctionSurfaces,...linkSurfaces],[junctionSurfaces,linkSurfaces]);
  const bounds=projectBounds(project,45),center={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},extent=Math.max(80,Math.max(bounds.w,bounds.h)/2),
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

  const mapImage=mapReference.enabled&&mapTexture?.key===mapKey?mapTexture.image:null;

  useEffect(()=>{
    if(!active)return;
    const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx)return;
    const ratio=Math.min(window.devicePixelRatio||1,2);c.width=size.w*ratio;c.height=size.h*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);
    const w=size.w,h=size.h,a=yaw*Math.PI/180,p=pitch*Math.PI/180,scale=Math.min(w,h)/(extent*2)*zoom;
    const projectPoint=(x:number,y:number,z=0)=>{
      const rx=(x-center.x)*Math.cos(a)-(y-center.y)*Math.sin(a),ry=(x-center.x)*Math.sin(a)+(y-center.y)*Math.cos(a);
      return{x:w/2+rx*scale,y:h/2+(ry*Math.cos(p)-z*Math.sin(p))*scale};
    };
    const drawMapPlane=(image:HTMLCanvasElement,z:number,alpha:number)=>{
      const o=projectPoint(center.x-extent,center.y-extent,z),x=projectPoint(center.x+extent,center.y-extent,z),y=projectPoint(center.x-extent,center.y+extent,z);
      ctx.save();ctx.globalAlpha=alpha;ctx.transform((x.x-o.x)/image.width,(x.y-o.y)/image.width,(y.x-o.x)/image.height,(y.y-o.y)/image.height,o.x,o.y);ctx.drawImage(image,0,0);ctx.restore();
    };
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#e9eff2';ctx.fillRect(0,0,w,h);
    const ground=[projectPoint(center.x-extent,center.y-extent),projectPoint(center.x+extent,center.y-extent),projectPoint(center.x+extent,center.y+extent),projectPoint(center.x-extent,center.y+extent)];
    ctx.beginPath();ground.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle='#dfe7e9';ctx.fill();
    if(mapImage)drawMapPlane(mapImage,0,Math.max(.1,Math.min(1,mapReference.opacity)));

    const surfaceFill:Record<NetworkSceneSurfaceKind,string>={road:'#3f4c56',median:'#83957a',bike:'#467d70',motorcycle:'#526c91',shoulder:'#66727c',buffer:'#899396',sidewalk:'#b9c5cc'};
    const sorted=[...sceneSurfaces].sort((u,v)=>{
      const depth=(surface:{points:{x:number;y:number}[];z:number})=>surface.points.reduce((sum,q)=>sum+(q.x-center.x)*Math.sin(a)+(q.y-center.y)*Math.cos(a),0)/(surface.points.length||1)-surface.z*.2;
      return depth(u)-depth(v);
    });
    const drawPoly=(surface:typeof sorted[number])=>{
      const top=surface.points.map(q=>projectPoint(q.x,q.y,surface.z));
      if(surface.z>.08){
        const bottom=surface.points.map(q=>projectPoint(q.x,q.y,0));
        ctx.fillStyle='rgba(80,92,96,.28)';
        for(let i=0;i<top.length;i++){
          const j=(i+1)%top.length;ctx.beginPath();ctx.moveTo(bottom[i].x,bottom[i].y);ctx.lineTo(bottom[j].x,bottom[j].y);ctx.lineTo(top[j].x,top[j].y);ctx.lineTo(top[i].x,top[i].y);ctx.closePath();ctx.fill();
        }
      }
      ctx.beginPath();top.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=surfaceFill[surface.kind];ctx.fill();
      ctx.strokeStyle='rgba(245,248,249,.32)';ctx.lineWidth=.45;ctx.stroke();
    };
    sorted.forEach(drawPoly);
  },[active,size,yaw,pitch,zoom,extent,center.x,center.y,mapImage,mapReference.opacity,sceneSurfaces]);

  if(!active)return null;
  return <div className="network-scene3d">
    <canvas ref={canvas} aria-label="Network 3D overview" data-network-scene-mode="resolved"
      data-network-scene-junction-surfaces={junctionSurfaces.length} data-network-scene-link-surfaces={linkSurfaces.length}
      onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,yaw,pitch};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(!d)return;setYaw(d.yaw+(e.clientX-d.x)*.28);setPitch(clamp(d.pitch-(e.clientY-d.y)*.2,15,82));}}
      onPointerUp={e=>{drag.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}}} onPointerCancel={()=>{drag.current=null;}}
      onWheel={e=>{e.preventDefault();setZoom(v=>clamp(v*Math.exp(-e.deltaY*.0015),.35,4));}}/>
    <div className="network-scene-note"><b>Resolved Network 3D</b><span>Junction + Slip + RoadLink ใช้ semantic geometry จริงจาก engine เดียวกับ 2D</span><span>Markings / furniture เป็น presentation layer สำหรับ phase ถัดไป · ลากเพื่อหมุน · ล้อเมาส์ซูม</span>{mapReference.enabled&&<span>{mapImage?'Map reference บนพื้น 3D':'กำลังเตรียม map texture…'}</span>}</div>
    <div className="network-scene-tools"><button onClick={()=>{setYaw(-32);setPitch(56);setZoom(1);}}>มุมเริ่มต้น</button><span>Yaw {Math.round(yaw)}° · Pitch {Math.round(pitch)}° · Zoom {Math.round(zoom*100)}%</span></div>
  </div>;
}
