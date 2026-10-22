// Phase 4B-3 — diamond interchange, the first template. It only places ordinary pieces: the grade separation of the
// two roads (bridge or underpass, from the level criteria) and up to four one-way ramps, each attached to the main road
// by a diverge / merge and meeting the crossroad in an ordinary junction (one junction per side of the main road).
// Everything is one batch command (one undo step); afterwards each piece is an ordinary road / ramp / junction.
import {resolveAlignment} from '../common/resolved-alignment';
import type {WorldPoint} from '../network/network-project';
import type {RoadFirstCommand} from './commands';
import {detectCandidates,pointAt,stations,type Road} from './derive';
import {levelAt,sectionWidth,type Profile} from './elevation';
import {overCommand} from './grade-separation';
import {bridgeRise,gradeFor,levelCriteria} from './level-criteria';
import {RAMP_SECTION} from './ramps';
import type {RoadFirstProject} from './project';

export type DiamondRampKey='forwardOff'|'forwardOn'|'backwardOff'|'backwardOn';
/**
 * mainId: the road the ramps attach to (the freeway). over: which road passes over on a bridge (the other stays at its level). length: distance from the crossing
 * to each diverge / merge along the main road (m). offset: distance of the ramp terminals from the main road centre
 * line, measured across it (m). ramps: which of the four ramps to place.
 */
export type DiamondParams={mainId:string;over:'main'|'cross';length:number;offset:number;ramps:Record<DiamondRampKey,boolean>};
export type DiamondPlan={params:DiamondParams;ramps:{key:DiamondRampKey;road:Road}[];cmd:RoadFirstCommand};

/** Diverge angle of a ramp leaving the main road (tool value, within the 25° attachment limit). */
export const DIAMOND_DIVERGE_DEG=12;
/** Clear distance from the main road edge to the ramp terminals (tool value). */
export const DIAMOND_TERMINAL_GAP=15;
/** Terminals at least this far from the main road centre line, so the two terminal junctions have room for their legs (tool value). */
export const DIAMOND_TERMINAL_MIN=60;
/** Ramp clear of the main road edge where it stops diverging and turns toward its terminal (tool value). */
export const DIAMOND_RAMP_CLEAR=6;
/** Straight run of a ramp before its terminal junction (tool value). */
export const DIAMOND_TERMINAL_RUN=40;
export const DIAMOND_RAMP_LABEL:Record<DiamondRampKey,string>={forwardOff:'ทางออก (ทิศที่วาด)',forwardOn:'ทางเข้า (ทิศที่วาด)',backwardOff:'ทางออก (ทิศสวน)',backwardOn:'ทางเข้า (ทิศสวน)'};
const ALL_RAMPS:Record<DiamondRampKey,boolean>={forwardOff:true,forwardOn:true,backwardOff:true,backwardOn:true};

const r2=(v:number)=>Math.round(v*100)/100;
const add=(a:WorldPoint,b:WorldPoint,k=1)=>({x:a.x+b.x*k,y:a.y+b.y*k});
function unitAt(points:Road['points'],station:number,mode?:'arc'){
  if(mode==='arc')return resolveAlignment(points).tangentAt(station);
  const s=stations(points);
  for(let i=0;i<points.length-1;i++)if(station<=s[i+1]+1e-6||i===points.length-2){const dx=points[i+1].x-points[i].x,dy=points[i+1].y-points[i].y,l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};}
  return{x:1,y:0};
}

/** Starting parameters: ramps where the main road is back at its own level (outside the bridge or underpass), all four ramps. */
/** Lateral offset where a ramp stops diverging: past the main road's travelled way and the ramp's own half width. */
const divergeOffset=(main:Road)=>Math.max(main.section.median/2+Math.max(main.section.forwardLanes,main.section.backwardLanes)*main.section.laneWidth,0)+RAMP_SECTION.laneWidth/2+DIAMOND_RAMP_CLEAR;
const divergeTaper=(main:Road)=>divergeOffset(main)/Math.tan(DIAMOND_DIVERGE_DEG*Math.PI/180);

export function diamondDefaults(project:RoadFirstProject,candidateId:string,mainId?:string):DiamondParams|null{
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId);if(!c||c.kind!=='cross'||c.roads.length!==2)return null;
  const main=project.roads.find(r=>r.id===(mainId??c.roads[0].roadId)),cross=project.roads.find(r=>r.id===c.roads.find(x=>x.roadId!==main?.id)?.roadId);
  if(!main||!cross)return null;
  const k=levelCriteria(project.options.levels),offset=Math.max(DIAMOND_TERMINAL_MIN,Math.ceil(sectionWidth(main.section)/2+DIAMOND_TERMINAL_GAP));
  const climb=bridgeRise(k)/gradeFor(k,main),halfTop=sectionWidth(cross.section)/2+10;
  const taper=divergeTaper(main);
  return{mainId:main.id,over:'main',length:Math.ceil(Math.max(halfTop+climb+20,taper+DIAMOND_TERMINAL_RUN)/10)*10,offset,ramps:{...ALL_RAMPS}};
}

/** The pieces and the single command that places them; an error when the crossing or parameters do not allow it. */
export function diamondPlan(project:RoadFirstProject,candidateId:string,params:DiamondParams,ids:string[]):DiamondPlan|{error:string}{
  const c=detectCandidates(project.roads).find(x=>x.id===candidateId);
  if(!c||c.kind!=='cross'||c.roads.length!==2)return{error:'ทางแยกต่างระดับแบบข้าวหลามตัดต้องวางที่จุดที่ถนนสองสายตัดผ่านกัน'};
  const mRef=c.roads.find(r=>r.roadId===params.mainId),cRef=c.roads.find(r=>r.roadId!==params.mainId);
  const main=project.roads.find(r=>r.id===mRef?.roadId),cross=project.roads.find(r=>r.id===cRef?.roadId);
  if(!mRef||!cRef||!main||!cross)return{error:'ไม่พบถนนหลักที่เลือก'};
  if(main.section.forwardLanes<1||main.section.backwardLanes<1)return{error:`${main.name} ต้องมีช่องจราจรทั้งสองทิศ`};
  const {length:L,offset:W}=params,mainTotal=stations(main.points,main.alignment).at(-1)!;
  if(!(L>0&&W>0))return{error:'ระยะทางลาดต้องมากกว่า 0'};
  if(mRef.station-L<1||mRef.station+L>mainTotal-1)return{error:`${main.name} สั้นเกินไปสำหรับทางลาดยาว ${L} ม. จากจุดตัด — ยืดถนนหรือลดระยะ`};
  // The ramp diverges at a shallow angle until it is clear of the main road, then runs to its terminal.
  const taper=divergeTaper(main),clear=divergeOffset(main);
  if(W<sectionWidth(main.section)/2+5)return{error:`ปลายทางลาดห่างแนว ${main.name} ${W} ม. ใกล้เกินไป — ต้องอย่างน้อย ${Math.ceil(sectionWidth(main.section)/2+5)} ม.`};
  // The ramp needs its diverge taper plus a straight run before the terminal junction (tool value).
  if(taper+DIAMOND_TERMINAL_RUN>L)return{error:`ระยะ ${L} ม. สั้นเกินไปสำหรับช่วงแยกออกที่มุม ${DIAMOND_DIVERGE_DEG}° จนพ้นขอบถนนหลัก และช่วงตรงก่อนถึงทางแยกปลายทางลาด ${DIAMOND_TERMINAL_RUN} ม. — ต้องอย่างน้อย ${Math.ceil(taper+DIAMOND_TERMINAL_RUN)} ม.`};
  // Grade separation first (from the level criteria); the ramps take the resulting levels.
  const sep=overCommand(project,c.id,params.over==='main'?main.id:cross.id);
  if('error' in sep)return sep;
  const profiles=sep.cmd.type==='crossing.setOver'?sep.cmd.profiles:{};
  const prof=(r:Road):Profile|undefined=>r.id in profiles?(profiles[r.id]??undefined):r.profile;
  const X=c.point,u=unitAt(main.points,mRef.station,main.alignment),n={x:u.y,y:-u.x}; // n: forward-lane side (left of travel on the plan)
  const v0=unitAt(cross.points,cRef.station,cross.alignment);
  // Terminal on the crossroad at distance W across the main road, on one side (+1 forward side, -1 the other).
  // Points follow both alignments (a curved road keeps its ramps along its curve).
  const crossTotal=stations(cross.points,cross.alignment).at(-1)!;
  const terminal=(side:1|-1)=>{const dir=(v0.x*n.x+v0.y*n.y)*side>=0?1:-1,across=Math.abs(v0.x*n.x+v0.y*n.y);
    if(across<.3)return null;const s=cRef.station+dir*W/across;if(s<1||s>crossTotal-1)return undefined;return pointAt(cross.points,s,cross.alignment);};
  const tF=terminal(1),tB=terminal(-1);
  if(tF===null||tB===null)return{error:`${cross.name} ตัด ${main.name} เฉียงเกินไปสำหรับข้าวหลามตัด`};
  if(!tF||!tB)return{error:`${cross.name} สั้นเกินไปสำหรับทางแยกปลายทางลาดที่ห่าง ${W} ม. — ยืดถนนหรือลดระยะ`};
  const onMain=(s:number)=>pointAt(main.points,mRef.station+s,main.alignment);
  const at=(s:number,side:number)=>{const t=unitAt(main.points,mRef.station+s,main.alignment);return add(onMain(s),{x:t.y,y:-t.x},side*clear);};
  const shape:Record<DiamondRampKey,WorldPoint[]>={
    // Forward traffic (along the main road's drawing direction) runs on the forward side (+n).
    forwardOff:[onMain(-L),at(-(L-taper),1),tF],forwardOn:[tF,at(L-taper,1),onMain(L)],
    backwardOff:[onMain(L),at(L-taper,-1),tB],backwardOn:[tB,at(-(L-taper),-1),onMain(-L)],
  };
  const zMain=(s:number)=>levelAt(prof(main),mRef.station+s),zCross=(p:WorldPoint)=>{const d=(p.x-X.x)*v0.x+(p.y-X.y)*v0.y;return levelAt(prof(cross),cRef.station+d);};
  const ends:Record<DiamondRampKey,[number,number]>={
    forwardOff:[zMain(-L),zCross(tF)],forwardOn:[zCross(tF),zMain(L)],backwardOff:[zMain(L),zCross(tB)],backwardOn:[zCross(tB),zMain(-L)],
  };
  const group=`diamond:${ids[0]??'1'}`,keys=(Object.keys(shape) as DiamondRampKey[]).filter(k=>params.ramps[k]);
  if(!keys.length)return{error:'เลือกทางลาดอย่างน้อยหนึ่งเส้น'};
  const names=new Set(project.roads.map(r=>r.name));let n0=1;const nextName=()=>{while(names.has(`ทางลาด ${n0}`))n0++;const s=`ทางลาด ${n0}`;names.add(s);return s;};
  const ramps=keys.map((key,i)=>{
    const points=shape[key].map(p=>({x:r2(p.x),y:r2(p.y)})),total=stations(points).at(-1)!,[z0,z1]=ends[key];
    const profile:Profile|undefined=Math.abs(z0)<1e-6&&Math.abs(z1)<1e-6?undefined:[{station:0,z:r2(z0)},{station:r2(total),z:r2(z1)}];
    const road:Road={id:ids[i]??`R-diamond-${i+1}`,name:`${nextName()} ${DIAMOND_RAMP_LABEL[key]}`,role:'ramp',points,section:structuredClone(RAMP_SECTION),
      ...(profile?{profile}:{}),origin:{template:'diamond',version:1,group,params:{...params,ramps:{...params.ramps},crossing:[main.id,cross.id]}}};
    return{key,road};
  });
  const label=`ทางแยกต่างระดับแบบข้าวหลามตัด ${main.name} × ${cross.name} (${params.over==='main'?`${main.name} ข้าม`:`${cross.name} ข้าม`} · ทางลาด ${ramps.length} เส้น)`;
  return{params,ramps,cmd:{type:'batch',label,quiet:true,commands:[sep.cmd,...ramps.map(r=>({type:'road.add' as const,road:r.road}))]}};
}

/** Pieces of a placed template (same group). */
export const templatePieces=(roads:Road[],group:string)=>roads.filter(r=>r.origin?.group===group);
/** Remove every piece of a template group as one step (the grade separation itself stays). */
export function removeTemplateCommand(roads:Road[],group:string,label:string):RoadFirstCommand{
  return{type:'batch',label,commands:templatePieces(roads,group).map(r=>({type:'road.remove' as const,roadId:r.id}))};
}
