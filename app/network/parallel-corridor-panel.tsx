'use client';
import {
  parallelCorridorForLink,
  type NetworkProject,
  type ParallelCorridorSide,
  type ParallelCorridorMemberRole,
  type RoadLink
} from '@/lib/network-project';

type Props={
  project:NetworkProject;
  selectedLink:RoadLink;
  draftMainlineId:string|null;
  targetCorridorId:string;
  onStartDraft:()=>void;
  onCancelDraft:()=>void;
  onFinalizeDraft:(side:ParallelCorridorSide)=>void;
  onTargetCorridor:(id:string)=>void;
  onAddToTarget:(role:ParallelCorridorMemberRole,side?:ParallelCorridorSide)=>void;
  onRemoveMembership:()=>void;
  onDissolve:()=>void;
  onSelectLink:(id:string)=>void;
};

export default function ParallelCorridorPanel({
  project,selectedLink,draftMainlineId,targetCorridorId,onStartDraft,onCancelDraft,onFinalizeDraft,onTargetCorridor,onAddToTarget,onRemoveMembership,onDissolve,onSelectLink
}:Props){
  const membership=parallelCorridorForLink(project,selectedLink.id),corridor=membership?.corridor,
    draftLink=draftMainlineId?project.links.find(v=>v.id===draftMainlineId):undefined,
    target=project.parallelCorridors.find(v=>v.id===targetCorridorId)??project.parallelCorridors[0];
  const linkLabel=(id:string)=>{const link=project.links.find(v=>v.id===id);return link?link.name+' · '+id:id;};
  const memberButton=(id:string,role:string)=><button key={role+':'+id} type="button" data-network-parallel-member={id} data-network-parallel-member-role={role} onClick={()=>onSelectLink(id)}><span>{role}</span><b>{linkLabel(id)}</b></button>;
  return <div className="network-parallel-panel" data-network-parallel-panel={membership?'member':draftMainlineId?'draft':'available'} data-network-parallel-draft={draftMainlineId??undefined}>
    <div className="network-arm-editor-head"><span>PARALLEL / FRONTAGE CORRIDOR</span><b>{corridor?.name??(draftLink?'Draft relationship':'Post-v1')}</b></div>
    {membership&&corridor?<>
      <div className="network-parallel-role"><span>Selected role</span><b>{membership.role==='mainline'?'MAINLINE':'FRONTAGE · '+membership.side?.toUpperCase()}</b></div>
      <div className="network-parallel-members">
        <div><span>MAINLINE</span>{corridor.mainlineLinkIds.map(id=>memberButton(id,'mainline'))}</div>
        {corridor.frontage.map(chain=><div key={chain.side}><span>FRONTAGE · {chain.side.toUpperCase()}</span>{chain.linkIds.map(id=>memberButton(id,chain.side))}</div>)}
      </div>
      <div className="network-parallel-actions"><button data-network-parallel-action="remove-member" onClick={onRemoveMembership}>ถอด Road Link นี้ออกจากกลุ่ม</button><button className="danger" data-network-parallel-action="dissolve" onClick={onDissolve}>Dissolve group</button></div>
      <p className="network-note">การถอดสมาชิกไม่ลบ RoadLink. Link ตรงกลาง chain จะถูกปฏิเสธแทนการเรียง topology ใหม่แบบเงียบ ๆ; Dissolve ลบเฉพาะ relationship metadata.</p>
    </>:<>
      {draftMainlineId&&draftLink?<div className="network-parallel-draft-card"><div><span>MAINLINE STAGED</span><b>{linkLabel(draftMainlineId)}</b></div>{selectedLink.id===draftMainlineId?<p>เลือก Road Link อื่นที่ยังไม่อยู่ในกลุ่ม แล้วกำหนดเป็น Frontage Left หรือ Right เพื่อสร้างกลุ่มเป็น transaction เดียว.</p>:<div className="network-parallel-actions"><button data-network-parallel-action="finalize-left" onClick={()=>onFinalizeDraft('left')}>ใช้ {selectedLink.id} เป็น Frontage Left</button><button data-network-parallel-action="finalize-right" onClick={()=>onFinalizeDraft('right')}>ใช้ {selectedLink.id} เป็น Frontage Right</button></div>}<button className="network-parallel-cancel" data-network-parallel-action="cancel-draft" onClick={onCancelDraft}>ยกเลิก draft</button></div>:<button className="network-parallel-start" data-network-parallel-action="start" onClick={onStartDraft}>เริ่ม Parallel Corridor ใหม่ · ใช้ {selectedLink.id} เป็น Mainline</button>}
      {!draftMainlineId&&project.parallelCorridors.length>0&&<div className="network-parallel-existing"><label>เพิ่ม Road Link นี้เข้ากลุ่ม<select data-network-parallel-target value={target?.id??''} onChange={e=>onTargetCorridor(e.target.value)}>{project.parallelCorridors.map(item=><option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><div className="network-parallel-add-grid"><button data-network-parallel-action="add-mainline" disabled={!target} onClick={()=>onAddToTarget('mainline')}>＋ Mainline</button><button data-network-parallel-action="add-left" disabled={!target} onClick={()=>onAddToTarget('frontage','left')}>＋ Frontage Left</button><button data-network-parallel-action="add-right" disabled={!target} onClick={()=>onAddToTarget('frontage','right')}>＋ Frontage Right</button></div></div>}
      <p className="network-note">Relationship เก็บเฉพาะ membership ของ RoadLink เดิม ไม่ copy centerline หรือหน้าตัด. การสร้างอัตโนมัติแบบ offset และ ramp/transfer ยังไม่อยู่ใน Phase 8A.1.</p>
    </>}
  </div>;
}
