import {type Design,pocketsFor} from './model';
import {allocate} from './allocation';
import {activeIds} from './geometry';
import {plantingPlan} from './planting';
import {roundFeedback} from './roundabout';
import type {Selection} from './selection';
export type Review={level:'geometry'|'engineering'|'note';message:string;selection:Selection};
export function designReviews(d:Design):Review[]{const out:Review[]=[];for(const i of activeIds(d)){const a=d.arms[i],v=allocate(a);for(const direction of ['incoming','outgoing'] as const)for(const side of ['left','right'] as const){const f=v.features[direction][side];if(f.widening>.001){const kind=direction==='incoming'?'เลนเสริม':'เลนรับ',position=side==='right'?'ชิดเกาะกลาง':'ริมทาง';out.push({level:'engineering',selection:{kind:'pocket',arm:i,direction,side},message:`${a.name} · ${kind}${position}ทำให้ขอบทางขยายออก ${f.widening.toFixed(2)} ม.`});}}
if(v.medianUsed>0&&v.residual<=.001)out.push({level:'engineering',selection:{kind:'median',arm:i},message:`${a.name} · ใช้พื้นที่เกาะกลางหมด ควรทบทวนหน้าที่เกาะกลาง ทางข้าม และภูมิทัศน์`});
const p=a.medianTrees?.enabled?plantingPlan(d,i):null;if(p){if(p.actual===null)out.push({level:'engineering',selection:{kind:'landscape',arm:i},message:`${a.name} · ไม่มีช่วงเกาะที่กว้างพอสำหรับพุ่ม / ระยะที่กำหนด`});else if(p.actual>p.requested+.1)out.push({level:'note',selection:{kind:'landscape',arm:i},message:`${a.name} · ต้นแรกถูกเลื่อนจากตำแหน่งที่ขอไปเป็น ${(p.actual-p.mouth).toFixed(1)} ม. — ${p.reasons.join(', ')}`});}}
if(d.type==='roundabout')for(const message of roundFeedback(d))out.push({level:'engineering',selection:{kind:'central',arm:activeIds(d)[0]},message});return out;}
