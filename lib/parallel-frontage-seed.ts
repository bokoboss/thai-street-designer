import {emptyPockets,markingsFor,type Design} from '../app/junction/model';
import {profiledParallel} from './alignment';
import {
  addJunction,addParallelCorridor,connectPorts,junctionById,linkControlPoints,parallelCorridorChainContinuous,parallelCorridorChainOrientation,
  parallelCorridorForLink,rotateJunction,setLinkVia,updateParallelCorridor,validateNetworkProject,
  type JunctionInstance,type NetworkProject,type ParallelCorridor,type ParallelCorridorSide,type PortRef,type RoadLink
} from './network-project';

export type AssistedFrontageSeedMode=ParallelCorridorSide|'both';
export type AssistedFrontageSeedInput={
  mainlineLinkIds:string[];
  mainlineStartJunctionId?:string;
  side:AssistedFrontageSeedMode;
  offset:number;
  corridorId?:string;
  name?:string;
};
export type AssistedFrontageSeedChain={side:ParallelCorridorSide;junctionIds:string[];linkIds:string[]};
export type AssistedFrontageSeedResult={project:NetworkProject;corridor?:ParallelCorridor;generated:AssistedFrontageSeedChain[];error:string|null};

type OrientedLink={link:RoadLink;start:PortRef;end:PortRef;reversed:boolean};

function orientChain(project:NetworkProject,linkIds:string[],startJunctionId:string):OrientedLink[]|null{
  const links=linkIds.map(id=>project.links.find(link=>link.id===id));
  if(links.some(link=>!link))return null;
  let current=startJunctionId;const oriented:OrientedLink[]=[];
  for(const link of links as RoadLink[]){
    if(link.from.junctionId===current){oriented.push({link,start:link.from,end:link.to,reversed:false});current=link.to.junctionId;}
    else if(link.to.junctionId===current){oriented.push({link,start:link.to,end:link.from,reversed:true});current=link.from.junctionId;}
    else return null;
  }
  return oriented;
}
function seedDesign(source:Design):Design{
  const design=structuredClone(source);
  design.slips=[];design.trees=false;design.lights=false;
  design.arms=design.arms.map(arm=>{
    const next={...arm,length:Math.max(45,Math.min(60,arm.length)),signal:false,crossing:false,stop:false,
      incomingPockets:emptyPockets(),outgoingPockets:emptyPockets(),arrowOverrides:undefined,
      medianOpenings:[],medianTrees:arm.medianTrees?{...arm.medianTrees,enabled:false}:undefined,
      roadside:arm.roadside?{
        incoming:{...arm.roadside.incoming,trees:false,lights:false},
        outgoing:{...arm.roadside.outgoing,trees:false,lights:false}
      }:undefined
    };
    return{...next,laneMarkings:markingsFor(next)};
  });
  return design;
}
function renamedJunction(project:NetworkProject,id:string,name:string){
  return{...project,junctions:project.junctions.map(j=>j.id===id?{...j,name:name.slice(0,80)}:j)};
}
function renamedLink(project:NetworkProject,id:string,name:string){
  return{...project,links:project.links.map(link=>link.id===id?{...link,name:name.slice(0,80)}:link)};
}
function sideLabel(side:ParallelCorridorSide){return side==='left'?'Left':'Right';}

function buildSide(project:NetworkProject,oriented:OrientedLink[],side:ParallelCorridorSide,offset:number):{project:NetworkProject;generated?:AssistedFrontageSeedChain;error:string|null}{
  const nodeIds=[oriented[0].start.junctionId,...oriented.map(item=>item.end.junctionId)],
    sources=nodeIds.map(id=>junctionById(project,id));
  if(sources.some(source=>!source))return{project,error:'สร้าง frontage seed ไม่ได้ · mainline chain อ้าง Junction ที่หายไป'};
  if((sources as JunctionInstance[]).some(source=>source.design.type==='roundabout'))return{project,error:'Assisted frontage seed ยังไม่รองรับ mainline chain ที่ผ่าน Roundabout · สร้าง/เชื่อม frontage ด้วยตนเองก่อน'};
  const centers=(sources as JunctionInstance[]).map(source=>({x:source.x,y:source.y})),signed=side==='left'?offset:-offset,
    offsetCenters=profiledParallel(centers,centers.map(()=>signed)),cloneBySource=new Map<string,JunctionInstance>();
  let working=project;
  for(let index=0;index<sources.length;index++){
    const source=sources[index]!,added=addJunction(working,offsetCenters[index],seedDesign(source.design)),
      rotated=rotateJunction(added.project,added.junction.id,source.rotation);
    working=renamedJunction(rotated,added.junction.id,`Frontage ${sideLabel(side)} seed · ${source.name}`);
    const clone=junctionById(working,added.junction.id);if(!clone)return{project,error:'สร้าง frontage seed Junction ไม่สำเร็จ'};
    cloneBySource.set(source.id,clone);
  }
  const linkIds:string[]=[];
  for(let index=0;index<oriented.length;index++){
    const item=oriented[index],fromClone=cloneBySource.get(item.start.junctionId),toClone=cloneBySource.get(item.end.junctionId);
    if(!fromClone||!toClone)return{project,error:'สร้าง frontage seed topology ไม่สำเร็จ'};
    const connected=connectPorts(working,{junctionId:fromClone.id,armId:item.start.armId},{junctionId:toClone.id,armId:item.end.armId});
    if(connected.error||!connected.link)return{project,error:'สร้าง frontage seed Road Link ไม่สำเร็จ · '+(connected.error??'ไม่ทราบสาเหตุ')};
    working=connected.project;
    const sourceVia=item.reversed?[...item.link.via].reverse():item.link.via;
    if(sourceVia.length){
      const controls=linkControlPoints(project,item.link),orientedControls=item.reversed?[...controls].reverse():controls,
        offsetControls=profiledParallel(orientedControls,orientedControls.map(()=>signed)),
        via=offsetControls.slice(1,-1).map((point,i)=>({...point,radius:sourceVia[i]?.radius??0})),
        seeded=setLinkVia(working,connected.link.id,via);
      if(seeded===working)return{project,error:'Offset seed ของ Road Link โค้งไม่ผ่าน geometric validation · ลองเพิ่ม/ลด offset หรือสร้าง frontage ด้วยตนเอง'};
      working=seeded;
    }
    working=renamedLink(working,connected.link.id,`Frontage ${sideLabel(side)} seed · ${item.link.name}`);
    linkIds.push(connected.link.id);
  }
  return{project:working,generated:{side,junctionIds:[...cloneBySource.values()].map(j=>j.id),linkIds},error:null};
}

export function seedParallelFrontage(project:NetworkProject,input:AssistedFrontageSeedInput):AssistedFrontageSeedResult{
  if(!['left','right','both'].includes(input.side))return{project,generated:[],error:'Seed side ไม่ถูกต้อง'};
  const offset=Number(input.offset),sides:ParallelCorridorSide[]=input.side==='both'?['left','right']:[input.side];
  if(!Number.isFinite(offset)||offset<20||offset>200)return{project,generated:[],error:'Seed offset ต้องอยู่ระหว่าง 20–200 m · เป็น geometric workspace guard ไม่ใช่มาตรฐานออกแบบ'};
  if(!parallelCorridorChainContinuous(project,input.mainlineLinkIds))return{project,generated:[],error:'Mainline chain ไม่ต่อเนื่อง'};
  const existing=input.corridorId?project.parallelCorridors.find(v=>v.id===input.corridorId):undefined,
    firstLink=project.links.find(link=>link.id===input.mainlineLinkIds[0]),
    mainlineStartJunctionId=existing?.mainlineStartJunctionId||input.mainlineStartJunctionId||firstLink?.from.junctionId||'',
    orientation=parallelCorridorChainOrientation(project,input.mainlineLinkIds,mainlineStartJunctionId),
    oriented=orientation?orientChain(project,input.mainlineLinkIds,orientation.startJunctionId):null;
  if(!orientation||!oriented)return{project,generated:[],error:'จัด reference direction ของ mainline chain ไม่สำเร็จ'};
  if(input.corridorId&&!existing)return{project,generated:[],error:'ไม่พบ Parallel corridor'};
  if(existing&&JSON.stringify(existing.mainlineLinkIds)!==JSON.stringify(input.mainlineLinkIds))return{project,generated:[],error:'Mainline chain ไม่ตรงกับ Parallel corridor ที่เลือก'};
  if(!existing&&input.mainlineLinkIds.some(id=>parallelCorridorForLink(project,id)))return{project,generated:[],error:'Mainline Road Link อยู่ใน Parallel corridor แล้ว'};
  if(existing&&sides.some(side=>existing.frontage.some(chain=>chain.side===side)))return{project,generated:[],error:'Parallel corridor มี frontage side ที่เลือกอยู่แล้ว'};
  let working=project;const generated:AssistedFrontageSeedChain[]=[];
  for(const side of sides){
    const built=buildSide(working,oriented,side,offset);
    if(built.error||!built.generated)return{project,generated:[],error:built.error??'สร้าง frontage seed ไม่สำเร็จ'};
    working=built.project;generated.push(built.generated);
  }
  const frontage=[...(existing?.frontage??[]),...generated.map(chain=>({side:chain.side,linkIds:chain.linkIds}))],
    name=(input.name?.trim()||existing?.name||`Parallel Corridor ${project.parallelCorridors.length+1}`).slice(0,80),
    grouped=existing
      ?updateParallelCorridor(working,existing.id,{name,mainlineLinkIds:[...input.mainlineLinkIds],mainlineStartJunctionId:existing.mainlineStartJunctionId,frontage})
      :addParallelCorridor(working,{name,mainlineLinkIds:[...input.mainlineLinkIds],mainlineStartJunctionId:orientation.startJunctionId,frontage});
  if(grouped.error||!grouped.corridor)return{project,generated:[],error:grouped.error??'บันทึก Parallel corridor ไม่สำเร็จ'};
  const error=validateNetworkProject(grouped.project);
  return error?{project,generated:[],error}:{project:grouped.project,corridor:grouped.corridor,generated,error:null};
}
