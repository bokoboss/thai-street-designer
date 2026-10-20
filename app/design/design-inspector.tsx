'use client';
// Inspector for the road-first workspace: header → key properties → actions, destructive action last.
import {useRef,useState} from 'react';
import type {WorldPoint} from '@/core/network/network-project';
import type {useReferenceImage} from './use-reference-image';
import {MapPanel,type MapState} from './map-panel';
import type {Candidate,CompileResult,Road,RoadSection} from '@/core/road-first/derive';
import type {RoadFirstProject} from '@/core/road-first/project';
import {executeCommand,type RoadFirstCommand} from '@/core/road-first/commands';
import {approachInfo,junctionApproaches,newSlip,pocketTreatment,slipPatch,type ApproachInfo,type PocketSide} from '@/core/road-first/approach-edit';
import {parseLegKey,type LegKey} from '@/core/road-first/leg-binding';
import {ROAD_PRESETS,matchingPreset,presetSection,type RoadPresetId} from '@/core/road-first/presets';
import {stations} from '@/core/road-first/derive';
import type {CommandOutcome} from './use-road-editor';
import {DELTA_STYLE,type DesignSelection,type DesignTool} from './design-canvas';
import type {ScenarioDiff} from '@/core/road-first/compare';

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
function TextField({label,value,onCommit,field}:{label:string;value:string;onCommit:(v:string)=>void;field:string}){
  const [draft,setDraft]=useState<string|null>(null),text=draft??value;
  const commit=()=>{const v=text.trim();setDraft(null);if(!v||v===value)return;onCommit(v);};
  return <label className="design-field design-field-text"><span>{label}</span>
    <input value={text} maxLength={60} data-design-field={field} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape')setDraft(null);}}/>
  </label>;
}

export function PresetPicker({value,onPick,label}:{value:RoadPresetId|null;onPick:(id:RoadPresetId)=>void;label:string}){
  return <div className="design-presets"><span>{label}</span>
    {ROAD_PRESETS.map(p=><button key={p.id} data-design-preset={p.id} className={value===p.id?'active':''} onClick={()=>onPick(p.id)}>{p.label}</button>)}
  </div>;
}

function RoadInspector({road,run,onDeleted}:{road:Road;run:Run;onDeleted:()=>void}){
  const s=road.section,set=(patch:Partial<RoadSection>)=>run({type:'road.setSection',roadId:road.id,patch});
  const length=stations(road.points).at(-1)??0;
  const [armed,setArmed]=useState(false);
  return <>
    <header className="design-inspector-head"><small>ถนน</small><TextField label="ชื่อ" value={road.name} field="road-name" onCommit={name=>run({type:'road.rename',roadId:road.id,name})}/></header>
    <PresetPicker label="หน้าตัดสำเร็จรูป" value={matchingPreset(s)} onPick={id=>set(presetSection(id))}/>
    <div className="design-fields">
      <NumberField field="forward-lanes" label="ช่องจราจรตามทิศที่วาด" value={s.forwardLanes} min={0} max={4} onCommit={v=>set({forwardLanes:v})}/>
      <NumberField field="backward-lanes" label="ช่องจราจรทิศสวน" value={s.backwardLanes} min={0} max={4} onCommit={v=>set({backwardLanes:v})}/>
      <NumberField field="lane-width" label="ความกว้างช่องจราจร (ม.)" value={s.laneWidth} step={.05} min={2.5} max={4.5} onCommit={v=>set({laneWidth:v})}/>
      <NumberField field="median" label="เกาะกลาง (ม.)" value={s.median} step={.5} min={0} max={12} onCommit={v=>set({median:v})}/>
      <NumberField field="walk" label="ทางเท้า ทั้งสองข้าง (ม.)" value={s.walk} step={.25} min={0} max={8} onCommit={v=>set({walk:v})}/>
    </div>
    <p className="design-meta">ยาว {length.toFixed(1)} ม. · {road.points.length} จุดแนว · ดับเบิลคลิกบนแนวถนนเพื่อเพิ่มจุด</p>
    <div className="design-actions">
      <button className="danger" data-design-action="delete-road" onClick={()=>{if(!armed){setArmed(true);return;}if(run({type:'road.remove',roadId:road.id}).ok)onDeleted();}}>{armed?'กดอีกครั้งเพื่อลบถนน':'ลบถนน'}</button>
    </div>
  </>;
}

function CrossingInspector({candidate,project,run,onConfirmed}:{candidate:Candidate;project:RoadFirstProject;run:Run;onConfirmed:()=>void}){
  const names=candidate.roads.map(r=>project.roads.find(x=>x.id===r.roadId)?.name??r.roadId),d=project.decisions.find(x=>x.candidateId===candidate.id);
  const state=d?.decision==='grade-separated'?'ทางต่างระดับ':d?.decision==='ignore'?'ไม่ใช่ทางแยก':'ยังเป็นทางแยกไม่ได้';
  return <>
    <header className="design-inspector-head"><small>จุดตัดของถนน</small><b>{names.join(' × ')}</b><span className="design-state">{state}</span></header>
    <p className="design-meta">{d?'จุดนี้ถนนข้ามกันโดยไม่มีทางแยก':'ระบบสร้างทางแยกที่จุดนี้ไม่ได้ ดูเหตุผลที่แถบด้านล่าง หรือปรับแนวถนนแล้วลองใหม่'}</p>
    <div className="design-actions">
      <button className="primary" data-design-action="confirm-junction" onClick={()=>{if(run({type:'crossing.decide',candidateId:candidate.id,decision:'junction',name:d?.name??`แยก ${names.join(' × ')}`}).ok)onConfirmed();}}>ทำเป็นทางแยก</button>
      <button data-design-action="grade-separated" onClick={()=>run({type:'crossing.decide',candidateId:candidate.id,decision:'grade-separated'})}>ทางต่างระดับ (ข้ามกัน)</button>
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

function ApproachInspector({candidateId,leg,project,compiled,run,onSelect}:{candidateId:string;leg:LegKey;project:RoadFirstProject;compiled:CompileResult;run:Run;onSelect:(s:DesignSelection)=>void}){
  const info=approachInfo(compiled,candidateId,leg),d=project.decisions.find(x=>x.candidateId===candidateId);
  if(!info)return <p className="design-meta">ไม่พบปากทางนี้แล้ว</p>;
  return <>
    <header className="design-inspector-head"><small>ปากทาง · {d?.name??info.junction.name}</small><b>{legLabel(project,leg)}</b>
      <button className="link" data-design-action="back-to-junction" onClick={()=>onSelect({kind:'junction',id:candidateId})}>← ทางแยกทั้งหมด</button></header>
    <PocketBlock info={info} side="right" run={run} title="เลนเลี้ยวขวา"/>
    <PocketBlock info={info} side="left" run={run} title="เลนเลี้ยวซ้าย"/>
    <SlipBlock info={info} project={project} run={run}/>
    <p className="design-meta">ลากจุดบนแบบเพื่อปรับระยะเก็บรถและรัศมีมุมได้ · ขนาดเริ่มต้นเป็นค่าตั้งต้นของเครื่องมือ ไม่ใช่ค่ามาตรฐาน ควรตรวจกับแนวทางออกแบบที่ใช้</p>
    <div className="design-actions">
      <button data-design-action="reset-approach" onClick={()=>run({type:'leg.reset',candidateId,leg})}>คืนค่าเริ่มต้นของปากทางนี้</button>
    </div>
  </>;
}

function JunctionInspector({candidateId,project,compiled,run,onSelect,onAdvanced}:{candidateId:string;project:RoadFirstProject;compiled:CompileResult;run:Run;onSelect:(s:DesignSelection)=>void;onAdvanced:(candidateId:string)=>void}){
  const d=project.decisions.find(x=>x.candidateId===candidateId),jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  const j=compiled.project.junctions.find(x=>x.id===jid);
  const [armed,setArmed]=useState(false);
  if(!d||!j)return <p className="design-meta">ไม่พบทางแยกนี้แล้ว</p>;
  const approaches=junctionApproaches(compiled,candidateId);
  return <>
    <header className="design-inspector-head"><small>ทางแยก</small><TextField label="ชื่อ" value={d.name??j.name} field="junction-name" onCommit={name=>run({type:'junction.rename',candidateId,name})}/></header>
    {compiled.unjoined[candidateId]&&<div className="design-issues" data-design-unjoined-note={compiled.unjoined[candidateId].length}>
      <b>มีถนนถึงทางแยกนี้แต่ไม่ได้เชื่อม</b>
      <ul><li>{compiled.unjoined[candidateId].map(id=>project.roads.find(r=>r.id===id)?.name??id).join(', ')} — {compiled.overflow.includes(candidateId)||approaches.length>=4?'ทางแยกรองรับสูงสุด 4 ขา':'ถูกแยกออกจากทางแยกนี้'} · ถ้าต้องการเชื่อม ให้ปรับแนวถนนไปบรรจบที่จุดอื่น</li></ul>
    </div>}
    <div className="design-presets" data-design-approaches={approaches.length}><span>ปากทาง {approaches.length} ด้าน — เลือกเพื่อเพิ่มเลนเลี้ยวหรือ Slip lane</span>
      {approaches.map(a=><button key={a.leg} data-design-approach={a.leg} onClick={()=>onSelect({kind:'approach',id:candidateId,leg:a.leg})}>{legLabel(project,a.leg)}</button>)}
    </div>
    <div className="design-fields">
      <NumberField field="corner" label="รัศมีมุมขอบทาง (ม.)" value={j.design.corner} step={1} min={4} max={20} onCommit={corner=>run({type:'junction.setCorner',candidateId,corner})}/>
    </div>
    <div className="design-actions">
      <button data-design-action="advanced-junction" title="3 มิติ ทางข้าม สัญญาณไฟ เส้นหยุด วงเวียน ช่องเปิดเกาะกลาง ลูกศร และ Slip lane ขั้นสูง" onClick={()=>onAdvanced(candidateId)}>แก้ทางแยกขั้นสูง (3 มิติ ทางข้าม สัญญาณไฟ วงเวียน …)</button>
      <button data-design-action="to-grade-separated" onClick={()=>run({type:'crossing.decide',candidateId,decision:'grade-separated'})}>เปลี่ยนเป็นทางต่างระดับ</button>
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
  onImportEarlier?:()=>void};

function ScenarioInspector({scenario}:{scenario:ScenarioPanel}){
  const [armed,setArmed]=useState(false);
  return <section className="design-block" data-design-scenario-panel="true">
    <small className="design-block-title">ทางเลือกที่กำลังแก้</small>
    <TextField label="ชื่อ" value={scenario.name} field="scenario-name" onCommit={name=>{scenario.onRename(name);}}/>
    <p className="design-meta">{scenario.existing?`สภาพเดิมเป็นฐานของทุกทางเลือก · มีทั้งหมด ${scenario.count} รายการ`:`คัดลอกมาจาก ${scenario.reference} · แก้ไขได้โดยไม่กระทบรายการอื่น`}</p>
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

export function DesignInspector({selection,project,compiled,candidates,run,onSelect,tool,onAdvanced,reference,map,onMessage,scenario,newRoadPreset,newRoadSection,onNewRoadPreset}:{
  selection:DesignSelection;project:RoadFirstProject;compiled:CompileResult;candidates:Candidate[];run:Run;onSelect:(s:DesignSelection)=>void;onAdvanced:(candidateId:string)=>void;reference:ReferencePanelProps;map:MapState;onMessage:(text:string,kind?:'info'|'error')=>void;scenario:ScenarioPanel;
  tool:string;newRoadPreset:RoadPresetId|null;newRoadSection:RoadSection;onNewRoadPreset:(id:RoadPresetId)=>void;
}){
  if(tool==='road')return <aside className="design-inspector" data-design-inspector="new-road">
    <header className="design-inspector-head"><small>วาดถนน</small><b>ถนนใหม่</b></header>
    <PresetPicker label="หน้าตัดของถนนใหม่" value={newRoadPreset} onPick={onNewRoadPreset}/>
    {!newRoadPreset&&<p className="design-meta" data-design-new-section="last">ใช้หน้าตัดล่าสุด: {newRoadSection.forwardLanes}+{newRoadSection.backwardLanes} ช่อง กว้าง {newRoadSection.laneWidth} ม. เกาะกลาง {newRoadSection.median} ม. ทางเท้า {newRoadSection.walk} ม.</p>}
    <p className="design-meta">คลิกเพื่อวางจุดแนวถนน · ดับเบิลคลิกหรือ Enter เพื่อจบ · Esc เพื่อยกเลิก · แก้หน้าตัดได้ภายหลัง</p>
  </aside>;
  const road=selection?.kind==='road'?project.roads.find(r=>r.id===selection.id):undefined;
  const candidate=selection?.kind==='crossing'?candidates.find(c=>c.id===selection.id):undefined;
  return <aside className="design-inspector" data-design-inspector={selection?.kind??'project'}>
    {road?<RoadInspector key={road.id} road={road} run={run} onDeleted={()=>onSelect(null)}/>
    :candidate?<CrossingInspector candidate={candidate} project={project} run={run} onConfirmed={()=>onSelect({kind:'junction',id:candidate.id})}/>
    :selection?.kind==='junction'?<JunctionInspector key={selection.id} candidateId={selection.id} project={project} compiled={compiled} run={run} onSelect={onSelect} onAdvanced={onAdvanced}/>
    :selection?.kind==='approach'?<ApproachInspector key={`${selection.id}|${selection.leg}`} candidateId={selection.id} leg={selection.leg} project={project} compiled={compiled} run={run} onSelect={onSelect}/>
    :<>
      <header className="design-inspector-head"><small>โครงการ</small><TextField label="ชื่อโครงการ" value={project.title} field="project-title" onCommit={title=>run({type:'project.rename',title})}/></header>
      <p className="design-meta">ถนน {project.roads.length} สาย · ทางแยก {compiled.project.junctions.length} แห่ง</p>
      <ScenarioInspector key={scenario.name} scenario={scenario}/>
      <MapPanel map={map} tool={tool as DesignTool} onTool={reference.onTool} center={reference.viewCenter} onMessage={onMessage}/>
      <ReferencePanel {...reference}/>
      {scenario.comparison&&scenario.reference&&<ComparisonPanel diff={scenario.comparison} reference={scenario.reference} onSelect={onSelect}/>}
      {compiled.issues.length>0&&<div className="design-issues" data-design-issues={compiled.issues.length}><b>รายการที่ควรตรวจ</b>
        <ul>{compiled.issues.slice(0,12).map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
      {!project.roads.length&&<p className="design-empty">เริ่มจากเลือกเครื่องมือ “วาดถนน” ทางซ้าย แล้วคลิกบนแบบเพื่อวางจุดแนวถนน</p>}
    </>}
  </aside>;
}
