import {lengthOf,station,projectAlignment} from './alignment';
export type Point={x:number;y:number};
export type RoadConfig={lanes:number;laneWidth:number;median:number;shoulder:number;traffic:'Left'|'Right'};
export type Road={vertices?:Point[];id:string;name:string;a:Point;b:Point;config:RoadConfig};
export type Component={id:string;roadId:string;type:'junction'|'pocket'|'opening';t:number;width:number;taper:number;storage:number;length:number;side:1|-1};
export const presets:Record<string,RoadConfig>={ '2-Lane Undivided':{lanes:1,laneWidth:3.25,median:0,shoulder:1,traffic:'Left'},'4-Lane Divided':{lanes:2,laneWidth:3.25,median:5,shoulder:1,traffic:'Left'},'6-Lane Divided':{lanes:3,laneWidth:3.25,median:5,shoulder:1,traffic:'Left'}};
export const distance=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y);
export function generateRoad(r:Road){const c=r.config;const length=lengthOf(r.vertices??[r.a,r.b]);const angle=Math.atan2(r.b.y-r.a.y,r.b.x-r.a.x)*180/Math.PI;const carriage=c.lanes*c.laneWidth;const half=c.median/2+carriage;const total=2*(half+c.shoulder);const dividers:number[]=[];const arrows:{x:number;y:number;angle:number}[]=[];for(const s of [-1,1]){for(let i=1;i<c.lanes;i++)dividers.push(s*(c.median/2+i*c.laneWidth));for(let i=0;i<c.lanes;i++){for(let x=12;x<length-7;x+=32)arrows.push({x,y:s*(c.median/2+(i+.5)*c.laneWidth),angle:(s===-1)===(c.traffic==='Left')?0:180});}}return{length,angle,half,total,dividers,arrows};}
export function project(r:Road,p:Point){return projectAlignment(r.vertices??[r.a,r.b],p);}
export function componentFrame(r:Road,c:Component){const g=generateRoad(r),frame=station(r.vertices??[r.a,r.b],c.t*g.length);return{...g,...frame};}
export function demo():{roads:Road[];components:Component[]}{return{roads:[{id:'r1',name:'Primary boulevard',a:{x:20,y:70},b:{x:240,y:70},config:{...presets['4-Lane Divided']}}],components:[{id:'c1',roadId:'r1',type:'junction',t:.69,width:3.25,taper:18,storage:22,length:65,side:1},{id:'c2',roadId:'r1',type:'pocket',t:.63,width:3.25,taper:18,storage:22,length:12,side:1}]};}
