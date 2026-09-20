import {medianTreeDefaults,type Design} from './model';
import {armMouth,stopPosition,medianEdges} from './geometry';
import {allocate} from './allocation';
import {roundSettings} from './roundabout';
export type Interval={start:number;end:number;reason:string};
export function mergeZones(zones:Interval[]):Interval[]{const out:Interval[]=[];for(const z of [...zones].sort((a,b)=>a.start-b.start)){const p=out.at(-1);if(p&&z.start<=p.end){p.end=Math.max(p.end,z.end);p.reason=[...new Set([p.reason,z.reason])].join(' / ');}else out.push({...z});}return out;}
export function validIntervals(start:number,end:number,zones:Interval[]):Interval[]{const out:Interval[]=[];let cursor=start;for(const z of mergeZones(zones)){if(z.end<=cursor)continue;if(z.start>cursor)out.push({start:cursor,end:Math.min(end,z.start),reason:''});cursor=Math.max(cursor,z.end);if(cursor>=end)break;}if(cursor<end)out.push({start:cursor,end,reason:''});return out.filter(i=>i.end>=i.start);}
export function plantingPlan(d:Design,id:number){const a=d.arms[id],s={...medianTreeDefaults(),...a.medianTrees},mouth=armMouth(d,id),origin=stopPosition(a,mouth),margin=s.crown/2+.2,requested=mouth+s.start,zones:Interval[]=[];
 const medianStart=d.type==='roundabout'?mouth+roundSettings(d).splitterLength+2+a.medianOffset:mouth+a.medianOffset;zones.push({start:mouth,end:medianStart+Math.min(5,a.median)+margin,reason:d.type==='roundabout'?'Splitter island / หัวเกาะ':'หัวเกาะกลาง'});
 const allocation=allocate(a,origin,origin);for(const dir of ['incoming','outgoing'] as const){const p=allocation.features[dir].right;if(p.medianUsed>0)zones.push({start:mouth,end:p.end+margin,reason:'เลนชิดเกาะและช่วงสอบ'});}
 for(const o of a.medianOpenings??[])zones.push({start:mouth+o.start-margin,end:mouth+o.start+o.length+margin,reason:'ช่องเปิดเกาะกลาง'});
 if(a.crossing)zones.push({start:mouth+a.crossOffset-margin,end:mouth+a.crossOffset+3.2+margin,reason:'ทางข้าม / พื้นที่พักคน'});
 // Build longitudinal narrow-width exclusions BEFORE placing any objects.
 let narrow:number|null=null;for(let x=mouth;x<=a.length+.25;x+=.25){const [lo,hi]=medianEdges(a,x,origin),bad=hi-lo<s.crown+.4;if(bad&&narrow===null)narrow=x;if(!bad&&narrow!==null){zones.push({start:narrow-margin,end:x+margin,reason:'เกาะแคบกว่าพื้นที่พุ่มที่กำหนด'});narrow=null;}}if(narrow!==null)zones.push({start:narrow-margin,end:a.length,reason:'เกาะแคบกว่าพื้นที่พุ่มที่กำหนด'});
 const merged=mergeZones(zones),intervals=validIntervals(Math.max(mouth,requested),a.length-margin,merged),trees:{x:number;y:number;height:number;size:number}[]=[];if(s.enabled&&a.median>0)for(const range of intervals){const first=Math.max(range.start,(trees.at(-1)?.x??-Infinity)+s.spacing);for(let x=first;x<=range.end+1e-8;x+=s.spacing){const [lo,hi]=medianEdges(a,x,origin),y=Math.max(lo+margin,Math.min(hi-margin,(lo+hi)/2+s.offset));trees.push({x,y,height:s.height,size:s.crown});}}
 const first=trees[0]?.x??null,reasons=zones.filter(z=>z.end>requested&&(!first||z.start<first)).map(z=>z.reason);return{requested,actual:first,trees,zones:merged,intervals,reasons:[...new Set(reasons)],settings:s,mouth};}
