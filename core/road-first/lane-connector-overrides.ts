// PR D: authored differences from automatic junction lane mapping.
// Persist physical road-leg identity; arm IDs and compiler-generated connection IDs are transient.
import {activeIds,armTreatmentOrigins,armTurn,designError,edges,rotate,type Edge,type P} from '../junction/geometry';
import {configuredArrowLanes,resolvedLaneCenterY} from '../junction/lane-configuration';
import {laneArrowFor,type Design,type LaneRole} from '../junction/model';
import {automaticLaneMapping,arrowAllowsMovement,eligibleTurnTargets,
  type AutoLaneConnection,type AutoLaneMappingIssue,type AutoTurn,type AutoLaneEndpoint} from '../junction/automatic-lane-mapping';
import {parseLegKey,type LegKey} from './leg-binding';

export type ConnectorLaneRef={leg:LegKey;role:LaneRole;laneIndex:number};
export type ConnectorOverride={
  from:ConnectorLaneRef;movement:AutoTurn;mode:'suppress'|'replace';to?:ConnectorLaneRef;
};
export type ConnectorLegBinding={armId:number;leg:LegKey};
export type ConnectorReview={kind:'manual-review';overrideKey:string;message:string;from?:AutoLaneEndpoint;movement?:AutoTurn};
export type ResolvedConnector=AutoLaneConnection&{origin:'generated'|'manual'};
export type ResolvedConnectorMapping={
  connections:ResolvedConnector[];issues:(AutoLaneMappingIssue|ConnectorReview)[];
  slipRoutes:{fromArm:number;toArm:number}[];
};
export const connectorOverrideKey=(o:Pick<ConnectorOverride,'from'|'movement'>)=>
  o.from.leg+'|'+o.from.role+'|'+o.from.laneIndex+'|'+o.movement;
const validRef=(x:unknown):x is ConnectorLaneRef=>{
  if(!x||typeof x!=='object'||Array.isArray(x))return false;
  const o=x as Record<string,unknown>;
  return Object.keys(o).length===3&&typeof o.leg==='string'&&o.leg.length<=150&&!!parseLegKey(o.leg)
    &&(o.role==='main'||o.role==='aux-left'||o.role==='aux-right')
    &&Number.isInteger(o.laneIndex)&&(o.laneIndex as number)>=0&&(o.laneIndex as number)<=7;
};
export function connectorOverrideError(value:unknown):string|null{
  if(!Array.isArray(value)||value.length>96)return 'จำนวนรายการเชื่อมช่องจราจรไม่ถูกต้อง';
  const seen=new Set<string>();
  for(const raw of value){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'ข้อมูลทางเชื่อมช่องจราจรไม่ถูกต้อง';
    const o=raw as Record<string,unknown>;
    if(!validRef(o.from)||!['left','through','right'].includes(o.movement as string)
      ||(o.mode!=='suppress'&&o.mode!=='replace'))return 'ข้อมูลช่องต้นทางหรือทิศทางการเลี้ยวไม่ถูกต้อง';
    if(o.mode==='replace'?!validRef(o.to):o.to!==undefined)return 'ข้อมูลช่องปลายทางไม่ถูกต้อง';
    if(Object.keys(o).some(k=>!['from','to','movement','mode'].includes(k)))return 'มีข้อมูลทางเชื่อมที่ไม่รองรับ';
    const k=connectorOverrideKey(o as ConnectorOverride);
    if(seen.has(k))return 'ตั้งค่าช่องต้นทางและทิศทางซ้ำกัน';seen.add(k);
  }
  return null;
}
/** One remapping function reused by reverse/split/join. No implicit lane-index remapping. */
export function remapConnectorOverrides(items:ConnectorOverride[]|undefined,remap:(leg:LegKey)=>LegKey){
  return items?.map(o=>({
    ...o,from:{...o.from,leg:remap(o.from.leg)},
    ...(o.to?{to:{...o.to,leg:remap(o.to.leg)}}:{})
  }));
}
const laneKey=(r:AutoLaneEndpoint)=>r.armId+'|'+r.role+'|'+r.laneIndex;
const matches=(a:AutoLaneEndpoint,b:AutoLaneEndpoint)=>laneKey(a)===laneKey(b);

/** Read the precise canonical lane centre; no independent pavement width model. */
function pointFor(d:Design,edgeSet:Edge[],ref:AutoLaneEndpoint):P|null{
  if(!d.enabled[ref.armId])return null;
  const a=d.arms[ref.armId];
  if(!configuredArrowLanes(a,ref.direction).some(v=>v.role===ref.role&&v.laneIndex===ref.laneIndex))return null;
  const x=armTreatmentOrigins(d,ref.armId,edgeSet)[ref.direction];
  const y=resolvedLaneCenterY(d,ref.armId,ref.direction,ref.role,ref.laneIndex,x,edgeSet);
  return y===null||!Number.isFinite(y)?null:rotate({x,y},armTurn(d,ref.armId));
}
/**
 * Preserve authored overrides when a road or pocket changes. Invalid references become
 * review issues: neither silently drop them nor silently fall back to an auto connection.
 */
export function resolveConnectorOverrides(
  d:Design,bindings:ConnectorLegBinding[],overrides:ConnectorOverride[]=[]
):ResolvedConnectorMapping{
  const auto=automaticLaneMapping(d),results:ResolvedConnectorMapping={
    connections:auto.connections.map(c=>({...c,origin:'generated'})),issues:[...auto.issues],slipRoutes:auto.slipRoutes
  };
  const structural=connectorOverrideError(overrides);
  if(structural){results.issues.push({kind:'manual-review',overrideKey:'invalid',message:structural});return results;}
  const byLeg=new Map(bindings.map(b=>[b.leg,b.armId]));
  let edgeSet:Edge[]|null=null;
  if(!designError(d))try{edgeSet=edges(d);}catch{edgeSet=null;}
  // Apply all suppression/replacement masks first, then add manual connections.
  // This makes the result independent of override order when one authored choice
  // takes a receiving lane vacated by a different authored choice.
  for(const o of overrides){
    const fromArm=byLeg.get(o.from.leg);
    if(fromArm===undefined)continue;
    const from:AutoLaneEndpoint={armId:fromArm,direction:'incoming',role:o.from.role,laneIndex:o.from.laneIndex};
    results.connections=results.connections.filter(c=>!(matches(c.from,from)&&c.movement===o.movement));
    results.issues=results.issues.filter(i=>!(i.kind!=='manual-review'&&i.movement===o.movement&&i.from&&matches(i.from,from)));
  }
  for(const o of overrides){
    const overrideKey=connectorOverrideKey(o),fromArm=byLeg.get(o.from.leg);
    const from=fromArm===undefined?undefined:{
      armId:fromArm,direction:'incoming' as const,role:o.from.role,laneIndex:o.from.laneIndex
    };
    const review=(message:string)=>{
      results.issues.push({kind:'manual-review',overrideKey,message,...(from?{from}:{}),movement:o.movement});
    };
    if(!edgeSet||fromArm===undefined||!activeIds(d).includes(fromArm)){review('ขาต้นทางไม่มีอยู่ในทางแยกนี้แล้ว');continue;}
    const fromPoint=pointFor(d,edgeSet,from!);
    if(!fromPoint){review('ช่องต้นทางไม่มีอยู่ในหน้าตัดที่วาดแล้ว');continue;}
    const arrow=laneArrowFor(d.arms[fromArm],'incoming',o.from.role,o.from.laneIndex);
    if(!arrowAllowsMovement(arrow,o.movement)){review('ลูกศรของช่องต้นทางไม่อนุญาตการเลี้ยวนี้');continue;}
    if(o.movement==='left'&&auto.slipRoutes.some(s=>s.fromArm===fromArm)){
      review('ทิศเลี้ยวซ้ายนี้เป็นของ Slip lane จึงไม่ให้สร้างทางเชื่อมซ้ำ');continue;
    }
    if(o.mode==='suppress')continue;
    const toArm=byLeg.get(o.to!.leg);
    if(toArm===undefined||!activeIds(d).includes(toArm)){
      review('ขารับไม่มีอยู่ในทางแยกนี้แล้ว');continue;
    }
    if(!eligibleTurnTargets(d,fromArm,o.movement).includes(toArm)){
      review('ขารับไม่สัมพันธ์กับทิศการเลี้ยวตามรูปทรงทางแยก');continue;
    }
    const to:AutoLaneEndpoint={armId:toArm,direction:'outgoing',role:o.to!.role,laneIndex:o.to!.laneIndex};
    const toPoint=pointFor(d,edgeSet,to);
    if(!toPoint){review('ช่องรับไม่มีอยู่ในหน้าตัดที่วาดแล้ว');continue;}
    const collision=results.connections.some(c=>c.movement===o.movement&&c.from.armId===fromArm&&matches(c.to,to));
    if(collision){review('มีช่องอื่นจากปากทางเดียวกันเชื่อมเข้าช่องรับนี้อยู่แล้ว');continue;}
    results.connections.push({
      id:'manual:'+overrideKey+':'+o.to!.leg+':'+o.to!.role+':'+o.to!.laneIndex,
      movement:o.movement,from:from!,to,fromPoint,toPoint,origin:'manual'
    });
  }
  return results;
}
