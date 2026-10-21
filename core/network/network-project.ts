import {initial,markingsFor,migrate,pocketsFor,sectionFor,valid,validSection,type Arm,type Band,type Design,type Direction,type Pocket,type Section} from '../junction/model';
import {normalizeArrowOverrides} from '../junction/arrow-layout';
import {cachedEdges} from '../junction/geometry';
import {slipGeometries} from '../junction/slip-geometry';
import {fitArmLength} from '../junction/arm-fit';
import {designError} from '../junction/design-validation';
import {lengthOf,smoothAlignment,validAlignment} from '../common/alignment';

export type WorldPoint={x:number;y:number};
export type PortRef={junctionId:string;armId:number};
/** A road end without a junction. Its section is described like an arm: "outgoing" travels from the end into the road. */
export type RoadEndRef={endId:string};
export type LinkEndRef=PortRef|RoadEndRef;
export type RoadEndSection=Pick<Arm,'incoming'|'outgoing'|'median'|'width'|'walk'|'bands'|'incomingSection'|'outgoingSection'>;
/** heading = direction from the end point into the road, in world degrees (same convention as a port heading). */
export type RoadEnd={id:string;name:string;x:number;y:number;heading:number;section:RoadEndSection};
export type JunctionInstance={
  id:string;
  name:string;
  x:number;
  y:number;
  rotation:number;
  design:Design;
  /** Level of the junction (m); absent = 0 (Phase 4A). */
  z?:number;
};
export type LinkVia=WorldPoint&{radius:number};
export type LinkDirection='forward'|'backward';
export type LinkLaneTransition={side:'curb'|'median';center:number;length:number};
export type LinkSectionProfile={mode:'review'|'linear';forwardLaneTransition?:LinkLaneTransition;backwardLaneTransition?:LinkLaneTransition};
export type LinkWidthTarget='walk'|Band['type'];
export type JunctionAuxiliarySource={kind:'junction-auxiliary';handoffId:string;junctionId:string;armId:number;direction:Direction;side:'left'|'right';lane:number};
export type LinkStationLaneComponent={id:string;kind:'lane';direction:LinkDirection;side:'curb'|'median';start:number;end:number;taperIn:number;taperOut:number;source?:JunctionAuxiliarySource};
export type LinkStationWidthComponent={id:string;kind:'width';direction:LinkDirection;target:LinkWidthTarget;start:number;end:number;taperIn:number;taperOut:number;delta:number};
export type LinkStationComponent=LinkStationLaneComponent|LinkStationWidthComponent;
export type LinkStationComponentPatch={direction?:LinkDirection;side?:'curb'|'median';target?:LinkWidthTarget;start?:number;end?:number;taperIn?:number;taperOut?:number;delta?:number};
export type RoadLink={
  id:string;
  name:string;
  from:LinkEndRef;
  to:LinkEndRef;
  via:LinkVia[];
  sectionProfile:LinkSectionProfile;
  components:LinkStationComponent[];
  /** Trees and street lights along both sidewalks (engine roadside defaults for spacing and sizes). */
  roadside?:{trees:boolean;lights:boolean};
  /** Vertical points along the link, link-local stations (Phase 4A). Linear between points; absent = level 0. */
  levels?:{station:number;z:number}[];
  /** Mid-block median openings, link-local stations (start from the link's start). Optional; absent in older files. */
  medianOpenings?:LinkMedianOpening[];
};
export type LinkMedianOpening={id:string;start:number;length:number;type?:'opening'|'uturn'};
export type ParallelCorridorSide='left'|'right';
export type ParallelFrontageChain={side:ParallelCorridorSide;linkIds:string[];seedReviewJunctionIds?:string[]};
export type ParallelCorridor={
  id:string;
  name:string;
  mainlineLinkIds:string[];
  mainlineStartJunctionId:string;
  frontage:ParallelFrontageChain[];
};
export type ParallelCorridorInput=Pick<ParallelCorridor,'name'|'mainlineLinkIds'|'mainlineStartJunctionId'|'frontage'>;
export type ParallelCorridorOrientation={startJunctionId:string;endJunctionId:string;junctionIds:string[]};
export type ParallelCorridorEditResult={project:NetworkProject;corridor?:ParallelCorridor;error:string|null};
export type ParallelCorridorLinkRole={corridor:ParallelCorridor;role:'mainline'|'frontage';side?:ParallelCorridorSide};
export type NetworkProject={
  schemaVersion:5;
  title:string;
  junctions:JunctionInstance[];
  links:RoadLink[];
  parallelCorridors:ParallelCorridor[];
  roadEnds:RoadEnd[];
  /** Grade-separated crossings (Phase 4A), from the road-first compile; read by 2D, 3D, export and report. */
  crossings?:NetworkCrossing[];
};
/**
 * relation: over = one road passes over the other; unresolved = levels equal or contradicting the chosen over road.
 * gap = level of the over road minus the under road at the crossing (measured only; no clearance check here).
 * deck: the over road across the crossing (for the plan's structure cue).
 */
export type NetworkCrossing={id:string;name:string;point:WorldPoint;relation:'over'|'unresolved';overLink?:string;underLink?:string;gap:number;deck?:{a:WorldPoint;b:WorldPoint;half:number};
  /** The lower road below ground under the upper one: a tunnel box over this stretch of the lower road. */
  tunnel?:{a:WorldPoint;b:WorldPoint;half:number;z:number}};
export type LinkEndSection={
  forwardLanes:number;
  backwardLanes:number;
  forwardLaneWidth:number;
  backwardLaneWidth:number;
  forwardBands:Band[];
  backwardBands:Band[];
  forwardWalk:number;
  backwardWalk:number;
  median:number;
};
export type LinkIssue={kind:'lane-count'|'lane-width'|'median'|'edge-section'|'station-component'|'alignment'|'port-facing'|'missing-port';message:string};
export type LinkStationComponentResult={project:NetworkProject;component?:LinkStationComponent;error:string|null};
export type PortConnectionAssessment={distance:number;fromDeviation:number;toDeviation:number;status:'valid'|'caution'|'invalid'};
export type ConnectPortsResult={project:NetworkProject;link?:RoadLink;error:string|null};
export type NetworkEditResult={project:NetworkProject;error:string|null};
export type NetworkRigidTransform={origin:WorldPoint;translation:WorldPoint;rotation:number};
export const NETWORK_PROJECT_STORAGE='thai-street-network-project-v1';
export const NETWORK_EDIT_JUNCTION_STORAGE='thai-street-network-edit-junction-v1';

const rad=(deg:number)=>deg*Math.PI/180;
const linkRadius=(value:unknown)=>Math.max(0,Math.min(200,Number.isFinite(Number(value))?Number(value):0));
const copyDesign=(d:Design):Design=>structuredClone(d);
const displayDesignCache=new WeakMap<Design,Design>();
const nextId=(prefix:string,ids:string[])=>{let n=1;while(ids.includes(`${prefix}-${n}`))n++;return `${prefix}-${n}`;};
const allIds=(project:NetworkProject)=>[...project.junctions.map(j=>j.id),...project.links.map(l=>l.id),...(project.roadEnds??[]).map(e=>e.id)];
export const activeArmIds=(j:JunctionInstance)=>j.design.enabled.map((enabled,i)=>enabled?i:-1).filter(i=>i>=0);

export function portDistance(j:JunctionInstance,armId:number){
  const arm=j.design.arms[armId];
  return arm?.length??45;
}
export function portHeading(j:JunctionInstance,armId:number){
  return (j.rotation+j.design.rotation+(j.design.arms[armId]?.angle??0)+3600)%360;
}
export function portPoint(j:JunctionInstance,armId:number):WorldPoint{
  const distance=portDistance(j,armId),angle=rad(portHeading(j,armId));
  return{x:j.x+Math.cos(angle)*distance,y:j.y+Math.sin(angle)*distance};
}
export function junctionDisplayDesign(j:JunctionInstance):Design{
  const cached=displayDesignCache.get(j.design);if(cached)return cached;
  const d=copyDesign(j.design);
  d.rotation=0;
  d.showNames=false;
  d.showScale=false;
  d.trees=false;
  d.lights=false;
  d.display={...d.display,grid:false,trees:false,lights:false,dimensions:false,reviews:false,handles:false};

  displayDesignCache.set(j.design,d);
  return d;
}
export function worldJunctionRotation(j:JunctionInstance){
  return j.rotation+j.design.rotation;
}
const normalizedRotation=(rotation:number)=>((rotation%360)+360)%360;
export function transformNetworkProject(project:NetworkProject,transform:NetworkRigidTransform):NetworkProject{
  const {origin,translation}=transform,rotation=normalizedRotation(transform.rotation);
  if(![origin.x,origin.y,translation.x,translation.y,rotation].every(Number.isFinite))return project;
  if(Math.abs(translation.x)<1e-12&&Math.abs(translation.y)<1e-12&&Math.abs(rotation)<1e-12)return project;
  const angle=rad(rotation),cos=Math.cos(angle),sin=Math.sin(angle),move=(point:WorldPoint):WorldPoint=>{
    const dx=point.x-origin.x,dy=point.y-origin.y;
    return{x:origin.x+dx*cos-dy*sin+translation.x,y:origin.y+dx*sin+dy*cos+translation.y};
  };
  return{
    ...project,
    junctions:project.junctions.map(j=>{const p=move(j);return{...j,x:p.x,y:p.y,rotation:normalizedRotation(j.rotation+rotation)};}),
    links:project.links.map(link=>({...link,via:link.via.map(v=>({...move(v),radius:v.radius}))}))
  };
}
export function junctionById(project:NetworkProject,id:string){
  return project.junctions.find(j=>j.id===id);
}
export const isJunctionPort=(ref:LinkEndRef):ref is PortRef=>'junctionId' in ref;
/** Graph node of a link end: the junction id, or `end:<id>` for a road end. */
export const nodeId=(ref:LinkEndRef)=>isJunctionPort(ref)?ref.junctionId:`end:${ref.endId}`;
export function roadEndById(project:NetworkProject,id:string){
  return (project.roadEnds??[]).find(e=>e.id===id);
}
/** Junction arm behind a port. Road ends have no arm. */
export function armForPort(project:NetworkProject,ref:LinkEndRef):Arm|undefined{
  if(!isJunctionPort(ref))return undefined;
  const junction=junctionById(project,ref.junctionId);
  return junction?.design.enabled[ref.armId]?junction.design.arms[ref.armId]:undefined;
}
/** Section source at a link end: the junction arm, or the road end's own section. */
export function endSectionSource(project:NetworkProject,ref:LinkEndRef):RoadEndSection|undefined{
  return isJunctionPort(ref)?armForPort(project,ref):roadEndById(project,ref.endId)?.section;
}
export function linkEndExists(project:NetworkProject,ref:LinkEndRef){return !!endSectionSource(project,ref);}
export function worldPort(project:NetworkProject,ref:LinkEndRef):WorldPoint|null{
  if(!isJunctionPort(ref)){const end=roadEndById(project,ref.endId);return end?{x:end.x,y:end.y}:null;}
  const junction=junctionById(project,ref.junctionId);
  return junction&&junction.design.enabled[ref.armId]?portPoint(junction,ref.armId):null;
}
/** Direction in which a link leaves this end, in world degrees. */
export function linkEndHeading(project:NetworkProject,ref:LinkEndRef):number|null{
  if(!isJunctionPort(ref)){const end=roadEndById(project,ref.endId);return end?((end.heading%360)+360)%360:null;}
  const junction=junctionById(project,ref.junctionId);
  return junction?portHeading(junction,ref.armId):null;
}
export function linkControlPoints(project:NetworkProject,link:RoadLink){
  const from=worldPort(project,link.from),to=worldPort(project,link.to);
  return from&&to?[from,...link.via.map(v=>({x:v.x,y:v.y,radius:v.radius})),to]:[];
}
const pointDistance=(a:WorldPoint,b:WorldPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const tangentStub=(port:WorldPoint,target:WorldPoint,heading:number)=>{
  const available=pointDistance(port,target);
  if(available<12)return null;
  const length=Math.min(18,Math.max(5,available*.22)),a=rad(heading);
  return{x:port.x+Math.cos(a)*length,y:port.y+Math.sin(a)*length,radius:Math.min(35,Math.max(12,length*2))};
};
/** Derived controls keep Link endpoint tangency aligned to semantic Arm headings. */
export function linkAlignmentControls(project:NetworkProject,link:RoadLink){
  const raw=linkControlPoints(project,link),fromHeading=linkEndHeading(project,link.from),toHeading=linkEndHeading(project,link.to);
  if(raw.length<2||fromHeading===null||toHeading===null)return raw;
  const from=raw[0],to=raw.at(-1)!,fromTarget=link.via[0]??to,toTarget=link.via.at(-1)??from,
    fromStub=tangentStub(from,fromTarget,fromHeading),
    toStub=tangentStub(to,toTarget,toHeading);
  const build=(useFrom:boolean,useTo:boolean,curved:boolean)=>{
    const out:(WorldPoint&{radius?:number})[]=[from];
    if(useFrom&&fromStub)out.push({...fromStub,radius:curved?fromStub.radius:0});
    out.push(...link.via.map(v=>({x:v.x,y:v.y,radius:v.radius})));
    if(useTo&&toStub)out.push({...toStub,radius:curved?toStub.radius:0});
    out.push(to);
    return out;
  };
  for(const candidate of [build(true,true,true),build(true,true,false),build(true,false,true),build(false,true,true)]){
    if(candidate.length>=2&&validAlignment(candidate))return candidate;
  }
  return raw;
}
export function linkPoints(project:NetworkProject,link:RoadLink){
  const controls=linkAlignmentControls(project,link);
  return controls.length>=2?smoothAlignment(controls):[];
}
export function linkLength(project:NetworkProject,link:RoadLink){
  const points=linkPoints(project,link);return points.length>=2?lengthOf(points):0;
}
const clampNumber=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const stationRange=(total:number,start:number,end:number,taperIn:number,taperOut:number)=>{
  const length=Math.max(.5,total),a=clampNumber(Number.isFinite(start)?start:0,0,Math.max(0,length-.5)),b=clampNumber(Number.isFinite(end)?end:length,a+.5,length),
    span=Math.max(.5,b-a),rawIn=Math.max(0,Number.isFinite(taperIn)?taperIn:0),rawOut=Math.max(0,Number.isFinite(taperOut)?taperOut:0),
    scale=rawIn+rawOut>span&&rawIn+rawOut>0?span/(rawIn+rawOut):1;
  return{start:+a.toFixed(2),end:+b.toFixed(2),taperIn:+(rawIn*scale).toFixed(2),taperOut:+(rawOut*scale).toFixed(2)};
};
export function setLinkVia(project:NetworkProject,id:string,via:(WorldPoint&{radius?:number})[]):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const candidate:RoadLink={...link,via:via.map(p=>({x:p.x,y:p.y,radius:linkRadius(p.radius)}))},controls=linkControlPoints(project,candidate);
  if(controls.length<2||!validAlignment(controls))return project;
  return{...project,links:project.links.map(l=>l.id===id?candidate:l)};
}
export function insertLinkVia(project:NetworkProject,id:string,index:number,point:WorldPoint){
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const via=[...link.via];via.splice(Math.max(0,Math.min(index,via.length)),0,{...point,radius:25});
  return setLinkVia(project,id,via);
}
export function moveLinkVia(project:NetworkProject,id:string,index:number,point:WorldPoint){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.map((p,i)=>i===index?{...p,...point}:p));
}
export function updateLinkViaRadius(project:NetworkProject,id:string,index:number,radius:number){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.map((p,i)=>i===index?{...p,radius:linkRadius(radius)}:p));
}
export function removeLinkVia(project:NetworkProject,id:string,index:number){
  const link=project.links.find(l=>l.id===id);if(!link||!link.via[index])return project;
  return setLinkVia(project,id,link.via.filter((_,i)=>i!==index));
}
export function linkEndSection(project:NetworkProject,link:RoadLink,end:'from'|'to'):LinkEndSection|null{
  const arm=endSectionSource(project,end==='from'?link.from:link.to);
  if(!arm)return null;
  const incoming=sectionFor(arm,'incoming'),outgoing=sectionFor(arm,'outgoing');
  return end==='from'
    ?{forwardLanes:arm.outgoing,backwardLanes:arm.incoming,forwardLaneWidth:outgoing.width,backwardLaneWidth:incoming.width,forwardBands:outgoing.bands,backwardBands:incoming.bands,forwardWalk:outgoing.walk,backwardWalk:incoming.walk,median:arm.median}
    :{forwardLanes:arm.incoming,backwardLanes:arm.outgoing,forwardLaneWidth:incoming.width,backwardLaneWidth:outgoing.width,forwardBands:incoming.bands,backwardBands:outgoing.bands,forwardWalk:incoming.walk,backwardWalk:outgoing.walk,median:arm.median};
}
const sameBandTypes=(x:Band[],y:Band[])=>x.length===y.length&&x.every((band,i)=>band.type===y[i].type);
const laneTransitionKey=(direction:LinkDirection)=>direction==='forward'?'forwardLaneTransition':'backwardLaneTransition';
export function linkLaneCounts(project:NetworkProject,link:RoadLink,direction:LinkDirection){
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  return !a||!b?null:direction==='forward'?{from:a.forwardLanes,to:b.forwardLanes}:{from:a.backwardLanes,to:b.backwardLanes};
}
export function linkWidthTargets(project:NetworkProject,link:RoadLink,direction:LinkDirection):LinkWidthTarget[]{
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');if(!a||!b)return['walk'];
  const bandsA=direction==='forward'?a.forwardBands:a.backwardBands,bandsB=direction==='forward'?b.forwardBands:b.backwardBands,
    shared=sameBandTypes(bandsA,bandsB)?bandsA.map(v=>v.type):[];
  return['walk',...shared];
}
function linkWidthTargetRange(project:NetworkProject,link:RoadLink,direction:LinkDirection,target:LinkWidthTarget){
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');if(!a||!b)return null;
  if(target==='walk')return direction==='forward'?{from:a.forwardWalk,to:b.forwardWalk}:{from:a.backwardWalk,to:b.backwardWalk};
  const bandsA=direction==='forward'?a.forwardBands:a.backwardBands,bandsB=direction==='forward'?b.forwardBands:b.backwardBands,
    from=bandsA.find(v=>v.type===target),to=bandsB.find(v=>v.type===target);
  return from&&to?{from:from.width,to:to.width}:null;
}
export function addLinkStationComponent(project:NetworkProject,id:string,kind:'lane'|'width'):LinkStationComponentResult{
  const link=project.links.find(l=>l.id===id);if(!link)return{project,error:'ไม่พบ Road Link'};
  if(link.sectionProfile.mode!=='linear'||!linkLinearTransitionPossible(project,link))return{project,error:'เลือกโหมด “เปลี่ยนต่อเนื่องตามระยะ” ก่อนเพิ่มช่องเสริมหรือช่วงขยายขอบทาง'};
  if(link.components.length>=24)return{project,error:'Road Link รองรับ station components ได้ไม่เกิน 24 รายการ'};
  const total=Math.max(.5,linkLength(project,link)),start=total*.25,end=total*.75,span=end-start,taper=Math.min(20,span*.25),range=stationRange(total,start,end,taper,taper),
    componentId=nextId('C',link.components.map(v=>v.id)),
    component:LinkStationComponent=kind==='lane'
      ?{id:componentId,kind:'lane',direction:'forward',side:'curb',...range}
      :{id:componentId,kind:'width',direction:'forward',target:'walk',delta:1,...range};
  const next={...project,links:project.links.map(l=>l.id===id?{...l,components:[...l.components,component]}:l)};
  return{project:next,component,error:null};
}
export function updateLinkStationComponent(project:NetworkProject,id:string,componentId:string,patch:LinkStationComponentPatch):LinkStationComponentResult{
  const link=project.links.find(l=>l.id===id),current=link?.components.find(v=>v.id===componentId);if(!link||!current)return{project,error:'ไม่พบ station component'};
  const total=Math.max(.5,linkLength(project,link)),direction=patch.direction??current.direction,range=stationRange(total,patch.start??current.start,patch.end??current.end,patch.taperIn??current.taperIn,patch.taperOut??current.taperOut);
  let component:LinkStationComponent;
  if(current.kind==='lane'){
    const {source:_source,...detached}=current;
    component={...detached,direction,side:patch.side??current.side,...range};
  }else{
    const target=patch.target??current.target,base=linkWidthTargetRange(project,link,direction,target);
    if(!base)return{project,error:'Edge-width target นี้ไม่มีอยู่ต่อเนื่องที่ปลาย Road Link ทั้งสองด้าน'};
    const minBase=Math.min(base.from,base.to),rawDelta=Number.isFinite(patch.delta)?Number(patch.delta):current.delta,
      delta=clampNumber(rawDelta,Math.max(-5,-minBase+.05),5);
    if(Math.abs(delta)<.01)return{project,error:'Width delta ต้องไม่เป็นศูนย์'};
    component={...current,direction,target,delta:+delta.toFixed(2),...range};
  }
  const next={...project,links:project.links.map(l=>l.id===id?{...l,components:l.components.map(v=>v.id===componentId?component:v)}:l)};
  return{project:next,component,error:null};
}
export function removeLinkStationComponent(project:NetworkProject,id:string,componentId:string):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link||!link.components.some(v=>v.id===componentId))return project;
  return{...project,links:project.links.map(l=>l.id===id?{...l,components:l.components.filter(v=>v.id!==componentId)}:l)};
}

export function linkLaneTransitionPossible(project:NetworkProject,link:RoadLink,direction:LinkDirection){
  const counts=linkLaneCounts(project,link,direction);
  return !!counts&&counts.from>0&&counts.to>0&&Math.abs(counts.from-counts.to)===1;
}
export function linkLaneTransitionValid(project:NetworkProject,link:RoadLink,direction:LinkDirection){
  const counts=linkLaneCounts(project,link,direction);
  if(!counts)return false;
  if(counts.from===counts.to)return true;
  const transition=link.sectionProfile[laneTransitionKey(direction)];
  return linkLaneTransitionPossible(project,link,direction)&&!!transition&&['curb','median'].includes(transition.side)&&Number.isFinite(transition.center)&&Number.isFinite(transition.length)&&transition.center>=0&&transition.length>=3;
}
export function updateLinkLaneTransition(project:NetworkProject,id:string,direction:LinkDirection,transition:LinkLaneTransition|null):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  const key=laneTransitionKey(direction);
  if(transition&&!linkLaneTransitionPossible(project,link,direction))return project;
  const length=Math.max(3,linkLength(project,link)),next=transition?{side:transition.side,center:Math.max(0,Math.min(length,transition.center)),length:Math.max(3,Math.min(length,transition.length))}:undefined,
    profile={...link.sectionProfile,[key]:next};
  if(!next)delete profile[key];
  return{...project,links:project.links.map(l=>l.id===id?{...l,sectionProfile:profile}:l)};
}
export function defaultLinkLaneTransition(project:NetworkProject,link:RoadLink,direction:LinkDirection,side:LinkLaneTransition['side']){
  const total=Math.max(3,linkLength(project,link)),length=Math.max(3,Math.min(40,total*.3));
  return updateLinkLaneTransition(project,link.id,direction,{side,center:total/2,length});
}
export function linkLinearTransitionPossible(project:NetworkProject,link:RoadLink){
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  return !!a&&!!b&&sameBandTypes(a.forwardBands,b.forwardBands)&&sameBandTypes(a.backwardBands,b.backwardBands)&&linkLaneTransitionValid(project,link,'forward')&&linkLaneTransitionValid(project,link,'backward');
}
export function updateLinkSectionProfile(project:NetworkProject,id:string,mode:LinkSectionProfile['mode']):NetworkProject{
  const link=project.links.find(l=>l.id===id);if(!link)return project;
  if(mode==='linear'&&!linkLinearTransitionPossible(project,link))return project;
  if(mode==='review'&&link.components.length)return project;
  return{...project,links:project.links.map(l=>l.id===id?{...l,sectionProfile:{...l.sectionProfile,mode}}:l)};
}
export function linkIssues(project:NetworkProject,link:RoadLink):LinkIssue[]{
  const a=linkEndSection(project,link,'from'),b=linkEndSection(project,link,'to');
  if(!a||!b)return[{kind:'missing-port',message:'Road Link อ้างถึง arm/port ที่ไม่มีอยู่'}];
  const out:LinkIssue[]=[],linear=link.sectionProfile.mode==='linear'&&linkLinearTransitionPossible(project,link),
    facing=assessPortConnection(project,link.from,link.to),total=linkLength(project,link);
  if(facing?.status==='invalid')out.push({kind:'port-facing',message:`ปลาย Road Link หันออกจากแนวเชื่อมมากเกินไป · FROM ${facing.fromDeviation.toFixed(0)}° / TO ${facing.toDeviation.toFixed(0)}° · หมุน/ย้าย Junction หรือเลือก arm ใหม่`});
  const forwardLaneResolved=linear&&linkLaneTransitionValid(project,link,'forward'),backwardLaneResolved=linear&&linkLaneTransitionValid(project,link,'backward');
  if((a.forwardLanes!==b.forwardLanes&&!forwardLaneResolved)||(a.backwardLanes!==b.backwardLanes&&!backwardLaneResolved))out.push({
    kind:'lane-count',
    message:`จำนวนเลนปลาย Link ไม่ตรงกัน · ไป ${a.forwardLanes}→${b.forwardLanes} / กลับ ${a.backwardLanes}→${b.backwardLanes} · ระบุฝั่งและช่วง lane transition ให้ครบก่อน`
  });
  if(!linear&&(Math.abs(a.forwardLaneWidth-b.forwardLaneWidth)>.01||Math.abs(a.backwardLaneWidth-b.backwardLaneWidth)>.01))out.push({
    kind:'lane-width',
    message:`ความกว้างเลนปลาย Link ต่างกัน · ไป ${a.forwardLaneWidth.toFixed(2)}→${b.forwardLaneWidth.toFixed(2)} / กลับ ${a.backwardLaneWidth.toFixed(2)}→${b.backwardLaneWidth.toFixed(2)} ม.`
  });
  if(!linear&&Math.abs(a.median-b.median)>.01)out.push({kind:'median',message:`เกาะกลางปลาย Link ต่างกัน ${a.median.toFixed(2)}→${b.median.toFixed(2)} ม. · ยังไม่สร้าง median transition อัตโนมัติ`});
  const sameBands=(x:Band[],y:Band[])=>sameBandTypes(x,y)&&x.every((band,i)=>Math.abs(band.width-y[i].width)<.01);
  if((!linear&&(Math.abs(a.forwardWalk-b.forwardWalk)>.01||Math.abs(a.backwardWalk-b.backwardWalk)>.01||!sameBands(a.forwardBands,b.forwardBands)||!sameBands(a.backwardBands,b.backwardBands)))||(linear&&(!sameBandTypes(a.forwardBands,b.forwardBands)||!sameBandTypes(a.backwardBands,b.backwardBands))))out.push({
    kind:'edge-section',
    message:'องค์ประกอบริมทางปลาย Link ไม่ตรงกัน · bike / shoulder / buffer / sidewalk ต้องกำหนด transition ก่อน'
  });
  if(link.components.length&&!linear)out.push({kind:'station-component',message:'ช่องเสริมตามระยะถูกพักไว้จนกว่าจะกลับเป็นโหมด “เปลี่ยนต่อเนื่องตามระยะ”'});
  if(link.components.some(component=>component.end>total+.01))out.push({kind:'station-component',message:'มี station component ยาวเกิน Road Link ปัจจุบัน · ปรับช่วง station หลังย้าย Junction/PI'});
  if(link.components.some(component=>component.kind==='width'&&!linkWidthTargets(project,link,component.direction).includes(component.target)))out.push({kind:'station-component',message:'มี edge-width component ที่ target ไม่ต่อเนื่องกับหน้าตัดปลาย Link แล้ว'});
  const points=linkControlPoints(project,link);
  if(points.length>=2&&!validAlignment(points))out.push({kind:'alignment',message:'แนว Road Link หักกลับ ตัดตัวเอง หรือมีช่วงสั้นเกินไป · ปรับตำแหน่ง Junction หรือจุดแนว'});
  return out;
}
export function portKey(ref:LinkEndRef){return isJunctionPort(ref)?`${ref.junctionId}:${ref.armId}`:`end:${ref.endId}`;}
export function portOccupied(project:NetworkProject,ref:LinkEndRef,exceptLinkId?:string){
  const key=portKey(ref);
  return project.links.some(link=>link.id!==exceptLinkId&&(portKey(link.from)===key||portKey(link.to)===key));
}
const angleDifference=(a:number,b:number)=>Math.abs((((a-b)+540)%360)-180);
export function assessPortConnection(project:NetworkProject,from:LinkEndRef,to:LinkEndRef):PortConnectionAssessment|null{
  const fromHeading=linkEndHeading(project,from),toHeading=linkEndHeading(project,to),a=worldPort(project,from),b=worldPort(project,to);
  if(fromHeading===null||toHeading===null||!a||!b||nodeId(from)===nodeId(to))return null;
  const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy);
  if(distance<1e-6)return{distance,fromDeviation:180,toDeviation:180,status:'invalid'};
  const heading=(Math.atan2(dy,dx)*180/Math.PI+360)%360,
    fromDeviation=angleDifference(fromHeading,heading),
    toDeviation=angleDifference(toHeading,(heading+180)%360),
    worst=Math.max(fromDeviation,toDeviation),
    status:PortConnectionAssessment['status']=worst>90?'invalid':worst>60?'caution':'valid';
  return{distance,fromDeviation,toDeviation,status};
}
export function addJunction(project:NetworkProject,point:WorldPoint,design:Design=initial()){
  const ids=[...project.junctions.map(j=>j.id),...project.links.map(l=>l.id)],id=nextId('J',ids);
  const junction:JunctionInstance={id,name:`Junction ${project.junctions.length+1}`,x:point.x,y:point.y,rotation:0,design:copyDesign(design)};
  return{project:{...project,junctions:[...project.junctions,junction]},junction};
}
export function moveJunction(project:NetworkProject,id:string,point:WorldPoint):NetworkProject{
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,x:point.x,y:point.y}:j)};
}
export function rotateJunction(project:NetworkProject,id:string,rotation:number):NetworkProject{
  const normalized=((rotation%360)+360)%360;
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,rotation:normalized}:j)};
}
const facingWorst=(value:PortConnectionAssessment|null)=>value?Math.max(value.fromDeviation,value.toDeviation):180;
export function junctionLinkFacingIssue(project:NetworkProject,id:string,previous?:NetworkProject){
  for(const link of project.links){
    if(nodeId(link.from)!==id&&nodeId(link.to)!==id)continue;
    const after=assessPortConnection(project,link.from,link.to);
    if(after?.status!=='invalid'&&after!==null)continue;
    const before=previous?.links.find(v=>v.id===link.id),prior=before&&previous?assessPortConnection(previous,before.from,before.to):null;
    const newlyInvalid=prior?.status!=='invalid',worsened=prior?.status==='invalid'&&facingWorst(after)>facingWorst(prior)+.01;
    if(!previous||newlyInvalid||worsened)return `แก้ Junction ไม่ได้ เพราะจะทำให้ Road Link ${link.id} หันออกจาก port เกิน 90°${prior?.status==='invalid'?' มากกว่าเดิม':''} · ย้าย/หมุน Junction ให้อยู่ในแนวเชื่อม หรือเปลี่ยน arm ที่เชื่อมก่อน`;
  }
  return null;
}
export function moveJunctionChecked(project:NetworkProject,id:string,point:WorldPoint):NetworkEditResult{
  if(!junctionById(project,id))return{project,error:'ไม่พบ Junction ที่เลือก'};
  const next=moveJunction(project,id,point),error=junctionLinkFacingIssue(next,id,project);
  return error?{project,error}:{project:next,error:null};
}
export function rotateJunctionChecked(project:NetworkProject,id:string,rotation:number):NetworkEditResult{
  if(!junctionById(project,id))return{project,error:'ไม่พบ Junction ที่เลือก'};
  const next=rotateJunction(project,id,rotation),error=junctionLinkFacingIssue(next,id,project);
  return error?{project,error}:{project:next,error:null};
}
export function connectPorts(project:NetworkProject,from:LinkEndRef,to:LinkEndRef):ConnectPortsResult{
  if(portKey(from)===portKey(to))return{project,error:'เลือกปลายเดิมซ้ำ'};
  if(nodeId(from)===nodeId(to))return{project,error:'เชื่อมได้เฉพาะปลายขาของทางแยกอื่น'};
  if(!linkEndExists(project,from)||!linkEndExists(project,to))return{project,error:'ไม่พบปลายขาหรือปลายถนนที่เลือก'};
  if(portOccupied(project,from)||portOccupied(project,to))return{project,error:'ปลายนี้มีถนนเชื่อมอยู่แล้ว'};
  const facing=assessPortConnection(project,from,to);
  if(!facing||facing.status==='invalid')return{project,error:'เชื่อมไม่ได้ · port อย่างน้อยหนึ่งด้านหันออกจากแนวเชื่อมเกิน 90° · เลือกขาที่หันเข้าหากันหรือจัดตำแหน่ง Junction ใหม่'};
  const ids=allIds(project),id=nextId('L',ids);
  const link:RoadLink={id,name:`Road Link ${project.links.length+1}`,from,to,via:[],sectionProfile:{mode:'review'},components:[]};
  return{project:{...project,links:[...project.links,link]},link,error:null};
}
export function reconnectLinkPort(project:NetworkProject,id:string,end:'from'|'to',ref:LinkEndRef):ConnectPortsResult{
  const link=project.links.find(item=>item.id===id);if(!link)return{project,error:'ไม่พบ Road Link ที่เลือก'};
  const current=end==='from'?link.from:link.to,other=end==='from'?link.to:link.from;
  if(portKey(current)===portKey(ref))return{project,link,error:null};
  if(!linkEndExists(project,ref))return{project,error:'ไม่พบปลายขาหรือปลายถนนที่เลือก'};
  if(nodeId(ref)===nodeId(other))return{project,error:'ถนนต้องเชื่อมคนละทางแยก'};
  if(portOccupied(project,ref,id))return{project,error:'port นี้มี Road Link อื่นเชื่อมอยู่แล้ว'};
  const ownsHandoff=link.components.some(component=>component.kind==='lane'&&component.source&&isJunctionPort(current)&&component.source.junctionId===current.junctionId&&component.source.armId===current.armId);
  if(ownsHandoff)return{project,error:`เปลี่ยน ${end.toUpperCase()} port ไม่ได้ขณะที่ปลายนี้มีช่องที่ต่อเนื่องจากทางแยก · ใช้ “แยกเป็นช่องบนถนน” หรือ “กลับเป็นจบในทางแยก” ก่อน`};
  const candidate:RoadLink={...link,[end]:ref},candidateProject={...project,links:project.links.map(item=>item.id===id?candidate:item)},
    facing=assessPortConnection(candidateProject,candidate.from,candidate.to);
  if(!facing||facing.status==='invalid')return{project,error:'เปลี่ยน port ไม่ได้ · ปลายใหม่หันออกจากแนวเชื่อมเกิน 90°'};
  if(parallelCorridorForLink(project,id)){
    const corridorError=candidateProject.parallelCorridors.map(corridor=>parallelCorridorIssue(candidateProject,corridor)).find(Boolean);
    if(corridorError)return{project,error:`เปลี่ยน port ไม่ได้ · ${corridorError} · แก้ Parallel corridor membership ก่อน`};
  }
  const controls=linkControlPoints(candidateProject,candidate);
  if(controls.length<2||!validAlignment(controls))return{project,error:'เปลี่ยน port ไม่ได้ · PI เดิมทำให้ alignment หักกลับ/ตัดตัวเองหรือมีช่วงสั้นเกินไป · ปรับหรือลบ PI ก่อน'};
  return{project:candidateProject,link:candidate,error:null};
}
export function updateJunctionArmGeometry(project:NetworkProject,id:string,armId:number,angle:number,length:number):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),normalized=((angle%360)+360)%360;
  design.arms[armId]={...design.arms[armId],angle:+normalized.toFixed(2)};
  // The arm only has to fit what it carries (mouth, dividers, pockets, openings), not a fixed minimum.
  design.arms[armId].length=+(Math.ceil(fitArmLength(design,armId,length)*100)/100).toFixed(2);
  const error=designError(design);if(error)return{project,error};
  const linkError=junctionDesignLinkIssue(project,id,design);if(linkError)return{project,error:linkError};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function updateJunctionArmBasics(project:NetworkProject,id:string,armId:number,patch:Partial<Pick<Arm,'name'|'incoming'|'outgoing'|'median'|'crossing'|'signal'|'stop'|'crossOffset'|'stopOffset'>>):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),current=design.arms[armId],next={...current,...patch};
  if(next.incoming+next.outgoing<1)return{project,error:'ขาถนนต้องมีอย่างน้อย 1 ช่องจราจร'};
  if(patch.incoming!==undefined||patch.outgoing!==undefined){
    next.laneMarkings=markingsFor(next);
    next.arrowOverrides=normalizeArrowOverrides(next);
  }
  design.arms[armId]=next;
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function updateJunctionArmSection(project:NetworkProject,id:string,armId:number,direction:Direction,patch:Partial<Section>):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),arm=design.arms[armId],current=sectionFor(arm,direction),
    next:Section={...current,...patch,bands:(patch.bands??current.bands).map(b=>({...b}))},
    key=direction==='incoming'?'incomingSection':'outgoingSection';
  design.arms[armId]={...arm,[key]:next};
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function updateJunctionArmPocket(project:NetworkProject,id:string,armId:number,direction:Direction,side:'left'|'right',patch:Partial<Pocket>):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||!junction.design.enabled[armId])return{project,error:'ไม่พบขาถนนที่เลือก'};
  const design=copyDesign(junction.design),arm=design.arms[armId],current=pocketsFor(arm,direction),key=direction==='incoming'?'incomingPockets':'outgoingPockets',
    nextPockets={...current,[side]:{...current[side],...patch}},nextArm={...arm,[key]:nextPockets};
  if(patch.lanes!==undefined){nextArm.laneMarkings=markingsFor(nextArm);nextArm.arrowOverrides=normalizeArrowOverrides(nextArm);}
  design.arms[armId]=nextArm;
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function setJunctionArmEnabled(project:NetworkProject,id:string,armId:number,enabled:boolean):NetworkEditResult{
  const junction=junctionById(project,id);if(!junction||armId<0||armId>=junction.design.arms.length)return{project,error:'ไม่พบขาถนนที่เลือก'};
  if(junction.design.enabled[armId]===enabled)return{project,error:null};
  if(!enabled){
    if(linkedArmIds(project,id).includes(armId))return{project,error:'ปิดขานี้ไม่ได้ เพราะยังมี Road Link เชื่อมอยู่ · ลบ/ย้าย Link ก่อน'};
    if(junction.design.slips.some(s=>s.fromArm===armId||s.toArm===armId))return{project,error:'ปิดขานี้ไม่ได้ เพราะ Slip lane ยังอ้างถึงขานี้ · แก้ Slip ก่อน'};
    if(junction.design.enabled.filter(Boolean).length<=3)return{project,error:'ทางแยกต้องมีอย่างน้อย 3 ขา'};
  }
  const design=copyDesign(junction.design);design.enabled[armId]=enabled;
  const error=designError(design);if(error)return{project,error};
  return{project:updateJunctionDesign(project,id,design),error:null};
}
export function junctionConnectedLinkIds(project:NetworkProject,junctionId:string){
  return project.links.filter(link=>nodeId(link.from)===junctionId||nodeId(link.to)===junctionId).map(link=>link.id);
}
export function linkedArmIds(project:NetworkProject,junctionId:string){
  return [...new Set(project.links.flatMap(link=>[
    ...(isJunctionPort(link.from)&&link.from.junctionId===junctionId?[link.from.armId]:[]),
    ...(isJunctionPort(link.to)&&link.to.junctionId===junctionId?[link.to.armId]:[])
  ]))].sort((a,b)=>a-b);
}
export function junctionDesignLinkIssue(project:NetworkProject,id:string,design:Design){
  const disabled=linkedArmIds(project,id).filter(armId=>!design.enabled[armId]);
  if(disabled.length)return `บันทึกกลับ Network ไม่ได้: arm ${disabled.map(v=>v+1).join(', ')} ยังมี Road Link เชื่อมอยู่ · ลบ/ย้าย Link ก่อนปิด arm`;
  const candidate={...project,junctions:project.junctions.map(j=>j.id===id?{...j,design:copyDesign(design)}:j)};
  return junctionLinkFacingIssue(candidate,id,project);
}
export function updateJunctionDesign(project:NetworkProject,id:string,design:Design):NetworkProject{
  if(junctionDesignLinkIssue(project,id,design))return project;
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,design:copyDesign(design)}:j)};
}
function inferredChainStartFromLinks(links:RoadLink[],linkIds:string[]){
  if(!Array.isArray(linkIds)||!linkIds.length)return null;
  const first=links.find(link=>link.id===linkIds[0]);if(!first)return null;
  if(linkIds.length===1)return nodeId(first.from);
  const second=links.find(link=>link.id===linkIds[1]);if(!second)return null;
  const firstEnds=[nodeId(first.from),nodeId(first.to)],secondEnds=new Set([nodeId(second.from),nodeId(second.to)]),
    starts=firstEnds.filter(id=>!secondEnds.has(id));
  return starts.length===1?starts[0]:null;
}
function chainJunctionsFromStart(project:NetworkProject,linkIds:string[],startJunctionId:string){
  if(!Array.isArray(linkIds)||!linkIds.length||linkIds.length>100||new Set(linkIds).size!==linkIds.length||!startJunctionId)return null;
  const links=linkIds.map(id=>project.links.find(link=>link.id===id));if(links.some(link=>!link))return null;
  let current=startJunctionId;const junctionIds=[current],visited=new Set<string>([current]);
  for(const link of links as RoadLink[]){
    let next:string;
    if(nodeId(link.from)===current)next=nodeId(link.to);
    else if(nodeId(link.to)===current)next=nodeId(link.from);
    else return null;
    if(visited.has(next))return null;
    visited.add(next);junctionIds.push(next);current=next;
  }
  return junctionIds;
}
export function parallelCorridorChainOrientation(project:NetworkProject,linkIds:string[],startJunctionId?:string):ParallelCorridorOrientation|null{
  const start=startJunctionId||inferredChainStartFromLinks(project.links,linkIds);if(!start)return null;
  const junctionIds=chainJunctionsFromStart(project,linkIds,start);if(!junctionIds)return null;
  return{startJunctionId:start,endJunctionId:junctionIds[junctionIds.length-1],junctionIds};
}
export function parallelCorridorChainContinuous(project:NetworkProject,linkIds:string[]){
  return !!parallelCorridorChainOrientation(project,linkIds);
}
function frontageChainJunctionIds(project:NetworkProject,linkIds:string[]){
  const ids=new Set<string>();
  for(const id of linkIds){const link=project.links.find(v=>v.id===id);if(link){ids.add(nodeId(link.from));ids.add(nodeId(link.to));}}
  return ids;
}
const filteredSeedReviewIds=(project:NetworkProject,chain:ParallelFrontageChain,linkIds=chain.linkIds)=>{
  const allowed=frontageChainJunctionIds(project,linkIds);
  return (chain.seedReviewJunctionIds??[]).filter(id=>allowed.has(id)&&project.junctions.some(j=>j.id===id));
};
export function parallelCorridorIssue(project:NetworkProject,corridor:ParallelCorridor){
  if(!corridor||typeof corridor!=='object'||!corridor.id||corridor.id.length>40||typeof corridor.name!=='string'||!corridor.name.trim()||corridor.name.length>80||typeof corridor.mainlineStartJunctionId!=='string'||!corridor.mainlineStartJunctionId)return'ข้อมูลกลุ่มถนนหลักและทางขนานไม่สมบูรณ์';
  if(!parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId))return'Parallel corridor mainline chain / reference direction ไม่ต่อเนื่องหรืออ้าง Road Link ที่ไม่มีอยู่';
  if(!Array.isArray(corridor.frontage)||corridor.frontage.length<1||corridor.frontage.length>2)return'Parallel corridor ต้องมี frontage อย่างน้อยหนึ่งด้าน';
  if(corridor.frontage.some(chain=>!chain||typeof chain!=='object'||!['left','right'].includes(chain.side)||!Array.isArray(chain.linkIds)))return'ข้อมูลทางขนานในกลุ่มไม่สมบูรณ์';
  if(new Set(corridor.frontage.map(chain=>chain.side)).size!==corridor.frontage.length)return'Parallel corridor มี frontage side ซ้ำ';
  const owned=new Set(corridor.mainlineLinkIds);
  for(const chain of corridor.frontage){
    if(!chain||!['left','right'].includes(chain.side)||!parallelCorridorChainContinuous(project,chain.linkIds))return'Frontage chain ไม่ต่อเนื่องหรืออ้าง Road Link ที่ไม่มีอยู่';
    if(chain.seedReviewJunctionIds!==undefined){
      if(!Array.isArray(chain.seedReviewJunctionIds)||chain.seedReviewJunctionIds.length>100||new Set(chain.seedReviewJunctionIds).size!==chain.seedReviewJunctionIds.length)return'ข้อมูลการตรวจทางขนานไม่สมบูรณ์';
      const allowed=frontageChainJunctionIds(project,chain.linkIds);
      if(chain.seedReviewJunctionIds.some(id=>!allowed.has(id)||!project.junctions.some(j=>j.id===id)))return'Frontage seed review อ้าง Junction ที่ไม่อยู่ใน frontage chain';
    }
    for(const id of chain.linkIds){if(owned.has(id))return'Road Link เดียวกันเป็นทั้ง mainline/frontage หรือซ้ำหลายด้านไม่ได้';owned.add(id);}
  }
  return null;
}
export function parallelCorridorForLink(project:NetworkProject,linkId:string):ParallelCorridorLinkRole|null{
  for(const corridor of project.parallelCorridors){
    if(corridor.mainlineLinkIds.includes(linkId))return{corridor,role:'mainline'};
    for(const chain of corridor.frontage)if(chain.linkIds.includes(linkId))return{corridor,role:'frontage',side:chain.side};
  }
  return null;
}
const cloneParallelInput=(input:ParallelCorridorInput)=>({
  name:input.name.trim(),
  mainlineLinkIds:[...input.mainlineLinkIds],
  mainlineStartJunctionId:input.mainlineStartJunctionId,
  frontage:input.frontage.map(chain=>({side:chain.side,linkIds:[...chain.linkIds],...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds:[...chain.seedReviewJunctionIds]}:{})}))
});
export function addParallelCorridor(project:NetworkProject,input:ParallelCorridorInput):ParallelCorridorEditResult{
  const id=nextId('PC',[...project.parallelCorridors.map(v=>v.id),...project.links.map(v=>v.id)]),body=cloneParallelInput(input),corridor:ParallelCorridor={id,...body},
    next={...project,parallelCorridors:[...project.parallelCorridors,corridor]},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor,error:null};
}
export function updateParallelCorridor(project:NetworkProject,id:string,input:ParallelCorridorInput):ParallelCorridorEditResult{
  const current=project.parallelCorridors.find(v=>v.id===id);if(!current)return{project,error:'ไม่พบ Parallel corridor'};
  const body=cloneParallelInput(input),corridor:ParallelCorridor={id,...body},
    next={...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===id?corridor:v)},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor,error:null};
}
export function removeParallelCorridor(project:NetworkProject,id:string):NetworkProject{
  return project.parallelCorridors.some(v=>v.id===id)?{...project,parallelCorridors:project.parallelCorridors.filter(v=>v.id!==id)}:project;
}
export function markParallelFrontageReviewed(project:NetworkProject,id:string,side?:ParallelCorridorSide):ParallelCorridorEditResult{
  const corridor=project.parallelCorridors.find(v=>v.id===id);if(!corridor)return{project,error:'ไม่พบ Parallel corridor'};
  if(side&&side!=='left'&&side!=='right')return{project,error:'Frontage side ไม่ถูกต้อง'};
  const frontage=corridor.frontage.map(chain=>!side||chain.side===side?{...chain,seedReviewJunctionIds:[]}:chain),
    candidate={...corridor,frontage},next={...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===id?candidate:v)},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor:candidate,error:null};
}
export function reverseParallelCorridorReference(project:NetworkProject,id:string):ParallelCorridorEditResult{
  const corridor=project.parallelCorridors.find(v=>v.id===id);if(!corridor)return{project,error:'ไม่พบ Parallel corridor'};
  const orientation=parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId);
  if(!orientation)return{project,error:'กลับทิศอ้างอิงไม่ได้ · mainline chain ไม่สมบูรณ์'};
  const candidate:ParallelCorridor={...corridor,mainlineStartJunctionId:orientation.endJunctionId,frontage:corridor.frontage.map(chain=>({...chain,side:chain.side==='left'?'right':'left'}))},
    next={...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===id?candidate:v)},error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor:candidate,error:null};
}
export type ParallelCorridorMemberRole='mainline'|'frontage';
const replaceParallelCorridor=(project:NetworkProject,corridor:ParallelCorridor):NetworkProject=>({...project,parallelCorridors:project.parallelCorridors.map(v=>v.id===corridor.id?corridor:v)});
export function addLinkToParallelCorridor(project:NetworkProject,corridorId:string,linkId:string,role:ParallelCorridorMemberRole,side?:ParallelCorridorSide):ParallelCorridorEditResult{
  const corridor=project.parallelCorridors.find(v=>v.id===corridorId);
  if(!corridor)return{project,error:'ไม่พบ Parallel corridor'};
  if(!project.links.some(v=>v.id===linkId))return{project,error:'ไม่พบ Road Link ที่เลือก'};
  if(parallelCorridorForLink(project,linkId))return{project,error:'Road Link นี้อยู่ใน Parallel corridor แล้ว'};
  const candidates:ParallelCorridor[]=[];
  if(role==='mainline'){
    const orientation=parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId),link=project.links.find(v=>v.id===linkId);
    if(!orientation||!link)return{project,error:'เพิ่ม Mainline ไม่ได้ · reference direction หรือ Road Link ไม่สมบูรณ์'};
    const touchesStart=nodeId(link.from)===orientation.startJunctionId||nodeId(link.to)===orientation.startJunctionId,
      touchesEnd=nodeId(link.from)===orientation.endJunctionId||nodeId(link.to)===orientation.endJunctionId;
    if(touchesStart===touchesEnd)return{project,error:'เพิ่ม Mainline ไม่ได้ · Link ต้องต่อที่ปลาย chain เพียงด้านเดียว'};
    if(touchesEnd)candidates.push({...corridor,mainlineLinkIds:[...corridor.mainlineLinkIds,linkId]});
    else{
      const newStart=nodeId(link.from)===orientation.startJunctionId?nodeId(link.to):nodeId(link.from);
      candidates.push({...corridor,mainlineLinkIds:[linkId,...corridor.mainlineLinkIds],mainlineStartJunctionId:newStart});
    }
  }else{
    if(side!=='left'&&side!=='right')return{project,error:'ระบุ Frontage side ก่อน'};
    const existing=corridor.frontage.find(v=>v.side===side);
    if(!existing)candidates.push({...corridor,frontage:[...corridor.frontage,{side,linkIds:[linkId]}]});
    else for(const linkIds of [[...existing.linkIds,linkId],[linkId,...existing.linkIds]])candidates.push({...corridor,frontage:corridor.frontage.map(v=>v.side===side?{...v,linkIds}:v)});
  }
  const valid=candidates.map(candidate=>({candidate,next:replaceParallelCorridor(project,candidate)})).filter(item=>validateNetworkProject(item.next)===null),
    unique=valid.filter((item,index)=>valid.findIndex(other=>JSON.stringify(other.candidate)===JSON.stringify(item.candidate))===index);
  if(unique.length===0)return{project,error:'เพิ่ม Road Link ไม่ได้ · Link ต้องต่อที่ปลาย chain และต้องไม่ทำให้ Parallel corridor topology ขาด'};
  // With a one-Link chain, prepend and append can both describe the same two-Link topology because chain travel orientation is not persisted.
  // Keep the current chain first and use the first validated candidate deterministically; longer chains still admit only a valid endpoint extension.
  return{project:unique[0].next,corridor:unique[0].candidate,error:null};
}
export function removeLinkFromParallelCorridor(project:NetworkProject,linkId:string):ParallelCorridorEditResult{
  const membership=parallelCorridorForLink(project,linkId);
  if(!membership)return{project,error:'Road Link นี้ไม่ได้อยู่ใน Parallel corridor'};
  const corridor=membership.corridor;
  let candidate:ParallelCorridor;
  if(membership.role==='mainline'){
    const index=corridor.mainlineLinkIds.indexOf(linkId),orientation=parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId),
      mainlineLinkIds=corridor.mainlineLinkIds.filter(id=>id!==linkId);
    if(!mainlineLinkIds.length)return{project,error:'ถอด Mainline สุดท้ายไม่ได้ · ใช้ Dissolve group หากต้องการยกเลิกกลุ่ม'};
    if(index>0&&index<corridor.mainlineLinkIds.length-1)return{project,error:'ถอด Mainline ตรงกลางไม่ได้ เพราะจะทำให้ chain ขาด'};
    const mainlineStartJunctionId=index===0&&orientation?orientation.junctionIds[1]:corridor.mainlineStartJunctionId;
    if(!mainlineStartJunctionId||!parallelCorridorChainOrientation(project,mainlineLinkIds,mainlineStartJunctionId))return{project,error:'ถอด Mainline ไม่ได้ เพราะจะทำให้ reference direction ขาด'};
    candidate={...corridor,mainlineLinkIds,mainlineStartJunctionId};
  }else{
    const frontage=corridor.frontage.flatMap(chain=>{
      if(chain.side!==membership.side)return[chain];
      const linkIds=chain.linkIds.filter(id=>id!==linkId);
      if(!linkIds.length)return[];
      const seedReviewJunctionIds=filteredSeedReviewIds(project,chain,linkIds);
      return[{...chain,linkIds,...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds}:{})}];
    });
    if(!frontage.length)return{project,error:'ถอด Frontage สุดท้ายไม่ได้ · ใช้ Dissolve group หากต้องการยกเลิกกลุ่ม'};
    const changed=frontage.find(chain=>chain.side===membership.side);
    if(changed&&!parallelCorridorChainContinuous(project,changed.linkIds))return{project,error:'ถอด Frontage ตรงกลางไม่ได้ เพราะจะทำให้ chain ขาด'};
    candidate={...corridor,frontage};
  }
  const next=replaceParallelCorridor(project,candidate),error=validateNetworkProject(next);
  return error?{project,error}:{project:next,corridor:candidate,error:null};
}
const contiguousIndices=(values:number[])=>values.length>0&&values.every((value,index)=>index===0||value===values[index-1]+1);
function cleanupParallelCorridors(previous:NetworkProject,project:NetworkProject):NetworkProject{
  const live=new Set(project.links.map(link=>link.id)),parallelCorridors:ParallelCorridor[]=[];
  for(const corridor of previous.parallelCorridors){
    const oldOrientation=parallelCorridorChainOrientation(previous,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId),
      mainIndices=corridor.mainlineLinkIds.map((id,index)=>live.has(id)?index:-1).filter(index=>index>=0);
    if(!oldOrientation||!contiguousIndices(mainIndices))continue;
    const mainlineLinkIds=mainIndices.map(index=>corridor.mainlineLinkIds[index]);
    if(!mainlineLinkIds.length)continue;
    const mainlineStartJunctionId=oldOrientation.junctionIds[mainIndices[0]];
    if(!parallelCorridorChainOrientation(project,mainlineLinkIds,mainlineStartJunctionId))continue;
    const frontage=corridor.frontage.flatMap(chain=>{
      const indices=chain.linkIds.map((id,index)=>live.has(id)?index:-1).filter(index=>index>=0);
      if(!contiguousIndices(indices))return[];
      const linkIds=indices.map(index=>chain.linkIds[index]),seedReviewJunctionIds=filteredSeedReviewIds(project,chain,linkIds);
      return linkIds.length&&parallelCorridorChainContinuous(project,linkIds)?[{side:chain.side,linkIds,...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds}:{})}]:[];
    });
    if(!frontage.length)continue;
    parallelCorridors.push({...corridor,mainlineLinkIds,mainlineStartJunctionId,frontage});
  }
  return{...project,parallelCorridors};
}
export function removeJunction(project:NetworkProject,id:string):NetworkProject{
  return cleanupParallelCorridors(project,{...project,junctions:project.junctions.filter(j=>j.id!==id),links:project.links.filter(l=>nodeId(l.from)!==id&&nodeId(l.to)!==id)});
}
export function addRoadEnd(project:NetworkProject,point:WorldPoint,heading:number,section:RoadEndSection,name?:string):{project:NetworkProject;roadEnd?:RoadEnd;error:string|null}{
  const roadEnds=project.roadEnds??[],id=nextId('E',allIds(project));
  const roadEnd:RoadEnd={id,name:name??`ปลายถนน ${roadEnds.length+1}`,x:point.x,y:point.y,heading:((heading%360)+360)%360,section:structuredClone(section)};
  if(!validRoadEnd(roadEnd))return{project,error:'ข้อมูลปลายถนนไม่ถูกต้อง'};
  return{project:{...project,roadEnds:[...roadEnds,roadEnd]},roadEnd,error:null};
}
export function removeRoadEnd(project:NetworkProject,id:string):NetworkProject{
  const node=`end:${id}`;
  return cleanupParallelCorridors(project,{...project,roadEnds:(project.roadEnds??[]).filter(e=>e.id!==id),links:project.links.filter(l=>nodeId(l.from)!==node&&nodeId(l.to)!==node)});
}
export function removeLink(project:NetworkProject,id:string):NetworkProject{
  return cleanupParallelCorridors(project,{...project,links:project.links.filter(l=>l.id!==id)});
}
export function projectBounds(project:NetworkProject,padding=35){
  const points:WorldPoint[]=[];
  const addLocal=(j:JunctionInstance,armId:number,p:{x:number;y:number})=>{
    const angle=rad(worldJunctionRotation(j)+(j.design.arms[armId]?.angle??0)),cos=Math.cos(angle),sin=Math.sin(angle);
    points.push({x:j.x+p.x*cos-p.y*sin,y:j.y+p.x*sin+p.y*cos});
  };
  for(const j of project.junctions){
    points.push({x:j.x,y:j.y});
    const segments=cachedEdges(j.design);
    for(const edge of segments)for(const p of [...edge.outer,...edge.walk])addLocal(j,edge.i,p);
    for(const slip of slipGeometries(j.design,segments)){
      const polygons=[slip.pavement,slip.sidewalk,slip.approachPavement,slip.departurePavement,slip.island,slip.gore,slip.raisedSeparator];
      for(const polygon of polygons)for(const p of polygon)addLocal(j,slip.fromArm,p);
    }
  }
  for(const link of project.links){
    const ps=linkPoints(project,link),ends=[linkEndSection(project,link,'from'),linkEndSection(project,link,'to')].filter((v):v is LinkEndSection=>!!v);
    const sideReach=(s:LinkEndSection,forward:boolean)=>{
      const lanes=forward?s.forwardLanes:s.backwardLanes,width=forward?s.forwardLaneWidth:s.backwardLaneWidth,bands=forward?s.forwardBands:s.backwardBands,walk=forward?s.forwardWalk:s.backwardWalk;
      return s.median/2+lanes*width+bands.reduce((sum,b)=>sum+b.width,0)+walk;
    };
    const baseReach=ends.length?Math.max(...ends.flatMap(s=>[sideReach(s,true),sideReach(s,false)])):5,
      componentExtra=Math.max(0,...link.components.map(component=>component.kind==='lane'?5:Math.max(0,component.delta))),reach=baseReach+componentExtra;
    for(const p of ps)points.push({x:p.x-reach,y:p.y-reach},{x:p.x+reach,y:p.y+reach});
  }
  if(!points.length)return{x:-125,y:-125,w:250,h:250};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-padding,maxX=Math.max(...xs)+padding,minY=Math.min(...ys)-padding,maxY=Math.max(...ys)+padding;
  return{x:minX,y:minY,w:Math.max(100,maxX-minX),h:Math.max(100,maxY-minY)};
}
function validRoadEnd(e:RoadEnd){
  const s=e?.section;
  return !!e&&typeof e.id==='string'&&e.id.length>0&&e.id.length<=40&&typeof e.name==='string'&&e.name.length<=80
    &&Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.heading)&&e.heading>=0&&e.heading<360
    &&!!s&&[0,1,2,3,4].includes(s.incoming)&&[0,1,2,3,4].includes(s.outgoing)&&s.incoming+s.outgoing>0
    &&Number.isFinite(s.median)&&s.median>=0&&s.median<=30
    &&validSection({width:s.width,walk:s.walk,bands:s.bands})&&(s.incomingSection===undefined||validSection(s.incomingSection))&&(s.outgoingSection===undefined||validSection(s.outgoingSection));
}
export function validateNetworkProject(project:NetworkProject){
  if(project.schemaVersion!==5||!Array.isArray(project.junctions)||!Array.isArray(project.links)||!Array.isArray(project.parallelCorridors)||!Array.isArray(project.roadEnds))return'รูปแบบข้อมูลโครงข่ายไม่รองรับ';
  if(typeof project.title!=='string'||project.title.length>120)return'ชื่อ Network ไม่ถูกต้อง';
  if(project.junctions.length>200||project.links.length>500||project.parallelCorridors.length>100||project.roadEnds.length>500)return'Network มีวัตถุมากเกินขอบเขตที่รองรับ';
  const nodeIds=[...project.junctions.map(j=>j.id),...project.roadEnds.map(e=>e.id)];
  if(new Set(nodeIds).size!==nodeIds.length)return'ID ของทางแยกหรือปลายถนนซ้ำ';
  for(const e of project.roadEnds)if(!validRoadEnd(e))return'ข้อมูลปลายถนนไม่สมบูรณ์';
  if(new Set(project.junctions.map(j=>j.id)).size!==project.junctions.length)return'Junction ID ซ้ำ';
  if(new Set(project.links.map(l=>l.id)).size!==project.links.length)return'Road Link ID ซ้ำ';
  if(new Set(project.parallelCorridors.map(v=>v.id)).size!==project.parallelCorridors.length)return'Parallel corridor ID ซ้ำ';
  for(const j of project.junctions){
    if(!j.id||j.id.length>40||typeof j.name!=='string'||j.name.length>80||!Number.isFinite(j.x)||!Number.isFinite(j.y)||!Number.isFinite(j.rotation)||j.rotation<0||j.rotation>=360||!valid(j.design))return'ข้อมูลทางแยกไม่สมบูรณ์';
  }
  const occupied=new Set<string>();
  for(const l of project.links){
    const validTransition=(t:LinkLaneTransition|undefined)=>!t||(['curb','median'].includes(t.side)&&Number.isFinite(t.center)&&t.center>=0&&Number.isFinite(t.length)&&t.length>=3&&t.length<=1000),
      validSource=(input:unknown)=>{
        if(input===undefined)return true;if(!input||typeof input!=='object')return false;
        const source=input as JunctionAuxiliarySource;
        return source.kind==='junction-auxiliary'&&typeof source.handoffId==='string'&&source.handoffId.length>0&&source.handoffId.length<=160&&typeof source.junctionId==='string'&&source.junctionId.length>0&&source.junctionId.length<=40&&Number.isInteger(source.armId)&&source.armId>=0&&source.armId<4&&['incoming','outgoing'].includes(source.direction)&&['left','right'].includes(source.side)&&Number.isInteger(source.lane)&&source.lane>=0&&source.lane<4;
      },
      validComponent=(input:unknown)=>{
        if(!input||typeof input!=='object')return false;
        const component=input as LinkStationComponent;
        return !!component.id&&component.id.length<=40&&['forward','backward'].includes(component.direction)&&Number.isFinite(component.start)&&component.start>=0&&Number.isFinite(component.end)&&component.end>component.start&&Number.isFinite(component.taperIn)&&component.taperIn>=0&&Number.isFinite(component.taperOut)&&component.taperOut>=0&&(component.kind==='lane'?(['curb','median'].includes(component.side)&&validSource(component.source)):(component.kind==='width'&&['walk','shoulder','bike','motorcycle','buffer'].includes(component.target)&&Number.isFinite(component.delta)&&Math.abs(component.delta)>=.01&&component.delta>=-5&&component.delta<=5));
      },
      componentList=Array.isArray(l.components)?l.components:[];
    if(!l.id||l.id.length>40||typeof l.name!=='string'||l.name.length>80||nodeId(l.from)===nodeId(l.to)||!linkEndExists(project,l.from)||!linkEndExists(project,l.to)||!Array.isArray(l.via)||l.via.length>64||l.via.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.radius)||p.radius<0||p.radius>200)||!l.sectionProfile||!['review','linear'].includes(l.sectionProfile.mode)||!validTransition(l.sectionProfile.forwardLaneTransition)||!validTransition(l.sectionProfile.backwardLaneTransition)||!Array.isArray(l.components)||componentList.length>24||new Set(componentList.map(v=>v?.id)).size!==componentList.length||componentList.some(v=>!validComponent(v)))return'Road Link ไม่สมบูรณ์';
    for(const ref of [l.from,l.to]){
      const key=portKey(ref);if(occupied.has(key))return'มี Road Link ใช้ port ซ้ำ';occupied.add(key);
    }
    if(l.levels!==undefined&&(!Array.isArray(l.levels)||l.levels.length>66||!l.levels.every(q=>q&&Number.isFinite(q.station)&&q.station>=0&&Number.isFinite(q.z)&&Math.abs(q.z)<=200)))return`${l.name}: ระดับตามแนวถนนไม่ถูกต้อง`;
    if(l.roadside!==undefined&&(!l.roadside||typeof l.roadside.trees!=='boolean'||typeof l.roadside.lights!=='boolean'))return`${l.name}: ต้นไม้และเสาไฟไม่ถูกต้อง`;
    if(l.medianOpenings!==undefined){
      const list=l.medianOpenings,total=linkLength(project,l);
      if(!Array.isArray(list)||list.length>12||list.some(o=>!o||typeof o.id!=='string'||!o.id||o.id.length>40||(o.type!==undefined&&!['opening','uturn'].includes(o.type))||!Number.isFinite(o.start)||o.start<0||!Number.isFinite(o.length)||o.length<2||o.length>40))return`${l.name}: ช่องเปิดเกาะกลางไม่ถูกต้อง`;
      const sorted=[...list].sort((a,b)=>a.start-b.start);
      if(sorted.some(o=>o.start+o.length>total+.01))return`${l.name}: ช่องเปิดเกาะกลางเกินความยาวช่วงถนน`;
      for(let k=1;k<sorted.length;k++)if(sorted[k].start<sorted[k-1].start+sorted[k-1].length+1)return`${l.name}: ช่องเปิดเกาะกลางซ้อนหรือชิดกันเกินไป`;
    }
  }
  const groupedLinks=new Set<string>();
  for(const corridor of project.parallelCorridors){
    const error=parallelCorridorIssue(project,corridor);if(error)return error;
    for(const id of [...corridor.mainlineLinkIds,...corridor.frontage.flatMap(chain=>chain.linkIds)]){
      if(groupedLinks.has(id))return'Road Link อยู่ใน Parallel corridor มากกว่าหนึ่งกลุ่ม';groupedLinks.add(id);
    }
  }
  return null;
}
export function createNetworkProject():NetworkProject{
  let project:NetworkProject={schemaVersion:5,title:'Thai Street Network Concept',junctions:[],links:[],parallelCorridors:[],roadEnds:[]};
  const first=addJunction(project,{x:-150,y:0}),a=first.junction;
  project=first.project;
  const second=addJunction(project,{x:150,y:0}),b=second.junction;
  project=second.project;
  // East arm of A to west arm of B. Both ports own only the local junction approach; the Link owns the corridor between them.
  const connected=connectPorts(project,{junctionId:a.id,armId:0},{junctionId:b.id,armId:2});
  return connected.project;
}

function readLinkEnd(value:Record<string,unknown>|null,schemaVersion:number):LinkEndRef{
  if(schemaVersion>=5&&value&&typeof value.endId==='string')return{endId:value.endId};
  return{junctionId:String(value?.junctionId??''),armId:Number(value?.armId)};
}
function readRoadEnd(input:unknown):RoadEnd{
  if(!input||typeof input!=='object')throw Error('ข้อมูลปลายถนนไม่ถูกต้อง');
  const item=input as Record<string,unknown>,s=(item.section&&typeof item.section==='object'?item.section:{}) as Record<string,unknown>;
  const readSection=(value:unknown):Section|undefined=>{
    if(!value||typeof value!=='object')return undefined;
    const v=value as Record<string,unknown>;
    return{width:Number(v.width),walk:Number(v.walk),bands:Array.isArray(v.bands)?structuredClone(v.bands) as Band[]:[]};
  };
  const section:RoadEndSection={incoming:Number(s.incoming),outgoing:Number(s.outgoing),median:Number(s.median),width:Number(s.width),walk:Number(s.walk),bands:Array.isArray(s.bands)?structuredClone(s.bands) as Band[]:[]};
  const incomingSection=readSection(s.incomingSection),outgoingSection=readSection(s.outgoingSection);
  if(incomingSection)section.incomingSection=incomingSection;
  if(outgoingSection)section.outgoingSection=outgoingSection;
  return{id:String(item.id??''),name:String(item.name??''),x:Number(item.x),y:Number(item.y),heading:((Number(item.heading)%360)+360)%360,section};
}
export function normalizeNetworkProject(raw:unknown):NetworkProject{
  if(!raw||typeof raw!=='object')throw Error('Invalid network project');
  const source=raw as {schemaVersion?:number;title?:unknown;junctions?:unknown[];links?:unknown[];parallelCorridors?:unknown;roadEnds?:unknown};
  const schemaVersion=Number(source.schemaVersion);
  if(![1,2,3,4,5].includes(schemaVersion)||!Array.isArray(source.junctions)||!Array.isArray(source.links))throw Error('รูปแบบข้อมูลโครงข่ายไม่รองรับ');
  if(schemaVersion>=4&&source.parallelCorridors!==undefined&&!Array.isArray(source.parallelCorridors))throw Error('Invalid parallel corridor list');
  if(schemaVersion>=5&&source.roadEnds!==undefined&&!Array.isArray(source.roadEnds))throw Error('ข้อมูลปลายถนนไม่ถูกต้อง');
  const junctions=source.junctions.map(input=>{
    if(!input||typeof input!=='object')throw Error('ข้อมูลทางแยกไม่ถูกต้อง');
    const item=input as Record<string,unknown>,rotation=((Number(item.rotation)%360)+360)%360;
    return{
      id:String(item.id??''),
      name:String(item.name??''),
      x:Number(item.x),
      y:Number(item.y),
      rotation,
      design:migrate(item.design)
    };
  });
  const links=source.links.map(input=>{
    if(!input||typeof input!=='object')throw Error('Invalid Road Link');
    const item=input as Record<string,unknown>,from=item.from&&typeof item.from==='object'?item.from as Record<string,unknown>:null,
      to=item.to&&typeof item.to==='object'?item.to as Record<string,unknown>:null,
      profile=item.sectionProfile&&typeof item.sectionProfile==='object'?item.sectionProfile as Record<string,unknown>:null,
      mode:LinkSectionProfile['mode']=profile?.mode==='linear'?'linear':'review',
      readTransition=(value:unknown):LinkLaneTransition|undefined=>{
        if(!value||typeof value!=='object')return undefined;
        const t=value as Record<string,unknown>,side=t.side==='median'?'median':t.side==='curb'?'curb':null,center=Number(t.center),length=Number(t.length);
        return side&&Number.isFinite(center)&&Number.isFinite(length)?{side,center,length}:undefined;
      },
      via=Array.isArray(item.via)?item.via.map(point=>{
        const p=point&&typeof point==='object'?point as Record<string,unknown>:{};
        return{x:Number(p.x),y:Number(p.y),radius:schemaVersion===1?0:linkRadius(p.radius)};
      }):[],
      components:LinkStationComponent[]=schemaVersion>=3&&Array.isArray(item.components)?item.components.reduce<LinkStationComponent[]>((out,value,index)=>{
        if(!value||typeof value!=='object')return out;
        const component=value as Record<string,unknown>,id=String(component.id??`C-${index+1}`),direction:LinkDirection=component.direction==='backward'?'backward':'forward',
          start=Number(component.start),end=Number(component.end),taperIn=Number(component.taperIn),taperOut=Number(component.taperOut);
        if(component.kind==='lane'){
          const side=component.side==='median'?'median':'curb',rawSource=component.source&&typeof component.source==='object'?component.source as Record<string,unknown>:null,
            sourceValue:JunctionAuxiliarySource|undefined=rawSource?.kind==='junction-auxiliary'?{
              kind:'junction-auxiliary',handoffId:String(rawSource.handoffId??''),junctionId:String(rawSource.junctionId??''),armId:Number(rawSource.armId),
              direction:rawSource.direction==='outgoing'?'outgoing':'incoming',side:rawSource.side==='right'?'right':'left',lane:Number(rawSource.lane)
            }:undefined;
          out.push({id,kind:'lane',direction,side,start,end,taperIn,taperOut,...(sourceValue?{source:sourceValue}:{})});
        }else if(component.kind==='width'){
          const targetRaw=String(component.target??'walk'),target:LinkWidthTarget=['shoulder','bike','motorcycle','buffer'].includes(targetRaw)?targetRaw as Band['type']:'walk';
          out.push({id,kind:'width',direction,target,start,end,taperIn,taperOut,delta:Number(component.delta)});
        }
        return out;
      },[]):[];
    const forwardLaneTransition=readTransition(profile?.forwardLaneTransition),backwardLaneTransition=readTransition(profile?.backwardLaneTransition),
      sectionProfile:LinkSectionProfile={mode};
    if(forwardLaneTransition)sectionProfile.forwardLaneTransition=forwardLaneTransition;
    if(backwardLaneTransition)sectionProfile.backwardLaneTransition=backwardLaneTransition;
    return{
      id:String(item.id??''),
      name:String(item.name??''),
      from:readLinkEnd(from,schemaVersion),
      to:readLinkEnd(to,schemaVersion),
      via,
      sectionProfile,
      components
    };
  });
  const parallelCorridors:ParallelCorridor[]=schemaVersion>=4&&Array.isArray(source.parallelCorridors)?source.parallelCorridors.map(value=>{
    if(!value||typeof value!=='object')throw Error('Invalid parallel corridor');
    const item=value as Record<string,unknown>,frontageRaw=Array.isArray(item.frontage)?item.frontage:[],
      mainlineLinkIds=Array.isArray(item.mainlineLinkIds)?item.mainlineLinkIds.map(String):[],
      persistedStart=String(item.mainlineStartJunctionId??''),
      mainlineStartJunctionId=persistedStart||inferredChainStartFromLinks(links,mainlineLinkIds)||'';
    return{
      id:String(item.id??''),
      name:String(item.name??''),
      mainlineLinkIds,
      mainlineStartJunctionId,
      frontage:frontageRaw.map(raw=>{
        if(!raw||typeof raw!=='object')throw Error('Invalid parallel frontage chain');
        const chain=raw as Record<string,unknown>;
        if(chain.side!=='left'&&chain.side!=='right')throw Error('Invalid parallel frontage side');
        if(!Array.isArray(chain.linkIds))throw Error('Invalid parallel frontage link list');
        if(chain.seedReviewJunctionIds!==undefined&&!Array.isArray(chain.seedReviewJunctionIds))throw Error('Invalid parallel frontage seed review list');
        return{side:chain.side as ParallelCorridorSide,linkIds:chain.linkIds.map(String),...(chain.seedReviewJunctionIds!==undefined?{seedReviewJunctionIds:(chain.seedReviewJunctionIds as unknown[]).map(String)}:{})};
      })
    };
  }):[];
  const roadEnds:RoadEnd[]=schemaVersion>=5&&Array.isArray(source.roadEnds)?source.roadEnds.map(readRoadEnd):[];
  const project:NetworkProject={schemaVersion:5,title:String(source.title??'Thai Street Network Concept'),junctions,links,parallelCorridors,roadEnds};
  const error=validateNetworkProject(project);if(error)throw Error(error);
  return project;
}
export function restoreNetworkProject(raw:string|null):NetworkProject{
  if(!raw)return createNetworkProject();
  try{return normalizeNetworkProject(JSON.parse(raw));}
  catch{return createNetworkProject();}
}
