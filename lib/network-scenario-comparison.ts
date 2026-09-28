import {pocketsFor,sectionFor,type Arm,type Direction} from '../app/junction/model';
import {linkEndSection,linkLength,linkPoints,type JunctionInstance,type NetworkProject,type RoadLink} from './network-project';

export type ScenarioDeltaStatus='added'|'removed'|'changed';
export type ScenarioDeltaKind='junction'|'roadlink';
export type ScenarioObjectDelta={
  kind:ScenarioDeltaKind;
  id:string;
  name:string;
  status:ScenarioDeltaStatus;
  changes:string[];
};
export type ScenarioMetricKey='junctions'|'roadLinks'|'mainLanes'|'pocketLanes'|'receivingLanes'|'medianArms'|'medianWidth'|'stationComponents'|'roadLength';
export type ScenarioMetric={
  key:ScenarioMetricKey;
  label:string;
  reference:number;
  active:number;
  delta:number;
  unit?:string;
};
export type ScenarioComparison={
  referenceTitle:string;
  activeTitle:string;
  metrics:ScenarioMetric[];
  objects:ScenarioObjectDelta[];
  counts:{added:number;removed:number;changed:number;total:number};
};

const rounded=(value:number,decimals=3)=>{
  const f=10**decimals;return Math.round(value*f)/f;
};
const json=(value:unknown)=>JSON.stringify(value);
const pockets=(arm:Arm,direction:Direction)=>{
  const set=pocketsFor(arm,direction);
  return{
    left:{lanes:set.left.lanes,length:set.left.length,taper:set.left.taper,width:set.left.width??null,allocation:set.left.allocation??null,continuation:set.left.continuation??'local'},
    right:{lanes:set.right.lanes,length:set.right.length,taper:set.right.taper,width:set.right.width??null,allocation:set.right.allocation??null,continuation:set.right.continuation??'local'}
  };
};
const section=(arm:Arm,direction:Direction)=>{
  const value=sectionFor(arm,direction);
  return{width:value.width,walk:value.walk,bands:value.bands.map(band=>({type:band.type,width:band.width}))};
};
const enabledArms=(junction:JunctionInstance)=>junction.design.arms.map((arm,index)=>junction.design.enabled[index]?{arm,index}:null).filter((value):value is {arm:Arm;index:number}=>!!value);

function projectMetrics(project:NetworkProject){
  let mainLanes=0,pocketLanes=0,receivingLanes=0,medianArms=0,medianWidth=0;
  for(const junction of project.junctions)for(const {arm} of enabledArms(junction)){
    mainLanes+=arm.incoming+arm.outgoing;
    const incoming=pocketsFor(arm,'incoming'),outgoing=pocketsFor(arm,'outgoing');
    pocketLanes+=incoming.left.lanes+incoming.right.lanes;
    receivingLanes+=outgoing.left.lanes+outgoing.right.lanes;
    if(arm.median>0){medianArms++;medianWidth+=arm.median;}
  }
  return{
    junctions:project.junctions.length,
    roadLinks:project.links.length,
    mainLanes,
    pocketLanes,
    receivingLanes,
    medianArms,
    medianWidth:rounded(medianWidth,2),
    stationComponents:project.links.reduce((sum,link)=>sum+link.components.length,0),
    roadLength:rounded(project.links.reduce((sum,link)=>sum+linkLength(project,link),0),1)
  };
}

function junctionChanges(reference:JunctionInstance,active:JunctionInstance){
  const changes:string[]=[];
  const refArms=enabledArms(reference),activeArms=enabledArms(active),
    refEnabled=reference.design.enabled,activeEnabled=active.design.enabled;
  if(Math.hypot(reference.x-active.x,reference.y-active.y)>.01||Math.abs(reference.rotation-active.rotation)>.01||Math.abs(reference.design.rotation-active.design.rotation)>.01
    ||json(refArms.map(v=>[v.index,rounded(v.arm.angle,2),rounded(v.arm.length,2)]))!==json(activeArms.map(v=>[v.index,rounded(v.arm.angle,2),rounded(v.arm.length,2)])))changes.push('geometry');
  if(json(refEnabled)!==json(activeEnabled))changes.push('arms');
  if(json(refArms.map(v=>[v.index,v.arm.incoming,v.arm.outgoing]))!==json(activeArms.map(v=>[v.index,v.arm.incoming,v.arm.outgoing])))changes.push('main lanes');
  if(json(refArms.map(v=>[v.index,v.arm.median]))!==json(activeArms.map(v=>[v.index,v.arm.median])))changes.push('median');
  if(json(refArms.map(v=>[v.index,pockets(v.arm,'incoming'),pockets(v.arm,'outgoing')]))!==json(activeArms.map(v=>[v.index,pockets(v.arm,'incoming'),pockets(v.arm,'outgoing')])))changes.push('pocket / receiving');
  if(json(refArms.map(v=>[v.index,section(v.arm,'incoming'),section(v.arm,'outgoing')]))!==json(activeArms.map(v=>[v.index,section(v.arm,'incoming'),section(v.arm,'outgoing')])))changes.push('cross-section');
  if(json(refArms.map(v=>[v.index,v.arm.crossing,v.arm.signal,v.arm.stop,v.arm.crossOffset,v.arm.stopOffset]))!==json(activeArms.map(v=>[v.index,v.arm.crossing,v.arm.signal,v.arm.stop,v.arm.crossOffset,v.arm.stopOffset])))changes.push('controls');
  if(reference.name!==active.name)changes.push('name');
  if(json(reference.design)!==json(active.design)&&changes.length===0)changes.push('other design settings');
  return changes;
}
const pointsSignature=(project:NetworkProject,link:RoadLink)=>linkPoints(project,link).map(point=>[rounded(point.x,2),rounded(point.y,2)]);
const endSectionSignature=(project:NetworkProject,link:RoadLink)=>['from','to'].map(end=>{
  const sectionValue=linkEndSection(project,link,end as 'from'|'to');
  if(!sectionValue)return null;
  return{
    forwardLanes:sectionValue.forwardLanes,backwardLanes:sectionValue.backwardLanes,
    forwardLaneWidth:sectionValue.forwardLaneWidth,backwardLaneWidth:sectionValue.backwardLaneWidth,
    median:sectionValue.median,forwardWalk:sectionValue.forwardWalk,backwardWalk:sectionValue.backwardWalk,
    forwardBands:sectionValue.forwardBands.map(b=>[b.type,b.width]),backwardBands:sectionValue.backwardBands.map(b=>[b.type,b.width])
  };
});
function linkChanges(referenceProject:NetworkProject,reference:RoadLink,activeProject:NetworkProject,active:RoadLink){
  const changes:string[]=[];
  if(json(reference.from)!==json(active.from)||json(reference.to)!==json(active.to))changes.push('endpoints');
  if(json(pointsSignature(referenceProject,reference))!==json(pointsSignature(activeProject,active)))changes.push('alignment / ports');
  if(json(endSectionSignature(referenceProject,reference))!==json(endSectionSignature(activeProject,active)))changes.push('endpoint section');
  if(json(reference.sectionProfile)!==json(active.sectionProfile))changes.push('section transition');
  if(json(reference.components)!==json(active.components))changes.push('station components');
  if(reference.name!==active.name)changes.push('name');
  if(json(reference)!==json(active)&&changes.length===0)changes.push('other RoadLink settings');
  return changes;
}

export function compareNetworkProjects(reference:NetworkProject,active:NetworkProject):ScenarioComparison{
  const objects:ScenarioObjectDelta[]=[],
    refJ=new Map(reference.junctions.map(item=>[item.id,item])),activeJ=new Map(active.junctions.map(item=>[item.id,item])),
    refL=new Map(reference.links.map(item=>[item.id,item])),activeL=new Map(active.links.map(item=>[item.id,item]));
  for(const item of reference.junctions)if(!activeJ.has(item.id))objects.push({kind:'junction',id:item.id,name:item.name,status:'removed',changes:['removed from active']});
  for(const item of active.junctions){
    const ref=refJ.get(item.id);
    if(!ref)objects.push({kind:'junction',id:item.id,name:item.name,status:'added',changes:['added in active']});
    else{const changes=junctionChanges(ref,item);if(changes.length)objects.push({kind:'junction',id:item.id,name:item.name,status:'changed',changes});}
  }
  for(const item of reference.links)if(!activeL.has(item.id))objects.push({kind:'roadlink',id:item.id,name:item.name,status:'removed',changes:['removed from active']});
  for(const item of active.links){
    const ref=refL.get(item.id);
    if(!ref)objects.push({kind:'roadlink',id:item.id,name:item.name,status:'added',changes:['added in active']});
    else{const changes=linkChanges(reference,ref,active,item);if(changes.length)objects.push({kind:'roadlink',id:item.id,name:item.name,status:'changed',changes});}
  }
  const ref=projectMetrics(reference),act=projectMetrics(active),
    meta:{key:ScenarioMetricKey;label:string;unit?:string}[]=[
      {key:'junctions',label:'Junctions'},{key:'roadLinks',label:'Road links'},{key:'mainLanes',label:'Main lanes'},
      {key:'pocketLanes',label:'Pocket lanes'},{key:'receivingLanes',label:'Receiving lanes'},
      {key:'medianArms',label:'Median arms'},{key:'medianWidth',label:'Σ median width',unit:'m'},
      {key:'stationComponents',label:'Station components'},{key:'roadLength',label:'RoadLink length',unit:'m'}
    ],
    metrics=meta.map(item=>({key:item.key,label:item.label,unit:item.unit,reference:ref[item.key],active:act[item.key],delta:rounded(act[item.key]-ref[item.key],2)})),
    counts={added:objects.filter(v=>v.status==='added').length,removed:objects.filter(v=>v.status==='removed').length,changed:objects.filter(v=>v.status==='changed').length,total:objects.length};
  return{referenceTitle:reference.title,activeTitle:active.title,metrics,objects,counts};
}
