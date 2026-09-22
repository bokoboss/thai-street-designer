import {type Design} from './model';
import {allocate} from './allocation';
import {activeIds,armMouth,armTreatmentOrigins} from './geometry';
import {plantingPlan} from './planting';
import {roundFeedback} from './roundabout';
import type {Selection} from './selection';
export type Review={level:'geometry'|'engineering'|'note';message:string;selection:Selection};

export function designReviews(d:Design):Review[]{
  const out:Review[]=[];
  for(const i of activeIds(d)){
    const a=d.arms[i],v=allocate(a);

    for(const direction of ['incoming','outgoing'] as const)for(const side of ['left','right'] as const){
      const f=v.features[direction][side];
      if(f.widening>.001){
        const kind=direction==='incoming'?'เลนเสริม':'เลนเสริมขาออก',position=side==='right'?'ชิดเกาะกลาง':'ริมทาง';
        out.push({
          level:'note',
          selection:{kind:'pocket',arm:i,direction,side},
          message:`${a.name} · ${kind}${position}ทำให้ขอบทางขยายออก ${f.widening.toFixed(2)} ม. ตาม Auto allocation`
        });
      }
    }

    // A fully consumed median changes the visual/functional meaning of the cross-section,
    // so keep this as a concept-design warning. Do not warn on preferred numeric widths.
    if(v.medianUsed>0&&v.residual<=.001){
      out.push({
        level:'engineering',
        selection:{kind:'median',arm:i},
        message:`${a.name} · ใช้พื้นที่เกาะกลางหมด ควรทบทวนหน้าที่เกาะกลาง ทางข้าม และภูมิทัศน์`
      });
    }

    if(d.type!=='roundabout'&&a.signal&&!a.stop){
      out.push({
        level:'engineering',
        selection:{kind:'signal',arm:i},
        message:`${a.name} · เปิดสัญญาณไฟแต่ไม่มีเส้นหยุด — ภาพแนวคิดควรมีแนวหยุดที่สัมพันธ์กับทางข้ามและสัญญาณ`
      });
    }

    for(const o of a.medianOpenings??[])if((o.type??'opening')==='uturn'){
      out.push({
        level:'note',
        selection:{kind:'opening',arm:i,id:o.id},
        message:`${a.name} · ช่องกลับรถเป็นแนวคิดเบื้องต้น — ตรวจ design vehicle, แนวกวาดรถ และพื้นที่รับรถเมื่อเข้าสู่ขั้นรายละเอียด`
      });
    }

    const slip=d.slips.find(s=>s.fromArm===i);
    if(slip?.departure.mode==='acceleration'&&slip.crossing.enabled){
      out.push({
        level:'engineering',
        selection:{kind:'slip',arm:i},
        message:`${a.name} · Slip acceleration lane ใช้ร่วมกับทางข้าม — ภาพแนวคิดมี conflict ระหว่างทางข้ามกับช่วงเร่ง/รวมรถ ควรทบทวน treatment`
      });
    }

    const mouth=armMouth(d,i),origins=armTreatmentOrigins(d,i);
    for(const o of a.medianOpenings??[]){
      const os=mouth+o.start,oe=os+o.length;
      for(const direction of ['incoming','outgoing'] as const){
        const f=allocate(a,0,origins).features[direction].right;
        if(f.requested>0&&Math.max(os,f.start)<Math.min(oe,f.end)){
          out.push({
            level:'engineering',
            selection:{kind:'opening',arm:i,id:o.id},
            message:`${a.name} · ช่องเปิดเกาะกลางทับช่วงเลนชิดเกาะของ${direction==='incoming'?'ขาเข้า':'ขาออก'} — ปรับตำแหน่งหรือ treatment ก่อนใช้งาน`
          });
        }
      }
    }

    const p=a.medianTrees?.enabled?plantingPlan(d,i):null;
    if(p){
      if(p.actual===null){
        out.push({
          level:'engineering',
          selection:{kind:'landscape',arm:i},
          message:`${a.name} · ไม่มีช่วงเกาะที่กว้างพอสำหรับพุ่ม / ระยะที่กำหนด`
        });
      }else if(p.actual>p.requested+.1){
        out.push({
          level:'note',
          selection:{kind:'landscape',arm:i},
          message:`${a.name} · ต้นแรกถูกเลื่อนจากตำแหน่งที่ขอไปเป็น ${(p.actual-p.mouth).toFixed(1)} ม. — ${p.reasons.join(', ')}`
        });
      }
    }
  }

  if(d.type==='roundabout'){
    for(const message of roundFeedback(d)){
      out.push({level:'engineering',selection:{kind:'central',arm:activeIds(d)[0]},message});
    }
  }
  return out;
}
