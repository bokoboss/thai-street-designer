import type {Design,Arm} from './model';
import {sectionFor} from './model';
import type {SlipLane} from './slip-model';
import {
  angleGap,armMouth,armTreatmentOrigins,cornerArc,edges,innerEdge,offset,rotate,selfIntersects,
  type Edge,type P
} from './geometry';

export type SlipGeometry={
  id:string;
  fromArm:number;
  toArm:number;
  gap:number;
  entryX:number;
  exitX:number;
  centerline:P[];
  outerCurve:P[];
  innerCurve:P[];
  pavement:P[];
  sidewalk:P[];
  island:P[];
  approachPavement:P[];
  approachDivider:P[];
  departurePavement:P[];
  departureDivider:P[];
  gore:P[];
  raisedSeparator:P[];
  fullEnd:number;
  mergeEnd:number;
  arrow:P;
};

const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>{const q=Math.max(0,Math.min(1,t));return q*q*(3-2*q);};
const sampleXs=(start:number,end:number,n=32)=>Array.from({length:n+1},(_,i)=>mix(start,end,i/n));

function mainOuter(a:Arm,dir:'incoming'|'outgoing',x:number,origins:ReturnType<typeof armTreatmentOrigins>){
  if(dir==='incoming')return innerEdge(a,1,x,origins)+sectionFor(a,'incoming').width*a.incoming;
  return innerEdge(a,-1,x,origins)-sectionFor(a,'outgoing').width*a.outgoing;
}

function radialHit(ps:P[],p:P):P{
  const angle=Math.atan2(p.y,p.x),ux=Math.cos(angle),uy=Math.sin(angle);
  let best={x:0,y:0},radius=0;
  for(let i=1;i<ps.length;i++){
    const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,den=dx*uy-dy*ux;
    if(Math.abs(den)<1e-8)continue;
    const t=(a.y*ux-a.x*uy)/den;
    if(t<0||t>1)continue;
    const hit={x:a.x+t*dx,y:a.y+t*dy},r=hit.x*ux+hit.y*uy;
    if(r>radius){radius=r;best=hit;}
  }
  return best;
}

function stripPolygon(
  inner:(x:number)=>number,
  start:number,
  fullEnd:number,
  taperEnd:number,
  side:1|-1,
  width:number,
  transform:(p:P)=>P=(p=>p)
){
  const xs=sampleXs(start,taperEnd);
  const factor=(x:number)=>x<=fullEnd?1:Math.max(0,1-(x-fullEnd)/Math.max(.001,taperEnd-fullEnd));
  const inside=xs.map(x=>transform({x,y:inner(x)}));
  const outside=xs.slice().reverse().map(x=>transform({x,y:inner(x)+side*width*factor(x)}));
  return [...inside,...outside];
}

function lineAt(inner:(x:number)=>number,start:number,end:number,transform:(p:P)=>P=(p=>p)){
  return sampleXs(start,end,24).map(x=>transform({x,y:inner(x)}));
}

export function slipGeometries(d:Design,baseEdges=edges(d)):SlipGeometry[]{
  if(d.type==='roundabout')return[];
  const out:SlipGeometry[]=[];
  for(const s of d.slips){
    const source=d.arms[s.fromArm],target=d.arms[s.toArm];
    const edge=baseEdges.find(e=>e.i===s.fromArm&&e.next===s.toArm);
    if(!source||!target||!edge||!source.incoming||!target.outgoing)continue;
    const gapQuarter=angleGap(d,s.fromArm,s.toArm)/90,g=gapQuarter*Math.PI/2;
    if(g>=Math.PI-.08)continue;
    const sourceOrigins=armTreatmentOrigins(d,s.fromArm,baseEdges),targetOrigins=armTreatmentOrigins(d,s.toArm,baseEdges),
      sourceMouth=armMouth(d,s.fromArm),targetMouth=armMouth(d,s.toArm),
      sourceMainOuter=mainOuter(source,'incoming',sourceMouth,sourceOrigins),
      targetMainOuter=mainOuter(target,'outgoing',targetMouth,targetOrigins),
      sourceMainWidth=sectionFor(source,'incoming').width,targetMainWidth=sectionFor(target,'outgoing').width,
      approachCenter=s.approach.mode==='auxiliary'?sourceMainOuter+s.approach.width/2:sourceMainOuter-sourceMainWidth/2,
      departureCenter=s.departure.mode==='direct'?targetMainOuter+targetMainWidth/2
        :s.departure.mode==='shared-aux'?targetMainOuter-s.departure.width/2
        :targetMainOuter-s.departure.separatorWidth-s.departure.width/2,
      radius=Math.max(s.radius,s.width/2+.5),
      arc=cornerArc(approachCenter,departureCenter,g,radius),
      centerline=arc.points,
      outerCurve=arc.points.map((_,j)=>arc.polar(radius-s.width/2,j/80)),
      innerCurve=arc.points.map((_,j)=>arc.polar(radius+s.width/2,j/80)),
      entryX=centerline[0].x,
      exitLocal=rotate(centerline.at(-1)!,-gapQuarter),
      exitX=exitLocal.x,
      pavement=[...outerCurve,...innerCurve.slice().reverse()],
      walkOuter=offset(outerCurve,sectionFor(source,'incoming').walk,sectionFor(target,'outgoing').walk),
      sidewalk=[...outerCurve,...walkOuter.slice().reverse()];

    const pairs=innerCurve.map(p=>({p,b:radialHit(edge.base,p)}))
      .filter(({p,b})=>Math.hypot(b.x,b.y)>1&&Math.hypot(p.x,p.y)-Math.hypot(b.x,b.y)>.35);
    const island=pairs.length>3?[...pairs.map(v=>v.p),...pairs.map(v=>v.b).reverse()]:[];

    let approachPavement:P[]=[],approachDivider:P[]=[];
    if(s.approach.mode==='auxiliary'){
      const fullEnd=Math.min(source.length,entryX+s.approach.storage),taperEnd=Math.min(source.length,fullEnd+s.approach.taper),
        inner=(x:number)=>mainOuter(source,'incoming',x,sourceOrigins);
      approachPavement=stripPolygon(inner,entryX,fullEnd,taperEnd,1,s.approach.width);
      approachDivider=lineAt(inner,entryX,taperEnd);
    }

    let departurePavement:P[]=[],departureDivider:P[]=[],gore:P[]=[],raisedSeparator:P[]=[],fullEnd=exitX,mergeEnd=exitX;
    const rot=(p:P)=>rotate(p,gapQuarter),targetOuter=(x:number)=>mainOuter(target,'outgoing',x,targetOrigins);
    if(s.departure.mode==='shared-aux'){
      const start=targetMouth;
      fullEnd=Math.min(target.length,start+s.departure.length);
      mergeEnd=Math.min(target.length,fullEnd+s.departure.taper);
      departurePavement=stripPolygon(targetOuter,start,fullEnd,mergeEnd,-1,s.departure.width,rot);
      departureDivider=lineAt(targetOuter,start,mergeEnd,rot);
    }else if(s.departure.mode==='acceleration'){
      fullEnd=Math.min(target.length,exitX+s.departure.length);
      mergeEnd=Math.min(target.length,fullEnd+s.departure.merge);
      const goreLength=Math.min(s.departure.length,Math.max(8,Math.min(18,s.departure.length*.35))),
        goreEnd=Math.min(target.length,exitX+goreLength),
        sep=(x:number)=>x>=goreEnd?0:s.departure.separatorWidth*(1-smooth((x-exitX)/Math.max(.001,goreEnd-exitX))),
        laneFactor=(x:number)=>x<=fullEnd?1:Math.max(0,1-(x-fullEnd)/Math.max(.001,mergeEnd-fullEnd)),
        xs=sampleXs(exitX,mergeEnd),
        innerLine=(x:number)=>targetOuter(x)-sep(x),
        outside=xs.slice().reverse().map(x=>rot({x,y:innerLine(x)-s.departure.width*laneFactor(x)}));
      departurePavement=[...xs.map(x=>rot({x,y:targetOuter(x)})),...outside];
      departureDivider=sampleXs(goreEnd,mergeEnd,24).map(x=>rot({x,y:targetOuter(x)}));
      const gx=sampleXs(exitX,goreEnd,16),
        gp=[...gx.map(x=>rot({x,y:targetOuter(x)})),...gx.slice().reverse().map(x=>rot({x,y:targetOuter(x)-sep(x)}))];
      if(s.departure.separator==='raised')raisedSeparator=gp;else gore=gp;
    }

    const total=polylineLength(centerline),arrowStation=Math.max(2,Math.min(s.arrowOffset??total/2,Math.max(2,total-2))),
      arrow=pointAlong(centerline,arrowStation).point;
    out.push({
      id:s.id,fromArm:s.fromArm,toArm:s.toArm,gap:gapQuarter,entryX,exitX,
      centerline,outerCurve,innerCurve,pavement,sidewalk,island,
      approachPavement,approachDivider,departurePavement,departureDivider,gore,raisedSeparator,
      fullEnd,mergeEnd,arrow
    });
  }
  return out;
}

export function slipGeometryForArm(d:Design,fromArm:number,baseEdges=edges(d)){
  return slipGeometries(d,baseEdges).find(s=>s.fromArm===fromArm);
}

export function polylineLength(ps:P[]){
  let n=0;for(let i=1;i<ps.length;i++)n+=Math.hypot(ps[i].x-ps[i-1].x,ps[i].y-ps[i-1].y);return n;
}

export function pointAlong(ps:P[],station:number){
  if(!ps.length)return{point:{x:0,y:0},tangent:{x:1,y:0},station:0};
  const total=polylineLength(ps),s=Math.max(0,Math.min(total,station));let acc=0;
  for(let i=1;i<ps.length;i++){
    const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;
    if(acc+l>=s){const t=(s-acc)/l;return{point:{x:a.x+dx*t,y:a.y+dy*t},tangent:{x:dx/l,y:dy/l},station:s};}
    acc+=l;
  }
  const a=ps[Math.max(0,ps.length-2)],b=ps.at(-1)!,dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;
  return{point:b,tangent:{x:dx/l,y:dy/l},station:s};
}

function offsetAt(ps:P[],station:number,lateral:number){
  const q=pointAlong(ps,station),n={x:q.tangent.y,y:-q.tangent.x};
  return{x:q.point.x+n.x*lateral,y:q.point.y+n.y*lateral};
}

function projectStation(ps:P[],p:P){
  let best=0,bestD=Infinity,acc=0;
  for(let i=1;i<ps.length;i++){
    const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,l=Math.sqrt(l2)||1,
      t=Math.max(0,Math.min(1,l2?((p.x-a.x)*dx+(p.y-a.y)*dy)/l2:0)),
      x=a.x+t*dx,y=a.y+t*dy,dist=(p.x-x)**2+(p.y-y)**2;
    if(dist<bestD){bestD=dist;best=acc+t*l;}acc+=l;
  }
  return best;
}

export function slipCrossLimit(g:SlipGeometry|undefined){
  const length=g?polylineLength(g.centerline):20;
  return Math.max(2,Math.min(600,Math.floor(length-2)));
}

export function slipArcState(g:SlipGeometry,s:SlipLane){
  const centerLength=Math.max(.001,polylineLength(g.centerline)),inner=-s.width/2,outer=s.width/2,
    crossOffset=Math.max(2,Math.min(s.crossing.offset,Math.max(2,centerLength-2))),crossT=centerLength-crossOffset,
    arrowOffset=Math.max(2,Math.min(s.arrowOffset??centerLength/2,Math.max(2,centerLength-2))),arrowT=arrowOffset,
    point=(lateral:number,station:number)=>offsetAt(g.centerline,Math.max(0,Math.min(centerLength,station)),lateral),
    crossHalf=1.6,stopT=Math.max(.2,crossT-crossHalf-1.5),
    crossPoint=pointAlong(g.centerline,crossT).point,arrowState=pointAlong(g.centerline,arrowT),arrowPoint=arrowState.point,
    arrowAngle=(Math.atan2(arrowState.tangent.y,arrowState.tangent.x)*180/Math.PI+360)%360;
  return{inner,outer,centerLength,crossOffset,crossT,arrowOffset,arrowT,crossHalf,stopT,point,crossPoint,arrowPoint,arrowAngle};
}

export function slipOffsetAtPoint(g:SlipGeometry,p:P,kind:'crossing'|'arrow'){
  const length=Math.max(.001,polylineLength(g.centerline)),station=projectStation(g.centerline,p);
  return kind==='crossing'?length-station:station;
}

export function slipSectionAt(d:Design,armId:number,x:number,baseEdges=edges(d),geometries=slipGeometries(d,baseEdges)){
  const pieces:{group:'incoming'|'outgoing';kind:'slip-aux'|'slip-accel'|'separator';width:number;sourceArm:number}[]=[];
  const source=d.slips.find(s=>s.fromArm===armId),sourceGeom=source?geometries.find(g=>g.id===source.id):undefined;
  if(source&&sourceGeom&&source.approach.mode==='auxiliary'){
    const fullEnd=sourceGeom.entryX+source.approach.storage,taperEnd=fullEnd+source.approach.taper;
    if(x>=sourceGeom.entryX&&x<=taperEnd){
      const factor=x<=fullEnd?1:Math.max(0,1-(x-fullEnd)/Math.max(.001,taperEnd-fullEnd));
      if(factor>1e-6)pieces.push({group:'incoming',kind:'slip-aux',width:source.approach.width*factor,sourceArm:source.fromArm});
    }
  }
  const receiving=d.slips.find(s=>s.toArm===armId),receivingGeom=receiving?geometries.find(g=>g.id===receiving.id):undefined;
  if(receiving&&receivingGeom){
    if(receiving.departure.mode==='shared-aux'){
      const start=armMouth(d,armId),fullEnd=start+receiving.departure.length,taperEnd=fullEnd+receiving.departure.taper;
      if(x>=start&&x<=taperEnd){
        const factor=x<=fullEnd?1:Math.max(0,1-(x-fullEnd)/Math.max(.001,taperEnd-fullEnd));
        if(factor>1e-6)pieces.push({group:'outgoing',kind:'slip-aux',width:receiving.departure.width*factor,sourceArm:receiving.fromArm});
      }
    }else if(receiving.departure.mode==='acceleration'&&x>=receivingGeom.exitX&&x<=receivingGeom.mergeEnd){
      const factor=x<=receivingGeom.fullEnd?1:Math.max(0,1-(x-receivingGeom.fullEnd)/Math.max(.001,receivingGeom.mergeEnd-receivingGeom.fullEnd));
      const goreLength=Math.min(receiving.departure.length,Math.max(8,Math.min(18,receiving.departure.length*.35))),
        goreEnd=receivingGeom.exitX+goreLength,
        sep=x>=goreEnd?0:receiving.departure.separatorWidth*(1-smooth((x-receivingGeom.exitX)/Math.max(.001,goreEnd-receivingGeom.exitX)));
      if(sep>1e-6)pieces.push({group:'outgoing',kind:'separator',width:sep,sourceArm:receiving.fromArm});
      if(factor>1e-6)pieces.push({group:'outgoing',kind:'slip-accel',width:receiving.departure.width*factor,sourceArm:receiving.fromArm});
    }
  }
  return pieces;
}

export function slipDesignError(d:Design,baseEdges=edges(d)){
  if(d.type==='roundabout'&&d.slips.length)return 'Slip lane ใช้กับทางแยกทั่วไปในรุ่นนี้';
  const geoms=slipGeometries(d,baseEdges);
  if(geoms.length!==d.slips.length)return 'Geometry Error — Slip lane เชื่อมขาถนนไม่ถูกต้อง';
  for(const s of d.slips){
    const g=geoms.find(x=>x.id===s.id)!;
    const source=d.arms[s.fromArm],target=d.arms[s.toArm];
    if(!d.enabled[s.fromArm]||!d.enabled[s.toArm]||!source.incoming||!target.outgoing)return 'Slip lane ต้องเชื่อมจากขาเข้าที่มีเลนไปยังขาออกที่มีเลน';
    if(angleGap(d,s.fromArm,s.toArm)>=175)return 'Slip lane ใช้ได้เฉพาะมุมเลี้ยวที่เหมาะสม';
    if(g.entryX<0||g.exitX<0||g.entryX>source.length-6||g.exitX>target.length-6)return 'พื้นที่ Slip lane ไม่พอ — เพิ่มความยาวขาถนนหรือลดรัศมี';
    if(g.island.length<4||selfIntersects(g.pavement)||selfIntersects(g.island))return 'Geometry Error — Slip lane หรือเกาะ channelizing ตัดกัน';
    if(s.approach.mode==='auxiliary'&&g.entryX+s.approach.storage+s.approach.taper>source.length-2)return 'พื้นที่ Auxiliary lane ก่อน Slip ไม่พอ';
    if(s.departure.mode==='shared-aux'&&armMouth(d,s.toArm)+s.departure.length+s.departure.taper>target.length-2)return 'พื้นที่ Departure auxiliary หลังแยกไม่พอ';
    if(s.departure.mode==='shared-aux'&&g.exitX>armMouth(d,s.toArm)+s.departure.length)return 'Departure auxiliary สั้นเกินไปสำหรับรับรถจาก Slip';
    if(s.departure.mode==='acceleration'&&g.exitX+s.departure.length+s.departure.merge>target.length-2)return 'พื้นที่ Acceleration lane หลัง Slip ไม่พอ';
  }
  return null;
}
