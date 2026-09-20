export type Camera3={yaw:number;pitch:number;zoom:number;pan:{x:number;y:number}};
export type Viewport3={width:number;height:number;extent:number;rotation:number};
export function groundAt(c:Camera3,v:Viewport3,s:{x:number;y:number}){
 const scale=Math.min(v.width,v.height)/(v.extent*2)*c.zoom,a=(c.yaw+v.rotation)*Math.PI/180,p=c.pitch*Math.PI/180;
 const x=(s.x-v.width/2-c.pan.x*v.width)/scale,y=(s.y-v.height/2-c.pan.y*v.height)/(scale*Math.cos(p));
 return {x:x*Math.cos(a)+y*Math.sin(a),y:-x*Math.sin(a)+y*Math.cos(a)};
}
export function anchorGround(c:Camera3,v:Viewport3,point:{x:number;y:number},screen:{x:number;y:number}):Camera3{
 const scale=Math.min(v.width,v.height)/(v.extent*2)*c.zoom,a=(c.yaw+v.rotation)*Math.PI/180,p=c.pitch*Math.PI/180;
 const x=point.x*Math.cos(a)-point.y*Math.sin(a),y=point.x*Math.sin(a)+point.y*Math.cos(a);
 return {...c,pan:{x:(screen.x-v.width/2-x*scale)/v.width,y:(screen.y-v.height/2-y*Math.cos(p)*scale)/v.height}};
}
export function orbitGround(c:Camera3,v:Viewport3,point:{x:number;y:number},screen:{x:number;y:number},dx:number,dy:number){return anchorGround({...c,yaw:c.yaw-dx*.4,pitch:Math.max(10,Math.min(78,c.pitch+dy*.25))},v,point,screen);}
export function pointerAction(pointerType:string,button:number,touchMode:string){return pointerType==='mouse'?(button===0?'pan':button===1?'rotate':'none'):touchMode;}
