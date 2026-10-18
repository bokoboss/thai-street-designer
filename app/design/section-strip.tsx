'use client';
// Cross-section of the selected road, drawn looking along the road's drawn direction. In left-hand traffic
// the lanes travelling in that direction are on the left; arrows show the direction of travel.
import type {Road} from '@/core/road-first/derive';

export function SectionStrip({road}:{road:Road}){
  const s=road.section,parts:{kind:string;label:string;width:number}[]=[];
  if(s.walk>0)parts.push({kind:'walk',label:'ทางเท้า',width:s.walk});
  for(let i=s.forwardLanes;i>=1;i--)parts.push({kind:'lane forward',label:`↑ ช่อง ${i}`,width:s.laneWidth});
  if(s.median>0)parts.push({kind:'median',label:'เกาะกลาง',width:s.median});
  for(let i=1;i<=s.backwardLanes;i++)parts.push({kind:'lane backward',label:`↓ ช่อง ${i}`,width:s.laneWidth});
  if(s.walk>0)parts.push({kind:'walk',label:'ทางเท้า',width:s.walk});
  const total=parts.reduce((a,p)=>a+p.width,0);
  return <section className="design-section" data-design-section={road.id}>
    <header><b>หน้าตัด · {road.name}</b><span>มองไปตามทิศที่วาดถนน · กว้างรวม {total.toFixed(2)} ม.</span></header>
    <div className="design-section-bands">{parts.map((p,i)=><div key={i} className={'band '+p.kind} style={{flexGrow:p.width}} data-design-band={p.kind.split(' ')[0]}><span>{p.label}</span><b>{p.width.toFixed(2)}</b></div>)}</div>
  </section>;
}
