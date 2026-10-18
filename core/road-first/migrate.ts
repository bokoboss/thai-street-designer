// One-way migration: Network (v1–v5) → road-first authoring model (ADR-0002, Phase 2).
// Each chain "road end / junction arm → RoadLink → arm · junction · opposite arm → …" becomes one road.
// Junction-owned settings move to the junction decision, keyed by road leg; the approach zone keeps the
// original arm length and section. The result is checked by compiling it back and comparing geometry.
import {initial,markingsFor,type Arm} from '../junction/model';
import {normalizeArrowOverrides} from '../junction/arrow-layout';
import {
  validateNetworkProject,activeArmIds,isJunctionPort,linkLength,portHeading,portKey,portPoint,roadEndById,
  type JunctionInstance,type LinkEndRef,type LinkSectionProfile,type LinkStationComponent,type NetworkProject,type RoadEnd,type RoadLink,
} from '../network/network-project';
import {compileRoadNetwork,detectCandidates,endSection,sectionArm,type Decision,type JunctionTreatments,type Road,type RoadEndData,type RoadLinkComponent,type RoadLinkData,type RoadPoint,type RoadSection} from './derive';
import {APPROACH_FIELDS,DESIGN_FIELDS,LEG_FIELDS,applyApproach,applyLegTreatment,legKey,parseLegKey,type ApproachOverride,type DesignSettings,type LegKey,type LegSide,type LegSlip,type LegTreatment} from './leg-binding';
import {compareDigests,networkDigest} from './geometry-digest';
import type {RoadFirstProject} from './project';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a:number,b:number,tol=1e-6)=>Math.abs(a-b)<=tol;
type LegVisit={junction:JunctionInstance;armId:number;side:LegSide};
type Chain={points:RoadPoint[];legs:LegVisit[];links:{link:RoadLink;reversed:boolean}[];start?:RoadEnd;end?:RoadEnd};

/** Pair arms that carry one road through a junction: opposite arms of a 4-leg, the straightest pair of a 3-leg. */
function throughPairs(j:JunctionInstance){
  const arms=activeArmIds(j).sort((a,b)=>portHeading(j,a)-portHeading(j,b)),pair=new Map<number,number>();
  const link=(a:number,b:number)=>{pair.set(a,b);pair.set(b,a);};
  if(arms.length===4){link(arms[0],arms[2]);link(arms[1],arms[3]);}
  else if(arms.length===3){
    let best:[number,number]=[arms[0],arms[1]],score=Infinity;
    for(let i=0;i<3;i++)for(let k=i+1;k<3;k++){const gap=Math.abs(((portHeading(j,arms[k])-portHeading(j,arms[i])+540)%360)-180);if(gap<score){score=gap;best=[arms[i],arms[k]];}}
    link(...best);
  }
  return pair;
}

function reverseLinkData(link:RoadLink,total:number):{sectionProfile:LinkSectionProfile;components:LinkStationComponent[]}{
  const flip=(t:LinkSectionProfile['forwardLaneTransition'])=>t&&{...t,center:total-t.center};
  const p=link.sectionProfile,sectionProfile:LinkSectionProfile={mode:p.mode};
  if(p.backwardLaneTransition)sectionProfile.forwardLaneTransition=flip(p.backwardLaneTransition);
  if(p.forwardLaneTransition)sectionProfile.backwardLaneTransition=flip(p.forwardLaneTransition);
  const components=link.components.map(c=>({...structuredClone(c),direction:c.direction==='forward'?'backward':'forward',start:total-c.end,end:total-c.start,taperIn:c.taperOut,taperOut:c.taperIn}) as LinkStationComponent);
  return{sectionProfile,components};
}

export type MigrationResult={project:RoadFirstProject;issues:string[]};

export function migrateNetworkProject(net:NetworkProject):MigrationResult{
  const issues:string[]=[],pairs=new Map(net.junctions.map(j=>[j.id,throughPairs(j)]));
  const linkAt=new Map<string,RoadLink>();
  for(const l of net.links){linkAt.set(portKey(l.from),l);linkAt.set(portKey(l.to),l);}
  const visitedArms=new Set<string>(),visitedLinks=new Set<string>(),chains:Chain[]=[];
  const armKey=(j:JunctionInstance,a:number)=>`${j.id}:${a}`;
  const junction=(id:string)=>net.junctions.find(j=>j.id===id)!;

  /** Leave junction j through arm a and follow the road until it ends. */
  const leave=(c:Chain,j:JunctionInstance,a:number)=>{
    for(;;){
      visitedArms.add(armKey(j,a));c.legs.push({junction:j,armId:a,side:'ahead'});c.points.push({...portPoint(j,a),radius:0});
      const link=linkAt.get(`${j.id}:${a}`);if(!link||visitedLinks.has(link.id))return;
      visitedLinks.add(link.id);
      const reversed=!(isJunctionPort(link.from)&&link.from.junctionId===j.id&&link.from.armId===a);
      c.links.push({link,reversed});
      c.points.push(...(reversed?[...link.via].reverse():link.via).map(v=>({x:v.x,y:v.y,radius:v.radius})));
      const other:LinkEndRef=reversed?link.from:link.to;
      if(!isJunctionPort(other)){const end=roadEndById(net,other.endId)!;c.end=end;c.points.push({x:end.x,y:end.y,radius:0});return;}
      const next=junction(other.junctionId);j=next;
      visitedArms.add(armKey(j,other.armId));c.points.push({...portPoint(j,other.armId),radius:0},{x:j.x,y:j.y,radius:0});
      c.legs.push({junction:j,armId:other.armId,side:'behind'});
      const through=pairs.get(j.id)!.get(other.armId);if(through===undefined)return;
      a=through;
    }
  };
  // Starts: road ends, then stub arms (road ends at the junction), then through arms without a link.
  for(const end of net.roadEnds){
    const link=linkAt.get(`end:${end.id}`);if(!link||visitedLinks.has(link.id))continue;
    visitedLinks.add(link.id);
    const reversed=!(!isJunctionPort(link.from)&&link.from.endId===end.id),c:Chain={points:[{x:end.x,y:end.y,radius:0}],legs:[],links:[{link,reversed}],start:end};
    c.points.push(...(reversed?[...link.via].reverse():link.via).map(v=>({x:v.x,y:v.y,radius:v.radius})));
    const other=reversed?link.from:link.to;
    if(!isJunctionPort(other)){const e=roadEndById(net,other.endId)!;c.end=e;c.points.push({x:e.x,y:e.y,radius:0});}
    else{
      const j=junction(other.junctionId);visitedArms.add(armKey(j,other.armId));
      c.points.push({...portPoint(j,other.armId),radius:0},{x:j.x,y:j.y,radius:0});c.legs.push({junction:j,armId:other.armId,side:'behind'});
      const through=pairs.get(j.id)!.get(other.armId);if(through!==undefined)leave(c,j,through);
    }
    chains.push(c);
  }
  for(const j of net.junctions)for(const a of activeArmIds(j)){
    if(visitedArms.has(armKey(j,a))||pairs.get(j.id)!.has(a))continue;
    const c:Chain={points:[{x:j.x,y:j.y,radius:0}],legs:[],links:[]};leave(c,j,a);chains.push(c);
  }
  for(const j of net.junctions)for(const a of activeArmIds(j)){
    if(visitedArms.has(armKey(j,a))||linkAt.has(`${j.id}:${a}`))continue;
    const b=pairs.get(j.id)!.get(a)!;visitedArms.add(armKey(j,a));
    const c:Chain={points:[{...portPoint(j,a),radius:0},{x:j.x,y:j.y,radius:0}],legs:[{junction:j,armId:a,side:'behind'}],links:[]};leave(c,j,b);chains.push(c);
  }
  const loose=net.junctions.flatMap(j=>activeArmIds(j).filter(a=>!visitedArms.has(armKey(j,a))).map(()=>j.name));
  if(loose.length)issues.push(`ถนนวงรอบปิดผ่าน ${[...new Set(loose)].join(', ')} ยังย้ายมาไม่ได้`);

  // Roads, approach zones and leg treatments.
  const roads:Road[]=[],legOf=new Map<string,LegKey>(),approaches=new Map<string,Partial<Record<LegKey,ApproachOverride>>>(),legTreatments=new Map<string,Partial<Record<LegKey,LegTreatment>>>();
  const base=initial().arms[0];
  chains.forEach((c,n)=>{
    const first=c.legs[0],arm=first&&first.junction.design.arms[first.armId];
    const section:RoadSection=arm
      ?{forwardLanes:first.side==='ahead'?arm.outgoing:arm.incoming,backwardLanes:first.side==='ahead'?arm.incoming:arm.outgoing,laneWidth:arm.width,median:arm.median,walk:arm.walk,bands:structuredClone(arm.bands)}
      :{forwardLanes:c.start!.section.outgoing,backwardLanes:c.start!.section.incoming,laneWidth:c.start!.section.width,median:c.start!.section.median,walk:c.start!.section.walk,bands:structuredClone(c.start!.section.bands)};
    const road:Road={id:`R-${n+1}`,name:c.links[0]?.link.name??(arm?`${first.junction.name} · ${arm.name}`:`ถนน ${n+1}`),points:c.points,section};
    for(const leg of c.legs){
      const j=leg.junction,a=j.design.arms[leg.armId],key=legKey(road.id,leg.side);
      legOf.set(armKey(j,leg.armId),key);
      const derived=sectionArm(base,road,leg.side,portHeading(j,leg.armId),a.length,`${road.name}${leg.side==='ahead'?' →':' ←'}`);
      const zone:ApproachOverride={};
      for(const f of APPROACH_FIELDS)if(f==='length'||!same(a[f],derived[f]))(zone as Record<string,unknown>)[f]=a[f]===undefined?null:structuredClone(a[f]);
      const built=applyLegTreatment(applyApproach(derived,zone),{});
      const original:Arm={...a,laneMarkings:markingsFor(a),arrowOverrides:normalizeArrowOverrides(a)};
      const t:LegTreatment={};
      for(const f of LEG_FIELDS)if(!same(original[f],built[f]))(t as Record<string,unknown>)[f]=original[f]===undefined?null:structuredClone(original[f]);
      approaches.set(j.id,{...approaches.get(j.id),[key]:zone});
      if(Object.keys(t).length)legTreatments.set(j.id,{...legTreatments.get(j.id),[key]:t});
    }
    const endData=(end:RoadEnd|undefined,atStart:boolean):RoadEndData|undefined=>{
      if(!end)return undefined;
      const pts=road.points,p=atStart?pts[0]:pts[pts.length-1],q=atStart?pts[1]:pts[pts.length-2],heading=((Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI)+360)%360;
      const data:RoadEndData={name:end.name};
      if(!near(heading,end.heading,1e-6))data.heading=end.heading;
      if(!same(end.section,endSection(road,atStart)))data.section=structuredClone(end.section);
      return data;
    };
    const ends={start:endData(c.start,true),end:endData(c.end,false)};
    if(ends.start||ends.end)road.ends=ends;
    road.links=c.links.map(({link,reversed}):RoadLinkData=>{
      const total=linkLength(net,link),data=reversed?reverseLinkData(link,total):{sectionProfile:structuredClone(link.sectionProfile),components:structuredClone(link.components)};
      const components=data.components.map(comp=>{
        if(comp.kind!=='lane'||!comp.source)return comp as RoadLinkComponent;
        const {source,...rest}=comp,ends=[['from',link.from],['to',link.to]] as const;
        const hit=ends.find(([,ref])=>isJunctionPort(ref)&&ref.junctionId===source.junctionId&&ref.armId===source.armId);
        if(!hit){issues.push(`${link.name}: ช่องต่อเนื่องอ้างทางแยกที่ไม่ได้อยู่ปลายช่วงถนนนี้ จึงย้ายมาเป็นช่องธรรมดา`);return rest as RoadLinkComponent;}
        const end=reversed?(hit[0]==='from'?'to':'from'):hit[0];
        return{...rest,source:{kind:'junction-auxiliary',end,direction:source.direction,side:source.side,lane:source.lane}} as RoadLinkComponent;
      });
      return{name:link.name,sectionProfile:data.sectionProfile,...(components.length?{components}:{})};
    });
    roads.push(road);
  });

  // Junction decisions: each crossing that matches an existing junction is confirmed; any other crossing was not a junction.
  const decisions:Decision[]=[],designBase=initial(),matched=new Set<string>();
  for(const c of detectCandidates(roads)){
    const j=net.junctions.find(x=>Math.hypot(x.x-c.point.x,x.y-c.point.y)<.5);
    if(!j){decisions.push({candidateId:c.id,decision:'grade-separated'});continue;}
    matched.add(j.id);
    const settings:DesignSettings={};
    for(const f of DESIGN_FIELDS)if(!same(j.design[f],designBase[f]))(settings as Record<string,unknown>)[f]=structuredClone(j.design[f]);
    const slips:LegSlip[]=j.design.slips.map(s=>({from:legOf.get(armKey(j,s.fromArm))!,to:legOf.get(armKey(j,s.toArm))!,width:s.width,radius:s.radius,approach:structuredClone(s.approach),departure:structuredClone(s.departure),crossing:{...s.crossing},...(s.arrowOffset!==undefined?{arrowOffset:s.arrowOffset}:{})}));
    const treatments:JunctionTreatments={approaches:approaches.get(j.id)??{}};
    const legs=legTreatments.get(j.id);if(legs)treatments.legs=legs;
    if(slips.length)treatments.slips=slips;
    if(j.design.corner!==designBase.corner)treatments.corner=j.design.corner;
    if(Object.keys(settings).length)treatments.design=settings;
    const joined=[...new Set([...legOf].filter(([arm])=>arm.startsWith(`${j.id}:`)).map(([,leg])=>parseLegKey(leg)!.roadId))];
    decisions.push({candidateId:c.id,decision:'junction',name:j.name,roads:joined,treatments});
  }
  for(const j of net.junctions)if(!matched.has(j.id))issues.push(`${j.name}: หาจุดตัดของถนนที่ทางแยกนี้ไม่พบ`);
  if(net.parallelCorridors.length)issues.push(`ความสัมพันธ์ถนนหลักและทางขนาน ${net.parallelCorridors.length} ชุดยังไม่ย้ายมาในรูปแบบใหม่`);

  const project:RoadFirstProject={kind:'road-first',schemaVersion:1,title:net.title,roads,decisions,options:{}};
  // Golden self-check: the migrated model must compile back to the same drawn geometry.
  const compiled=compileRoadNetwork(roads,decisions,{});
  const engine=validateNetworkProject(compiled.project);if(engine)issues.push(`แบบที่ย้ายแล้วตรวจไม่ผ่าน · ${engine}`);
  issues.push(...compiled.issues,...compareDigests(networkDigest(net),networkDigest(compiled.project)));
  return{project,issues};
}

