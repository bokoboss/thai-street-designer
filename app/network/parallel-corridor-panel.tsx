'use client';
import {
  parallelCorridorChainOrientation,parallelCorridorForLink,
  type NetworkProject,
  type ParallelCorridorSide,
  type ParallelCorridorMemberRole,
  type RoadLink
} from '@/lib/network-project';

type SeedMode=ParallelCorridorSide|'both';
type Props={
  project:NetworkProject;
  selectedLink:RoadLink;
  draftMainlineId:string|null;
  targetCorridorId:string;
  seedOffset:number;
  onSeedOffset:(value:number)=>void;
  onSeed:(mode:SeedMode)=>void;
  onStartDraft:()=>void;
  onCancelDraft:()=>void;
  onFinalizeDraft:(side:ParallelCorridorSide)=>void;
  onTargetCorridor:(id:string)=>void;
  onAddToTarget:(role:ParallelCorridorMemberRole,side?:ParallelCorridorSide)=>void;
  onRemoveMembership:()=>void;
  onDissolve:()=>void;
  onReverseReference:()=>void;
  onMarkSeedReviewed:(side:ParallelCorridorSide)=>void;
  onSelectLink:(id:string)=>void;
};

export default function ParallelCorridorPanel({
  project,selectedLink,draftMainlineId,targetCorridorId,seedOffset,onSeedOffset,onSeed,onStartDraft,onCancelDraft,onFinalizeDraft,onTargetCorridor,onAddToTarget,onRemoveMembership,onDissolve,onReverseReference,onMarkSeedReviewed,onSelectLink
}:Props){
  const membership=parallelCorridorForLink(project,selectedLink.id),corridor=membership?.corridor,
    draftLink=draftMainlineId?project.links.find(v=>v.id===draftMainlineId):undefined,
    target=project.parallelCorridors.find(v=>v.id===targetCorridorId)??project.parallelCorridors[0],
    missingSides:ParallelCorridorSide[]=corridor?(['left','right'] as ParallelCorridorSide[]).filter(side=>!corridor.frontage.some(chain=>chain.side===side)):[],
    seedReviewChains=corridor?.frontage.filter(chain=>(chain.seedReviewJunctionIds?.length??0)>0)??[],
    orientation=corridor?parallelCorridorChainOrientation(project,corridor.mainlineLinkIds,corridor.mainlineStartJunctionId):null,
    seedStart=orientation?.startJunctionId??selectedLink.from.junctionId,
    seedEnd=orientation?.endJunctionId??selectedLink.to.junctionId;
  const linkLabel=(id:string)=>{const link=project.links.find(v=>v.id===id);return link?link.name+' · '+id:id;};
  const junctionLabel=(id:string)=>{const junction=project.junctions.find(v=>v.id===id);return junction?junction.name+' · '+id:id;};
  const memberButton=(id:string,role:string)=><button key={role+':'+id} type="button" data-network-parallel-member={id} data-network-parallel-member-role={role} onClick={()=>onSelectLink(id)}><span>{role}</span><b>{linkLabel(id)}</b></button>;
  const seedControls=(modes:SeedMode[])=>modes.length?<div className="network-parallel-seed" data-network-parallel-seed="true"><div className="network-parallel-seed-head"><span>ASSISTED FRONTAGE · สร้างแนวตั้งต้นครั้งเดียว</span><b>แก้ไขอิสระหลังสร้าง</b></div><div className="network-parallel-reference" data-network-parallel-reference={seedStart+'>'+seedEnd}><span>ทิศอ้างอิง · LEFT / RIGHT</span><b>{junctionLabel(seedStart)} → {junctionLabel(seedEnd)}</b><small>ซ้าย/ขวาอ้างอิงเมื่อมองจากต้นทาง → ปลายทาง</small></div><label>ระยะเยื้องแนวศูนย์กลางเริ่มต้น (m)<input data-network-parallel-seed-offset type="number" min="20" max="200" step="5" value={seedOffset} onChange={e=>onSeedOffset(Number(e.target.value))}/></label><div className="network-parallel-seed-actions" data-network-parallel-seed-count={modes.length}>{modes.map(mode=><button key={mode} data-network-parallel-seed-action={mode} onClick={()=>onSeed(mode)}>{mode==='both'?'สร้างทั้งสองฝั่ง':`สร้าง Frontage ${mode==='left'?'ซ้าย':'ขวา'}`}</button>)}</div><p><strong>ต้องตรวจทาน.</strong> ระบบสร้าง Junction/RoadLink จริงเป็น geometry ตั้งต้นครั้งเดียว · หลังสร้างแก้ได้อิสระและไม่ผูก offset ถาวร · ไม่สร้าง ramp หรือเชื่อม cross street อัตโนมัติ.</p></div>:null;
  return <div className="network-parallel-panel" data-network-parallel-panel={membership?'member':draftMainlineId?'draft':'available'} data-network-parallel-draft={draftMainlineId??undefined}>
    <div className="network-arm-editor-head"><span>PARALLEL / FRONTAGE CORRIDOR</span><b>{corridor?.name??(draftLink?'Draft relationship':'Post-v1')}</b></div>
    {membership&&corridor?<>
      <div className="network-parallel-role"><span>บทบาทที่เลือก</span><b>{membership.role==='mainline'?'MAINLINE':'FRONTAGE · '+membership.side?.toUpperCase()}</b></div>
      {orientation&&<div className="network-parallel-reference" data-network-parallel-reference={orientation.startJunctionId+'>'+orientation.endJunctionId}><span>ทิศอ้างอิง</span><b>{junctionLabel(orientation.startJunctionId)} → {junctionLabel(orientation.endJunctionId)}</b><small>Left/Right = มองไปตามทิศนี้</small><button type="button" data-network-parallel-action="reverse-reference" onClick={onReverseReference}>กลับทิศอ้างอิง</button></div>}
      <div className="network-parallel-members">
        <div><span>MAINLINE</span>{corridor.mainlineLinkIds.map(id=>memberButton(id,'mainline'))}</div>
        {corridor.frontage.map(chain=><div key={chain.side}><span>FRONTAGE · {chain.side.toUpperCase()}</span>{chain.linkIds.map(id=>memberButton(id,chain.side))}</div>)}
      </div>
      {seedReviewChains.length>0&&<div className="network-parallel-seed-review" data-network-parallel-seed-review="true"><div className="network-parallel-seed-head"><span>จุดที่ต้องตรวจหลังสร้าง</span><b>{seedReviewChains.reduce((sum,chain)=>sum+(chain.seedReviewJunctionIds?.length??0),0)} Junctions</b></div>{seedReviewChains.map(chain=><div key={chain.side} className="network-parallel-seed-review-row"><div><b>Frontage {chain.side.toUpperCase()}</b><span>{(chain.seedReviewJunctionIds??[]).map(junctionLabel).join(' · ')}</span></div><button data-network-parallel-mark-reviewed={chain.side} onClick={()=>onMarkSeedReviewed(chain.side)}>ยืนยันตรวจ {chain.side==='left'?'ซ้าย':'ขวา'}</button></div>)}<p>Assisted seed เป็น geometry เริ่มต้นเท่านั้น · ตรวจ cross-street connection, controls และรายละเอียด geometry ก่อนกด reviewed.</p></div>}
      {seedControls(missingSides)}
      <div className="network-parallel-actions"><button data-network-parallel-action="remove-member" onClick={onRemoveMembership}>ถอด Road Link นี้ออกจากกลุ่ม</button><button className="danger" data-network-parallel-action="dissolve" onClick={onDissolve}>ยกเลิกการจัดกลุ่ม</button></div>
      <p className="network-note">การถอดสมาชิกไม่ลบ RoadLink. Link ตรงกลาง chain จะถูกปฏิเสธแทนการเรียง topology ใหม่แบบเงียบ ๆ; Dissolve ลบเฉพาะ relationship metadata.</p>
    </>:<>
      {draftMainlineId&&draftLink?<div className="network-parallel-draft-card"><div><span>MAINLINE ที่กำลังจัดกลุ่ม</span><b>{linkLabel(draftMainlineId)}</b></div>{selectedLink.id===draftMainlineId?<p>เลือก Road Link อื่นที่ยังไม่อยู่ในกลุ่ม แล้วกำหนดเป็น Frontage ซ้าย หรือ Right เพื่อสร้างกลุ่มเป็น transaction เดียว.</p>:<div className="network-parallel-actions"><button data-network-parallel-action="finalize-left" onClick={()=>onFinalizeDraft('left')}>ใช้ {selectedLink.id} เป็น Frontage ซ้าย</button><button data-network-parallel-action="finalize-right" onClick={()=>onFinalizeDraft('right')}>ใช้ {selectedLink.id} เป็น Frontage ขวา</button></div>}<button className="network-parallel-cancel" data-network-parallel-action="cancel-draft" onClick={onCancelDraft}>ยกเลิก draft</button></div>:<>
        <button className="network-parallel-start" data-network-parallel-action="start" onClick={onStartDraft}>เริ่ม Parallel Corridor ใหม่ · ใช้ {selectedLink.id} เป็น Mainline</button>
        {seedControls(['left','right','both'])}
      </>}
      {!draftMainlineId&&project.parallelCorridors.length>0&&<div className="network-parallel-existing"><label>เพิ่ม Road Link นี้เข้ากลุ่ม<select data-network-parallel-target value={target?.id??''} onChange={e=>onTargetCorridor(e.target.value)}>{project.parallelCorridors.map(item=><option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><div className="network-parallel-add-grid"><button data-network-parallel-action="add-mainline" disabled={!target} onClick={()=>onAddToTarget('mainline')}>＋ Mainline</button><button data-network-parallel-action="add-left" disabled={!target} onClick={()=>onAddToTarget('frontage','left')}>＋ Frontage ซ้าย</button><button data-network-parallel-action="add-right" disabled={!target} onClick={()=>onAddToTarget('frontage','right')}>＋ Frontage ขวา</button></div></div>}
      <p className="network-note">Relationship เก็บเฉพาะ membership ของ RoadLink เดิม. Assisted seed ใน 8A.2 สร้าง geometry จริงครั้งเดียวแล้วคืน ownership ให้ Junction/RoadLink เดิม; ramp/transfer ยังอยู่ Phase 8B.</p>
    </>}
  </div>;
}
