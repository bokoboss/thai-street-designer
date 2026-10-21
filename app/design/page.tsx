'use client';
// Road-first workspace (roadmap Phase 3): one shell — top bar, tool rail, plan, inspector, section strip, status bar.
import './style.css';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Hand,MousePointer2,PenLine,Redo2,Undo2,Maximize2,Route,Plus,GitCompare,ImageDown,PanelRight} from 'lucide-react';
import {DesignCanvas,type DesignSelection,type DesignTool} from './design-canvas';
import {DesignInspector} from './design-inspector';
import {SectionStrip} from './section-strip';
import {useReferenceImage} from './use-reference-image';
import {useMapReference} from './map-panel';
import {emptyRoadFirstProject,useRoadEditor} from './use-road-editor';
import {detectCandidates} from '@/core/road-first/derive';
import {matchingPreset,presetSection} from '@/core/road-first/presets';
import {pointAtLength,type SnapResult} from '@/core/road-first/snap';
import {createWorkspace,migrateNetworkWorkspace,normalizeWorkspace} from '@/core/road-first/scenarios';
import type {MigrationTarget} from '@/core/road-first/migrate';
import {StartChooser} from './start-chooser';
import {compareScenarios} from '@/core/road-first/compare';
import {newRoadId,nextRoadName} from '@/core/road-first/ids';
import {DESIGN_HANDOFF_STORAGE,createHandoff} from '@/core/road-first/junction-handoff';
import {parseNetworkProjectFile} from '@/core/network/network-project-file';
import {NETWORK_PROJECT_STORAGE,projectBounds,type WorldPoint} from '@/core/network/network-project';
import {executeCommand,type RoadFirstCommand} from '@/core/road-first/commands';
import type {DraftCheck} from './design-canvas';
import {exportFigure,safeFilePart,type FigureFormat} from './export-figure';
import NetworkScene3D from '../network/network-scene3d';
import {buildNetworkDesignReport,networkDesignReportHtml} from '@/core/network/network-design-report';

const JUNCTION_HINT='ทางแยก: คลิกปากทางเพื่อเพิ่มเลนเลี้ยวหรือ Slip lane · ลากจุดสี่เหลี่ยมที่มุมเพื่อปรับรัศมีเฉพาะมุมนั้น · ลากจุดกลมเพื่อปรับระยะเก็บรถ';
const TOOL_HINT:Record<DesignTool,string>={
  select:'เลือก: คลิกถนน จุดตัด หรือทางแยก · ลากจุดแนวถนนเพื่อย้าย · ลากด้วยปุ่มกลางเพื่อเลื่อนมุมมอง',
  pan:'เลื่อนมุมมอง: ลากเพื่อเลื่อน · หมุนล้อเมาส์เพื่อซูม',
  'map-move':'ย้ายแผนที่: ลากบนแบบเพื่อเลื่อนแผนที่ให้ตรงกับถนน · Esc เพื่อจบ',
  'ref-move':'ย้ายภาพอ้างอิง: ลากบนแบบเพื่อเลื่อนภาพ · Esc เพื่อจบ',
  'ref-calibrate':'ตั้งมาตราส่วนภาพ: คลิกจุด A และ B บนภาพที่รู้ระยะจริง แล้วพิมพ์ระยะทางด้านขวา · Esc เพื่อยกเลิก',
  road:'วาดถนน: คลิกวางจุด (ดูดเข้าปลายถนน แนวถนน และมุมทุก 15°) · พิมพ์ตัวเลขแล้ว Enter = ความยาว · ดับเบิลคลิกหรือ Enter เพื่อจบ · คลิกขวา = ย้อนจุดล่าสุด · Shift ค้าง = ไม่ดูด · Esc ยกเลิก',
};

export default function DesignWorkspace(){
  const ed=useRoadEditor();
  const [tool,setTool]=useState<DesignTool>('select'),[selection,setSelection]=useState<DesignSelection>(null);
  const [draft,setDraft]=useState<WorldPoint[]>([]),[typedLength,setTypedLength]=useState('');
  // Drawing that starts on a road end continues that road instead of adding a new one.
  const [extend,setExtend]=useState<{roadId:string;atStart:boolean}|null>(null);
  const snapRef=useRef<SnapResult|null>(null);
  const [fitKey,setFitKey]=useState(0),[newArmed,setNewArmed]=useState(false),[compare,setCompare]=useState(false),[exportOpen,setExportOpen]=useState(false);
  const planSvg=useRef<SVGSVGElement>(null),[view,setView]=useState<'2d'|'3d'>('2d');
  const image=useReferenceImage((text,kind='info')=>ed.setNotice({text,kind}));
  const [calibration,setCalibration]=useState<WorldPoint[]>([]);
  const map=useMapReference();
  // Work saved by the earlier Network page in this browser can be brought in as extra alternatives.
  const [hasEarlier,setHasEarlier]=useState(false);
  // On narrow screens the inspector is a drawer: it opens when something is selected and can be toggled.
  const [inspectorOpen,setInspectorOpen]=useState(false),[fit3d,setFit3d]=useState(0);
  /** The next road drawn is a project access (driveway). */
  const [newAccess,setNewAccess]=useState(false);
  function select(s:DesignSelection){setSelection(s);if(s)setInspectorOpen(true);}
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{try{setHasEarlier(!!localStorage.getItem(NETWORK_PROJECT_STORAGE));}catch{/* unavailable */}},[]);
  // Comparison with the scenario this alternative was copied from (else Existing), highlighted on the plan.
  const comparison=useMemo(()=>compare&&ed.reference?compareScenarios(ed.reference.project,ed.project):null,[compare,ed.reference,ed.project]);
  const fileInput=useRef<HTMLInputElement>(null),loaded=useRef(false);
  const candidates=useMemo(()=>detectCandidates(ed.project.roads),[ed.project.roads]);
  const selectedRoad=selection?.kind==='road'?ed.project.roads.find(r=>r.id===selection.id):undefined;
  const openCrossings=candidates.filter(c=>!ed.project.decisions.some(d=>d.candidateId===c.id)).length;

  // Select the junction whose advanced edits were just brought back.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(ed.returned)setSelection({kind:'junction',id:ed.returned});},[ed.returned]);
  // Fit once the stored project has been loaded.
  useEffect(()=>{if(!loaded.current&&ed.project.roads.length){loaded.current=true;setFitKey(k=>k+1);}},[ed.project.roads.length]);

  function clearDraft(){setDraft([]);setExtend(null);setTypedLength('');setCalibration([]);}
  function chooseTool(next:DesignTool){clearDraft();setTool(next);}
  function addDraftPoint(points:WorldPoint[],snap:SnapResult){
    if(points.length===1)setExtend(snap.kind==='end'&&snap.roadId?{roadId:snap.roadId,atStart:snap.end==='start'}:null);
    setDraft(points);setTypedLength('');
  }
  function finishDraft(){
    if(draft.length<2){ed.setNotice({text:'ถนนต้องมีอย่างน้อยสองจุด',kind:'error'});return;}
    if(extend){
      const r=ed.run({type:'road.extend',roadId:extend.roadId,atStart:extend.atStart,points:draft.slice(1)});
      if(r.ok){clearDraft();setTool('select');setSelection({kind:'road',id:extend.roadId});}
      return;
    }
    // Ids are never reused across scenarios, so the comparison never mistakes a new road for an old one.
    const role=newAccess?'access' as const:undefined,section=newAccess?presetSection('access'):structuredClone(ed.lastSection);
    const id=newRoadId(ed.workspace.scenarios.flatMap(s=>s.project.roads)),r=ed.run({type:'road.add',road:{id,name:nextRoadName(ed.project.roads,role),...(role?{role}:{}),points:draft,section}});
    if(r.ok){setNewAccess(false);clearDraft();setTool('select');setSelection({kind:'road',id});}
  }
  /** Right-click or Backspace while drawing: drop the typed length, else the last point, else leave Draw Road. */
  function draftBack(){
    if(typedLength){setTypedLength('');return;}
    if(draft.length){const next=draft.slice(0,-1);setDraft(next);if(!next.length)setExtend(null);return;}
    chooseTool('select');
  }
  const checkDraft=useCallback((points:WorldPoint[]):DraftCheck=>{
    if(points.length<2)return null;
    const cmd:RoadFirstCommand=extend?{type:'road.extend',roadId:extend.roadId,atStart:extend.atStart,points:points.slice(1)}
      :{type:'road.add',road:{id:'R-preview',name:'ถนนใหม่',points,section:ed.lastSection}};
    const r=executeCommand(ed.project,cmd);
    if(r.error)return{kind:'error',text:`วางไม่ได้ · ${r.error}`};
    if(r.blocked.length)return{kind:'warn',text:`ไม่เชื่อมเข้าทางแยก · ${r.blocked[0]!.reason}`};
    if(r.openCrossings.length)return{kind:'warn',text:`จุดตัดต้องเลือกเอง · ${r.openCrossings[0]!.reason}`};
    return null;
  },[extend,ed.project,ed.lastSection]);
  function onKey(e:React.KeyboardEvent){
    if((e.target as HTMLElement).matches('input,select,textarea'))return;
    const k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();if(e.shiftKey)ed.redo();else ed.undo();return;}
    if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();ed.redo();return;}
    if(e.key==='Escape'){if(typedLength)setTypedLength('');else if(draft.length)clearDraft();else{chooseTool('select');setSelection(null);}return;}
    // Typed length while drawing: digits build a length, Enter places the point at that distance along the cursor direction.
    if(tool==='road'&&draft.length&&/^[0-9.]$/.test(e.key)){setTypedLength(t=>(t+e.key).slice(0,8));return;}
    if(tool==='road'&&e.key==='Backspace'&&typedLength){setTypedLength(t=>t.slice(0,-1));return;}
    if(tool==='road'&&e.key==='Backspace'&&draft.length){draftBack();return;}
    if(e.key==='Enter'&&tool==='road'){
      const len=Number(typedLength),last=draft.at(-1),toward=snapRef.current?.point;
      if(typedLength&&len>0&&last&&toward){setDraft([...draft,pointAtLength(last,toward,len)]);setTypedLength('');return;}
      finishDraft();return;
    }
    if((e.key==='Delete'||e.key==='Backspace')&&selectedRoad){if(ed.run({type:'road.remove',roadId:selectedRoad.id}).ok)setSelection(null);return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(k==='v')chooseTool('select');if(k==='h')chooseTool('pan');if(k==='r')chooseTool('road');
  }
  function download(blob:Blob,name:string){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function save(){
    download(new Blob([JSON.stringify(ed.workspace,null,2)],{type:'application/json'}),`${safeFilePart(ed.project.title)}.road.json`);
    ed.setNotice({text:`บันทึกไฟล์แล้ว (${ed.workspace.scenarios.length} ทางเลือก)`,kind:'info'});
  }
  /** Report figure of the whole design (with the comparison highlights when they are shown). */
  async function saveFigure(format:FigureFormat){
    setExportOpen(false);
    const svg=planSvg.current;if(!svg)return;
    const pts=[...ed.project.roads.flatMap(r=>r.points),...(comparison?.deltas.flatMap(d=>d.bounds?[{x:d.bounds.x,y:d.bounds.y},{x:d.bounds.x+d.bounds.w,y:d.bounds.y+d.bounds.h}]:[])??[])];
    if(!pts.length){ed.setNotice({text:'ยังไม่มีแบบให้ส่งออก',kind:'error'});return;}
    const b=ed.compiled.project.junctions.length||ed.compiled.project.links.length?projectBounds(ed.compiled.project,10):null;
    const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),x=Math.min(...xs,b?.x??Infinity),y=Math.min(...ys,b?.y??Infinity);
    const bounds={x,y,w:Math.max(...xs,b?b.x+b.w:-Infinity)-x,h:Math.max(...ys,b?b.y+b.h:-Infinity)-y};
    try{
      const out=await exportFigure({svg,bounds,title:ed.project.title,scenario:ed.active.name,comparison:comparison&&ed.reference?{reference:ed.reference.name,diff:comparison}:null,format});
      download(out.blob,out.name);ed.setNotice({text:`ส่งออกรูป ${out.name} แล้ว`,kind:'info'});
    }catch(error){ed.setNotice({text:'ส่งออกรูปไม่สำเร็จ · '+(error instanceof Error?error.message:''),kind:'error'});}
  }
  /** Hand the junction to the advanced junction editor; its edits come back when /design opens again. */
  function openAdvanced(candidateId:string){
    const handoff=createHandoff(ed.project,ed.active.id,candidateId);
    if(!handoff){ed.setNotice({text:'ไม่พบทางแยกนี้ในแบบ',kind:'error'});return;}
    try{localStorage.setItem(DESIGN_HANDOFF_STORAGE,JSON.stringify(handoff));window.location.assign('/junction?design=1');}
    catch{ed.setNotice({text:'บันทึกข้อมูลชั่วคราวในเบราว์เซอร์ไม่ได้ จึงเปิดหน้าแก้ทางแยกขั้นสูงไม่ได้',kind:'error'});}
  }
  /** Design Summary of the scenario being edited (same report as the earlier Network page). */
  function saveReport(){
    setExportOpen(false);
    const html=networkDesignReportHtml(buildNetworkDesignReport({...ed.compiled.project,title:ed.project.title},ed.active.name));
    const name=`${safeFilePart(ed.project.title)}-${safeFilePart(ed.active.name)}-สรุปแบบ.html`;
    download(new Blob([html],{type:'text/html;charset=utf-8'}),name);ed.setNotice({text:`ส่งออก ${name} แล้ว`,kind:'info'});
  }
  function switchScenario(id:string){if(ed.switchTo(id)){setSelection(null);clearDraft();setTool('select');}}
  async function open(file:File|undefined){
    if(!file)return;
    try{
      const text=await file.text(),raw=JSON.parse(text);
      if(raw?.kind==='road-first'||raw?.kind==='road-first-workspace'){ed.replaceWorkspace(normalizeWorkspace(raw),`เปิด ${file.name} แล้ว`);}
      else{
        const migrated=migrateNetworkWorkspace(parseNetworkProjectFile(text).workspace,file.name);
        ed.replaceWorkspace(migrated.workspace,migrated.issues?`เปิด ${file.name} แล้ว · มีรายการให้ตรวจ ${migrated.issues} รายการ ดูได้ที่แผงทางเลือก`:`เปิด ${file.name} แล้ว`,migrated.report);
      }
      setSelection(null);setTool('select');setCompare(false);setFitKey(k=>k+1);
    }catch(error){ed.setNotice({text:'เปิดไฟล์ไม่สำเร็จ · '+(error instanceof Error?error.message:'ไฟล์ไม่ถูกต้อง'),kind:'error'});}
  }
  function newProject(){
    if(!newArmed){setNewArmed(true);ed.setNotice({text:'กด “ใหม่” อีกครั้งเพื่อเริ่มโครงการใหม่ งานปัจจุบันจะถูกแทนที่',kind:'info'});return;}
    setNewArmed(false);ed.replaceWorkspace(createWorkspace(emptyRoadFirstProject()),'เริ่มโครงการใหม่แล้ว');setSelection(null);setCompare(false);setFitKey(k=>k+1);
  }

  return <main className="design-workspace" tabIndex={-1} onKeyDown={onKey} data-design-workspace="true" data-design-ready={ed.loaded?"true":undefined} data-inspector-open={inspectorOpen?'true':'false'}>
    <header className="design-top">
      <div className="design-brand"><Route size={18}/><b>Thai Street Designer</b><span>{ed.project.title}</span></div>
      <div className="design-scenarios" role="tablist" aria-label="ทางเลือก">
        {ed.workspace.scenarios.map(s=><button key={s.id} role="tab" aria-selected={s.id===ed.active.id} className={s.id===ed.active.id?'active':''} data-design-scenario={s.id} onClick={()=>switchScenario(s.id)}>{s.name}</button>)}
        <button data-design-scenario-add="true" title={`คัดลอก ${ed.active.name} เป็นทางเลือกใหม่`} onClick={()=>{if(ed.duplicate()){setSelection(null);setCompare(true);}}}><Plus size={14}/><span>ทางเลือก</span></button>
        {ed.reference&&<button className={compare?'active compare':'compare'} aria-pressed={compare} data-design-compare-toggle="true" onClick={()=>setCompare(v=>!v)} title={`ไฮไลต์สิ่งที่ต่างจาก ${ed.reference.name}`}><GitCompare size={14}/><span>เทียบกับ {ed.reference.name}</span></button>}
      </div>
      <div className="design-top-actions">
        <button data-design-file="new" onClick={newProject} onBlur={()=>setNewArmed(false)}>{newArmed?'ยืนยันโครงการใหม่':'ใหม่'}</button>
        <button data-design-file="open" onClick={()=>fileInput.current?.click()}>เปิดไฟล์</button>
        <button data-design-file="save" onClick={save}>บันทึกไฟล์</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden data-design-file-input="true" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void open(f);}}/>
        <span className="design-sep"/>
        <button data-design-undo="true" disabled={!ed.undoText} title={ed.undoText?`ย้อนกลับ: ${ed.undoText}`:'ไม่มีขั้นตอนให้ย้อน'} onClick={ed.undo}><Undo2 size={15}/><span>{ed.undoText??'ย้อนกลับ'}</span></button>
        <button data-design-redo="true" disabled={!ed.redoText} title={ed.redoText?`ทำซ้ำ: ${ed.redoText}`:'ไม่มีขั้นตอนให้ทำซ้ำ'} onClick={ed.redo}><Redo2 size={15}/></button>
        <button className="design-inspector-toggle" data-design-inspector-toggle="true" aria-expanded={inspectorOpen} onClick={()=>setInspectorOpen(v=>!v)} title="แผงตั้งค่า"><PanelRight size={15}/><span>{inspectorOpen?'ซ่อนแผง':'แผงตั้งค่า'}</span></button>
        <button data-design-fit="true" onClick={()=>{if(view==='3d')setFit3d(k=>k+1);else setFitKey(k=>k+1);}} title="ดูทั้งแบบ"><Maximize2 size={15}/></button>
        <span className="design-export">
          <button data-design-export="true" aria-expanded={exportOpen} onClick={()=>setExportOpen(v=>!v)} onBlur={e=>{if(!e.currentTarget.parentElement?.contains(e.relatedTarget))setExportOpen(false);}} title="ส่งออกรูปสำหรับรายงาน"><ImageDown size={15}/><span>ส่งออกรูป</span></button>
          {exportOpen&&<span className="design-export-menu" role="menu">
            <button role="menuitem" data-design-export-format="png" onClick={()=>void saveFigure('png')}>PNG (ใส่รายงาน)</button>
            <button role="menuitem" data-design-export-format="svg" onClick={()=>void saveFigure('svg')}>SVG (แก้ต่อได้)</button>
            <button role="menuitem" data-design-export-format="report" onClick={saveReport}>รายงานสรุปแบบ (HTML)</button>
            <small className="design-export-note">รูปรวมภาพอ้างอิง แต่ไม่รวมแผนที่ออนไลน์ (สิทธิ์การใช้ภาพแผนที่ต่างกันตามผู้ให้บริการ)</small>
          </span>}
        </span>
      </div>
    </header>
    <div className="design-body">
      <nav className="design-tools" aria-label="เครื่องมือ">
        <button data-design-tool-button="select" className={tool==='select'?'active':''} onClick={()=>chooseTool('select')} title="เลือก (V)"><MousePointer2 size={18}/><span>เลือก</span></button>
        <button data-design-tool-button="pan" className={tool==='pan'?'active':''} onClick={()=>chooseTool('pan')} title="เลื่อนมุมมอง (H)"><Hand size={18}/><span>เลื่อน</span></button>
        <button data-design-tool-button="road" className={tool==='road'?'active':''} onClick={()=>chooseTool('road')} title="วาดถนน (R)"><PenLine size={18}/><span>วาดถนน</span></button>
      </nav>
      <div className="design-center">
        <DesignCanvas project={ed.project} compiled={ed.compiled} selection={selection} onSelect={select} tool={tool} draft={draft} onDraftChange={addDraftPoint} onFinishDraft={finishDraft} onDraftBack={draftBack} checkDraft={checkDraft} onSnap={s=>{snapRef.current=s;}} typedLength={typedLength} run={ed.run} finishGesture={ed.finishGesture} fitKey={fitKey} comparison={comparison} svgRef={planSvg} referenceImage={image.has?{reference:image.reference,url:image.url}:null} onReferenceMove={at=>image.update(at)} calibration={calibration} onCalibratePoint={p=>setCalibration(c=>c.length>=2?[p]:[...c,p])} map={{reference:map.reference,credentials:map.credentials}} onMapMove={o=>map.update({offsetX:o.x,offsetY:o.y})}/>
        {ed.notice.autoJunctions&&<div className="design-toast" role="status" data-design-auto-junction={ed.notice.autoJunctions.length}>
          <span>สร้างทางแยกให้แล้ว {ed.notice.autoJunctions.length} แห่ง</span>
          <button data-design-toast-action="undo" onClick={ed.undo}>ย้อนกลับ</button>
          <button data-design-toast-action="grade-separated" onClick={()=>{for(const id of ed.notice.autoJunctions??[])ed.run({type:'crossing.decide',candidateId:id,decision:'grade-separated'});}}>เป็นทางต่างระดับ</button>
          <button data-design-toast-action="select" onClick={()=>{const id=ed.notice.autoJunctions?.[0];if(id){setTool('select');setSelection({kind:'junction',id});}}}>ดูทางแยก</button>
        </div>}
        {ed.notice.restorable&&<div className="design-toast" role="status" data-design-removed-toast="true">
          <span>ลบ {ed.notice.restorable} แล้ว</span>
          <button data-design-toast-action="restore-scenario" onClick={ed.restoreRemoved}>เรียกคืน</button>
        </div>}
        {ed.loaded&&view==='2d'&&tool!=='road'&&!ed.project.roads.length&&!image.has&&!map.reference.enabled&&<StartChooser
          onMap={()=>{map.update({enabled:true});setSelection(null);setInspectorOpen(true);setTimeout(()=>document.querySelector<HTMLInputElement>('[data-design-map-query]')?.focus(),0);}}
          onImage={f=>{void image.add(f,{x:0,y:0});setSelection(null);setInspectorOpen(true);}}
          onBlank={()=>{chooseTool('road');document.querySelector<HTMLElement>('[data-design-workspace]')?.focus();}}/>}
        {selectedRoad&&view==='2d'&&<SectionStrip key={selectedRoad.id} road={selectedRoad} compiled={ed.compiled}/>}
        {view==='3d'&&<NetworkScene3D project={ed.compiled.project} mapReference={map.reference} mapCredentials={map.credentials} active fitKey={fit3d}/>}
        <div className="design-view-toggle" role="group" aria-label="มุมมอง">
          {(['2d','3d'] as const).map(v=><button key={v} className={view===v?'active':''} aria-pressed={view===v} data-design-view={v} onClick={()=>{setView(v);if(v==='3d')chooseTool('select');}}>{v==='2d'?'แบบ 2 มิติ':'3 มิติ'}</button>)}
        </div>
      </div>
      <DesignInspector selection={selection} project={ed.project} compiled={ed.compiled} candidates={candidates} run={ed.run} onSelect={select} tool={tool} onAdvanced={openAdvanced} map={map} onMessage={(text:string,kind:'info'|'error'='info')=>ed.setNotice({text,kind})} reference={{image,tool,onTool:chooseTool,calibration,viewCenter:()=>{const p=ed.project.roads.flatMap(r=>r.points);return p.length?{x:p.reduce((s,q)=>s+q.x,0)/p.length,y:p.reduce((s,q)=>s+q.y,0)/p.length}:{x:0,y:0};}}} scenario={{name:ed.active.name,existing:ed.active.kind==='existing',count:ed.workspace.scenarios.length,reference:ed.reference?.name??null,comparison,onRename:(name:string)=>ed.rename(ed.active.id,name),onRemove:()=>{if(ed.remove(ed.active.id)){setSelection(null);setCompare(false);}},unreadable:ed.unreadable?{download:()=>download(new Blob([ed.unreadable!],{type:'application/json'}),'งานเดิมที่อ่านไม่ได้.json'),clear:ed.clearUnreadable}:undefined,migration:ed.migration?{report:ed.migration,names:Object.fromEntries(ed.workspace.scenarios.map(x=>[x.id,x.name])),active:ed.active.id,dismiss:ed.dismissMigration,
        show:(scenarioId:string,target?:MigrationTarget)=>{if(scenarioId!==ed.active.id&&!ed.switchTo(scenarioId))return;clearDraft();setTool('select');setCompare(false);
          setSelection(target?(target.kind==='road'?{kind:'road',id:target.roadId}:{kind:'junction',id:target.candidateId}):null);}}:undefined,onImportEarlier:hasEarlier?()=>{if(ed.importEarlier()){setSelection(null);setFitKey(k=>k+1);}}:undefined}} newRoadPreset={matchingPreset(ed.lastSection)} newRoadSection={ed.lastSection} onNewRoadPreset={id=>ed.setLastSection(presetSection(id))} newAccess={newAccess} onNewAccess={setNewAccess}/>
    </div>
    <footer className="design-status">
      <span className="design-hint" data-design-hint="true">{tool==='select'&&(selection?.kind==='junction'||selection?.kind==='approach')?JUNCTION_HINT:TOOL_HINT[tool]}</span>
      {ed.notice.text&&<span className={'design-notice '+ed.notice.kind} data-design-notice={ed.notice.kind}>{ed.notice.text}</span>}
      <span className="design-status-right">
        {openCrossings>0&&<button className="design-open-crossings" data-design-open-crossings={openCrossings} onClick={()=>{const c=candidates.find(x=>!ed.project.decisions.some(d=>d.candidateId===x.id));if(c){setTool('select');setSelection({kind:'crossing',id:c.id});}}}>จุดตัดที่ยังไม่เป็นทางแยก {openCrossings}</button>}
        <span className={'design-save-state '+ed.storage} data-design-save-state={ed.storage} title="งานบันทึกอัตโนมัติในเบราว์เซอร์นี้ · ใช้ “บันทึกไฟล์” เพื่อเก็บถาวรหรือย้ายเครื่อง">{ed.storage==='saved'?'บันทึกในเบราว์เซอร์แล้ว':ed.storage==='blocked'?'ปิดการบันทึกอัตโนมัติ — บันทึกไฟล์ไว้ก่อน':'บันทึกในเบราว์เซอร์ไม่ได้ — กด “บันทึกไฟล์”'}</span>
        <span>จราจรชิดซ้าย · หน่วยเมตร · แบบแนวคิด</span>
      </span>
    </footer>
  </main>;
}
