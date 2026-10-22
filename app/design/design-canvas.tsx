'use client';
// Plan view of the road-first workspace. The engineering drawing is the compiled network (same renderer as
// before); roads, their points and crossing candidates are drawn on top as the editable layer.
import {useCallback,useDeferredValue,useEffect,useMemo,useRef,useState} from 'react';
import {NetworkDrawing} from '../network/network-drawing';
import {portHeading,projectBounds,type WorldPoint} from '@/core/network/network-project';
import {detectCandidates,stations,type Road} from '@/core/road-first/derive';
import {endJoins} from '@/core/road-first/join';
import type {CompileResult} from '@/core/road-first/derive';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {CommandOutcome} from './use-road-editor';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import {pointAtLength,snapPoint,type SnapResult} from '@/core/road-first/snap';
import {approachInfo,cornerFromPoint,cornerHandles,openingHandle,openingStartFromPoint,openingsOf,openingsPatch,pocketHandle,pocketLengthFromPoint,pocketTreatment,type PocketSide} from '@/core/road-first/approach-edit';
import {legKey,type LegKey} from '@/core/road-first/leg-binding';
import {roadOpeningHandle,roadOpeningStationFromPoint} from '@/core/road-first/road-openings';
import {curveHandle,radiusFromPoint,vertexCurve} from '@/core/road-first/curves';
import {smoothAlignment} from '@/core/common/alignment';
import type {DeltaStatus,ScenarioDiff} from '@/core/road-first/compare';
import type {LocalImageReference} from '@/core/network/local-reference';
import MapBackground,{type MapProviderCredentials,type MapReference} from '../junction/map-background';

export const DELTA_STYLE:Record<DeltaStatus,{color:string;label:string}>={added:{color:'#1f8a4c',label:'เพิ่ม'},removed:{color:'#b3261e',label:'ตัดออก'},changed:{color:'#c47b12',label:'แก้ไข'}};

/** approach: one road leg at a junction (id = junction candidate id, leg = road leg key). */
/** point: a road point picked on the plan (its curve radius, or delete it). */
export type DesignSelection={kind:'road';id:string;point?:number}|{kind:'crossing'|'junction';id:string}|{kind:'approach';id:string;leg:LegKey}|null;
/** ref-move / ref-calibrate: place and scale the reference image (started from the inspector). */
export type DesignTool='select'|'pan'|'road'|'ref-move'|'ref-calibrate'|'map-move';
export type ReferenceImageView={reference:LocalImageReference;url:string|null};
type View={x:number;y:number;scale:number};
/** Outcome of finishing the road drawn so far: error = cannot be placed; warn = placed, but not joined as drawn. */
export type DraftCheck={kind:'error'|'warn';text:string}|null;

const noop=()=>{};
const niceLength=(m:number)=>{const p=10**Math.floor(Math.log10(m));return [1,2,5,10].map(k=>k*p).filter(v=>v<=m).at(-1)??p;};

export function DesignCanvas({project,compiled,selection,onSelect,tool,draft,onDraftChange,onFinishDraft,onDraftBack,checkDraft,run,finishGesture,fitKey,onSnap,typedLength,comparison,svgRef,referenceImage,onReferenceMove,calibration,onCalibratePoint,map,onMapMove,focusKey=0}:{
  project:RoadFirstProject;compiled:CompileResult;selection:DesignSelection;onSelect:(s:DesignSelection)=>void;
  tool:DesignTool;draft:WorldPoint[];onDraftChange:(points:WorldPoint[],snap:SnapResult)=>void;onFinishDraft:()=>void;
  /** Right-click while drawing: one step back. checkDraft: what finishing the road drawn so far would do (see DraftCheck). */
  onDraftBack:()=>void;checkDraft:(points:WorldPoint[])=>DraftCheck;
  /** gesture: part of a drag (one undo step until finishGesture); otherwise every call is its own step. */
  run:(cmd:RoadFirstCommand,opts?:{gesture?:boolean})=>CommandOutcome;finishGesture:()=>void;fitKey:number;
  /** Latest snapped cursor while drawing (used for typed length); typedLength: digits typed so far. */
  onSnap:(snap:SnapResult|null)=>void;typedLength:string;
  /** Differences from the reference scenario, highlighted on the plan; svgRef: the plan, for figure export. */
  comparison:ScenarioDiff|null;svgRef:React.RefObject<SVGSVGElement|null>;
  /** Reference image under the plan; calibration: points A, B picked for scaling it. */
  referenceImage:ReferenceImageView|null;onReferenceMove:(at:WorldPoint)=>void;calibration:WorldPoint[];onCalibratePoint:(p:WorldPoint)=>void;
  /** Online map under the plan; onMapMove: new map offset while dragging it. */
  map:{reference:MapReference;credentials:MapProviderCredentials};onMapMove:(offset:WorldPoint)=>void;
  /** Changes each time "zoom to selection" is asked for. */
  focusKey?:number;
}){
  const wrap=useRef<HTMLDivElement>(null),svg=svgRef;
  const [size,setSize]=useState({w:900,h:600}),[view,setView]=useState<View>({x:0,y:0,scale:2});
  const [snap,setSnap]=useState<SnapResult|null>(null);
  const drag=useRef<{kind:'pan';from:{x:number;y:number};start:View}|{kind:'point';roadId:string;index:number}
    |{kind:'ref';from:WorldPoint;start:WorldPoint}|{kind:'map';from:WorldPoint;start:WorldPoint}|{kind:'corner';candidateId:string;corner:number}|{kind:'pocket';candidateId:string;leg:LegKey;side:PocketSide}|{kind:'opening';candidateId:string;leg:LegKey;id:string}|{kind:'road-opening';roadId:string;id:string}|{kind:'radius';roadId:string;index:number}|null>(null);

  useEffect(()=>{
    const el=wrap.current;if(!el)return;
    const ro=new ResizeObserver(([e])=>setSize({w:Math.max(100,e.contentRect.width),h:Math.max(100,e.contentRect.height)}));
    ro.observe(el);return()=>ro.disconnect();
  },[]);
  // Fit to the design whenever asked (first load, Fit button, file open).
  useEffect(()=>{
    const pts=project.roads.flatMap(r=>r.points);
    // Fitting depends on the measured canvas size, so it runs after layout.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(!pts.length){setView({x:0,y:0,scale:2});return;}
    const b=compiled.project.junctions.length||compiled.project.links.length?projectBounds(compiled.project,30):null;
    const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
    const minX=Math.min(...xs,b?.x??Infinity),maxX=Math.max(...xs,b?b.x+b.w:-Infinity),minY=Math.min(...ys,b?.y??Infinity),maxY=Math.max(...ys,b?b.y+b.h:-Infinity);
    const w=Math.max(60,maxX-minX+60),h=Math.max(60,maxY-minY+60);
    setView({x:(minX+maxX)/2,y:(minY+maxY)/2,scale:Math.min(size.w/w,size.h/h)});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fitKey,size.w>100]);
  // Zoom to the selection (review 2026-10-21): a road shows whole; a junction, approach or crossing shows its surroundings.
  useEffect(()=>{
    if(!focusKey||!selection)return;
    let pts:WorldPoint[]=[];
    if(selection.kind==='road')pts=project.roads.find(r=>r.id===selection.id)?.points??[];
    else{const c=detectCandidates(project.roads).find(x=>x.id===selection.id);if(c)pts=[{x:c.point.x-60,y:c.point.y-60},{x:c.point.x+60,y:c.point.y+60}];}
    if(!pts.length)return;
    const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const w=Math.max(40,maxX-minX+40),h=Math.max(40,maxY-minY+40);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({x:(minX+maxX)/2,y:(minY+maxY)/2,scale:Math.min(40,size.w/w,size.h/h)});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[focusKey]);

  const toWorld=useCallback((e:{clientX:number;clientY:number}):WorldPoint=>{
    const m=svg.current?.getScreenCTM();if(!m)return{x:0,y:0};
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return{x:+p.x.toFixed(2),y:+p.y.toFixed(2)};
  },[svg]);
  const vb={x:view.x-size.w/2/view.scale,y:view.y-size.h/2/view.scale,w:size.w/view.scale,h:size.h/view.scale};
  const px=(n:number)=>n/view.scale;

  const candidates=useMemo(()=>detectCandidates(project.roads),[project.roads]);
  const joins=useMemo(()=>endJoins(project.roads),[project.roads]);
  const decisionOf=(id:string)=>project.decisions.find(d=>d.candidateId===id);

  function onPointerDownCapture(e:React.PointerEvent<SVGSVGElement>){
    if(e.button===1||tool==='pan'){
      e.preventDefault();e.stopPropagation();(e.currentTarget as Element).setPointerCapture(e.pointerId);
      drag.current={kind:'pan',from:{x:e.clientX,y:e.clientY},start:view};return;
    }
    if(tool==='ref-calibrate'&&e.button===0){e.stopPropagation();onCalibratePoint(toWorld(e));return;}
    if(tool==='ref-move'&&e.button===0&&referenceImage){
      e.stopPropagation();(e.currentTarget as Element).setPointerCapture(e.pointerId);
      drag.current={kind:'ref',from:toWorld(e),start:{x:referenceImage.reference.x,y:referenceImage.reference.y}};return;
    }
    if(tool==='map-move'&&e.button===0){
      e.stopPropagation();(e.currentTarget as Element).setPointerCapture(e.pointerId);
      drag.current={kind:'map',from:toWorld(e),start:{x:map.reference.offsetX,y:map.reference.offsetY}};return;
    }
    if(tool==='road'&&e.button===0){
      e.stopPropagation();
      // The second click of a double-click lands on the last point; it finishes the road instead of adding one.
      const s=snapAt(e),p=s.point,last=draft.at(-1);
      if(last&&Math.hypot(p.x-last.x,p.y-last.y)<px(6))return;
      onDraftChange([...draft,p],s);
    }
  }
  function onPointerMove(e:React.PointerEvent<SVGSVGElement>){
    const d=drag.current;
    if(tool==='road'){const s=snapAt(e);setSnap(s);onSnap(s);}
    if(!d)return;
    if(d.kind==='pan'){setView({...d.start,x:d.start.x-(e.clientX-d.from.x)/d.start.scale,y:d.start.y-(e.clientY-d.from.y)/d.start.scale});return;}
    if(d.kind==='map'){
      // The plan does not move while the map is dragged, so the pointer is read against the plan directly.
      const p=toWorld(e);onMapMove({x:+(d.start.x+p.x-d.from.x).toFixed(2),y:+(d.start.y+p.y-d.from.y).toFixed(2)});return;
    }
    if(d.kind==='ref'){const p=toWorld(e);onReferenceMove({x:+(d.start.x+p.x-d.from.x).toFixed(2),y:+(d.start.y+p.y-d.from.y).toFixed(2)});return;}
    if(d.kind==='corner'){
      const j=junctionOf(d.candidateId);if(!j)return;
      // Each corner handle edits only its own corner.
      const h=cornerHandles(j).find(x=>x.corner===d.corner),jid=compiled.project.junctions.find(x=>x===j)?.id,leg=h&&compiled.legs.find(l=>l.junctionId===jid&&l.armId===h.armId);
      if(!h||!leg)return;
      const radius=cornerFromPoint(j,d.corner,toWorld(e));
      if(radius!==h.radius)run({type:'junction.setCornerAt',candidateId:d.candidateId,leg:legKey(leg.roadId,leg.side),radius},{gesture:true});return;
    }
    if(d.kind==='radius'){
      const r=project.roads.find(x=>x.id===d.roadId);if(!r)return;
      const radius=radiusFromPoint(r.points,d.index,toWorld(e));
      if(radius!==null&&radius!==(r.points[d.index].radius??0))run({type:'road.setPointRadius',roadId:r.id,index:d.index,radius},{gesture:true});return;
    }
    if(d.kind==='road-opening'){
      const r=project.roads.find(x=>x.id===d.roadId),o=r?.openings?.find(x=>x.id===d.id);if(!r||!o)return;
      const station=roadOpeningStationFromPoint(r,o,toWorld(e));
      if(station!==o.station)run({type:'road.setOpenings',roadId:r.id,openings:r.openings!.map(x=>x.id===o.id?{...x,station}:x)},{gesture:true});return;
    }
    if(d.kind==='opening'){
      const info=approachInfo(compiled,d.candidateId,d.leg),list=info&&openingsOf(info.arm),o=list?.find(x=>x.id===d.id);if(!info||!list||!o)return;
      const start=openingStartFromPoint(info.junction,info.armId,o,toWorld(e));
      if(start!==o.start)run({type:'leg.setTreatment',candidateId:d.candidateId,leg:d.leg,patch:openingsPatch(list.map(x=>x.id===o.id?{...x,start}:x))},{gesture:true});return;
    }
    if(d.kind==='pocket'){
      const info=approachInfo(compiled,d.candidateId,d.leg);if(!info)return;
      const length=pocketLengthFromPoint(info.junction,info.armId,d.side,toWorld(e));
      if(length!==info.arm.incomingPockets?.[d.side].length)run({type:'leg.setTreatment',candidateId:d.candidateId,leg:d.leg,patch:pocketTreatment(info.arm,d.side,{length})},{gesture:true});return;
    }
    run({type:'road.movePoint',roadId:d.roadId,index:d.index,point:toWorld(e)},{gesture:true});
  }
  function junctionOf(candidateId:string){
    const jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
    return compiled.project.junctions.find(j=>j.id===jid);
  }
  function startHandleDrag(e:React.PointerEvent,next:NonNullable<typeof drag.current>){
    if(tool!=='select'||e.button!==0)return;
    e.stopPropagation();(svg.current as Element|null)?.setPointerCapture(e.pointerId);drag.current=next;
  }
  /** Snapped cursor for Draw Road; Shift suspends snapping. */
  function snapAt(e:{clientX:number;clientY:number;shiftKey:boolean}):SnapResult{
    const from=draft.at(-1),prev=draft.at(-2);
    return snapPoint(toWorld(e),project.roads,{pxPerMetre:view.scale,from,off:e.shiftKey,
      previousHeading:from&&prev?((Math.atan2(from.y-prev.y,from.x-prev.x)*180/Math.PI)+360)%360:undefined});
  }
  function onPointerUp(){
    if(drag.current&&drag.current.kind!=='pan'&&drag.current.kind!=='ref'&&drag.current.kind!=='map')finishGesture();
    drag.current=null;
  }
  // Wheel zooms toward the pointer; line/page wheel units are normalised like the 3D view, and the page never scrolls.
  const wheelRef=useRef<(e:WheelEvent)=>void>(()=>{});
  useEffect(()=>{wheelRef.current=(e:WheelEvent)=>{
    e.preventDefault();
    const rect=svg.current?.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?(rect?.height??600):1);
    const at=toWorld(e),k=Math.exp(-Math.max(-500,Math.min(500,delta))*.0015),scale=Math.min(40,Math.max(.05,view.scale*k));
    setView({scale,x:at.x-(at.x-view.x)*view.scale/scale,y:at.y-(at.y-view.y)*view.scale/scale});
  };});
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const handler=(e:WheelEvent)=>wheelRef.current(e);
    el.addEventListener('wheel',handler,{passive:false});return()=>el.removeEventListener('wheel',handler);
  },[svg]);
  function startPointDrag(e:React.PointerEvent,road:Road,index:number){
    if(tool!=='select'||e.button!==0)return;
    e.stopPropagation();(svg.current as Element|null)?.setPointerCapture(e.pointerId);
    onSelect({kind:'road',id:road.id,point:index});drag.current={kind:'point',roadId:road.id,index};
  }
  function insertPoint(e:React.MouseEvent,road:Road){
    if(tool!=='select')return;
    e.stopPropagation();
    const p=toWorld(e),s=stations(road.points);let best=1,gap=Infinity;
    for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],t=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/((s[i]-s[i-1])**2||1))),q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},g=Math.hypot(p.x-q.x,p.y-q.y);if(g<gap){gap=g;best=i;}}
    run({type:'road.insertPoint',roadId:road.id,index:best,point:p});
  }

  const scaleLen=niceLength(px(120));
  const selectedJunction=selection&&(selection.kind==='junction'||selection.kind==='approach')?junctionOf(selection.id):undefined;
  const selectedApproach=selection?.kind==='approach'?approachInfo(compiled,selection.id,selection.leg):null;
  const pocketHandles=selectedApproach?(['right','left'] as const).flatMap(side=>{const point=pocketHandle(selectedApproach.junction,selectedApproach.armId,side);return point?[{side,point,candidateId:selectedApproach.candidateId,leg:selectedApproach.leg}]:[];}):[];
  const typed=Number(typedLength),last=draft.at(-1);
  const cursor=tool!=='road'||!snap?null:typedLength&&last&&typed>0?pointAtLength(last,snap.point,typed):snap.point;
  const preview=tool==='road'&&draft.length?[...draft,...(cursor?[cursor]:[])]:[];
  // Checked as if finished now, so a road that cannot be placed shows red with the reason before the click.
  const previewKey=preview.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),checkKey=useDeferredValue(previewKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draftCheck=useMemo(()=>preview.length>1?checkDraft(preview):null,[checkKey,checkDraft]);
  const draftColor=draftCheck?.kind==='error'?'#b3261e':draftCheck?'#c47b12':'#0b7f86';
  // The map component measures its view as a square span across the shorter side of the plan.
  const MAP_SPAN=600,mapView={zoom:MAP_SPAN*view.scale/Math.max(1,Math.min(size.w,size.h)),pan:{x:view.x,y:view.y},span:MAP_SPAN,minZoom:1e-6};
  return <div className="design-canvas" ref={wrap} data-design-tool={tool} data-design-map={map.reference.enabled?'on':'off'}>
    <MapBackground reference={map.reference} credentials={map.credentials} view={mapView}/>
    <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} data-design-plan="true"
      onPointerDownCapture={onPointerDownCapture} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={()=>{setSnap(null);onSnap(null);}}
      onContextMenu={e=>{if(tool!=='road')return;e.preventDefault();onDraftBack();}} onDoubleClick={()=>{if(tool==='road')onFinishDraft();}}>
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" onPointerDown={()=>{if(tool==='select')onSelect(null);}}/>
      {referenceImage?.url&&referenceImage.reference.enabled&&(()=>{const r=referenceImage.reference,w=r.widthPx*r.metersPerPixel,h=r.heightPx*r.metersPerPixel;
        return <g data-design-reference-image="true" transform={`translate(${r.x} ${r.y}) rotate(${r.rotation})`} opacity={r.opacity} pointerEvents="none">
          <image href={referenceImage.url} x={-w/2} y={-h/2} width={w} height={h} preserveAspectRatio="none"/>
          {tool==='ref-move'&&<rect x={-w/2} y={-h/2} width={w} height={h} fill="none" stroke="#0b7f86" strokeWidth={px(2)} strokeDasharray={`${px(8)} ${px(5)}`}/>}
        </g>;})()}
      {/* zoom = screen px per metre, so hit areas keep their on-screen size; arm geometry follows the roads (no arm grips). */}
      <NetworkDrawing project={compiled.project} zoom={view.scale} armHandles={false} selection={selectedJunction?{kind:'junction',id:selectedJunction.id}:null}
        comparisonFocus={null} parallelCorridorId={null} parallelDraftMainlineId={null} selectedArm={selectedApproach?.armId??null} linkMode={false} pendingPort={null} selectedLinkVertex={null}
        onSelect={s=>{if(tool!=='select'||!s)return;onSelect(s.kind==='junction'?{kind:'junction',id:compiled.sources.junctions[s.id]}:{kind:'road',id:compiled.sources.links[s.id]});}}
        onArmSelect={(j,armId)=>{
          if(tool!=='select')return;
          const leg=compiled.legs.find(l=>l.junctionId===j&&l.armId===armId);
          onSelect(leg?{kind:'approach',id:compiled.sources.junctions[j],leg:legKey(leg.roadId,leg.side)}:{kind:'junction',id:compiled.sources.junctions[j]});
        }}
        onJunctionMoveStart={noop} onArmMoveStart={noop} onLinkInsertVertex={noop} onLinkVertexMoveStart={noop} onLinkVertexSelect={noop} onPort={noop}/>
      {/* Arms longer than the straight part of their road: the extra length is off the drawn alignment. */}
      {compiled.shortfalls.length>0&&<g data-design-shortfalls={compiled.shortfalls.length} pointerEvents="none">
        {compiled.shortfalls.map(s=>{const j=compiled.project.junctions.find(x=>x.id===s.junctionId);if(!j)return null;
          const h=portHeading(j,s.armId)*Math.PI/180,at=(m:number)=>({x:j.x+Math.cos(h)*m,y:j.y+Math.sin(h)*m}),a=at(s.room),e=at(s.required);
          return <g key={`${s.junctionId}:${s.armId}`} data-design-shortfall={`${s.roadId}:${s.side}`}>
            <line x1={a.x} y1={a.y} x2={e.x} y2={e.y} stroke="#b3261e" strokeWidth={px(4)} strokeDasharray={`${px(6)} ${px(4)}`} strokeLinecap="round"/>
            <text x={e.x+px(6)} y={e.y-px(6)} fontSize={px(12)} fontWeight="700" fill="#b3261e" fontFamily="Arial, Noto Sans Thai, Tahoma, sans-serif">ช่วงตรงไม่พอ {(s.required-s.room).toFixed(1)} ม.</text>
          </g>;})}
      </g>}
      {comparison&&<g data-design-compare={comparison.deltas.length} pointerEvents="none">
        {comparison.deltas.map(d=>{const b=d.bounds;if(!b)return null;const s=DELTA_STYLE[d.status];
          return <g key={`${d.target.kind}:${d.target.id}`} data-design-delta={d.status}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={px(6)} fill={s.color} fillOpacity={.08} stroke={s.color} strokeWidth={px(2.5)} strokeDasharray={d.status==='removed'?`${px(8)} ${px(5)}`:undefined}/>
            <text x={b.x+px(4)} y={b.y-px(5)} fontSize={px(12)} fontWeight="700" fill={s.color} fontFamily="Arial, Noto Sans Thai, Tahoma, sans-serif">{s.label} · {d.name}</text>
          </g>;})}
      </g>}
      <g data-design-roads="true">
        {/* Higher roads last, so a click at a grade separation picks the road on top. */}
        {[...project.roads].sort((a,b)=>Math.max(0,...(a.profile??[]).map(q=>q.z))-Math.max(0,...(b.profile??[]).map(q=>q.z))).map(road=>{
          // The centre line as drawn: arcs at curved points.
          const d=smoothAlignment(road.points).map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '),selected=selection?.kind==='road'&&selection.id===road.id,
            pointPicked=selected&&selection?.kind==='road'?selection.point:undefined,radiusAt=pointPicked!==undefined?curveHandle(road.points,pointPicked,px(28)):null;
          return <g key={road.id} data-design-road={road.id}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={px(16)} style={{cursor:tool==='select'?'pointer':undefined}}
              onPointerDown={e=>{if(tool!=='select')return;e.stopPropagation();onSelect({kind:'road',id:road.id});}} onDoubleClick={e=>insertPoint(e,road)}/>
            <path d={d} fill="none" stroke={selected?'#0b7f86':'#5f7f86'} strokeWidth={px(selected?2:1)} strokeDasharray={`${px(8)} ${px(5)}`} pointerEvents="none" opacity={selected?1:.55}/>
            {selected&&(road.openings??[]).map(o=>{const p=roadOpeningHandle(road,o);
              return <g key={'o-'+o.id} style={{cursor:'move'}} onPointerDown={e=>startHandleDrag(e,{kind:'road-opening',roadId:road.id,id:o.id})}>
                <circle data-design-road-opening-handle={o.id} cx={p.x} cy={p.y} r={px(13)} fill="transparent"><title>{`ช่องเปิด เริ่ม ${o.station} ม. จากต้นถนน · ลากเพื่อย้าย`}</title></circle>
                <rect x={p.x-px(6)} y={p.y-px(4)} width={px(12)} height={px(8)} rx={px(2)} fill="#fff" stroke="#6d6a8f" strokeWidth={px(2)} pointerEvents="none"/>
              </g>;})}
            {selected&&road.points.map((p,i)=><g key={i} style={{cursor:'move'}} onPointerDown={e=>startPointDrag(e,road,i)}>
              {/* Large invisible target around a small visible handle. */}
              <circle data-design-road-point={`${road.id}:${i}`} data-design-point-picked={pointPicked===i?'true':undefined} cx={p.x} cy={p.y} r={px(14)} fill="transparent"/>
              <circle cx={p.x} cy={p.y} r={px(pointPicked===i?7:6)} fill={pointPicked===i?'#0b7f86':'#fff'} stroke="#0b7f86" strokeWidth={px(2)} pointerEvents="none"/>
              {(p.radius??0)>0&&vertexCurve(road.points,i)&&<text x={p.x+px(10)} y={p.y-px(10)} fontSize={px(12)} fontWeight="700" fill="#0b6f69" pointerEvents="none">R{Math.round(vertexCurve(road.points,i)!.radius)}</text>}
            </g>)}
            {/* Curve radius handle of the picked point: drag towards the inside of the bend for a larger radius. */}
            {radiusAt&&pointPicked!==undefined&&<g style={{cursor:'move'}} onPointerDown={e=>startHandleDrag(e,{kind:'radius',roadId:road.id,index:pointPicked})}>
              <line x1={road.points[pointPicked].x} y1={road.points[pointPicked].y} x2={radiusAt.x} y2={radiusAt.y} stroke="#0b7f86" strokeWidth={px(1.2)} strokeDasharray={`${px(3)} ${px(3)}`} pointerEvents="none"/>
              <circle data-design-radius-handle={`${road.id}:${pointPicked}`} cx={radiusAt.x} cy={radiusAt.y} r={px(13)} fill="transparent"><title>ลากเข้าด้านในโค้งเพื่อเพิ่มรัศมี · ลากกลับไปที่จุดเพื่อทำมุมตรง</title></circle>
              <circle cx={radiusAt.x} cy={radiusAt.y} r={px(6)} fill="#fff" stroke="#0b7f86" strokeWidth={px(2)} pointerEvents="none"/>
              <path d={`M${radiusAt.x-px(3)} ${radiusAt.y}h${px(6)}M${radiusAt.x} ${radiusAt.y-px(3)}v${px(6)}`} stroke="#0b7f86" strokeWidth={px(1.5)} pointerEvents="none"/>
            </g>}
          </g>;
        })}
      </g>
      {/* Road ends that touch but are two separate roads: click to select, then join in the inspector. */}
      <g data-design-end-joins={joins.length}>
        {joins.map(j=><g key={`${j.a}:${j.b}`} data-design-end-join={`${j.a}|${j.b}`} style={{cursor:tool==='select'?'pointer':undefined}} onPointerDown={e=>{if(tool!=='select')return;e.stopPropagation();onSelect({kind:'road',id:j.a});}}>
          <title>ปลายถนนสองเส้นชนกันแต่ยังเป็นคนละเส้น · เลือกแล้วกด “เชื่อมเป็นถนนเดียว”</title>
          <circle cx={j.point.x} cy={j.point.y} r={px(9)} fill="#fff" stroke="#6d6a8f" strokeWidth={px(2)} strokeDasharray={`${px(3)} ${px(2)}`}/>
          <path d={`M${j.point.x-px(4)} ${j.point.y}h${px(8)}`} stroke="#6d6a8f" strokeWidth={px(2)} pointerEvents="none"/>
        </g>)}
      </g>
      <g data-design-candidates="true">
        {candidates.map(c=>{
          const d=decisionOf(c.id);
          if(d?.decision==='junction'&&compiled.project.junctions.some(j=>compiled.sources.junctions[j.id]===c.id)){
            // A road reaches this junction but is not part of it: keep that visible on the plan.
            if(!compiled.unjoined[c.id])return null;
            return <g key={c.id} data-design-unjoined={c.id} style={{cursor:'pointer'}} onPointerDown={e=>{if(tool!=='select')return;e.stopPropagation();onSelect({kind:'junction',id:c.id});}}>
              <circle cx={c.point.x+px(18)} cy={c.point.y-px(18)} r={px(10)} fill="#fff4e0" stroke="#c47b12" strokeWidth={px(2)}/>
              <text x={c.point.x+px(18)} y={c.point.y-px(18)} dy={px(4.5)} textAnchor="middle" fontSize={px(13)} fontWeight="800" fill="#a35f00" pointerEvents="none">!</text>
            </g>;
          }
          const unresolved=d?.decision==='grade-separated'&&compiled.crossings.find(x=>x.candidateId===c.id)?.relation==='unresolved';
          const state=unresolved?'open':d?.decision??'open',selected=selection?.kind==='crossing'&&selection.id===c.id;
          return <g key={c.id} data-design-candidate={c.id} data-design-candidate-state={state} style={{cursor:'pointer'}}
            onPointerDown={e=>{if(tool!=='select')return;e.stopPropagation();onSelect({kind:'crossing',id:c.id});}}>
            <circle cx={c.point.x} cy={c.point.y} r={px(13)} fill={state==='open'?'#fff7e6':'#ffffffcc'} stroke={state==='open'?'#c47b12':'#8a9599'} strokeWidth={px(selected?3:1.6)} strokeDasharray={state==='open'?undefined:`${px(4)} ${px(3)}`}/>
            <text x={c.point.x} y={c.point.y} dy={px(5)} textAnchor="middle" fontSize={px(14)} fontWeight="700" fill={state==='open'?'#a35f00':'#5c676b'} pointerEvents="none">{state==='open'?'?':state==='grade-separated'?'≠':'·'}</text>
          </g>;
        })}
      </g>
      {preview.length>0&&<g data-design-draft={draftCheck?draftCheck.kind:'true'} pointerEvents="none">
        <polyline points={preview.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={draftColor} strokeWidth={px(draftCheck?3:2)} strokeDasharray={`${px(6)} ${px(4)}`}/>
        {draft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={px(4)} fill={draftColor}/>)}
      </g>}
      {tool==='select'&&selectedJunction&&selection&&<g data-design-handles="true">
        {cornerHandles(selectedJunction).map(h=><g key={`c${h.corner}`} style={{cursor:'move'}} onPointerDown={e=>startHandleDrag(e,{kind:'corner',candidateId:selection.id,corner:h.corner})}>
          <circle data-design-corner-handle={h.corner} cx={h.point.x} cy={h.point.y} r={px(13)} fill="transparent"><title>{`รัศมีมุมนี้ ${h.radius} ม. · ลากเพื่อปรับเฉพาะมุมนี้`}</title></circle>
          <rect x={h.point.x-px(5)} y={h.point.y-px(5)} width={px(10)} height={px(10)} fill="#fff" stroke="#c47b12" strokeWidth={px(2)} pointerEvents="none"/>
        </g>)}
        {selectedApproach&&openingsOf(selectedApproach.arm).map(o=>{const p=openingHandle(selectedApproach.junction,selectedApproach.armId,o);
          return <g key={o.id} style={{cursor:'move'}} onPointerDown={e=>startHandleDrag(e,{kind:'opening',candidateId:selectedApproach.candidateId,leg:selectedApproach.leg,id:o.id})}>
            <circle data-design-opening-handle={o.id} cx={p.x} cy={p.y} r={px(13)} fill="transparent"><title>{`ช่องเปิด ${o.start} ม. จากปากทาง · ลากเพื่อย้าย`}</title></circle>
            <rect x={p.x-px(6)} y={p.y-px(4)} width={px(12)} height={px(8)} rx={px(2)} fill="#fff" stroke="#6d6a8f" strokeWidth={px(2)} pointerEvents="none"/>
          </g>;})}
        {pocketHandles.map(h=><g key={h.side} style={{cursor:'move'}} onPointerDown={e=>startHandleDrag(e,{kind:'pocket',candidateId:h.candidateId,leg:h.leg,side:h.side})}>
          <circle data-design-pocket-handle={h.side} cx={h.point.x} cy={h.point.y} r={px(13)} fill="transparent"/>
          <circle cx={h.point.x} cy={h.point.y} r={px(6)} fill="#0b7f86" stroke="#fff" strokeWidth={px(2)} pointerEvents="none"/>
        </g>)}
      </g>}
      {tool==='ref-calibrate'&&calibration.length>0&&<g data-design-calibration={calibration.length} pointerEvents="none">
        {calibration.length===2&&<line x1={calibration[0].x} y1={calibration[0].y} x2={calibration[1].x} y2={calibration[1].y} stroke="#c47b12" strokeWidth={px(2)}/>}
        {calibration.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r={px(6)} fill="#fff" stroke="#c47b12" strokeWidth={px(2)}/><text x={p.x+px(9)} y={p.y-px(8)} fontSize={px(13)} fontWeight="700" fill="#c47b12">{i?'B':'A'}</text></g>)}
      </g>}
      {tool==='road'&&snap&&<g data-design-snap={snap.kind} pointerEvents="none">
        {snap.kind==='angle'&&draft.length>0&&(()=>{const a=draft.at(-1)!,r=(snap.angle??0)*Math.PI/180,L=px(2000);
          return <line x1={a.x-Math.cos(r)*L} y1={a.y-Math.sin(r)*L} x2={a.x+Math.cos(r)*L} y2={a.y+Math.sin(r)*L} stroke="#c47b12" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(5)}`}/>;})()}
        {snap.kind==='end'&&<circle cx={snap.point.x} cy={snap.point.y} r={px(12)} fill="#0b7f8622" stroke="#0b7f86" strokeWidth={px(2)}/>}
        {snap.kind==='road'&&<rect x={snap.point.x-px(7)} y={snap.point.y-px(7)} width={px(14)} height={px(14)} transform={`rotate(45 ${snap.point.x} ${snap.point.y})`} fill="#fff" stroke="#0b7f86" strokeWidth={px(2)}/>}
        <circle cx={snap.point.x} cy={snap.point.y} r={px(3)} fill="#0b7f86"/>
      </g>}
    </svg>
    {tool==='road'&&snap&&<div className="design-readout" data-design-readout="true" style={{left:Math.max(8,Math.min((snap.point.x-vb.x)*view.scale+16,size.w-(draftCheck?350:140))),top:Math.max(8,Math.min((snap.point.y-vb.y)*view.scale+16,size.h-(draftCheck?90:40)))}}>
      {typedLength?<b>{typedLength} ม. ↵</b>:snap.length!==undefined&&<b>{snap.length.toFixed(1)} ม.</b>}
      {snap.angle!==undefined&&<span>{snap.angle.toFixed(0)}°</span>}
      {snap.kind==='end'&&<span>{draft.length?'ปลายถนน':'ต่อจากปลายถนน'}</span>}
      {snap.kind==='road'&&<span>บนแนวถนน</span>}
      {draftCheck&&<em data-design-draft-check={draftCheck.kind} className={draftCheck.kind}>{draftCheck.text}</em>}
    </div>}
    <div className="design-scale" aria-hidden="true"><span>{scaleLen} ม.</span><i style={{width:scaleLen*view.scale}}/></div>
  </div>;
}
