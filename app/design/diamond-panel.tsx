'use client';
// Diamond interchange template panel (Phase 4B-3): parameters, a ghost preview on the plan (red with the reason when it
// cannot be placed), placing as one undo step, and replacing a placed set. Pieces stay ordinary roads afterwards.
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import type {WorldPoint} from '@/core/network/network-project';
import {executeCommand,type RoadFirstCommand} from '@/core/road-first/commands';
import {detectCandidates,stations} from '@/core/road-first/derive';
import {DIAMOND_RAMP_LABEL,diamondDefaults,diamondPlan,removeTemplateCommand,templatePieces,type DiamondParams,type DiamondRampKey} from '@/core/road-first/diamond';
import {bridgeRise,levelCriteria} from '@/core/road-first/level-criteria';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {CommandOutcome} from './use-road-editor';

/** A template preview drawn on the plan: centre lines of the pieces, their width, and the reason when it cannot be placed. */
export type TemplateGhost={lines:WorldPoint[][];width:number;error?:string}|null;
/** Page services for templates: fresh road ids (never reused across scenarios) and the plan ghost. */
export const TemplateContext=createContext<{makeIds:(n:number)=>string[];onGhost:(g:TemplateGhost)=>void}>({makeIds:n=>Array.from({length:n},(_,i)=>`R-t${i}`),onGhost:()=>{}});

type Run=(cmd:RoadFirstCommand,opts?:{gesture?:boolean})=>CommandOutcome;

/** What placing (or replacing) the diamond would do: its command, the ghost lines and any reason it cannot be placed. */
function placedGroup(project:RoadFirstProject,candidateId:string){
  const ids=detectCandidates(project.roads).find(x=>x.id===candidateId)?.roads.map(r=>r.roadId)??[];
  return project.roads.find(r=>r.origin?.template==='diamond'&&ids.length>0&&ids.every(id=>(r.origin!.params.crossing as string[]|undefined)?.includes(id)))?.origin?.group;
}
function placement(project:RoadFirstProject,candidateId:string,params:DiamondParams|null,ids:string[]){
  const existing=placedGroup(project,candidateId);
  if(!params)return null;
  const remove=existing?removeTemplateCommand(project.roads,existing,''):null,base=remove?executeCommand(project,remove).project:project;
  const plan=diamondPlan(base,candidateId,params,ids);if('error' in plan)return{error:plan.error,lines:[] as WorldPoint[][]};
  const cmd:RoadFirstCommand=remove?{type:'batch',quiet:true,label:`${plan.cmd.type==='batch'?plan.cmd.label:''} (แทนชุดเดิม)`,commands:[...(remove.type==='batch'?remove.commands:[]),...(plan.cmd.type==='batch'?plan.cmd.commands:[])]}:plan.cmd;
  const check=executeCommand(project,cmd);
  // Placement feedback: ramp lengths and their steepest grade (from the generated profiles).
  const lengths=plan.ramps.map(r=>stations(r.road.points,r.road.alignment).at(-1)!),grades=plan.ramps.map(r=>{const p=r.road.profile??[];let g=0;for(let i=1;i<p.length;i++)g=Math.max(g,Math.abs(p[i].z-p[i-1].z)/((p[i].station-p[i-1].station)||1));return g*100;});
  return{cmd,error:check.error??undefined,lines:plan.ramps.map(r=>r.road.points),warnings:check.warnings.filter(w=>/ต้องตรวจตามเกณฑ์/.test(w)),
    info:{minLength:Math.min(...lengths),maxLength:Math.max(...lengths),grade:Math.max(...grades)}};
}

export function DiamondPanel({project,candidateId,run,onPlaced}:{project:RoadFirstProject;candidateId:string;run:Run;onPlaced:()=>void}){
  const {makeIds,onGhost}=useContext(TemplateContext);
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId),roadIds=c?.roads.map(r=>r.roadId)??[];
  const [params,setParams]=useState<DiamondParams|null>(()=>diamondDefaults(project,candidateId));
  const [ids]=useState(()=>makeIds(4)),[open,setOpen]=useState(false);
  // A set already placed at this crossing is replaced (removed and placed again in the same step).
  const result=useMemo(()=>placement(project,candidateId,params,ids),[params,project,candidateId,ids]),existing=placedGroup(project,candidateId);
  useEffect(()=>{onGhost(open&&result?{lines:result.lines,width:3.5,error:result.error}:null);},[open,result,onGhost]);
  useEffect(()=>()=>onGhost(null),[onGhost]);
  if(!c||c.kind!=='cross'||c.roads.length!==2||!params)return null;
  const name=(id:string)=>project.roads.find(r=>r.id===id)?.name??id,k=levelCriteria(project.options.levels);
  const set=(patch:Partial<DiamondParams>)=>setParams(p=>p&&{...p,...patch});
  return <details className="design-block design-fold" data-design-fold="diamond" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary data-design-fold-toggle="diamond"><span className="design-block-title">ทางแยกต่างระดับแบบข้าวหลามตัด (diamond)</span>{!open&&<small>{existing?'วางแล้ว · ปรับและวางใหม่ได้':'ทางลาด 4 เส้น + ทางแยก 2 แห่ง'}</small>}</summary>
    <div className="design-reference-tools" role="radiogroup" aria-label="ถนนหลัก">
      {roadIds.map(id=><button key={id} role="radio" aria-checked={params.mainId===id} className={params.mainId===id?'active':''} data-design-diamond-main={id}
        onClick={()=>{const d=diamondDefaults(project,candidateId,id);if(d)setParams({...d,over:params.over,ramps:params.ramps});}}>ถนนหลัก: {name(id)}</button>)}
    </div>
    <div className="design-reference-tools" role="radiogroup" aria-label="ถนนไหนข้าม">
      <button role="radio" aria-checked={params.over==='main'} className={params.over==='main'?'active':''} data-design-diamond-over="main" onClick={()=>set({over:'main'})}>{name(params.mainId)} ข้าม (สะพาน)</button>
      <button role="radio" aria-checked={params.over==='cross'} className={params.over==='cross'?'active':''} data-design-diamond-over="cross" onClick={()=>set({over:'cross'})}>{name(roadIds.find(i=>i!==params.mainId)!)} ข้าม (สะพาน)</button>
    </div>
    <label className="design-field"><span>ระยะจุดแยกออก/เข้าสู่ จากจุดตัด (ม.)</span><input type="number" min={50} max={1500} step={10} value={params.length} data-design-field="diamond-length" onChange={e=>{const v=Number(e.currentTarget.value);if(Number.isFinite(v)&&v>0)set({length:v});}}/></label>
    <label className="design-field"><span>ระยะทางแยกปลายทางลาดจากแนวถนนหลัก (ม.)</span><input type="number" min={10} max={200} step={1} value={params.offset} data-design-field="diamond-offset" onChange={e=>{const v=Number(e.currentTarget.value);if(Number.isFinite(v)&&v>0)set({offset:v});}}/></label>
    <div className="design-checks">{(Object.keys(DIAMOND_RAMP_LABEL) as DiamondRampKey[]).map(key=><label key={key} className="design-check"><input type="checkbox" checked={params.ramps[key]} data-design-diamond-ramp={key} onChange={e=>set({ramps:{...params.ramps,[key]:e.currentTarget.checked}})}/> {DIAMOND_RAMP_LABEL[key]}</label>)}</div>
    {result?.error?<p className="design-meta design-warning" data-design-diamond-error="true">วางไม่ได้ · {result.error}</p>
      :<p className="design-meta" data-design-diamond-ok="true">ภาพร่างบนแบบ: ทางลาด {result?.lines.length} เส้น ยาว {result&&'info' in result&&result.info?`${result.info.minLength.toFixed(0)}–${result.info.maxLength.toFixed(0)} ม. ชันสุด ${result.info.grade.toFixed(1)}%`:''} · สะพานยก {bridgeRise(k)} ม. ตามเกณฑ์ระดับของโครงการ{result?.warnings?.length?` · มี ${result.warnings.length} รายการต้องตรวจตามเกณฑ์`:''}</p>}
    <div className="design-actions">
      <button className="primary" data-design-action="place-diamond" disabled={!result||!!result.error||!('cmd' in result)} onClick={()=>{if(result&&'cmd' in result&&result.cmd&&run(result.cmd).ok){setOpen(false);onPlaced();}}}>{existing?'วางใหม่แทนชุดเดิม':'วางทางแยกต่างระดับ'}</button>
      {existing&&<button data-design-action="remove-diamond" onClick={()=>run(removeTemplateCommand(project.roads,existing,'ลบทางลาดของข้าวหลามตัด'))}>ลบทางลาดชุดนี้</button>}
    </div>
    <p className="design-meta">วางครั้งเดียวได้ทางต่างระดับ ทางลาดทางเดียว 4 เส้น (แยกออกและเข้าสู่ถนนหลัก) และทางแยกที่ปลายทางลาดบนถนนตัด · หลังวาง ทุกชิ้นเป็นถนนปกติ แก้ทีละชิ้นได้ · กดย้อนกลับครั้งเดียวเพื่อคืนสภาพเดิม · มุมแยกออก ระยะ และหน้าตัดทางลาดเป็นค่าตั้งต้นของเครื่องมือ</p>
  </details>;
}

/** On a template piece: the set it belongs to, with its pieces and removing the set. */
export function TemplatePiecesBlock({project,roadId,run,onSelectRoad}:{project:RoadFirstProject;roadId:string;run:Run;onSelectRoad:(id:string)=>void}){
  const road=project.roads.find(r=>r.id===roadId),group=road?.origin?.group;if(!group)return null;
  const pieces=templatePieces(project.roads,group);
  return <section className="design-block" data-design-template-pieces={pieces.length}>
    <small className="design-block-title">ส่วนหนึ่งของทางแยกต่างระดับแบบข้าวหลามตัด</small>
    <ul className="design-piece-list">{pieces.map(p=><li key={p.id}><button className="design-link" data-design-template-piece={p.id} onClick={()=>onSelectRoad(p.id)}>{p.name}</button>{p.id===roadId?' (ที่เลือกอยู่)':''}</li>)}</ul>
    <button data-design-action="remove-template" onClick={()=>run(removeTemplateCommand(project.roads,group,'ลบทางลาดของข้าวหลามตัด'))}>ลบทางลาดทั้งชุด</button>
  </section>;
}
