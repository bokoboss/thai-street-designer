'use client';
import {
  linkLaneCounts,parallelCorridorForLink,transferTerminalHostRole,transferTerminalPlacement,
  type LinkDirection,type NetworkProject,type ParallelCorridorSide,type RoadLink,type TransferTerminal,type TransferTerminalEdge,type TransferTerminalInput
} from '@/lib/network-project';

type Props={
  project:NetworkProject;
  selectedLink?:RoadLink;
  selectedTerminal?:TransferTerminal;
  onAdd:()=>void;
  onUpdate:(patch:Partial<TransferTerminalInput>)=>boolean;
  onRemove:()=>void;
  onSelectTerminal:(id:string)=>void;
};

const directionLabel:Record<LinkDirection,string>={forward:'FROM → TO',backward:'TO → FROM'};

export default function TransferTerminalPanel({project,selectedLink,selectedTerminal,onAdd,onUpdate,onRemove,onSelectTerminal}:Props){
  if(selectedTerminal){
    const placement=transferTerminalPlacement(project,selectedTerminal),host=project.links.find(v=>v.id===selectedTerminal.hostLinkId),role=transferTerminalHostRole(project,selectedTerminal),corridor=project.parallelCorridors.find(v=>v.id===selectedTerminal.corridorId),
      sides:ParallelCorridorSide[]=role?.role==='frontage'&&role.side?[role.side]:(corridor?.frontage.map(v=>v.side)??[selectedTerminal.side]),
      forward=host?linkLaneCounts(project,host,'forward'):null,backward=host?linkLaneCounts(project,host,'backward'):null,
      forwardValid=!!forward&&forward.from>0&&forward.to>0,backwardValid=!!backward&&backward.from>0&&backward.to>0;
    return <section className="network-transfer-panel" data-network-transfer-panel="terminal" data-network-transfer-selected={selectedTerminal.id}>
      <div className="network-arm-editor-head"><span>TRANSFER TERMINAL</span><b>{selectedTerminal.name}</b></div>
      <div className="network-transfer-meta"><span><b>{selectedTerminal.id}</b>{role?.role==='mainline'?'Mainline':'Frontage '+(role?.side??selectedTerminal.side).toUpperCase()}</span><span><b>{host?.name??selectedTerminal.hostLinkId}</b>{corridor?.name??selectedTerminal.corridorId}</span></div>
      <div className="network-transfer-grid">
        <label>Side<select data-network-transfer-side value={selectedTerminal.side} disabled={sides.length<2} onChange={e=>onUpdate({side:e.target.value as ParallelCorridorSide})}>{sides.map(side=><option key={side} value={side}>{side.toUpperCase()}</option>)}</select></label>
        <label>Traffic direction<select data-network-transfer-direction value={selectedTerminal.direction} onChange={e=>onUpdate({direction:e.target.value as LinkDirection})}><option value="forward" disabled={!forwardValid}>{directionLabel.forward}</option><option value="backward" disabled={!backwardValid}>{directionLabel.backward}</option></select></label>
        <label>Road edge<select data-network-transfer-edge value={selectedTerminal.edge} onChange={e=>onUpdate({edge:e.target.value as TransferTerminalEdge})}><option value="curb">Curb edge</option><option value="median">Median edge</option></select></label>
        <label>Position along host (%)<input data-network-transfer-position key={selectedTerminal.id+'-'+selectedTerminal.position} type="number" min="1" max="99" step="1" defaultValue={+(selectedTerminal.position*100).toFixed(1)} onBlur={e=>{const value=Number(e.currentTarget.value)/100;if(!onUpdate({position:value}))e.currentTarget.value=(selectedTerminal.position*100).toFixed(1);}}/></label>
      </div>
      <div className="network-transfer-station" data-network-transfer-station={placement?.station.toFixed(3)}><span>Resolved placement</span><b>{placement?placement.station.toFixed(1)+' / '+placement.total.toFixed(1)+' m':'unresolved'}</b><small>{placement?'Host tangent '+placement.angle.toFixed(1)+'° · position '+(selectedTerminal.position*100).toFixed(1)+'%':'ตรวจ host RoadLink'}</small></div>
      <button className="network-transfer-remove" data-network-transfer-remove onClick={onRemove}>ลบ Transfer Terminal</button>
      <p className="network-note">Terminal เป็น topology point บน RoadLink เดิมเท่านั้น · ตำแหน่ง world/tangent resolve จาก alignment ปัจจุบัน ไม่มี copied XY และยังไม่มี ramp pavement ใน Phase 8B.1.</p>
    </section>;
  }
  if(!selectedLink)return null;
  const membership=parallelCorridorForLink(project,selectedLink.id),terminals=project.transferTerminals.filter(v=>v.hostLinkId===selectedLink.id);
  return <section className="network-transfer-panel" data-network-transfer-panel={membership?'link':'unavailable'}>
    <div className="network-arm-editor-head"><span>TRANSFER TERMINALS</span><b>{terminals.length} on this RoadLink</b></div>
    {membership?<>
      <div className="network-transfer-host"><span>HOST ROLE</span><b>{membership.role==='mainline'?'MAINLINE':'FRONTAGE · '+membership.side?.toUpperCase()}</b><small>{membership.corridor.name} · {membership.corridor.id}</small></div>
      <button className="network-transfer-add" data-network-transfer-add onClick={onAdd}>＋ Add terminal at 50%</button>
      {terminals.length>0&&<div className="network-transfer-list">{terminals.map(terminal=>{const placement=transferTerminalPlacement(project,terminal);return <button type="button" key={terminal.id} data-network-transfer-select={terminal.id} onClick={()=>onSelectTerminal(terminal.id)}><span>{terminal.side.toUpperCase()} · {directionLabel[terminal.direction]} · {terminal.edge}</span><b>{terminal.name}</b><em>{placement?placement.station.toFixed(1)+' m':(terminal.position*100).toFixed(0)+'%'}</em></button>;})}</div>}
      <p className="network-note">เพิ่ม terminal ก่อน แล้วเลือก marker/รายการเพื่อปรับ Side, Direction, Edge และตำแหน่งบน host. ระบบยังไม่สร้าง connector หรือ merge/diverge lane ให้เอง.</p>
    </>:<p className="network-note">RoadLink ต้องเป็น Mainline หรือ Frontage ของ Parallel Corridor ก่อน จึงจะเพิ่ม Transfer Terminal ได้.</p>}
  </section>;
}
