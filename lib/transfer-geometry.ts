import {lengthOf,profiledParallel,smoothAlignment,station,tangentAlignmentControls,validAlignment} from './alignment';
import {resolveLinkSectionGeometry} from './network-link-geometry';
import {sampleStationSeries} from './station-profile';
import {linkPoints,transferConnectorIssue,transferPortIssue,type NetworkProject,type TransferConnector,type TransferPort,type WorldPoint} from './network-project';

export type ResolvedTransferPortGeometry={
  port:TransferPort;
  point:WorldPoint;
  centerlinePoint:WorldPoint;
  storageHeading:number;
  trafficHeading:number;
  outwardHeading:number;
  offset:number;
  laneWidth:number;
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

const normalized=(angle:number)=>((angle%360)+360)%360;
const leftOffsetPoint=(point:WorldPoint,heading:number,offset:number)=>{
  const a=heading*Math.PI/180;
  return{x:point.x-Math.sin(a)*offset,y:point.y+Math.cos(a)*offset};
};
const headingPoint=(point:WorldPoint,heading:number,distance:number)=>{
  const a=heading*Math.PI/180;
  return{x:point.x+Math.cos(a)*distance,y:point.y+Math.sin(a)*distance};
};

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
    offset=port.direction==='forward'
      ?(port.side==='curb'?left:medianHalf)
      :-(port.side==='curb'?right:medianHalf),
    trafficHeading=normalized(storageHeading+(port.direction==='backward'?180:0)),
    outwardHeading=normalized(trafficHeading+(port.side==='curb'?90:-90)),
    centerlinePoint={x:center.x,y:center.y},point=leftOffsetPoint(centerlinePoint,storageHeading,offset);
  return{port,point,centerlinePoint,storageHeading,trafficHeading,outwardHeading,offset,laneWidth};
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
