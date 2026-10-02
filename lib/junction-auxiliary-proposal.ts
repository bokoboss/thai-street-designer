import {pocketFactorAt,pocketOriginFor} from '../app/junction/allocation';
import {armTreatmentOrigins} from '../app/junction/geometry';
import {pocketsFor,type Direction,type Pocket} from '../app/junction/model';
import {
  junctionById,linkLength,linkLinearTransitionPossible,updateJunctionArmPocket,validateNetworkProject,
  type JunctionAuxiliarySource,type LinkDirection,type LinkStationLaneComponent,type NetworkProject,type RoadLink
} from './network-project';

export type JunctionAuxiliaryProposalStatus='ready'|'applied'|'local-only'|'blocked';
export type JunctionAuxiliaryProposal={
  id:string;
  linkId:string;
  end:'from'|'to';
  junctionId:string;
  armId:number;
  sourceDirection:Direction;
  sourceSide:'left'|'right';
  linkDirection:LinkDirection;
  linkSide:'curb'|'median';
  continuation:'local'|'corridor';
  canContinue:boolean;
  lanes:number;
  sourceLength:number;
  sourceTaper:number;
  sourceOrigin:number;
  sourceFullEnd:number;
  sourceTreatmentEnd:number;
  portStation:number;
  portFactor:number;
  gapToPort:number;
  extensionToPort:number;
  remainingFull:number;
  corridorStart:number;
  corridorEnd:number;
  corridorTaperIn:number;
  corridorTaperOut:number;
  status:JunctionAuxiliaryProposalStatus;
  message:string;
  existing:number;
  linked:number;
};
export type JunctionAuxiliaryApplyResult={project:NetworkProject;created:string[];removed?:string[];detached?:string[];error:string|null};
export type JunctionAuxiliaryHandoffIssueKind='stale'|'orphan'|'range'|'topology';
export type JunctionAuxiliaryHandoffIssue={
  id:string;
  handoffId:string;
  kind:JunctionAuxiliaryHandoffIssueKind;
  level:'warning'|'error';
  componentIds:string[];
  message:string;
  canRepair:boolean;
  canDetach:boolean;
  canReturnLocal:boolean;
};

const near=(a:number,b:number,tolerance=.05)=>Math.abs(a-b)<=tolerance;
const proposalId=(link:RoadLink,end:'from'|'to',direction:Direction,side:'left'|'right')=>`${link.id}:${end}:${direction}:${side}`;
const mapDirection=(end:'from'|'to',direction:Direction):LinkDirection=>
  end==='from'?(direction==='outgoing'?'forward':'backward'):(direction==='incoming'?'forward':'backward');
const mapSide=(side:'left'|'right')=>side==='left'?'curb' as const:'median' as const;

function equivalentLane(component:LinkStationLaneComponent,proposal:JunctionAuxiliaryProposal){
  return component.direction===proposal.linkDirection&&component.side===proposal.linkSide
    &&near(component.start,proposal.corridorStart)&&near(component.end,proposal.corridorEnd)
    &&near(component.taperIn,proposal.corridorTaperIn)&&near(component.taperOut,proposal.corridorTaperOut);
}
function nextComponentId(link:RoadLink){
  const ids=new Set(link.components.map(component=>component.id));let n=1;
  while(ids.has(`C-${n}`))n++;
  return `C-${n}`;
}
function sourceFor(proposal:JunctionAuxiliaryProposal,lane:number):JunctionAuxiliarySource{
  return{kind:'junction-auxiliary',handoffId:proposal.id,junctionId:proposal.junctionId,armId:proposal.armId,direction:proposal.sourceDirection,side:proposal.sourceSide,lane};
}
function proposalPocket(project:NetworkProject,proposal:JunctionAuxiliaryProposal):Pocket|null{
  const junction=junctionById(project,proposal.junctionId);if(!junction||!junction.design.enabled[proposal.armId])return null;
  return pocketsFor(junction.design.arms[proposal.armId],proposal.sourceDirection)[proposal.sourceSide];
}
function rawPocketForSource(project:NetworkProject,source:JunctionAuxiliarySource):Pocket|undefined{
  const junction=junctionById(project,source.junctionId);if(!junction||!junction.design.enabled[source.armId])return undefined;
  const arm=junction.design.arms[source.armId],set=source.direction==='incoming'?arm.incomingPockets:arm.outgoingPockets;
  return set?.[source.side];
}
function sourceMatchesProposal(source:JunctionAuxiliarySource,proposal:JunctionAuxiliaryProposal){
  return source.handoffId===proposal.id&&source.junctionId===proposal.junctionId&&source.armId===proposal.armId
    &&source.direction===proposal.sourceDirection&&source.side===proposal.sourceSide;
}

export function junctionAuxiliaryProposals(project:NetworkProject,link:RoadLink):JunctionAuxiliaryProposal[]{
  const total=Math.max(0,linkLength(project,link)),out:JunctionAuxiliaryProposal[]=[];
  for(const end of ['from','to'] as const){
    const ref=end==='from'?link.from:link.to,junction=junctionById(project,ref.junctionId);
    if(!junction||!junction.design.enabled[ref.armId])continue;
    const arm=junction.design.arms[ref.armId];
    let origins:ReturnType<typeof armTreatmentOrigins>;
    try{origins=armTreatmentOrigins(junction.design,ref.armId);}catch{continue;}
    for(const direction of ['incoming','outgoing'] as const){
      const pockets=pocketsFor(arm,direction);
      for(const side of ['left','right'] as const){
        const pocket=pockets[side];if(!pocket.lanes)continue;
        const continuation=pocket.continuation??'local',sourceOrigin=pocketOriginFor(origins,direction,side),sourceFullEnd=sourceOrigin+pocket.length,
          sourceTreatmentEnd=sourceFullEnd+pocket.taper,portStation=arm.length,
          portFactor=pocketFactorAt(pocket,portStation,origins,direction,side),gapToPort=portStation-sourceTreatmentEnd,
          extensionToPort=Math.max(0,portStation-sourceFullEnd),remainingFull=Math.max(0,sourceFullEnd-portStation),
          remaining=Math.max(0,remainingFull+pocket.taper),linkDirection=mapDirection(end,direction),linkSide=mapSide(side),
          corridorStart=end==='from'?0:Math.max(0,total-remaining),corridorEnd=end==='from'?Math.min(total,remaining):total,
          corridorTaperIn=end==='from'?0:Math.min(pocket.taper,remaining),
          corridorTaperOut=end==='from'?Math.min(pocket.taper,remaining):0,
          base:Omit<JunctionAuxiliaryProposal,'status'|'message'|'existing'|'linked'|'canContinue'>={
            id:proposalId(link,end,direction,side),linkId:link.id,end,junctionId:junction.id,armId:ref.armId,
            sourceDirection:direction,sourceSide:side,linkDirection,linkSide,continuation,lanes:pocket.lanes,
            sourceLength:pocket.length,sourceTaper:pocket.taper,sourceOrigin,sourceFullEnd,sourceTreatmentEnd,portStation,
            portFactor,gapToPort,extensionToPort,remainingFull,corridorStart,corridorEnd,corridorTaperIn,corridorTaperOut
          },
          probe={...base,status:'ready' as const,message:'',existing:0,linked:0,canContinue:false},
          existing=link.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&equivalentLane(component,probe)).length,
          linked=link.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.handoffId===base.id).length,
          explicitRemaining=Math.max(.5,remaining),capacityOk=link.components.length-linked+pocket.lanes<=24,
          topologyOk=linkLinearTransitionPossible(project,link),fits=explicitRemaining<=total+.05,
          canContinue=continuation==='local'&&topologyOk&&fits&&capacityOk;
        let status:JunctionAuxiliaryProposalStatus='ready',message='';
        if(!topologyOk){
          status='blocked';message='Road Link ยังมี endpoint topology/edge mismatch ที่ต้อง resolve ก่อนทำ cross-boundary handoff';
        }else if(!fits){
          status='blocked';message=`Road Link สั้นกว่าช่วง continuation ที่ต้องใช้ ${(explicitRemaining-total).toFixed(1)} m`;
        }else if(!capacityOk){
          status='blocked';message='จำนวน station components จะเกินขอบเขต 24 รายการของ Road Link';
        }else if(continuation==='local'&&portFactor<.999){
          status='local-only';
          message=portFactor<=.001
            ?`Junction only · treatment จบก่อน Port ${Math.max(0,gapToPort).toFixed(1)} m · Continue จะยืด lane เต็มถึง Port แล้วใช้ taper ${pocket.taper.toFixed(0)} m ใน Corridor`
            :`Junction only · Port อยู่กลาง taper (active ${(portFactor*100).toFixed(0)}%) · Continue จะย้าย taper ทั้งช่วงไปไว้ใน Corridor`;
        }else if(continuation==='corridor'&&linked>pocket.lanes){
          status='ready';message=`Handoff เดิมมี ${linked} lane components แต่ Junction เหลือ ${pocket.lanes} เลน · ใช้ Repair เพื่อลบ lane identity ส่วนเกินอย่าง explicit`;
        }else if(existing>=pocket.lanes){
          status='applied';message=linked>=pocket.lanes
            ?`Cross-boundary handoff ต่อเนื่องครบ ${pocket.lanes} เลนแล้ว`
            :`Corridor geometry ต่อเนื่องครบ ${pocket.lanes} เลนแล้วในสถานะ manual / detached · ไม่มี hidden synchronization`;
        }else{
          message=continuation==='corridor'
            ?`พร้อมสร้าง/ซ่อม handoff ${pocket.lanes-existing} เลน · ${end==='from'?`Sta. 0–${corridorEnd.toFixed(1)}`:`Sta. ${corridorStart.toFixed(1)}–${total.toFixed(1)}`} m`
            :`Geometry ผ่าน Port อยู่แล้ว แต่ยังเป็น Junction only · เลือก Continue into Corridor เพื่อบันทึก intent และ provenance`;
        }
        out.push({...base,status,message,existing,linked,canContinue});
      }
    }
  }
  return out;
}

export function junctionAuxiliaryHandoffIssues(project:NetworkProject,link:RoadLink):JunctionAuxiliaryHandoffIssue[]{
  const proposals=junctionAuxiliaryProposals(project,link),proposalMap=new Map(proposals.map(proposal=>[proposal.id,proposal])),
    groups=new Map<string,(LinkStationLaneComponent&{source:JunctionAuxiliarySource})[]>();
  for(const component of link.components){
    if(component.kind!=='lane'||component.source?.kind!=='junction-auxiliary')continue;
    const owned=component as LinkStationLaneComponent&{source:JunctionAuxiliarySource},list=groups.get(owned.source.handoffId)??[];
    list.push(owned);groups.set(owned.source.handoffId,list);
  }
  const total=Math.max(0,linkLength(project,link)),out:JunctionAuxiliaryHandoffIssue[]=[];
  for(const [handoffId,components] of groups){
    const proposal=proposalMap.get(handoffId),source=components[0].source!,componentIds=components.map(component=>component.id),
      sourcePocket=rawPocketForSource(project,source),base={id:`${link.id}:handoff:${handoffId}`,handoffId,componentIds,canDetach:true,canReturnLocal:!!sourcePocket};
    if(!proposal||components.some(component=>!component.source||!sourceMatchesProposal(component.source,proposal))){
      out.push({...base,kind:'orphan',level:'warning',canRepair:false,message:'Handoff provenance ไม่ตรงกับ Junction/arm ที่ Road Link นี้เชื่อมอยู่แล้ว · อาจเกิดจากย้าย endpoint, ลบ Pocket หรือเปลี่ยน source semantics'});
      continue;
    }
    if(proposal.continuation!=='corridor'){
      out.push({...base,kind:'orphan',level:'warning',canRepair:false,message:'Junction ไม่ได้ประกาศ Continue into Corridor แล้ว แต่ RoadLink ยังมี handoff-owned lane components ค้างอยู่'});
      continue;
    }
    const required=Math.max(.5,proposal.remainingFull+proposal.sourceTaper);
    if(required>total+.05){
      out.push({...base,kind:'range',level:'error',canRepair:false,message:`Road Link ปัจจุบันยาว ${total.toFixed(1)} m แต่ handoff ต้องใช้ ${required.toFixed(1)} m · ปรับ alignment/ความยาว treatment หรือกลับเป็น Junction only ก่อน`});
      continue;
    }
    if(!linkLinearTransitionPossible(project,link)){
      out.push({...base,kind:'topology',level:'error',canRepair:false,message:'Endpoint lane/edge topology เปลี่ยนจน Road Link ไม่สามารถ resolve handoff แบบ linear ได้ · แก้ endpoint transition ก่อน Repair'});
      continue;
    }
    const laneIds=components.map(component=>component.source!.lane),expectedLanes=new Set(Array.from({length:proposal.lanes},(_,lane)=>lane)),
      identityOk=components.length===proposal.lanes&&new Set(laneIds).size===proposal.lanes&&laneIds.every(lane=>expectedLanes.has(lane)),
      geometryOk=components.every(component=>equivalentLane(component,proposal));
    if(!identityOk||!geometryOk){
      out.push({...base,kind:'stale',level:'warning',canRepair:true,message:`Junction treatment เปลี่ยนหลังสร้าง handoff · RoadLink provenance ยังอยู่ แต่ lane identity / station profile ไม่ตรงกับ source ปัจจุบัน (${components.length}→${proposal.lanes} lanes)`});
    }
  }
  return out;
}

export function repairJunctionAuxiliaryHandoff(project:NetworkProject,linkId:string,handoffId:string):JunctionAuxiliaryApplyResult{
  const link=project.links.find(item=>item.id===linkId);if(!link)return{project,created:[],error:'ไม่พบ Road Link'};
  const issue=junctionAuxiliaryHandoffIssues(project,link).find(item=>item.handoffId===handoffId);
  if(!issue)return{project,created:[],error:'Handoff นี้ไม่พบ stale/orphan condition ที่ต้อง Repair'};
  if(!issue.canRepair)return{project,created:[],error:issue.message};
  return applyJunctionAuxiliaryProposal(project,linkId,handoffId);
}

export function detachJunctionAuxiliaryHandoff(project:NetworkProject,linkId:string,handoffId:string):JunctionAuxiliaryApplyResult{
  const link=project.links.find(item=>item.id===linkId);if(!link)return{project,created:[],error:'ไม่พบ Road Link'};
  const detached=link.components.filter(component=>component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.handoffId===handoffId).map(component=>component.id);
  if(!detached.length)return{project,created:[],error:'ไม่พบ handoff-owned lane components'};
  const next={...project,links:project.links.map(item=>item.id!==linkId?item:{...item,components:item.components.map(component=>{
    if(component.kind!=='lane'||component.source?.kind!=='junction-auxiliary'||component.source.handoffId!==handoffId)return component;
    const {source:_source,...manual}=component;return manual;
  })})},error=validateNetworkProject(next);
  return error?{project,created:[],error}:{project:next,created:[],detached,error:null};
}

export function applyJunctionAuxiliaryProposal(project:NetworkProject,linkId:string,id:string):JunctionAuxiliaryApplyResult{
  const link=project.links.find(item=>item.id===linkId);if(!link)return{project,created:[],error:'ไม่พบ Road Link'};
  const proposal=junctionAuxiliaryProposals(project,link).find(item=>item.id===id);
  if(!proposal)return{project,created:[],error:'ไม่พบ Junction auxiliary proposal'};
  if(proposal.continuation!=='corridor')return{project,created:[],error:'เลือก Continue into Corridor ก่อนสร้าง cross-boundary handoff'};
  if(proposal.status==='blocked')return{project,created:[],error:proposal.message};
  const sourced=link.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.handoffId===proposal.id),
    unsourcedMatches=link.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&!component.source&&equivalentLane(component,proposal)),
    keep=link.components.filter(component=>!(component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.handoffId===proposal.id)),
    adopted=unsourcedMatches.slice(0,proposal.lanes),adoptIds=new Set(adopted.map(component=>component.id)),
    baseComponents=keep.map(component=>{
      if(component.kind!=='lane'||!adoptIds.has(component.id))return component;
      const lane=adopted.findIndex(value=>value.id===component.id);
      return{...component,source:sourceFor(proposal,lane)};
    });
  let nextLink:RoadLink={...link,sectionProfile:{...link.sectionProfile,mode:'linear'},components:baseComponents};const created:string[]=[];
  for(let lane=adopted.length;lane<proposal.lanes;lane++){
    const componentId=nextComponentId(nextLink),component:LinkStationLaneComponent={
      id:componentId,kind:'lane',direction:proposal.linkDirection,side:proposal.linkSide,
      start:+proposal.corridorStart.toFixed(2),end:+proposal.corridorEnd.toFixed(2),
      taperIn:+proposal.corridorTaperIn.toFixed(2),taperOut:+proposal.corridorTaperOut.toFixed(2),
      source:sourceFor(proposal,lane)
    };
    nextLink={...nextLink,components:[...nextLink.components,component]};created.push(componentId);
  }
  const next={...project,links:project.links.map(item=>item.id===linkId?nextLink:item)},error=validateNetworkProject(next);
  return error?{project,created:[],error}:{project:next,created:[...adopted.map(v=>v.id),...created],removed:sourced.map(v=>v.id),error:null};
}

export function continueJunctionAuxiliaryToCorridor(project:NetworkProject,linkId:string,id:string):JunctionAuxiliaryApplyResult{
  const link=project.links.find(item=>item.id===linkId);if(!link)return{project,created:[],error:'ไม่พบ Road Link'};
  const proposal=junctionAuxiliaryProposals(project,link).find(item=>item.id===id);
  if(!proposal)return{project,created:[],error:'ไม่พบ Junction auxiliary proposal'};
  if(proposal.continuation==='local'&&!proposal.canContinue)return{project,created:[],error:proposal.message};
  const edited=updateJunctionArmPocket(project,proposal.junctionId,proposal.armId,proposal.sourceDirection,proposal.sourceSide,{continuation:'corridor'});
  if(edited.error)return{project,created:[],error:edited.error};
  const updatedLink=edited.project.links.find(item=>item.id===linkId);if(!updatedLink)return{project,created:[],error:'Road Link หายระหว่างสร้าง handoff'};
  const updated=junctionAuxiliaryProposals(edited.project,updatedLink).find(item=>item.id===id);
  if(!updated||updated.status==='blocked')return{project,created:[],error:updated?.message??'สร้าง handoff ไม่สำเร็จ'};
  return applyJunctionAuxiliaryProposal(edited.project,linkId,id);
}

export function returnJunctionAuxiliaryToLocal(project:NetworkProject,linkId:string,id:string):JunctionAuxiliaryApplyResult{
  const link=project.links.find(item=>item.id===linkId);if(!link)return{project,created:[],error:'ไม่พบ Road Link'};
  const proposal=junctionAuxiliaryProposals(project,link).find(item=>item.id===id),
    sourced=link.components.filter((component):component is LinkStationLaneComponent&{source:JunctionAuxiliarySource}=>component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.handoffId===id),
    fallbackSource=sourced[0]?.source;
  if(!proposal&&!fallbackSource)return{project,created:[],error:'ไม่พบ Junction auxiliary proposal หรือ provenance สำหรับ handoff นี้'};
  let edited=project;
  if(proposal){
    const result=updateJunctionArmPocket(project,proposal.junctionId,proposal.armId,proposal.sourceDirection,proposal.sourceSide,{continuation:'local'});
    if(result.error)return{project,created:[],error:result.error};edited=result.project;
  }else if(fallbackSource&&rawPocketForSource(project,fallbackSource)){
    const result=updateJunctionArmPocket(project,fallbackSource.junctionId,fallbackSource.armId,fallbackSource.direction,fallbackSource.side,{continuation:'local'});
    if(result.error)return{project,created:[],error:result.error};edited=result.project;
  }else{
    return{project,created:[],error:'Source Pocket/Receiving lane ไม่มีอยู่แล้ว · ใช้ Detach เพื่อเก็บ corridor geometry เป็น manual state'};
  }
  const removed=sourced.map(component=>component.id),
    next={...edited,links:edited.links.map(item=>item.id===linkId?{...item,components:item.components.filter(component=>!(component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.handoffId===id))}:item)},
    error=validateNetworkProject(next);
  return error?{project,created:[],error}:{project:next,created:[],removed,error:null};
}

export function junctionAuxiliaryPocket(project:NetworkProject,linkId:string,id:string){
  const link=project.links.find(item=>item.id===linkId);if(!link)return null;
  const proposal=junctionAuxiliaryProposals(project,link).find(item=>item.id===id);if(!proposal)return null;
  return proposalPocket(project,proposal);
}
