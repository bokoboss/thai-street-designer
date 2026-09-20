import {allocate,pocketFactor,reserveWidth,type TreatmentOrigins} from './allocation';
import {sectionFor,type Arm,type Direction,medianTreeDefaults} from './model';

export type Feedback={level:'geometry'|'engineering'|'note';message:string};
export const modeFor=(a:Arm)=>a.corridorMode??'widen'; // legacy compatibility only
export {pocketFactor,reserveWidth} from './allocation';

export function pocketWidth(a:Arm,dir:Direction,which:'left'|'right',x=0,origins:TreatmentOrigins=0){
  return allocate(a,x,origins).features[dir][which].requested;
}

/** Signed median edges. Incoming occupies the positive side, outgoing the negative side. */
export function medianEdges(a:Arm,x=0,origins:TreatmentOrigins=0){
  const v=allocate(a,x,origins);
  return[-a.median/2+v.features.outgoing.right.medianUsed,a.median/2-v.features.incoming.right.medianUsed] as [number,number];
}
export function innerEdge(a:Arm,side:number,x=0,origins:TreatmentOrigins=0){
  return medianEdges(a,x,origins)[side===1?1:0];
}
export function bandWidths(a:Arm,dir:Direction,x=0,origins:TreatmentOrigins=0){
  let used=allocate(a,x,origins).features[dir].left.reallocated;
  return sectionFor(a,dir).bands.map(b=>{
    const take=b.type==='shoulder'||b.type==='buffer'?Math.min(used,b.width):0;
    used-=take;
    return b.width-take;
  });
}

export function sectionImpact(a:Arm){
  const v=allocate(a);
  const original=a.median+(['incoming','outgoing'] as const).reduce((s,d)=>{
    const c=sectionFor(a,d);
    return s+a[d]*c.width+c.walk+c.bands.reduce((n,b)=>n+b.width,0);
  },0);
  const legacy=(['incoming','outgoing'] as const)
    .filter(d=>v.features[d].right.mode==='legacy-preserve')
    .reduce((s,d)=>s+v.features[d].right.requested,0);
  const medianDeficit=legacy?Math.max(0,legacy-a.median):0;
  const curbDeficit=(['incoming','outgoing'] as const)
    .reduce((s,d)=>s+(v.features[d].left.mode==='legacy-preserve'?v.features[d].left.widening:0),0);
  return{original,result:original+v.widening,added:v.widening,residual:v.residual,medianDeficit,curbDeficit,required:medianDeficit+curbDeficit};
}

export function corridorWarning(a:Arm):string|null{
  const s=sectionImpact(a);
  if(s.medianDeficit>1e-6)return `Engineering Warning — รูปแบบไฟล์เดิมต้องใช้พื้นที่เกาะกลางเพิ่ม ${s.medianDeficit.toFixed(2)} ม. กรุณาเปลี่ยนเป็น Auto หรือกำหนดการขยายอย่างชัดเจน`;
  if(s.curbDeficit>1e-6)return `Engineering Warning — รูปแบบไฟล์เดิมมีพื้นที่ริมทางไม่พอ ${s.curbDeficit.toFixed(2)} ม. กรุณาเปลี่ยนเป็น Auto หรือปรับหน้าตัด`;
  return null;
}

export function sectionFeedback(a:Arm):Feedback[]{
  const s=sectionImpact(a),warning=corridorWarning(a),out:Feedback[]=[];
  if(warning)out.push({level:'engineering',message:warning});
  if(s.added>1e-6)out.push({level:'engineering',message:`ขยายแนวถนนรวม ${s.added.toFixed(2)} ม. ต้องตรวจสอบพื้นที่จริง/เขตทาง`});
  if(s.residual<a.median-1e-6){
    const trees={...medianTreeDefaults(),...a.medianTrees};
    const affected:string[]=[];
    if(a.crossing)affected.push('พื้นที่พักคนข้าม');
    if(trees.enabled)affected.push('ภูมิทัศน์/ต้นไม้');
    if(s.residual<=1e-6)affected.push('หน้าที่เกาะกลาง');
    out.push({
      level:affected.length?'engineering':'note',
      message:`ใช้พื้นที่เกาะกลาง เหลือ ${s.residual.toFixed(2)} ม.${affected.length?` — ทบทวน ${affected.join(', ')}`:''}`
    });
  }
  out.push({level:'note',message:'ขนาดแนวถนนอ้างอิงเลนหลัก + เกาะกลาง + แถบหน้าตัด + ทางเท้า ช่วงโค้ง/Slip lane อาจต้องใช้พื้นที่เพิ่มเติม'});
  return out;
}
