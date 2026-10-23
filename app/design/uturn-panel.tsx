'use client';
// U-turn bridge on a road (horseshoe ramp over the road) and a U-turn opening under a bridge: preview on the plan,
// place in one step (one undo). Starting values come from the level criteria and the road width (tool values).
import {useContext,useEffect,useMemo,useState} from 'react';
import {resolveAlignment} from '@/core/common/resolved-alignment';
import type {RoadFirstProject} from '@/core/road-first/project';
import {compileRoadFirstProject} from '@/core/road-first/project';
import {executeCommand,type RoadFirstCommand} from '@/core/road-first/commands';
import type {CompileResult,Road} from '@/core/road-first/derive';
import {hasSource,levelCriteria} from '@/core/road-first/level-criteria';
import {clearanceText} from '@/core/road-first/structure-clearance';
import {uturnBridgeDefaults,uturnBridgePlan,uturnMinRadius,uturnUnderPlan,type UturnBridgeParams,type UturnFrom} from '@/core/road-first/uturn';
import {TemplateContext} from './diamond-panel';
import type {CommandOutcome} from './use-road-editor';

type Run=(cmd:RoadFirstCommand,opts?:{gesture?:boolean})=>CommandOutcome;
const num=(v:string)=>v.trim()===''?NaN:Number(v);

export function UturnBridgePanel({project,road,run,onPlaced}:{project:RoadFirstProject;road:Road;run:Run;onPlaced:(id:string)=>void}){
  const {makeIds,onGhost}=useContext(TemplateContext);
  const [open,setOpen]=useState(false),[ids]=useState(()=>makeIds(1));
  const [from,setFrom]=useState<UturnFrom>('forward');
  const start=useMemo(()=>uturnBridgeDefaults(project,road.id,from),[project,road.id,from]);
  const [text,setText]=useState<Record<'station'|'radius'|'height'|'grade',string>|null>(null);
  const shown=text??(start?{station:String(start.station),radius:String(start.radius),height:String(start.height),grade:String(Math.round(start.grade*1000)/10)}:null);
  const params:UturnBridgeParams|null=shown&&{mainId:road.id,from,station:num(shown.station),radius:num(shown.radius),height:num(shown.height),grade:num(shown.grade)/100};
  const plan=useMemo(()=>open&&params?uturnBridgePlan(project,params,ids[0]):null,[open,project,shown,from,ids]);// eslint-disable-line react-hooks/exhaustive-deps
  // Checked on the resulting project: attachment rules, crossing levels and the clearance it gives.
  const check=useMemo(()=>{
    if(!plan||'error' in plan)return null;
    const r=executeCommand(project,plan.cmd);if(r.error)return{error:r.error};
    const c=compileRoadFirstProject(r.project),x=c.crossings.find(v=>v.roads.includes(plan.road.id)&&v.roads.includes(road.id));
    return{clearance:x?.clearance,issues:c.issues.filter(i=>i.includes(plan.road.name))};
  },[plan,project,road.id]);
  const error=plan&&'error' in plan?plan.error:check&&'error' in check?check.error:undefined;
  // The ghost follows the solved alignment (arcs), not the control points.
  useEffect(()=>{onGhost(open&&plan&&!('error' in plan)?{lines:[resolveAlignment(plan.road.points,'arc').sample(0,Infinity,.05).map(p=>({x:p.x,y:p.y}))],width:3.5,...(error?{error}:{})}:null);},[open,plan,error,onGhost]);
  useEffect(()=>()=>onGhost(null),[onGhost]);
  if(road.role==='ramp'||road.section.forwardLanes<1||road.section.backwardLanes<1||!shown)return null;
  const k=levelCriteria(project.options.levels),set=(key:keyof typeof shown)=>(v:string)=>setText({...shown,[key]:v});
  return <details className="design-block design-fold" data-design-fold="uturn-bridge" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary data-design-fold-toggle="uturn-bridge"><span className="design-block-title">สะพานกลับรถ (เกือกม้า)</span>{!open&&<small>ทางลาดทางเดียวข้ามถนนไปฝั่งตรงข้าม</small>}</summary>
    <div className="design-reference-tools" role="radiogroup" aria-label="รถทิศไหนกลับ">
      {(['forward','backward'] as const).map(f=><button key={f} role="radio" aria-checked={from===f} className={from===f?'active':''} data-design-uturn-from={f}
        onClick={()=>{setFrom(f);setText(null);}}>{f==='forward'?'รถทิศที่วาดกลับรถ':'รถทิศสวนกลับรถ'}</button>)}
    </div>
    <div className="design-grade-fields">
      {([['station','จุดแยกออก/เข้าสู่ ระยะบนถนน (ม.)',1],['radius','รัศมีวงเลี้ยว (ม.)',1],['height','สูงจากถนนที่จุดข้าม (ม.)',.1],['grade','ความชันทางลาด (%)',.1]] as const).map(([key,label,step])=>
        <label key={key} className="design-field"><span>{label}</span><input type="number" inputMode="decimal" step={step} value={shown[key]} data-design-field={`uturn-${key}`} onChange={e=>set(key)(e.target.value)}/></label>)}
    </div>
    <p className="design-meta">ค่าเริ่มต้น: รัศมีเล็กสุดที่ช่วงขนานพ้นขอบถนน ({uturnMinRadius(road)} ม.) · ความสูงและความชันจากเกณฑ์ระดับของโครงการ{hasSource(k.clearance)&&hasSource(k.rampGrade)?'':' (TO_VERIFY)'} · ไม่ใช่ค่ามาตรฐาน</p>
    {error?<p className="design-meta design-warning" role="alert" data-design-uturn-error>วางไม่ได้ · {error}</p>
      :plan&&!('error' in plan)?<p className="design-meta" data-design-uturn-ok data-design-uturn-clearance={check&&'clearance' in check?check.clearance?.min??'unknown':'unknown'}>
        ช่วงถนน {plan.footprint.from.toFixed(0)}–{plan.footprint.to.toFixed(0)} ม. · ช่องลอดที่จะได้ {clearanceText(check&&'clearance' in check?check.clearance:null)} · ค่าที่ตั้งไว้ {k.clearance.value} ม.
        {check&&check.issues?.length?` · มี ${check.issues.length} รายการต้องตรวจตามเกณฑ์`:''}</p>:null}
    <div className="design-actions">
      <button className="primary" data-design-action="place-uturn-bridge" disabled={!plan||'error' in plan||!!error}
        onClick={()=>{if(plan&&!('error' in plan)&&run(plan.cmd).ok){setOpen(false);onPlaced(plan.road.id);}}}>วางสะพานกลับรถ</button>
    </div>
    <p className="design-meta">แยกออกจากขอบซ้ายของทิศที่กลับ ขึ้นข้างถนน เลี้ยวขวาข้ามถนน แล้วเข้าสู่ขอบซ้ายของทิศตรงข้าม (จราจรชิดซ้าย) · หลังวางเป็นทางลาดปกติ แก้แนวและแนวดิ่งได้ · ย้อนกลับครั้งเดียวคืนสภาพเดิม · ช่องเร่งและช่องลดความเร็วยังไม่ได้กำหนด</p>
  </details>;
}

/** On a grade-separated crossing: a U-turn opening in the lower road's median, under the structure. */
export function UturnUnderAction({project,compiled,candidateId,run,onMessage}:{project:RoadFirstProject;compiled:CompileResult;candidateId:string;run:Run;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const x=compiled.crossings.find(c=>c.candidateId===candidateId&&c.relation==='over');
  if(!x?.under)return null;
  const under=project.roads.find(r=>r.id===x.under);if(!under||under.section.median<=0)return null;
  const has=(under.openings??[]).some(o=>o.type==='uturn'&&x.clearance?.spanUnder&&o.station<x.clearance.spanUnder[1]&&o.station+o.length>x.clearance.spanUnder[0]);
  return <div className="design-reference-tools">
    <button data-design-action="uturn-under" disabled={has} onClick={()=>{const p=uturnUnderPlan(project,compiled,candidateId);
      if('error' in p){onMessage(p.error,'error');return;}run(p.cmd);}}>{has?`มีจุดกลับรถใต้สะพานบน ${under.name} แล้ว`:`เพิ่มจุดกลับรถใต้สะพาน (บน ${under.name})`}</button>
    <span className="design-meta">ช่องเปิดเกาะกลางกลางช่วงใต้โครงสร้าง ช่องลอด {clearanceText(x.clearance)} · ย้ายและแก้ความยาวได้ที่ช่องเปิดเกาะกลางของถนน</span>
  </div>;
}
