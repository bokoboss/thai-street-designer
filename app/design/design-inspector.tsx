'use client';
// Inspector for the road-first workspace: header → key properties → actions, destructive action last.
import {useState} from 'react';
import type {Candidate,CompileResult,Road,RoadSection} from '@/core/road-first/derive';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import {ROAD_PRESETS,matchingPreset,presetSection,type RoadPresetId} from '@/core/road-first/presets';
import {stations} from '@/core/road-first/derive';
import type {CommandOutcome} from './use-road-editor';
import type {DesignSelection} from './design-canvas';

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

function JunctionInspector({candidateId,project,compiled,run}:{candidateId:string;project:RoadFirstProject;compiled:CompileResult;run:Run}){
  const d=project.decisions.find(x=>x.candidateId===candidateId),jid=Object.keys(compiled.sources.junctions).find(k=>compiled.sources.junctions[k]===candidateId);
  const j=compiled.project.junctions.find(x=>x.id===jid);
  const [armed,setArmed]=useState(false);
  if(!d||!j)return <p className="design-meta">ไม่พบทางแยกนี้แล้ว</p>;
  const legs=compiled.legs.filter(l=>l.junctionId===jid).map(l=>`${project.roads.find(r=>r.id===l.roadId)?.name??l.roadId} ${l.side==='ahead'?'→':'←'}`);
  return <>
    <header className="design-inspector-head"><small>ทางแยก</small><TextField label="ชื่อ" value={d.name??j.name} field="junction-name" onCommit={name=>run({type:'junction.rename',candidateId,name})}/></header>
    <p className="design-meta">{legs.length} ปากทาง: {legs.join(', ')}</p>
    <div className="design-fields">
      <NumberField field="corner" label="รัศมีมุมขอบทาง (ม.)" value={j.design.corner} step={1} min={4} max={20} onCommit={corner=>run({type:'junction.setCorner',candidateId,corner})}/>
    </div>
    <div className="design-actions">
      <button data-design-action="to-grade-separated" onClick={()=>run({type:'crossing.decide',candidateId,decision:'grade-separated'})}>เปลี่ยนเป็นทางต่างระดับ</button>
      <button className="danger" data-design-action="unconfirm" onClick={()=>{if(!armed){setArmed(true);return;}run({type:'crossing.decide',candidateId,decision:'ignore'});}}>{armed?'กดอีกครั้งเพื่อยกเลิกทางแยก':'ยกเลิกทางแยก'}</button>
    </div>
  </>;
}

export function DesignInspector({selection,project,compiled,candidates,run,onSelect,tool,newRoadPreset,newRoadSection,onNewRoadPreset}:{
  selection:DesignSelection;project:RoadFirstProject;compiled:CompileResult;candidates:Candidate[];run:Run;onSelect:(s:DesignSelection)=>void;
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
    :selection?.kind==='junction'?<JunctionInspector key={selection.id} candidateId={selection.id} project={project} compiled={compiled} run={run}/>
    :<>
      <header className="design-inspector-head"><small>โครงการ</small><TextField label="ชื่อโครงการ" value={project.title} field="project-title" onCommit={title=>run({type:'project.rename',title})}/></header>
      <p className="design-meta">ถนน {project.roads.length} สาย · ทางแยก {compiled.project.junctions.length} แห่ง</p>
      {compiled.issues.length>0&&<div className="design-issues" data-design-issues={compiled.issues.length}><b>รายการที่ควรตรวจ</b>
        <ul>{compiled.issues.slice(0,12).map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
      {!project.roads.length&&<p className="design-empty">เริ่มจากเลือกเครื่องมือ “วาดถนน” ทางซ้าย แล้วคลิกบนแบบเพื่อวางจุดแนวถนน</p>}
    </>}
  </aside>;
}
