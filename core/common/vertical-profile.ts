/** Authored tangent intersections, with optional symmetric parabolic vertical curves. */
export type ProfilePoint={station:number;z:number;curveLength?:number;generatedBy?:string};
export type Profile=ProfilePoint[];
export const sortedProfile=(p?:Profile)=>[...(p??[])].sort((a,b)=>a.station-b.station);

export function resolveVerticalProfile(profile?:Profile){
  const points=sortedProfile(profile);
  const curves=points.flatMap((p,i)=>{
    const length=p.curveLength??0;if(!length||!i||i===points.length-1)return[];
    const a=points[i-1],b=points[i+1],g0=(p.z-a.z)/(p.station-a.station),g1=(b.z-p.z)/(b.station-p.station);
    return[{start:p.station-length/2,end:p.station+length/2,length,z:p.z-g0*length/2,g0,g1}];
  });
  const curveAt=(s:number)=>curves.find(c=>s>=c.start&&s<=c.end);
  const levelAt=(s:number)=>{
    const c=curveAt(s);if(c){const x=s-c.start;return c.z+c.g0*x+(c.g1-c.g0)*x*x/(2*c.length);}
    if(!points.length)return 0;if(s<=points[0].station)return points[0].z;
    for(let i=1;i<points.length;i++)if(s<=points[i].station){const a=points[i-1],b=points[i],t=b.station>a.station?(s-a.station)/(b.station-a.station):1;return a.z+(b.z-a.z)*t;}
    return points.at(-1)!.z;
  };
  const gradeAt=(s:number)=>{
    const c=curveAt(s);if(c)return c.g0+(c.g1-c.g0)*(s-c.start)/c.length;
    if(!points.length||s<points[0].station||s>points.at(-1)!.station)return 0;
    for(let i=1;i<points.length;i++)if(s<=points[i].station)return(points[i].z-points[i-1].z)/(points[i].station-points[i-1].station);
    return 0;
  };
  /** Subdivision limits vertical chord error to 0.5 mm; this is drawing precision, not a design criterion. */
  const sampleStations=(from:number,to:number)=>{
    const stations=new Set([from,to,...points.map(p=>p.station).filter(s=>s>from&&s<to)]);
    for(const c of curves){const a=Math.max(from,c.start),b=Math.min(to,c.end);if(b<=a)continue;
      const step=Math.sqrt(8*.0005*c.length/(Math.abs(c.g1-c.g0)||1e-30)),n=Math.max(1,Math.ceil((b-a)/step));
      for(let i=0;i<=n;i++)stations.add(a+(b-a)*i/n);
    }
    return[...stations].sort((a,b)=>a-b);
  };
  return{points,curves,levelAt,gradeAt,sampleStations};
}
export const levelAt=(profile:Profile|undefined,s:number)=>resolveVerticalProfile(profile).levelAt(s);
export const gradeAt=(profile:Profile|undefined,s:number)=>resolveVerticalProfile(profile).gradeAt(s);
export function verticalSlice(profile:Profile,from:number,to:number):Profile{
  const solved=resolveVerticalProfile(profile);
  return solved.sampleStations(from,to).map(s=>({station:s-from,z:solved.levelAt(s)}));
}

/** Input limits bound data size; optional curve lengths are always entered explicitly. */
export function profileError(p:unknown):string|null{
  if(p===undefined)return null;
  if(!Array.isArray(p)||p.length>64)return 'แนวดิ่งต้องมีไม่เกิน 64 จุด';
  if(!p.every(q=>q&&Number.isFinite(q.station)&&q.station>=0&&Number.isFinite(q.z)&&Math.abs(q.z)<=200))return 'ค่าระยะหรือระดับในแนวดิ่งไม่ถูกต้อง';
  const points=sortedProfile(p);
  for(let i=0;i<points.length;i++){
    const q=points[i],length=q.curveLength??0;
    if(i&&q.station-points[i-1].station<.01)return 'จุดแนวดิ่งสองจุดอยู่ที่ระยะเดียวกัน';
    if(q.generatedBy!==undefined&&(typeof q.generatedBy!=='string'||!q.generatedBy||q.generatedBy.length>160))return 'ข้อมูลเจ้าของจุดระดับที่สร้างไม่ถูกต้อง';
    if(q.curveLength!==undefined&&(typeof q.curveLength!=='number'||!Number.isFinite(length)||length<0||length>1e7))return 'ความยาวโค้งดิ่งต้องเป็นจำนวนที่ไม่ติดลบ';
    if(length&&(!i||i===points.length-1||q.station-length/2<=points[i-1].station||q.station+length/2>=points[i+1].station))return `โค้งดิ่งที่ระยะ ${q.station} ม. ยาวเกินช่วง — ปลายโค้งต้องอยู่ภายในแนวลาดก่อนและหลังจุดระดับ`;
    if(i&&q.station-length/2<points[i-1].station+(points[i-1].curveLength??0)/2-1e-8)return 'ช่วงโค้งดิ่งซ้อนกัน — ลดความยาวหรือย้ายจุดระดับ';
  }
  return null;
}

/** A manual edit takes ownership of a generated point. Unchanged records retain their owner. */
export function authoredProfile(next:Profile,previous?:Profile):Profile{
  return next.map(q=>{
    const was=previous?.find(p=>p.station===q.station&&p.z===q.z&&(p.curveLength??0)===(q.curveLength??0)&&p.generatedBy===q.generatedBy);
    if(was||!q.generatedBy)return{...q};
    const {generatedBy:_owner,...point}=q;void _owner;return point;
  });
}
