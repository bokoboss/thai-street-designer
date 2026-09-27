import {pocketFactorAt,pocketOriginFor} from '../app/junction/allocation';
import {armTreatmentOrigins} from '../app/junction/geometry';
import {pocketsFor,type Direction} from '../app/junction/model';
import {
  junctionById,linkLength,linkLinearTransitionPossible,validateNetworkProject,
  type LinkDirection,type LinkStationLaneComponent,type NetworkProject,type RoadLink
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
  lanes:number;
  sourceLength:number;
  sourceTaper:number;
  sourceOrigin:number;
  sourceFullEnd:number;
  sourceTreatmentEnd:number;
  portStation:number;
  portFactor:number;
  gapToPort:number;
  remainingFull:number;
  corridorStart:number;
  corridorEnd:number;
  corridorTaperIn:number;
  corridorTaperOut:number;
  status:JunctionAuxiliaryProposalStatus;
  message:string;
  existing:number;
};
export type JunctionAuxiliaryApplyResult={project:NetworkProject;created:string[];error:string|null};

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
        const sourceOrigin=pocketOriginFor(origins,direction,side),sourceFullEnd=sourceOrigin+pocket.length,
          sourceTreatmentEnd=sourceFullEnd+pocket.taper,portStation=arm.length,
          portFactor=pocketFactorAt(pocket,portStation,origins,direction,side),gapToPort=portStation-sourceTreatmentEnd,
          remainingFull=Math.max(0,sourceFullEnd-portStation),remaining=Math.max(0,remainingFull+pocket.taper),
          linkDirection=mapDirection(end,direction),linkSide=mapSide(side),
          corridorStart=end==='from'?0:Math.max(0,total-remaining),corridorEnd=end==='from'?Math.min(total,remaining):total,
          corridorTaperIn=end==='from'?0:Math.min(pocket.taper,remaining),
          corridorTaperOut=end==='from'?Math.min(pocket.taper,remaining):0,
          base:Omit<JunctionAuxiliaryProposal,'status'|'message'|'existing'>={
            id:proposalId(link,end,direction,side),linkId:link.id,end,junctionId:junction.id,armId:ref.armId,
            sourceDirection:direction,sourceSide:side,linkDirection,linkSide,lanes:pocket.lanes,
            sourceLength:pocket.length,sourceTaper:pocket.taper,sourceOrigin,sourceFullEnd,sourceTreatmentEnd,portStation,
            portFactor,gapToPort,remainingFull,corridorStart,corridorEnd,corridorTaperIn,corridorTaperOut
          };
        const existing=link.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&equivalentLane(component,{...base,status:'ready',message:'',existing:0})).length;
        let status:JunctionAuxiliaryProposalStatus='ready',message='';
        if(portFactor<=.001){
          status='local-only';
          message=gapToPort>=0
            ?`Junction treatment จบก่อน port ${gapToPort.toFixed(1)} m · ไม่ควรสร้าง RoadLink lane ที่ขาดช่วง`
            :'Junction treatment ไม่ active ที่ port · ไม่สร้าง continuation อัตโนมัติ';
        }else if(portFactor<.999){
          status='blocked';message=`Port อยู่กลาง taper (active ${(portFactor*100).toFixed(0)}%) · ต้องมี fractional handoff ก่อนจึงจะต่อได้โดยไม่กระโดดความกว้าง`;
        }else if(remaining<.5){
          status='local-only';message='Junction treatment ไม่มีช่วงเหลือต่อออกนอก port';
        }else if(remaining>total+.05){
          status='blocked';message=`Road Link สั้นกว่าช่วง continuation ที่เหลือ ${(remaining-total).toFixed(1)} m · ไม่ลดความยาวให้เอง`;
        }else if(!linkLinearTransitionPossible(project,link)){
          status='blocked';message='Road Link ยังมี endpoint topology/edge mismatch ที่ต้อง resolve ก่อนสร้าง corridor lifecycle';
        }else if(existing>=pocket.lanes){
          status='applied';message=`มี corridor lifecycle รูปแบบเดียวกันครบ ${pocket.lanes} เลนแล้ว`;
        }else if(link.components.length+(pocket.lanes-existing)>24){
          status='blocked';message='จำนวน station components จะเกินขอบเขต 24 รายการของ Road Link';
        }else{
          message=`พร้อมสร้าง ${pocket.lanes-existing} เลน · ${end==='from'?`Sta. 0–${corridorEnd.toFixed(1)}`:`Sta. ${corridorStart.toFixed(1)}–${total.toFixed(1)}`} m${link.sectionProfile.mode==='review'?' · จะเปิด Resolved profile ใน transaction เดียวกัน':''}`;
        }
        out.push({...base,status,message,existing});
      }
    }
  }
  return out;
}

export function applyJunctionAuxiliaryProposal(project:NetworkProject,linkId:string,id:string):JunctionAuxiliaryApplyResult{
  const link=project.links.find(item=>item.id===linkId);if(!link)return{project,created:[],error:'ไม่พบ Road Link'};
  const proposal=junctionAuxiliaryProposals(project,link).find(item=>item.id===id);
  if(!proposal)return{project,created:[],error:'ไม่พบ Junction auxiliary proposal'};
  if(proposal.status==='applied')return{project,created:[],error:null};
  if(proposal.status!=='ready')return{project,created:[],error:proposal.message};
  const currentMatches=link.components.filter((component):component is LinkStationLaneComponent=>component.kind==='lane'&&equivalentLane(component,proposal)).length,
    missing=Math.max(0,proposal.lanes-currentMatches);
  if(!missing)return{project,created:[],error:null};
  let nextLink:RoadLink={...link,sectionProfile:{...link.sectionProfile,mode:'linear'},components:[...link.components]},created:string[]=[];
  for(let lane=0;lane<missing;lane++){
    const id=nextComponentId(nextLink),component:LinkStationLaneComponent={
      id,kind:'lane',direction:proposal.linkDirection,side:proposal.linkSide,
      start:+proposal.corridorStart.toFixed(2),end:+proposal.corridorEnd.toFixed(2),
      taperIn:+proposal.corridorTaperIn.toFixed(2),taperOut:+proposal.corridorTaperOut.toFixed(2)
    };
    nextLink={...nextLink,components:[...nextLink.components,component]};created.push(id);
  }
  const next={...project,links:project.links.map(item=>item.id===linkId?nextLink:item)},error=validateNetworkProject(next);
  return error?{project,created:[],error}:{project:next,created,error:null};
}
