'use client';
// Flyover / underpass before placing: parameters (from the project's level criteria), the profile before / after, the
// footprint ghost on the plan, the clearance it would give and the items to check. Nothing changes until "วาง";
// placing is one undo step. A proposal that cannot be placed stays open in red with the reason, so it can be adjusted.
import {useContext,useEffect,useMemo,useState} from 'react';
import type {RoadFirstProject} from '@/core/road-first/project';
import {compileRoadFirstProject} from '@/core/road-first/project';
import {executeCommand,type RoadFirstCommand} from '@/core/road-first/commands';
import {resolveVerticalProfile} from '@/core/road-first/elevation';
import {gradeDefaults,gradeGhost,gradeOutcome,gradeProposal,type GradeKind,type GradeParams} from '@/core/road-first/grade-separation';
import {hasSource,levelCriteria} from '@/core/road-first/level-criteria';
import {roadLength} from '@/core/road-first/road-openings';
import {clearanceText} from '@/core/road-first/structure-clearance';
import {TemplateContext} from './diamond-panel';
import type {CommandOutcome} from './use-road-editor';

export type GradeRequest={candidateId:string;roadId:string;kind:GradeKind;after?:()=>void};
type Pending={spec:GradeRequest;before:RoadFirstProject};

export function useProfileReview(project:RoadFirstProject,run:(cmd:RoadFirstCommand)=>CommandOutcome,onMessage:(s:string,kind?:'info'|'error')=>void){
  const [pending,setPending]=useState<Pending|null>(null);
  const request=(spec:GradeRequest)=>{
    const first=gradeProposal(project,spec.candidateId,spec.roadId,spec.kind);
    if(first.error){onMessage(first.error,'error');if(!first.plan)return;}
    setPending({spec,before:project});
  };
  const review=pending?<GradeComposer key={`${pending.spec.candidateId}:${pending.spec.roadId}:${pending.spec.kind}`} spec={pending.spec} project={project} stale={project!==pending.before}
    onClose={()=>setPending(null)} onConfirm={cmd=>{if(project===pending.before&&run(cmd).ok){setPending(null);pending.spec.after?.();}}}/>:null;
  return{request,review};
}

const num=(v:string)=>v.trim()===''?NaN:Number(v);
function ParamField({label,value,onChange,field,step}:{label:string;value:string;onChange:(v:string)=>void;field:string;step:number}){
  return <label className="design-field"><span>{label}</span>
    <input type="number" inputMode="decimal" step={step} value={value} data-design-field={field} onChange={e=>onChange(e.target.value)}/></label>;
}

function GradeComposer({spec,project,stale,onClose,onConfirm}:{spec:GradeRequest;project:RoadFirstProject;stale:boolean;onClose:()=>void;onConfirm:(cmd:RoadFirstCommand)=>void}){
  const {onGhost}=useContext(TemplateContext);
  const d=useMemo(()=>gradeDefaults(project,spec.candidateId,spec.roadId,spec.kind),[]);// eslint-disable-line react-hooks/exhaustive-deps
  const [text,setText]=useState({height:String(d?.height??''),top:String(d?.top??''),grade:String(Math.round((d?.grade??0)*1000)/10),curve:'0'});
  const [release,setRelease]=useState(false);
  const params:GradeParams={height:num(text.height),top:num(text.top),grade:num(text.grade)/100,curve:num(text.curve),release};
  const proposal=useMemo(()=>gradeProposal(project,spec.candidateId,spec.roadId,spec.kind,params),[project,spec,text,release]);// eslint-disable-line react-hooks/exhaustive-deps
  const outcome=useMemo(()=>gradeOutcome(project,proposal,executeCommand,compileRoadFirstProject),[project,proposal]);
  const error=proposal.error??outcome.error,plan=proposal.plan;
  useEffect(()=>{
    const g=plan&&gradeGhost(project,plan);
    onGhost(g?{lines:[...g.approaches,g.level],width:g.width,...(error?{error}:{})}:null);
    return()=>onGhost(null);
  },[project,plan,error,onGhost]);
  const road=project.roads.find(r=>r.id===spec.roadId),other=project.roads.find(r=>r.id===plan?.otherId),k=levelCriteria(project.options.levels);
  const set=(key:keyof typeof text)=>(v:string)=>setText(t=>({...t,[key]:v}));
  const what=spec.kind==='over'?'ยกข้าม':'กดลอดใต้';
  return <section className="design-block design-grade-composer" data-profile-review data-grade-composer={spec.kind} data-grade-state={error?'error':'ok'}
    onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <small className="design-block-title">{road?.name} {what} {other?.name} · ตรวจก่อนวาง</small>
    <div className="design-grade-fields">
      <ParamField label={spec.kind==='over'?'ต่างระดับที่จุดตัด (ม.)':'ลึกกว่าถนนบน (ม.)'} value={text.height} onChange={set('height')} field="grade-height" step={.1}/>
      <ParamField label={spec.kind==='over'?'ช่วงราบบนสะพาน (ม.)':'ช่วงราบใต้ถนน (ม.)'} value={text.top} onChange={set('top')} field="grade-top" step={1}/>
      <ParamField label="ความชันทางขึ้นลง (%)" value={text.grade} onChange={set('grade')} field="grade-grade" step={.1}/>
      <ParamField label="ความยาวโค้งดิ่ง (ม.)" value={text.curve} onChange={set('curve')} field="grade-curve" step={5}/>
    </div>
    <p className="design-meta">ค่าเริ่มต้นจากเกณฑ์ระดับของโครงการ{hasSource(k.clearance)&&hasSource(k.deckDepth)?'':' (TO_VERIFY)'} · โค้งดิ่ง 0 = แนวลาดตรง ระบบไม่กำหนดความยาวโค้งให้</p>
    {plan?.legacy.stations.length?<label className="design-check" data-grade-release>
      <input type="checkbox" checked={release} onChange={e=>setRelease(e.target.checked)}/>
      <span>{other?.name} มีจุดระดับเดิม {plan.legacy.stations.length} จุดรอบจุดตัด (ระยะ {plan.legacy.stations.map(s=>s.toFixed(0)).join(', ')} ม.) ที่ไม่ทราบที่มา — นำออกด้วย</span>
    </label>:null}
    {plan&&(plan.unchanged
      ?<p className="design-meta" data-grade-unchanged>{road?.name}อยู่{spec.kind==='over'?'สูง':'ต่ำ'}กว่าพออยู่แล้ว ไม่ปรับแนวดิ่ง เปลี่ยนเฉพาะการเลือกถนนด้านบน</p>
      :<p className="design-meta" data-grade-extent>ทางขึ้นลงระยะ {Math.max(0,plan.extent!.start).toFixed(0)}–{plan.extent!.topStart.toFixed(0)} และ {plan.extent!.topEnd.toFixed(0)}–{plan.extent!.end.toFixed(0)} ม. · ต้องใช้ {plan.need.toFixed(1)} ม. ทั้งก่อนและหลังจุดตัด (ถนนยาว {plan.length.toFixed(0)} ม.)</p>)}
    {!error&&<p className="design-meta" data-grade-clearance={outcome.clearance?.min??'unknown'}>ช่องลอดที่จะได้ {clearanceText(outcome.clearance)} · ค่าที่ตั้งไว้ {k.clearance.value} ม.{hasSource(k.clearance)?'':' (TO_VERIFY)'}</p>}
    {!error&&outcome.issues.length>0&&<ul className="design-issues" data-grade-issues={outcome.issues.length}>{outcome.issues.map((i,n)=><li key={n}>{i}</li>)}</ul>}
    {proposal.cmd&&Object.entries(proposal.cmd.profiles).map(([id,next])=><ProfileDelta key={id} project={project} roadId={id} next={next??undefined}/>)}
    {error&&<p role="alert" className="design-warning" data-grade-error>{error}</p>}
    {stale&&<p role="alert" className="design-warning">โครงการเปลี่ยนระหว่างตรวจ — ปิดแล้วเลือกใหม่</p>}
    <div className="design-actions">
      <button data-profile-review-cancel onClick={onClose}>ยกเลิก</button>
      <button className="primary" data-profile-review-confirm disabled={stale||!!error||!proposal.cmd} onClick={()=>proposal.cmd&&onConfirm(proposal.cmd)}>วาง (ย้อนกลับได้หนึ่งขั้นตอน)</button>
    </div>
  </section>;
}

function ProfileDelta({project,roadId,next}:{project:RoadFirstProject;roadId:string;next?:import('@/core/road-first/elevation').Profile}){
  const road=project.roads.find(r=>r.id===roadId);if(!road)return null;
  const before=resolveVerticalProfile(road.profile),after=resolveVerticalProfile(next),total=roadLength(road);
  const s=[...new Set([...before.sampleStations(0,total),...after.sampleStations(0,total)])].sort((a,b)=>a-b);
  const zs=s.flatMap(st=>[before.levelAt(st),after.levelAt(st)]),lo=Math.min(0,...zs)-1,hi=Math.max(0,...zs)+1;
  const x=(st:number)=>8+st/(total||1)*304,y=(z:number)=>82-(z-lo)/(hi-lo)*72;
  const line=(p:typeof before)=>s.map(st=>`${x(st)},${y(p.levelAt(st))}`).join(' ');
  const kept=after.points.filter(p=>!p.generatedBy).length;
  return <div data-profile-delta={roadId}>
    <svg viewBox="0 0 320 90" role="img" aria-label={`แนวดิ่งก่อนและหลังปรับ ${road.name}`} className="design-grade-delta">
      <line x1={8} x2={312} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeDasharray="3 3"/>
      <polyline points={line(before)} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 3"/>
      <polyline points={line(after)} fill="none" stroke="#2563eb" strokeWidth="2"/>
    </svg>
    <p className="design-meta">{road.name} · เส้นประ: ก่อน · สีน้ำเงิน: หลังวาง · เก็บจุดที่ผู้ใช้กำหนด {kept} จุด</p>
  </div>;
}
