'use client';
import {useMemo,useState} from 'react';
import {CrossSection,sectionStart} from '../junction/section-view';
import {armMouth} from '../junction/geometry';
import type {Selection} from '../junction/selection';
import {resolveLinkSectionGeometry} from '@/lib/network-link-geometry';
import {sampleStationSeries} from '@/lib/station-profile';
import type {JunctionInstance,NetworkProject,RoadLink} from '@/lib/network-project';

type Props={
  project:NetworkProject;
  junction?:JunctionInstance;
  armId:number|null;
  link?:RoadLink;
  onJunctionEdit?:(selection:Selection,value:number,currentWidth:number)=>void;
};

const bandLabel:Record<string,string>={bike:'จักรยาน',motorcycle:'มอเตอร์ไซค์',shoulder:'ไหล่ทาง',buffer:'คั่น'};
function lanePieces(count:number,width:number,prefix:string){
  const out:{key:string;label:string;width:number;kind:string}[]=[];
  const full=Math.floor(count+1e-6),fraction=Math.max(0,count-full);
  for(let i=0;i<full;i++)out.push({key:prefix+'-'+i,label:`${prefix==='forward'?'ไป':'กลับ'} ${i+1}`,width,kind:'lane'});
  if(fraction>.02)out.push({key:prefix+'-transition',label:'เลน transition',width:width*fraction,kind:'lane transition'});
  return out;
}

function LinkSection({project,link}:{project:NetworkProject;link:RoadLink}){
  const resolved=useMemo(()=>resolveLinkSectionGeometry(project,link),[project,link]),[station,setStation]=useState(()=>(resolveLinkSectionGeometry(project,link)?.total??0)/2);
  if(!resolved)return <section className="network-section-dock"><div className="network-section-empty">Road Link นี้ยังไม่มี resolved section geometry</div></section>;
  const s=Math.max(0,Math.min(resolved.total,station)),median=sampleStationSeries(resolved.stations,resolved.medianHalf,s)*2,
    fw=sampleStationSeries(resolved.stations,resolved.forwardLaneWidth,s),bw=sampleStationSeries(resolved.stations,resolved.backwardLaneWidth,s),
    left=sampleStationSeries(resolved.stations,resolved.left,s),right=sampleStationSeries(resolved.stations,resolved.right,s),
    forwardCount=fw>0?Math.max(0,(left-median/2)/fw):0,backwardCount=bw>0?Math.max(0,(right-median/2)/bw):0,
    forwardBands=resolved.forwardBands.map((band,i)=>({key:'fb-'+i,label:bandLabel[band.type]??band.type,width:Math.abs(sampleStationSeries(resolved.stations,band.outer,s)-sampleStationSeries(resolved.stations,band.inner,s)),kind:'band '+band.type})),
    backwardBands=resolved.backwardBands.map((band,i)=>({key:'bb-'+i,label:bandLabel[band.type]??band.type,width:Math.abs(sampleStationSeries(resolved.stations,band.outer,s)-sampleStationSeries(resolved.stations,band.inner,s)),kind:'band '+band.type})),
    forwardWalk=resolved.forwardWalk?Math.abs(sampleStationSeries(resolved.stations,resolved.forwardWalk.outer,s)-sampleStationSeries(resolved.stations,resolved.forwardWalk.inner,s)):0,
    backwardWalk=resolved.backwardWalk?Math.abs(sampleStationSeries(resolved.stations,resolved.backwardWalk.outer,s)-sampleStationSeries(resolved.stations,resolved.backwardWalk.inner,s)):0,
    pieces=[
      ...(backwardWalk>.01?[{key:'bw',label:'ทางเท้า',width:backwardWalk,kind:'walk'}]:[]),
      ...[...backwardBands].reverse(),
      ...[...lanePieces(backwardCount,bw,'backward')].reverse(),
      ...(median>.01?[{key:'median',label:'เกาะกลาง',width:median,kind:'median'}]:[]),
      ...lanePieces(forwardCount,fw,'forward'),
      ...forwardBands,
      ...(forwardWalk>.01?[{key:'fw',label:'ทางเท้า',width:forwardWalk,kind:'walk'}]:[])
    ].filter(p=>p.width>.01);
  return <section className="network-section-dock" aria-label="Road Link section profile">
    <header className="network-section-header">
      <div><b>หน้าตัด Road Link · {link.name}</b><span>ซ้าย = TO → FROM · ขวา = FROM → TO</span></div>
      <label>Station
        <input type="range" min="0" max={Math.max(1,resolved.total)} step=".5" value={s} onChange={e=>setStation(Number(e.target.value))}/>
        <span>{s.toFixed(1)} / {resolved.total.toFixed(1)} m</span>
      </label>
    </header>
    <div className="network-section-components">
      {pieces.map(p=><div key={p.key} className={'network-section-piece '+p.kind.replace(/ /g,'-')} style={{flex:Math.max(.18,p.width)}} title={p.label+' '+p.width.toFixed(2)+' m'}><span>{p.label}</span><b>{p.width.toFixed(2)}</b></div>)}
    </div>
    <footer><span>{resolved.linear?'Resolved geometric transition':'Review / constant display mode'}{link.components.length?` · ${link.components.length} station component${link.components.length===1?'':'s'}`:''}</span><span>{backwardCount.toFixed(2)} lanes ← · → {forwardCount.toFixed(2)} lanes</span></footer>
  </section>;
}

function initialJunctionX(junction:JunctionInstance,armId:number){
  const mouth=armMouth(junction.design,armId),start=sectionStart(junction.design,armId);
  return mouth+Math.min(Math.max(start,10),Math.max(start,junction.design.arms[armId].length-mouth-1));
}
function JunctionSection({junction,armId,onJunctionEdit}:{junction:JunctionInstance;armId:number;onJunctionEdit?:Props['onJunctionEdit']}){
  const [x,setX]=useState(()=>initialJunctionX(junction,armId)),selection:Selection={kind:'approach',arm:armId},mouth=armMouth(junction.design,armId),
    start=sectionStart(junction.design,armId),maxX=mouth+Math.max(start,junction.design.arms[armId].length-mouth-1),
    effectiveX=Math.max(mouth+start,Math.min(maxX,x));
  return <div className="network-section-junction"><CrossSection d={junction.design} id={armId} x={effectiveX} onX={setX} selection={selection} onSelect={()=>{}} onEdit={onJunctionEdit}/></div>;
}

export default function NetworkSectionDock({project,junction,armId,link,onJunctionEdit}:Props){
  if(link)return <LinkSection key={link.id} project={project} link={link}/>;
  if(junction&&armId!==null)return <JunctionSection key={junction.id+':'+armId} junction={junction} armId={armId} onJunctionEdit={onJunctionEdit}/>;
  return null;
}
