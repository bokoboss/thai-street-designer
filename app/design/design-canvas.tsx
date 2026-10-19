'use client';
// Plan view of the road-first workspace. The engineering drawing is the compiled network (same renderer as
// before); roads, their points and crossing candidates are drawn on top as the editable layer.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {NetworkDrawing} from '../network/network-drawing';
import {projectBounds,type WorldPoint} from '@/core/network/network-project';
import {detectCandidates,stations,type Road} from '@/core/road-first/derive';
import type {CompileResult} from '@/core/road-first/derive';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {CommandOutcome} from './use-road-editor';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import {pointAtLength,snapPoint,type SnapResult} from '@/core/road-first/snap';

export type DesignSelection={kind:'road'|'crossing'|'junction';id:string}|null;
export type DesignTool='select'|'pan'|'road';
type View={x:number;y:number;scale:number};

const noop=()=>{};
const niceLength=(m:number)=>{const p=10**Math.floor(Math.log10(m));return [1,2,5,10].map(k=>k*p).filter(v=>v<=m).at(-1)??p;};

export function DesignCanvas({project,compiled,selection,onSelect,tool,draft,onDraftChange,onFinishDraft,run,finishGesture,fitKey,onSnap,typedLength}:{
  project:RoadFirstProject;compiled:CompileResult;selection:DesignSelection;onSelect:(s:DesignSelection)=>void;
  tool:DesignTool;draft:WorldPoint[];onDraftChange:(points:WorldPoint[],snap:SnapResult)=>void;onFinishDraft:()=>void;
  run:(cmd:RoadFirstCommand)=>CommandOutcome;finishGesture:()=>void;fitKey:number;
  /** Latest snapped cursor while drawing (used for typed length); typedLength: digits typed so far. */
  onSnap:(snap:SnapResult|null)=>void;typedLength:string;
}){
  const wrap=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
  const [size,setSize]=useState({w:900,h:600}),[view,setView]=useState<View>({x:0,y:0,scale:2});
  const [snap,setSnap]=useState<SnapResult|null>(null);
  const drag=useRef<{kind:'pan';from:{x:number;y:number};start:View}|{kind:'point';roadId:string;index:number}|null>(null);

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

  const toWorld=useCallback((e:{clientX:number;clientY:number}):WorldPoint=>{
    const m=svg.current?.getScreenCTM();if(!m)return{x:0,y:0};
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return{x:+p.x.toFixed(2),y:+p.y.toFixed(2)};
  },[]);
  const vb={x:view.x-size.w/2/view.scale,y:view.y-size.h/2/view.scale,w:size.w/view.scale,h:size.h/view.scale};
  const px=(n:number)=>n/view.scale;

  const candidates=useMemo(()=>detectCandidates(project.roads),[project.roads]);
  const decisionOf=(id:string)=>project.decisions.find(d=>d.candidateId===id);

  function onPointerDownCapture(e:React.PointerEvent<SVGSVGElement>){
    if(e.button===1||tool==='pan'){
      e.preventDefault();e.stopPropagation();(e.currentTarget as Element).setPointerCapture(e.pointerId);
      drag.current={kind:'pan',from:{x:e.clientX,y:e.clientY},start:view};return;
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
    run({type:'road.movePoint',roadId:d.roadId,index:d.index,point:toWorld(e)});
  }
  /** Snapped cursor for Draw Road; Shift suspends snapping. */
  function snapAt(e:{clientX:number;clientY:number;shiftKey:boolean}):SnapResult{
    const from=draft.at(-1),prev=draft.at(-2);
    return snapPoint(toWorld(e),project.roads,{pxPerMetre:view.scale,from,off:e.shiftKey,
      previousHeading:from&&prev?((Math.atan2(from.y-prev.y,from.x-prev.x)*180/Math.PI)+360)%360:undefined});
  }
  function onPointerUp(){
    if(drag.current?.kind==='point')finishGesture();
    drag.current=null;
  }
  function onWheel(e:React.WheelEvent<SVGSVGElement>){
    const at=toWorld(e),k=Math.exp(-e.deltaY*.0015),scale=Math.min(40,Math.max(.05,view.scale*k));
    setView({scale,x:at.x-(at.x-view.x)*view.scale/scale,y:at.y-(at.y-view.y)*view.scale/scale});
  }
  function startPointDrag(e:React.PointerEvent,road:Road,index:number){
    if(tool!=='select'||e.button!==0)return;
    e.stopPropagation();(svg.current as Element|null)?.setPointerCapture(e.pointerId);
    onSelect({kind:'road',id:road.id});drag.current={kind:'point',roadId:road.id,index};
  }
  function insertPoint(e:React.MouseEvent,road:Road){
    if(tool!=='select')return;
    e.stopPropagation();
    const p=toWorld(e),s=stations(road.points);let best=1,gap=Infinity;
    for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],t=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/((s[i]-s[i-1])**2||1))),q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},g=Math.hypot(p.x-q.x,p.y-q.y);if(g<gap){gap=g;best=i;}}
    run({type:'road.insertPoint',roadId:road.id,index:best,point:p});
  }

  const scaleLen=niceLength(px(120));
  const typed=Number(typedLength),last=draft.at(-1);
  const cursor=tool!=='road'||!snap?null:typedLength&&last&&typed>0?pointAtLength(last,snap.point,typed):snap.point;
  const preview=tool==='road'&&draft.length?[...draft,...(cursor?[cursor]:[])]:[];
  return <div className="design-canvas" ref={wrap} data-design-tool={tool}>
    <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} data-design-plan="true"
      onPointerDownCapture={onPointerDownCapture} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={()=>{setSnap(null);onSnap(null);}} onWheel={onWheel} onDoubleClick={()=>{if(tool==='road')onFinishDraft();}}>
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" onPointerDown={()=>{if(tool==='select')onSelect(null);}}/>
      <NetworkDrawing project={compiled.project} zoom={1} selection={selection?.kind==='junction'?{kind:'junction',id:Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===selection.id)??''}:null}
        comparisonFocus={null} parallelCorridorId={null} parallelDraftMainlineId={null} selectedArm={null} linkMode={false} pendingPort={null} selectedLinkVertex={null}
        onSelect={s=>{if(tool!=='select'||!s)return;onSelect(s.kind==='junction'?{kind:'junction',id:compiled.sources.junctions[s.id]}:{kind:'road',id:compiled.sources.links[s.id]});}}
        onArmSelect={j=>{if(tool==='select')onSelect({kind:'junction',id:compiled.sources.junctions[j]});}}
        onJunctionMoveStart={noop} onArmMoveStart={noop} onLinkInsertVertex={noop} onLinkVertexMoveStart={noop} onLinkVertexSelect={noop} onPort={noop}/>
      <g data-design-roads="true">
        {project.roads.map(road=>{
          const d=road.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '),selected=selection?.kind==='road'&&selection.id===road.id;
          return <g key={road.id} data-design-road={road.id}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={px(16)} style={{cursor:tool==='select'?'pointer':undefined}}
              onPointerDown={e=>{if(tool!=='select')return;e.stopPropagation();onSelect({kind:'road',id:road.id});}} onDoubleClick={e=>insertPoint(e,road)}/>
            <path d={d} fill="none" stroke={selected?'#0b7f86':'#5f7f86'} strokeWidth={px(selected?2:1)} strokeDasharray={`${px(8)} ${px(5)}`} pointerEvents="none" opacity={selected?1:.55}/>
            {selected&&road.points.map((p,i)=><g key={i} style={{cursor:'move'}} onPointerDown={e=>startPointDrag(e,road,i)}>
              {/* Large invisible target around a small visible handle. */}
              <circle data-design-road-point={`${road.id}:${i}`} cx={p.x} cy={p.y} r={px(14)} fill="transparent"/>
              <circle cx={p.x} cy={p.y} r={px(6)} fill="#fff" stroke="#0b7f86" strokeWidth={px(2)} pointerEvents="none"/>
            </g>)}
          </g>;
        })}
      </g>
      <g data-design-candidates="true">
        {candidates.map(c=>{
          const d=decisionOf(c.id);if(d?.decision==='junction'&&compiled.project.junctions.some(j=>compiled.sources.junctions[j.id]===c.id))return null;
          const state=d?.decision??'open',selected=selection?.kind==='crossing'&&selection.id===c.id;
          return <g key={c.id} data-design-candidate={c.id} data-design-candidate-state={state} style={{cursor:'pointer'}}
            onPointerDown={e=>{if(tool!=='select')return;e.stopPropagation();onSelect({kind:'crossing',id:c.id});}}>
            <circle cx={c.point.x} cy={c.point.y} r={px(13)} fill={state==='open'?'#fff7e6':'#ffffffcc'} stroke={state==='open'?'#c47b12':'#8a9599'} strokeWidth={px(selected?3:1.6)} strokeDasharray={state==='open'?undefined:`${px(4)} ${px(3)}`}/>
            <text x={c.point.x} y={c.point.y} dy={px(5)} textAnchor="middle" fontSize={px(14)} fontWeight="700" fill={state==='open'?'#a35f00':'#5c676b'} pointerEvents="none">{state==='open'?'?':state==='grade-separated'?'≠':'·'}</text>
          </g>;
        })}
      </g>
      {preview.length>0&&<g data-design-draft="true" pointerEvents="none">
        <polyline points={preview.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#0b7f86" strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(4)}`}/>
        {draft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={px(4)} fill="#0b7f86"/>)}
      </g>}
      {tool==='road'&&snap&&<g data-design-snap={snap.kind} pointerEvents="none">
        {snap.kind==='angle'&&draft.length>0&&(()=>{const a=draft.at(-1)!,r=(snap.angle??0)*Math.PI/180,L=px(2000);
          return <line x1={a.x-Math.cos(r)*L} y1={a.y-Math.sin(r)*L} x2={a.x+Math.cos(r)*L} y2={a.y+Math.sin(r)*L} stroke="#c47b12" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(5)}`}/>;})()}
        {snap.kind==='end'&&<circle cx={snap.point.x} cy={snap.point.y} r={px(12)} fill="#0b7f8622" stroke="#0b7f86" strokeWidth={px(2)}/>}
        {snap.kind==='road'&&<rect x={snap.point.x-px(7)} y={snap.point.y-px(7)} width={px(14)} height={px(14)} transform={`rotate(45 ${snap.point.x} ${snap.point.y})`} fill="#fff" stroke="#0b7f86" strokeWidth={px(2)}/>}
        <circle cx={snap.point.x} cy={snap.point.y} r={px(3)} fill="#0b7f86"/>
      </g>}
    </svg>
    {tool==='road'&&snap&&<div className="design-readout" data-design-readout="true" style={{left:(snap.point.x-vb.x)*view.scale+16,top:(snap.point.y-vb.y)*view.scale+16}}>
      {typedLength?<b>{typedLength} ม. ↵</b>:snap.length!==undefined&&<b>{snap.length.toFixed(1)} ม.</b>}
      {snap.angle!==undefined&&<span>{snap.angle.toFixed(0)}°</span>}
      {snap.kind==='end'&&<span>{draft.length?'ปลายถนน':'ต่อจากปลายถนน'}</span>}
      {snap.kind==='road'&&<span>บนแนวถนน</span>}
    </div>}
    <div className="design-scale" aria-hidden="true"><span>{scaleLen} ม.</span><i style={{width:scaleLen*view.scale}}/></div>
  </div>;
}
