// Typed edit commands for the road-first model (roadmap Phase 2).
// Every edit — a drag, a typed number, a menu action or future automation — is a plain JSON command.
// executeCommand() applies it, keeps junction decisions attached to their crossing, checks the result
// with the engine and returns a readable Thai label for the undo history. A rejected edit changes nothing.
import {authoredProfile,resolveVerticalProfile} from './elevation';
import {previewAlignmentUpgrade} from './alignment-upgrade';
import {designError} from '../junction/design-validation';
import {createHistory,recordStep,redoStep,undoStep,closeGroup,type History} from '../common/history';
import {validateNetworkProject,type WorldPoint} from '../network/network-project';
import {detectCandidates,stations,type Candidate,type Decision,type JunctionTreatments,type Road,type RoadOpening,type RoadRole,type RoadSection} from './derive';
import {parseLegKey,type ApproachOverride,type DesignSettings,type LegKey,type LegSlip,type LegTreatment} from './leg-binding';
import {compileRoadFirstProject,validateRoadFirstProject,type RoadFirstProject} from './project';
import {joinRoads} from './join';
import {splitRoad} from './split';
import {laneRunError,type LaneRun} from './lane-runs';
import {reverseRoad,straightenRoad} from './reshape';
import {LEVEL_TOLERANCE,levelAt,type Profile} from './elevation';
import {anchorNote,rampError,reattachRamps,type AuxLane,type RampEnd} from './ramps';
import {MAX_RADIUS,vertexCurve} from './curves';
import {LEVEL_CRITERIA_LABEL,type Criterion,type LevelCriteriaKey} from './level-criteria';

export type RoadFirstCommand=
  |{type:'project.upgradeAlignment'}
  |{type:'project.rename';title:string}
  /** Several edits as one undo step (templates); stops at the first refused edit and changes nothing. */
  |{type:'batch';commands:RoadFirstCommand[];label:string;quiet?:boolean}
  /** Level criteria of the project (value and source per criterion); null removes one (back to the tool value). */
  |{type:'project.setLevelCriteria';patch:Partial<Record<LevelCriteriaKey,Criterion|null>>}
  |{type:'road.add';road:Road}
  |{type:'road.remove';roadId:string}
  |{type:'road.rename';roadId:string;name:string}
  /** levels: level of each added point (drawn at a level); the road's profile is extended with them. */
  |{type:'road.extend';roadId:string;atStart:boolean;points:WorldPoint[];levels?:number[]}
  /** Make one road of two roads whose ends touch; roadId keeps its id, name and section. */
  |{type:'road.join';roadId:string;otherId:string}
  /** Move whole roads by one offset (a selection dragged or moved by typed distances). */
  |{type:'roads.move';roadIds:string[];delta:WorldPoint}
  /** Reverse a road's drawing direction (a two-way road keeps its traffic; a ramp changes its direction of travel). */
  |{type:'road.reverse';roadId:string}
  /** Remove the points between two points of a road (a straight line between them). */
  |{type:'road.straighten';roadId:string;from:number;to:number}
  /** Split a road in two at a point on a straight stretch; the second piece gets `newId`. */
  |{type:'road.split';roadId:string;at:WorldPoint;newId:string}
  |{type:'road.movePoint';roadId:string;index:number;point:WorldPoint}
  |{type:'road.insertPoint';roadId:string;index:number;point:WorldPoint}
  |{type:'road.removePoint';roadId:string;index:number}
  |{type:'road.setPointRadius';roadId:string;index:number;radius:number}
  |{type:'road.setSection';roadId:string;patch:Partial<RoadSection>}
  |{type:'road.setRole';roadId:string;role:RoadRole|null}
  |{type:'road.setOpenings';roadId:string;openings:RoadOpening[]}
  /** Lanes added along stretches of the road (road stations). */
  |{type:'road.setLaneRuns';roadId:string;runs:LaneRun[]}
  |{type:'road.setProfile';roadId:string;profile:Profile|null}
  /** Grade-separated crossing with `over` passing over, and the road profiles that make it so (one undo step). */
  |{type:'crossing.setOver';candidateId:string;owner?:string;over:string;profiles:Record<string,Profile|null>;label:string;
    /** Untagged level points the user explicitly agreed to remove (earlier work of unknown source). */
    release?:{roadId:string;station:number}[]}
  /** Unhook a ramp end from the road it diverges from or merges into; the end point stays where it is. */
  |{type:'ramp.detach';roadId:string;end:RampEnd}
  /** Auxiliary lane on the main road at a ramp end (deceleration before a diverge, acceleration after a merge); null removes it. */
  |{type:'ramp.setLane';roadId:string;end:RampEnd;lane:AuxLane|null}
  |{type:'road.setRoadside';roadId:string;roadside:{trees:boolean;lights:boolean}|null}
  |{type:'crossing.decide';candidateId:string;decision:Decision['decision'];name?:string}
  |{type:'junction.rename';candidateId:string;name:string}
  |{type:'junction.setRoads';candidateId:string;roads:string[]}
  |{type:'junction.setCorner';candidateId:string;corner:number}
  /** One corner's radius (null: back to the junction's radius); leg = the road leg the corner starts from. */
  |{type:'junction.setCornerAt';candidateId:string;leg:LegKey;radius:number|null}
  |{type:'junction.setDesign';candidateId:string;patch:DesignSettings}
  /** Every junction-owned setting at once (edits brought back from the advanced junction editor). */
  |{type:'junction.setTreatments';candidateId:string;treatments:JunctionTreatments|undefined;label?:string}
  |{type:'leg.setApproach';candidateId:string;leg:LegKey;patch:ApproachOverride}
  |{type:'leg.setTreatment';candidateId:string;leg:LegKey;patch:LegTreatment}
  /** The same leg patch on every approach of a junction (e.g. signals on all approaches), one undo step. */
  |{type:'junction.setAllLegs';candidateId:string;patch:LegTreatment;label:string}
  |{type:'leg.reset';candidateId:string;leg:LegKey}
  |{type:'slip.set';candidateId:string;slip:LegSlip}
  |{type:'slip.remove';candidateId:string;from:LegKey};

/**
 * autoJunctions: crossings that became junctions automatically in this step; openCrossings: crossings that could not (with the reason).
 * joined: roads that now reach an existing junction and were connected to it; blocked: roads that reach one but could not be connected.
 */
/** autoSeparated: new crossings of roads at different levels, made grade-separated (higher road over) instead of junctions. */
export type CommandResult={project:RoadFirstProject;error:string|null;label:string;warnings:string[];group?:string;autoJunctions:string[];autoSeparated:string[];openCrossings:{candidateId:string;reason:string}[];
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
  const fail=(error:string,label='แก้ไข'):CommandResult=>({project,error,label,warnings:[],autoJunctions:[],autoSeparated:[],openCrossings:[],joined:[],blocked:[]});
  const p=structuredClone(project);
  const road=(id:string)=>p.roads.find(r=>r.id===id);
  const decision=(id:string)=>p.decisions.find(d=>d.candidateId===id);
  const jname=(d:Decision|undefined)=>d?.name??'ทางแยก';
  const legName=(key:LegKey)=>{const l=parseLegKey(key),r=l&&road(l.roadId);return r?`${r.name} ${l!.side==='ahead'?'→':'←'}`:key;};
  let label='แก้ไข',group:string|undefined,roadsChanged=false,splitAt:{from:string;into:string;at:number}|undefined;
  const t=(d:Decision)=>(d.treatments??={});
  if(cmd.type==='batch'){
    let cur=project;const acc:Omit<CommandResult,'project'|'error'|'label'|'group'>={warnings:[],autoJunctions:[],autoSeparated:[],openCrossings:[],joined:[],blocked:[]};
    for(const sub of cmd.commands){
      const r=executeCommand(cur,sub);if(r.error)return fail(r.error,cmd.label);
      cur=r.project;acc.autoJunctions.push(...r.autoJunctions);acc.autoSeparated.push(...r.autoSeparated);acc.openCrossings.push(...r.openCrossings);acc.joined.push(...r.joined);acc.blocked.push(...r.blocked);acc.warnings=r.warnings;
    }
    // quiet (templates): the junctions and separations it makes are intended, so no "made automatically" notice.
    if(cmd.quiet){acc.autoJunctions=[];acc.autoSeparated=[];}
    return{project:cur,error:null,label:cmd.label,...acc};
  }
  switch(cmd.type){
    case 'project.upgradeAlignment':{
      const upgraded=previewAlignmentUpgrade(project);
      if(upgraded.errors.length)return fail(upgraded.errors.join(' · '),'แปลงระยะตามแนวโค้ง');
      Object.assign(p,upgraded.project);label='แปลงระยะตามแนวโค้ง';break;
    }
    case 'project.rename':p.title=cmd.title;label=`เปลี่ยนชื่อโครงการเป็น ${cmd.title}`;group='project.rename';break;
    case 'project.setLevelCriteria':{
      const levels={...p.options.levels};
      for(const [k,v] of Object.entries(cmd.patch) as [LevelCriteriaKey,Criterion|null][]){if(v)levels[k]={value:v.value,...(v.source?.trim()?{source:v.source.trim()}:{})};else delete levels[k];}
      if(Object.keys(levels).length)p.options={...p.options,levels};else{const {levels:_drop,...rest}=p.options;void _drop;p.options=rest;}
      const keys=Object.keys(cmd.patch) as LevelCriteriaKey[];
      label=`เกณฑ์ระดับ: ${keys.map(k=>`${LEVEL_CRITERIA_LABEL[k]} ${cmd.patch[k]?fmt(cmd.patch[k]!.value):'ค่าเริ่มต้น'}`).join(', ')}`;group=`project.levels:${keys.join(',')}`;break;
    }
    case 'road.add':{
      if(road(cmd.road.id))return fail(`มีถนนรหัส ${cmd.road.id} อยู่แล้ว`,`เพิ่มถนน ${cmd.road.name}`);
      p.roads.push({...structuredClone(cmd.road),...(p.schemaVersion>=2?{alignment:'arc' as const}:{})});label=`เพิ่มถนน ${cmd.road.name}`;roadsChanged=true;break;
    }
    case 'road.remove':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      Object.assign(p,dropRoad(p,cmd.roadId));label=`ลบถนน ${r.name}`;roadsChanged=true;break;
    }
    case 'road.extend':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(!cmd.points.length)return fail('ไม่มีจุดให้ต่อถนน',`ต่อถนน ${r.name}`);
      const added=cmd.points.map(q=>({x:q.x,y:q.y}));
      const oldLength=stations(r.points,r.alignment).at(-1)??0;
      r.points=cmd.atStart?[...added.reverse(),...r.points]:[...r.points,...added];
      // Openings and levels are measured from the road start: extending the start moves them along by the added length.
      const grown=(stations(r.points,r.alignment).at(-1)??0)-oldLength,shift=(v:number)=>Math.round((v+(cmd.atStart?grown:0))*1000)/1000;
      if(cmd.atStart&&r.openings)r.openings=r.openings.map(o=>({...o,station:shift(o.station)}));
      if(cmd.atStart&&r.laneRuns)r.laneRuns=r.laneRuns.map(x=>({...x,start:shift(x.start),end:shift(x.end)}));
      if(r.profile||cmd.levels?.some(z=>Math.abs(z)>1e-9)){
        const s=stations(r.points,r.alignment),n=added.length,at=(k:number)=>s[cmd.atStart?n-1-k:r.points.length-n+k];
        // Without a profile the old road lies at level 0; its far end keeps that level.
        const kept=(r.profile??[{station:0,z:0},{station:oldLength,z:0}]).map(q=>({...q,station:shift(q.station)}));
        const fresh=cmd.points.map((_,k)=>({station:Math.round(at(k)*1000)/1000,z:cmd.levels?.[k]??levelAt(r.profile,cmd.atStart?0:oldLength)}));
        r.profile=[...kept,...fresh].sort((a,b)=>a.station-b.station).filter((q,i,all)=>i===0||q.station-all[i-1].station>=.01);
      }
      label=`ต่อถนน ${r.name}`;roadsChanged=true;break;
    }
    case 'road.join':{
      const a=road(cmd.roadId),b=road(cmd.otherId);if(!a||!b)return fail('ไม่พบถนนที่จะเชื่อม');
      const out=joinRoads(p.roads,p.decisions,cmd.roadId,cmd.otherId,p.options.tolerance??1);
      if('error' in out)return fail(out.error,`เชื่อม ${a.name} กับ ${b.name}`);
      p.roads=out.roads;p.decisions=out.decisions;
      label=[`เชื่อม ${a.name} กับ ${b.name} เป็นถนนเดียว`,...out.notes].join(' · ');roadsChanged=true;break;
    }
    case 'roads.move':{
      const ids=[...new Set(cmd.roadIds)],list=ids.map(id=>road(id));
      if(!ids.length||list.some(r=>!r))return fail('ไม่พบถนนที่เลือก');
      if(!Number.isFinite(cmd.delta.x)||!Number.isFinite(cmd.delta.y)||Math.hypot(cmd.delta.x,cmd.delta.y)>1e6)return fail('ระยะย้ายไม่ถูกต้อง');
      const r3=(v:number)=>Math.round(v*1000)/1000;
      for(const r of list as Road[])r.points=r.points.map(q=>({...q,x:r3(q.x+cmd.delta.x),y:r3(q.y+cmd.delta.y)}));
      label=list.length===1?`ย้ายถนน ${list[0]!.name}`:`ย้ายถนน ${list.length} สาย`;group=`roads.move:${ids.slice().sort().join(',')}`;roadsChanged=true;break;
    }
    case 'road.reverse':case 'road.straighten':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      const out=cmd.type==='road.reverse'?reverseRoad(p.roads,p.decisions,cmd.roadId):straightenRoad(p.roads,p.decisions,cmd.roadId,cmd.from,cmd.to);
      const what=cmd.type==='road.reverse'?`กลับทิศการวาด ${r.name}`:`ทำแนวตรง ${r.name} จากจุดที่ ${cmd.from+1} ถึง ${cmd.to+1}`;
      if('error' in out)return fail(out.error,what);
      p.roads=out.roads;p.decisions=out.decisions;label=[what,...out.notes].join(' · ');roadsChanged=true;break;
    }
    case 'road.split':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      const names=new Set(p.roads.map(x=>x.name));let n=2;while(names.has(`${r.name} (${n})`))n++;
      const out=splitRoad(p.roads,p.decisions,cmd.roadId,cmd.at,cmd.newId,`${r.name} (${n})`);
      if('error' in out)return fail(out.error,`แยกถนน ${r.name}`);
      p.roads=out.roads;p.decisions=out.decisions;splitAt={from:cmd.roadId,into:cmd.newId,at:out.station};
      label=[`แยกถนน ${r.name} ที่ระยะ ${out.station.toFixed(1)} ม.`,...out.notes].join(' · ');roadsChanged=true;break;
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
      else{
        if(!(Number.isFinite(cmd.radius)&&cmd.radius>=0&&cmd.radius<=(r.alignment==='arc'?1e7:MAX_RADIUS)))return fail(r.alignment==='arc'?'รัศมีโค้งต้องเป็นจำนวนที่ไม่ติดลบและอยู่ในขอบเขตข้อมูลที่รองรับ':`รัศมีโค้งต้องอยู่ระหว่าง 0–${MAX_RADIUS} ม.`,`ปรับรัศมีโค้ง ${r.name}`);
        if(cmd.radius>0&&!vertexCurve(r.points,i))return fail('จุดนี้เป็นปลายถนนหรือแนวถนนไม่หักมุม จึงทำโค้งไม่ได้',`ปรับรัศมีโค้ง ${r.name}`);
        if(cmd.radius>0)r.points[i]={...r.points[i],radius:cmd.radius};else{const {radius:_drop,...rest}=r.points[i];void _drop;r.points[i]=rest;}
        const c=vertexCurve(r.points,i);
        label=cmd.radius>0?`ปรับรัศมีโค้ง ${r.name} เป็น ${fmt(cmd.radius)} ม.${c&&c.radius<cmd.radius-.01?` (ช่วงตรงรับได้ ${fmt(Math.floor(c.maxRadius*10+1e-6)/10)} ม.)`:''}`:`ทำมุมตรง ${r.name} ที่จุด ${i+1}`;
        group=`road.radius:${r.id}:${i}`;
      }
      roadsChanged=true;break;
    }
    case 'road.setRole':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(cmd.role)r.role=cmd.role;else delete r.role;
      label=cmd.role==='access'?`ตั้ง ${r.name} เป็นทางเข้าโครงการ`:cmd.role==='ramp'?`ตั้ง ${r.name} เป็นทางลาด`:`ตั้ง ${r.name} เป็นถนนทั่วไป`;roadsChanged=true;break;
    }
    case 'ramp.detach':{
      const r=road(cmd.roadId);if(!r?.anchors?.[cmd.end])return fail('ไม่พบจุดเชื่อมทางลาดที่เลือก');
      const main=road(r.anchors[cmd.end]!.roadId)?.name??'';delete r.anchors[cmd.end];if(!r.anchors.start&&!r.anchors.end)delete r.anchors;
      label=`ปลด ${r.name} ออกจาก ${main}`;break;
    }
    case 'road.setProfile':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(cmd.profile?.length)r.profile=authoredProfile(structuredClone(cmd.profile),r.profile).sort((a,b)=>a.station-b.station);else delete r.profile;
      if(r.profile?.some(q=>q.curveLength!==undefined||q.generatedBy!==undefined))p.schemaVersion=3;
      label=`แก้แนวดิ่ง ${r.name}`;group=`road.profile:${r.id}`;roadsChanged=true;break;
    }
    case 'crossing.setOver':{
      const c=detectCandidates(p.roads).find(x=>x.id===cmd.candidateId);if(!c)return fail('ไม่พบจุดตัดที่เลือก');
      if(!c.roads.some(x=>x.roadId===cmd.over))return fail('ถนนนี้ไม่ได้อยู่ที่จุดตัดนี้');
      const owner=cmd.owner??decision(c.id)?.profileOwner??cmd.candidateId;
      if(decision(c.id)?.profileOwner&&decision(c.id)!.profileOwner!==owner)return fail('เจ้าของแนวดิ่งเปลี่ยน — ตรวจผลใหม่ก่อนยืนยัน',cmd.label);
      for(const [id,profile] of Object.entries(cmd.profiles)){
        const r=road(id);if(!r)return fail('ไม่พบถนนที่เลือก');
        const released=(q:{station:number;generatedBy?:string})=>!q.generatedBy&&!!cmd.release?.some(x=>x.roadId===id&&Math.abs(x.station-q.station)<1e-6);
        const protectedPoint=r.profile?.find(q=>q.generatedBy!==owner&&!released(q)&&!profile?.some(p=>p.station===q.station&&p.z===q.z&&(p.curveLength??0)===(q.curveLength??0)&&p.generatedBy===q.generatedBy));
        if(protectedPoint)return fail(`${r.name}: ต้องเก็บจุดระดับเดิมที่ระยะ ${protectedPoint.station} ม.`,cmd.label);
        if(profile?.length)r.profile=structuredClone(profile);else delete r.profile;
        if(profile?.some(q=>q.curveLength!==undefined||q.generatedBy!==undefined))p.schemaVersion=3;
      }
      const d=decision(c.id),next:Decision={...d,profileOwner:owner,candidateId:c.id,decision:'grade-separated',over:cmd.over,roads:d?.roads??c.roads.map(x=>x.roadId),at:{x:c.point.x,y:c.point.y}};
      delete next.treatments;delete next.name;
      p.schemaVersion=3;p.decisions=[...p.decisions.filter(x=>x!==d),next];label=cmd.label;break;
    }
    case 'road.setRoadside':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(cmd.roadside&&(cmd.roadside.trees||cmd.roadside.lights))r.roadside={...cmd.roadside};else delete r.roadside;
      label=`ต้นไม้และเสาไฟ ${r.name}: ${r.roadside?[r.roadside.trees?'ต้นไม้':'',r.roadside.lights?'เสาไฟ':''].filter(Boolean).join(' + '):'ไม่มี'}`;break;
    }
    case 'ramp.setLane':{
      const r=road(cmd.roadId);if(!r||r.role!=='ramp')return fail('ไม่พบทางลาดที่เลือก');
      const what=cmd.end==='start'?'ช่องลดความเร็วก่อนแยกออก':'ช่องเร่งความเร็วหลังเข้าสู่';
      if(cmd.lane&&!(cmd.lane.length>=10&&cmd.lane.length<=1000&&cmd.lane.taper>=0&&cmd.lane.taper<=300))return fail('ความยาวช่องเสริม 10–1000 ม. และช่วงเปลี่ยน 0–300 ม.',what);
      if(cmd.lane&&!r.anchors?.[cmd.end])return fail(`ปลายนี้ของ ${r.name} ไม่ได้ต่อกับข้างถนน — ต่อปลายทางลาดกับถนนก่อน`,what);
      const next={...r.terminals,[cmd.end]:cmd.lane??undefined};if(!cmd.lane)delete next[cmd.end];
      if(next.start||next.end)r.terminals=next;else delete r.terminals;
      label=`${cmd.lane?'ตั้ง':'ลบ'}${what} ${r.name}`;group=`ramp.lane:${r.id}:${cmd.end}`;roadsChanged=true;break;
    }
    case 'road.setLaneRuns':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(cmd.runs.length)r.laneRuns=structuredClone(cmd.runs).sort((a,b)=>a.start-b.start);else delete r.laneRuns;
      const e=laneRunError(r,stations(r.points,r.alignment).at(-1)??0);if(e)return fail(e,`แก้ช่องจราจรเพิ่ม ${r.name}`);
      label=`แก้ช่องจราจรเพิ่ม ${r.name}`;group=`road.laneRuns:${r.id}`;roadsChanged=true;break;
    }
    case 'road.setOpenings':{
      const r=road(cmd.roadId);if(!r)return fail('ไม่พบถนนที่เลือก');
      if(cmd.openings.length)r.openings=structuredClone(cmd.openings);else delete r.openings;
      label=`แก้ช่องเปิดเกาะกลาง ${r.name}`;group=`road.openings:${r.id}`;break;
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
        case 'junction.setTreatments':d.treatments=cmd.treatments?structuredClone(cmd.treatments):undefined;label=`${cmd.label??'แก้ทางแยกขั้นสูง'} ${jname(d)}`;break;
        case 'leg.setApproach':{
          const a=t(d).approaches??={};a[cmd.leg]={...a[cmd.leg],...structuredClone(cmd.patch)};
          label=`ปรับช่วงเข้าทางแยก ${legName(cmd.leg)} ที่ ${jname(d)}`;group=`leg.approach:${d.candidateId}:${cmd.leg}:${Object.keys(cmd.patch).join(',')}`;break;
        }
        case 'junction.setAllLegs':{
          // Signals and stop lines apply only to approaches with incoming lanes.
          const before=compileRoadFirstProject(project),needsIncoming='signal' in cmd.patch||'stop' in cmd.patch;
          const keys=before.legs.filter(l=>before.sources.junctions[l.junctionId]===d.candidateId)
            .filter(l=>!needsIncoming||(before.project.junctions.find(j=>j.id===l.junctionId)?.design.arms[l.armId]?.incoming??0)>0)
            .map(l=>`${l.roadId}:${l.side}` as LegKey);
          if(!keys.length)return fail('ไม่พบปากทางของทางแยกนี้');
          const l=t(d).legs??={};for(const k of keys)l[k]={...l[k],...structuredClone(cmd.patch)};
          label=`${cmd.label} ที่ ${jname(d)}`;break;
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
  // Ramp ends stay on the edge of the road they attach to, whatever the edit changed.
  {
    const joined=cmd.type==='road.join'?{from:cmd.otherId,into:cmd.roadId}:undefined;
    const next=reattachRamps(project.roads,p.roads,{joined,remap:!!joined||(cmd.type==='road.extend'&&cmd.atStart)||cmd.type==='road.reverse'||cmd.type==='road.straighten',...(splitAt?{split:splitAt}:{})});
    const shape=(rs:Road[])=>JSON.stringify(rs.map(r=>r.points));
    if(shape(next)!==shape(p.roads))roadsChanged=true;
    p.roads=next;
    if(cmd.type==='road.add')label+=anchorNote(p.roads,road(cmd.road.id));
  }
  const joined:CommandResult['joined']=[],blocked:CommandResult['blocked']=[],passedJunction:string[]=[];
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
      const earlier=before.get(was.candidateId)??was.roads??[],found=there.filter(r=>!d.roads!.includes(r)&&!earlier.includes(r)&&!d.excluded?.includes(r));
      if(!found.length)return;
      // A road at another level passes over or under the junction instead of joining it.
      const at=detectCandidates(p.roads).find(x=>x.id===d.candidateId)!,levelOf=(id:string)=>{const ref=at.roads.find(r=>r.roadId===id);return ref?levelAt(road(id)?.profile,ref.station):0;};
      const zj=d.roads.map(levelOf),mean=zj.reduce((t,v)=>t+v,0)/(zj.length||1);
      const passing=found.filter(r=>Math.abs(levelOf(r)-mean)>LEVEL_TOLERANCE),fresh=found.filter(r=>!passing.includes(r));
      if(passing.length){d.excluded=[...(d.excluded??[]),...passing];passedJunction.push(...passing);}
      if(!fresh.length)return;
      const trial=p.decisions.map(x=>x===d?{...d,roads:[...d.roads!,...fresh]}:x),probe={...p,decisions:trial};
      const reason=newOverflow(probe,overflowBefore)??engineError(probe);
      if(reason)blocked.push({candidateId:d.candidateId,roads:fresh,reason});
      else{p.decisions=trial;joined.push({candidateId:d.candidateId,roads:fresh});}
    });
  }
  // A junction of two crossing roads whose levels the edit pulled apart (a road raised or lowered there) becomes a
  // grade separation, higher road over, announced like a new one; one undo brings the junction back.
  const separatedJunctions:string[]=[],separatedIds:string[]=[];
  if(roadsChanged){
    const now=detectCandidates(p.roads);
    p.decisions=p.decisions.map(d=>{
      const c=now.find(x=>x.id===d.candidateId);
      if(d.decision!=='junction'||!c||c.kind!=='cross'||c.roads.length!==2||(d.roads&&d.roads.length!==2))return d;
      const z=(rs:Road[],ref:{roadId:string;station:number})=>levelAt(rs.find(r=>r.id===ref.roadId)?.profile,ref.station);
      const [a,b]=c.roads,gap=z(p.roads,a)-z(p.roads,b),was=z(project.roads,a)-z(project.roads,b);
      if(Math.abs(gap)<=LEVEL_TOLERANCE||Math.abs(was)>LEVEL_TOLERANCE)return d;
      separatedJunctions.push(d.name??d.candidateId);separatedIds.push(d.candidateId);
      return{...(d.profileOwner?{profileOwner:d.profileOwner}:{}),candidateId:d.candidateId,decision:'grade-separated',over:gap>0?a.roadId:b.roadId,roads:c.roads.map(r=>r.roadId),at:{x:c.point.x,y:c.point.y}};
    });
    if(separatedJunctions.length)label+=` · ${separatedJunctions.join(', ')} เป็นทางต่างระดับ`;
  }
  const structural=validateRoadFirstProject(p);if(structural)return fail(structural,label);
  const invalid=newOverflow(p,overflowBefore)??engineError(p);if(invalid)return fail(invalid,label);
  // New crossings become junctions automatically (owner decision 2026-10-19); one that cannot be built stays open with its reason.
  const autoJunctions:string[]=[],autoSeparated:string[]=[...separatedIds],openCrossings:{candidateId:string;reason:string}[]=[];
  // A junction with a project access is named after the access ("ทางเข้า 1").
  const accessName=(ids:string[])=>p.roads.find(r=>ids.includes(r.id)&&r.role==='access')?.name;
  if(roadsChanged){
    const known=new Set(p.decisions.map(d=>d.candidateId));
    for(const c of detectCandidates(p.roads).filter(x=>!known.has(x.id))){
      const names=c.roads.map(r=>road(r.roadId)?.name??r.roadId);
      // Roads at different levels cross without a junction: the higher one passes over (Phase 4A).
      const levels=c.roads.map(r=>({id:r.roadId,z:levelAt(road(r.roadId)?.profile,r.station)})).sort((a,b)=>b.z-a.z);
      if(levels.length===2&&levels[0].z-levels[1].z>LEVEL_TOLERANCE){
        p.decisions=[...p.decisions,{candidateId:c.id,decision:'grade-separated',over:levels[0].id,roads:c.roads.map(r=>r.roadId),at:{x:c.point.x,y:c.point.y}}];
        autoSeparated.push(c.id);continue;
      }
      // Three or more roads at one point: roads at one level meet in a junction, the others pass over or under it;
      // all at different levels = a stack of grade separations (Phase 4B-2).
      const groups=levelGroups(levels);
      if(levels.length>2&&groups.length>1){
        const meeting=groups.filter(g=>g.length>1);
        if(!meeting.length){p.decisions=[...p.decisions,{candidateId:c.id,decision:'grade-separated',roads:c.roads.map(r=>r.roadId),at:{x:c.point.x,y:c.point.y}}];autoSeparated.push(c.id);continue;}
        if(meeting.length>1){openCrossings.push({candidateId:c.id,reason:'ทางแยกสองระดับซ้อนกันที่จุดเดียวกันยังทำไม่ได้ — ปรับระดับให้มีทางแยกระดับเดียว'});continue;}
        const ids=meeting[0],passing=c.roads.map(r=>r.roadId).filter(id=>!ids.includes(id));
        const trial=[...p.decisions,{candidateId:c.id,decision:'junction' as const,name:accessName(ids)??`แยก ${ids.map(id=>road(id)?.name??id).join(' × ')}`,roads:ids,excluded:passing,at:{x:c.point.x,y:c.point.y}}];
        const reason=newOverflow({...p,decisions:trial},overflowBefore)??engineError({...p,decisions:trial});
        if(reason)openCrossings.push({candidateId:c.id,reason});else{p.decisions=trial;autoJunctions.push(c.id);autoSeparated.push(c.id);}
        continue;
      }
      const trial=[...p.decisions,{candidateId:c.id,decision:'junction' as const,name:accessName(c.roads.map(r=>r.roadId))??`แยก ${names.join(' × ')}`,roads:c.roads.map(r=>r.roadId),at:{x:c.point.x,y:c.point.y}}];
      const reason=newOverflow({...p,decisions:trial},overflowBefore)??engineError({...p,decisions:trial});
      if(reason)openCrossings.push({candidateId:c.id,reason});else{p.decisions=trial;autoJunctions.push(c.id);}
    }
    if(autoJunctions.length)label+=` · สร้างทางแยก ${autoJunctions.length} แห่ง`;
    if(autoSeparated.length)label+=` · ทางต่างระดับ ${autoSeparated.length} แห่ง`;
    if(passedJunction.length)label+=` · ${passedJunction.map(id=>road(id)?.name??id).join(', ')} ผ่านต่างระดับที่ทางแยก`;
  }
  const rampProblem=rampError(p.roads,p.decisions);if(rampProblem)return fail(rampProblem,label);
  const roadNames=(ids:string[])=>ids.map(id=>road(id)?.name??id).join(', ');
  for(const j of joined)label+=` · ${roadNames(j.roads)} เข้าทางแยก ${jname(decision(j.candidateId))}`;
  const compiled=compileRoadFirstProject(p);
  const warnings=[...compiled.issues,...openCrossings.map(o=>`จุดตัดนี้ยังเป็นทางแยกไม่ได้ · ${o.reason}`),
    ...blocked.map(b=>`${roadNames(b.roads)} ถึง${jname(decision(b.candidateId))}แต่เชื่อมเข้าไม่ได้ · ${b.reason}`)];
  return{project:p,error:null,label,warnings,group,autoJunctions,autoSeparated,openCrossings,joined,blocked};
}

/** Road ids grouped by level (each group within the same-level tolerance of its neighbour), highest first. */
function levelGroups(levels:{id:string;z:number}[]):string[][]{
  const out:string[][]=[];let last=Infinity;
  for(const l of levels){if(last-l.z>LEVEL_TOLERANCE||!out.length)out.push([l.id]);else out[out.length-1].push(l.id);last=l.z;}
  return out;
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
  if(compiled.shortfalls.some(s=>p.roads.some(r=>r.id===s.roadId&&r.alignment==='arc'&&r.points.some(q=>(q.radius??0)>=.25))))return 'ช่วงตรงสำหรับปากทางแยกไม่พอ — ย้ายจุดตัดออกจากโค้งหรือปรับแนวถนน';
  const verticals=new Map(p.roads.filter(r=>r.profile?.some(q=>(q.curveLength??0)>0)).map(r=>[r.id,resolveVerticalProfile(r.profile)]));
  const candidates=verticals.size?detectCandidates(p.roads):[];
  for(const leg of compiled.legs){
    const vertical=verticals.get(leg.roadId);if(!vertical)continue;
    const road=p.roads.find(r=>r.id===leg.roadId)!,j=compiled.project.junctions.find(j=>j.id===leg.junctionId)!;
    const ref=candidates.find(c=>c.id===compiled.sources.junctions[j.id])?.roads.find(r=>r.roadId===road.id);
    if(!ref)continue;
    const cut=ref.station+(leg.side==='ahead'?1:-1)*j.design.arms[leg.armId].length;
    if(vertical.curves.some(c=>c.start<Math.max(cut,ref.station)&&c.end>Math.min(cut,ref.station)&&(Math.abs(c.g0)>1e-8||Math.abs(c.g1)>1e-8)))return `${road.name}: โค้งดิ่งอยู่ในช่วงปากทางแยกที่ใช้ระดับคงที่ — ย้ายโค้งหรือปรับการเชื่อมต่อ`;
  }
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
