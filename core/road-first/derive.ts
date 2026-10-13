// SPIKE (roadmap Phase 1B) — road-first authoring compiled onto the existing engine.
// Roads own alignment + section. Crossings become explicit candidates. Confirmed
// junctions compile to ordinary JunctionInstance/RoadLink objects, so every
// existing geometry, Slip, review, 2D/3D and export path is reused unchanged.
import {initial,markingsFor,type Arm,type Band,type Design} from '../junction/model';
import {defaultSlip,type SlipLane} from '../junction/slip-model';
import {designError} from '../junction/design-validation';
import type {JunctionInstance,NetworkProject,RoadLink,WorldPoint} from '../network/network-project';

export type RoadSection={
  forwardLanes:number;backwardLanes:number;laneWidth:number;median:number;walk:number;bands?:Band[];
};
export type RoadPoint=WorldPoint&{radius?:number};
export type Road={id:string;name:string;points:RoadPoint[];section:RoadSection};
export type CandidateKind='cross'|'tee';
export type Candidate={id:string;kind:CandidateKind;point:WorldPoint;roads:{roadId:string;station:number}[]};
export type LegKey=`${string}:${'ahead'|'behind'}`;
/** Junction-owned treatments keyed by road leg, so they survive recompiles and road edits. */
export type JunctionTreatments={slips?:{from:LegKey;to?:LegKey;width?:number;radius?:number}[];corner?:number};
export type Decision={candidateId:string;decision:'junction'|'grade-separated'|'ignore';name?:string;treatments?:JunctionTreatments};
export type CompileOptions={approachLength?:number;tolerance?:number};
export type LegBinding={junctionId:string;armId:number;roadId:string;side:'ahead'|'behind'};
export type CompileResult={project:NetworkProject;legs:LegBinding[];issues:string[]};

const EPS=1e-6,MIN_ARM=45;
const sub=(a:WorldPoint,b:WorldPoint)=>({x:a.x-b.x,y:a.y-b.y});
const len=(v:WorldPoint)=>Math.hypot(v.x,v.y);
const lerp=(a:WorldPoint,b:WorldPoint,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const headingDeg=(v:WorldPoint)=>((Math.atan2(v.y,v.x)*180/Math.PI)+360)%360;
const round=(v:number,d=6)=>Math.round(v*10**d)/10**d;

export function stations(points:WorldPoint[]){const out=[0];for(let i=1;i<points.length;i++)out.push(out[i-1]+len(sub(points[i],points[i-1])));return out;}
export function pointAt(points:WorldPoint[],station:number){
  const s=stations(points);
  for(let i=1;i<points.length;i++)if(station<=s[i]+EPS){const t=(station-s[i-1])/((s[i]-s[i-1])||1);return lerp(points[i-1],points[i],Math.max(0,Math.min(1,t)));}
  return points[points.length-1];
}
/** Index of the segment containing a station (segment i runs from point i to i+1). */
function segmentAt(points:WorldPoint[],station:number,preferAhead:boolean){
  const s=stations(points);
  for(let i=0;i<points.length-1;i++){
    if(preferAhead?station<s[i+1]-EPS:station<=s[i+1]+EPS)return i;
  }
  return points.length-2;
}

/** Geometric candidates only. Nothing here changes topology. */
export function detectCandidates(roads:Road[],tolerance=1):Candidate[]{
  const out:Candidate[]=[];
  for(let a=0;a<roads.length;a++)for(let b=a+1;b<roads.length;b++){
    const A=roads[a],B=roads[b],sa=stations(A.points),sb=stations(B.points);
    for(let i=0;i<A.points.length-1;i++)for(let j=0;j<B.points.length-1;j++){
      const p=A.points[i],r=sub(A.points[i+1],p),q=B.points[j],s=sub(B.points[j+1],q),den=r.x*s.y-r.y*s.x;
      if(Math.abs(den)<EPS)continue;
      const qp=sub(q,p),t=(qp.x*s.y-qp.y*s.x)/den,u=(qp.x*r.y-qp.y*r.x)/den;
      const ta=tolerance/(len(r)||1),tb=tolerance/(len(s)||1);
      if(t<-ta||t>1+ta||u<-tb||u>1+tb)continue;
      const stA=Math.max(0,Math.min(sa[sa.length-1],sa[i]+t*len(r))),stB=Math.max(0,Math.min(sb[sb.length-1],sb[j]+u*len(s)));
      const endA=stA<tolerance||stA>sa[sa.length-1]-tolerance,endB=stB<tolerance||stB>sb[sb.length-1]-tolerance;
      if(endA&&endB)continue; // two road ends touching = a simple continuation, not handled by the spike
      const point=lerp(p,A.points[i+1],Math.max(0,Math.min(1,t)));
      const same=out.find(c=>len(sub(c.point,point))<tolerance);
      if(same){ // several roads meeting at one point form one candidate
        for(const ref of [{roadId:A.id,station:round(stA)},{roadId:B.id,station:round(stB)}])if(!same.roads.some(r=>r.roadId===ref.roadId))same.roads.push(ref);
        continue;
      }
      out.push({id:`C-${A.id}-${B.id}-${out.length+1}`,kind:endA||endB?'tee':'cross',point,roads:[{roadId:A.id,station:round(stA)},{roadId:B.id,station:round(stB)}]});
    }
  }
  return out;
}

function sectionArm(base:Arm,road:Road,side:'ahead'|'behind',angle:number,length:number,name:string):Arm{
  const s=road.section,bands=s.bands??[];
  // Leg pointing along the road's direction: traffic leaving the junction travels forward.
  const outgoing=side==='ahead'?s.forwardLanes:s.backwardLanes,incoming=side==='ahead'?s.backwardLanes:s.forwardLanes;
  const section={width:s.laneWidth,walk:s.walk,bands:structuredClone(bands)};
  const arm:Arm={...structuredClone(base),name,angle:round(angle,4),length:round(length,3),incoming,outgoing,width:s.laneWidth,walk:s.walk,bands:structuredClone(bands),median:s.median,
    incomingSection:{...section},outgoingSection:structuredClone(section),incomingPockets:undefined,outgoingPockets:undefined,laneMarkings:undefined,arrowOverrides:undefined};
  if(!incoming){arm.crossing=false;arm.signal=false;arm.stop=false;}
  return {...arm,laneMarkings:markingsFor(arm)};
}

type Leg={roadId:string;side:'ahead'|'behind';heading:number;available:number;viaStation:number};

/** Compile roads + explicit decisions onto the existing Network model. */
export function compileRoadNetwork(roads:Road[],decisions:Decision[],options:CompileOptions={}):CompileResult{
  const approach=options.approachLength??40,tolerance=options.tolerance??1,issues:string[]=[];
  const candidates=detectCandidates(roads,tolerance),byId=new Map(candidates.map(c=>[c.id,c]));
  const confirmed=decisions.filter(d=>d.decision==='junction').map(d=>({d,c:byId.get(d.candidateId)})).filter((v):v is {d:Decision;c:Candidate}=>{if(!v.c)issues.push(`ไม่พบจุดตัดที่เสนอ ${v.d.candidateId}`);return !!v.c;});
  for(const c of candidates)if(!decisions.some(d=>d.candidateId===c.id))issues.push(`จุดตัด ${c.id} ยังไม่ได้ยืนยัน`);
  const roadById=new Map(roads.map(r=>[r.id,r]));
  // Junction stations per road, sorted.
  const onRoad=new Map<string,{station:number;jIndex:number}[]>();
  confirmed.forEach(({c},jIndex)=>c.roads.forEach(r=>{const list=onRoad.get(r.roadId)??[];list.push({station:r.station,jIndex});onRoad.set(r.roadId,list);}));
  onRoad.forEach(list=>list.sort((a,b)=>a.station-b.station));

  const junctions:JunctionInstance[]=[],legs:LegBinding[]=[],armLength=new Map<string,number>();
  confirmed.forEach(({d,c},jIndex)=>{
    const id=`J-${jIndex+1}`,found:Leg[]=[];
    for(const ref of c.roads){
      const road=roadById.get(ref.roadId)!,s=stations(road.points),total=s[s.length-1],list=onRoad.get(road.id)!,k=list.findIndex(v=>v.jIndex===jIndex);
      const next=list[k+1],prev=list[k-1];
      if(ref.station<total-tolerance){
        const seg=segmentAt(road.points,ref.station,true),vertex=s[seg+1];
        const limit=next?Math.min(approach,(next.station-ref.station)/2):Math.min(approach,total-ref.station);
        const available=Math.min(limit,vertex-ref.station);
        if(!next&&vertex<total-EPS&&vertex-ref.station<total-ref.station)issues.push(`${road.name}: ปลายถนนหลังทางแยก ${id} มีโค้ง · ช่วงหลังโค้งยังแสดงไม่ได้ (ต้องมีจุดปลายถนนในโมเดล)`);
        found.push({roadId:road.id,side:'ahead',heading:headingDeg(sub(road.points[seg+1],road.points[seg])),available,viaStation:ref.station+available});
      }
      if(ref.station>tolerance){
        const seg=segmentAt(road.points,ref.station,false),vertex=s[seg];
        const limit=prev?Math.min(approach,(ref.station-prev.station)/2):Math.min(approach,ref.station);
        const available=Math.min(limit,ref.station-vertex);
        if(!prev&&vertex>EPS&&ref.station-vertex<ref.station)issues.push(`${road.name}: ปลายถนนก่อนทางแยก ${id} มีโค้ง · ช่วงก่อนโค้งยังแสดงไม่ได้ (ต้องมีจุดปลายถนนในโมเดล)`);
        found.push({roadId:road.id,side:'behind',heading:headingDeg(sub(road.points[seg],road.points[seg+1])),available,viaStation:ref.station-available});
      }
    }
    if(found.length>4){issues.push(`${id}: มี ${found.length} ขา · เครื่องยนต์ทางแยกปัจจุบันรองรับสูงสุด 4 ขา`);found.length=4;}
    found.sort((a,b)=>a.heading-b.heading);
    const base=initial(),arms:Arm[]=[],enabled:boolean[]=[];
    for(let i=0;i<4;i++){
      const leg=found[i];
      if(!leg){arms.push({...base.arms[i],angle:(found.length?found[found.length-1].heading:0)+90*(i-found.length+1)});enabled.push(false);continue;}
      const road=roadById.get(leg.roadId)!;
      if(leg.available<MIN_ARM-EPS){issues.push(`${id}: ขา ${road.name} ${leg.side==='ahead'?'→':'←'} ยาวได้ ${leg.available.toFixed(1)} ม. แต่ขาทางแยกต้องยาวอย่างน้อย ${MIN_ARM} ม. (ถูกยืดเป็น ${MIN_ARM} ม. จึงไม่ตรงแนวถนน)`);leg.available=MIN_ARM;}
      arms.push(sectionArm(base.arms[i],road,leg.side,leg.heading,leg.available,`${road.name}${leg.side==='ahead'?' →':' ←'}`));
      enabled.push(true);
      legs.push({junctionId:id,armId:i,roadId:leg.roadId,side:leg.side});
      armLength.set(`${id}:${i}`,leg.available);
    }
    let design:Design={...base,arms,enabled,corner:d.treatments?.corner??base.corner,title:d.name??`ทางแยก ${jIndex+1}`};
    // Re-bind treatments by road leg (stable across recompiles), not by arm slot.
    const armOf=(key:LegKey)=>{const [roadId,side]=key.split(':');return legs.find(l=>l.junctionId===id&&l.roadId===roadId&&l.side===side)?.armId;};
    const slips:SlipLane[]=[];
    for(const t of d.treatments?.slips??[]){
      const from=armOf(t.from);
      if(from===undefined){issues.push(`${id}: Slip lane อ้างขาถนน ${t.from} ที่ไม่มีแล้ว`);continue;}
      const active=enabled.map((v,i)=>v?i:-1).filter(i=>i>=0),to=t.to?armOf(t.to):active[(active.indexOf(from)+1)%active.length];
      if(to===undefined||to===from){issues.push(`${id}: Slip lane ไม่มีขารับ`);continue;}
      slips.push({...defaultSlip(from,to,t.width,t.radius)});
    }
    design={...design,slips};
    // Arm marking defaults assume long arms. Shorten the solid divider until the arm fits, then fall back to dashed.
    for(let guard=0;guard<40&&designError(design)?.includes('สั้นเกินไปสำหรับเส้นหยุด');guard++){
      design={...design,arms:design.arms.map((a,i)=>{
        if(!design.enabled[i])return a;
        const solid=a.solidLength??36,out=a.outgoingSolidLength??30;
        return{...a,solidLength:Math.max(10,solid-2),outgoingSolidLength:Math.max(10,out-2),...(solid<=10?{dividerMode:'dashed' as const}:{}),...(out<=10?{outgoingDividerMode:'dashed' as const}:{})};
      })};
    }
    junctions.push({id,name:d.name??`ทางแยก ${jIndex+1}`,x:round(c.point.x),y:round(c.point.y),rotation:0,design});
  });

  const links:RoadLink[]=[];
  onRoad.forEach((list,roadId)=>{
    const road=roadById.get(roadId)!,s=stations(road.points);
    for(let k=0;k<list.length-1;k++){
      const a=list[k],b=list[k+1],ja=`J-${a.jIndex+1}`,jb=`J-${b.jIndex+1}`;
      const fromLeg=legs.find(l=>l.junctionId===ja&&l.roadId===roadId&&l.side==='ahead'),toLeg=legs.find(l=>l.junctionId===jb&&l.roadId===roadId&&l.side==='behind');
      if(!fromLeg||!toLeg){issues.push(`${road.name}: เชื่อม ${ja}→${jb} ไม่ได้`);continue;}
      const start=a.station+armLength.get(`${ja}:${fromLeg.armId}`)!,end=b.station-armLength.get(`${jb}:${toLeg.armId}`)!;
      const via=road.points.filter((_,i)=>s[i]>start+EPS&&s[i]<end-EPS).map(p=>({x:round(p.x),y:round(p.y),radius:p.radius??0}));
      links.push({id:`L-${links.length+1}`,name:`${road.name} ${links.length+1}`,from:{junctionId:ja,armId:fromLeg.armId},to:{junctionId:jb,armId:toLeg.armId},via,sectionProfile:{mode:'review'},components:[]});
    }
  });
  for(const road of roads)if(!onRoad.has(road.id))issues.push(`${road.name}: ไม่มีทางแยกที่ยืนยัน · ถนนเดี่ยวยังแสดงไม่ได้ (ต้องมีจุดปลายถนนในโมเดล)`);
  return {project:{schemaVersion:4,title:'Road-first spike',junctions,links,parallelCorridors:[]},legs,issues};
}
