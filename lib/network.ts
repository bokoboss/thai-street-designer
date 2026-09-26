import type {Road,Point,Component} from './geometry';
import {initial,emptyPockets,type Arm} from '../app/junction/model';
import {allocate} from '../app/junction/allocation';
import {validAlignment,lengthOf,station} from './alignment';
export const vertices=(r:Road)=>r.vertices??[r.a,r.b];
export const withVertices=(r:Road,ps:Point[]):Road=>({...r,vertices:ps,a:ps[0],b:ps.at(-1)!});
export function snapEndpoint(roads:Road[],p:Point,exclude?:{id:string;index:number},tolerance=4){let result=p,best=tolerance;for(const r of roads){const ps=vertices(r);for(const index of [0,ps.length-1]){if(exclude?.id===r.id&&exclude.index===index)continue;const q=ps[index],dist=Math.hypot(q.x-p.x,q.y-p.y);if(dist<best){result={...q};best=dist;}}}return result;}
export function moveVertex(roads:Road[],id:string,index:number,p:Point){const host=roads.find(r=>r.id===id);if(!host)return roads;const old=vertices(host)[index],endpoint=index===0||index===vertices(host).length-1;const result=roads.map(r=>{const ps=vertices(r).map((q,j)=>r.id===id&&j===index||endpoint&&(j===0||j===vertices(r).length-1)&&q.x===old.x&&q.y===old.y?p:q);return withVertices(r,ps);});return result.every(r=>validAlignment(vertices(r)))?result:roads;}
export type NetworkNode={id:string;point:Point;ends:{roadId:string;index:number}[]};
export function networkNodes(roads:Road[]):NetworkNode[]{const map=new Map<string,NetworkNode>();for(const r of roads){const ps=vertices(r);for(const index of [0,ps.length-1]){const point=ps[index],id=`${point.x.toFixed(4)},${point.y.toFixed(4)}`,node=map.get(id)??{id,point,ends:[]};node.ends.push({roadId:r.id,index});map.set(id,node);}}return [...map.values()];}
/** Adapter to the SAME reserve constraint engine used in the junction editor. */
export function pocketArm(r:Road,c:Component):Arm{const a=initial().arms[0];return{...a,median:r.config.median,width:r.config.laneWidth,incoming:r.config.lanes,outgoing:r.config.lanes,incomingPockets:{...emptyPockets(),right:{lanes:1,length:c.storage,taper:c.taper,width:c.width,allocation:'auto'}}};}
export function pocketImpact(r:Road,c:Component,x=0){return allocate(pocketArm(r,c),x,0);}
export function pocketIssue(r:Road,c:Component){const ps=vertices(r),total=lengthOf(ps),s=c.t*total,frame=station(ps,s),before=lengthOf(ps.slice(0,frame.index+1)),after=before+Math.hypot(ps[frame.index+1].x-ps[frame.index].x,ps[frame.index+1].y-ps[frame.index].y),available=(r.config.traffic==='Left')===(c.side===1)?s-before:after-s;return available<c.storage+c.taper+2?'Geometry Error — ช่วงเลนและช่วงสอบต้องอยู่บนท่อนตรงเดียว เพิ่มความยาวท่อนหรือย้ายตำแหน่ง':null;}
