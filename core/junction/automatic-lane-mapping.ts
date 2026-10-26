// Automatic, read-only lane connections inside an ordinary (non-roundabout) junction.
// No geometry is rewritten and no connector override is persisted: PR D owns manual overrides.
import {activeIds,armTreatmentOrigins,armTurn,designError,edges,rotate,type Edge,type P} from './geometry';
import {configuredArrowLanes,resolvedLaneCenterY} from './lane-configuration';
import {laneArrowFor,type Design,type Direction,type LaneArrowCode,type LaneRole} from './model';
import {slipDesignError} from './slip-geometry';

export type AutoTurn='left'|'through'|'right';
export type AutoLaneEndpoint={armId:number;direction:Direction;role:LaneRole;laneIndex:number};
export type AutoLaneConnection={
  id:string;movement:AutoTurn;
  from:AutoLaneEndpoint;to:AutoLaneEndpoint;
  /** Lane centres in the junction's local plan coordinates. These are NOT pavement markings. */
  fromPoint:P;toPoint:P;
};
export type AutoLaneMappingIssue={
  kind:'no-exit'|'no-receiver'|'capacity'|'ambiguous'|'uturn-review'|'movement-review'|'geometry';
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
// Angular limits are TO_VERIFY tool heuristics, not a standards classification.
const turnOf=(angle:number,through:boolean):AutoTurn|null=>{
  const a=signedAngle(angle);
  return through?'through':a<=-40&&a>=-155?'left':a>=40&&a<=155?'right':null;
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
  const arm=d.arms[armId],x=armTreatmentOrigins(d,armId,segmentEdges)[direction];
  return configuredArrowLanes(arm,direction).flatMap(({role,laneIndex})=>{
    const y=resolvedLaneCenterY(d,armId,direction,role,laneIndex,x,segmentEdges);
    if(y===null||!Number.isFinite(y))return[];
    return [{
      ref:{armId,direction,role,laneIndex},rank:rankOf(role,laneIndex,arm[direction]),
      point:rotate({x,y},armTurn(d,armId)),code:laneArrowFor(arm,direction,role,laneIndex)
    }];
  }).sort((a,b)=>a.rank-b.rank);
}

/** Minimum lateral displacement with lane order preserved, including non-adjacent through lanes. */
function throughPairs(sources:LocatedLane[],receivers:LocatedLane[],bearing:number):[LocatedLane,LocatedLane][]{
  const swapped=sources.length>receivers.length;
  const small=swapped?receivers:sources,large=swapped?sources:receivers;
  const normal=rotate({x:0,y:1},bearing/90);
  const cost=(a:LocatedLane,b:LocatedLane)=>((a.point.x-b.point.x)*normal.x+(a.point.y-b.point.y)*normal.y)**2;
  const dp=Array.from({length:small.length+1},()=>Array<number>(large.length+1).fill(Infinity));
  dp[0].fill(0);
  for(let i=1;i<=small.length;i++)for(let j=i;j<=large.length;j++)
    dp[i][j]=Math.min(dp[i][j-1],dp[i-1][j-1]+cost(small[i-1],large[j-1]));
  const pairs:[LocatedLane,LocatedLane][]=[];
  let i=small.length,j=large.length;
  while(i>0){
    if(j>i&&dp[i][j]===dp[i][j-1]){j--;continue;}
    pairs.push(swapped?[large[j-1],small[i-1]]:[small[i-1],large[j-1]]);
    i--;j--;
  }
  return pairs.reverse();
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
  try{
    if(designError(d))throw new Error('Invalid junction geometry');
    segmentEdges=edges(d);
    const slipError=slipDesignError(d,segmentEdges);
    if(slipError)result.issues.push({kind:'geometry',message:slipError});
  }catch{
    result.issues.push({kind:'geometry',message:'รูปทรงทางแยกยังไม่สมบูรณ์ จึงยังไม่จับคู่ช่องจราจร'});
    return result;
  }
  const outgoing=new Map(arms.map(id=>[id,locate(d,id,'outgoing',segmentEdges)]));
  const exits=new Map(arms.map(from=>[from,arms.filter(to=>to!==from).map(toArm=>({
    toArm,deflection:signedAngle(d.arms[toArm].angle-d.arms[from].angle-180)
  })).sort((a,b)=>Math.abs(a.deflection)-Math.abs(b.deflection))]));
  const nearest=(from:number)=>{
    const list=exits.get(from)!,first=list[0];
    return first&&Math.abs(first.deflection)<=45
      &&(!list[1]||Math.abs(list[1].deflection)-Math.abs(first.deflection)>=10)?first.toArm:undefined;
  };
  for(const fromArm of arms){
    // Reciprocal opposite legs distinguish through traffic from a skew T's stem or an acute side turn.
    const opposite=nearest(fromArm),throughExit=opposite!==undefined&&nearest(opposite)===fromArm?opposite:undefined;
    const incoming=locate(d,fromArm,'incoming',segmentEdges);
    for(const lane of incoming)if(hasUturn(lane.code))result.issues.push({
      kind:'uturn-review',from:lane.ref,message:'การกลับรถต้องตรวจช่องเปิดเกาะกลางและแนวรถออกแบบต่างหาก'
    });
    for(const lane of incoming)if(lane.code==='none'||lane.code==='merge')result.issues.push({
      kind:'movement-review',from:lane.ref,message:'ช่องขาเข้ายังไม่ได้กำหนดทิศทางผ่านทางแยก จึงยังไม่จับคู่ช่อง'
    });
    for(const movement of ['left','through','right'] as const){
      const sources=incoming.filter(l=>turnsOf(l.code).includes(movement));
      if(!sources.length)continue;
      const possible=exits.get(fromArm)!.map(target=>({
        ...target,score:Math.abs(target.deflection-expectedTurn(movement))
      })).filter(target=>turnOf(target.deflection,target.toArm===throughExit)===movement)
        .sort((a,b)=>a.score-b.score||a.toArm-b.toArm);
      if(!possible.length){
        const candidates=exits.get(fromArm)!.filter(t=>Math.abs(t.deflection)<=45);
        const ambiguous=movement==='through'&&candidates.length>1
          &&Math.abs(candidates[1].deflection)-Math.abs(candidates[0].deflection)<10;
        sources.forEach(source=>result.issues.push({kind:ambiguous?'ambiguous':'no-exit',from:source.ref,movement,
          message:ambiguous?'ขารับมีหลายทางที่ใกล้เคียงกัน ต้องตรวจทิศทางก่อน':'ไม่มีขารับสำหรับทิศทางนี้'}));
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
      const fromStart=movement==='left'?sources.length-n:0,toStart=movement==='left'?receivers.length-n:0;
      const pairs=movement==='through'
        ?throughPairs(sources,receivers,d.arms[fromArm].angle+180+possible[0].deflection/2)
        :Array.from({length:n},(_,i):[LocatedLane,LocatedLane]=>[sources[fromStart+i],receivers[toStart+i]]);
      for(const [source,receiver] of pairs){
        result.connections.push({
          id:key(source.ref)+'>'+movement+'>'+key(receiver.ref),movement,from:source.ref,to:receiver.ref,
          fromPoint:source.point,toPoint:receiver.point
        });
      }
      sources.filter(source=>!pairs.some(([from])=>from===source)).forEach(source=>result.issues.push({
        kind:'capacity',from:source.ref,movement,message:'จำนวนช่องเข้ามากกว่าช่องรับ ระบบไม่รวมช่องเข้าช่องเดียวโดยไม่แจ้งให้ตรวจ'
      }));
    }
  }
  return result;
}
