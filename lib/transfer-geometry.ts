import {lengthOf,profiledParallel,smoothAlignment,station,tangentAlignmentControls,validAlignment} from './alignment';
import {resolveLinkSectionGeometry} from './network-link-geometry';
import {sampleStationSeries} from './station-profile';
import {linkPoints,transferConnectorIssue,transferPortIssue,type NetworkProject,type TransferConnector,type TransferPort,type TransferTerminalGoreTreatment,type WorldPoint} from './network-project';

export type ResolvedTransferPortGeometry={
  port:TransferPort;
  point:WorldPoint;
  centerlinePoint:WorldPoint;
  storageHeading:number;
  trafficHeading:number;
  outwardHeading:number;
  offset:number;
  laneWidth:number;
  hostEdgePoints:WorldPoint[];
  hostStations:number[];
  hostLength:number;
};
export type ResolvedTransferConnectorAlignment={
  connector:TransferConnector;
  from:ResolvedTransferPortGeometry;
  to:ResolvedTransferPortGeometry;
  controls:(WorldPoint&{radius?:number})[];
  points:WorldPoint[];
  fromCenterPoint:WorldPoint;
  toCenterPoint:WorldPoint;
  length:number;
};
export type ResolvedTransferConnectorPavement={
  alignment:ResolvedTransferConnectorAlignment;
  width:number;
  halfWidth:number;
  left:WorldPoint[];
  right:WorldPoint[];
  polygon:WorldPoint[];
  laneLines:WorldPoint[][];
};
export type ResolvedTransferPhysicalNose={center:WorldPoint;polygon:WorldPoint[];availableSeparation:number};
export type ResolvedTransferTerminalGore={
  terminal:'from'|'to';
  treatment:TransferTerminalGoreTreatment;
  paintedNose:WorldPoint;
  neutralPolygon:WorldPoint[];
  hostEdge:WorldPoint[];
  connectorEdge:WorldPoint[];
  physicalNose:ResolvedTransferPhysicalNose|null;
};
export type TransferTerminalGoreResolution={
  terminal:'from'|'to';
  treatment:TransferTerminalGoreTreatment;
  gore:ResolvedTransferTerminalGore|null;
  issue:string|null;
};

const normalized=(angle:number)=>((angle%360)+360)%360;
const leftOffsetPoint=(point:WorldPoint,heading:number,offset:number)=>{
  const a=heading*Math.PI/180;
  return{x:point.x-Math.sin(a)*offset,y:point.y+Math.cos(a)*offset};
};
const headingPoint=(point:WorldPoint,heading:number,distance:number)=>{
  const a=heading*Math.PI/180;
  return{x:point.x+Math.cos(a)*distance,y:point.y+Math.sin(a)*distance};
};
const sampleProfilePoint=(stations:number[],points:WorldPoint[],target:number):WorldPoint|null=>{
  if(!stations.length||stations.length!==points.length)return null;
  if(target<=stations[0])return points[0];
  if(target>=stations.at(-1)!)return points.at(-1)!;
  let hi=1;while(hi<stations.length&&stations[hi]<target)hi++;
  const lo=hi-1,span=Math.max(1e-9,stations[hi]-stations[lo]),t=(target-stations[lo])/span;
  return{x:points[lo].x+(points[hi].x-points[lo].x)*t,y:points[lo].y+(points[hi].y-points[lo].y)*t};
};
const vector=(a:WorldPoint,b:WorldPoint)=>({x:b.x-a.x,y:b.y-a.y});
const unit=(v:WorldPoint)=>{const d=Math.hypot(v.x,v.y);return d>1e-9?{x:v.x/d,y:v.y/d}:{x:1,y:0};};
const add=(a:WorldPoint,b:WorldPoint,scale=1)=>({x:a.x+b.x*scale,y:a.y+b.y*scale});

export function resolveTransferPortGeometry(project:NetworkProject,portOrId:TransferPort|string):ResolvedTransferPortGeometry|null{
  const port=typeof portOrId==='string'?project.transferPorts.find(item=>item.id===portOrId):portOrId;
  if(!port||transferPortIssue(project,port))return null;
  const host=project.links.find(link=>link.id===port.hostLinkId);if(!host)return null;
  // Transfer-created speed-change lanes must not move the topology datum that owns them.
  const datumHost={...host,components:host.components.filter(component=>!(component.kind==='lane'&&component.source?.kind==='transfer-terminal'))},
    datumProject={...project,links:project.links.map(link=>link.id===host.id?datumHost:link)},
    alignment=linkPoints(datumProject,datumHost),section=resolveLinkSectionGeometry(datumProject,datumHost);
  if(alignment.length<2||!section)return null;
  const center=station(alignment,port.station),storageHeading=normalized(center.angle),
    left=sampleStationSeries(section.stations,section.left,port.station),
    right=sampleStationSeries(section.stations,section.right,port.station),
    medianHalf=sampleStationSeries(section.stations,section.medianHalf,port.station),
    laneWidth=sampleStationSeries(section.stations,port.direction==='forward'?section.forwardLaneWidth:section.backwardLaneWidth,port.station),
    edgeOffsets=port.direction==='forward'
      ?(port.side==='curb'?section.left:section.medianHalf)
      :(port.side==='curb'?section.right.map(v=>-v):section.medianHalf.map(v=>-v)),
    hostEdgePoints=profiledParallel(section.points,edgeOffsets),
    offset=port.direction==='forward'
      ?(port.side==='curb'?left:medianHalf)
      :-(port.side==='curb'?right:medianHalf),
    trafficHeading=normalized(storageHeading+(port.direction==='backward'?180:0)),
    outwardHeading=normalized(trafficHeading+(port.side==='curb'?90:-90)),
    centerlinePoint={x:center.x,y:center.y},point=sampleProfilePoint(section.stations,hostEdgePoints,port.station)??leftOffsetPoint(centerlinePoint,storageHeading,offset);
  return{port,point,centerlinePoint,storageHeading,trafficHeading,outwardHeading,offset,laneWidth,hostEdgePoints,hostStations:section.stations,hostLength:section.total};
}

export function resolveTransferConnectorAlignment(project:NetworkProject,connectorOrId:TransferConnector|string):ResolvedTransferConnectorAlignment|null{
  const connector=typeof connectorOrId==='string'?project.transferConnectors.find(item=>item.id===connectorOrId):connectorOrId;
  if(!connector||transferConnectorIssue(project,connector))return null;
  const from=resolveTransferPortGeometry(project,connector.fromTransferPortId),to=resolveTransferPortGeometry(project,connector.toTransferPortId);
  if(!from||!to)return null;
  const halfWidth=connector.lanes*connector.laneWidth/2,
    fromCenterPoint=headingPoint(from.point,from.outwardHeading,halfWidth),
    toCenterPoint=headingPoint(to.point,to.outwardHeading,halfWidth),
    controls=tangentAlignmentControls(fromCenterPoint,toCenterPoint,connector.via,from.trafficHeading,normalized(to.trafficHeading+180));
  if(!validAlignment(controls))return null;
  const points=smoothAlignment(controls);
  return points.length>=2?{connector,from,to,controls,points,fromCenterPoint,toCenterPoint,length:lengthOf(points)}:null;
}
export function resolveTransferConnectorPavement(project:NetworkProject,connectorOrId:TransferConnector|string):ResolvedTransferConnectorPavement|null{
  const alignment=resolveTransferConnectorAlignment(project,connectorOrId);if(!alignment)return null;
  const {connector,points}=alignment,width=connector.lanes*connector.laneWidth,halfWidth=width/2,
    left=profiledParallel(points,points.map(()=>halfWidth)),right=profiledParallel(points,points.map(()=>-halfWidth)),
    laneLines=Array.from({length:Math.max(0,connector.lanes-1)},(_,index)=>{
      const offset=halfWidth-(index+1)*connector.laneWidth;
      return profiledParallel(points,points.map(()=>offset));
    }),
    polygon=[...left,...[...right].reverse()];
  return{alignment,width,halfWidth,left,right,polygon,laneLines};
}
function physicalNosePolygon(center:WorldPoint,pathDirection:WorldPoint,gapDirection:WorldPoint,length:number,width:number){
  const along=unit(pathDirection),across=unit(gapDirection),hl=length/2,hw=width/2;
  return[
    add(add(center,along,-hl),across,-hw),
    add(add(center,along,hl),across,-hw),
    add(add(center,along,hl),across,hw),
    add(add(center,along,-hl),across,hw)
  ];
}
export function resolveTransferConnectorTerminalGore(project:NetworkProject,connectorOrId:TransferConnector|string,terminal:'from'|'to'):TransferTerminalGoreResolution{
  const connector=typeof connectorOrId==='string'?project.transferConnectors.find(item=>item.id===connectorOrId):connectorOrId,
    treatment=connector?.terminalTreatment?.[terminal]??{level:'none',neutralLength:0,physicalNoseLength:0,physicalNoseWidth:0};
  if(!connector)return{terminal,treatment,gore:null,issue:'ไม่พบ Transfer connector'};
  if(treatment.level==='none')return{terminal,treatment,gore:null,issue:null};
  const pavement=resolveTransferConnectorPavement(project,connector);if(!pavement)return{terminal,treatment,gore:null,issue:'ไม่สามารถ resolve connector pavement ได้'};
  if(treatment.neutralLength>=pavement.alignment.length-.05)return{terminal,treatment,gore:null,issue:'Neutral gore ยาวเกิน Transfer connector ที่มีอยู่'};
  const port=terminal==='from'?pavement.alignment.from:pavement.alignment.to,
    hostTravelSign=port.port.direction==='forward'?1:-1,
    hostDeltaSign=terminal==='from'?hostTravelSign:-hostTravelSign,
    hostTarget=port.port.station+hostDeltaSign*treatment.neutralLength;
  if(hostTarget<0||hostTarget>port.hostLength)return{terminal,treatment,gore:null,issue:'Neutral gore ยาวเกิน host RoadLink ในทิศทางที่ต้องใช้'};
  const innerEdge=port.port.side==='curb'?pavement.right:pavement.left,innerLength=lengthOf(innerEdge),
    samples=Math.max(4,Math.min(32,Math.ceil(treatment.neutralLength/4))),hostEdge:WorldPoint[]=[],connectorEdge:WorldPoint[]=[];
  for(let i=0;i<=samples;i++){
    const delta=treatment.neutralLength*i/samples,hostStation=port.port.station+hostDeltaSign*delta,
      hp=sampleProfilePoint(port.hostStations,port.hostEdgePoints,hostStation),
      fraction=delta/pavement.alignment.length,edgeStation=innerLength*(terminal==='from'?fraction:1-fraction),
      cp=station(innerEdge,edgeStation);
    if(!hp)return{terminal,treatment,gore:null,issue:'ไม่สามารถ sample host edge ของ neutral gore ได้'};
    hostEdge.push(i===0?port.point:hp);
    connectorEdge.push(i===0?port.point:{x:cp.x,y:cp.y});
  }
  const neutralPolygon=[...hostEdge,...[...connectorEdge].reverse()],paintedNose=port.point;
  let physicalNose:ResolvedTransferPhysicalNose|null=null;
  if(treatment.level==='physical'){
    const hostEnd=hostEdge.at(-1)!,connectorEnd=connectorEdge.at(-1)!,gap=vector(hostEnd,connectorEnd),availableSeparation=Math.hypot(gap.x,gap.y);
    if(availableSeparation+1e-6<treatment.physicalNoseWidth)return{terminal,treatment,gore:null,issue:`Physical nose width ${treatment.physicalNoseWidth.toFixed(1)} m มากกว่าช่องว่าง geometry ${availableSeparation.toFixed(1)} m ณ neutral-area end`};
    const center={x:(hostEnd.x+connectorEnd.x)/2,y:(hostEnd.y+connectorEnd.y)/2},
      hPrev=hostEdge.at(-2)??paintedNose,cPrev=connectorEdge.at(-2)??paintedNose,
      pathDirection=add(unit(vector(hPrev,hostEnd)),unit(vector(cPrev,connectorEnd)));
    physicalNose={center,polygon:physicalNosePolygon(center,pathDirection,gap,treatment.physicalNoseLength,treatment.physicalNoseWidth),availableSeparation};
  }
  return{terminal,treatment,gore:{terminal,treatment,paintedNose,neutralPolygon,hostEdge,connectorEdge,physicalNose},issue:null};
}
export function resolveTransferConnectorGores(project:NetworkProject,connectorOrId:TransferConnector|string):TransferTerminalGoreResolution[]{
  return(['from','to'] as const).map(terminal=>resolveTransferConnectorTerminalGore(project,connectorOrId,terminal))
    .filter(result=>result.treatment.level!=='none');
}
