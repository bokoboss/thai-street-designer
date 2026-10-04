'use client';
import {useState} from 'react';
import {
  addTransferConnector,addTransferPort,linkLength,updateTransferConnector,updateTransferConnectorTerminalTreatment,updateTransferPort,
  type LinkDirection,type NetworkProject,type TransferGoreLevel,type TransferTerminalGoreTreatment,type TransferTerminalKind
} from '@/lib/network-project';
import {applyTransferTerminalLaneTreatment,removeTransferTerminalLaneTreatment} from '@/lib/transfer-terminal-treatment';
import {resolveTransferConnectorGores} from '@/lib/transfer-geometry';
import type {NetworkSelection} from './network-drawing';

type Props={
  project:NetworkProject;
  selection:NetworkSelection;
  onCommit:(next:NetworkProject,message:string,nextSelection?:NetworkSelection)=>void;
  onSelect:(selection:NetworkSelection)=>void;
  onNotice:(message:string)=>void;
  placementActive:boolean;
  onStartPlacement:(draft:{direction:LinkDirection;side:'curb'|'median';terminal:TransferTerminalKind})=>void;
  onCancelPlacement:()=>void;
};
type GoreDraft={level:TransferGoreLevel;neutralLength:string;physicalNoseLength:string;physicalNoseWidth:string};
const goreDraft=(value:TransferTerminalGoreTreatment):GoreDraft=>({
  level:value.level,
  neutralLength:value.neutralLength?String(value.neutralLength):'',
  physicalNoseLength:value.physicalNoseLength?String(value.physicalNoseLength):'',
  physicalNoseWidth:value.physicalNoseWidth?String(value.physicalNoseWidth):''
});
const num=(value:string)=>value.trim()===''?0:Number(value);

export default function TransferEditorPanel({project,selection,onCommit,onSelect,onNotice,placementActive,onStartPlacement,onCancelPlacement}:Props){
  const selectedLink=selection?.kind==='link'?project.links.find(link=>link.id===selection.id):undefined,
    selectedPort=selection?.kind==='transfer-port'?project.transferPorts.find(port=>port.id===selection.id):undefined,
    selectedConnector=selection?.kind==='transfer-connector'?project.transferConnectors.find(connector=>connector.id===selection.id):undefined,
    linkPorts=selectedLink?project.transferPorts.filter(port=>port.hostLinkId===selectedLink.id):[],
    connected=selectedPort?project.transferConnectors.find(connector=>connector.fromTransferPortId===selectedPort.id||connector.toTransferPortId===selectedPort.id):undefined,
    portTreatment=selectedPort?project.links.find(link=>link.id===selectedPort.hostLinkId)?.components.filter(component=>component.kind==='lane'&&component.source?.kind==='transfer-terminal'&&component.source.transferPortId===selectedPort.id)??[]:[],
    connectorGores=selectedConnector?resolveTransferConnectorGores(project,selectedConnector):[],
    connectorCandidates=selectedPort&&!connected?project.transferPorts.filter(port=>port.id!==selectedPort.id&&port.hostLinkId!==selectedPort.hostLinkId&&!project.transferConnectors.some(connector=>connector.fromTransferPortId===port.id||connector.toTransferPortId===port.id)&&(selectedPort.terminal==='diverge'?port.terminal==='merge':port.terminal==='diverge')):[];

  const [stationValue,setStationValue]=useState(()=>selectedLink&&linkLength(project,selectedLink)>2?(linkLength(project,selectedLink)/2).toFixed(1):''),
    [direction,setDirection]=useState<LinkDirection>('forward'),[side,setSide]=useState<'curb'|'median'>('curb'),[terminal,setTerminal]=useState<TransferTerminalKind>('diverge'),
    [candidateId,setCandidateId]=useState(()=>connectorCandidates[0]?.id??''),[fullWidth,setFullWidth]=useState(''),[taper,setTaper]=useState(''),
    [fromGore,setFromGore]=useState<GoreDraft>(()=>selectedConnector?goreDraft(selectedConnector.terminalTreatment.from):{level:'none',neutralLength:'',physicalNoseLength:'',physicalNoseWidth:''}),
    [toGore,setToGore]=useState<GoreDraft>(()=>selectedConnector?goreDraft(selectedConnector.terminalTreatment.to):{level:'none',neutralLength:'',physicalNoseLength:'',physicalNoseWidth:''});

  const effectiveCandidate=connectorCandidates.some(port=>port.id===candidateId)?candidateId:(connectorCandidates[0]?.id??'');

  function createPort(){
    if(!selectedLink)return;const station=Number(stationValue),result=addTransferPort(project,selectedLink.id,station,direction,side,terminal);
    if(result.error||!result.port){onNotice(result.error??'สร้าง Transfer port ไม่สำเร็จ');return;}
    onCommit(result.project,`สร้าง ${terminal.toUpperCase()} station port ที่ Sta. ${result.port.station.toFixed(1)} m แล้ว`,{kind:'transfer-port',id:result.port.id});
  }
  function editPort(patch:Parameters<typeof updateTransferPort>[2]){
    if(!selectedPort)return;const result=updateTransferPort(project,selectedPort.id,patch);
    if(result.error){onNotice(result.error);return;}onCommit(result.project,'ปรับ Transfer port แล้ว',{kind:'transfer-port',id:selectedPort.id});
  }
  function createConnector(){
    if(!selectedPort||!effectiveCandidate)return;
    const from=selectedPort.terminal==='diverge'?selectedPort.id:effectiveCandidate,to=selectedPort.terminal==='merge'?selectedPort.id:effectiveCandidate,result=addTransferConnector(project,from,to);
    if(result.error||!result.connector){onNotice(result.error??'สร้าง Transfer connector ไม่สำเร็จ');return;}
    onCommit(result.project,'สร้าง Transfer connector แล้ว · connector section เริ่มที่ 1 lane × 3.50 m และยังไม่มี gore dimension',{kind:'transfer-connector',id:result.connector.id});
  }
  function editConnector(patch:Parameters<typeof updateTransferConnector>[2]){
    if(!selectedConnector)return;const result=updateTransferConnector(project,selectedConnector.id,patch);
    if(result.error){onNotice(result.error);return;}onCommit(result.project,'ปรับ Transfer connector แล้ว',{kind:'transfer-connector',id:selectedConnector.id});
  }
  function applyLaneTreatment(){
    if(!selectedPort)return;const a=Number(fullWidth),b=Number(taper);
    if(!Number.isFinite(a)||a<=0||!Number.isFinite(b)||b<0){onNotice('ระบุ Full-width length > 0 และ Taper length ≥ 0 ก่อน');return;}
    const result=applyTransferTerminalLaneTreatment(project,selectedPort.id,a,b);
    if(result.error){onNotice(result.error);return;}onCommit(result.project,`สร้าง/ซ่อม ${selectedPort.terminal.toUpperCase()} speed-change lane บน host RoadLink แล้ว`,{kind:'transfer-port',id:selectedPort.id});
  }
  function removeLaneTreatment(){
    if(!selectedPort)return;const result=removeTransferTerminalLaneTreatment(project,selectedPort.id);
    if(result.error){onNotice(result.error);return;}onCommit(result.project,'ลบ host speed-change lane treatment แล้ว',{kind:'transfer-port',id:selectedPort.id});
  }
  function applyGore(end:'from'|'to',draft:GoreDraft){
    if(!selectedConnector)return;
    const result=updateTransferConnectorTerminalTreatment(project,selectedConnector.id,end,{
      level:draft.level,neutralLength:num(draft.neutralLength),physicalNoseLength:num(draft.physicalNoseLength),physicalNoseWidth:num(draft.physicalNoseWidth)
    });
    if(result.error){onNotice(result.error);return;}onCommit(result.project,`บันทึก ${end.toUpperCase()} ${draft.level.toUpperCase()} gore treatment แล้ว`,{kind:'transfer-connector',id:selectedConnector.id});
  }
  function terminalCard(end:'from'|'to',draft:GoreDraft,setDraft:(value:GoreDraft)=>void){
    if(!selectedConnector)return null;const portId=end==='from'?selectedConnector.fromTransferPortId:selectedConnector.toTransferPortId,
      port=project.transferPorts.find(item=>item.id===portId),resolution=connectorGores.find(item=>item.terminal===end);
    return <div className="network-station-component-card" data-network-transfer-terminal={end}>
      <div className="network-station-component-title"><div><span>{end==='from'?'DIVERGE / FROM':'MERGE / TO'}</span><b>{port?.id??'—'}</b></div><button type="button" onClick={()=>port&&onSelect({kind:'transfer-port',id:port.id})}>เลือก Port</button></div>
      <div className="network-station-grid">
        <label>รูปแบบ Gore<select data-network-transfer-gore-level-input={end} value={draft.level} onChange={e=>setDraft({...draft,level:e.target.value as TransferGoreLevel})}><option value="none">None</option><option value="painted">Painted</option><option value="physical">Physical</option></select></label>
        {draft.level!=='none'&&<label>Neutral area (m)<input data-network-transfer-gore-neutral={end} type="number" min=".1" step=".5" value={draft.neutralLength} placeholder="ระบุเอง" onChange={e=>setDraft({...draft,neutralLength:e.target.value})}/></label>}
        {draft.level==='physical'&&<><label>Nose length (m)<input data-network-transfer-gore-nose-length={end} type="number" min=".1" step=".1" value={draft.physicalNoseLength} placeholder="ระบุเอง" onChange={e=>setDraft({...draft,physicalNoseLength:e.target.value})}/></label><label>Nose width (m)<input data-network-transfer-gore-nose-width={end} type="number" min=".1" step=".1" value={draft.physicalNoseWidth} placeholder="ระบุเอง" onChange={e=>setDraft({...draft,physicalNoseWidth:e.target.value})}/></label></>}
      </div>
      <button data-network-transfer-gore-apply={end} onClick={()=>applyGore(end,draft)}>บันทึก Gore treatment</button>
      {resolution?.issue?<p className="network-note">! {resolution.issue}</p>:resolution?.gore?<p className="network-ok">{resolution.treatment.level.toUpperCase()} gore resolved จาก geometry ปัจจุบัน</p>:null}
    </div>;
  }

  if(selectedLink)return <section data-network-transfer-editor="link">
    <div className="network-arm-editor-head"><span>TRANSFER / RAMP STATION PORTS</span><b>{linkPorts.length} ports</b></div>
    <p className="network-note">สร้าง semantic merge/diverge datum บน RoadLink ด้วย station จริงก่อน แล้วจึงเชื่อมเป็น TransferConnector. ระยะทุกค่าด้านล่างเป็น project input ไม่ใช่ค่าแนะนำอัตโนมัติ.</p>
    <div className="network-station-grid">
      <label>Station (m)<input data-network-transfer-new-station type="number" min=".1" max={Math.max(.1,linkLength(project,selectedLink)-.1)} step=".5" value={stationValue} onChange={e=>setStationValue(e.target.value)}/></label>
      <label>Direction<select data-network-transfer-new-direction value={direction} onChange={e=>setDirection(e.target.value as LinkDirection)}><option value="forward">FROM → TO</option><option value="backward">TO → FROM</option></select></label>
      <label>Side<select data-network-transfer-new-side value={side} onChange={e=>setSide(e.target.value as 'curb'|'median')}><option value="curb">Curb</option><option value="median">Median</option></select></label>
      <label>Role<select data-network-transfer-new-terminal value={terminal} onChange={e=>setTerminal(e.target.value as TransferTerminalKind)}><option value="diverge">DIVERGE</option><option value="merge">MERGE</option></select></label>
    </div>
    <div className="network-transfer-placement-actions">
      <button data-network-transfer-place-port data-network-transfer-place-active={placementActive?'true':'false'} className={placementActive?'active':''} onClick={()=>placementActive?onCancelPlacement():onStartPlacement({direction,side,terminal})}>{placementActive?'ยกเลิกการวางบนแผน':'⌖ วางตำแหน่งบนแผน'}</button>
      <button data-network-transfer-create-port onClick={createPort}>สร้างจาก Station ที่ระบุ</button>
    </div>
    <p className="network-note">{placementActive?'คลิกตำแหน่งบน RoadLink ที่ไฮไลต์เพื่อบันทึก station จาก geometry จริง · Esc = ยกเลิก':'เลือก Direction / Side / Role แล้ววางด้วยการคลิกบนแผน หรือระบุ Station แบบตัวเลขเพื่อความละเอียด'}</p>
    {!!linkPorts.length&&<div className="network-station-component-list">{linkPorts.map(port=><button key={port.id} data-network-transfer-port-list={port.id} onClick={()=>onSelect({kind:'transfer-port',id:port.id})}>{port.terminal.toUpperCase()} · {port.direction} · {port.side} · Sta. {port.station.toFixed(1)} m</button>)}</div>}
  </section>;

  if(selectedPort){
    const host=project.links.find(link=>link.id===selectedPort.hostLinkId);
    return <section data-network-transfer-editor="port" data-network-transfer-port-editor={selectedPort.id}>
      <p className="network-object-type">Transfer Port · {selectedPort.id}</p>
      <div className="network-arm-editor-head"><span>{selectedPort.terminal.toUpperCase()}</span><b>{host?.name??selectedPort.hostLinkId}</b></div>
      <div className="network-station-grid">
        <label>Station (m)<input data-network-transfer-port-station key={selectedPort.id+'-'+selectedPort.station} type="number" step=".5" defaultValue={selectedPort.station} onBlur={e=>editPort({station:Number(e.currentTarget.value)})}/></label>
        <label>Direction<select data-network-transfer-port-direction value={selectedPort.direction} onChange={e=>editPort({direction:e.target.value as LinkDirection})}><option value="forward">FROM → TO</option><option value="backward">TO → FROM</option></select></label>
        <label>Side<select data-network-transfer-port-side value={selectedPort.side} onChange={e=>editPort({side:e.target.value as 'curb'|'median'})}><option value="curb">Curb</option><option value="median">Median</option></select></label>
        <label>Role<select data-network-transfer-port-role value={selectedPort.terminal} onChange={e=>editPort({terminal:e.target.value as TransferTerminalKind})}><option value="diverge">DIVERGE</option><option value="merge">MERGE</option></select></label>
      </div>
      {connected?<div className="network-inline-actions"><button data-network-transfer-select-connector onClick={()=>onSelect({kind:'transfer-connector',id:connected.id})}>เปิด Connector · {connected.id}</button></div>:<><div className="network-arm-editor-head"><span>เชื่อมไปยัง</span><b>{connectorCandidates.length} ports ที่ใช้ได้</b></div>{connectorCandidates.length?<><select data-network-transfer-target value={effectiveCandidate} onChange={e=>setCandidateId(e.target.value)}>{connectorCandidates.map(port=><option key={port.id} value={port.id}>{port.id} · {port.terminal.toUpperCase()} · {project.links.find(link=>link.id===port.hostLinkId)?.name??port.hostLinkId} · Sta. {port.station.toFixed(1)}</option>)}</select><button data-network-transfer-create-connector disabled={!effectiveCandidate} onClick={createConnector}>เชื่อม DIVERGE → MERGE</button></>:<p className="network-note">ยังไม่มี station port ฝั่งตรงข้ามที่ว่างและอยู่คนละ host RoadLink.</p>}</>}
      <div className="network-arm-editor-head"><span>SPEED-CHANGE LANE บน HOST</span><b>{portTreatment.length?portTreatment.length+' lane component':'ยังไม่มี'}</b></div>
      <div className="network-coords"><label>ช่วงเต็มความกว้าง (m)<input data-network-transfer-lane-full type="number" min=".1" step=".5" value={fullWidth} placeholder="ระบุเอง" onChange={e=>setFullWidth(e.target.value)}/></label><label>ระยะ Taper (m)<input data-network-transfer-lane-taper type="number" min="0" step=".5" value={taper} placeholder="ระบุเอง" onChange={e=>setTaper(e.target.value)}/></label></div>
      <div className="network-inline-actions"><button data-network-transfer-lane-apply disabled={!connected} onClick={applyLaneTreatment}>สร้าง / ปรับ Speed-change lane</button><button data-network-transfer-lane-remove disabled={!portTreatment.length} onClick={removeLaneTreatment}>ลบ treatment</button></div>
      {!connected&&<p className="network-note">ต้องเชื่อม TransferConnector ก่อน จึงจะสร้าง host speed-change lane provenance ได้.</p>}
    </section>;
  }

  if(selectedConnector)return <section data-network-transfer-editor="connector" data-network-transfer-connector-editor={selectedConnector.id}>
    <p className="network-object-type">Transfer Connector · {selectedConnector.id}</p>
    <label>ชื่อ<input data-network-transfer-connector-name key={selectedConnector.id+'-'+selectedConnector.name} defaultValue={selectedConnector.name} onBlur={e=>editConnector({name:e.currentTarget.value})}/></label>
    <div className="network-coords"><label>จำนวนเลน<input data-network-transfer-connector-lanes key={selectedConnector.id+'-lanes-'+selectedConnector.lanes} type="number" min="1" max="4" step="1" defaultValue={selectedConnector.lanes} onBlur={e=>editConnector({lanes:Number(e.currentTarget.value)})}/></label><label>ความกว้างเลน (m)<input data-network-transfer-connector-width key={selectedConnector.id+'-width-'+selectedConnector.laneWidth} type="number" min="2" max="6" step=".05" defaultValue={selectedConnector.laneWidth} onBlur={e=>editConnector({laneWidth:Number(e.currentTarget.value)})}/></label></div>
    <p className="network-note">Section เป็นของ connector เองและ one-way. Endpoint/section จะถูก guard เมื่อมี host lane treatment หรือ gore treatment เพื่อไม่ให้ provenance หลุด.</p>
    <div className="network-station-component-list">{terminalCard('from',fromGore,setFromGore)}{terminalCard('to',toGore,setToGore)}</div>
  </section>;

  return null;
}
