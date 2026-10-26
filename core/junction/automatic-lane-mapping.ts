// Automatic, read-only lane connections inside an ordinary (non-roundabout) junction.
// No geometry is rewritten and no connector override is persisted: PR D owns manual overrides.
import {activeIds,armMouth,armTurn,edges,rotate,type Edge,type P} from './geometry';
import {configuredArrowLanes,resolvedLaneCenterY} from './lane-configuration';
import {laneArrowFor,type Design,type Direction,type LaneArrowCode,type LaneRole} from './model';

export type AutoTurn='left'|'through'|'right';
export type AutoLaneEndpoint={armId:number;direction:Direction;role:LaneRole;laneIndex:number};
export type AutoLaneConnection={
  id:string;movement:AutoTurn;
  from:AutoLaneEndpoint;to:AutoLaneEndpoint;
  /** Lane centres in the junction's local plan coordinates. These are NOT pavement markings. */
  fromPoint:P;toPoint:P;
};
export type AutoLaneMappingIssue={
  kind:'no-exit'|'no-receiver'|'capacity'|'ambiguous'|'uturn-review'|'geometry';
  from?:AutoLaneEndpoint;movement?:AutoTurn;message:string;
};
export type AutomaticLaneMapping={
  connections:AutoLaneConnection[];
  issues:AutoLaneMappingIssue[];
  /** Slip movements already have independent geometry and must not be duplicated through the junction. */
  slipRoutes:{fromArm:number;toArm:number}[];
};

type LocatedLane={ref:AutoLaneEndpoint;rank:number;point:P;code:LaneArrowCode};
const key=(lane:AutoLaneEndpoint)=>lane.armId+':'+lane.direction+':'+lane.role+':'+lane.laneIndex;
const signedAngle=(angle:number)=>((angle+540)%360)-180;
// Geometry uses screen coordinates (Y points down). In left-hand traffic a left turn is -90 degrees.
const turnOf=(angle:number):AutoTurn|null=>{
  const a=signedAngle(angle);
  return Math.abs(a)<=45?'through':a< -45&&a>=-155?'left':a>45&&a<=155?'right':null;
};
const turnsOf=(code:LaneArrowCode):AutoTurn[]=>{
  switch(code){
    case 'left':return['left'];
    case 'right':case 'ru':return['right'];
    case 'straight':case 'su':return['through'];
    case 'sl':return['left','through'];
    case 'sr':return['through','right'];
    case 'lr':return['left','right'];
    case 'all':return['left','through','right'];
    default:return[];
  }
};
const hasUturn=(code:LaneArrowCode)=>code==='uturn'||code==='ru'||code==='su';
const expectedTurn=(turn:AutoTurn)=>turn==='left'?-90:turn==='right'?90:0;
const rankOf=(role:LaneRole,laneIndex:number,mainCount:number)=>
  role==='aux-right'?-10+laneIndex:role==='aux-left'?mainCount+laneIndex:laneIndex;

/** The same lane centres used by plan markings and junction section/3D, not an independent width calculation. */
function locate(d:Design,armId:number,direction:Direction,segmentEdges:Edge[]):LocatedLane[]{
  const arm=d.arms[armId],x=Math.min(arm.length,Math.max(0,armMouth(d,armId)+.25));
  return configuredArrowLanes(arm,direction).flatMap(({role,laneIndex})=>{
    const y=resolvedLaneCenterY(d,armId,direction,role,laneIndex,x,segmentEdges);
    if(y===null||!Number.isFinite(y))return[];
    return [{
      ref:{armId,direction,role,laneIndex},rank:rankOf(role,laneIndex,arm[direction]),
      point:rotate({x,y},armTurn(d,armId)),code:laneArrowFor(arm,direction,role,laneIndex)
    }];
  }).sort((a,b)=>a.rank-b.rank);
}

/**
 * Connect incoming lanes to receiving lanes by authored turn arrows and geometric leg bearings.
 * Across each movement the median-to-curb order is preserved; a receiving lane is never
 * silently assigned to two source lanes of that same movement. Missing lanes remain review items.
 */
export function automaticLaneMapping(d:Design):AutomaticLaneMapping{
  const result:AutomaticLaneMapping={connections:[],issues:[],slipRoutes:d.slips.map(s=>({fromArm:s.fromArm,toArm:s.toArm}))};
  if(d.type==='roundabout')return result; // Circulatory lanes need a separate roundabout resolver.
  const arms=activeIds(d);
  let segmentEdges:Edge[];
  try{segmentEdges=edges(d);}catch{
    result.issues.push({kind:'geometry',message:'รูปทรงทางแยกยังไม่สมบูรณ์ จึงยังไม่จับคู่ช่องจราจร'});
    return result;
  }
  const outgoing=new Map(arms.map(id=>[id,locate(d,id,'outgoing',segmentEdges)]));
  for(const fromArm of arms){
    const incoming=locate(d,fromArm,'incoming',segmentEdges);
    for(const lane of incoming)if(hasUturn(lane.code))result.issues.push({
      kind:'uturn-review',from:lane.ref,message:'การกลับรถต้องตรวจช่องเปิดเกาะกลางและแนวรถออกแบบต่างหาก'
    });
    for(const movement of ['left','through','right'] as const){
      const sources=incoming.filter(l=>turnsOf(l.code).includes(movement));
      if(!sources.length)continue;
      const possible=arms.filter(id=>id!==fromArm).map(toArm=>{
        const deflection=signedAngle(d.arms[toArm].angle-d.arms[fromArm].angle-180);
        return{toArm,deflection,score:Math.abs(deflection-expectedTurn(movement))};
      }).filter(target=>turnOf(target.deflection)===movement)
        .sort((a,b)=>a.score-b.score||a.toArm-b.toArm);
      if(!possible.length){
        sources.forEach(source=>result.issues.push({kind:'no-exit',from:source.ref,movement,message:'ไม่มีขารับสำหรับทิศทางนี้'}));
        continue;
      }
      if(possible.length>1&&possible[1].score-possible[0].score<10){
        sources.forEach(source=>result.issues.push({kind:'ambiguous',from:source.ref,movement,message:'ขารับมีหลายทางที่ใกล้เคียงกัน ต้องตรวจทิศทางก่อน'}));
        continue;
      }
      const toArm=possible[0].toArm;
      if(movement==='left'&&result.slipRoutes.some(s=>s.fromArm===fromArm&&s.toArm===toArm))
        continue; // Dedicated Slip keeps its own identity and existing geometry.
      const receivers=outgoing.get(toArm)??[];
      if(!receivers.length){
        sources.forEach(source=>result.issues.push({kind:'no-receiver',from:source.ref,movement,message:'ขารับไม่มีช่องจราจรขาออก'}));
        continue;
      }
      const n=Math.min(sources.length,receivers.length);
      const fromStart=movement==='left'?sources.length-n:0;
      const toStart=movement==='left'?receivers.length-n:movement==='right'?0:Math.floor((receivers.length-n)/2);
      for(let i=0;i<n;i++){
        const source=sources[fromStart+i],receiver=receivers[toStart+i];
        result.connections.push({
          id:key(source.ref)+'>'+movement+'>'+key(receiver.ref),movement,from:source.ref,to:receiver.ref,
          fromPoint:source.point,toPoint:receiver.point
        });
      }
      sources.filter((_,index)=>index<fromStart||index>=fromStart+n).forEach(source=>result.issues.push({
        kind:'capacity',from:source.ref,movement,message:'จำนวนช่องเข้ามากกว่าช่องรับ ระบบไม่รวมช่องเข้าช่องเดียวโดยไม่แจ้งให้ตรวจ'
      }));
    }
  }
  return result;
}
