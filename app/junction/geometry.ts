import {outerRadius,roundSettings,roundFillet,splitterPolygon,splitterHalfAt,roundDefaults} from './roundabout';
import {pocketFactor,medianEdges,innerEdge,bandWidths,corridorWarning} from './cross-section';
import {originFor,type TreatmentOrigins} from './allocation';
export {pocketFactor,medianEdges,innerEdge,bandWidths} from './cross-section';
import {valid,MAX_SLIP_CROSS_OFFSET,sectionFor,pocketsFor,pocketLaneWidth,type Direction} from './model';
import type {Arm,Design} from './model';
export type P={x:number;y:number};
export const activeIds=(d:Design)=>[0,1,2,3].filter(i=>d.enabled[i]).sort((a,b)=>d.arms[a].angle-d.arms[b].angle);
export const direction=(side:number):Direction=>side===1?'incoming':'outgoing';
export const extraWidth=(a:Arm,side:Direction='incoming')=>sectionFor(a,side).bands.reduce((sum,b)=>sum+b.width,0);
export const laneCount=(a:Arm,side:number)=>a[direction(side)]+pocketsFor(a,direction(side)).left.lanes+pocketsFor(a,direction(side)).right.lanes;
export function carriageWidth(a:Arm,side:number,x=0,origins:TreatmentOrigins=0){
 const d=direction(side),origin=originFor(origins,d),p=pocketsFor(a,d),s=sectionFor(a,d),
 leftWidth=pocketLaneWidth(a,d,'left'),rightWidth=pocketLaneWidth(a,d,'right');
 return s.width*a[d]+leftWidth*p.left.lanes*pocketFactor(p.left,x,origin)+rightWidth*p.right.lanes*pocketFactor(p.right,x,origin);
}
export const carBounds=(a:Arm,x=0,origins:TreatmentOrigins=0)=>[
 innerEdge(a,-1,x,origins)-carriageWidth(a,-1,x,origins),
 innerEdge(a,1,x,origins)+carriageWidth(a,1,x,origins)
];
export const bounds=(a:Arm,x=0,origins:TreatmentOrigins=0)=>{
 const b=carBounds(a,x,origins);
 return[
  b[0]-bandWidths(a,'outgoing',x,origins).reduce((s,v)=>s+v,0),
  b[1]+bandWidths(a,'incoming',x,origins).reduce((s,v)=>s+v,0)
 ];
};
export const laneY=(a:Arm,side:number,lane:number,x:number,origins:TreatmentOrigins)=>{
 const dir=direction(side),origin=originFor(origins,dir),p=pocketsFor(a,dir),w=sectionFor(a,dir).width,rightWidth=pocketLaneWidth(a,dir,'right');
 return innerEdge(a,side,x,origins)+side*(rightWidth*p.right.lanes*pocketFactor(p.right,x,origin)+w*(lane+.5));
};
/** Sample at exact taper breakpoints as well as regular intervals. */
export function approachSamples(a:Arm,origin:number,start:number,end:number){const xs=Array.from({length:41},(_,i)=>start+(end-start)*i/40);for(const d of ['incoming','outgoing'] as const)for(const p of Object.values(pocketsFor(a,d)))if(p.lanes)for(const x of [origin+p.length,origin+p.length+p.taper])if(x>Math.min(start,end)&&x<Math.max(start,end))xs.push(x);return [...new Set(xs)].sort((a,b)=>start<end?a-b:b-a);}
export const armTurn=(d:Design,i:number)=>d.arms[i].angle/90;
export const angleGap=(d:Design,i:number,j:number)=>(d.arms[j].angle-d.arms[i].angle+360)%360;
export const rotate=(p:P,i:number):P=>{const a=i*Math.PI/2;return{x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)}};
export const path=(ps:P[],close=false)=>ps.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(4)} ${p.y.toFixed(4)}`).join(' ')+(close?' Z':'');
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const cubic=(a:P,b:P,c:P,e:P,n=40)=>Array.from({length:n+1},(_,i)=>{const t=i/n,s=1-t;return{x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*e.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*c.y+t*t*t*e.y}});
const join=(...arr:P[][])=>arr.flatMap((a,i)=>i?a.slice(1):a);
export function cornerArc(hi:number,lo:number,g:number,r:number){
 const vx=(hi*Math.cos(g)-lo)/Math.sin(g),t=r/Math.tan(g/2),cx=vx+t,cy=hi+r,sweep=Math.PI-g;
 const polar=(rad:number,f:number)=>({x:cx-rad*Math.sin(f*sweep),y:cy-rad*Math.cos(f*sweep)});
 return {cx,cy,sweep,polar,points:Array.from({length:81},(_,i)=>polar(r,i/80))};
}
/** Longitudinal mouth of each approach, measured at its own two curb tangencies.
 * An acute corner affects only its two incident arms, never a shared node radius. */
export function armMouths(d:Design):number[]{
 if(d.type==='roundabout')return d.arms.map(()=>outerRadius(d));
 const mouths=d.arms.map(()=>0),ids=activeIds(d);
 ids.forEach((i,k)=>{const j=ids[(k+1)%ids.length],g=angleGap(d,i,j)*Math.PI/180,hi=bounds(d.arms[i])[1],lo=bounds(d.arms[j])[0];
 if(g>=Math.PI-.08){const reach=Math.max(hi,-lo)+d.corner;mouths[i]=Math.max(mouths[i],reach);mouths[j]=Math.max(mouths[j],reach);return;}
 const c=cornerArc(hi,lo,g,d.corner),end=rotate(c.points.at(-1)!,-g/(Math.PI/2));mouths[i]=Math.max(mouths[i],c.points[0].x);mouths[j]=Math.max(mouths[j],end.x);
 });return mouths;
}
export const armMouth=(d:Design,i:number)=>armMouths(d)[i];
/** Overall envelope is retained only for whole-junction bounds/roundabout geometry. */
export const coreSize=(d:Design)=>Math.max(...armMouths(d));
export function offset(ps:P[],w0:number,w1:number,startIndex=0,endIndex=ps.length-1){const ds=[0];for(let i=1;i<ps.length;i++)ds.push(ds[i-1]+Math.hypot(ps[i].x-ps[i-1].x,ps[i].y-ps[i-1].y));return ps.map((p,i)=>{const a=ps[Math.max(0,i-1)],b=ps[Math.min(ps.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,t=Math.max(0,Math.min(1,(ds[i]-ds[startIndex])/(ds[endIndex]-ds[startIndex]||1))),smooth=t*t*(3-2*t),w=mix(w0,w1,smooth);return{x:p.x+dy/l*w,y:p.y-dx/l*w};});}
function radialHit(ps:P[],p:P):P{const angle=Math.atan2(p.y,p.x),ux=Math.cos(angle),uy=Math.sin(angle);let best={x:0,y:0},radius=0;for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],dx=b.x-a.x,dy=b.y-a.y,den=dx*uy-dy*ux;if(Math.abs(den)<1e-8)continue;const t=(a.y*ux-a.x*uy)/den;if(t<0||t>1)continue;const hit={x:a.x+t*dx,y:a.y+t*dy},r=hit.x*ux+hit.y*uy;if(r>radius){radius=r;best=hit;}}return best;}
export type Edge={entryX:number;exitX:number;i:number;next:number;base:P[];outer:P[];walk:P[];island:P[];slip:boolean;arrow?:P;radius:number;sweep:number;cx:number;cy:number;};
export function edges(d:Design):Edge[]{const ids=activeIds(d),mouths=armMouths(d),core=coreSize(d),round=d.type==='roundabout',roundCfg=round?roundSettings(d):roundDefaults();return ids.map((i,k)=>{const next=ids[(k+1)%ids.length],a=d.arms[i],b=d.arms[next],gap=angleGap(d,i,next)/90,g=gap*Math.PI/2,hi=bounds(a)[1],nlo=bounds(b)[0];let base:P[],leadCount=0,trailCount=0,entryX=0,exitX=0;const originsA=treatmentOrigins(a,mouths[i],round,roundCfg),originA=originsA.incoming;const lead=(target:P)=>{const ps=approachSamples(a,originA,a.length,target.x).map(x=>({x,y:bounds(a,x,originsA)[1]}));leadCount=ps.length;entryX=target.x;return ps;},trail=(target:P)=>{const local=rotate(target,-gap),originsB={incoming:stopPosition(b,mouths[next]),outgoing:local.x};const ps=approachSamples(b,local.x,local.x,b.length).map(x=>rotate({x,y:bounds(b,x,originsB)[0]},gap));trailCount=ps.length;exitX=local.x;return ps;};
if(round){const settings=roundCfg,entry=roundFillet(core,hi,settings.entryRadius),exit=roundFillet(core,-nlo,settings.exitRadius),ta=entry.theta,tb=g-exit.theta;
 const arc=Array.from({length:81},(_,j)=>{const t=mix(ta,tb,j/80);return{x:core*Math.cos(t),y:core*Math.sin(t)}}),exitPoints=exit.points.map(p=>rotate({x:p.x,y:-p.y},gap)).reverse();
 base=join(lead(entry.points[0]),entry.points,arc,exitPoints,trail(exitPoints.at(-1)!));}

else if(g<Math.PI-.08){const arc=cornerArc(hi,nlo,g,d.corner).points;base=join(lead(arc[0]),arc,trail(arc.at(-1)!));}
else {const p={x:mouths[i],y:hi},q=rotate({x:mouths[next],y:nlo},gap);base=join(lead(p),cubic(p,{x:0,y:hi},rotate({x:0,y:nlo},gap),q),trail(q));}
const slip=a.slip&&g<Math.PI-.08&&a.incoming>0&&b.outgoing>0;let outer=base,island:P[]=[],arrow:P|undefined,R=0,cx=0,cy=0;const sweep=Math.PI-g;
if(slip){const w=a.slipWidth;R=Math.max(a.slipRadius,d.corner+3.6*w,round?(core/Math.sin(g/2)+w+3):0);
 const arc=cornerArc(hi,nlo,g,R);cx=arc.cx;cy=arc.cy;
 outer=join(lead(arc.points[0]),arc.points,trail(arc.points.at(-1)!));
 const inside=arc.points.map((_,j)=>arc.polar(R+w,j/80));
 const pairs=inside.map(p=>({p,b:radialHit(base,p)})).filter(({p,b})=>Math.hypot(b.x,b.y)>1&&Math.hypot(p.x,p.y)-Math.hypot(b.x,b.y)>.45);
 if(pairs.length>3)island=[...pairs.map(v=>v.p),...pairs.map(v=>v.b).reverse()];arrow=arc.polar(R+w/2,.5);}
const walk=offset(outer,sectionFor(a,'incoming').walk,sectionFor(b,'outgoing').walk,leadCount-1,outer.length-trailCount).map((p,k)=>{if(k>leadCount-1&&k<outer.length-trailCount)return p;const first=k<=leadCount-1,arm=first?a:b,side=first?1:-1,origins=first?originsA:{incoming:stopPosition(b,mouths[next]),outgoing:exitX},q=first?outer[k]:rotate(outer[k],-gap),idx=first?1:0,w=sectionFor(arm,direction(side)).walk,slope=(bounds(arm,q.x+.001,origins)[idx]-bounds(arm,q.x-.001,origins)[idx])/.002,n=Math.hypot(1,slope),v={x:q.x-side*slope*w/n,y:q.y+side*w/n};return first?v:rotate(v,gap);});return{entryX,exitX,i,next,base,outer,walk,island,slip,arrow,radius:R,sweep,cx,cy};});}

export function armTreatmentOrigins(d:Design,i:number,segments=edges(d)){
 const a=d.arms[i],mouth=armMouth(d,i),incoming=stopPosition(a,mouth),previous=segments.find(e=>e.next===i);
 return {incoming,outgoing:previous?.exitX??departurePosition(a,mouth,d.type==='roundabout',d.type==='roundabout'?roundSettings(d):roundDefaults())} as const;
}
export function designError(d:Design):string|null{if(!valid(d))return 'ข้อมูลแบบมีค่าที่ไม่รองรับ กรุณาตรวจตัวเลขและไฟล์แบบ';const ids=activeIds(d);for(let k=0;k<ids.length;k++){const g=angleGap(d,ids[k],ids[(k+1)%ids.length]);if(g<40)return 'ขาถนนชิดกันเกินไป — เว้นมุมอย่างน้อย 40°';}
 for(const i of ids){const warning=corridorWarning(d.arms[i]);if(warning)return warning;}
 if(d.type==='roundabout'){const R=outerRadius(d),s=roundSettings(d);for(const i of ids){const a=d.arms[i],b=d.arms[ids[(ids.indexOf(i)+1)%ids.length]],entry=roundFillet(R,bounds(a)[1],s.entryRadius),exit=roundFillet(R,-bounds(b)[0],s.exitRadius);if(!entry.valid||!exit.valid||entry.theta+exit.theta>=angleGap(d,i,ids[(ids.indexOf(i)+1)%ids.length])*Math.PI/180-.01)return 'Geometry Error — ทางเข้าวงเวียนซ้อนกัน เพิ่มรัศมีเกาะ ลดความกว้างถนน หรือเว้นมุมขามากขึ้น';if(R+s.splitterLength+6>a.length)return 'Geometry Error — ขาถนนสั้นเกินไปสำหรับ splitter island';if(s.splitterWidth>Math.min(bounds(a)[1],-bounds(a)[0])*2-2)return 'Geometry Error — splitter island กว้างเกินช่องทางเข้า/ออก';}}
 for(const i of ids)for(const o of d.arms[i].medianOpenings??[])if(armMouth(d,i)+o.start+o.length>d.arms[i].length-1)return 'ช่องเปิดยาวเกินขาถนน';
 const core=coreSize(d);if(!Number.isFinite(core)||core>80)return 'มุมและความกว้างนี้ทำให้ปากทางแยกกว้างเกินพื้นที่แบบ';
 const boundaries=edges(d);
 for(const i of ids){const a=d.arms[i],core=armMouth(d,i),origins=armTreatmentOrigins(d,i,boundaries);for(const side of [1,-1]){if(laneCount(a,side)<2)continue;const mode=side===1?a.dividerMode:(a.outgoingDividerMode??a.dividerMode),length=side===1?(a.solidLength??30):(a.outgoingSolidLength??a.solidLength??30),range=dividerRange(a,core,d.type==='roundabout',side,d.type==='roundabout'?roundSettings(d):roundDefaults(),origins.outgoing);if(a.length<Math.max(core+12,range.start+(mode==='dashed'?5:length+2)))return 'ขาถนนสั้นเกินไปสำหรับเส้นหยุดและช่วงเส้นแบ่งเลนที่กำหนด — เพิ่มความยาวหรือลดความยาวเส้นทึบ';}}

 for(const i of ids){const a=d.arms[i],origins=armTreatmentOrigins(d,i,boundaries);for(const dir of ['incoming','outgoing'] as const){const origin=originFor(origins,dir),p=pocketsFor(a,dir);if((p.left.lanes||p.right.lanes)&&!a[dir])return 'ต้องมีเลนหลักในทิศทางนี้ก่อนเพิ่ม Pocket / เลนรับ';for(const pocket of Object.values(p))if(pocket.lanes&&origin+pocket.length+pocket.taper>a.length-2)return dir==='incoming'?'พื้นที่เลนรอเลี้ยวไม่พอ — เพิ่มความยาวขาถนน หรือลด Storage / Taper':'พื้นที่เลนรับไม่พอ — เพิ่มความยาวขาถนน หรือลด Receiving length / Merge taper';}}
 for(const e of boundaries){for(const [id,dir,tangent] of [[e.i,'incoming',e.entryX],[e.next,'outgoing',e.exitX]] as const){const a=d.arms[id],origins=armTreatmentOrigins(d,id,boundaries),origin=originFor(origins,dir);for(const pocket of Object.values(pocketsFor(a,dir)))if(pocket.lanes&&origin+pocket.length<tangent+1)return dir==='incoming'?'ช่วงเต็มของเลนรอเลี้ยวอยู่ในโค้งทางแยก / Slip lane — เพิ่มความยาวช่วงเต็ม':'ช่วงเต็มของเลนรับสั้นกว่าพื้นที่ทางออก — เพิ่ม Receiving length';}if(e.slip){const a=d.arms[e.i],b=d.arms[e.next],c=cornerArc(bounds(a)[1],bounds(b)[0],angleGap(d,e.i,e.next)*Math.PI/180,e.radius),end=rotate(c.points.at(-1)!,-angleGap(d,e.i,e.next)/90);if(c.points[0].x>a.length-8||end.x>b.length-8||e.island.length<4)return 'พื้นที่ Slip lane ไม่พอ — เพิ่มความยาวขาถนน ลดรัศมี หรือปรับมุม';}}
 if(ids.some(i=>armIslands(d,i,boundaries).some(p=>selfIntersects(p))))return 'Geometry Error — ขอบเกาะตัดกัน กรุณาปรับหน้าตัดและช่วงสอบ';
 const footprint=boundaries.flatMap(e=>e.outer.map(p=>rotate(p,armTurn(d,e.i))));
 const walkFootprint=boundaries.flatMap(e=>e.walk.map(p=>rotate(p,armTurn(d,e.i))));
 if(selfIntersects(footprint)||selfIntersects(walkFootprint)||boundaries.some(e=>selfIntersects(e.base,false)||selfIntersects(e.walk,false)||selfIntersects(e.island)))return 'ขอบถนนหรือทางเท้าตัดกัน — เพิ่มมุมระหว่างขาถนน ปรับขนาดวงเวียน หรือความกว้างถนน';
 return null;}

export function crossingIntervals(a:Arm,core:number,round:boolean,settings=roundDefaults()){
 const x=core+a.crossOffset,start=round?core+.8:core+a.medianOffset,origins=treatmentOrigins(a,core,round,settings),
 profile=medianEdges(a,x+1.6,origins),ordinary=round&&x+3.2>=core+settings.splitterLength+2+a.medianOffset,
 half=round&&!ordinary?splitterHalfAt(x+1.6,core,settings):(profile[1]-profile[0])/2,
 split=round?half>0:(a.median>0&&start<=x+3.2),island=round&&!ordinary?[-half,half]:profile,road=bounds(a,x,origins);
 return{split,x,start,half,spans:split?[[road[0],island[0]],[island[1],road[1]]]:[road]};
}

export function stopPosition(a:Arm,core:number){return core+(a.crossing?a.crossOffset+4.5:(a.stopOffset??2));}
/** Departure-side reference for receiving lanes. Kept independent from the incoming stop/crossing datum. */
export function departurePosition(a:Arm,core:number,round=false,settings=roundDefaults()){
 if(!round)return core;
 const exit=roundFillet(core,Math.max(.1,-bounds(a)[0]),settings.exitRadius);
 return exit.valid?exit.cx:core+.8;
}
export function treatmentOrigins(a:Arm,core:number,round=false,settings=roundDefaults()){
 return {incoming:stopPosition(a,core),outgoing:departurePosition(a,core,round,settings)} as const;
}
export const STOP_LINE_WIDTH = .55;
export function dividerRange(a:Arm,core:number,round:boolean,side=1,settings=roundDefaults(),outgoingOrigin=departurePosition(a,core,round,settings)){
 const mode=side===1?a.dividerMode:(a.outgoingDividerMode??a.dividerMode),
 length=side===1?(a.solidLength??30):(a.outgoingSolidLength??a.solidLength??30),
 start=side===1
  ?(round?core:stopPosition(a,core)+(a.stop&&a.incoming>0?STOP_LINE_WIDTH/2:0))
  :outgoingOrigin;
 return {start,end:Math.min(a.length,start+(mode==='dashed'?0:length))};
}

/** Proper intersections, excluding adjacent edges and shared endpoint tangencies. */
export function selfIntersects(ps:P[],closed=true):boolean {
 const count=closed?ps.length:ps.length-1;
 const cross=(a:P,b:P,c:P)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 for(let i=0;i<count;i++){const a=ps[i],b=ps[(i+1)%ps.length];for(let j=i+2;j<count;j++){
 if(closed&&i===0&&j===count-1)continue;const c=ps[j],d=ps[(j+1)%ps.length];
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))continue;
 if(cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8)return true;
 }}return false;
}
export function slipCrossLimit(e:Edge|undefined,a:Arm){return Math.max(2,Math.min(MAX_SLIP_CROSS_OFFSET,Math.floor(((e?.radius??20)+a.slipWidth/2)*(e?.sweep??Math.PI/2)-2)));}
/** Shared sampled quadratic nose for SVG masks and the raised 3D mesh. */
export function medianPolygon(a:Arm,core:number,round:boolean,originOverride?:TreatmentOrigins):P[]{
 if(!round&&a.median<=0)return [];
 const origins=originOverride??treatmentOrigins(a,core,round),incomingOrigin=originFor(origins,'incoming'),outgoingOrigin=originFor(origins,'outgoing'),
 start=core+a.medianOffset,[lo,hi]=medianEdges(a,start,origins),center=(lo+hi)/2,tip=Math.min(start+Math.max(.8,Math.min(5,Math.max(0,hi-lo))),a.length);
 const xs=[...new Set([...approachSamples(a,incomingOrigin,tip,a.length),...approachSamples(a,outgoingOrigin,tip,a.length)])].sort((x,y)=>x-y),smooth=(t:number)=>t*t*(3-2*t);
 const nose=(side:number)=>Array.from({length:17},(_,i)=>{const t=i/16,x=start+(tip-start)*t,y=medianEdges(a,x,origins)[side];return{x,y:center+(y-center)*Math.sqrt(smooth(t))};});
 return [...nose(0),...xs.slice(1).map(x=>({x,y:medianEdges(a,x,origins)[0]})),...xs.slice().reverse().map(x=>({x,y:medianEdges(a,x,origins)[1]})),...nose(1).reverse().slice(1,-1)];
}

function uncutArmIslands(d:Design,i:number,segments:Edge[]):P[][]{
 const a=d.arms[i],core=armMouth(d,i),origins=armTreatmentOrigins(d,i,segments);
 if(d.type!=='roundabout')return [medianPolygon(a,core,false,origins)].filter(p=>p.length);
 const s=roundSettings(d),split=splitterPolygon(a,core,s,origins),median=medianPolygon({...a,medianOffset:0},core+s.splitterLength+2+a.medianOffset,false,origins);
 return [split,median].filter(p=>p.length);
}
/** Curb intersections for crossings on flared roundabout approaches. */
export function curbBoundsAt(d:Design,i:number,x:number,segments=edges(d)){const hits:number[]=[];for(const edge of segments){if(edge.i!==i&&edge.next!==i)continue;const ps=edge.outer.map(p=>rotate(p,(d.arms[edge.i].angle-d.arms[i].angle)/90));for(let j=1;j<ps.length;j++){const p=ps[j-1],q=ps[j];if(Math.abs(p.x-q.x)<1e-8||x<Math.min(p.x,q.x)||x>Math.max(p.x,q.x))continue;hits.push(p.y+(q.y-p.y)*(x-p.x)/(q.x-p.x));}}const fallback=bounds(d.arms[i],x,armTreatmentOrigins(d,i,segments)),negative=hits.filter(y=>y<=0),positive=hits.filter(y=>y>=0);return[negative.length?Math.max(...negative):fallback[0],positive.length?Math.min(...positive):fallback[1]];}

export function clipStation(ps:P[],station:number,keepAfter:boolean):P[]{const out:P[]=[];for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[(i+1)%ps.length],a=keepAfter?p.x>=station:p.x<=station,b=keepAfter?q.x>=station:q.x<=station;if(a)out.push(p);if(a!==b){const t=(station-p.x)/(q.x-p.x);out.push({x:station,y:p.y+t*(q.y-p.y)});}}return out;}
export function armIslands(d:Design,i:number,segments=edges(d)):P[][]{let polygons=uncutArmIslands(d,i,segments);const mouth=armMouth(d,i);for(const opening of d.arms[i].medianOpenings??[]){const start=mouth+opening.start,end=start+opening.length;polygons=polygons.flatMap(ps=>[clipStation(ps,start,false),clipStation(ps,end,true)]).filter(ps=>ps.length>=3);}return polygons;}
