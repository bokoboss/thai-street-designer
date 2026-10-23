'use client';
// Cross-section of the selected road, drawn looking along the road's drawn direction. In left-hand traffic
// the lanes travelling in that direction are on the left; arrows show the direction of travel.
// "ตามระยะทาง" shows the section at a chosen station of one road segment (between junctions), with
// approach widening, auxiliary lanes and section transitions — the same resolver as the earlier Network page.
import {useState} from 'react';
import type {CompileResult,Road} from '@/core/road-first/derive';
import NetworkSectionDock from '../network/network-section-dock';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import type {CommandOutcome} from './use-road-editor';
import {ProfileStrip} from './profile-strip';

const BAND_LABEL:Record<string,string>={bike:'จักรยาน',motorcycle:'จยย.',shoulder:'ไหล่ทาง',buffer:'แถบคั่น'};

export function SectionStrip({road,compiled,project,run,finishGesture}:{road:Road;compiled:CompileResult;project:RoadFirstProject;run:(cmd:RoadFirstCommand,opts?:{gesture?:boolean})=>CommandOutcome;finishGesture:()=>void}){
  const [mode,setMode]=useState<'road'|'station'|'profile'>('road'),[segment,setSegment]=useState(0);
  const links=compiled.project.links.filter(l=>compiled.sources.links[l.id]===road.id),link=links[Math.min(segment,links.length-1)];
  const s=road.section,parts:{kind:string;label:string;width:number}[]=[];
  // Bands (bike, motorcycle, shoulder, buffer) sit between the lanes and the sidewalk on both sides.
  const bands=s.bands??[],band=(b:{type:string;width:number})=>({kind:'band band-'+b.type,label:BAND_LABEL[b.type]??b.type,width:b.width});
  if(s.walk>0)parts.push({kind:'walk',label:'ทางเท้า',width:s.walk});
  for(const b of [...bands].reverse())parts.push(band(b));
  for(let i=s.forwardLanes;i>=1;i--)parts.push({kind:'lane forward',label:`↑ ช่อง ${i}`,width:s.laneWidth});
  if(s.median>0)parts.push({kind:'median',label:'เกาะกลาง',width:s.median});
  for(let i=1;i<=s.backwardLanes;i++)parts.push({kind:'lane backward',label:`↓ ช่อง ${i}`,width:s.laneWidth});
  for(const b of bands)parts.push(band(b));
  if(s.walk>0)parts.push({kind:'walk',label:'ทางเท้า',width:s.walk});
  const total=parts.reduce((a,p)=>a+p.width,0);
  const tabs=<div className="design-section-modes" role="group" aria-label="แสดงหน้าตัด">
    <button className={mode==='road'?'active':''} aria-pressed={mode==='road'} data-design-section-mode="road" onClick={()=>setMode('road')}>ทั้งเส้น</button>
    <button className={mode==='station'?'active':''} aria-pressed={mode==='station'} data-design-section-mode="station" disabled={!links.length} onClick={()=>setMode('station')}>ตามระยะทาง</button>
    <button className={mode==='profile'?'active':''} aria-pressed={mode==='profile'} data-design-section-mode="profile" onClick={()=>setMode('profile')}>แนวดิ่ง</button>
    {mode==='station'&&links.length>1&&links.map((l,i)=><button key={l.id} className={'segment '+(i===segment?'active':'')} data-design-section-segment={i} onClick={()=>setSegment(i)}>ช่วง {i+1}</button>)}
  </div>;
  if(mode==='profile')return <section className="design-section design-section-profile" data-design-section={road.id}>
    <header><b>แนวดิ่ง · {road.name}</b><span>ระดับตามระยะทางจากต้นถนน · ลากจุดเพื่อปรับ</span>{tabs}</header>
    <ProfileStrip road={road} project={project} crossings={compiled.crossings} run={run} finishGesture={finishGesture}/>
  </section>;
  if(mode==='station'&&link)return <section className="design-section design-section-station" data-design-section={road.id} data-design-section-station={link.id}>
    <header><b>หน้าตัด · {road.name}{links.length>1?` · ช่วง ${segment+1}/${links.length}`:''}</b>{tabs}</header>
    <NetworkSectionDock key={link.id} project={compiled.project} armId={null} link={link}/>
  </section>;
  return <section className="design-section" data-design-section={road.id}>
    <header><b>หน้าตัด · {road.name}</b><span>มองไปตามทิศที่วาดถนน · กว้างรวม {total.toFixed(2)} ม.</span>{tabs}</header>
    <div className="design-section-bands">{parts.map((p,i)=><div key={i} className={'band '+p.kind} style={{flexGrow:p.width}} data-design-band={p.kind.split(' ')[0]}><span>{p.label}</span><b>{p.width.toFixed(2)}</b></div>)}</div>
  </section>;
}
