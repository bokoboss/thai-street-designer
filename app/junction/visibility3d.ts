/** BSP visibility for planar faces. Unlike centroid sorting, this splits faces
 * that straddle a surface, so long sidewalks cannot hide nearer furniture. */
export type Point3={x:number;y:number;z:number};
export type Surface={points:Point3[];color:string};
type Plane={normal:Point3;offset:number};
export type VisibilityTree={plane:Plane;coplanar:Surface[];front:VisibilityTree|null;back:VisibilityTree|null};
const EPS=1e-7;
const dot=(a:Point3,b:Point3)=>a.x*b.x+a.y*b.y+a.z*b.z;
function planeOf(f:Surface):Plane|null{
 const a=f.points[0];if(!a)return null;
 for(let i=1;i<f.points.length-1;i++){const b=f.points[i],c=f.points[i+1],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(n.x,n.y,n.z);if(length>EPS){const normal={x:n.x/length,y:n.y/length,z:n.z/length};return {normal,offset:dot(normal,a)};}}
 return null;
}
function split(f:Surface,p:Plane,front:Surface[],back:Surface[],coplanar:Surface[]){
 const ds=f.points.map(v=>dot(p.normal,v)-p.offset),positive=ds.some(d=>d>EPS),negative=ds.some(d=>d< -EPS);
 if(!positive&&!negative){coplanar.push(f);return;}if(!negative){front.push(f);return;}if(!positive){back.push(f);return;}
 const a:Point3[]=[],b:Point3[]=[];
 f.points.forEach((v,i)=>{const j=(i+1)%f.points.length,w=f.points[j],d=ds[i],e=ds[j];if(d>=-EPS)a.push(v);if(d<=EPS)b.push(v);if((d>EPS&&e< -EPS)||(d< -EPS&&e>EPS)){const t=d/(d-e),q={x:v.x+t*(w.x-v.x),y:v.y+t*(w.y-v.y),z:v.z+t*(w.z-v.z)};a.push(q);b.push(q);}});
 if(a.length>=3)front.push({...f,points:a});if(b.length>=3)back.push({...f,points:b});
}
export function buildVisibility(faces:Surface[]):VisibilityTree|null{
 if(!faces.length)return null;
 // Sample candidate planes to avoid the highly unbalanced trees produced by
 // taking sequential cylinder sides or adjacent curb segments as splitters.
 let best:Plane|null=null,bestCost=Infinity;
 for(let k=0;k<Math.min(12,faces.length);k++){const p=planeOf(faces[Math.floor(k*faces.length/Math.min(12,faces.length))]);if(!p)continue;let front=0,back=0,cross=0;
 for(const f of faces){let pos=false,neg=false;for(const v of f.points){const d=dot(p.normal,v)-p.offset;pos ||= d>EPS;neg ||= d< -EPS;}if(pos&&neg)cross++;else if(pos)front++;else if(neg)back++;}
 const cost=cross*4+Math.abs(front-back);if(cost<bestCost){best=p;bestCost=cost;}}
 if(!best)return null;const front:Surface[]=[],back:Surface[]=[],coplanar:Surface[]=[];for(const f of faces)split(f,best,front,back,coplanar);
 return {plane:best,coplanar,front:buildVisibility(front),back:buildVisibility(back)};
}
/** Direction from scene toward an orthographic camera, in world coordinates. */
export function cameraDirection(yaw:number,pitch:number):Point3{const a=yaw*Math.PI/180,p=pitch*Math.PI/180;return {x:Math.sin(a)*Math.sin(p),y:Math.cos(a)*Math.sin(p),z:Math.cos(p)};}
export function visibleOrder(tree:VisibilityTree|null,towardCamera:Point3):Surface[]{
 const out:Surface[]=[];function visit(t:VisibilityTree|null){if(!t)return;const front=dot(t.plane.normal,towardCamera)>=0;visit(front?t.back:t.front);out.push(...t.coplanar);visit(front?t.front:t.back);}visit(tree);return out;
}
