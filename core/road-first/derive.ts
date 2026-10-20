// SPIKE (roadmap Phase 1B) — road-first authoring compiled onto the existing engine.
// Roads own alignment + section. Crossings become explicit candidates. Confirmed
// junctions compile to ordinary JunctionInstance/RoadLink objects, so every
// existing geometry, Slip, review, 2D/3D and export path is reused unchanged.
import {initial,markingsFor,type Arm,type Band,type Design} from '../junction/model';
import {defaultSlip,nextActiveArm,type SlipLane} from '../junction/slip-model';
import {requiredArmLength} from '../junction/arm-fit';
import {applyApproach,applyLegTreatment,legKey,parseLegKey,type ApproachOverride,type DesignSettings,type LegKey,type LegSlip,type LegTreatment} from './leg-binding';
import {isJunctionPort,type JunctionInstance,type LinkEndRef,type LinkSectionProfile,type LinkStationLaneComponent,type LinkStationWidthComponent,type NetworkProject,type RoadEnd,type RoadEndSection,type RoadLink,type WorldPoint} from '../network/network-project';
import {proposalId} from '../network/junction-auxiliary-proposal';
import type {Direction} from '../junction/model';

export type RoadSection={
  forwardLanes:number;backwardLanes:number;laneWidth:number;median:number;walk:number;bands?:Band[];
};
export type RoadPoint=WorldPoint&{radius?:number};
/** Road end overrides: a road end keeps its own name, facing and section when they differ from the road. */
export type RoadEndData={name?:string;heading?:number;section?:RoadEndSection};
/** Pocket continuation source, stored relative to the link end instead of a junction id. */
export type RoadLinkSource={kind:'junction-auxiliary';end:'from'|'to';direction:Direction;side:'left'|'right';lane:number};
export type RoadLinkComponent=LinkStationWidthComponent|(Omit<LinkStationLaneComponent,'source'>&{source?:RoadLinkSource});
/** Settings of the k-th RoadLink along the road (between consecutive junctions / road ends), in road direction. */
export type RoadLinkData={name?:string;sectionProfile?:LinkSectionProfile;components?:RoadLinkComponent[]};
export type Road={id:string;name:string;points:RoadPoint[];section:RoadSection;ends?:{start?:RoadEndData;end?:RoadEndData};links?:RoadLinkData[]};
export type CandidateKind='cross'|'tee';
export type Candidate={id:string;kind:CandidateKind;point:WorldPoint;roads:{roadId:string;station:number}[]};
export type {LegKey} from './leg-binding';
/** Junction-owned treatments keyed by road leg, so they survive recompiles and road edits. */
export type JunctionTreatments={slips?:LegSlip[];corner?:number;legs?:Partial<Record<LegKey,LegTreatment>>;approaches?:Partial<Record<LegKey,ApproachOverride>>;design?:DesignSettings};
/** roads: the roads that join at this junction; any other road through the same point passes over or under it. */
/** at: last known position of the crossing, used to re-attach the decision after road edits. */
/** excluded: roads that reach the junction point but were deliberately left out of it (not reported, never auto-joined). */
export type Decision={candidateId:string;decision:'junction'|'grade-separated'|'ignore';name?:string;roads?:string[];excluded?:string[];at?:WorldPoint;treatments?:JunctionTreatments};
export type CompileOptions={approachLength?:number;tolerance?:number};
export type LegBinding={junctionId:string;armId:number;roadId:string;side:'ahead'|'behind'};
/** sources: which crossing each compiled junction comes from and which road each RoadLink belongs to (for selection in the editor). */
export type CompileSources={junctions:Record<string,string>;links:Record<string,string>};
/**
 * unjoined: per junction (candidate id), roads that pass through or end at the junction point but are not part of it.
 * overflow: candidate ids of junctions with more legs than the engine supports (extra legs are left out and reported).
 */
export type CompileResult={project:NetworkProject;legs:LegBinding[];issues:string[];sources:CompileSources;unjoined:Record<string,string[]>;overflow:string[]};

/** Tool defaults (m): clearance kept before a bend, straight tail absorbed into an arm, shortest link left between two junctions. */
const EPS=1e-6,BEND_CLEARANCE=15,SHORT_TAIL=20,MIN_LINK=5;
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
      out.push({id:'',kind:endA||endB?'tee':'cross',point,roads:[{roadId:A.id,station:round(stA)},{roadId:B.id,station:round(stB)}]});
    }
  }
  return withStableIds(out);
}

/** Crossing id from the roads that meet there plus its order along the first road, so unrelated edits keep it. */
function withStableIds(list:Candidate[]){
  const groups=new Map<string,Candidate[]>();
  for(const c of list){const key=c.roads.map(r=>r.roadId).sort().join('+');groups.set(key,[...(groups.get(key)??[]),c]);}
  for(const [key,group] of groups){
    const lead=key.split('+')[0],at=(c:Candidate)=>c.roads.find(r=>r.roadId===lead)!.station;
    group.sort((a,b)=>at(a)-at(b)).forEach((c,k)=>{c.id=`C-${key}-${k+1}`;});
  }
  return list;
}

/** Section at a road end derived from the road; "outgoing" travels from the end into the road. */
export function endSection(road:Road,atStart:boolean):RoadEndSection{
  const s=road.section,lane={width:s.laneWidth,walk:s.walk,bands:structuredClone(s.bands??[])};
  return{incoming:atStart?s.backwardLanes:s.forwardLanes,outgoing:atStart?s.forwardLanes:s.backwardLanes,median:s.median,width:s.laneWidth,walk:s.walk,bands:structuredClone(s.bands??[]),incomingSection:{...lane,bands:structuredClone(lane.bands)},outgoingSection:{...lane,bands:structuredClone(lane.bands)}};
}

export function sectionArm(base:Arm,road:Road,side:'ahead'|'behind',angle:number,length:number,name:string):Arm{
  const s=road.section,bands=s.bands??[];
  // Leg pointing along the road's direction: traffic leaving the junction travels forward.
  const outgoing=side==='ahead'?s.forwardLanes:s.backwardLanes,incoming=side==='ahead'?s.backwardLanes:s.forwardLanes;
  const section={width:s.laneWidth,walk:s.walk,bands:structuredClone(bands)};
  const arm:Arm={...structuredClone(base),name,angle:round(angle,4),length:round(length,3),incoming,outgoing,width:s.laneWidth,walk:s.walk,bands:structuredClone(bands),median:s.median,
    incomingSection:{...section},outgoingSection:structuredClone(section),incomingPockets:undefined,outgoingPockets:undefined,laneMarkings:undefined,arrowOverrides:undefined};
  if(!incoming){arm.crossing=false;arm.signal=false;arm.stop=false;}
  return {...arm,laneMarkings:markingsFor(arm)};
}

/** available: preferred arm length; room: longest straight arm that still leaves the road's next bend or junction clear. */
type Leg={roadId:string;side:'ahead'|'behind';heading:number;available:number;room:number};

/** Compile roads + explicit decisions onto the existing Network model. */
export function compileRoadNetwork(roads:Road[],decisions:Decision[],options:CompileOptions={}):CompileResult{
  const approach=options.approachLength??40,tolerance=options.tolerance??1,issues:string[]=[];
  const candidates=detectCandidates(roads,tolerance),byId=new Map(candidates.map(c=>[c.id,c]));
  const unjoined:Record<string,string[]>={},overflow:string[]=[];
  const confirmed=decisions.filter(d=>d.decision==='junction').map(d=>{
    const c=byId.get(d.candidateId);
    const left=c&&d.roads?c.roads.map(r=>r.roadId).filter(id=>!d.roads!.includes(id)&&!d.excluded?.includes(id)):[];
    if(left.length){unjoined[d.candidateId]=left;const names=left.map(id=>roads.find(r=>r.id===id)?.name??id).join(', ');issues.push(`${d.name??d.candidateId}: ถนน ${names} ผ่านหรือมาจบที่ทางแยกนี้แต่ไม่ได้เชื่อมเข้าทางแยก`);}
    return{d,c:c&&d.roads?{...c,roads:c.roads.filter(r=>d.roads!.includes(r.roadId))}:c};
  }).filter((v):v is {d:Decision;c:Candidate}=>{
    // A decision set aside while its roads do not cross ("dormant:" id) is kept quietly until they cross again.
    if(!v.c){if(!v.d.candidateId.startsWith('dormant:'))issues.push(`ไม่พบจุดตัดที่เสนอ ${v.d.candidateId}`);return false;}
    if(v.c.roads.length<2){issues.push(`${v.d.name??v.d.candidateId}: ถนนที่เลือกให้มาบรรจบกันมีไม่ถึงสองสาย`);return false;}
    return true;
  });
  for(const c of candidates)if(!decisions.some(d=>d.candidateId===c.id))issues.push(`จุดตัด ${c.id} ยังไม่ได้ยืนยัน`);
  const roadById=new Map(roads.map(r=>[r.id,r]));
  // Junction stations per road, sorted.
  const onRoad=new Map<string,{station:number;jIndex:number}[]>();
  confirmed.forEach(({c},jIndex)=>c.roads.forEach(r=>{const list=onRoad.get(r.roadId)??[];list.push({station:r.station,jIndex});onRoad.set(r.roadId,list);}));
  onRoad.forEach(list=>list.sort((a,b)=>a.station-b.station));

  /** Straight approach zone for a leg. A short straight tail is absorbed into the arm; otherwise the road continues as a link. */
  const legLength=(toNextJunction:number|null,toRoadEnd:number,toVertex:number,vertexIsRoadEnd:boolean)=>{
    if(toNextJunction!==null)return Math.min(approach,(toNextJunction-MIN_LINK)/2,vertexIsRoadEnd?toVertex:Math.max(toVertex-BEND_CLEARANCE,toVertex/2));
    if(vertexIsRoadEnd&&toRoadEnd<=approach+SHORT_TAIL)return toRoadEnd;
    return Math.min(approach,vertexIsRoadEnd?toRoadEnd:Math.max(toVertex-BEND_CLEARANCE,toVertex/2));
  };
  const legRoom=(toNextJunction:number|null,toRoadEnd:number,toVertex:number,vertexIsRoadEnd:boolean)=>
    Math.min(toNextJunction===null?Infinity:(toNextJunction-MIN_LINK)/2,vertexIsRoadEnd?toRoadEnd:toVertex-BEND_CLEARANCE);
  const sources:CompileSources={junctions:{},links:{}};
  const junctions:JunctionInstance[]=[],legs:LegBinding[]=[],armLength=new Map<string,number>();
  confirmed.forEach(({d,c},jIndex)=>{
    const id=`J-${jIndex+1}`,found:Leg[]=[];
    for(const ref of c.roads){
      const road=roadById.get(ref.roadId)!,s=stations(road.points),total=s[s.length-1],list=onRoad.get(road.id)!,k=list.findIndex(v=>v.jIndex===jIndex);
      const next=list[k+1],prev=list[k-1];
      if(ref.station<total-tolerance){
        const seg=segmentAt(road.points,ref.station,true),vertex=s[seg+1],toEnd=total-ref.station;
        found.push({roadId:road.id,side:'ahead',heading:headingDeg(sub(road.points[seg+1],road.points[seg])),available:legLength(next?next.station-ref.station:null,toEnd,vertex-ref.station,vertex>=total-EPS),room:legRoom(next?next.station-ref.station:null,toEnd,vertex-ref.station,vertex>=total-EPS)});
      }
      if(ref.station>tolerance){
        const seg=segmentAt(road.points,ref.station,false),vertex=s[seg];
        found.push({roadId:road.id,side:'behind',heading:headingDeg(sub(road.points[seg],road.points[seg+1])),available:legLength(prev?ref.station-prev.station:null,ref.station,ref.station-vertex,vertex<=EPS),room:legRoom(prev?ref.station-prev.station:null,ref.station,ref.station-vertex,vertex<=EPS)});
      }
    }
    if(found.length>4){issues.push(`${d.name??id}: มี ${found.length} ขา · ตอนนี้ทางแยกรองรับสูงสุด 4 ขา ขาที่เกินจึงไม่ได้สร้าง`);overflow.push(d.candidateId);found.length=4;}
    found.sort((a,b)=>a.heading-b.heading);
    const base=initial(),arms:Arm[]=[],enabled:boolean[]=[],room=new Map<number,number>();
    for(let i=0;i<4;i++){
      const leg=found[i];
      if(!leg){arms.push({...base.arms[i],angle:round((((found.length?found[found.length-1].heading:0)+90*(i-found.length+1))%360+360)%360,4)});enabled.push(false);continue;}
      const road=roadById.get(leg.roadId)!;
      const key=legKey(leg.roadId,leg.side),approachZone=d.treatments?.approaches?.[key];
      const derived=sectionArm(base.arms[i],road,leg.side,leg.heading,leg.available,`${road.name}${leg.side==='ahead'?' →':' ←'}`);
      arms.push(applyLegTreatment(applyApproach(derived,approachZone),d.treatments?.legs?.[key]??{}));
      enabled.push(true);
      // An authored approach length is kept as is; only a fit shortfall stretches it (and is reported).
      legs.push({junctionId:id,armId:i,roadId:leg.roadId,side:leg.side});room.set(i,approachZone?.length??leg.room);
    }
    let design:Design={...base,...structuredClone(d.treatments?.design??{}),arms,enabled,corner:d.treatments?.corner??base.corner,title:d.treatments?.design?.title??d.name??`ทางแยก ${jIndex+1}`};
    // Re-bind treatments by road leg (stable across recompiles), not by arm slot.
    const armOf=(key:LegKey)=>{const leg=parseLegKey(key);return leg?legs.find(l=>l.junctionId===id&&l.roadId===leg.roadId&&l.side===leg.side)?.armId:undefined;};
    const legLabel=(key:LegKey)=>{const leg=parseLegKey(key),road=leg&&roadById.get(leg.roadId);return road?`${road.name} ${leg!.side==='ahead'?'→':'←'}`:key;};
    for(const key of [...Object.keys(d.treatments?.legs??{}),...Object.keys(d.treatments?.approaches??{})] as LegKey[])if(armOf(key)===undefined)issues.push(`${id}: การตั้งค่าขา ${legLabel(key)} อ้างขาถนนที่ไม่มีแล้ว`);
    const slips:SlipLane[]=[];
    for(const t of d.treatments?.slips??[]){
      const from=armOf(t.from);
      if(from===undefined){issues.push(`${id}: Slip lane อ้างขาถนน ${legLabel(t.from)} ที่ไม่มีแล้ว`);continue;}
      const active=enabled.map((v,i)=>v?i:-1).filter(i=>i>=0),to=t.to?armOf(t.to):active[(active.indexOf(from)+1)%active.length];
      if(to===undefined||to===from){issues.push(`${id}: Slip lane ไม่มีขารับ`);continue;}
      if(to!==nextActiveArm({enabled,arms},from)){issues.push(`${id}: Slip lane จาก ${legLabel(t.from)} ไม่ได้อยู่ติดกับขารับแล้วหลังแก้ถนน จึงไม่ได้สร้าง`);continue;}
      const slip:SlipLane=defaultSlip(from,to,t.width,t.radius);
      if(t.approach)slip.approach=structuredClone(t.approach);
      if(t.departure)slip.departure=structuredClone(t.departure);
      if(t.crossing)slip.crossing={...t.crossing};
      if(t.arrowOffset!==undefined)slip.arrowOffset=t.arrowOffset;
      slips.push(slip);
    }
    design={...design,slips};
    // Fit-based arm length: an arm needs only what it carries. A leg too short for that is stretched and reported.
    for(const leg of legs.filter(l=>l.junctionId===id)){
      const road=roadById.get(leg.roadId)!,arm=design.arms[leg.armId],required=Math.ceil(requiredArmLength(design,leg.armId)*1000)/1000;
      if(arm.length<required-EPS){
        design.arms[leg.armId]={...arm,length:required};
        // Lengthening within the straight part of the road keeps the arm on the alignment.
        if(required<=room.get(leg.armId)!+EPS){armLength.set(`${id}:${leg.armId}`,required);continue;}
        issues.push(`${id}: ขา ${road.name} ${leg.side==='ahead'?'→':'←'} มีช่วงตรง ${Math.max(0,room.get(leg.armId)!).toFixed(1)} ม. แต่ขานี้ต้องยาวอย่างน้อย ${required.toFixed(1)} ม. สำหรับปากทางแยกและสิ่งที่อยู่บนขา (ถูกยืดจึงไม่ตรงแนวถนน)`);
      }
      armLength.set(`${id}:${leg.armId}`,design.arms[leg.armId].length);
    }
    junctions.push({id,name:d.name??`ทางแยก ${jIndex+1}`,x:round(c.point.x),y:round(c.point.y),rotation:0,design});sources.junctions[id]=d.candidateId;
  });

  const links:RoadLink[]=[],roadEnds:RoadEnd[]=[];
  const addEnd=(road:Road,atStart:boolean):LinkEndRef=>{
    const pts=road.points,p=atStart?pts[0]:pts[pts.length-1],q=atStart?pts[1]:pts[pts.length-2],data=road.ends?.[atStart?'start':'end'];
    const end:RoadEnd={id:`E-${roadEnds.length+1}`,name:data?.name??`${road.name} (${atStart?'ต้นทาง':'ปลายทาง'})`,x:round(p.x),y:round(p.y),
      heading:data?.heading??round(headingDeg(sub(q,p)),6)%360,section:structuredClone(data?.section??endSection(road,atStart))};
    roadEnds.push(end);return{endId:end.id};
  };
  const linkData=(road:Road,link:RoadLink,data:RoadLinkData|undefined):RoadLink=>{
    if(!data)return link;
    const components=(data.components??[]).flatMap(c=>{
      if(c.kind!=='lane'||!c.source)return[structuredClone(c) as RoadLink['components'][number]];
      const {source:raw,...rest}=structuredClone(c),source=raw!,ref=link[source.end];
      if(!isJunctionPort(ref)){issues.push(`${road.name}: ช่องต่อเนื่องจากทางแยกบนช่วงถนนนี้ไม่มีทางแยกที่ปลายแล้ว`);return[rest as LinkStationLaneComponent];}
      return[{...rest,source:{kind:'junction-auxiliary' as const,handoffId:proposalId(link,source.end,source.direction,source.side),junctionId:ref.junctionId,armId:ref.armId,direction:source.direction,side:source.side,lane:source.lane}}];
    });
    return{...link,name:data.name??link.name,sectionProfile:structuredClone(data.sectionProfile??link.sectionProfile),components};
  };
  for(const road of roads){
    const s=stations(road.points),total=s[s.length-1],list=onRoad.get(road.id)??[];
    type Node={ref:LinkEndRef;station:number};
    const nodes:{ahead?:Node;behind?:Node}[]=[];
    const first=list[0],last=list.at(-1);
    // Road start: a junction leg absorbs it, otherwise a road end node.
    if(!first||first.station>tolerance){
      const fromJunction=first?legs.find(l=>l.junctionId===`J-${first.jIndex+1}`&&l.roadId===road.id&&l.side==='behind'):undefined;
      const reach=fromJunction?first!.station-armLength.get(`${fromJunction.junctionId}:${fromJunction.armId}`)!:0;
      if(!first||reach>EPS)nodes.push({ahead:{ref:addEnd(road,true),station:0}});
    }
    for(const v of list){
      const jid=`J-${v.jIndex+1}`,ahead=legs.find(l=>l.junctionId===jid&&l.roadId===road.id&&l.side==='ahead'),behind=legs.find(l=>l.junctionId===jid&&l.roadId===road.id&&l.side==='behind');
      nodes.push({
        behind:behind?{ref:{junctionId:jid,armId:behind.armId},station:v.station-armLength.get(`${jid}:${behind.armId}`)!}:undefined,
        ahead:ahead?{ref:{junctionId:jid,armId:ahead.armId},station:v.station+armLength.get(`${jid}:${ahead.armId}`)!}:undefined,
      });
    }
    if(!last||last.station<total-tolerance){
      const toJunction=last?legs.find(l=>l.junctionId===`J-${last.jIndex+1}`&&l.roadId===road.id&&l.side==='ahead'):undefined;
      const reach=toJunction?last!.station+armLength.get(`${toJunction.junctionId}:${toJunction.armId}`)!:total;
      if(!last||reach<total-EPS)nodes.push({behind:{ref:addEnd(road,false),station:total}});
    }
    let span=0;
    for(let k=0;k<nodes.length-1;k++){
      const from=nodes[k].ahead,to=nodes[k+1].behind;
      if(!from||!to){issues.push(`${road.name}: ต่อช่วงถนนไม่ได้`);continue;}
      const via=road.points.filter((_,i)=>s[i]>from.station+EPS&&s[i]<to.station-EPS).map(p=>({x:round(p.x),y:round(p.y),radius:p.radius??0}));
      sources.links[`L-${links.length+1}`]=road.id;
      links.push(linkData(road,{id:`L-${links.length+1}`,name:`${road.name} ${links.length+1}`,from:from.ref,to:to.ref,via,sectionProfile:{mode:'review'},components:[]},road.links?.[span]));
      span++;
    }
    if((road.links?.length??0)>span)issues.push(`${road.name}: มีการตั้งค่าช่วงถนน ${road.links!.length} ช่วง แต่ถนนนี้มี ${span} ช่วง`);
  }
  return {project:{schemaVersion:5,title:'Road-first spike',junctions,links,parallelCorridors:[],roadEnds},legs,issues,sources,unjoined,overflow};
}
