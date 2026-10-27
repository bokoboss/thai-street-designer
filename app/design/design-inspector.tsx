'use client';
// Inspector for the road-first workspace: header → key properties → actions, destructive action last.
import {useContext,useLayoutEffect,useRef,useState} from 'react';
import {useProfileReview} from './profile-review';
import type {WorldPoint} from '@/core/network/network-project';
import type {useReferenceImage} from './use-reference-image';
import {MapPanel,type MapState} from './map-panel';
import type {Candidate,CompiledCrossing,CompileResult,Road,RoadSection} from '@/core/road-first/derive';
import {clearanceText} from '@/core/road-first/structure-clearance';
import type {RoadFirstProject} from '@/core/road-first/project';
import {executeCommand,type RoadFirstCommand} from '@/core/road-first/commands';
import {laneArrowFor,options as ARROW_OPTIONS,withLaneArrow,type LaneArrowCode} from '@/core/junction/model';
import {eligibleTurnTargets,type AutoLaneEndpoint} from '@/core/junction/automatic-lane-mapping';
import {configuredArrowLanes} from '@/core/junction/lane-configuration';
import {resolveConnectorOverrides,type ConnectorLaneRef} from '@/core/road-first/lane-connector-overrides';
import {automaticRampLaneConnections} from '@/core/road-first/ramp-lane-connections';
import {approachInfo,cornerHandles,junctionApproaches,newOpening,newSlip,openingsOf,openingsPatch,pocketTreatment,slipPatch,type ApproachInfo,type OpeningType,type PocketSide} from '@/core/road-first/approach-edit';
import {legKey,parseLegKey,type LegKey} from '@/core/road-first/leg-binding';
import {ROAD_PRESETS,matchingPreset,presetSection,type RoadPresetId} from '@/core/road-first/presets';
import {detectCandidates,stations} from '@/core/road-first/derive';
import {endJoins} from '@/core/road-first/join';
import {toJunction,toRoundabout} from '@/core/road-first/roundabout';
import {DRAW_LEVEL_STEP,levelAt,type Profile} from '@/core/road-first/elevation';
import {LEVEL_CRITERIA_KEYS,LEVEL_CRITERIA_LABEL,LEVEL_CRITERIA_RANGE,bridgeRise,hasSource,levelCriteria,rampLength,tunnelDepth,type LevelCriteriaKey} from '@/core/road-first/level-criteria';
import {freeStretches,newRoadOpening,roadLength} from '@/core/road-first/road-openings';
import {newLaneRun,type LaneRun} from '@/core/road-first/lane-runs';
import {newLaneReduction,newStretch,type SectionStretch} from '@/core/road-first/section-stretches';
import {STRUCTURE_SECTION_DEFAULTS,type StructureSection} from '@/core/road-first/structure-sections';
import {AUX_LANE_DEFAULTS} from '@/core/road-first/ramps';
import {RAMP_RULES,RAMP_SECTION} from '@/core/road-first/ramps';
import {DiamondPanel,TemplateContext,TemplatePiecesBlock} from './diamond-panel';
import {MultiRoadInspector} from './multi-select-panel';
import type {MenuAction} from './select-menu';
import {UturnBridgePanel,UturnUnderAction} from './uturn-panel';
import {MAX_RADIUS,vertexCurve} from '@/core/road-first/curves';
/** Kind of road the next drawing makes. */
export type NewRole='road'|'access'|'ramp';
import type {CommandOutcome} from './use-road-editor';
import {DELTA_STYLE,type DesignSelection,type DesignTool} from './design-canvas';
import type {ScenarioDiff} from '@/core/road-first/compare';
import type {MigrationSeverity,MigrationTarget} from '@/core/road-first/migrate';
import {reportCount,type MigrationReport} from '@/core/road-first/scenarios';

type Run=(cmd:RoadFirstCommand)=>CommandOutcome;

/** Number entry that commits on Enter or leaving the field; Esc restores the current value. */
export function NumberField({label,value,step=1,min,max,onCommit,field}:{label:string;value:number;step?:number;min?:number;max?:number;onCommit:(v:number)=>void;field:string}){
  // While typing, the field shows the draft; otherwise it always shows the current value.
  const [draft,setDraft]=useState<string|null>(null),text=draft??String(value);
  const commit=()=>{const v=Number(text);setDraft(null);if(text.trim()===''||!Number.isFinite(v)||v===value)return;onCommit(v);};
  return <label className="design-field"><span>{label}</span>
    <input type="number" inputMode="decimal" step={step} min={min} max={max} value={text} data-design-field={field}
      onChange={e=>setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){setDraft(null);}}}/>
  </label>;
}
/** allowEmpty: an emptied field commits '' (e.g. clearing a source); maxLength defaults to 60. */
function TextField({label,value,onCommit,field,allowEmpty=false,maxLength=60}:{label:string;value:string;onCommit:(v:string)=>void;field:string;allowEmpty?:boolean;maxLength?:number}){
  const [draft,setDraft]=useState<string|null>(null),text=draft??value;
  const commit=()=>{const v=text.trim();setDraft(null);if((!v&&!allowEmpty)||v===value)return;onCommit(v);};
  return <label className="design-field design-field-text"><span>{label}</span>
    <input value={text} maxLength={maxLength} data-design-field={field} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape')setDraft(null);}}/>
  </label>;
}

export function PresetPicker({value,onPick,label}:{value:RoadPresetId|null;onPick:(id:RoadPresetId)=>void;label:string}){
  return <div className="design-presets"><span>{label}</span>
    {ROAD_PRESETS.map(p=><button key={p.id} data-design-preset={p.id} className={value===p.id?'active':''} onClick={()=>onPick(p.id)}>{p.label}</button>)}
  </div>;
}

/** A section that can be folded away; open state is remembered in this browser (per section). */
function Fold({id,title,summary,data,children}:{id:string;title:string;summary:string;data:string;children:React.ReactNode}){
  const key=`thai-street-design-fold-${id}`;
  // Read before the first paint: the server render has no browser storage, so starting closed keeps hydration
  // consistent, and a layout effect opens remembered sections before anything is shown (no jump under the pointer).
  const [open,setOpen]=useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(()=>{try{if(localStorage.getItem(key)==='open')setOpen(true);}catch{/* per-visit only */}},[key]);
  return <details className="design-block design-fold" data-design-fold={data} open={open} onToggle={e=>{const v=e.currentTarget.open;setOpen(v);try{localStorage.setItem(key,v?'open':'closed');}catch{/* per-visit only */}}}>
    <summary data-design-fold-toggle={data}><span className="design-block-title">{title}</span>{!open&&summary&&<small>{summary}</small>}</summary>
    {children}
  </details>;
}

const BAND_TYPES=[['bike','ช่องจักรยาน',1.5],['motorcycle','ช่องรถจักรยานยนต์',2],['shoulder','ไหล่ทาง',1.5],['buffer','แถบคั่น',.5]] as const;
/** Bands between the lanes and the sidewalk, the same on both sides of the road. Starting widths are tool defaults. */
function BandsEditor({bands,onChange}:{bands:NonNullable<RoadSection['bands']>;onChange:(b:NonNullable<RoadSection['bands']>)=>void}){
  const label=(type:string)=>BAND_TYPES.find(b=>b[0]===type)?.[1]??type;
  return <section className="design-block" data-design-bands={bands.length}>
    <small className="design-block-title">แถบริมทาง (ระหว่างช่องจราจรกับทางเท้า ทั้งสองฝั่ง)</small>
    {bands.map((b,i)=><div key={b.id} className="design-band-row">
      <NumberField field={`band-${i}`} label={`${label(b.type)} (ม.)`} value={b.width} step={.25} min={.25} max={4.5} onCommit={width=>onChange(bands.map((x,k)=>k===i?{...x,width}:x))}/>
      <button className="link danger" data-design-action={`remove-band-${i}`} onClick={()=>onChange(bands.filter((_,k)=>k!==i))}>ลบ</button>
    </div>)}
    {bands.length<6&&<div className="design-reference-tools">{BAND_TYPES.map(([type,name,width])=><button key={type} data-design-action={`add-band-${type}`} onClick={()=>{const ids=new Set(bands.map(x=>x.id));let n=1;while(ids.has(`${type}-${n}`))n++;onChange([...bands,{id:`${type}-${n}`,type,width}]);}}>+ {name}</button>)}</div>}
  </section>;
}

/** Vertical points of the road (station from the road start, level in m); linear between points, flat outside. */
function ProfileBlock({road,run}:{road:Road;run:Run}){
  const pts:Profile=[...(road.profile??[])].sort((a,b)=>a.station-b.station),set=(p:Profile)=>run({type:'road.setProfile',roadId:road.id,profile:p.length?p:null});
  const total=roadLength(road),peak=pts.length?Math.max(...pts.map(q=>q.z)):0,low=pts.length?Math.min(...pts.map(q=>q.z)):0;
  const free=(()=>{let s=Math.round(total/2);while(pts.some(q=>Math.abs(q.station-s)<1))s+=5;return Math.min(s,Math.floor(total));})();
  return <Fold id="profile" title="แนวดิ่ง (ระดับ)" summary={pts.length?`${pts.length} จุด · ระดับ ${low.toFixed(1)} ถึง ${peak.toFixed(1)} ม.`:'ราบ ระดับ 0 ม.'} data="profile">
    {pts.map((q,i)=><div key={i} className="design-profile-editor-point" data-design-profile-point={i}>
      <NumberField field={`profile-${i}-station`} label="ระยะ (ม.)" value={q.station} step={1} min={0} max={total} onCommit={station=>set(pts.map((x,k)=>k===i?{...x,station}:x))}/>
      <NumberField field={`profile-${i}-z`} label="ระดับ (ม.)" value={q.z} step={.1} min={-200} max={200} onCommit={z=>set(pts.map((x,k)=>k===i?{...x,z}:x))}/>
      {i>0&&i<pts.length-1&&<NumberField field={`profile-${i}-curve`} label="ความยาวโค้งดิ่ง (ม.)" value={q.curveLength??0} step={1} min={0} max={total} onCommit={curveLength=>set(pts.map((x,k)=>k===i?{...x,curveLength}:x))}/>}
      {(q.curveLength??0)>0&&<small className="design-meta">ระดับผิวถนนที่ระยะนี้ {levelAt(pts,q.station).toFixed(2)} ม. · จุดระดับเป็นจุดตัดแนวลาด โค้งจริงอาจไม่ผ่านจุดนี้</small>}
      <small className="design-meta">{q.generatedBy?'สร้างจากการปรับจุดตัด · แก้ค่าแล้วเป็นจุดของผู้ใช้':'ผู้ใช้กำหนด / ข้อมูลเดิม'}</small>
      <button className="link danger" data-design-action={`remove-profile-${i}`} onClick={()=>set(pts.filter((_,k)=>k!==i))}>ลบ</button>
      {i>0&&<small className="design-meta">ลาด {(((q.z-pts[i-1].z)/((q.station-pts[i-1].station)||1))*100).toFixed(1)}% จากจุดก่อน</small>}
    </div>)}
    <div className="design-reference-tools">
      <button data-design-action="add-profile-point" onClick={()=>set([...pts,{station:free,z:Math.round(levelAt(pts,free)*100)/100}].sort((a,b)=>a.station-b.station))}>+ จุดระดับ</button>
      {pts.length>0&&<button data-design-action="flatten-profile" onClick={()=>set([])}>ราบทั้งเส้น</button>}
    </div>
    <p className="design-meta">ระยะวัดจากต้นถนน · ความยาวโค้งดิ่ง 0 = แนวเส้นตรงเดิม · ใส่ความยาวที่จุดภายในเพื่อสร้างโค้งพาราโบลาแบบสมมาตร · ยังไม่ได้ตรวจความลาดชันตามมาตรฐาน</p>
  </Fold>;
}

const RUN_LABEL=(r:LaneRun)=>`${r.direction==='forward'?'ทิศที่วาด':'ทิศสวน'} · ${r.side==='curb'?'ฝั่งขอบทาง':'ฝั่งเกาะกลาง'}`;
/** Lanes added along stretches of the road (station-based): add, place, taper, remove. */
function LaneRunBlock({road,compiled,run,onMessage}:{road:Road;compiled:CompileResult;run:Run;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const list=road.laneRuns??[],set=(runs:LaneRun[])=>run({type:'road.setLaneRuns',roadId:road.id,runs});
  const edit=(id:string,patch:Partial<LaneRun>)=>set(list.map(x=>x.id===id?{...x,...patch}:x));
  const add=(direction:LaneRun['direction'],side:LaneRun['side'])=>{const r=newLaneRun(road,freeStretches(road,compiled),direction,side);if('error' in r){onMessage(r.error,'error');return;}set([...list,r.run]);};
  const two=road.section.backwardLanes>0&&road.section.forwardLanes>0,L=roadLength(road);
  return <Fold id="lane-runs" title="ช่องจราจรเพิ่มตามระยะทาง" summary={list.length?list.map(x=>`+1 ${x.direction==='forward'?'→':'←'} ${Math.round(x.start)}–${Math.round(x.end)} ม.`).join(' · '):'ยังไม่มี'} data="lane-runs">
    {list.map((x,i)=><div key={x.id} className="design-opening" data-design-lane-run={x.id}>
      <header><b>+1 ช่อง · {RUN_LABEL(x)}</b><button className="link" data-design-action={`remove-lane-run-${i}`} onClick={()=>set(list.filter(y=>y.id!==x.id))}>ลบ</button></header>
      <div className="design-reference-tools">
        {two&&(['forward','backward'] as const).map(d=><button key={d} className={x.direction===d?'active':''} aria-pressed={x.direction===d} data-design-lane-run-direction={`${i}:${d}`} onClick={()=>edit(x.id,{direction:d})}>{d==='forward'?'ทิศที่วาด':'ทิศสวน'}</button>)}
        {(['curb','median'] as const).map(sd=><button key={sd} className={x.side===sd?'active':''} aria-pressed={x.side===sd} data-design-lane-run-side={`${i}:${sd}`} onClick={()=>edit(x.id,{side:sd})}>{sd==='curb'?'ฝั่งขอบทาง':'ฝั่งเกาะกลาง'}</button>)}
      </div>
      <div className="design-fields">
        <NumberField field={`lane-run-${i}-start`} label="เริ่มที่ระยะ (ม.)" value={x.start} step={1} min={0} max={L} onCommit={start=>edit(x.id,{start})}/>
        <NumberField field={`lane-run-${i}-end`} label="สิ้นสุดที่ระยะ (ม.)" value={x.end} step={1} min={0} max={L} onCommit={end=>edit(x.id,{end})}/>
        <NumberField field={`lane-run-${i}-taper-in`} label="ช่วงเปลี่ยนเข้า (ม.)" value={x.taperIn} step={1} min={0} max={500} onCommit={taperIn=>edit(x.id,{taperIn})}/>
        <NumberField field={`lane-run-${i}-taper-out`} label="ช่วงเปลี่ยนออก (ม.)" value={x.taperOut} step={1} min={0} max={500} onCommit={taperOut=>edit(x.id,{taperOut})}/>
      </div>
    </div>)}
    {list.length<24&&<div className="design-reference-tools">
      <button data-design-action="add-lane-run-forward" onClick={()=>add('forward','curb')}>+ ช่อง{two?'ทิศที่วาด':''}</button>
      {two&&<button data-design-action="add-lane-run-backward" onClick={()=>add('backward','curb')}>+ ช่องทิศสวน</button>}
    </div>}
    <p className="design-meta">ระยะวัดจากต้นถนน · ลากจุดบนแบบเพื่อเลื่อนต้น/ปลาย · ช่วงเปลี่ยนเป็นค่าที่วาด (ค่าเริ่มต้นของเครื่องมือ) ยังไม่ได้ตรวจตามเกณฑ์ · ช่วงที่ทับปากทางแยกจะถูกตัดและขึ้นรายการให้ตรวจ</p>
  </Fold>;
}

const BAND_NAME:Record<string,string>={shoulder:'ไหล่ทาง',bike:'ช่องจักรยาน',motorcycle:'ช่องรถจักรยานยนต์',buffer:'แถบคั่น'};
/** A different section over part of the road: adds or a curb-side lane reduction with tapers. */
function StretchBlock({road,compiled,run,onMessage}:{road:Road;compiled:CompileResult;run:Run;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const list=road.sectionStretches??[],set=(stretches:SectionStretch[])=>run({type:'road.setSectionStretches',roadId:road.id,stretches});
  const edit=(id:string,patch:Partial<SectionStretch>)=>set(list.map(x=>x.id===id?{...x,...patch}:x));
  const add=()=>{const r=newStretch(road,freeStretches(road,compiled));if('error' in r){onMessage(r.error,'error');return;}set([...list,r.stretch]);};
  const reduce=(direction:'forward'|'backward')=>{const r=newLaneReduction(road,freeStretches(road,compiled),direction);if('error' in r){onMessage(r.error,'error');return;}set([...list,r.stretch]);};
  const s=road.section,L=roadLength(road);
  return <Fold id="section-stretches" title="หน้าตัดเฉพาะช่วง" summary={list.length?list.map(x=>`${Math.round(x.start)}–${Math.round(x.end)} ม. (${x.forwardLanes}+${x.backwardLanes} ช่อง)`).join(' · '):'ยังไม่มี'} data="section-stretches">
    {list.map((x,i)=><div key={x.id} className="design-opening" data-design-stretch={x.id}>
      <header><b>ช่วง {Math.round(x.start)}–{Math.round(x.end)} ม.</b><button className="link" data-design-action={`remove-stretch-${i}`} onClick={()=>set(list.filter(y=>y.id!==x.id))}>ลบ</button></header>
      <div className="design-fields">
        <NumberField field={`stretch-${i}-start`} label="เริ่มที่ระยะ (ม.)" value={x.start} step={1} min={0} max={L} onCommit={start=>edit(x.id,{start})}/>
        <NumberField field={`stretch-${i}-end`} label="สิ้นสุดที่ระยะ (ม.)" value={x.end} step={1} min={0} max={L} onCommit={end=>edit(x.id,{end})}/>
        <NumberField field={`stretch-${i}-taper-in`} label="ช่วงเปลี่ยนเข้า (ม.)" value={x.taperIn} step={1} min={0} max={500} onCommit={taperIn=>edit(x.id,{taperIn})}/>
        <NumberField field={`stretch-${i}-taper-out`} label="ช่วงเปลี่ยนออก (ม.)" value={x.taperOut} step={1} min={0} max={500} onCommit={taperOut=>edit(x.id,{taperOut})}/>
        {s.forwardLanes>0&&<NumberField field={`stretch-${i}-forward`} label={`ช่องตามทิศที่วาด (ถนน ${s.forwardLanes})`} value={x.forwardLanes} min={Math.max(1,s.forwardLanes-1)} max={s.forwardLanes+2} onCommit={forwardLanes=>edit(x.id,{forwardLanes})}/>}
        {s.backwardLanes>0&&<NumberField field={`stretch-${i}-backward`} label={`ช่องทิศสวน (ถนน ${s.backwardLanes})`} value={x.backwardLanes} min={Math.max(1,s.backwardLanes-1)} max={s.backwardLanes+2} onCommit={backwardLanes=>edit(x.id,{backwardLanes})}/>}
        <NumberField field={`stretch-${i}-walk`} label={`ทางเท้า (ม.) (ถนน ${s.walk})`} value={x.walk} step={.25} min={0} max={s.walk+5} onCommit={walk=>edit(x.id,{walk})}/>
        {(s.bands??[]).map(b=>{const v=x.bands?.find(y=>y.type===b.type)?.width??b.width;
          return <NumberField key={b.type} field={`stretch-${i}-${b.type}`} label={`${BAND_NAME[b.type]??b.type} (ม.) (ถนน ${b.width})`} value={v} step={.25} min={0} max={b.width+5}
            onCommit={width=>edit(x.id,{bands:[...(x.bands??[]).filter(y=>y.type!==b.type),{type:b.type,width}]})}/>;})}
      </div>
    </div>)}
    {list.length<12&&<div className="design-reference-tools">
      <button data-design-action="add-stretch" onClick={add}>+ หน้าตัดเฉพาะช่วง</button>
      {s.forwardLanes>1&&<button data-design-action="add-lane-reduction-forward" onClick={()=>reduce('forward')}>− ช่องตามทิศที่วาด</button>}
      {s.backwardLanes>1&&<button data-design-action="add-lane-reduction-backward" onClick={()=>reduce('backward')}>− ช่องทิศสวน</button>}
    </div>}
    <p className="design-meta">เพิ่มช่องได้ไม่เกินสองช่อง หรือลดได้หนึ่งช่องต่อทิศในช่วงกลางถนน · ปรับความกว้างทางเท้าและแถบริมทาง · ลากจุดบนแบบเพื่อเลื่อนต้น/ปลาย · ช่วงเปลี่ยนเป็นค่าที่วาด ยังไม่ได้ตรวจตามเกณฑ์</p>
  </Fold>;
}

/** The road's own section over its bridge decks and in its tunnels; shown when the road has a structure (or a setting). */
function StructureSectionBlock({road,compiled,run}:{road:Road;compiled:CompileResult;run:Run}){
  const mine=(compiled.structures??[]).filter(x=>x.roadId===road.id),x=road.structureSection;
  if(!mine.length&&!x)return null;
  const s=road.section,set=(section:StructureSection|null)=>run({type:'road.setStructureSection',roadId:road.id,section});
  const edit=(patch:Partial<StructureSection>)=>x&&set({...x,...patch});
  const decks=mine.filter(v=>v.kind==='deck').length,tunnels=mine.length-decks;
  const where=[decks?`สะพาน ${decks} แห่ง`:'',tunnels?`อุโมงค์ ${tunnels} แห่ง`:''].filter(Boolean).join(' · ')||'ยังไม่มีสะพานหรืออุโมงค์';
  const start=()=>set({forwardLanes:s.forwardLanes,backwardLanes:s.backwardLanes,walk:s.walk,transition:STRUCTURE_SECTION_DEFAULTS.transition,
    ...(s.bands?.length?{bands:s.bands.map(b=>({type:b.type,width:b.width}))}:{})});
  return <Fold id="structure-section" title="หน้าตัดบนโครงสร้าง" summary={`${where}${x?' · ตั้งหน้าตัดเอง':' · ใช้หน้าตัดของถนน'}`} data="structure-section">
    <label className="design-check"><input type="checkbox" data-design-action="toggle-structure-section" checked={!!x} onChange={e=>e.target.checked?start():set(null)}/> ใช้หน้าตัดเฉพาะบนสะพาน/ในอุโมงค์</label>
    {x&&<div className="design-fields">
      {s.forwardLanes>0&&<NumberField field="structure-forward" label={`ช่องตามทิศที่วาด (ถนน ${s.forwardLanes})`} value={x.forwardLanes} min={s.forwardLanes} max={s.forwardLanes+2} onCommit={forwardLanes=>edit({forwardLanes})}/>}
      {s.backwardLanes>0&&<NumberField field="structure-backward" label={`ช่องทิศสวน (ถนน ${s.backwardLanes})`} value={x.backwardLanes} min={s.backwardLanes} max={s.backwardLanes+2} onCommit={backwardLanes=>edit({backwardLanes})}/>}
      <NumberField field="structure-walk" label={`ทางเท้า (ม.) (ถนน ${s.walk})`} value={x.walk} step={.25} min={0} max={s.walk+5} onCommit={walk=>edit({walk})}/>
      {(s.bands??[]).map(b=>{const v=x.bands?.find(y=>y.type===b.type)?.width??b.width;
        return <NumberField key={b.type} field={`structure-${b.type}`} label={`${BAND_NAME[b.type]??b.type} (ม.) (ถนน ${b.width})`} value={v} step={.25} min={0} max={b.width+5}
          onCommit={width=>edit({bands:[...(x.bands??[]).filter(y=>y.type!==b.type),{type:b.type,width}]})}/>;})}
      <NumberField field="structure-transition" label="ช่วงเปลี่ยนนอกโครงสร้าง (ม.)" value={x.transition} step={1} min={0} max={500} onCommit={transition=>edit({transition})}/>
    </div>}
    <p className="design-meta">ใช้ตลอดช่วงสะพาน/อุโมงค์ของถนนนี้ (ช่วงซ้อนทับบวกระยะเผื่อ 2 ม.) และเปลี่ยนกลับเป็นหน้าตัดถนนนอกโครงสร้าง · เพิ่มช่องได้ไม่เกินสองช่องต่อทิศ · ช่วงเปลี่ยนเป็นค่าที่วาด ยังไม่ได้ตรวจตามเกณฑ์</p>
  </Fold>;
}

/** Mid-block median openings / U-turns along the road (between junction approaches). */
function RoadOpeningBlock({road,compiled,run,onMessage}:{road:Road;compiled:CompileResult;run:Run;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const list=road.openings??[],set=(openings:typeof list)=>run({type:'road.setOpenings',roadId:road.id,openings});
  const add=(type:OpeningType)=>{const r=newRoadOpening(road,compiled,type);if('error' in r){onMessage(r.error,'error');return;}set([...list,r.opening].sort((a,b)=>a.station-b.station));};
  const edit=(id:string,patch:Partial<(typeof list)[number]>)=>set(list.map(o=>o.id===id?{...o,...patch}:o));
  if(road.section.median<=0)return null;
  return <Fold id="road-openings" title="ช่องเปิดเกาะกลางกลางช่วงถนน" summary={list.length?list.map(o=>`${OPENING_LABEL[o.type??'opening']} ${Math.round(o.station)} ม.`).join(' · '):'ยังไม่มี'} data="road-openings">
    {list.map((o,i)=><div key={o.id} className="design-opening" data-design-road-opening={o.id}>
      <header><b>{OPENING_LABEL[o.type??'opening']}</b><button className="link" data-design-action={`remove-road-opening-${i}`} onClick={()=>set(list.filter(x=>x.id!==o.id))}>ลบ</button></header>
      <label className="design-select"><span>ชนิด</span><select value={o.type??'opening'} data-design-field={`road-opening-${i}-type`} onChange={e=>edit(o.id,{type:e.currentTarget.value as OpeningType})}>
        {(Object.keys(OPENING_LABEL) as OpeningType[]).map(t=><option key={t} value={t}>{OPENING_LABEL[t]}</option>)}</select></label>
      <div className="design-fields">
        <NumberField field={`road-opening-${i}-station`} label="เริ่มที่ระยะจากต้นถนน (ม.)" value={o.station} step={.5} min={0} max={roadLength(road)} onCommit={station=>edit(o.id,{station})}/>
        <NumberField field={`road-opening-${i}-length`} label="ความยาวช่องเปิด (ม.)" value={o.length} step={.5} min={2} max={40} onCommit={length=>edit(o.id,{length})}/>
      </div>
    </div>)}
    {list.length<12&&<div className="design-reference-tools">
      <button data-design-action="add-road-opening" onClick={()=>add('opening')}>+ ช่องเปิดเกาะกลาง</button>
      <button data-design-action="add-road-uturn" onClick={()=>add('uturn')}>+ ช่องกลับรถ</button>
    </div>}
    <p className="design-meta">อยู่นอกช่วงเข้าทางแยก · ลากจุดบนแบบเพื่อย้าย · ช่องกลับรถเป็นแนวคิดเบื้องต้น ตรวจรถออกแบบและแนวกวาดเมื่อทำแบบรายละเอียด</p>
  </Fold>;
}

/** The picked road point: curve radius (typed; the plan handle edits the same value), sharp corner, delete. */
/** Drawing direction and straightening (also in the right-click menu). */
function RoadShapeBlock({road,run}:{road:Road;run:Run}){
  const last=road.points.length-1,[from,setFrom]=useState(0),[to,setTo]=useState(last);
  const a=Math.min(from,last),b=Math.min(Math.max(to,0),last),ok=b-a>=2;
  return <details className="design-block design-fold" data-design-fold="road-shape">
    <summary data-design-fold-toggle="road-shape"><span className="design-block-title">แนวถนน</span><small>กลับทิศ · ทำแนวตรง</small></summary>
    <div className="design-actions"><button data-design-action="road-reverse" onClick={()=>run({type:'road.reverse',roadId:road.id})}>{road.role==='ramp'?'กลับทิศเดินรถของทางลาด':'กลับทิศการวาด'}</button></div>
    <p className="design-meta">{road.role==='ramp'?'ทางลาดเป็นทางเดียว: กลับทิศคือกลับทิศเดินรถ ถ้าปลายติดถนนอยู่จะกลับไม่ได้เพราะจะวิ่งสวนทิศ':'รถยังวิ่งตามเดิม จำนวนช่องสลับตามทิศที่วาด ทางแยก ระดับ และช่องเปิดอยู่ที่เดิม'}</p>
    {last>=2&&<>
      <div className="design-grade-fields">
        <label className="design-field"><span>ทำแนวตรงจากจุดที่</span><select value={a} data-design-field="straighten-from" onChange={e=>setFrom(Number(e.target.value))}>{road.points.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        <label className="design-field"><span>ถึงจุดที่</span><select value={b} data-design-field="straighten-to" onChange={e=>setTo(Number(e.target.value))}>{road.points.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
      </div>
      <div className="design-actions"><button data-design-action="road-straighten" disabled={!ok} onClick={()=>run({type:'road.straighten',roadId:road.id,from:a,to:b})}>ทำแนวตรง (ลบจุดระหว่างกลาง {ok?b-a-1:0} จุด)</button></div>
    </>}
  </details>;
}
/** Split the road at this (sharp) point: the touch / keyboard way to "แยกถนนตรงนี้". */
function SplitAtPoint({road,index,run,onPoint}:{road:Road;index:number;run:Run;onPoint:(point:number|undefined)=>void}){
  const {makeIds}=useContext(TemplateContext);
  return <button data-design-action="point-split" onClick={()=>{const [newId]=makeIds(1);if(run({type:'road.split',roadId:road.id,at:road.points[index],newId}).ok)onPoint(undefined);}}>แยกถนนที่จุดนี้</button>;
}
function PointBlock({road,index,run,onPoint}:{road:Road;index:number;run:Run;onPoint:(point:number|undefined)=>void}){
  const curve=vertexCurve(road.points,index),end=index===0||index===road.points.length-1,radius=road.points[index].radius??0;
  return <section className="design-block" data-design-point-block={index}>
    <small className="design-block-title">จุดแนวถนนที่ {index+1} จาก {road.points.length}{end?' (ปลายถนน)':''}</small>
    {curve?<>
      <NumberField field="point-radius" label="รัศมีโค้ง (ม.) · 0 = มุมตรง" value={radius} step={1} min={0} max={road.alignment==='arc'?1e7:MAX_RADIUS} onCommit={v=>run({type:'road.setPointRadius',roadId:road.id,index,radius:v})}/>
      <p className="design-meta" data-design-curve={curve.radius>0?'arc':'corner'}>หักมุม {curve.deflection.toFixed(0)}° · {curve.radius>0?`โค้งยาว ${(curve.radius*curve.deflection*Math.PI/180).toFixed(1)} ม.`:'มุมตรง'} · ช่วงตรงสองข้างรับรัศมีได้ถึง {Math.floor(curve.maxRadius*10+1e-6)/10} ม.</p>
      {radius>curve.radius+.01&&<p className="design-meta design-warning" data-design-curve-capped="true">ใส่รัศมี {radius} ม. แต่ช่วงตรงสั้นเกิน จึงวาดได้ {Math.floor(curve.radius*10+1e-6)/10} ม. — ยืดช่วงตรงหรือลดรัศมี</p>}
    </>:<p className="design-meta">{end?'ปลายถนนทำโค้งไม่ได้':'แนวถนนไม่หักมุมที่จุดนี้ หรือช่วงตรงสั้นเกินไป'}</p>}
    <div className="design-actions">
      {curve&&radius>0&&<button data-design-action="point-sharp" onClick={()=>run({type:'road.setPointRadius',roadId:road.id,index,radius:0})}>ทำเป็นมุมตรง</button>}
      {!end&&!(radius>0)&&<SplitAtPoint road={road} index={index} run={run} onPoint={onPoint}/>}
      <button data-design-action="point-remove" disabled={road.points.length<=2} title={road.points.length<=2?'ถนนต้องมีอย่างน้อยสองจุด':'Delete'} onClick={()=>{if(run({type:'road.removePoint',roadId:road.id,index}).ok)onPoint(undefined);}}>ลบจุดนี้</button>
    </div>
    <p className="design-meta">ลากจุดจับ + บนแบบเข้าด้านในโค้งเพื่อปรับรัศมี · ดับเบิลคลิกบนถนนเพื่อเพิ่มจุด · รัศมีเป็นค่าที่วาด ยังไม่ได้ตรวจกับความเร็วออกแบบ</p>
  </section>;
}

/** Where this road meets other roads: junction or grade separation, with bridge / underpass in one step from here. */
/** How high a generated bridge rises / how deep an underpass goes, from the project's level criteria, and whether they have sources. */
function LevelBasis({project,note}:{project:RoadFirstProject;note?:string}){
  const k=levelCriteria(project.options.levels),sourced=LEVEL_CRITERIA_KEYS.every(x=>hasSource(k[x]));
  return <p className="design-meta" data-design-level-basis={sourced?'sourced':'to-verify'}>
    สะพานยก {bridgeRise(k)} ม. (ช่องลอด {k.clearance.value} + โครงสร้าง {k.deckDepth.value}) · ทางลอดลึก {tunnelDepth(k)} ม. · ลาดถนนหลัก {k.mainGrade.value}% ทางลาด {k.rampGrade.value}%
    {' · '}{sourced?'ตามเกณฑ์ของโครงการ':'บางค่ายังเป็นค่าตั้งต้นของเครื่องมือ ไม่มีแหล่งอ้างอิง (ตั้งได้ที่แผงโครงการ)'}{note?` · ${note}`:''}
  </p>;
}

/** Project level criteria: value and source per criterion; what they give (heights, depths, ramp lengths). */
function LevelCriteriaBlock({project,run}:{project:RoadFirstProject;run:Run}){
  const k=levelCriteria(project.options.levels),stored=project.options.levels??{};
  const missing=LEVEL_CRITERIA_KEYS.filter(x=>!hasSource(k[x])).length;
  const set=(key:LevelCriteriaKey,patch:{value?:number;source?:string})=>run({type:'project.setLevelCriteria',patch:{[key]:{...k[key],...patch}}});
  return <Fold id="level-criteria" title="เกณฑ์ระดับและความชัน" summary={missing?`ยังไม่มีแหล่งอ้างอิง ${missing} ค่า`:'ครบทุกค่า'} data="level-criteria">
    {LEVEL_CRITERIA_KEYS.map(key=><div key={key} className="design-criterion" data-design-criterion={key} data-design-criterion-status={hasSource(k[key])?'sourced':'to-verify'}>
      <NumberField field={`criterion-${key}`} label={LEVEL_CRITERIA_LABEL[key]} value={k[key].value} step={key.endsWith('Grade')?.5:.1} min={LEVEL_CRITERIA_RANGE[key][0]} max={LEVEL_CRITERIA_RANGE[key][1]} onCommit={value=>set(key,{value})}/>
      <TextField label="แหล่งอ้างอิง" value={k[key].source??''} field={`criterion-source-${key}`} allowEmpty maxLength={200} onCommit={source=>set(key,{source})}/>
      {!hasSource(k[key])&&<small className="design-warning">TO_VERIFY · ค่าตั้งต้นของเครื่องมือ ไม่ใช่ค่ามาตรฐาน</small>}
      {stored[key]&&<button className="link" data-design-criterion-reset={key} onClick={()=>run({type:'project.setLevelCriteria',patch:{[key]:null}})}>ค่าเริ่มต้น</button>}
    </div>)}
    <p className="design-meta" data-design-level-derived="true">สะพานชั้นที่ 1 ยก {bridgeRise(k)} ม. · ชั้นที่ 2 ประมาณ {(2*bridgeRise(k)).toFixed(1)} ม. · ทางลอดลึก {tunnelDepth(k)} ม.
      · ทางลาดยก {bridgeRise(k)} ม. ยาวอย่างน้อย {rampLength(bridgeRise(k),k.rampGrade.value/100)} ม. ที่ {k.rampGrade.value}% (ถนนหลัก {rampLength(bridgeRise(k),k.mainGrade.value/100)} ม. ที่ {k.mainGrade.value}%) · ยังไม่รวมโค้งแนวดิ่ง</p>
    <p className="design-meta">ระบบใช้ค่าเหล่านี้ตอนยกสะพาน ทำทางลอด และวาดตามระดับ และเตือนเมื่อแบบต่ำหรือชันกว่าที่ตั้งไว้ว่า “ต้องตรวจตามเกณฑ์” · ใส่ค่าและแหล่งอ้างอิงตามคู่มือที่โครงการใช้</p>
  </Fold>;
}

/** Measured clearance under the structure against the project's value: shown to check, never as a pass / fail. */
function ClearanceLine({crossing,project}:{crossing:CompiledCrossing;project:RoadFirstProject}){
  const m=crossing.clearance;if(!m)return null;
  const k=levelCriteria(project.options.levels),short=m.min!==null&&m.min<k.clearance.value-1e-6;
  return <p className={`design-meta${short?' design-warning':''}`} data-design-clearance={m.min===null?'unknown':m.min} data-design-clearance-structure={m.structure}>
    ช่องลอดต่ำสุดที่วัดได้ {clearanceText(m)} ใต้{m.structure==='tunnel'?'หลังคาอุโมงค์':'สะพาน'} (ลึก {m.depth} ม.) · ค่าที่ตั้งไว้ {k.clearance.value} ม.{hasSource(k.clearance)?'':' (TO_VERIFY)'}
    {m.min===null?' — ต้องตรวจเอง':short?' — ต้องตรวจตามเกณฑ์':''}
  </p>;
}

function RoadCrossingsBlock({road,project,compiled,run,onSelect,onMessage}:{road:Road;project:RoadFirstProject;compiled:CompileResult;run:Run;onSelect:(s:DesignSelection)=>void;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const list=detectCandidates(project.roads).filter(c=>c.roads.some(r=>r.roadId===road.id));
  const {request,review}=useProfileReview(project,run,onMessage);
  if(!list.length)return null;
  const name=(id:string)=>project.roads.find(r=>r.id===id)?.name??id;
  const go=(id:string,kind:'over'|'under')=>request({candidateId:id,roadId:road.id,kind,after:()=>onSelect({kind:'crossing',id})});
  return <section className="design-block" data-design-road-crossings={list.length}>
    {review}<small className="design-block-title">ทางแยกและจุดตัดบนถนนนี้</small>
    {list.map(c=>{
      const others=c.roads.filter(r=>r.roadId!==road.id).map(r=>name(r.roadId)).join(', '),d=project.decisions.find(x=>x.candidateId===c.id);
      const x=compiled.crossings.find(v=>v.candidateId===c.id&&v.roads.includes(road.id));
      const state=d?.decision==='junction'?'ทางแยก':d?.decision==='grade-separated'?(x?.relation==='over'?`${x.over===road.id?'ข้ามไปด้านบน':'ลอดใต้'} · ช่องลอด ${clearanceText(x.clearance)}`:'ต่างระดับ (ยังไม่กำหนด)'):d?.decision==='ignore'?'ไม่ใช่ทางแยก':'ยังไม่ได้เลือก';
      const two=c.kind==='cross'&&c.roads.length===2;
      return <div key={c.id} className="design-crossing-row" data-design-road-crossing={c.id}>
        <button className="design-link" onClick={()=>onSelect(d?.decision==='junction'?{kind:'junction',id:c.id}:{kind:'crossing',id:c.id})}>กับ {others}</button> <span className="design-meta">· {state}</span>
        {two&&<div className="design-reference-tools">
          <button data-design-road-over={c.id} disabled={x?.relation==='over'&&x.over===road.id} onClick={()=>go(c.id,'over')}>ยกข้าม (สะพาน)</button>
          <button data-design-road-under={c.id} disabled={x?.relation==='over'&&x.under===road.id} onClick={()=>go(c.id,'under')}>ลอดใต้</button>
        </div>}
      </div>;})}
    <LevelBasis project={project} note="กดย้อนกลับเพื่อคืนทางแยก"/>
  </section>;
}

/** Ramp ends: where the ramp diverges from / merges into another road, with a way to unhook each end. */
function RampBlock({road,roads,compiled,run}:{road:Road;roads:Road[];compiled:CompileResult;run:Run}){
  const name=(id:string)=>roads.find(r=>r.id===id)?.name??id;
  const ends=(['start','end'] as const).map(end=>({end,a:road.anchors?.[end]}));
  const mapped=automaticRampLaneConnections(roads,compiled).filter(x=>x.rampRoadId===road.id);
  return <section className="design-block" data-design-ramp={road.id}>
    <small className="design-block-title">ทางลาด (ทางเดียวตามทิศที่วาด)</small>
    {ends.map(({end,a})=><p key={end} className="design-meta" data-design-ramp-end={end} data-design-ramp-anchor={a?a.roadId:'none'}>
      {end==='start'?'ต้นทาง: ':'ปลายทาง: '}{a?`${end==='start'?'แยกออกจาก':'เข้าสู่'} ${name(a.roadId)} ที่ระยะ ${a.station.toFixed(1)} ม.`:'ไม่ได้ต่อเข้าข้างถนน'}
      {a&&<> <button className="design-link" data-design-ramp-detach={end} onClick={()=>run({type:'ramp.detach',roadId:road.id,end})}>ปลดออก</button></>}
    </p>)}
    {mapped.map(x=><p key={'map-'+x.end} className="design-meta" data-design-ramp-lane-map={x.end} data-design-ramp-lane-map-status={x.status}>
      {x.status==='mapped'?'จับคู่ช่องแล้ว':'ต้องตรวจการเชื่อมช่อง'} · {x.message} {x.status==='mapped'?'(ระยะช่วงเปลี่ยนยังต้องตรวจตามเกณฑ์)':''}
    </p>)}
    {ends.filter(x=>x.a).map(({end})=>{const lane=road.terminals?.[end],what=end==='start'?'ช่องลดความเร็วก่อนแยกออก':'ช่องเร่งความเร็วหลังเข้าสู่';
      return <div key={'lane-'+end} className="design-opening" data-design-ramp-lane={end}>
        <label className="design-check"><input type="checkbox" checked={!!lane} data-design-ramp-lane-toggle={end} onChange={e=>run({type:'ramp.setLane',roadId:road.id,end,lane:e.currentTarget.checked?{...AUX_LANE_DEFAULTS}:null})}/> {what} (แบบขนาน)</label>
        {lane&&<div className="design-fields">
          <NumberField field={`ramp-lane-${end}-length`} label="ช่วงเต็มช่อง (ม.)" value={lane.length} step={5} min={10} max={1000} onCommit={length=>run({type:'ramp.setLane',roadId:road.id,end,lane:{...lane,length}})}/>
          <NumberField field={`ramp-lane-${end}-taper`} label="ช่วงเปลี่ยน (ม.)" value={lane.taper} step={5} min={0} max={300} onCommit={taper=>run({type:'ramp.setLane',roadId:road.id,end,lane:{...lane,taper}})}/>
        </div>}
      </div>;})}
    {ends.some(x=>x.a)&&<p className="design-meta">ช่องเสริมอยู่บนถนนหลักฝั่งทิศจราจรของทางลาด ทางลาดต่อจากช่องนั้นโดยตรง · ช่องเสริมของทางเข้าและทางออกที่ต่อกันรวมเป็นช่องต่อเนื่อง · ความยาวเป็นค่าที่วาด (ค่าเริ่มต้นของเครื่องมือ) ยังไม่ได้ตรวจตามเกณฑ์</p>}
    <p className="design-meta">ลากจุดปลายไปตามข้างถนนเพื่อเลื่อนจุดเชื่อม · ลากออกห่างเพื่อปลด · ช่วงเปลี่ยน {RAMP_RULES.taper} ม. และมุมสูงสุด {RAMP_RULES.maxAngle}° เป็นค่าของเครื่องมือ ยังไม่ได้ตรวจกับมาตรฐาน</p>
  </section>;
}

function RoadInspector({road,point,onPoint,run,onDeleted,roads,compiled,onMessage,project,onSelect}:{project:RoadFirstProject;onSelect:(s:DesignSelection)=>void;road:Road;point?:number;onPoint:(point:number|undefined)=>void;run:Run;onDeleted:()=>void;roads:Road[];compiled:CompileResult;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const s=road.section,set=(patch:Partial<RoadSection>)=>run({type:'road.setSection',roadId:road.id,patch});
  const length=stations(road.points,road.alignment).at(-1)??0;
  const [armed,setArmed]=useState(false);
  return <>
    <header className="design-inspector-head"><small>{road.role==='access'?'ทางเข้าโครงการ':road.role==='ramp'?'ทางลาด':'ถนน'}</small><TextField label="ชื่อ" value={road.name} field="road-name" onCommit={name=>run({type:'road.rename',roadId:road.id,name})}/></header>
    {point!==undefined&&point<road.points.length&&<PointBlock road={road} index={point} run={run} onPoint={onPoint}/>}
    <RoadShapeBlock road={road} run={run}/>
    <RoadCrossingsBlock road={road} project={project} compiled={compiled} run={run} onSelect={onSelect} onMessage={onMessage}/>
    <TemplatePiecesBlock project={project} roadId={road.id} run={run} onSelectRoad={id=>onSelect({kind:'road',id})}/>
    <UturnBridgePanel key={road.id} project={project} road={road} run={run} onPlaced={id=>onSelect({kind:'road',id})}/>
    {road.role==='ramp'&&<RampBlock road={road} roads={roads} compiled={compiled} run={run}/>}
    {road.role!=='ramp'&&<label className="design-check" title="ถนนที่ไปบรรจบไหลต่อเนื่อง ไม่มีเส้นหยุดหรือทางข้าม ทางเข้ามีเส้นหยุดให้ทาง"><input type="checkbox" checked={road.role==='access'} data-design-road-role="access" onChange={e=>run({type:'road.setRole',roadId:road.id,role:e.currentTarget.checked?'access':null})}/> ทางเข้าโครงการ (driveway)</label>}
    <PresetPicker label="หน้าตัดสำเร็จรูป" value={matchingPreset(s)} onPick={id=>set(presetSection(id))}/>
    <div className="design-fields">
      <NumberField field="forward-lanes" label="ช่องจราจรตามทิศที่วาด" value={s.forwardLanes} min={0} max={4} onCommit={v=>set({forwardLanes:v})}/>
      <NumberField field="backward-lanes" label="ช่องจราจรทิศสวน" value={s.backwardLanes} min={0} max={4} onCommit={v=>set({backwardLanes:v})}/>
      <NumberField field="lane-width" label="ความกว้างช่องจราจร (ม.)" value={s.laneWidth} step={.05} min={2.5} max={4.5} onCommit={v=>set({laneWidth:v})}/>
      <NumberField field="median" label="เกาะกลาง (ม.)" value={s.median} step={.5} min={0} max={12} onCommit={v=>set({median:v})}/>
      <NumberField field="walk" label="ทางเท้า ทั้งสองข้าง (ม.)" value={s.walk} step={.25} min={0} max={8} onCommit={v=>set({walk:v})}/>
    </div>
    <BandsEditor bands={s.bands??[]} onChange={bands=>set({bands})}/>
    <section className="design-block" data-design-roadside={road.roadside?'on':'off'}>
      <small className="design-block-title">ต้นไม้และเสาไฟริมทางเท้า</small>
      {road.section.walk<.75?<p className="design-meta">ทางเท้าแคบกว่า 0.75 ม. จึงไม่วางต้นไม้หรือเสาไฟ</p>:<div className="design-reference-tools">
        {(['trees','lights'] as const).map(k=><label key={k} className="design-check"><input type="checkbox" data-design-field={`roadside-${k}`} checked={!!road.roadside?.[k]}
          onChange={e=>run({type:'road.setRoadside',roadId:road.id,roadside:{trees:!!road.roadside?.trees,lights:!!road.roadside?.lights,[k]:e.currentTarget.checked}})}/> {k==='trees'?'ต้นไม้':'เสาไฟ'}</label>)}
      </div>}
      <p className="design-meta">ทั้งสองฝั่ง ทุก 15 ม. รวมช่วงเข้าทางแยกของถนนนี้ (ค่าตั้งต้นของเครื่องมือ)</p>
    </section>
    <RoadOpeningBlock road={road} compiled={compiled} run={run} onMessage={onMessage}/>
    <LaneRunBlock road={road} compiled={compiled} run={run} onMessage={onMessage}/>
    {road.role!=='ramp'&&<StretchBlock road={road} compiled={compiled} run={run} onMessage={onMessage}/>}
    <StructureSectionBlock road={road} compiled={compiled} run={run}/>
    <ProfileBlock road={road} run={run}/>
    {endJoins(roads).filter(j=>j.a===road.id||j.b===road.id).map(j=>{const other=roads.find(r=>r.id===(j.a===road.id?j.b:j.a));if(!other)return null;
      return <div key={other.id} className="design-issues" data-design-join-offer={other.id}><b>ปลายถนนชนกับ {other.name}</b>
        <p className="design-meta">ตอนนี้เป็นถนนคนละเส้นแม้จะดูต่อกัน · เชื่อมแล้วจะใช้ชื่อและหน้าตัดของ {road.name}</p>
        <button className="link" data-design-action="join-road" onClick={()=>run({type:'road.join',roadId:road.id,otherId:other.id})}>เชื่อมเป็นถนนเดียว</button></div>;})}
    <p className="design-meta">ยาว {length.toFixed(1)} ม. · {road.points.length} จุดแนว · ดับเบิลคลิกบนแนวถนนเพื่อเพิ่มจุด</p>
    <div className="design-actions">
      <button className="danger" data-design-action="delete-road" onClick={()=>{if(!armed){setArmed(true);return;}if(run({type:'road.remove',roadId:road.id}).ok)onDeleted();}}>{armed?'กดอีกครั้งเพื่อลบถนน':'ลบถนน'}</button>
    </div>
  </>;
}

/** Preview a reversible change of topology before committing a single undoable command. */
function RestoreJunctionReview({candidate,project,before,run,onConfirm,onCancel}:{
  candidate:Candidate;project:RoadFirstProject;before:RoadFirstProject;run:Run;onConfirm:()=>void;onCancel:()=>void;
}){
  const cmd:RoadFirstCommand={type:'crossing.decide',candidateId:candidate.id,decision:'junction'};
  const result=executeCommand(project,cmd),stale=before!==project;
  const owner=project.decisions.find(d=>d.candidateId===candidate.id)?.profileOwner;
  const count=owner?project.roads.reduce((sum,r)=>sum+(r.profile??[]).filter(q=>q.generatedBy===owner).length,0):0;
  return <section className="design-block" data-design-restore-junction-review="true">
    <small className="design-block-title">ตรวจก่อนคืนเป็นทางแยกระดับดิน</small>
    <p className="design-meta">จะลบเฉพาะจุดแนวดิ่งที่ระบบสร้างสำหรับสะพาน/ทางลอดจุดนี้ {count} จุด และคืนรายละเอียดทางแยกที่ยังเก็บไว้ ไม่เปลี่ยนแนวถนนหรือจุดระดับที่กำหนดเอง</p>
    <div className="design-grade-fields">
      {candidate.roads.map(ref=>{
        const road=project.roads.find(r=>r.id===ref.roadId),after=result.project.roads.find(r=>r.id===ref.roadId);
        return road&&after?<p key={ref.roadId} className="design-meta" data-design-restored-level={ref.roadId}>
          {road.name}: ก่อน {levelAt(road.profile,ref.station).toFixed(2)} ม. → หลัง {levelAt(after.profile,ref.station).toFixed(2)} ม.
        </p>:null;
      })}
    </div>
    {project.decisions.find(d=>d.candidateId===candidate.id)?.treatments
      ?<p className="design-meta">รายละเอียดขาทางแยกที่เคยกำหนดไว้จะกลับมาใช้ หากไม่สอดคล้องกับถนนปัจจุบัน ระบบจะปฏิเสธหรือแจ้งรายการให้ตรวจ</p>
      :<p className="design-meta">ไม่พบรายละเอียดทางแยกเดิมในไฟล์นี้ หากเคยถูกลบโดยโปรแกรมรุ่นก่อนจะไม่สร้างข้อมูลนั้นขึ้นเอง</p>}
    {stale&&<p className="design-warning" role="alert">โครงการเปลี่ยนระหว่าง Preview — ปิดและเลือกใหม่</p>}
    {result.error&&<p className="design-warning" role="alert" data-design-restore-junction-error>{result.error}</p>}
    <div className="design-actions">
      <button data-design-restore-junction-cancel onClick={onCancel}>ยกเลิก</button>
      <button className="primary" data-design-restore-junction-confirm disabled={!!result.error||stale}
        onClick={()=>{if(!stale&&!result.error&&run(cmd).ok)onConfirm();}}>ยืนยันคืนทางแยก (Undo ได้หนึ่งครั้ง)</button>
    </div>
  </section>;
}

function CrossingInspector({candidate,project,compiled,run,onConfirmed,onMessage,onPlacedDiamond}:{candidate:Candidate;project:RoadFirstProject;compiled:CompileResult;run:Run;onConfirmed:()=>void;onMessage:(text:string,kind?:'info'|'error')=>void;onPlacedDiamond:()=>void}){
  const {request,review}=useProfileReview(project,run,onMessage);
  const [restoreBefore,setRestoreBefore]=useState<RoadFirstProject|null>(null);
  const names=candidate.roads.map(r=>project.roads.find(x=>x.id===r.roadId)?.name??r.roadId),d=project.decisions.find(x=>x.candidateId===candidate.id);
  const state=d?.decision==='grade-separated'?'ทางต่างระดับ':d?.decision==='ignore'?'ไม่ใช่ทางแยก':'ยังเป็นทางแยกไม่ได้';
  return <>
    {review}{restoreBefore&&<RestoreJunctionReview candidate={candidate} project={project} before={restoreBefore} run={run}
      onConfirm={onConfirmed} onCancel={()=>setRestoreBefore(null)}/>}<header className="design-inspector-head"><small>จุดตัดของถนน</small><b>{names.join(' × ')}</b><span className="design-state">{state}</span></header>
    {d?.decision==='grade-separated'&&(()=>{const x=compiled.crossings.find(v=>v.candidateId===candidate.id),name=(id?:string)=>project.roads.find(r=>r.id===id)?.name??'';
      return <section className="design-block" data-design-crossing-relation={x?.relation??'unresolved'}>
        <small className="design-block-title">ถนนไหนอยู่บน</small>
        <p className="design-meta">{x?.relation==='over'?`${name(x.over)} อยู่บน · ต่างระดับที่แนวกึ่งกลาง ${x.gap.toFixed(1)} ม.`:'ยังไม่กำหนด · ถนนสองสายอยู่ระดับเดียวกันที่จุดนี้'}</p>
        {x?.relation==='over'&&<ClearanceLine crossing={x} project={project}/>}
        <UturnUnderAction project={project} compiled={compiled} candidateId={candidate.id} run={run} onMessage={onMessage}/>
        <div className="design-reference-tools" role="radiogroup" aria-label="ถนนไหนอยู่บน">
          {candidate.roads.map(r=><button key={r.roadId} role="radio" aria-checked={x?.over===r.roadId} className={x?.over===r.roadId&&x.relation==='over'?'active':''} data-design-over={r.roadId}
            onClick={()=>request({candidateId:candidate.id,roadId:r.roadId,kind:'over'})}>{name(r.roadId)} อยู่บน</button>)}
        </div>
        <small className="design-block-title">หรือกดถนนลงเป็นทางลอด</small>
        <div className="design-reference-tools" aria-label="กดถนนลงเป็นทางลอด">
          {candidate.roads.map(r=><button key={r.roadId} data-design-under={r.roadId}
            onClick={()=>request({candidateId:candidate.id,roadId:r.roadId,kind:'under'})}>{name(r.roadId)} ลอดใต้</button>)}
        </div>
        <LevelBasis project={project} note="ทางลอด: ช่วงทางลาดเป็นร่องเปิดมีกำแพงกันดิน ใต้ถนนที่ข้ามเป็นอุโมงค์ · ถนนที่สูงหรือต่ำพออยู่แล้วไม่ถูกปรับ · แก้ต่อได้ที่แนวดิ่งของถนน"/>
      </section>;})()}
    <DiamondPanel project={project} candidateId={candidate.id} run={run} onPlaced={onPlacedDiamond}/>
    <p className="design-meta">{d?.decision==='grade-separated'
      ?compiled.crossings.some(x=>x.candidateId===candidate.id&&x.relation==='over')
        ?'จุดนี้ถนนข้ามกันต่างระดับ หากต้องการคืนทางแยกระดับดินให้ตรวจ Preview ก่อนยืนยัน'
        :'ยังไม่ได้สร้างสะพานหรือทางลอดจริง ต้องเลือกถนนด้านบน/ล่างและวางแนวดิ่งก่อน'
      :'ระบบสร้างทางแยกที่จุดนี้ไม่ได้ ดูเหตุผลที่แถบด้านล่าง หรือปรับแนวถนนแล้วลองใหม่'}</p>
    <div className="design-actions">
      <button className="primary" data-design-action="confirm-junction" onClick={()=>{
        if(d?.decision==='grade-separated'){setRestoreBefore(project);return;}
        if(run({type:'crossing.decide',candidateId:candidate.id,decision:'junction',name:d?.name??`แยก ${names.join(' × ')}`}).ok)onConfirmed();
      }}>{d?.decision==='grade-separated'?'ตรวจและคืนค่าเป็นทางแยก':'ทำเป็นทางแยก'}</button>
      <button data-design-action="grade-separated" disabled={d?.decision==='grade-separated'}
        onClick={()=>run({type:'crossing.decide',candidateId:candidate.id,decision:'grade-separated'})}>กำหนดเป็นจุดตัดต่างระดับ (รอเลือกระดับ)</button>
      <button data-design-action="ignore" onClick={()=>run({type:'crossing.decide',candidateId:candidate.id,decision:'ignore'})}>ไม่ใช่ทางแยก</button>
    </div>
  </>;
}

const legLabel=(project:RoadFirstProject,leg:LegKey)=>{const l=parseLegKey(leg);return l?`${project.roads.find(r=>r.id===l.roadId)?.name??l.roadId} ${l.side==='ahead'?'→':'←'}`:leg;};

/** Turn pocket on an approach: an add button until it exists, then its sizes typed in place. */
function PocketBlock({info,side,run,title}:{info:ApproachInfo;side:PocketSide;run:Run;title:string}){
  const p=info.arm.incomingPockets?.[side],set=(patch:Parameters<typeof pocketTreatment>[2])=>run({type:'leg.setTreatment',candidateId:info.candidateId,leg:info.leg,patch:pocketTreatment(info.arm,side,patch)});
  if(!p?.lanes&&side==='left'&&info.slip)return <p className="design-meta" data-design-blocked="left-pocket">เลนเลี้ยวซ้าย: ปากทางนี้มี Slip lane เลี้ยวซ้ายแล้ว ใช้ช่องชะลอก่อนเข้า Slip แทน</p>;
  if(!p?.lanes)return <button data-design-action={`add-${side}-pocket`} onClick={()=>set({})}>+ {title}</button>;
  return <section className="design-block" data-design-pocket={side}>
    <header><b>{title}</b><button className="link" data-design-action={`remove-${side}-pocket`} onClick={()=>set(null)}>ลบ</button></header>
    <div className="design-fields">
      <NumberField field={`${side}-lanes`} label="จำนวนช่อง" value={p.lanes} min={1} max={3} onCommit={lanes=>set({lanes})}/>
      <NumberField field={`${side}-width`} label="ความกว้างช่อง (ม.)" value={p.width??info.arm.incomingSection?.width??info.arm.width} step={.05} min={2.5} max={4.5} onCommit={width=>set({width})}/>
      <NumberField field={`${side}-length`} label="ระยะเก็บรถ (ม.)" value={p.length} min={5} max={140} onCommit={length=>set({length})}/>
      <NumberField field={`${side}-taper`} label="ระยะ taper (ม.)" value={p.taper} min={5} max={80} onCommit={taper=>set({taper})}/>
    </div>
  </section>;
}

/** Pedestrian crossing, stop line and signal of one approach (leg treatment: crossing, crossOffset, stop, stopOffset, signal). */
function ControlBlock({info,run}:{info:ApproachInfo;run:Run}){
  const a=info.arm,set=(patch:Partial<Pick<typeof a,'crossing'|'crossOffset'|'stop'|'stopOffset'|'signal'>>)=>run({type:'leg.setTreatment',candidateId:info.candidateId,leg:info.leg,patch});
  return <Fold id="controls" title="ทางม้าลาย เส้นหยุด และสัญญาณไฟ" summary={[a.crossing?'มีทางม้าลาย':'ไม่มีทางม้าลาย',a.incoming>0?(a.stop?'เส้นหยุด':'ไม่มีเส้นหยุด'):'',a.incoming>0?(a.signal?'สัญญาณไฟ':'ไม่มีสัญญาณไฟ'):''].filter(Boolean).join(' · ')} data="controls">
    <label className="design-check"><input type="checkbox" checked={a.crossing} data-design-field="crossing" onChange={e=>set({crossing:e.currentTarget.checked})}/> ทางม้าลายข้ามปากทางนี้</label>
    {a.crossing&&<NumberField field="cross-offset" label="ร่นทางม้าลายจากปากแยก (ม.)" value={a.crossOffset} step={.5} min={0} max={35} onCommit={crossOffset=>set({crossOffset})}/>}
    {a.incoming>0?<>
      <label className="design-check"><input type="checkbox" checked={a.stop} data-design-field="stop" onChange={e=>set({stop:e.currentTarget.checked})}/> เส้นหยุด</label>
      {a.stop&&<NumberField field="stop-offset" label="ร่นเส้นหยุดจากปากแยก (ม.)" value={a.stopOffset} step={.5} min={0} max={35} onCommit={stopOffset=>set({stopOffset})}/>}
      <label className="design-check"><input type="checkbox" checked={a.signal} data-design-field="signal" onChange={e=>set({signal:e.currentTarget.checked})}/> สัญญาณไฟจราจร</label>
    </>:<p className="design-meta">ปากทางนี้ไม่มีช่องจราจรขาเข้า จึงไม่มีเส้นหยุดหรือสัญญาณไฟ</p>}
  </Fold>;
}

/** Arrow of each incoming lane on this approach (main lanes from the median side, then turn-pocket lanes). */
function ArrowBlock({info,run}:{info:ApproachInfo;run:Run}){
  const a=info.arm;if(!a.incoming)return null;
  const set=(role:'main'|'aux-left'|'aux-right',i:number,code:LaneArrowCode)=>run({type:'leg.setTreatment',candidateId:info.candidateId,leg:info.leg,patch:{laneMarkings:withLaneArrow(a,'incoming',role,i,code)}});
  const lanes:{role:'main'|'aux-left'|'aux-right';i:number;label:string}[]=[
    ...Array.from({length:a.incoming},(_,i)=>({role:'main' as const,i,label:`ช่อง ${i+1}${i===0?' (ชิดเกาะกลาง)':''}`})),
    ...Array.from({length:a.incomingPockets?.right.lanes??0},(_,i)=>({role:'aux-right' as const,i,label:`เลนเลี้ยวขวา ${i+1}`})),
    ...Array.from({length:a.incomingPockets?.left.lanes??0},(_,i)=>({role:'aux-left' as const,i,label:`เลนเลี้ยวซ้าย ${i+1}`})),
  ];
  const mode=a.dividerMode??'solid',solid=a.solidLength??36;
  return <Fold id="arrows" title="เส้นแบ่งเลนและลูกศรขาเข้า" summary={lanes.map(l=>ARROW_OPTIONS[laneArrowFor(a,'incoming',l.role,l.i)]).join(' | ')} data="arrows">
    {a.incoming>1&&<><label className="design-select"><span>เส้นแบ่งเลน</span>
      <select value={mode} data-design-field="divider-mode" onChange={e=>run({type:'leg.setTreatment',candidateId:info.candidateId,leg:info.leg,patch:{dividerMode:e.currentTarget.value as 'solid'|'dashed'}})}>
        <option value="solid">เส้นทึบ ต่อด้วยเส้นประ</option><option value="dashed">เส้นประตลอด</option></select></label>
      {mode==='solid'&&<NumberField field="solid-length" label="ความยาวเส้นทึบ (ม.)" value={solid} min={1} max={100} onCommit={solidLength=>run({type:'leg.setTreatment',candidateId:info.candidateId,leg:info.leg,patch:{solidLength}})}/>}</>}
    {lanes.map(l=><label key={l.role+l.i} className="design-select"><span>{l.label}</span>
      <select value={laneArrowFor(a,'incoming',l.role,l.i)} data-design-field={`arrow-${l.role}-${l.i}`} onChange={e=>set(l.role,l.i,e.currentTarget.value as LaneArrowCode)}>
        {(Object.entries(ARROW_OPTIONS) as [LaneArrowCode,string][]).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>)}
  </Fold>;
}

const OPENING_LABEL:Record<OpeningType,string>={opening:'ช่องเปิดเกาะกลาง',uturn:'ช่องกลับรถ'};
/** Median openings on this approach: add, type, position from the mouth, length, remove; the plan handle moves the same start. */
function OpeningBlock({info,run,onMessage}:{info:ApproachInfo;run:Run;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const list=openingsOf(info.arm),set=(next:typeof list)=>run({type:'leg.setTreatment',candidateId:info.candidateId,leg:info.leg,patch:openingsPatch(next)});
  const add=(type:OpeningType)=>{const r=newOpening(info,type);if('error' in r){onMessage(r.error,'error');return;}set([...list,r.opening]);};
  const edit=(id:string,patch:Partial<(typeof list)[number]>)=>set(list.map(o=>o.id===id?{...o,...patch}:o));
  if(info.arm.median<=0)return <p className="design-meta" data-design-blocked="opening">ช่องเปิดเกาะกลาง: ถนนช่วงนี้ไม่มีเกาะกลาง</p>;
  return <Fold id="openings" title="ช่องเปิดเกาะกลาง" summary={list.length?list.map(o=>`${OPENING_LABEL[o.type??'opening']} ${o.start} ม.`).join(' · '):'ยังไม่มี'} data="openings">
    {list.map((o,i)=><div key={o.id} className="design-opening" data-design-opening={o.id}>
      <header><b>{OPENING_LABEL[o.type??'opening']}</b><button className="link" data-design-action={`remove-opening-${i}`} onClick={()=>set(list.filter(x=>x.id!==o.id))}>ลบ</button></header>
      <label className="design-select"><span>ชนิด</span><select value={o.type??'opening'} data-design-field={`opening-${i}-type`} onChange={e=>edit(o.id,{type:e.currentTarget.value as OpeningType})}>
        {(Object.keys(OPENING_LABEL) as OpeningType[]).map(t=><option key={t} value={t}>{OPENING_LABEL[t]}</option>)}</select></label>
      <div className="design-fields">
        <NumberField field={`opening-${i}-start`} label="ระยะจากปากทาง (ม.)" value={o.start} step={.5} min={0} max={500} onCommit={start=>edit(o.id,{start})}/>
        <NumberField field={`opening-${i}-length`} label="ความยาวช่องเปิด (ม.)" value={o.length} step={.5} min={2} max={40} onCommit={length=>edit(o.id,{length})}/>
      </div>
    </div>)}
    {list.length<8&&<div className="design-reference-tools">
      <button data-design-action="add-opening" onClick={()=>add('opening')}>+ ช่องเปิดเกาะกลาง</button>
      <button data-design-action="add-uturn" onClick={()=>add('uturn')}>+ ช่องกลับรถ</button>
    </div>}
    {list.some(o=>o.type==='uturn')&&<p className="design-meta">ช่องกลับรถเป็นแนวคิดเบื้องต้น · ตรวจรถออกแบบและแนวกวาดเมื่อทำแบบรายละเอียด</p>}
  </Fold>;
}

function SlipBlock({info,project,run}:{info:ApproachInfo;project:RoadFirstProject;run:Run}){
  if(!info.slipTo)return null;
  const target=legLabel(project,info.slipTo),s=info.slip;
  if(!s&&(info.arm.incomingPockets?.left.lanes??0)>0)return <p className="design-meta" data-design-blocked="slip">Slip lane: ปากทางนี้มีเลนเลี้ยวซ้ายแล้ว ลบเลนเลี้ยวซ้ายก่อนถ้าต้องการใช้ Slip lane</p>;
  if(!s)return <button data-design-action="add-slip" onClick={()=>{
    const slip=newSlip(info,x=>!executeCommand(project,{type:'slip.set',candidateId:info.candidateId,slip:x}).error);
    if(slip)run({type:'slip.set',candidateId:info.candidateId,slip});
  }}>+ Slip lane ไป {target}</button>;
  const set=(patch:Parameters<typeof slipPatch>[1])=>{const slip=slipPatch(info,patch);if(slip)run({type:'slip.set',candidateId:info.candidateId,slip});};
  const aux=s.approach.mode==='auxiliary'?s.approach:null;
  return <section className="design-block" data-design-slip="true">
    <header><b>Slip lane ไป {target}</b><button className="link" data-design-action="remove-slip" onClick={()=>run({type:'slip.remove',candidateId:info.candidateId,from:info.leg})}>ลบ</button></header>
    <div className="design-fields">
      <NumberField field="slip-width" label="ความกว้าง (ม.)" value={s.width} step={.25} min={3} max={6} onCommit={width=>set({width})}/>
      <NumberField field="slip-radius" label="รัศมี (ม.)" value={s.radius} min={10} max={60} onCommit={radius=>set({radius})}/>
      {aux&&<>
        <NumberField field="slip-aux-width" label="ช่องชะลอ กว้าง (ม.)" value={aux.width} step={.05} min={2.5} max={4.5} onCommit={width=>set({approach:{...aux,width}})}/>
        <NumberField field="slip-aux-storage" label="ช่องชะลอ ยาว (ม.)" value={aux.storage} min={5} max={140} onCommit={storage=>set({approach:{...aux,storage}})}/>
        <NumberField field="slip-aux-taper" label="ช่องชะลอ taper (ม.)" value={aux.taper} min={5} max={80} onCommit={taper=>set({approach:{...aux,taper}})}/>
      </>}
    </div>
    <button className="link" data-design-action={aux?'remove-slip-aux':'add-slip-aux'} onClick={()=>set({approach:aux?{mode:'direct'}:{mode:'auxiliary',width:s.width>4.5?4.5:Math.max(2.5,s.width),storage:30,taper:20}})}>{aux?'ไม่ใช้ช่องชะลอก่อนเข้า Slip':'+ ช่องชะลอก่อนเข้า Slip'}</button>
  </section>;
}

function ApproachInspector({candidateId,leg,project,compiled,run,onSelect,onMessage}:{candidateId:string;leg:LegKey;project:RoadFirstProject;compiled:CompileResult;run:Run;onSelect:(s:DesignSelection)=>void;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const info=approachInfo(compiled,candidateId,leg),d=project.decisions.find(x=>x.candidateId===candidateId);
  if(!info)return <p className="design-meta">ไม่พบปากทางนี้แล้ว</p>;
  return <>
    <header className="design-inspector-head"><small>ปากทาง · {d?.name??info.junction.name}</small><b>{legLabel(project,leg)}</b>
      <button className="link" data-design-action="back-to-junction" onClick={()=>onSelect({kind:'junction',id:candidateId})}>← ทางแยกทั้งหมด</button></header>
    <PocketBlock info={info} side="right" run={run} title="เลนเลี้ยวขวา"/>
    <PocketBlock info={info} side="left" run={run} title="เลนเลี้ยวซ้าย"/>
    <SlipBlock info={info} project={project} run={run}/>
    <ControlBlock info={info} run={run}/>
    <ArrowBlock info={info} run={run}/>
    <OpeningBlock info={info} run={run} onMessage={onMessage}/>
    <p className="design-meta">ลากจุดบนแบบเพื่อปรับระยะเก็บรถ ตำแหน่งช่องเปิด และรัศมีมุมได้ · ขนาดเริ่มต้นเป็นค่าตั้งต้นของเครื่องมือ ไม่ใช่ค่ามาตรฐาน ควรตรวจกับแนวทางออกแบบที่ใช้</p>
    <div className="design-actions">
      <button data-design-action="reset-approach" onClick={()=>run({type:'leg.reset',candidateId,leg})}>คืนค่าเริ่มต้นของปากทางนี้</button>
    </div>
  </>;
}

function JunctionInspector({candidateId,project,compiled,run,onSelect,onAdvanced,onMessage}:{candidateId:string;project:RoadFirstProject;compiled:CompileResult;run:Run;onSelect:(s:DesignSelection)=>void;onAdvanced:(candidateId:string)=>void;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const d=project.decisions.find(x=>x.candidateId===candidateId),jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  const j=compiled.project.junctions.find(x=>x.id===jid);
  const [armed,setArmed]=useState(false);
  const [connectorTarget,setConnectorTarget]=useState<Record<string,string>>({});
  const {request,review}=useProfileReview(project,run,onMessage);
  if(!d||!j)return <p className="design-meta">ไม่พบทางแยกนี้แล้ว</p>;
  const approaches=junctionApproaches(compiled,candidateId);
  const bindings=compiled.legs.filter(x=>x.junctionId===jid).map(x=>({armId:x.armId,leg:legKey(x.roadId,x.side)}));
  const mapping=resolveConnectorOverrides(j.design,bindings,d.treatments?.connectors??[]);
  const legOf=(armId:number)=>bindings.find(x=>x.armId===armId)?.leg;
  const fromRef=(c:{from:AutoLaneEndpoint}):ConnectorLaneRef|null=>{
    const leg=legOf(c.from.armId);return leg?{leg,role:c.from.role,laneIndex:c.from.laneIndex}:null;
  };
  const targets=(c:{from:AutoLaneEndpoint;movement:'left'|'through'|'right'})=>
    eligibleTurnTargets(j.design,c.from.armId,c.movement).flatMap(armId=>{
      const leg=legOf(armId);return leg?configuredArrowLanes(j.design.arms[armId],'outgoing').map(l=>{
        const ref:ConnectorLaneRef={leg,role:l.role,laneIndex:l.laneIndex};
        return {ref,value:JSON.stringify(ref),label:legLabel(project,leg)+' · '+(l.role==='main'?'ช่องหลัก ':l.role==='aux-left'?'ช่องริมขอบทาง ':'ช่องชิดเกาะกลาง ')+(l.laneIndex+1)};
      }):[];
    });
  const laneName=(lane:AutoLaneEndpoint)=>{
    const leg=compiled.legs.find(x=>x.junctionId===jid&&x.armId===lane.armId);
    const roadName=leg?legLabel(project,legKey(leg.roadId,leg.side)):'ขาที่ '+(lane.armId+1);
    const side=lane.role==='main'?'ช่องหลัก ':lane.role==='aux-left'?'ช่องริมขอบทาง ':'ช่องชิดเกาะกลาง ';
    return roadName+' · '+side+(lane.laneIndex+1);
  };
  // Two roads crossing: make it a bridge or an underpass from here in one step (one undo brings the junction back).
  const crossing=detectCandidates(project.roads).find(c=>c.id===candidateId),two=crossing?.kind==='cross'&&crossing.roads.length===2&&(d.roads?.length??2)===2;
  const rname=(id:string)=>project.roads.find(r=>r.id===id)?.name??id;
  const separate=(roadId:string,kind:'over'|'under')=>request({candidateId,roadId,kind,after:()=>onSelect({kind:'crossing',id:candidateId})});
  return <>{review}
    <header className="design-inspector-head"><small>ทางแยก</small><TextField label="ชื่อ" value={d.name??j.name} field="junction-name" onCommit={name=>run({type:'junction.rename',candidateId,name})}/></header>
    {two&&<DiamondPanel project={project} candidateId={candidateId} run={run} onPlaced={()=>onSelect({kind:'crossing',id:candidateId})}/>}
    {two&&<Fold id="junction-grade" title="ทำเป็นทางต่างระดับ (สะพาน / ทางลอด)" summary="ไม่มีทางแยก ถนนผ่านข้ามกัน" data="junction-grade">
      <div className="design-reference-tools">
        {crossing!.roads.map(r=><button key={'o'+r.roadId} data-design-junction-over={r.roadId} onClick={()=>separate(r.roadId,'over')}>{rname(r.roadId)} ข้าม (สะพาน)</button>)}
        {crossing!.roads.map(r=><button key={'u'+r.roadId} data-design-junction-under={r.roadId} onClick={()=>separate(r.roadId,'under')}>{rname(r.roadId)} ลอดใต้</button>)}
      </div>
      <LevelBasis project={project} note="การตั้งค่าของทางแยกนี้จะไม่ใช้แล้ว กดย้อนกลับเพื่อคืนทางแยก · ยกหรือลดระดับถนนเองในแนวดิ่งก็ได้ ระบบจะเปลี่ยนเป็นทางต่างระดับให้"/>
    </Fold>}
    {(d.roads??[]).some(id=>project.roads.find(r=>r.id===id)?.role==='access')&&<p className="design-meta" data-design-access-junction="true">ทางเข้าโครงการ: ถนนหลักไหลต่อเนื่อง ไม่มีเส้นหยุด ทางข้าม หรือสัญญาณไฟ · ทางเข้ามีเส้นหยุดให้ทาง (ค่าเริ่มต้นแนวคิด)</p>}
    {j.design.type!=='roundabout'&&<Fold id="automatic-lane-mapping" title="การเชื่อมช่องจราจรอัตโนมัติ"
      summary={mapping.connections.length+' ทางเชื่อม'+(mapping.issues.length?' · ให้ตรวจ '+mapping.issues.length+' รายการ':'')}
      data="automatic-lane-mapping">
      <p className="design-meta">จับคู่ช่องตามทิศทางจราจรชิดซ้าย · เปลี่ยนช่องรับ ปิดการเชื่อม หรือคืนค่าอัตโนมัติได้ การเชื่อมเป็นแนวคิด ไม่ใช่แนวกวาดรถหรือการตรวจความจุ</p>
      <div data-design-lane-connection-count={mapping.connections.length}>
        {mapping.connections.map(c=>{const from=fromRef(c),available=targets(c),toLeg=legOf(c.to.armId);
          const current=JSON.stringify({leg:toLeg,role:c.to.role,laneIndex:c.to.laneIndex});
          const selected=connectorTarget[c.id]??current;
          return <div key={c.id} className="design-opening" data-design-lane-connection={c.movement} data-design-connector-origin={c.origin}>
            <p className="design-meta">{c.origin==='manual'?'กำหนดเอง · ':'อัตโนมัติ · '}{laneName(c.from)} → {c.movement==='left'?'เลี้ยวซ้าย':c.movement==='right'?'เลี้ยวขวา':'ตรงไป'} → {laneName(c.to)}</p>
            {from&&<div className="design-reference-tools">
              <select aria-label="เลือกช่องรับ" data-design-connector-target={c.id} value={available.some(o=>o.value===selected)?selected:current}
                onChange={e=>setConnectorTarget(v=>({...v,[c.id]:e.target.value}))}>
                {available.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button data-design-connector-replace={c.id} disabled={!available.some(o=>o.value===selected)} onClick={()=>{
                const picked=available.find(o=>o.value===selected);if(picked)run({type:'junction.setConnector',candidateId,override:{from,movement:c.movement,mode:'replace',to:picked.ref}});
              }}>ใช้ช่องรับที่เลือก</button>
              <button data-design-connector-suppress={c.id} onClick={()=>run({type:'junction.setConnector',candidateId,override:{from,movement:c.movement,mode:'suppress'}})}>ไม่เชื่อมช่องนี้</button>
            </div>}
          </div>;
        })}
      </div>
      {!!d.treatments?.connectors?.length&&<section data-design-manual-connector-overrides={d.treatments.connectors.length}>
        <small className="design-block-title">รายการที่กำหนดเอง · คืนค่าอัตโนมัติได้</small>
        {d.treatments.connectors.map(o=><div key={o.from.leg+o.from.role+o.from.laneIndex+o.movement} className="design-reference-tools">
          <span className="design-meta">{o.from.leg} · {o.from.role} {o.from.laneIndex+1} · {o.movement} — {o.mode==='suppress'?'ไม่เชื่อม':'เลือกช่องรับเอง'}</span>
          <button data-design-connector-reset={o.from.leg+'-'+o.from.laneIndex+'-'+o.movement}
            onClick={()=>run({type:'junction.resetConnector',candidateId,from:o.from,movement:o.movement})}>คืนค่าอัตโนมัติ</button>
        </div>)}
      </section>}
      {!!mapping.slipRoutes.length&&<p className="design-meta" data-design-mapping-slip={mapping.slipRoutes.length}>Slip lane {mapping.slipRoutes.length} เส้นใช้แนวเชื่อมเดิม ไม่สร้างเส้นซ้ำในทางแยก</p>}
      {!!mapping.issues.length&&<div className="design-issues" data-design-lane-mapping-issues={mapping.issues.length}>
        <b>รายการเชื่อมช่องที่ต้องตรวจ</b>
        <ul>{mapping.issues.map((i,k)=><li key={k}>{i.from?laneName(i.from)+' · ':''}{i.message}</li>)}</ul>
      </div>}
    </Fold>}
    {compiled.unjoined[candidateId]&&<div className="design-issues" data-design-unjoined-note={compiled.unjoined[candidateId].length}>
      <b>มีถนนถึงทางแยกนี้แต่ไม่ได้เชื่อม</b>
      <ul><li>{compiled.unjoined[candidateId].map(id=>project.roads.find(r=>r.id===id)?.name??id).join(', ')} — {compiled.overflow.includes(candidateId)||approaches.length>=4?'ทางแยกรองรับสูงสุด 4 ขา':'ถูกแยกออกจากทางแยกนี้'} · ถ้าต้องการเชื่อม ให้ปรับแนวถนนไปบรรจบที่จุดอื่น</li></ul>
    </div>}
    <div className="design-presets" data-design-approaches={approaches.length}><span>ปากทาง {approaches.length} ด้าน — เลือกเพื่อเพิ่มเลนเลี้ยวหรือ Slip lane</span>
      {approaches.map(a=><button key={a.leg} data-design-approach={a.leg} onClick={()=>onSelect({kind:'approach',id:candidateId,leg:a.leg})}>{legLabel(project,a.leg)}</button>)}
    </div>
    {(()=>{const round=j.design.type==='roundabout',swap=(r:{cmd:RoadFirstCommand}|{error:string})=>{if('error' in r)onMessage(r.error,'error');else run(r.cmd);};
      return <section className="design-block" data-design-junction-type={j.design.type}>
        <small className="design-block-title">รูปแบบทางแยก</small>
        <div className="design-reference-tools" role="radiogroup" aria-label="รูปแบบทางแยก">
          <button role="radio" aria-checked={!round} className={round?'':'active'} data-design-action="to-junction" onClick={()=>{if(round)swap(toJunction(project,candidateId));}}>ทางแยกปกติ</button>
          <button role="radio" aria-checked={round} className={round?'active':''} data-design-action="to-roundabout" onClick={()=>{if(!round)swap(toRoundabout(project,candidateId));}}>วงเวียน</button>
        </div>
        {round&&<div className="design-fields">
          <NumberField field="ring-radius" label="รัศมีเกาะกลาง (ม.)" value={j.design.radius} min={10} max={30} onCommit={radius=>run({type:'junction.setDesign',candidateId,patch:{radius}})}/>
          <NumberField field="ring-lanes" label="เลนในวงเวียน" value={j.design.ring} min={1} max={3} onCommit={ring=>run({type:'junction.setDesign',candidateId,patch:{ring:ring as 1|2|3}})}/>
          <NumberField field="ring-width" label="กว้างผิวจราจรวงแหวน (ม.)" value={j.design.circulation} step={.25} min={3} max={22} onCommit={circulation=>run({type:'junction.setDesign',candidateId,patch:{circulation}})}/>
        </div>}
        {round&&<p className="design-meta">ค่าเริ่มต้นเป็นค่าตั้งต้นของเครื่องมือ ไม่ใช่ค่ามาตรฐาน · Slip lane ถูกนำออกเมื่อเปลี่ยนเป็นวงเวียน</p>}
      </section>;})()}
    {j.design.type!=='roundabout'&&(()=>{const arms=approaches.map(x=>j.design.arms[x.armId]).filter(a=>a.incoming>0),on=arms.filter(a=>a.signal).length;
      return <section className="design-block" data-design-signals={on===arms.length?'all':on?'some':'none'}>
        <small className="design-block-title">สัญญาณไฟจราจร</small>
        <p className="design-meta">{on===arms.length?'มีสัญญาณไฟทุกปากทาง':on?`มีสัญญาณไฟ ${on} จาก ${arms.length} ปากทาง`:'ไม่มีสัญญาณไฟ'} · แก้รายปากทางได้ที่แต่ละปากทาง</p>
        <div className="design-reference-tools">
          <button data-design-action="signals-all" disabled={on===arms.length} onClick={()=>run({type:'junction.setAllLegs',candidateId,patch:{signal:true},label:'ติดสัญญาณไฟทุกปากทาง'})}>มีสัญญาณไฟทุกปากทาง</button>
          <button data-design-action="signals-none" disabled={on===0} onClick={()=>run({type:'junction.setAllLegs',candidateId,patch:{signal:false},label:'เอาสัญญาณไฟออกทุกปากทาง'})}>ไม่มีสัญญาณไฟ</button>
        </div>
      </section>;})()}
    {j.design.type!=='roundabout'&&<section className="design-block" data-design-corners="true">
      <small className="design-block-title">รัศมีมุมขอบทาง</small>
      <NumberField field="corner" label="ค่าเริ่มต้นทุกมุม (ม.)" value={j.design.corner} step={1} min={4} max={20} onCommit={corner=>run({type:'junction.setCorner',candidateId,corner})}/>
      {cornerHandles(j).map(h=>{
        const leg=compiled.legs.find(l=>l.junctionId===jid&&l.armId===h.armId),key=leg&&legKey(leg.roadId,leg.side);
        const ids=approaches.map(a=>a.armId),next=compiled.legs.find(l=>l.junctionId===jid&&l.armId===ids[(ids.indexOf(h.armId)+1)%ids.length]);
        if(!key||!next)return null;
        const own=d.treatments?.cornerRadii?.[key]!==undefined;
        return <div key={key} className="design-band-row" data-design-corner-row={key}>
          <NumberField field={`corner-${h.corner}`} label={`${legLabel(project,key)} / ${legLabel(project,legKey(next.roadId,next.side))}`} value={h.radius} step={1} min={4} max={20} onCommit={radius=>run({type:'junction.setCornerAt',candidateId,leg:key,radius})}/>
          {own?<button className="link" data-design-action={`reset-corner-${h.corner}`} title="ใช้ค่าเริ่มต้น" onClick={()=>run({type:'junction.setCornerAt',candidateId,leg:key,radius:null})}>ค่าเริ่มต้น</button>:<span/>}
        </div>;})}
    </section>}
    <div className="design-actions">
      <button data-design-action="advanced-junction" title="ตำแหน่งลูกศร เส้นแบ่งเลนขาออก ต้นไม้บนเกาะกลาง ทางออก Slip lane และค่าวงเวียนขั้นสูง" onClick={()=>onAdvanced(candidateId)}>แก้ทางแยกขั้นสูง (ตำแหน่งลูกศร ทางออก Slip lane …)</button>
      <button data-design-action="to-grade-separated" onClick={()=>{if(run({type:'crossing.decide',candidateId,decision:'grade-separated'}).ok)onSelect({kind:'crossing',id:candidateId});}}>ตั้งเป็นจุดตัดต่างระดับ (เลือกถนนและระดับต่อ)</button>
      <button className="danger" data-design-action="unconfirm" onClick={()=>{if(!armed){setArmed(true);return;}run({type:'crossing.decide',candidateId,decision:'ignore'});}}>{armed?'กดอีกครั้งเพื่อยกเลิกทางแยก':'ยกเลิกทางแยก'}</button>
    </div>
  </>;
}

export type ReferencePanelProps={image:ReturnType<typeof useReferenceImage>;tool:DesignTool;onTool:(t:DesignTool)=>void;calibration:WorldPoint[];viewCenter:()=>WorldPoint};

/** Reference image: add, show, opacity, rotation, move, scale from a known distance, remove. */
function ReferencePanel({image,tool,onTool,calibration,viewCenter}:ReferencePanelProps){
  const file=useRef<HTMLInputElement>(null),r=image.reference,[armed,setArmed]=useState(false);
  const input=<input ref={file} type="file" accept="image/png,image/jpeg" hidden data-design-reference-input="true" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(f)void image.add(f,viewCenter());}}/>;
  if(!image.has)return <section className="design-block" data-design-reference="none"><small className="design-block-title">ภาพอ้างอิง</small>
    <button className="link" data-design-action="add-reference" onClick={()=>file.current?.click()}>+ ภาพอ้างอิง (JPG / PNG)</button>
    <p className="design-meta">เช่น ผังบริเวณหรือภาพถ่ายทางอากาศที่มีสิทธิ์ใช้ เก็บไว้ในเบราว์เซอร์นี้เท่านั้น</p>{input}</section>;
  return <section className="design-block" data-design-reference={r.calibrated?'calibrated':'placed'}>
    <header><small className="design-block-title">ภาพอ้างอิง · {r.fileName}</small>
      <label className="design-check"><input type="checkbox" checked={r.enabled} data-design-reference-visible="true" onChange={e=>image.update({enabled:e.currentTarget.checked})}/> แสดง</label></header>
    <p className="design-meta">{r.calibrated?`ตั้งมาตราส่วนแล้ว (อ้างอิงระยะ ${r.calibrationDistance} ม.)`:'ยังไม่ได้ตั้งมาตราส่วน — ระยะบนภาพยังไม่ใช่ระยะจริง'}</p>
    <div className="design-fields">
      <NumberField field="reference-opacity" label="ความทึบ (%)" value={Math.round(r.opacity*100)} min={5} max={100} step={5} onCommit={v=>image.update({opacity:Math.max(.05,Math.min(1,v/100))})}/>
      <NumberField field="reference-rotation" label="หมุน (°)" value={+r.rotation.toFixed(1)} step={.5} onCommit={v=>image.update({rotation:((v%360)+360)%360})}/>
    </div>
    <div className="design-reference-tools">
      <button className={tool==='ref-move'?'active':''} data-design-action="move-reference" onClick={()=>onTool(tool==='ref-move'?'select':'ref-move')}>{tool==='ref-move'?'จบการย้ายภาพ':'ย้ายภาพ'}</button>
      <button className={tool==='ref-calibrate'?'active':''} data-design-action="calibrate-reference" onClick={()=>onTool(tool==='ref-calibrate'?'select':'ref-calibrate')}>{tool==='ref-calibrate'?'ยกเลิกตั้งมาตราส่วน':'ตั้งมาตราส่วนจากระยะจริง'}</button>
    </div>
    {tool==='ref-calibrate'&&(calibration.length<2?<p className="design-meta" data-design-calibration-step={calibration.length}>คลิกจุด {calibration.length?'B':'A'} บนภาพ</p>
      :<NumberField field="reference-distance" label="ระยะจริง A–B (ม.)" value={0} step={.1} min={.1} onCommit={v=>{if(image.calibrate(calibration[0],calibration[1],v))onTool('select');}}/>)}
    <button className="link danger" data-design-action="remove-reference" onBlur={()=>setArmed(false)} onClick={()=>{if(!armed){setArmed(true);return;}void image.remove();onTool('select');}}>{armed?'กดอีกครั้งเพื่อลบภาพ':'ลบภาพอ้างอิง'}</button>
  </section>;
}

export type ScenarioPanel={name:string;existing:boolean;count:number;reference:string|null;comparison:ScenarioDiff|null;onRename:(name:string)=>boolean;onRemove:()=>void;
  /** Present when work from the earlier Network page is stored in this browser. */
  onImportEarlier?:()=>void;
  /** Present when stored work could not be read and a copy was kept aside. */
  unreadable?:{download:()=>void;clear:()=>void};
  /** Findings of the last import from earlier work (per object), until dismissed. */
  migration?:MigrationPanel};
export type MigrationPanel={report:MigrationReport;names:Record<string,string>;active:string;dismiss:()=>void;show:(scenarioId:string,target?:MigrationTarget)=>void};

const SEVERITY:Record<MigrationSeverity,{label:string;color:string}>={
  lost:{label:'ไม่ได้ย้ายมา',color:'#b3261e'},changed:{label:'ย้ายมาแต่ต่างจากเดิม',color:'#c47b12'},check:{label:'ควรตรวจ',color:'#4d6461'},
};
const SEVERITY_ORDER:MigrationSeverity[]=['lost','changed','check'];

function MigrationReportPanel({m}:{m:MigrationPanel}){
  const [armed,setArmed]=useState(false);
  const groups=m.report.scenarios.filter(s=>m.names[s.scenarioId]);
  const total=reportCount({...m.report,scenarios:groups});
  const counts=SEVERITY_ORDER.map(k=>[k,groups.reduce((n,g)=>n+g.items.filter(i=>i.severity===k).length,0)] as const).filter(([,n])=>n>0);
  return <section className="design-compare design-migration" data-design-migration-report={total}>
    <b>ผลการนำเข้า {m.report.source}</b>
    <p className="design-meta">รายการที่ย้ายมาไม่ครบหรือไม่ตรงกับแบบเดิม · คลิกรายการเพื่อเลือกตำแหน่งบนแบบ</p>
    <div className="design-compare-counts">{counts.map(([k,n])=><span key={k} style={{color:SEVERITY[k].color}}>{SEVERITY[k].label} <b>{n}</b></span>)}</div>
    {total===0&&<p className="design-meta">ทางเลือกที่มีรายการถูกลบไปแล้ว</p>}
    {groups.map(g=><div key={g.scenarioId} data-design-migration-scenario={g.scenarioId}>
      {groups.length>1&&<small className="design-block-title">{m.names[g.scenarioId]}</small>}
      <ul>{[...g.items].sort((a,b)=>SEVERITY_ORDER.indexOf(a.severity)-SEVERITY_ORDER.indexOf(b.severity)).map((i,k)=><li key={k}>
        <button data-design-migration-item={i.severity} data-design-migration-target={i.target?.kind??'none'} style={{borderLeftColor:SEVERITY[i.severity].color}}
          title={i.target?'เลือกบนแบบ':g.scenarioId!==m.active?`เปิด ${m.names[g.scenarioId]}`:undefined} disabled={!i.target&&g.scenarioId===m.active}
          onClick={()=>m.show(g.scenarioId,i.target)}>
          {SEVERITY[i.severity].label} · {i.subject}<small>{i.message}</small>
        </button></li>)}</ul>
    </div>)}
    <button className="link" data-design-action="dismiss-migration" onBlur={()=>setArmed(false)} onClick={()=>{if(!armed){setArmed(true);return;}m.dismiss();}}>{armed?'กดอีกครั้งเพื่อปิดรายงานนี้ (ดูอีกไม่ได้)':'ตรวจครบแล้ว ปิดรายงาน'}</button>
  </section>;
}

function ScenarioInspector({scenario}:{scenario:ScenarioPanel}){
  const [armed,setArmed]=useState(false);
  return <section className="design-block" data-design-scenario-panel="true">
    <small className="design-block-title">ทางเลือกที่กำลังแก้</small>
    <TextField label="ชื่อ" value={scenario.name} field="scenario-name" onCommit={name=>{scenario.onRename(name);}}/>
    <p className="design-meta">{scenario.existing?`สภาพเดิมเป็นฐานของทุกทางเลือก · มีทั้งหมด ${scenario.count} รายการ`:`คัดลอกมาจาก ${scenario.reference} · แก้ไขได้โดยไม่กระทบรายการอื่น`}</p>
    {scenario.unreadable&&<div className="design-issues" data-design-unreadable="true"><b>งานที่บันทึกไว้เดิมอ่านไม่ได้</b>
      <p className="design-meta">เก็บสำเนาไว้ในเบราว์เซอร์นี้แล้ว ดาวน์โหลดเก็บไว้หรือส่งให้ผู้ดูแลตรวจสอบได้</p>
      <button className="link" data-design-action="download-unreadable" onClick={scenario.unreadable.download}>ดาวน์โหลดงานเดิม</button>{' '}
      <button className="link danger" data-design-action="clear-unreadable" onClick={scenario.unreadable.clear}>ลบสำเนา</button></div>}
    {scenario.onImportEarlier&&<button className="link" data-design-action="import-earlier" title="เพิ่มเป็นทางเลือกใหม่ ไม่แทนที่งานปัจจุบัน" onClick={scenario.onImportEarlier}>นำเข้างานจากหน้าจอเดิม (Network) เป็นทางเลือกเพิ่ม</button>}
    {!scenario.existing&&<button className="link" data-design-action="remove-scenario" onBlur={()=>setArmed(false)} onClick={()=>{if(!armed){setArmed(true);return;}scenario.onRemove();}}>{armed?'กดอีกครั้งเพื่อลบทางเลือกนี้':'ลบทางเลือกนี้'}</button>}
  </section>;
}

function ComparisonPanel({diff,reference,onSelect}:{diff:ScenarioDiff;reference:string;onSelect:(s:DesignSelection)=>void}){
  const metrics=diff.metrics.filter(m=>m.delta!==0);
  return <section className="design-compare" data-design-comparison={diff.deltas.length}>
    <b>สิ่งที่ต่างจาก {reference}</b>
    <div className="design-compare-counts">{(['added','removed','changed'] as const).map(s=><span key={s} style={{color:DELTA_STYLE[s].color}}>{DELTA_STYLE[s].label} <b>{diff.counts[s]}</b></span>)}</div>
    {metrics.length>0&&<table><tbody>{metrics.map(m=><tr key={m.key}><td>{m.label}</td><td>{m.reference} → {m.active}{m.unit?` ${m.unit}`:''}</td><td>{m.delta>0?'+':''}{m.delta}</td></tr>)}</tbody></table>}
    {diff.deltas.length?<ul>{diff.deltas.map(d=><li key={`${d.target.kind}:${d.target.id}`}>
      <button data-design-delta-item={d.status} style={{borderLeftColor:DELTA_STYLE[d.status].color}} disabled={d.status==='removed'}
        onClick={()=>onSelect(d.target.kind==='road'?{kind:'road',id:d.target.id}:{kind:'junction',id:d.target.id})}>
        {DELTA_STYLE[d.status].label} · {d.target.kind==='road'?'ถนน':'ทางแยก'} {d.name}{d.changes.length>0&&<small>{d.changes.join(' · ')}</small>}
      </button></li>)}</ul>:<p className="design-meta">ยังเหมือนกันทุกอย่าง</p>}
  </section>;
}

export function DesignInspector({onSelectionAction=()=>{},onAlignmentReview,selection,project,compiled,candidates,run,onSelect,tool,onAdvanced,reference,map,onMessage,scenario,newRoadPreset,newRoadSection,onNewRoadPreset,newRole,onNewRole,drawLevel,onDrawLevel}:{
  /** Actions on the selected roads (same as the right-click menu). */
  onSelectionAction?:(a:MenuAction)=>void;
  onAlignmentReview:()=>void;selection:DesignSelection;project:RoadFirstProject;compiled:CompileResult;candidates:Candidate[];run:Run;onSelect:(s:DesignSelection)=>void;onAdvanced:(candidateId:string)=>void;reference:ReferencePanelProps;map:MapState;onMessage:(text:string,kind?:'info'|'error')=>void;scenario:ScenarioPanel;
  tool:string;newRoadPreset:RoadPresetId|null;newRoadSection:RoadSection;onNewRoadPreset:(id:RoadPresetId)=>void;newRole:NewRole;onNewRole:(v:NewRole)=>void;drawLevel:number;onDrawLevel:(z:number)=>void;
}){
  if(tool==='road')return <aside className="design-inspector" data-design-inspector="new-road">
    <header className="design-inspector-head"><small>วาดถนน</small><b>{newRole==='access'?'ทางเข้าโครงการใหม่':newRole==='ramp'?'ทางลาดใหม่':'ถนนใหม่'}</b></header>
    <div className="design-reference-tools" role="radiogroup" aria-label="ชนิดถนน">
      {([['road','ถนน'],['access','ทางเข้าโครงการ'],['ramp','ทางลาด']] as const).map(([v,label])=><button key={v} role="radio" aria-checked={newRole===v} className={newRole===v?'active':''} data-design-new-role={v} onClick={()=>onNewRole(v)}>{label}</button>)}
    </div>
    {newRole==='ramp'?<p className="design-meta" data-design-new-ramp="true">ทางลาดวิ่งทางเดียวตามทิศที่วาด · เริ่มบนถนนสายหลักแล้ววาดเฉียงออกไป = จุดแยกออก · จบบนข้างถนนอีกสายแบบเฉียง = จุดเข้าสู่ · จบตั้งฉากกับถนน = ทางแยกปกติ · ถ้าวางไม่ได้ เส้นจะเป็นสีแดงพร้อมเหตุผล · หน้าตัดเริ่มต้น 1 ช่อง กว้าง {RAMP_SECTION.laneWidth} ม. (ค่าตั้งต้นของเครื่องมือ แก้ได้ภายหลัง)</p>
    :newRole==='access'?<p className="design-meta" data-design-new-access="true">เริ่มคลิกบนแนวถนนหลัก แล้ววาดออกไปยังโครงการ · ถนนหลักไหลต่อเนื่อง ทางเข้ามีเส้นหยุดให้ทาง · หน้าตัดเริ่มต้น 1+1 ช่อง กว้าง 3 ม. (ค่าตั้งต้นของเครื่องมือ แก้ได้ภายหลัง)</p>
    :<PresetPicker label="หน้าตัดของถนนใหม่" value={newRoadPreset} onPick={onNewRoadPreset}/>}
    {newRole==='road'&&!newRoadPreset&&<p className="design-meta" data-design-new-section="last">ใช้หน้าตัดล่าสุด: {newRoadSection.forwardLanes}+{newRoadSection.backwardLanes} ช่อง กว้าง {newRoadSection.laneWidth} ม. เกาะกลาง {newRoadSection.median} ม. ทางเท้า {newRoadSection.walk} ม.</p>}
    <section className="design-block" data-design-draw-level={drawLevel}>
      <small className="design-block-title">ระดับที่วาด (จุดถัดไป)</small>
      <div className="design-level-row">
        <button data-design-level="down" title="PageDown" onClick={()=>onDrawLevel(drawLevel-DRAW_LEVEL_STEP)}>▼ ลด</button>
        <NumberField field="draw-level" label="ระดับ (ม.)" value={drawLevel} step={.5} min={-30} max={30} onCommit={onDrawLevel}/>
        <button data-design-level="up" title="PageUp" onClick={()=>onDrawLevel(drawLevel+DRAW_LEVEL_STEP)}>▲ ยก</button>
      </div>
      {(()=>{const k=levelCriteria(project.options.levels),levels:[string,string,number][]=[['ground','ระดับพื้น',0],['bridge-1','สะพานชั้น 1',bridgeRise(k)],['bridge-2','ชั้น 2',2*bridgeRise(k)],['tunnel','ทางลอด',-tunnelDepth(k)]];
        return <div className="design-reference-tools" aria-label="ระดับสำเร็จรูป">{levels.map(([id,label,z])=><button key={id} data-design-level-preset={id} className={Math.abs(drawLevel-z)<.01?'active':''} onClick={()=>onDrawLevel(z)}>{label} {z>0?'+':''}{z.toFixed(1)}</button>)}</div>;})()}
      <p className="design-meta">PageUp / PageDown ยกหรือลดทีละ {DRAW_LEVEL_STEP} ม. ระหว่างวาด · ถนนที่ข้ามกันต่างระดับจะเป็นทางต่างระดับเอง · เริ่มวาดบนถนนเดิมจะเริ่มที่ระดับของถนนนั้น</p>
    </section>
    <p className="design-meta">คลิกเพื่อวางจุดแนวถนน · Tab สลับจุด snap ที่ซ้อนกัน · กด Space ค้างแล้วลากเพื่อเลื่อนแบบ · ดับเบิลคลิกหรือ Enter เพื่อจบ · คลิกขวาหรือ Backspace เพื่อย้อนจุดล่าสุด · Esc เพื่อยกเลิก · เส้นสีส้มหรือแดงบอกว่าจบตรงนี้แล้วจะเกิดอะไร · แก้หน้าตัดได้ภายหลัง</p>
  </aside>;
  const road=selection?.kind==='road'?project.roads.find(r=>r.id===selection.id):undefined;
  const candidate=selection?.kind==='crossing'?candidates.find(c=>c.id===selection.id):undefined;
  return <aside className="design-inspector" data-design-inspector={selection?.kind??'project'}>
    {road?<RoadInspector key={road.id} project={project} onSelect={onSelect} road={road} point={selection?.kind==='road'?selection.point:undefined} onPoint={point=>onSelect({kind:'road',id:road.id,point})} run={run} roads={project.roads} compiled={compiled} onMessage={onMessage} onDeleted={()=>onSelect(null)}/>
    :candidate?<CrossingInspector candidate={candidate} project={project} compiled={compiled} onMessage={onMessage} run={run} onConfirmed={()=>onSelect({kind:'junction',id:candidate.id})} onPlacedDiamond={()=>onSelect({kind:'crossing',id:candidate.id})}/>
    :selection?.kind==='roads'?<MultiRoadInspector key={selection.ids.join(',')} project={project} ids={selection.ids} run={run} onSelect={onSelect} onAction={onSelectionAction}/>
    :selection?.kind==='junction'?<JunctionInspector key={selection.id} candidateId={selection.id} project={project} compiled={compiled} run={run} onSelect={onSelect} onAdvanced={onAdvanced} onMessage={onMessage}/>
    :selection?.kind==='approach'?<ApproachInspector key={`${selection.id}|${selection.leg}`} candidateId={selection.id} leg={selection.leg} project={project} compiled={compiled} run={run} onSelect={onSelect} onMessage={onMessage}/>
    :<>
      <header className="design-inspector-head"><small>โครงการ</small><TextField label="ชื่อโครงการ" value={project.title} field="project-title" onCommit={title=>run({type:'project.rename',title})}/></header>
      <p className="design-meta">ถนน {project.roads.length} สาย · ทางแยก {compiled.project.junctions.length} แห่ง</p>
      <p className="design-phone-note" data-design-phone-note="true">จอเล็กเหมาะสำหรับดูและตรวจแบบ การวาดและแก้แบบละเอียดทำได้สะดวกกว่าบนจอคอมพิวเตอร์</p>
      {project.roads.some(r=>r.alignment!=='arc')&&<button className="design-action" data-alignment-review onClick={onAlignmentReview}>ตรวจการแปลงแนวโค้ง</button>}
      <LevelCriteriaBlock project={project} run={run}/>
      <ScenarioInspector key={scenario.name} scenario={scenario}/>
      {scenario.migration&&<MigrationReportPanel m={scenario.migration}/>}
      <MapPanel map={map} tool={tool as DesignTool} onTool={reference.onTool} center={reference.viewCenter} onMessage={onMessage}/>
      <ReferencePanel {...reference}/>
      {scenario.comparison&&scenario.reference&&<ComparisonPanel diff={scenario.comparison} reference={scenario.reference} onSelect={onSelect}/>}
      {compiled.issues.length>0&&<div className="design-issues" data-design-issues={compiled.issues.length}><b>รายการที่ควรตรวจ</b>
        <ul>{compiled.issues.slice(0,12).map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
      {!project.roads.length&&<p className="design-empty">เริ่มจากเลือกเครื่องมือ “วาดถนน” ทางซ้าย แล้วคลิกบนแบบเพื่อวางจุดแนวถนน</p>}
    </>}
  </aside>;
}
