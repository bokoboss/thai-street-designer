// Shared engineering review geometry for plan and 3D, never part of pavement/markings.
import {armTreatmentOrigins,armTurn,edges,rotate} from '../junction/geometry';
import {configuredArrowLanes,resolvedLaneCenterY} from '../junction/lane-configuration';
import type {Direction,LaneRole} from '../junction/model';
import {eligibleTurnTargets,type AutoTurn} from '../junction/automatic-lane-mapping';
import type {JunctionInstance,WorldPoint} from '../network/network-project';
import {resolveConnectorOverrides,type ConnectorLegBinding,type ConnectorLaneRef,type ConnectorOverride} from './lane-connector-overrides';

export type ConnectorReviewLine={
  id:string;movement:AutoTurn;origin:'generated'|'manual';
  from:ConnectorLaneRef;to:ConnectorLaneRef;start:WorldPoint;end:WorldPoint;
};
export type ConnectorReviewTarget={ref:ConnectorLaneRef;point:WorldPoint};
export type ConnectorReview={
  lines:ConnectorReviewLine[];issues:string[];unresolved:number;elevation:number;
};
const world=(j:JunctionInstance,p:WorldPoint):WorldPoint=>{
  const a=(j.rotation??0)*Math.PI/180;
  return{x:j.x+p.x*Math.cos(a)-p.y*Math.sin(a),y:j.y+p.x*Math.sin(a)+p.y*Math.cos(a)};
};
export function connectorLaneWorldPoint(
  junction:JunctionInstance,armId:number,direction:Direction,role:LaneRole,laneIndex:number
):WorldPoint|null{
  const d=junction.design;
  if(!d.enabled[armId])return null;
  const arm=d.arms[armId];
  if(!configuredArrowLanes(arm,direction).some(l=>l.role===role&&l.laneIndex===laneIndex))return null;
  try{
    const edgeSet=edges(d);
    const x=armTreatmentOrigins(d,armId,edgeSet)[direction];
    const y=resolvedLaneCenterY(d,armId,direction,role,laneIndex,x,edgeSet);
    if(y===null||!Number.isFinite(y))return null;
    return world(junction,rotate({x,y},armTurn(d,armId)));
  }catch{return null;}
}
export function connectorReviewGeometry(
  junction:JunctionInstance,bindings:ConnectorLegBinding[],overrides:ConnectorOverride[]=[]
):ConnectorReview{
  const resolved=resolveConnectorOverrides(junction.design,bindings,overrides);
  const legs=new Map(bindings.map(b=>[b.armId,b.leg]));
  const lines=resolved.connections.flatMap(c=>{
    const from=legs.get(c.from.armId),to=legs.get(c.to.armId);
    if(!from||!to)return[];
    return [{
      id:c.id,movement:c.movement,origin:c.origin,
      from:{leg:from,role:c.from.role,laneIndex:c.from.laneIndex},
      to:{leg:to,role:c.to.role,laneIndex:c.to.laneIndex},
      start:world(junction,c.fromPoint),end:world(junction,c.toPoint)
    }];
  });
  return {lines,elevation:junction.z??0,issues:resolved.issues.map(i=>i.message),
    unresolved:resolved.issues.filter(i=>i.kind==='manual-review').length};
}
export function connectorReviewTargets(
  junction:JunctionInstance,bindings:ConnectorLegBinding[],from:ConnectorLaneRef,movement:AutoTurn
):ConnectorReviewTarget[]{
  const fromArm=bindings.find(b=>b.leg===from.leg)?.armId;
  if(fromArm===undefined)return[];
  return eligibleTurnTargets(junction.design,fromArm,movement).flatMap(armId=>{
    const leg=bindings.find(b=>b.armId===armId)?.leg;
    return leg?configuredArrowLanes(junction.design.arms[armId],'outgoing').flatMap(l=>{
      const point=connectorLaneWorldPoint(junction,armId,'outgoing',l.role,l.laneIndex);
      return point?[{ref:{leg,role:l.role,laneIndex:l.laneIndex},point}]:[];
    }):[];
  });
}
