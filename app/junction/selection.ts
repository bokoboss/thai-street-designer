import {roundSettings} from './roundabout';
import {type Design,type Direction,type LaneRole,sectionFor,pocketsFor,pocketLaneWidth} from './model';
import {activeIds,armMouth,stopPosition,armTreatmentOrigins,bounds,carBounds,armIslands,curbBoundsAt,edges,rotate,innerEdge,approachSamples,bandWidths,type P} from './geometry';
import {allocate,pocketFactor,originFor} from './allocation';
import {roadObjects} from './objects';

export type ObjectKind='approach'|'lane'|'sidewalk'|'band'|'median'|'pocket'|'crossing'|'stop'|'yield'|'signal'|'slip'|'opening'|'central'|'splitter'|'trees'|'lights'|'landscape';
export type Selection={
  kind:ObjectKind;
  arm:number;
  direction?:Direction;
  side?:'left'|'right';
  id?:string;
  laneIndex?:number;
  role?:LaneRole;
};
export type HitShape={selection:Selection;key:string;label:string;points:P[];priority:number};

export const selectionKey=(s:Selection)=>[
  s.kind,s.arm,s.direction??'',s.side??'',s.role??'',s.laneIndex??'',s.id??''
].join(':');

export const objectNames:Record<ObjectKind,string>={
  approach:'ขาถนน',
  lane:'เลนหลัก',
  sidewalk:'ทางเท้า',
  band:'แถบหน้าตัด',
  median:'เกาะกลาง',
  pocket:'เลนเสริม',
  crossing:'ทางข้าม',
  stop:'เส้นหยุด',
  yield:'เส้นให้ทาง',
  signal:'สัญญาณไฟ',
  slip:'Slip lane',
  opening:'ช่องเปิดเกาะกลาง',
  central:'เกาะวงเวียน',
  splitter:'Splitter island',
  trees:'ต้นไม้ริมทาง',
  lights:'เสาไฟริมทาง',
  landscape:'ต้นไม้เกาะกลาง'
};

const rect=(x:number,y:number,w:number,h:number)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const circle=(x:number,y:number,r:number)=>Array.from({length:24},(_,i)=>({x:x+r*Math.cos(i/12*Math.PI),y:y+r*Math.sin(i/12*Math.PI)}));

export function designShapes(d:Design){
  const out:HitShape[]=[],es=edges(d);
  const add=(s:Selection,points:P[],priority:number,local=true,labelSuffix='')=>{
    if(points.length<3)return;
    out.push({
      selection:s,
      key:selectionKey(s),
      label:`${objectNames[s.kind]}${labelSuffix}${s.kind==='pocket'?' · '+(s.side==='right'?'ชิดเกาะ':'ริมทาง'):''} · ${d.arms[s.arm].name}`,
      points:local?points.map(p=>rotate(p,d.arms[s.arm].angle/90)):points,
      priority
    });
  };

  for(const i of activeIds(d)){
    const a=d.arms[i],mouth=armMouth(d,i),origins=armTreatmentOrigins(d,i,es);
    const incomingOrigin=origins.incoming,[lo,hi]=bounds(a,mouth,origins);
    add({kind:'approach',arm:i},rect(mouth,lo-3,a.length-mouth,hi-lo+6),0);

    armIslands(d,i,es).forEach((p,k)=>add({kind:d.type==='roundabout'&&k===0?'splitter':'median',arm:i},p,30));
    for(const o of a.medianOpenings??[])add({kind:'opening',arm:i,id:o.id},rect(mouth+o.start,-a.median/2,o.length,a.median),65);

    for(const dir of ['incoming','outgoing'] as const){
      const side=dir==='incoming'?1:-1,idx=side===1?1:0,c=sectionFor(a,dir),origin=originFor(origins,dir);
      const xs=approachSamples(a,origin,origin,a.length);
      const strip=(f:(x:number)=>number,g:(x:number)=>number)=>[
        ...xs.map(x=>({x,y:f(x)})),
        ...xs.slice().reverse().map(x=>({x,y:g(x)}))
      ];

      add(
        {kind:'sidewalk',arm:i,direction:dir},
        strip(x=>bounds(a,x,origins)[idx],x=>bounds(a,x,origins)[idx]+side*c.walk),
        10
      );

      const p=pocketsFor(a,dir),rightWidth=pocketLaneWidth(a,dir,'right'),leftWidth=pocketLaneWidth(a,dir,'left');
      for(let laneIndex=0;laneIndex<a[dir];laneIndex++){
        const inner=(x:number)=>innerEdge(a,side,x,origins)+side*(rightWidth*p.right.lanes*pocketFactor(p.right,x,origin)+c.width*laneIndex);
        add(
          {kind:'lane',arm:i,direction:dir,laneIndex,role:'main'},
          strip(inner,x=>inner(x)+side*c.width),
          12,
          true,
          ` · เลน ${laneIndex+1}`
        );
      }

      c.bands.forEach((b,k)=>add(
        {kind:'band',arm:i,direction:dir,id:b.id},
        strip(
          x=>carBounds(a,x,origins)[idx]+side*bandWidths(a,dir,x,origins).slice(0,k).reduce((n,v)=>n+v,0),
          x=>carBounds(a,x,origins)[idx]+side*bandWidths(a,dir,x,origins).slice(0,k+1).reduce((n,v)=>n+v,0)
        ),
        15
      ));

      for(const which of ['left','right'] as const){
        const pocket=p[which];
        if(!pocket.lanes)continue;
        const xx=approachSamples(a,origin,origin,origin+pocket.length+pocket.taper);
        for(let laneIndex=0;laneIndex<pocket.lanes;laneIndex++){
          const factor=(x:number)=>pocketFactor(pocket,x,origin);
          const w=which==='right'?rightWidth:leftWidth;
          const base=(x:number)=>{
            if(which==='right')return innerEdge(a,side,x,origins)+side*w*laneIndex*factor(x);
            const outerMain=innerEdge(a,side,x,origins)+side*(rightWidth*p.right.lanes*pocketFactor(p.right,x,origin)+c.width*a[dir]);
            return outerMain+side*w*laneIndex*factor(x);
          };
          add(
            {kind:'pocket',arm:i,direction:dir,side:which,laneIndex,role:which==='left'?'aux-left':'aux-right'},
            [...xx.map(x=>({x,y:base(x)})),...xx.slice().reverse().map(x=>({x,y:base(x)+side*w*factor(x)}))],
            40,
            true,
            ` · เลน ${laneIndex+1}`
          );
        }
      }
    }

    if(a.crossing){
      const x=mouth+a.crossOffset,b=curbBoundsAt(d,i,x,es);
      add({kind:'crossing',arm:i},rect(x,b[0],3.2,b[1]-b[0]),60);
    }
    if(a.stop&&a.incoming){
      if(d.type==='roundabout'){
        const ys=Array.from({length:16},(_,j)=>2+(hi-2.2)*j/15),at=(y:number)=>Math.sqrt(Math.max(0,mouth*mouth-y*y))+roundSettings(d).yieldOffset;
        add({kind:'yield',arm:i},[...ys.map(y=>({x:at(y)-1,y})),...ys.reverse().map(y=>({x:at(y)+1,y}))],55);
      }else{
        add({kind:'stop',arm:i},rect(incomingOrigin-1,innerEdge(a,1,incomingOrigin,origins),2,carBounds(a,incomingOrigin,origins)[1]-innerEdge(a,1,incomingOrigin,origins)),55);
      }
    }
    if(a.signal)add({kind:'signal',arm:i},rect((d.type==='roundabout'?mouth+5:incomingOrigin)-2,hi+.7,4,2),80);
    const e=es.find(e=>e.i===i);
    if(e?.slip){
      const polar=(r:number,t:number)=>({x:e.cx-r*Math.sin(t),y:e.cy-r*Math.cos(t)});
      add({kind:'slip',arm:i},[
        ...Array.from({length:41},(_,j)=>polar(e.radius,e.sweep*j/40)),
        ...Array.from({length:41},(_,j)=>polar(e.radius+a.slipWidth,e.sweep*(40-j)/40))
      ],20);
    }
  }

  if(d.type==='roundabout')add({kind:'central',arm:activeIds(d)[0]},circle(0,0,d.radius),50,false);

  for(const o of roadObjects(d)){
    const s:Selection={
      kind:o.median?'landscape':o.kind==='tree'?'trees':'lights',
      arm:o.arm,
      ...(o.median?{}:{direction:o.side===-1?'outgoing':'incoming'})
    };
    add(s,circle(o.x,o.y,Math.max(1,o.size/2)),90,false);
  }
  return out;
}

export function contains(ps:P[],p:P){
  let inside=false;
  for(let i=0,j=ps.length-1;i<ps.length;j=i++){
    const a=ps[i],b=ps[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

export function candidates(shapes:HitShape[],p:P){
  const seen=new Set<string>();
  return shapes
    .filter(s=>contains(s.points,p))
    .sort((a,b)=>b.priority-a.priority||a.key.localeCompare(b.key))
    .filter(s=>{
      if(seen.has(s.key))return false;
      seen.add(s.key);
      return true;
    });
}

export class EditTransaction<T>{
  before:T;
  latest:T;
  constructor(value:T){this.before=value;this.latest=value;}
  update(value:T){this.latest=value;}
  finish(cancel=false){
    return{value:cancel?this.before:this.latest,changed:!cancel&&JSON.stringify(this.before)!==JSON.stringify(this.latest)};
  }
}
