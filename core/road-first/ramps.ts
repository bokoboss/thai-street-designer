// Phase 4B-1 — ramps drawn by hand. A ramp is a one-way road (role 'ramp') whose ends may attach to the side of
// another road: its start diverges from that road, its end merges into it. The attachment (anchor) is stored on
// the ramp as road + station + side; the ramp end point is kept on the edge of the travelled way, so the main road
// stays one continuous road (no junction) and every consumer reads ordinary road geometry.
import {resolveAlignment,type AlignmentMode} from '../common/resolved-alignment';
import type {WorldPoint} from '../network/network-project';
import {detectCandidates,pointAt,stations,type Decision,type Road,type RoadSection,type RoadPoint} from './derive';
import {levelAt,type Profile} from './elevation';

/** side: 1 = the forward-lane side of the main road (positive offset, left of its drawing direction on the plan), -1 = the backward-lane side. */
export type RampAnchor={roadId:string;station:number;side:1|-1};
export type RampEnd='start'|'end';
/** Starting section of a ramp: one lane, one way. Tool value, editable. */
export const RAMP_SECTION:RoadSection={forwardLanes:1,backwardLanes:0,laneWidth:3.5,median:0,walk:0};
/**
 * Tool values for attaching a ramp (TO_VERIFY against the design manual chosen for the project, Phase 4E):
 * maxAngle — steeper ends are ordinary junctions; capture — how far outside the edge an end still attaches;
 * spacing — closest two attachments on one side of a road; junctionClear — closest attachment to a junction;
 * taper — length of the taper drawn at an attachment.
 */
export const RAMP_RULES={maxAngle:25,capture:3,spacing:20,junctionClear:40,taper:30};

const EPS=1e-6;
const round=(v:number,d=6)=>Math.round(v*10**d)/10**d;
const sideLanes=(s:RoadSection,side:1|-1)=>side===1?s.forwardLanes:s.backwardLanes;
/** Offset of the travelled-way edge (median half + lanes + bands) on one side of a road. */
export function edgeOffset(s:RoadSection,side:1|-1){return s.median/2+sideLanes(s,side)*s.laneWidth+(s.bands??[]).reduce((t,b)=>t+b.width,0);}

/** Nearest point of a polyline: station, distance, unit tangent there. */
export function project(points:RoadPoint[],p:WorldPoint,mode:AlignmentMode='chord'){
  if(mode==='arc')return resolveAlignment(points).project(p);
  const s=stations(points);let best={station:0,distance:Infinity,point:points[0],tangent:{x:1,y:0}};
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
    const q={x:a.x+dx*t,y:a.y+dy*t},d=Math.hypot(p.x-q.x,p.y-q.y),l=Math.sqrt(l2);
    if(d<best.distance-EPS)best={station:s[i]+t*l,distance:d,point:q,tangent:{x:dx/l,y:dy/l}};
  }
  return best;
}
function tangentAt(points:RoadPoint[],station:number,mode:AlignmentMode='chord'){
  if(mode==='arc')return resolveAlignment(points).tangentAt(station);
  const s=stations(points);
  for(let i=0;i<points.length-1;i++)if(station<=s[i+1]+EPS||i===points.length-2){const dx=points[i+1].x-points[i].x,dy=points[i+1].y-points[i].y,l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};}
  return{x:1,y:0};
}
/** Where an anchored ramp end sits: on the travelled-way edge of the main road at the anchor station. */
export function anchorPoint(main:Road,a:RampAnchor):WorldPoint{
  const c=pointAt(main.points,a.station,main.alignment),t=tangentAt(main.points,a.station,main.alignment),o=edgeOffset(main.section,a.side)*a.side;
  return{x:round(c.x+t.y*o),y:round(c.y-t.x*o)};
}
const endIndex=(r:Road,end:RampEnd)=>end==='start'?0:r.points.length-1;
const nextIndex=(r:Road,end:RampEnd)=>end==='start'?1:r.points.length-2;

/** An anchor for a ramp end that lies on or just beside another road at a shallow angle, else null. */
export function detectAnchor(roads:Road[],ramp:Road,end:RampEnd):RampAnchor|null{
  const p=ramp.points[endIndex(ramp,end)],q=ramp.points[nextIndex(ramp,end)];let best:{a:RampAnchor;d:number}|null=null;
  for(const main of roads){
    if(main.id===ramp.id||main.points.length<2)continue;
    const f=project(main.points,p,main.alignment),v={x:q.x-f.point.x,y:q.y-f.point.y},vl=Math.hypot(v.x,v.y);if(vl<EPS)continue;
    const cross=f.tangent.x*v.y-f.tangent.y*v.x,side:1|-1=cross>0?-1:1; // left of travel on a y-down plan = negative cross
    if(f.distance>edgeOffset(main.section,side)+RAMP_RULES.capture)continue;
    const angle=Math.acos(Math.min(1,Math.abs(f.tangent.x*v.x+f.tangent.y*v.y)/vl))*180/Math.PI;
    if(angle>RAMP_RULES.maxAngle)continue;
    const total=stations(main.points,main.alignment).at(-1)!;if(f.station<EPS||f.station>total-EPS)continue; // a road end is a continuation, not a side
    if(!best||f.distance<best.d)best={a:{roadId:main.id,station:round(f.station,3),side},d:f.distance};
  }
  return best?.a??null;
}

/** Profile with its start or end point set to z (the ramp end takes the main road level). */
function withEndLevel(profile:Profile|undefined,total:number,end:RampEnd,z:number):Profile|undefined{
  const now=levelAt(profile,end==='start'?0:total);if(Math.abs(now-z)<.005)return profile;
  const rest=(profile??[]).filter(p=>end==='start'?p.station>.01:p.station<total-.01);
  if(!profile?.length)return end==='start'?[{station:0,z},{station:round(total,3),z:0}]:[{station:0,z:0},{station:round(total,3),z}];
  return end==='start'?[{station:0,z},...rest]:[...rest,{station:round(total,3),z}];
}

/**
 * Keep ramp anchors and ramp ends consistent after an edit. A ramp end that the edit moved (or a new ramp) is
 * attached afresh; an untouched anchored end follows its main road at the same station. remap (the main road's
 * stations shifted: extended at its start, or joined with another road, possibly reversed): the station is found
 * again from the old attachment point instead. joined: road id merged into another.
 */
export function reattachRamps(before:Road[],after:Road[],opts:{joined?:{from:string;into:string};remap?:boolean}={}):Road[]{
  const {joined,remap}=opts;
  const old=new Map(before.map(r=>[r.id,r])),byId=new Map(after.map(r=>[r.id,r]));
  return after.map(road=>{
    if(road.role!=='ramp'&&!road.anchors)return road;
    const r=structuredClone(road),prev=old.get(r.id);
    if(r.role!=='ramp'){delete r.anchors;return r;}
    for(const end of ['start','end'] as const){
      const i=endIndex(r,end);
      let a:RampAnchor|null|undefined=r.anchors?.[end];
      if(!prev||prev.role!=='ramp'||movedEnd(prev,r,end))a=detectAnchor(after,r,end);
      else if(a){
        const was=old.get(a.roadId),id=byId.has(a.roadId)?a.roadId:joined?.from===a.roadId?joined.into:null,main=id?byId.get(id):undefined;
        if(!main||!was)a=null;
        else if(!remap)a={...a,station:Math.min(a.station,round(stations(main.points,main.alignment).at(-1)!,3))};
        else{
          const foot=pointAt(was.points,a.station,was.alignment),t0=tangentAt(was.points,a.station,was.alignment),f=project(main.points,foot,main.alignment),flip=t0.x*f.tangent.x+t0.y*f.tangent.y<0;
          a={roadId:main.id,station:round(f.station,3),side:(flip?-a.side:a.side) as 1|-1};
        }
      }
      if(a){r.anchors={...r.anchors,[end]:a};const main=byId.get(a.roadId)!;r.points[i]={...r.points[i],...anchorPoint(main,a)};}
      else if(r.anchors){delete r.anchors[end];}
    }
    if(r.anchors&&!r.anchors.start&&!r.anchors.end)delete r.anchors;
    // The attached ends take the main road level.
    for(const end of ['start','end'] as const){
      const a=r.anchors?.[end];if(!a)continue;
      const main=byId.get(a.roadId)!,z=levelAt(main.profile,a.station),total=stations(r.points,r.alignment).at(-1)!,next=withEndLevel(r.profile,total,end,z);
      if(next)r.profile=next;
    }
    return r;
  });
}
function movedEnd(prev:Road,next:Road,end:RampEnd){
  const a=prev.points[endIndex(prev,end)],b=next.points[endIndex(next,end)];return Math.hypot(a.x-b.x,a.y-b.y)>EPS;
}

/** The first reason a ramp attachment cannot be built, or null. Checked on every edit (red preview while drawing). */
export function rampError(roads:Road[],decisions:Decision[]):string|null{
  const byId=new Map(roads.map(r=>[r.id,r])),placed:{roadId:string;side:number;station:number;ramp:string}[]=[];
  const junctionStations=(roadId:string)=>detectCandidates(roads).filter(c=>decisions.some(d=>d.candidateId===c.id&&d.decision==='junction'))
    .flatMap(c=>c.roads.filter(x=>x.roadId===roadId).map(x=>x.station));
  for(const r of roads){
    if(!r.anchors)continue;
    for(const end of ['start','end'] as const){
      const a=r.anchors[end];if(!a)continue;
      const main=byId.get(a.roadId);if(!main)return `จุดเชื่อม ${r.name} อ้างถนนที่ไม่มีแล้ว`;
      if(r.section.backwardLanes>0)return `${r.name} ต่อเข้าข้างถนน ${main.name} จึงต้องเป็นทางเดียว (ช่องขากลับ 0)`;
      if(sideLanes(main.section,a.side)<1)return `${main.name} ไม่มีช่องจราจรด้านที่ ${r.name} ต่อเข้า`;
      // Traffic on that side of the main road runs along the road (side 1) or against it (side -1).
      const t=tangentAt(main.points,a.station,main.alignment),flow={x:t.x*a.side,y:t.y*a.side},p=r.points[endIndex(r,end)],q=r.points[nextIndex(r,end)];
      const go=end==='start'?{x:q.x-p.x,y:q.y-p.y}:{x:p.x-q.x,y:p.y-q.y};
      if(go.x*flow.x+go.y*flow.y<=0)return `${r.name} วิ่งสวนทิศจราจรของ ${main.name} ที่จุด${end==='start'?'แยกออก':'เข้าสู่'} — วาดจากต้นทางไปปลายทางตามทิศรถ หรือต่อเข้าอีกฝั่งของถนน`;
      const near=junctionStations(main.id).find(s=>Math.abs(s-a.station)<RAMP_RULES.junctionClear);
      if(near!==undefined)return `จุด${end==='start'?'แยกออก':'เข้าสู่'}ของ ${r.name} ใกล้ทางแยกบน ${main.name} เกินไป (${Math.abs(near-a.station).toFixed(0)} ม. · ค่าเครื่องมือ ${RAMP_RULES.junctionClear} ม.)`;
      const other=placed.find(x=>x.roadId===a.roadId&&x.side===a.side&&Math.abs(x.station-a.station)<RAMP_RULES.spacing);
      if(other)return `${r.name} ใกล้จุดเชื่อมทางลาด ${other.ramp} บน ${main.name} เกินไป (${Math.abs(other.station-a.station).toFixed(0)} ม. · ค่าเครื่องมือ ${RAMP_RULES.spacing} ม.)`;
      placed.push({roadId:a.roadId,side:a.side,station:a.station,ramp:r.name});
    }
  }
  return null;
}

/** Undo-label suffix for the attachments a ramp has after an edit. */
export function anchorNote(roads:Road[],ramp:Road|undefined):string{
  if(!ramp?.anchors)return '';
  const name=(id:string)=>roads.find(r=>r.id===id)?.name??id;
  return [ramp.anchors.start&&`แยกออกจาก ${name(ramp.anchors.start.roadId)}`,ramp.anchors.end&&`เข้าสู่ ${name(ramp.anchors.end.roadId)}`].filter(Boolean).map(s=>` · ${s}`).join('');
}

/** Taper drawn at an attachment: from the main road edge a taper length away to the ramp end's outer corner. */
export function taperPolygon(main:Road,ramp:Road,end:RampEnd):WorldPoint[]{
  const a=ramp.anchors?.[end];if(!a)return[];
  const total=stations(main.points,main.alignment).at(-1)!,t=tangentAt(main.points,a.station,main.alignment),dir=a.side*(end==='start'?-1:1);
  const far=anchorPoint(main,{...a,station:Math.max(0,Math.min(total,a.station+dir*RAMP_RULES.taper))});
  const p=ramp.points[endIndex(ramp,end)],q=ramp.points[nextIndex(ramp,end)],dx=q.x-p.x,dy=q.y-p.y,l=Math.hypot(dx,dy)||1,h=(ramp.section.forwardLanes+ramp.section.backwardLanes)*ramp.section.laneWidth/2;
  // The ramp-end corner away from the main road (normal pointing off the main road).
  const nx=-dy/l,ny=dx/l,away=(nx*t.y-ny*t.x)*a.side>=0?1:-1,corner={x:p.x+nx*h*away,y:p.y+ny*h*away},inner={x:p.x-nx*h*away,y:p.y-ny*h*away};
  return[far,corner,p,inner].map(v=>({x:round(v.x,3),y:round(v.y,3)}));
}

/** Where an attachment is and which way traffic runs there (for the direction arrows on the plan). */
export function anchorFlow(main:Road,a:RampAnchor):{point:WorldPoint;dir:WorldPoint}{
  const t=tangentAt(main.points,a.station,main.alignment);
  return{point:anchorPoint(main,a),dir:{x:t.x*a.side,y:t.y*a.side}};
}
