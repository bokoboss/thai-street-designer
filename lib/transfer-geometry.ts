import {lengthOf,smoothAlignment,station,tangentAlignmentControls,validAlignment} from './alignment';
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
};
export type ResolvedTransferConnectorAlignment={
  connector:TransferConnector;
  from:ResolvedTransferPortGeometry;
  to:ResolvedTransferPortGeometry;
  controls:(WorldPoint&{radius?:number})[];
  points:WorldPoint[];
  length:number;
};

const normalized=(angle:number)=>((angle%360)+360)%360;
const leftOffsetPoint=(point:WorldPoint,heading:number,offset:number)=>{
  const a=heading*Math.PI/180;
  return{x:point.x-Math.sin(a)*offset,y:point.y+Math.cos(a)*offset};
};

export function resolveTransferPortGeometry(project:NetworkProject,portOrId:TransferPort|string):ResolvedTransferPortGeometry|null{
  const port=typeof portOrId==='string'?project.transferPorts.find(item=>item.id===portOrId):portOrId;
  if(!port||transferPortIssue(project,port))return null;
  const host=project.links.find(link=>link.id===port.hostLinkId);if(!host)return null;
  const alignment=linkPoints(project,host),section=resolveLinkSectionGeometry(project,host);
  if(alignment.length<2||!section)return null;
  const center=station(alignment,port.station),storageHeading=normalized(center.angle),
    left=sampleStationSeries(section.stations,section.left,port.station),
    right=sampleStationSeries(section.stations,section.right,port.station),
    medianHalf=sampleStationSeries(section.stations,section.medianHalf,port.station),
    offset=port.direction==='forward'
      ?(port.side==='curb'?left:medianHalf)
      :-(port.side==='curb'?right:medianHalf),
    trafficHeading=normalized(storageHeading+(port.direction==='backward'?180:0)),
    outwardHeading=normalized(trafficHeading+(port.side==='curb'?90:-90)),
    centerlinePoint={x:center.x,y:center.y},point=leftOffsetPoint(centerlinePoint,storageHeading,offset);
  return{port,point,centerlinePoint,storageHeading,trafficHeading,outwardHeading,offset};
}

export function resolveTransferConnectorAlignment(project:NetworkProject,connectorOrId:TransferConnector|string):ResolvedTransferConnectorAlignment|null{
  const connector=typeof connectorOrId==='string'?project.transferConnectors.find(item=>item.id===connectorOrId):connectorOrId;
  if(!connector||transferConnectorIssue(project,connector))return null;
  const from=resolveTransferPortGeometry(project,connector.fromTransferPortId),to=resolveTransferPortGeometry(project,connector.toTransferPortId);
  if(!from||!to)return null;
  const controls=tangentAlignmentControls(from.point,to.point,connector.via,from.trafficHeading,normalized(to.trafficHeading+180));
  if(!validAlignment(controls))return null;
  const points=smoothAlignment(controls);
  return points.length>=2?{connector,from,to,controls,points,length:lengthOf(points)}:null;
}
