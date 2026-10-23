// U-turn structures common on Thai divided roads. Both only place ordinary pieces (one batch, one undo step):
// - U-turn bridge (horseshoe): a one-way ramp diverges from one carriageway, climbs beside the road, turns over the road
//   on a half circle and merges into the opposite carriageway. Left-hand traffic: the turn is to the right, so the ramp
//   leaves from the outer (left) edge of the travel direction and joins the outer edge of the opposite direction.
// - U-turn under a bridge: a median U-turn opening on the lower road, under the structure of a grade-separated crossing.
// Starting values (radius, height, grade) are tool values from the level criteria — TO_VERIFY, never standards.
import {resolveAlignment} from '../common/resolved-alignment';
import type {WorldPoint} from '../network/network-project';
import type {RoadFirstCommand} from './commands';
import {pointAt,stations,type CompileResult,type Road,type RoadOpening} from './derive';
import {levelAt,sectionWidth,type Profile} from './elevation';
import {bridgeRise,gradeFor,levelCriteria} from './level-criteria';
import {RAMP_SECTION} from './ramps';
import type {RoadFirstProject} from './project';
import {OPENING_START_LENGTH} from './approach-edit';

/** Which traffic turns: the one along the road's drawing direction, or the opposite one. */
export type UturnFrom='forward'|'backward';
/**
 * station: where the ramp leaves (and rejoins) the main road. radius: half circle over the road, centre line of the ramp (m).
 * height: level of the ramp over the road at the turn, surface to surface (m). grade: ramp grade (fraction).
 */
export type UturnBridgeParams={mainId:string;from:UturnFrom;station:number;radius:number;height:number;grade:number};
export type UturnBridgePlan={params:UturnBridgeParams;road:Road;cmd:RoadFirstCommand;footprint:{from:number;to:number}};

/** Diverge / merge angle of the ramp (tool value, within the ramp attachment limit). */
export const UTURN_DIVERGE_DEG=12;
/** Clear distance of the ramp's edge from the main road's outer edge on its parallel run (tool value). */
export const UTURN_EDGE_GAP=1.5;

const r2=(v:number)=>Math.round(v*100)/100;
const DEG=Math.PI/180;
/** Smallest half-circle radius whose parallel runs keep clear of the main road's full width (tool value). */
export const uturnMinRadius=(main:Road)=>Math.ceil(sectionWidth(main.section)/2+RAMP_SECTION.laneWidth/2+UTURN_EDGE_GAP);
const runs=(p:Pick<UturnBridgeParams,'radius'|'height'|'grade'>)=>({taper:p.radius/Math.tan(UTURN_DIVERGE_DEG*DEG),climb:p.height/p.grade});
/** Length of main road the structure takes from its diverge station (diverge taper, climb, half circle). */
export const uturnFootprint=(p:Pick<UturnBridgeParams,'radius'|'height'|'grade'>)=>{const r=runs(p);return r.taper+r.climb+2*p.radius+RAMP_SECTION.laneWidth/2;};

export function uturnBridgeDefaults(project:RoadFirstProject,mainId:string,from:UturnFrom='forward'):UturnBridgeParams|null{
  const main=project.roads.find(r=>r.id===mainId);if(!main)return null;
  const k=levelCriteria(project.options.levels),total=stations(main.points,main.alignment).at(-1)??0;
  const p={radius:uturnMinRadius(main),height:bridgeRise(k),grade:gradeFor(k,{role:'ramp'})},f=uturnFootprint(p);
  const station=Math.round(from==='forward'?Math.max(1,(total-f)/2):Math.min(total-1,(total+f)/2));
  return{mainId,from,station,...p};
}

export function uturnBridgePlan(project:RoadFirstProject,params:UturnBridgeParams,id:string):UturnBridgePlan|{error:string;footprint?:{from:number;to:number}}{
  const main=project.roads.find(r=>r.id===params.mainId);if(!main)return{error:'ไม่พบถนนหลัก'};
  if(project.schemaVersion<2||main.alignment!=='arc')return{error:`แปลงระยะตามแนวโค้งของ ${main.name} ก่อน เพื่อให้แนวทางลาดและระยะตรงกัน`};
  if(main.role==='ramp')return{error:'สะพานกลับรถต้องวางบนถนนสองทิศ ไม่ใช่ทางลาด'};
  if(main.section.forwardLanes<1||main.section.backwardLanes<1)return{error:`${main.name} ต้องมีช่องจราจรทั้งสองทิศจึงกลับรถได้`};
  const {radius:R,height:H,grade:g,station:s0}=params;
  if(!(R>=3&&R<=200&&H>=.5&&H<=30&&g>=.005&&g<=.15&&Number.isFinite(s0)))return{error:'ค่าที่ใส่ไม่ถูกต้อง: รัศมี 3–200 ม. · ความสูง 0.5–30 ม. · ความชัน 0.5–15%'};
  const min=uturnMinRadius(main);
  const dir=params.from==='forward'?1:-1,total=stations(main.points,main.alignment).at(-1)??0,{taper,climb}=runs(params),f=uturnFootprint(params);
  const footprint={from:Math.min(s0,s0+dir*f),to:Math.max(s0,s0+dir*f)};
  if(R<min)return{error:`รัศมี ${R} ม. เล็กเกินไป ทางลาดช่วงขนานจะทับขอบ ${main.name} — ต้องอย่างน้อย ${min} ม.`,footprint};
  if(footprint.from<1||footprint.to>total-1)return{error:`${main.name} ไม่พอสำหรับสะพานกลับรถ: ต้องใช้ ${f.toFixed(0)} ม. จากจุดแยกออก — ย้ายจุดหรือลดความสูง/รัศมี`,footprint};
  // The local frame needs the main road straight over the footprint (curved mains are a later step).
  const A=resolveAlignment(main.points,'arc'),t0=A.tangentAt(footprint.from),t1=A.tangentAt(footprint.to);
  if(Math.abs(t0.x*t1.y-t0.y*t1.x)>Math.sin(1*DEG)||t0.x*t1.x+t0.y*t1.y<0)return{error:`${main.name} ต้องเป็นแนวตรงตลอดช่วงสะพานกลับรถ (${footprint.from.toFixed(0)}–${footprint.to.toFixed(0)} ม.)`,footprint};
  const t={x:t0.x*dir,y:t0.y*dir},n={x:t.y,y:-t.x}; // n: the turning traffic's own (left, outer) side
  const c0=pointAt(main.points,s0,main.alignment),at=(along:number,off:number):WorldPoint=>({x:r2(c0.x+t.x*along+n.x*off),y:r2(c0.y+t.y*along+n.y*off)});
  const s1=taper+climb;
  const points=[at(0,0),at(taper,R),{...at(s1+R,R),radius:R},{...at(s1+R,-R),radius:R},at(taper,-R),at(0,0)];
  // Levels: at the main road where it leaves / joins, up to the turn level over the climb, level through the half circle.
  const ramp=resolveAlignment(points,'arc'),v=ramp.vertices,len=ramp.length;
  const zMain=levelAt(main.profile,s0),zTop=levelAt(main.profile,s0+dir*(s1+R))+H;
  const profile:Profile=[{station:0,z:r2(zMain)},{station:r2(v[1]),z:r2(zMain)},{station:r2(v[1]+climb),z:r2(zTop)},{station:r2(v[4]-climb),z:r2(zTop)},{station:r2(v[4]),z:r2(zMain)},{station:r2(len),z:r2(zMain)}];
  if(!(v[1]+climb<v[4]-climb-1))return{error:'ช่วงขึ้นและลงซ้อนกัน — เพิ่มรัศมีหรือลดความสูง',footprint};
  const names=new Set(project.roads.map(r=>r.name));let k=1;while(names.has(`สะพานกลับรถ ${k}`))k++;
  const road:Road={id,name:`สะพานกลับรถ ${k}`,role:'ramp',alignment:'arc',points,section:structuredClone(RAMP_SECTION),profile,
    origin:{template:'uturn-bridge',version:1,group:`uturn:${id}`,params:{...params}}};
  const label=`สะพานกลับรถ ${main.name} (${params.from==='forward'?'ทิศที่วาด':'ทิศสวน'} · รัศมี ${R} ม.)`;
  return{params,road,footprint,cmd:{type:'batch',label,quiet:true,commands:[{type:'road.add',road}]}};
}

/** U-turn opening on the lower road under a grade-separated crossing, centred under the structure. */
export function uturnUnderPlan(project:RoadFirstProject,compiled:CompileResult,candidateId:string):{cmd:RoadFirstCommand;opening:RoadOpening;roadId:string}|{error:string}{
  const x=compiled.crossings.find(c=>c.candidateId===candidateId&&c.relation==='over');
  if(!x||!x.under)return{error:'เลือกทางต่างระดับที่กำหนดถนนบนแล้ว'};
  const road=project.roads.find(r=>r.id===x.under);if(!road)return{error:'ไม่พบถนนด้านล่าง'};
  if(road.section.median<=0)return{error:`${road.name} ไม่มีเกาะกลาง จึงทำจุดกลับรถใต้สะพานไม่ได้`};
  if(road.section.forwardLanes<1||road.section.backwardLanes<1)return{error:`${road.name} ต้องมีช่องจราจรทั้งสองทิศ`};
  const span=x.clearance?.spanUnder;
  if(!span||x.clearance?.min==null)return{error:'ยังวัดช่วงใต้โครงสร้างไม่ได้ จึงวางจุดกลับรถใต้สะพานไม่ได้'};
  const room=span[1]-span[0],length=Math.min(OPENING_START_LENGTH.uturn,Math.floor(room*2)/2-1);
  if(length<2)return{error:`ช่วงใต้โครงสร้างยาว ${room.toFixed(1)} ม. สั้นเกินไปสำหรับช่องกลับรถ`};
  const station=Math.round(((span[0]+span[1])/2-length/2)*2)/2,list=road.openings??[];
  const clash=list.find(o=>station<o.station+o.length+1&&station+length+1>o.station);
  if(clash)return{error:`มีช่องเปิดเกาะกลางที่ระยะ ${clash.station} ม. อยู่ใต้สะพานแล้ว`};
  const ids=new Set(list.map(o=>o.id));let n=1;while(ids.has(`muturn-${n}`))n++;
  const opening:RoadOpening={id:`muturn-${n}`,type:'uturn',station,length};
  return{roadId:road.id,opening,cmd:{type:'road.setOpenings',roadId:road.id,openings:[...list,opening]}};
}
