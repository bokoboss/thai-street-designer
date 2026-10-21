// Capture junction edits back into road-leg treatments (ADR-0002, limit L5).
// The Junction editor works on arm slots. After an edit, captureTreatments() compares the
// edited junctions with a plain compile of the same roads and stores every junction-owned
// difference against its road leg, so the next compile re-binds it to the right arm.
import {initial} from '../junction/model';
import type {NetworkProject} from '../network/network-project';
import {compileRoadNetwork,type CompileOptions,type Decision,type JunctionTreatments,type Road} from './derive';
import {DESIGN_FIELDS,LEG_FIELDS,ROAD_FIELDS,legKey,type DesignSettings,type LegKey,type LegSlip,type LegTreatment} from './leg-binding';

export * from './leg-binding';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const ROAD_FIELD_LABEL:Record<typeof ROAD_FIELDS[number],string>={
  incoming:'จำนวนช่องขาเข้า',outgoing:'จำนวนช่องขาออก',width:'ความกว้างช่องจราจร',median:'เกาะกลาง',walk:'ทางเท้า',bands:'แถบริมทาง',
  incomingSection:'หน้าตัดขาเข้า',outgoingSection:'หน้าตัดขาออก',angle:'มุมขา',length:'ความยาวขา',name:'ชื่อขา',
};

export type CaptureResult={decisions:Decision[];issues:string[]};

export function captureTreatments(roads:Road[],decisions:Decision[],edited:NetworkProject,options:CompileOptions={}):CaptureResult{
  // Baseline keeps the authored approach zones, so only edits made on the junction show up as differences.
  const plain=compileRoadNetwork(roads,decisions.map(d=>({...d,treatments:d.treatments?.approaches?{approaches:d.treatments.approaches}:undefined})),options),issues:string[]=[];
  const roadName=new Map(roads.map(r=>[r.id,r.name]));
  const confirmed=decisions.filter(d=>d.decision==='junction');
  const next=decisions.map(d=>{
    const index=confirmed.indexOf(d);if(index<0)return d;
    const id=`J-${index+1}`,base=plain.project.junctions.find(j=>j.id===id),mine=edited.junctions.find(j=>j.id===id);
    if(!base||!mine)return d;
    const legs=plain.legs.filter(l=>l.junctionId===id),keyOf=(armId:number)=>{const l=legs.find(x=>x.armId===armId);return l?legKey(l.roadId,l.side):undefined;};
    const treatments:JunctionTreatments=d.treatments?.approaches?{approaches:structuredClone(d.treatments.approaches)}:{};
    const legTreatments:Partial<Record<LegKey,LegTreatment>>={};
    for(const leg of legs){
      const a=mine.design.arms[leg.armId],b=base.design.arms[leg.armId],key=legKey(leg.roadId,leg.side),t:LegTreatment={};
      if(!a||!mine.design.enabled[leg.armId])continue;
      for(const field of LEG_FIELDS)if(!same(a[field],b[field]))(t as Record<string,unknown>)[field]=a[field]===undefined?null:structuredClone(a[field]);
      if(Object.keys(t).length)legTreatments[key]=t;
      const changed=ROAD_FIELDS.filter(f=>f!=='length'?!same(a[f],b[f]):Math.abs(a.length-b.length)>.01);
      if(changed.length)issues.push(`${mine.name}: ขา ${roadName.get(leg.roadId)??leg.roadId} ${leg.side==='ahead'?'→':'←'} เปลี่ยน${changed.map(f=>ROAD_FIELD_LABEL[f]).join(' / ')} บนทางแยก — ค่านี้เป็นของถนน ให้แก้ที่ถนน`);
    }
    if(Object.keys(legTreatments).length)treatments.legs=legTreatments;
    const slips:LegSlip[]=[];
    for(const s of mine.design.slips){
      const from=keyOf(s.fromArm),to=keyOf(s.toArm);
      if(!from||!to){issues.push(`${mine.name}: Slip lane อยู่บนขาที่ไม่ได้มาจากถนน`);continue;}
      slips.push({from,to,width:s.width,radius:s.radius,approach:structuredClone(s.approach),departure:structuredClone(s.departure),crossing:{...s.crossing},...(s.arrowOffset!==undefined?{arrowOffset:s.arrowOffset}:{})});
    }
    if(slips.length)treatments.slips=slips;
    const fresh=initial();
    if(mine.design.corner!==fresh.corner)treatments.corner=mine.design.corner;
    const radii:Partial<Record<LegKey,number>>={};
    (mine.design.cornerRadii??[]).forEach((r,armId)=>{const key=keyOf(armId);if(r!==null&&r!==undefined&&key)radii[key]=r;});
    if(Object.keys(radii).length)treatments.cornerRadii=radii;
    const settings:DesignSettings={};
    for(const f of DESIGN_FIELDS)if(f!=='title'?!same(mine.design[f],fresh[f]):mine.design.title!==(d.name??base.design.title))(settings as Record<string,unknown>)[f]=structuredClone(mine.design[f]);
    if(Object.keys(settings).length)treatments.design=settings;
    return {...d,treatments:Object.keys(treatments).length?treatments:undefined};
  });
  return {decisions:next,issues};
}

