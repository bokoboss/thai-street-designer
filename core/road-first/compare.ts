// Compare two road-first scenarios (roadmap Phase 3 slice 5). Objects are matched by their stable
// identity in the authored model — road id and crossing id — not by compiled J-/L- numbers, so adding
// a road in one alternative does not make unrelated objects look changed.
import {pocketsFor} from '../junction/model';
import {activeArmIds,portPoint,type JunctionInstance} from '../network/network-project';
import {stations,type CompileResult,type Decision,type Road} from './derive';
import {compileRoadFirstProject,type RoadFirstProject} from './project';

export type DeltaStatus='added'|'removed'|'changed';
export type DeltaTarget={kind:'road';id:string}|{kind:'junction';id:string};
export type Bounds={x:number;y:number;w:number;h:number};
export type ScenarioDelta={target:DeltaTarget;name:string;status:DeltaStatus;changes:string[];bounds:Bounds|null};
export type ScenarioMetric={key:string;label:string;unit?:string;reference:number;active:number;delta:number};
export type ScenarioDiff={deltas:ScenarioDelta[];metrics:ScenarioMetric[];counts:Record<DeltaStatus,number>};

const json=(v:unknown)=>JSON.stringify(v??null);
const r2=(v:number)=>Math.round(v*100)/100;
function boundsOf(points:{x:number;y:number}[],margin=12):Bounds|null{
  if(!points.length)return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs)-margin,y=Math.min(...ys)-margin;
  return{x,y,w:Math.max(24,Math.max(...xs)+margin-x),h:Math.max(24,Math.max(...ys)+margin-y)};
}
const junctionOf=(c:CompileResult,candidateId:string)=>{
  const jid=Object.keys(c.sources.junctions).find(k=>c.sources.junctions[k]===candidateId);
  return c.project.junctions.find(j=>j.id===jid);
};
const junctionPoints=(j:JunctionInstance|undefined)=>j?[{x:j.x,y:j.y},...activeArmIds(j).map(a=>portPoint(j,a))]:[];

function roadChanges(a:Road,b:Road){
  const out:string[]=[];
  if(json(a.points)!==json(b.points))out.push('แนวถนน');
  if(json(a.section)!==json(b.section))out.push('หน้าตัด');
  if((a.role??null)!==(b.role??null))out.push('ชนิดถนน');
  if(json(a.openings??[])!==json(b.openings??[]))out.push('ช่องเปิดเกาะกลาง');
  if(json(a.ends)!==json(b.ends)||json(a.links)!==json(b.links))out.push('ช่วงเปลี่ยนหน้าตัด');
  if(a.name!==b.name)out.push('ชื่อ');
  return out;
}
function junctionChanges(a:Decision,b:Decision,roadsMoved:boolean){
  const ta=a.treatments??{},tb=b.treatments??{},legs=(t:typeof ta)=>Object.entries(t.legs??{});
  // Only legs that set one of the fields count, so a pocket on a leg is not read as a control change.
  const pick=(t:typeof ta,fields:string[])=>json(legs(t).flatMap(([k,v])=>{const vals=fields.map(f=>(v as Record<string,unknown>)[f]);return vals.some(x=>x!==undefined)?[[k,...vals]]:[];}));
  const out:string[]=[];
  if(roadsMoved)out.push('รูปทรงตามถนน');
  if(pick(ta,['incomingPockets','outgoingPockets'])!==pick(tb,['incomingPockets','outgoingPockets']))out.push('เลนเลี้ยว');
  if(json(ta.slips)!==json(tb.slips))out.push('Slip lane');
  if(json(ta.corner)!==json(tb.corner)||json(ta.cornerRadii)!==json(tb.cornerRadii))out.push('รัศมีมุม');
  if(json(ta.approaches)!==json(tb.approaches))out.push('ช่วงเข้าทางแยก');
  if(pick(ta,['crossing','signal','stop','crossOffset','stopOffset'])!==pick(tb,['crossing','signal','stop','crossOffset','stopOffset']))out.push('ทางข้าม / สัญญาณ / เส้นหยุด');
  if(a.name!==b.name)out.push('ชื่อ');
  if(out.length===(roadsMoved?1:0)&&json(ta)!==json(tb))out.push('การตั้งค่าอื่น');
  return out;
}

function metrics(p:RoadFirstProject,c:CompileResult){
  let mainLanes=0,turnLanes=0,slips=0;
  for(const j of c.project.junctions){
    slips+=j.design.slips.length;
    for(const i of activeArmIds(j)){const a=j.design.arms[i],pk=pocketsFor(a,'incoming');mainLanes+=a.incoming;turnLanes+=pk.left.lanes+pk.right.lanes;}
  }
  return{roads:p.roads.length,length:r2(p.roads.reduce((s,r)=>s+(stations(r.points).at(-1)??0),0)),junctions:c.project.junctions.length,mainLanes,turnLanes,slips};
}
const METRICS:{key:keyof ReturnType<typeof metrics>;label:string;unit?:string}[]=[
  {key:'roads',label:'ถนน'},{key:'length',label:'ความยาวถนนรวม',unit:'ม.'},{key:'junctions',label:'ทางแยก'},
  {key:'mainLanes',label:'ช่องจราจรขาเข้าทางแยก'},{key:'turnLanes',label:'เลนเลี้ยว'},{key:'slips',label:'Slip lane'},
];

export function compareScenarios(reference:RoadFirstProject,active:RoadFirstProject):ScenarioDiff{
  const rc=compileRoadFirstProject(reference),ac=compileRoadFirstProject(active),deltas:ScenarioDelta[]=[];
  const refRoads=new Map(reference.roads.map(r=>[r.id,r])),actRoads=new Map(active.roads.map(r=>[r.id,r]));
  const moved=new Set<string>();
  for(const r of reference.roads)if(!actRoads.has(r.id))deltas.push({target:{kind:'road',id:r.id},name:r.name,status:'removed',changes:[],bounds:boundsOf(r.points)});
  for(const r of active.roads){
    const was=refRoads.get(r.id);
    if(!was){deltas.push({target:{kind:'road',id:r.id},name:r.name,status:'added',changes:[],bounds:boundsOf(r.points)});continue;}
    const changes=roadChanges(was,r);
    if(json(was.points)!==json(r.points)||json(was.section)!==json(r.section))moved.add(r.id);
    if(changes.length)deltas.push({target:{kind:'road',id:r.id},name:r.name,status:'changed',changes,bounds:boundsOf([...was.points,...r.points])});
  }
  const built=(p:RoadFirstProject,c:CompileResult)=>new Map(p.decisions.filter(d=>d.decision==='junction'&&junctionOf(c,d.candidateId)).map(d=>[d.candidateId,d]));
  const refJ=built(reference,rc),actJ=built(active,ac);
  const name=(d:Decision,c:CompileResult)=>d.name??junctionOf(c,d.candidateId)?.name??'ทางแยก';
  for(const [id,d] of refJ)if(!actJ.has(id))deltas.push({target:{kind:'junction',id},name:name(d,rc),status:'removed',changes:[],bounds:boundsOf(junctionPoints(junctionOf(rc,id)))});
  for(const [id,d] of actJ){
    const was=refJ.get(id),j=junctionOf(ac,id);
    if(!was){deltas.push({target:{kind:'junction',id},name:name(d,ac),status:'added',changes:[],bounds:boundsOf(junctionPoints(j))});continue;}
    // Arm lengths follow their content (a longer pocket lengthens the arm), so only road edits count as a shape change.
    const roadsMoved=(d.roads??[]).some(r=>moved.has(r));
    const changes=junctionChanges(was,d,roadsMoved);
    if(changes.length)deltas.push({target:{kind:'junction',id},name:name(d,ac),status:'changed',changes,bounds:boundsOf([...junctionPoints(junctionOf(rc,id)),...junctionPoints(j)])});
  }
  const mr=metrics(reference,rc),ma=metrics(active,ac);
  return{
    deltas,
    metrics:METRICS.map(m=>({key:m.key,label:m.label,unit:m.unit,reference:mr[m.key],active:ma[m.key],delta:r2(ma[m.key]-mr[m.key])})),
    counts:{added:deltas.filter(d=>d.status==='added').length,removed:deltas.filter(d=>d.status==='removed').length,changed:deltas.filter(d=>d.status==='changed').length},
  };
}
