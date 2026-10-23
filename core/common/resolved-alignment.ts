/** Shared line / circular-arc alignment. Distances are exact arc lengths in metres. */
export type AlignmentPoint={x:number;y:number;radius?:number};
type Point={x:number;y:number};
export type AlignmentMode='chord'|'arc';
export type AlignmentPiece={kind:'line';start:number;length:number;a:Point;b:Point;index:number}|
  {kind:'arc';start:number;length:number;a:Point;b:Point;index:number;center:Point;radius:number;angle:number;sweep:number};
const EPS=1e-8,TAU=Math.PI*2;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const sub=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y});
const unit=(a:Point)=>{const l=Math.hypot(a.x,a.y)||1;return{x:a.x/l,y:a.y/l};};
const mix=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const plain=(p:Point)=>({x:p.x,y:p.y});
export const chordStations=(points:Point[])=>{const s=points.length?[0]:[];for(let i=1;i<points.length;i++)s.push(s[i-1]+dist(points[i-1],points[i]));return s;};
function piecePoint(p:AlignmentPiece,t:number):Point{
  if(p.kind==='line')return mix(p.a,p.b,t);
  const angle=p.angle+p.sweep*t;return{x:p.center.x+p.radius*Math.cos(angle),y:p.center.y+p.radius*Math.sin(angle)};
}
function arcFraction(p:Extract<AlignmentPiece,{kind:'arc'}>,q:Point){
  const angle=Math.atan2(q.y-p.center.y,q.x-p.center.x),d=p.sweep>0?(angle-p.angle+TAU)%TAU:(p.angle-angle+TAU)%TAU;
  return d/Math.abs(p.sweep);
}
export type ResolvedAlignment=ReturnType<typeof resolveAlignment>;
export function resolveAlignment(points:AlignmentPoint[],mode:AlignmentMode='arc'){
  const old=chordStations(points),pieces:AlignmentPiece[]=[],vertices=old.map(()=>0),map:{old:number;now:number}[]=[{old:0,now:0}];
  let length=0,last=points[0]??{x:0,y:0};
  const line=(to:Point,index:number)=>{const l=dist(last,to);if(l>EPS){pieces.push({kind:'line',start:length,length:l,a:plain(last),b:plain(to),index});length+=l;}last=to;};
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],ab=dist(a,b),bc=dist(b,c),u=unit(sub(a,b)),v=unit(sub(c,b));
    const theta=Math.acos(clamp(u.x*v.x+u.y*v.y,-1,1)),turn=Math.PI-theta,tan=Math.tan(theta/2);
    const radius=mode==='arc'?Math.min(Math.max(0,b.radius??0),Math.min(ab,bc)*.45*tan):0,tangent=radius/(tan||1);
    if(radius<.25||tangent<.1||ab<3||bc<3||turn<.01||theta<.08){line(b,i-1);vertices[i]=length;map.push({old:old[i],now:length});continue;}
    const p={x:b.x+u.x*tangent,y:b.y+u.y*tangent},q={x:b.x+v.x*tangent,y:b.y+v.y*tangent};
    line(p,i-1);map.push({old:old[i]-tangent,now:length});
    const bis=unit({x:u.x+v.x,y:u.y+v.y}),cd=radius/Math.sin(theta/2),center={x:b.x+bis.x*cd,y:b.y+bis.y*cd};
    const sweep=Math.sign(cross(sub(b,a),sub(c,b)))*turn,l=radius*turn;
    pieces.push({kind:'arc',start:length,length:l,a:p,b:q,index:i,center,radius,angle:Math.atan2(p.y-center.y,p.x-center.x),sweep});
    vertices[i]=length+l/2;map.push({old:old[i],now:vertices[i]});length+=l;last=q;
    map.push({old:old[i]+tangent,now:length});
  }
  if(points.length>1)line(points.at(-1)!,points.length-2);
  if(vertices.length)vertices[vertices.length-1]=length;
  map.push({old:old.at(-1)??0,now:length});
  const pieceAt=(s:number,ahead=true)=>pieces.find(p=>ahead?s<p.start+p.length-EPS:s<=p.start+p.length+EPS)??pieces.at(-1);
  const pointAt=(s:number)=>{const p=pieceAt(s);return p?piecePoint(p,clamp((s-p.start)/p.length,0,1)):plain(points[0]??{x:0,y:0});};
  const tangentAt=(s:number,ahead=true)=>{const p=pieceAt(s,ahead);if(!p)return{x:1,y:0};if(p.kind==='line')return unit(sub(p.b,p.a));
    const a=p.angle+p.sweep*clamp((s-p.start)/p.length,0,1),sign=Math.sign(p.sweep);return{x:-Math.sin(a)*sign,y:Math.cos(a)*sign};};
  const project=(q:Point)=>{
    let best={station:0,distance:Infinity,point:pointAt(0),tangent:tangentAt(0),index:0};
    for(const p of pieces){
      let fractions:number[];
      if(p.kind==='line'){const v=sub(p.b,p.a),w=sub(q,p.a);fractions=[clamp((v.x*w.x+v.y*w.y)/(p.length*p.length),0,1)];}
      else{const f=arcFraction(p,q);fractions=f<=1+EPS?[clamp(f,0,1),0,1]:[0,1];}
      for(const f of fractions){const point=piecePoint(p,f),distance=dist(point,q),s=p.start+f*p.length;
        if(distance<best.distance-EPS)best={station:s,distance,point,tangent:tangentAt(s),index:p.index};}
    }
    return best;
  };
  /** Monotonic old-control-polyline → solved-distance map; no authored point is dropped. */
  const mapChordStation=(s:number)=>{
    if(!Number.isFinite(s)||s<0)throw Error('ค่าระยะตามแนวถนนไม่ถูกต้อง');
    for(let i=1;i<map.length;i++)if(s<=map[i].old&&map[i].old>map[i-1].old){const a=map[i-1],b=map[i];return a.now+(s-a.old)*(b.now-a.now)/(b.old-a.old);}
    return length+s-(old.at(-1)??0);
  };
  /** Drawing chord error ≤ 1 mm; station metadata remains the exact arc length. */
  const sample=(from=0,to=length,error=.001):{x:number;y:number;alignmentStation:number}[]=>{
    const lo=clamp(from,0,length),hi=clamp(to,lo,length),out=[{...pointAt(lo),alignmentStation:0}];
    for(const p of pieces){const a=Math.max(lo,p.start),b=Math.min(hi,p.start+p.length);if(b<=a+EPS)continue;
      const angle=p.kind==='arc'?2*Math.acos(clamp(1-error/p.radius,-1,1)):0;
      const count=p.kind==='arc'?Math.max(1,Math.ceil((b-a)/p.radius/Math.max(angle,.0001))):1;
      for(let j=1;j<=count;j++){const s=a+(b-a)*j/count;out.push({...piecePoint(p,(s-p.start)/p.length),alignmentStation:s-lo});}
    }
    return out;
  };
  return{pieces,length,vertices,pointAt,tangentAt,project,mapChordStation,sample,pieceAt};
}

/** Exact finite line/arc intersections. Coincident runs are not a unique crossing. */
export function alignmentIntersections(a:ResolvedAlignment,b:ResolvedAlignment){
  const out:{point:Point;stationA:number;stationB:number}[]=[];
  const on=(p:AlignmentPiece,q:Point):number|null=>{
    if(p.kind==='arc'){const f=arcFraction(p,q);if(f<=1+EPS)return clamp(f,0,1);if(dist(q,p.a)<EPS)return 0;return null;}
    const v=sub(p.b,p.a),w=sub(q,p.a),f=(v.x*w.x+v.y*w.y)/(p.length*p.length);
    return f>=-EPS&&f<=1+EPS?clamp(f,0,1):null;
  };
  for(const p of a.pieces)for(const q of b.pieces){
    const hits:Point[]=[];
    if(p.kind==='line'&&q.kind==='line'){
      const v=sub(p.b,p.a),w=sub(q.b,q.a),den=cross(v,w);if(Math.abs(den)<EPS)continue;
      const t=cross(sub(q.a,p.a),w)/den;hits.push(mix(p.a,p.b,t));
    }else if(p.kind==='arc'&&q.kind==='arc'){
      const d=dist(p.center,q.center);if(d<EPS||d>p.radius+q.radius+EPS||d<Math.abs(p.radius-q.radius)-EPS)continue;
      const x=(p.radius*p.radius-q.radius*q.radius+d*d)/(2*d),h=Math.sqrt(Math.max(0,p.radius*p.radius-x*x)),v=unit(sub(q.center,p.center));
      const m={x:p.center.x+x*v.x,y:p.center.y+x*v.y};hits.push({x:m.x-h*v.y,y:m.y+h*v.x},{x:m.x+h*v.y,y:m.y-h*v.x});
    }else{
      const line=p.kind==='line'?p:q as Extract<AlignmentPiece,{kind:'line'}>,arc=p.kind==='arc'?p:q as Extract<AlignmentPiece,{kind:'arc'}>;
      const v=sub(line.b,line.a),w=sub(line.a,arc.center),A=v.x*v.x+v.y*v.y,B=2*(v.x*w.x+v.y*w.y),C=w.x*w.x+w.y*w.y-arc.radius*arc.radius,D=B*B-4*A*C;
      if(D<0)continue;for(const sign of [-1,1])hits.push(mix(line.a,line.b,(-B+sign*Math.sqrt(D))/(2*A)));
    }
    for(const point of hits){const u=on(p,point),v=on(q,point);if(u===null||v===null||out.some(h=>dist(h.point,point)<EPS))continue;
      out.push({point,stationA:p.start+u*p.length,stationB:q.start+v*q.length});}
  }
  return out.sort((x,y)=>x.stationA-y.stationA||x.stationB-y.stationB);
}
