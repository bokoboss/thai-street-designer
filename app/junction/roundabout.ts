import {allocate} from './allocation';
import {medianEdges,pocketWidth,modeFor} from './cross-section';
import type {Arm,Design} from './model';
export type XY={x:number;y:number};
export type RoundaboutSettings={apron:number;entryRadius:number;exitRadius:number;splitterLength:number;splitterWidth:number;yieldOffset:number};
export const roundDefaults=():RoundaboutSettings=>({apron:1.5,entryRadius:12,exitRadius:20,splitterLength:22,splitterWidth:3,yieldOffset:.7});
export const roundSettings=(d:Design)=>({...roundDefaults(),...d.roundabout});
export const outerRadius=(d:Design)=>d.radius+roundSettings(d).apron+d.circulation;
/** External tangent circle: exact approach tangent + circulating-circle tangent.
 * No arbitrary cubic handles. Mirroring gives the outbound curb fillet. */
export function roundFillet(R:number,width:number,radius:number){const cy=width+radius,rr=R+radius,cx=Math.sqrt(Math.max(.01,rr*rr-cy*cy)),theta=Math.atan2(cy,cx),end=-Math.PI+theta;const points=Array.from({length:49},(_,i)=>{const t=-Math.PI/2+(end+Math.PI/2)*i/48;return{x:cx+radius*Math.cos(t),y:cy+radius*Math.sin(t)};});return{points,theta,cx,valid:cy<rr};}
/** Finite raised splitter, separate from the ordinary approach median. */
export function splitterPolygon(a:Arm,R:number,s:RoundaboutSettings):XY[]{
 const start=R+.8,end=R+s.splitterLength,peak=Math.min(end-3,R+8),half=s.splitterWidth/2,
 exit=roundFillet(R,Math.max(.1,a.outgoing*(a.outgoingSection?.width??a.width)+a.median/2),s.exitRadius),
 origins={incoming:R+(a.crossing?a.crossOffset+4.5:a.stopOffset),outgoing:exit.valid?exit.cx:R+.8};
 const side=Array.from({length:41},(_,i)=>{
  const x=start+(end-start)*i/40,t=x<=peak?(x-start)/(peak-start):(end-x)/(end-peak),w=half*Math.sin(Math.max(0,t)*Math.PI/2),
  edges=medianEdges(a,x,origins),used=allocate(a,x,origins).medianUsed>0,center=used?(edges[0]+edges[1])/2:0;
  return{x,y:w,center,half:used?Math.min(w,Math.max(0,(edges[1]-edges[0])/2)):w};
 });
 return[...side.map(p=>({x:p.x,y:p.center-p.half})),...side.reverse().slice(1,-1).map(p=>({x:p.x,y:p.center+p.half}))];
}
export function splitterHalfAt(x:number,R:number,s:RoundaboutSettings){const start=R+.8,end=R+s.splitterLength,peak=Math.min(end-3,R+8);if(x<=start||x>=end)return 0;const t=x<=peak?(x-start)/(peak-start):(end-x)/(end-peak);return s.splitterWidth/2*Math.sin(t*Math.PI/2);}
export function roundFeedback(d:Design){const r=roundSettings(d),maxEntry=Math.max(...d.arms.filter((_,i)=>d.enabled[i]).map(a=>a.incoming*(a.incomingSection?.width??a.width)));const warnings:string[]=[];if(d.ring>1)warnings.push('วงเวียนหลายเลนยังเป็นแบบแนวคิด ต้องตรวจเส้นทางรถและการทับซ้อนระหว่างเลน');if(d.arms.some((a,i)=>d.enabled[i]&&Math.min(a.incoming*(a.incomingSection?.width??a.width)+a.median/2,a.outgoing*(a.outgoingSection?.width??a.width)+a.median/2)-r.splitterWidth/2<2.5))warnings.push('Splitter กินความกว้างทางเข้า/ออกมาก ควรทบทวนช่องว่างรถผ่าน — เกณฑ์ภาพแนวคิด ไม่ใช่มาตรฐาน');if(maxEntry>d.circulation)warnings.push('ความกว้างทางเข้ามากกว่าช่องจราจรวน ต้องทบทวนจำนวนเลนและการรวมช่อง');if(r.entryRadius>2*d.radius)warnings.push('โค้งทางเข้าค่อนข้างราบ อาจบังคับเบนแนวรถได้น้อย ควรตรวจแนววิ่ง');return warnings;}
