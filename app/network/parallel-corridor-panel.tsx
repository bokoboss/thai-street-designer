'use client';
import {
  parallelCorridorChainOrientation,parallelCorridorForLink,
  type NetworkProject,
  type ParallelCorridorSide,
  type ParallelCorridorMemberRole,
  type RoadLink
} from '@/core/network/network-project';

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
  const seedControls=(modes:SeedMode[])=>modes.length?<div className="network-parallel-seed" data-network-parallel-seed="true"><div className="network-parallel-seed-head"><span>สร้างทางขนานอัตโนมัติ</span><b>แก้ไขได้หลังสร้าง</b></div><div className="network-parallel-reference" data-network-parallel-reference={seedStart+'>'+seedEnd}><span>ทิศอ้างอิงซ้าย/ขวา</span><b>{junctionLabel(seedStart)} → {junctionLabel(seedEnd)}</b><small>ซ้าย/ขวาอ้างอิงเมื่อมองจากต้นทาง → ปลายทาง</small></div><label>ระยะห่างแนวศูนย์กลาง (ม.)<input data-network-parallel-seed-offset type="number" min="20" max="200" step="5" value={seedOffset} onChange={e=>onSeedOffset(Number(e.target.value))}/></label><div className="network-parallel-seed-actions" data-network-parallel-seed-count={modes.length}>{modes.map(mode=><button key={mode} data-network-parallel-seed-action={mode} onClick={()=>onSeed(mode)}>{mode==='both'?'Generate Both':`Generate ${mode==='left'?'Left':'Right'}`}</button>)}</div><p><strong>ต้องตรวจหลังสร้าง ·</strong> สร้างถนนและทางแยกเป็นแบบตั้งต้นครั้งเดียว ระยะห่างไม่ถูกล็อก · ไม่สร้างทางเชื่อมหรือเชื่อมถนนตัดขวางให้อัตโนมัติ</p></div>:null;
  return <div className="network-parallel-panel" data-network-parallel-panel={membership?'member':draftMainlineId?'draft':'available'} data-network-parallel-draft={draftMainlineId??undefined}>
    <div className="network-arm-editor-head"><span>ถนนหลักและทางขนาน</span><b>{corridor?.name??(draftLink?'กำลังสร้างกลุ่ม':'')}</b></div>
    {membership&&corridor?<>
      <div className="network-parallel-role"><span>Selected role</span><b>{membership.role==='mainline'?'MAINLINE':'FRONTAGE · '+membership.side?.toUpperCase()}</b></div>
      {orientation&&<div className="network-parallel-reference" data-network-parallel-reference={orientation.startJunctionId+'>'+orientation.endJunctionId}><span>REFERENCE DIRECTION</span><b>{junctionLabel(orientation.startJunctionId)} → {junctionLabel(orientation.endJunctionId)}</b><small>Left/Right = มองไปตามทิศนี้</small><button type="button" data-network-parallel-action="reverse-reference" onClick={onReverseReference}>กลับทิศอ้างอิง</button></div>}
      <div className="network-parallel-members">
        <div><span>MAINLINE</span>{corridor.mainlineLinkIds.map(id=>memberButton(id,'mainline'))}</div>
        {corridor.frontage.map(chain=><div key={chain.side}><span>FRONTAGE · {chain.side.toUpperCase()}</span>{chain.linkIds.map(id=>memberButton(id,chain.side))}</div>)}
      </div>
      {seedReviewChains.length>0&&<div className="network-parallel-seed-review" data-network-parallel-seed-review="true"><div className="network-parallel-seed-head"><span>SEED REVIEW POINTS</span><b>{seedReviewChains.reduce((sum,chain)=>sum+(chain.seedReviewJunctionIds?.length??0),0)} Junctions</b></div>{seedReviewChains.map(chain=><div key={chain.side} className="network-parallel-seed-review-row"><div><b>Frontage {chain.side.toUpperCase()}</b><span>{(chain.seedReviewJunctionIds??[]).map(junctionLabel).join(' · ')}</span></div><button data-network-parallel-mark-reviewed={chain.side} onClick={()=>onMarkSeedReviewed(chain.side)}>Mark {chain.side} reviewed</button></div>)}<p>ทางขนานที่สร้างอัตโนมัติเป็นแบบตั้งต้น · ตรวจการเชื่อมถนนตัดขวาง การควบคุม และรายละเอียดก่อนบันทึกว่าตรวจแล้ว</p></div>}
      {seedControls(missingSides)}
      <div className="network-parallel-actions"><button data-network-parallel-action="remove-member" onClick={onRemoveMembership}>ถอด Road Link นี้ออกจากกลุ่ม</button><button className="danger" data-network-parallel-action="dissolve" onClick={onDissolve}>ยุบกลุ่ม</button></div>
      <p className="network-note">การถอดหรือยุบกลุ่มไม่ลบถนน · ถอดได้เฉพาะถนนที่อยู่ปลายลำดับ</p>
    </>:<>
      {draftMainlineId&&draftLink?<div className="network-parallel-draft-card"><div><span>เลือกถนนหลักแล้ว</span><b>{linkLabel(draftMainlineId)}</b></div>{selectedLink.id===draftMainlineId?<p>เลือกถนนอื่นที่ยังไม่อยู่ในกลุ่ม แล้วกำหนดเป็นทางขนานซ้ายหรือขวา</p>:<div className="network-parallel-actions"><button data-network-parallel-action="finalize-left" onClick={()=>onFinalizeDraft('left')}>ใช้ {selectedLink.id} เป็น Frontage Left</button><button data-network-parallel-action="finalize-right" onClick={()=>onFinalizeDraft('right')}>ใช้ {selectedLink.id} เป็น Frontage Right</button></div>}<button className="network-parallel-cancel" data-network-parallel-action="cancel-draft" onClick={onCancelDraft}>ยกเลิก</button></div>:<>
        <button className="network-parallel-start" data-network-parallel-action="start" onClick={onStartDraft}>เริ่ม Parallel Corridor ใหม่ · ใช้ {selectedLink.id} เป็น Mainline</button>
        {seedControls(['left','right','both'])}
      </>}
      {!draftMainlineId&&project.parallelCorridors.length>0&&<div className="network-parallel-existing"><label>เพิ่ม Road Link นี้เข้ากลุ่ม<select data-network-parallel-target value={target?.id??''} onChange={e=>onTargetCorridor(e.target.value)}>{project.parallelCorridors.map(item=><option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><div className="network-parallel-add-grid"><button data-network-parallel-action="add-mainline" disabled={!target} onClick={()=>onAddToTarget('mainline')}>＋ Mainline</button><button data-network-parallel-action="add-left" disabled={!target} onClick={()=>onAddToTarget('frontage','left')}>＋ Frontage Left</button><button data-network-parallel-action="add-right" disabled={!target} onClick={()=>onAddToTarget('frontage','right')}>＋ Frontage Right</button></div></div>}
      
    </>}
  </div>;
}
