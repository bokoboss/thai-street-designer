// Typed edit commands for the road-first model (roadmap Phase 2).
// Every edit — a drag, a typed number, a menu action or future automation — is a plain JSON command.
// executeCommand() applies it, keeps junction decisions attached to their crossing, checks the result
// with the engine and returns a readable Thai label for the undo history. A rejected edit changes nothing.
import {designError} from '../junction/design-validation';
import {createHistory,recordStep,redoStep,undoStep,closeGroup,type History} from '../common/history';
import {validateNetworkProject,type WorldPoint} from '../network/network-project';
import {detectCandidates,type Candidate,type Decision,type JunctionTreatments,type Road,type RoadSection} from './derive';
import {parseLegKey,type ApproachOverride,type DesignSettings,type LegKey,type LegSlip,type LegTreatment} from './leg-binding';
import {compileRoadFirstProject,validateRoadFirstProject,type RoadFirstProject} from './project';
import {joinRoads} from './join';

export type RoadFirstCommand=
  |{type:'project.rename';title:string}
  |{type:'road.add';road:Road}
  |{type:'road.remove';roadId:string}
  |{type:'road.rename';roadId:string;name:string}
  |{type:'road.extend';roadId:string;atStart:boolean;points:WorldPoint[]}
  /** Make one road of two roads whose ends touch; roadId keeps its id, name and section. */
  |{type:'road.join';roadId:string;otherId:string}
  |{type:'road.movePoint';roadId:string;index:number;point:WorldPoint}
  |{type:'road.insertPoint';roadId:string;index:number;point:WorldPoint}
  |{type:'road.removePoint';roadId:string;index:number}
  |{type:'road.setPointRadius';roadId:string;index:number;radius:number}
  |{type:'road.setSection';roadId:string;patch:Partial<RoadSection>}
  |{type:'crossing.decide';candidateId:string;decision:Decision['decision'];name?:string}
  |{type:'junction.rename';candidateId:string;name:string}
  |{type:'junction.setRoads';candidateId:string;roads:string[]}
  |{type:'junction.setCorner';candidateId:string;corner:number}
  /** One corner's radius (null: back to the junction's radius); leg = the road leg the corner starts from. */
  |{type:'junction.setCornerAt';candidateId:string;leg:LegKey;radius:number|null}
  |{type:'junction.setDesign';candidateId:string;patch:DesignSettings}
  /** Every junction-owned setting at once (edits brought back from the advanced junction editor). */
  |{type:'junction.setTreatments';candidateId:string;treatments:JunctionTreatments|undefined}
  |{type:'leg.setApproach';candidateId:string;leg:LegKey;patch:ApproachOverride}
  |{type:'leg.setTreatment';candidateId:string;leg:LegKey;patch:LegTreatment}
  |{type:'leg.reset';candidateId:string;leg:LegKey}
  |{type:'slip.set';candidateId:string;slip:LegSlip}
  |{type:'slip.remove';candidateId:string;from:LegKey};

/**
 * autoJunctions: crossings that became junctions automatically in this step; openCrossings: crossings that could not (with the reason).
 * joined: roads that now reach an existing junction and were connected to it; blocked: roads that reach one but could not be connected.
 */
export type CommandResult={project:RoadFirstProject;error:string|null;label:string;warnings:string[];group?:string;autoJunctions:string[];openCrossings:{candidateId:string;reason:string}[];
  joined:{candidateId:string;roads:string[]}[];blocked:{candidateId:string;roads:string[];reason:string}[]};

const SECTION_LABEL:Record<keyof RoadSection,string>={forwardLanes:'ช่องขาไป',backwardLanes:'ช่องขากลับ',laneWidth:'ความกว้างช่อง',median:'เกาะกลาง',walk:'ทางเท้า',bands:'แถบริมทาง'};
const fmt=(v:unknown)=>typeof v==='number'?String(+v.toFixed(2)):Array.isArray(v)?`${v.length} แถบ`:String(v);

/** Re-attach every junction decision to the crossing it belongs to after roads change. */
export function rebindDecisions(before:Road[],after:Road[],decisions:Decision[]):Decision[]{
  const old=new Map(detectCandidates(before).map(c=>[c.id,c])),fresh=detectCandidates(after),taken=new Set<string>();
  const near=(a:WorldPoint,b:WorldPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
  const pending=decisions.map(d=>{
    const was=old.get(d.candidateId),roads=d.roads??was?.roads.map(r=>r.roadId)??[],at=was?.point??d.at;
    return{d,roads,at};
  });
  const out=new Map<Decision,Decision>();
  // Closest matches first, so two crossings of the same roads keep their own decisions.
  const options=pending.flatMap(p=>fresh.filter(c=>fits(c,p.roads)).map(c=>({p,c,gap:p.at?near(p.at,c.point):0}))).sort((a,b)=>a.gap-b.gap);
  for(const {p,c} of options){
    if(out.has(p.d)||taken.has(c.id))continue;
    taken.add(c.id);out.set(p.d,{...p.d,candidateId:c.id,at:{x:c.point.x,y:c.point.y}});
  }
  // A decision whose crossing is gone stays dormant at its last position until the roads cross again.
  // Its id is set aside so a new crossing of the same roads can take the old id without a clash.
  const used=new Set([...taken,...decisions.map(d=>d.candidateId)]);
  const dormantId=(id:string)=>{if(id.startsWith(DORMANT_PREFIX))return id;let n=1;while(used.has(`${DORMANT_PREFIX}${n}:${id}`))n++;const next=`${DORMANT_PREFIX}${n}:${id}`;used.add(next);return next;};
  return pending.map(p=>out.get(p.d)??{...p.d,candidateId:dormantId(p.d.candidateId),...(p.at?{at:p.at}:{})});
}
export const DORMANT_PREFIX='dormant:';
export const LEFT_WITH_SLIP='ปากทางนี้มี Slip lane เลี้ยวซ้ายแล้ว — ใช้ช่องชะลอก่อนเข้า Slip แทนเลนเลี้ยวซ้าย';
export const SLIP_WITH_LEFT='ปากทางนี้มีเลนเลี้ยวซ้ายแล้ว — ลบเลนเลี้ยวซ้ายก่อนเพิ่ม Slip lane (ใช้ช่องชะลอก่อนเข้า Slip แทนได้)';
function fits(c:Candidate,roads:string[]){
  const ids=c.roads.map(r=>r.roadId);
  return roads.length>=2&&roads.every(r=>ids.includes(r));
}

function dropRoad(p:RoadFirstProject,roadId:string):RoadFirstProject{
  const keep=(key:string)=>parseLegKey(key)?.roadId!==roadId,filter=<T>(r?:Partial<Record<LegKey,T>>)=>r&&Object.fromEntries(Object.entries(r).filter(([k])=>keep(k))) as Partial<Record<LegKey,T>>;
  const decisions=p.decisions.flatMap(d=>{
    const roads=d.roads?.filter(r=>r!==roadId);
    if(roads&&roads.length<2)return[];
    const t=d.treatments;
    return[{...d,...(roads?{roads}:{}),treatments:t&&{...t,legs:filter(t.legs),approaches:filter(t.approaches),slips:t.slips?.filter(s=>keep(s.from)&&(!s.to||keep(s.to)))}}];
  });
  return{...p,roads:p.roads.filter(r=>r.id!==roadId),decisions};
}

export function executeCommand(project:RoadFirstProject,cmd:RoadFirstCommand):CommandResult{
  const fail=(error:string,label='แก้ไข'):CommandResult=>({project,error,label,warnings:[],autoJunctions:[],openCrossings:[],joined:[],blocked:[]});
  const p=structuredClone(project);
  const road=(id:string)=>p.roads.find(r=>r.id===id);
  const decision=(id:string)=>p.decisions.find(d=>d.candidateId===id);
  const jname=(d:Decision|undefined)=>d?.name??'ทางแยก';
  const legName=(key:LegKey)=>{const l=parseLegKey(key),r=l&&road(l.roadId);return r?`${r.name} ${l!.side==='ahead'?'→':'←'}`:key;};
  let label='แก้ไข',group:string|undefined,roadsChanged=false;
  const t=(d:Decision)=>(d.treatments??={});
  switch(cmd.type){
    case 'project.rename':p.title=cmd.title;label=`เปลี่ยนชื่อโครงการเป็น ${cmd.title}`;group='project.rename';break;
    case 'road.add':{
      if(road(cmd.road.id))return fail(`มีถนนรหัส ${cmd.road.id} อยู่แล้ว`,`เพิ่มถนน ${cmd.road.name}`);
      p.roads.push(structuredClone(cmd.road));label=`เพิ่มถนน ${cmd.road.name}`;roadsChanged=true;break;
    }
    case 'road.remove':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      Object.assign(p,dropRoad(p,cmd.roadId));label=`ลบถนน ${r.name}`;roadsChanged=true;break;
    }
    case 'road.extend':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(!cmd.points.length)return fail('ไม่มีจุดให้ต่อถนน',`ต่อถนน ${r.name}`);
      const added=cmd.points.map(q=>({x:q.x,y:q.y}));
      r.points=cmd.atStart?[...added.reverse(),...r.points]:[...r.points,...added];
      label=`ต่อถนน ${r.name}`;roadsChanged=true;break;
    }
    case 'road.join':{
      const a=road(cmd.roadId),b=road(cmd.otherId);if(!a||!b)return fail('ไม่พบถนนที่จะเชื่อม');
      const out=joinRoads(p.roads,p.decisions,cmd.roadId,cmd.otherId,p.options.tolerance??1);
      if('error' in out)return fail(out.error,`เชื่อม ${a.name} กับ ${b.name}`);
      p.roads=out.roads;p.decisions=out.decisions;
      label=[`เชื่อม ${a.name} กับ ${b.name} เป็นถนนเดียว`,...out.notes].join(' · ');roadsChanged=true;break;
    }
    case 'road.rename':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      label=`เปลี่ยนชื่อถนน ${r.name} เป็น ${cmd.name}`;r.name=cmd.name;group=`road.rename:${r.id}`;break;
    }
    case 'road.movePoint':case 'road.insertPoint':case 'road.removePoint':case 'road.setPointRadius':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      const i=cmd.index,last=cmd.type==='road.insertPoint'?r.points.length:r.points.length-1;
      if(!Number.isInteger(i)||i<0||i>last)return fail('ไม่พบจุดแนวถนนที่เลือก');
      if(cmd.type==='road.movePoint'){r.points[i]={...r.points[i],x:cmd.point.x,y:cmd.point.y};label=`ย้ายจุดแนวถนน ${r.name}`;group=`road.move:${r.id}:${i}`;}
      else if(cmd.type==='road.insertPoint'){r.points.splice(i,0,{x:cmd.point.x,y:cmd.point.y});label=`เพิ่มจุดแนวถนน ${r.name}`;}
      else if(cmd.type==='road.removePoint'){if(r.points.length<=2)return fail('ถนนต้องมีอย่างน้อยสองจุด',`ลบจุดแนวถนน ${r.name}`);r.points.splice(i,1);label=`ลบจุดแนวถนน ${r.name}`;}
      else{r.points[i]={...r.points[i],radius:cmd.radius};label=`ปรับรัศมีโค้ง ${r.name} เป็น ${fmt(cmd.radius)} ม.`;group=`road.radius:${r.id}:${i}`;}
      roadsChanged=true;break;
    }
    case 'road.setSection':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      r.section={...r.section,...structuredClone(cmd.patch)};
      const keys=Object.keys(cmd.patch) as (keyof RoadSection)[];
      label=`ปรับหน้าตัด ${r.name}: ${keys.map(k=>`${SECTION_LABEL[k]} ${fmt(cmd.patch[k])}`).join(', ')}`;group=`road.section:${r.id}:${keys.join(',')}`;break;
    }
    case 'crossing.decide':{
      const c=detectCandidates(p.roads).find(x=>x.id===cmd.candidateId);if(!c)return fail('ไม่พบจุดตัดที่เลือก');
      const names=c.roads.map(x=>road(x.roadId)?.name??x.roadId).join(' × '),d=decision(c.id);
      const next:Decision={...d,candidateId:c.id,decision:cmd.decision,name:cmd.name??d?.name,roads:d?.roads??c.roads.map(x=>x.roadId),at:{x:c.point.x,y:c.point.y}};
      p.decisions=[...p.decisions.filter(x=>x!==d),next];
      label=cmd.decision==='junction'?`ยืนยันทางแยก ${next.name??names}`:cmd.decision==='grade-separated'?`กำหนด ${names} เป็นทางต่างระดับ`:`ไม่ใช้จุดตัด ${names}`;break;
    }
    default:{
      const d=decision(cmd.candidateId);if(!d||d.decision!=='junction')return fail('ไม่พบทางแยกที่เลือก');
      switch(cmd.type){
        case 'junction.rename':label=`เปลี่ยนชื่อ ${jname(d)} เป็น ${cmd.name}`;d.name=cmd.name;group=`junction.rename:${d.candidateId}`;break;
        case 'junction.setRoads':{
          if(cmd.roads.length<2||cmd.roads.some(id=>!road(id)))return fail('ทางแยกต้องมีถนนอย่างน้อยสองสาย');
          const at=detectCandidates(p.roads).find(c=>c.id===d.candidateId),out=at?at.roads.map(r=>r.roadId).filter(id=>!cmd.roads.includes(id)):[];
          d.roads=[...cmd.roads];if(out.length)d.excluded=out;else delete d.excluded;label=`กำหนดถนนที่บรรจบที่ ${jname(d)}: ${cmd.roads.map(id=>road(id)!.name).join(', ')}`;break;
        }
        case 'junction.setCorner':t(d).corner=cmd.corner;label=`ปรับรัศมีมุม ${jname(d)} เป็น ${fmt(cmd.corner)} ม.`;group=`junction.corner:${d.candidateId}`;break;
        case 'junction.setCornerAt':{
          const r=t(d).cornerRadii??={};
          if(cmd.radius===null)delete r[cmd.leg];else r[cmd.leg]=cmd.radius;
          if(!Object.keys(r).length)delete t(d).cornerRadii;
          label=cmd.radius===null?`ใช้รัศมีมุมเริ่มต้นที่มุม ${legName(cmd.leg)} · ${jname(d)}`:`ปรับรัศมีมุม ${legName(cmd.leg)} เป็น ${fmt(cmd.radius)} ม. · ${jname(d)}`;
          group=`junction.cornerAt:${d.candidateId}:${cmd.leg}`;break;
        }
        case 'junction.setDesign':t(d).design={...t(d).design,...structuredClone(cmd.patch)};label=`ปรับการตั้งค่า ${jname(d)}`;group=`junction.design:${d.candidateId}:${Object.keys(cmd.patch).join(',')}`;break;
        case 'junction.setTreatments':d.treatments=cmd.treatments?structuredClone(cmd.treatments):undefined;label=`แก้ทางแยกขั้นสูง ${jname(d)}`;break;
        case 'leg.setApproach':{
          const a=t(d).approaches??={};a[cmd.leg]={...a[cmd.leg],...structuredClone(cmd.patch)};
          label=`ปรับช่วงเข้าทางแยก ${legName(cmd.leg)} ที่ ${jname(d)}`;group=`leg.approach:${d.candidateId}:${cmd.leg}:${Object.keys(cmd.patch).join(',')}`;break;
        }
        case 'leg.setTreatment':{
          // A Slip lane already takes the left turn; a left-turn pocket beside it gives a broken channel (use the deceleration lane of the Slip).
          const hadLeft=(t(d).legs?.[cmd.leg]?.incomingPockets?.left?.lanes??0)>0,addsLeft=(cmd.patch.incomingPockets?.left?.lanes??0)>0;
          if(addsLeft&&!hadLeft&&t(d).slips?.some(s=>s.from===cmd.leg))return fail(LEFT_WITH_SLIP,`แก้ขา ${legName(cmd.leg)}`);
          const l=t(d).legs??={};l[cmd.leg]={...l[cmd.leg],...structuredClone(cmd.patch)};
          label=`แก้ขา ${legName(cmd.leg)} ที่ ${jname(d)}`;group=`leg.treatment:${d.candidateId}:${cmd.leg}:${Object.keys(cmd.patch).join(',')}`;break;
        }
        case 'leg.reset':{
          delete t(d).legs?.[cmd.leg];delete t(d).approaches?.[cmd.leg];label=`คืนค่าเริ่มต้นขา ${legName(cmd.leg)} ที่ ${jname(d)}`;break;
        }
        case 'slip.set':{
          const adding=!t(d).slips?.some(s=>s.from===cmd.slip.from);
          if(adding&&(t(d).legs?.[cmd.slip.from]?.incomingPockets?.left?.lanes??0)>0)return fail(SLIP_WITH_LEFT,`ตั้ง Slip lane จาก ${legName(cmd.slip.from)}`);
          t(d).slips=[...(t(d).slips??[]).filter(s=>s.from!==cmd.slip.from),structuredClone(cmd.slip)];
          label=`ตั้ง Slip lane จาก ${legName(cmd.slip.from)} ที่ ${jname(d)}`;group=`slip:${d.candidateId}:${cmd.slip.from}`;break;
        }
        case 'slip.remove':{
          const before=t(d).slips?.length??0;t(d).slips=(t(d).slips??[]).filter(s=>s.from!==cmd.from);
          if(t(d).slips!.length===before)return fail('ไม่พบ Slip lane ที่เลือก');
          label=`ลบ Slip lane จาก ${legName(cmd.from)} ที่ ${jname(d)}`;break;
        }
        default:return fail('ไม่รู้จักคำสั่งนี้');
      }
    }
  }
  const joined:CommandResult['joined']=[],blocked:CommandResult['blocked']=[];
  const overflowBefore=new Set(compileRoadFirstProject(project).overflow);
  if(roadsChanged){
    p.decisions=rebindDecisions(project.roads,p.roads,p.decisions);
    // A road that now passes through or ends at an existing junction joins it when the junction can take it;
    // otherwise it stays out and is reported. A road the junction already left out on purpose is not added back.
    const before=new Map(detectCandidates(project.roads).map(c=>[c.id,c.roads.map(r=>r.roadId)]));
    const now=new Map(detectCandidates(p.roads).map(c=>[c.id,c.roads.map(r=>r.roadId)]));
    p.decisions.forEach((d,i)=>{
      const was=project.decisions[i],there=now.get(d.candidateId);
      if(d.decision!=='junction'||!d.roads||!there||!was)return;
      const earlier=before.get(was.candidateId)??was.roads??[],fresh=there.filter(r=>!d.roads!.includes(r)&&!earlier.includes(r)&&!d.excluded?.includes(r));
      if(!fresh.length)return;
      const trial=p.decisions.map(x=>x===d?{...d,roads:[...d.roads!,...fresh]}:x),probe={...p,decisions:trial};
      const reason=newOverflow(probe,overflowBefore)??engineError(probe);
      if(reason)blocked.push({candidateId:d.candidateId,roads:fresh,reason});
      else{p.decisions=trial;joined.push({candidateId:d.candidateId,roads:fresh});}
    });
  }
  const structural=validateRoadFirstProject(p);if(structural)return fail(structural,label);
  const invalid=newOverflow(p,overflowBefore)??engineError(p);if(invalid)return fail(invalid,label);
  // New crossings become junctions automatically (owner decision 2026-10-19); one that cannot be built stays open with its reason.
  const autoJunctions:string[]=[],openCrossings:{candidateId:string;reason:string}[]=[];
  if(roadsChanged){
    const known=new Set(p.decisions.map(d=>d.candidateId));
    for(const c of detectCandidates(p.roads).filter(x=>!known.has(x.id))){
      const names=c.roads.map(r=>road(r.roadId)?.name??r.roadId);
      const trial=[...p.decisions,{candidateId:c.id,decision:'junction' as const,name:`แยก ${names.join(' × ')}`,roads:c.roads.map(r=>r.roadId),at:{x:c.point.x,y:c.point.y}}];
      const reason=newOverflow({...p,decisions:trial},overflowBefore)??engineError({...p,decisions:trial});
      if(reason)openCrossings.push({candidateId:c.id,reason});else{p.decisions=trial;autoJunctions.push(c.id);}
    }
    if(autoJunctions.length)label+=` · สร้างทางแยก ${autoJunctions.length} แห่ง`;
  }
  const roadNames=(ids:string[])=>ids.map(id=>road(id)?.name??id).join(', ');
  for(const j of joined)label+=` · ${roadNames(j.roads)} เข้าทางแยก ${jname(decision(j.candidateId))}`;
  const compiled=compileRoadFirstProject(p);
  const warnings=[...compiled.issues,...openCrossings.map(o=>`จุดตัดนี้ยังเป็นทางแยกไม่ได้ · ${o.reason}`),
    ...blocked.map(b=>`${roadNames(b.roads)} ถึง${jname(decision(b.candidateId))}แต่เชื่อมเข้าไม่ได้ · ${b.reason}`)];
  return{project:p,error:null,label,warnings,group,autoJunctions,openCrossings,joined,blocked};
}

/** A junction that now has more legs than supported (and did not before) is refused instead of losing legs. */
function newOverflow(p:RoadFirstProject,before:Set<string>):string|null{
  const c=compileRoadFirstProject(p),extra=c.overflow.filter(id=>!before.has(id));
  if(!extra.length)return null;
  const d=p.decisions.find(x=>x.candidateId===extra[0]);
  return `${d?.name??'ทางแยก'} จะมีเกิน 4 ขา · ตอนนี้ทางแยกรองรับสูงสุด 4 ขา`;
}

/** Engine check of the compiled network and every junction; null when the project can be built. */
function engineError(p:RoadFirstProject):string|null{
  const compiled=compileRoadFirstProject(p),engine=validateNetworkProject(compiled.project);
  if(engine)return`ทำไม่ได้ · ${engine}`;
  for(const j of compiled.project.junctions){const e=designError(j.design);if(e)return`${j.name}: ${e}`;}
  return null;
}

/** Editor state: the project plus its readable undo history. */
export type RoadFirstEditor={project:RoadFirstProject;history:History<RoadFirstProject>};
export const createEditor=(project:RoadFirstProject,limit=100):RoadFirstEditor=>({project,history:createHistory(limit)});

export function runCommand(editor:RoadFirstEditor,cmd:RoadFirstCommand):{editor:RoadFirstEditor;result:CommandResult}{
  const result=executeCommand(editor.project,cmd);
  if(result.error)return{editor,result};
  return{editor:{project:result.project,history:recordStep(editor.history,editor.project,result.label,result.group)},result};
}
/** Call when a drag or typed entry ends, so the next one becomes its own undo step. */
export const endGesture=(editor:RoadFirstEditor):RoadFirstEditor=>({...editor,history:closeGroup(editor.history)});
export function undo(editor:RoadFirstEditor){
  const r=undoStep(editor.history,editor.project);
  return r?{editor:{project:r.state,history:r.history},label:r.label}:null;
}
export function redo(editor:RoadFirstEditor){
  const r=redoStep(editor.history,editor.project);
  return r?{editor:{project:r.state,history:r.history},label:r.label}:null;
}
