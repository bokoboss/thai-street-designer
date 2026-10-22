// Road-first project file (ADR-0002, Phase 2): roads own alignment and section; junction decisions
// own approaches, corners, treatments and junction-wide settings. Compiles to a NetworkProject.
import {validateNetworkProject} from '../network/network-project';
import {profileError} from './elevation';
import {compileRoadNetwork,type CompileOptions,type CompileResult,type Decision,type Road} from './derive';

export const ROAD_FIRST_SCHEMA_VERSION=1;
export type RoadFirstProject={kind:'road-first';schemaVersion:1;title:string;roads:Road[];decisions:Decision[];options:CompileOptions};

const finite=(v:unknown,lo=-1e7,hi=1e7)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const lanes=(v:unknown)=>Number.isInteger(v)&&(v as number)>=0&&(v as number)<=4;

/** Structural check of the authored model; the compiled network is checked by the engine. */
export function validateRoadFirstProject(p:RoadFirstProject):string|null{
  if(!p||p.kind!=='road-first'||p.schemaVersion!==ROAD_FIRST_SCHEMA_VERSION)return 'ไม่ใช่ไฟล์โครงการแบบวาดถนน';
  if(typeof p.title!=='string'||p.title.length>100)return 'ชื่อโครงการไม่ถูกต้อง';
  if(!Array.isArray(p.roads)||!Array.isArray(p.decisions)||!p.options||typeof p.options!=='object')return 'ข้อมูลถนนหรือการยืนยันทางแยกไม่ครบ';
  const ids=new Set<string>();
  for(const r of p.roads){
    if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))return 'รหัสถนนซ้ำหรือว่าง';ids.add(r.id);
    if(typeof r.name!=='string'||r.name.length>80)return `ชื่อถนน ${r.id} ไม่ถูกต้อง`;
    if(!Array.isArray(r.points)||r.points.length<2||r.points.length>200||!r.points.every(q=>finite(q?.x)&&finite(q?.y)&&(q.radius===undefined||finite(q.radius,0,200))))return `แนวถนน ${r.name} ไม่ถูกต้อง`;
    const s=r.section;
    if(!s||!lanes(s.forwardLanes)||!lanes(s.backwardLanes)||s.forwardLanes+s.backwardLanes<1||!finite(s.laneWidth,2.5,4.5)||!finite(s.median,0,12)||!finite(s.walk,0,8))return `หน้าตัดถนน ${r.name} ไม่ถูกต้อง`;
    if(r.links!==undefined&&!Array.isArray(r.links))return `ช่วงถนนของ ${r.name} ไม่ถูกต้อง`;
    if(r.role!==undefined&&r.role!=='access'&&r.role!=='ramp')return `ชนิดถนน ${r.name} ไม่ถูกต้อง`;
    if(r.anchors!==undefined){
      const ok=(a:unknown)=>{const v=a as {roadId?:unknown;station?:unknown;side?:unknown}|undefined;return v===undefined||(!!v&&typeof v.roadId==='string'&&v.roadId!==r.id&&finite(v.station,0,1e6)&&(v.side===1||v.side===-1));};
      if(r.role!=='ramp'||!r.anchors||typeof r.anchors!=='object'||!ok(r.anchors.start)||!ok(r.anchors.end))return `จุดเชื่อมทางลาด ${r.name} ไม่ถูกต้อง`;
    }
    const pe=profileError(r.profile);if(pe)return `แนวดิ่งของ ${r.name}: ${pe}`;
    if(r.roadside!==undefined&&(!r.roadside||typeof r.roadside.trees!=='boolean'||typeof r.roadside.lights!=='boolean'))return `ต้นไม้และเสาไฟของ ${r.name} ไม่ถูกต้อง`;
    if(r.openings!==undefined&&(!Array.isArray(r.openings)||r.openings.length>12||!r.openings.every(o=>o&&typeof o.id==='string'&&!!o.id&&o.id.length<=40&&finite(o.station,0,1e6)&&finite(o.length,2,40)&&(o.type===undefined||o.type==='opening'||o.type==='uturn'))))return `ช่องเปิดเกาะกลางของ ${r.name} ไม่ถูกต้อง`;
  }
  for(const r of p.roads)for(const a of [r.anchors?.start,r.anchors?.end])if(a&&!ids.has(a.roadId))return `จุดเชื่อมทางลาด ${r.name} ไม่ถูกต้อง`;
  const candidates=new Set<string>();
  for(const d of p.decisions){
    if(!d||typeof d.candidateId!=='string'||candidates.has(d.candidateId))return 'การยืนยันจุดตัดซ้ำหรือว่าง';candidates.add(d.candidateId);
    if(!['junction','grade-separated','ignore'].includes(d.decision))return 'ประเภทการยืนยันจุดตัดไม่ถูกต้อง';
    if(d.over!==undefined&&(typeof d.over!=='string'||!ids.has(d.over)))return 'ถนนที่อยู่บนของทางต่างระดับไม่ถูกต้อง';
    if(d.treatments!==undefined&&(typeof d.treatments!=='object'||d.treatments===null))return 'การตั้งค่าทางแยกไม่ถูกต้อง';
  }
  return null;
}

export function compileRoadFirstProject(p:RoadFirstProject):CompileResult{
  const r=compileRoadNetwork(p.roads,p.decisions,p.options);
  return{...r,project:{...r.project,title:p.title}};
}

/** Parse a stored road-first project. Future versions are rejected rather than guessed. */
export function normalizeRoadFirstProject(raw:unknown):RoadFirstProject{
  const v=raw as Partial<RoadFirstProject>|null;
  if(!v||typeof v!=='object'||v.kind!=='road-first')throw Error('ไม่ใช่ไฟล์โครงการแบบวาดถนน');
  if(typeof v.schemaVersion!=='number'||v.schemaVersion>ROAD_FIRST_SCHEMA_VERSION)throw Error('ไฟล์นี้มาจากรุ่นที่ใหม่กว่า ยังไม่รองรับ');
  const p=structuredClone(v) as RoadFirstProject;
  const error=validateRoadFirstProject(p);if(error)throw Error(error);
  const compiled=compileRoadFirstProject(p),engine=validateNetworkProject(compiled.project);
  if(engine)throw Error(`ถนนและทางแยกในไฟล์ประกอบกันไม่ได้ · ${engine}`);
  return p;
}
