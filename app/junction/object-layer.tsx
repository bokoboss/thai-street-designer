import {useMemo,useState,useRef,useEffect} from 'react';
import {type Design,type Arm,pocketsFor,pocketLaneWidth,medianTreeDefaults,displayFor} from './model';
import {designShapes,candidates,selectionKey,type Selection,type HitShape,EditTransaction} from './selection';
import {rotate,armMouth,armTreatmentOrigins,innerEdge,carBounds,edges} from './geometry';
import {designError} from './design-validation';
import {slipGeometryForArm,slipArcState,slipOffsetAtPoint} from './slip-geometry';
import {slipForArm,updateSlip} from './slip-model';
import {originFor,pocketOriginFor} from './allocation';
import {arrowOffsetAtX,laneArrowKey,manualPlacementsForLane,resolvedArrow} from './arrow-layout';
export function ObjectLayer({d,s,onSelect,onMenu,onPreview,onFinish,onArmHandle}:{d:Design;s:Selection;onSelect:(s:Selection)=>void;onMenu:(items:HitShape[],x:number,y:number)=>void;onPreview:(d:Design)=>void;onFinish:(before:Design,after:Design,cancel:boolean)=>void;onArmHandle:(e:React.PointerEvent<SVGCircleElement>,id:number)=>void}){const edgeSet=useMemo(()=>edges(d),[d]),shapes=useMemo(()=>designShapes(d,edgeSet),[d,edgeSet]),[hover,setHover]=useState(''),drag=useRef<{tx:EditTransaction<Design>;update:(x:number,p:{x:number;y:number},before:Design)=>Design}|null>(null);const point=(e:React.PointerEvent|React.MouseEvent)=>{const svg=(e.currentTarget as SVGElement).ownerSVGElement!,m=svg.getScreenCTM()!;return rotate(new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),-d.rotation/90);};
function finish(cancel=false){if(!drag.current)return;const t=drag.current.tx;drag.current=null;onFinish(t.before,t.latest,cancel);}
useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();finish(true);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
const a=d.arms[s.arm],mouth=armMouth(d,s.arm),origins=armTreatmentOrigins(d,s.arm,edgeSet),dir=s.direction??'incoming',origin=originFor(origins,dir),side=dir==='incoming'?1:-1,pk=pocketsFor(a,dir),selectedSide=s.side??(s.role==='aux-left'?'left':'right'),p=pk[selectedSide],pocketOrigin=pocketOriginFor(origins,dir,selectedSide),slip=slipForArm(d,s.arm),slipGeometry=slipGeometryForArm(d,s.arm,edgeSet);const grips:{x:number;y:number;label:string;update:(x:number,p:{x:number;y:number},before:Design)=>Design}[]=[];
const armPatch=(patch:Partial<Arm>,before:Design)=>({...before,arms:before.arms.map((v,j)=>j===s.arm?{...v,...patch}:v)});
const pocketUpdate=(patch:object,before:Design)=>armPatch({[dir==='incoming'?'incomingPockets':'outgoingPockets']:{...pk,[selectedSide]:{...p,...patch}}},before);
if(s.kind==='pocket'&&p.lanes){const w=pocketLaneWidth(a,dir,selectedSide),y=selectedSide==='right'?innerEdge(a,side,pocketOrigin,origins)+side*w/2:carBounds(a,pocketOrigin,origins)[side===1?1:0]-side*w/2;grips.push({x:pocketOrigin+p.length,y,label:dir==='incoming'?'Storage':'Receiving',update:(x,_p,before)=>pocketUpdate({length:Math.max(5,Math.min(140,Math.round(x-pocketOrigin)))},before)},{x:pocketOrigin+p.length+p.taper,y,label:dir==='incoming'?'Taper':'Merge taper',update:(x,_p,before)=>pocketUpdate({taper:Math.max(5,Math.min(80,Math.round(x-pocketOrigin-p.length)))},before)});}
if(s.kind==='arrow'&&s.id){
 const role=s.role??'main',laneIndex=s.laneIndex??0,current=resolvedArrow(d,s.arm,dir,role,laneIndex,s.id,edgeSet);
 if(current){
  const key=laneArrowKey(dir,role,laneIndex),manual=manualPlacementsForLane(d,s.arm,dir,role,laneIndex,edgeSet);
  grips.push({x:current.x,y:current.y,label:'Arrow',update:(x,_p,before)=>armPatch({arrowOverrides:{...(a.arrowOverrides??{}),[key]:manual.map(v=>v.id===s.id?{...v,offset:+arrowOffsetAtX(d,s.arm,dir,role,laneIndex,x,edgeSet).toFixed(3)}:v)}},before)});
 }
}
if(s.kind==='crossing')grips.push({x:mouth+a.crossOffset,y:carBounds(a,mouth,origins)[1]+3,label:'Crossing',update:(x,_p,before)=>armPatch({crossOffset:Math.max(0,Math.min(35,Math.round((x-mouth)*2)/2))},before)});
if(slip&&slipGeometry&&(s.kind==='slipCrossing'||s.kind==='slipArrow')){
 const state=slipArcState(slipGeometry,slip),isCross=s.kind==='slipCrossing',p0=isCross?state.crossPoint:state.arrowPoint;
 grips.push({
  x:p0.x,y:p0.y,label:isCross?'Slip crossing':'Slip arrow',
  update:(_x,p,before)=>{
   if(isCross){
    const offset=+Math.max(2,Math.min(slipOffsetAtPoint(slipGeometry,p,'crossing'),state.centerLength-2)).toFixed(2);
    return updateSlip(before,slip.id,{crossing:{...slip.crossing,offset}});
   }
   const arrowOffset=+Math.max(2,Math.min(slipOffsetAtPoint(slipGeometry,p,'arrow'),state.centerLength-2)).toFixed(2);
   return updateSlip(before,slip.id,{arrowOffset});
  }
 });
}
if(s.kind==='landscape')grips.push({x:mouth+(a.medianTrees?.start??18),y:0,label:'First tree',update:(x,_p,before)=>armPatch({medianTrees:{...medianTreeDefaults(),...a.medianTrees,start:Math.max(0,Math.min(200,Math.round(x-mouth)))}}},before)});
if(s.kind==='opening'){const o=a.medianOpenings?.find(o=>o.id===s.id);if(o)for(const end of [false,true])grips.push({x:mouth+o.start+(end?o.length:0),y:0,label:end?'Opening end':'Opening start',update:(x,_p,before)=>armPatch({medianOpenings:a.medianOpenings?.map(v=>v.id===o.id?{...v,...(end?{length:Math.max(2,Math.min(40,Math.round(x-mouth-o.start)))}:{start:Math.max(0,Math.min(a.length-mouth-o.length-1,Math.round(x-mouth)))})}:v)},before)});}
return <g data-selection="objects" transform={`rotate(${d.rotation})`}><g onPointerMove={e=>{if(drag.current)return;setHover(candidates(shapes,point(e))[0]?.key??'');}} onPointerLeave={()=>setHover('')} onPointerDown={e=>{if(e.button!==0)return;const list=candidates(shapes,point(e));if(!list.length)return;if(e.altKey){const current=list.findIndex(v=>v.key===selectionKey(s));onSelect(list[(current+1)%list.length].selection);}else onSelect(list[0].selection);}} onContextMenu={e=>{e.preventDefault();const list=candidates(shapes,point(e));if(list.length){onSelect(list[0].selection);onMenu(list,e.clientX,e.clientY);}}}>{shapes.map((shape,k)=><polygon key={k} points={shape.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="transparent" stroke="none" style={{cursor:'pointer'}}><title>{`${shape.label} · Alt+คลิกเพื่อเลือกซ้อน`}</title></polygon>)}</g>{shapes.filter(h=>h.key===hover||h.key===selectionKey(s)).map((h,k)=><polygon key={k} points={h.points.map(p=>`${p.x},${p.y}`).join(' ')} fill={h.key===selectionKey(s)?'#129b9120':'#129b9110'} stroke="#0c9389" strokeWidth={h.key===selectionKey(s)?.5:.25} pointerEvents="none"/>)}{displayFor(d).handles&&<g transform={`rotate(${a.angle})`}>{grips.map((g,i)=><g key={i}><circle data-grip="true" aria-label={`Drag ${g.label}`} cx={g.x} cy={g.y} r="2" fill="white" stroke="#078b81" strokeWidth=".5" style={{cursor:'ew-resize'}} onPointerDown={e=>{e.stopPropagation();drag.current={tx:new EditTransaction(d),update:g.update};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;e.stopPropagation();const local=rotate(point(e),-a.angle/90),x=local.x,next=drag.current.update(x,local,drag.current.tx.before);if(!designError(next)){drag.current.tx.update(next);onPreview(next);}}} onPointerUp={e=>{e.stopPropagation();finish();}} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)}><title>{`${g.label} · ลาก / Esc ยกเลิก`}</title></circle><text x={g.x} y={g.y-2.5} transform={`rotate(${-(d.rotation+a.angle)} ${g.x} ${g.y-2.5})`} fontSize="2.2" fill="#075e59" textAnchor="middle" pointerEvents="none">{g.label}</text></g>)}{s.kind==='approach'&&<circle data-grip="arm" cx={a.length} cy="0" r="2.2" fill="white" stroke="#078b81" strokeWidth=".6" onPointerDown={e=>onArmHandle(e,s.arm)} style={{cursor:'grab'}}/>}</g>}</g>;}
export function Dimensions({d,s}:{d:Design;s:Selection}){const a=d.arms[s.arm],m=armMouth(d,s.arm),origins=armTreatmentOrigins(d,s.arm),dir=s.direction??'incoming',selectedSide=s.side??(s.role==='aux-left'?'left':'right'),o=s.kind==='pocket'?pocketOriginFor(origins,dir,selectedSide):originFor(origins,dir),p=pocketsFor(a,dir)[selectedSide],y=carBounds(a,m,origins)[1]+10;const segments:{start:number;end:number;label:string}[]=[];
if(s.kind==='pocket'&&p.lanes)segments.push({start:o,end:o+p.length,label:`${dir==='incoming'?'Storage':'Receiving'} ${p.length} m`},{start:o+p.length,end:o+p.length+p.taper,label:`${dir==='incoming'?'Taper':'Merge taper'} ${p.taper} m`});
if(s.kind==='crossing')segments.push({start:m,end:m+a.crossOffset,label:`Setback ${a.crossOffset} m`});
if(s.kind==='opening'){const v=a.medianOpenings?.find(v=>v.id===s.id);if(v)segments.push({start:m+v.start,end:m+v.start+v.length,label:`${(v.type??'opening')==='uturn'?'U-turn opening':'Opening'} ${v.length} m`});}
if(s.kind==='landscape'){const t=a.medianTrees??medianTreeDefaults();segments.push({start:m,end:m+t.start,label:`Requested start ${t.start} m`},{start:m+t.start,end:m+t.start+t.spacing,label:`Spacing ${t.spacing} m`});}
const theta=d.rotation+a.angle;
return <g transform={`rotate(${theta})`} fill="#315c69" stroke="#315c69" strokeWidth=".2" pointerEvents="none">{segments.map((v,i)=>{const x=(v.start+v.end)/2,ty=y-2;return <g key={i}><path d={`M${v.start} ${y-2}v4m0 -2h${v.end-v.start}m0 -2v4`}/><text x={x} y={ty} transform={`rotate(${-theta} ${x} ${ty})`} fontSize="2.3" textAnchor="middle" stroke="none">{v.label}</text></g>;})}<path d={`M${a.length-8} ${-a.median/2}v${a.median}`}/><text x={a.length-10} y="-3" transform={`rotate(${-theta} ${a.length-10} -3)`} fontSize="2.3" textAnchor="end" stroke="none">{`Median ${a.median} m`}</text></g>;}
