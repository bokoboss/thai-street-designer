'use client';
// Road-first workspace (roadmap Phase 3): one shell — top bar, tool rail, plan, inspector, section strip, status bar.
import './style.css';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Hand,MousePointer2,PenLine,Redo2,Undo2,Maximize2,Route} from 'lucide-react';
import {DesignCanvas,type DesignSelection,type DesignTool} from './design-canvas';
import {DesignInspector} from './design-inspector';
import {SectionStrip} from './section-strip';
import {emptyRoadFirstProject,useRoadEditor} from './use-road-editor';
import {detectCandidates} from '@/core/road-first/derive';
import {DEFAULT_PRESET,presetSection,type RoadPresetId} from '@/core/road-first/presets';
import {normalizeRoadFirstProject} from '@/core/road-first/project';
import {migrateNetworkProject} from '@/core/road-first/migrate';
import {parseNetworkProjectFile} from '@/core/network/network-project-file';
import {activeNetworkProject} from '@/core/network/network-scenarios';
import type {WorldPoint} from '@/core/network/network-project';

const TOOL_HINT:Record<DesignTool,string>={
  select:'เลือก: คลิกถนน จุดตัด หรือทางแยก · ลากจุดแนวถนนเพื่อย้าย · ลากด้วยปุ่มกลางเพื่อเลื่อนมุมมอง',
  pan:'เลื่อนมุมมอง: ลากเพื่อเลื่อน · หมุนล้อเมาส์เพื่อซูม',
  road:'วาดถนน: คลิกเพื่อวางจุด · ดับเบิลคลิกหรือ Enter เพื่อจบ · Esc เพื่อยกเลิก',
};

export default function DesignWorkspace(){
  const ed=useRoadEditor();
  const [tool,setTool]=useState<DesignTool>('select'),[selection,setSelection]=useState<DesignSelection>(null);
  const [draft,setDraft]=useState<WorldPoint[]>([]),[preset,setPreset]=useState<RoadPresetId>(DEFAULT_PRESET);
  const [fitKey,setFitKey]=useState(0),[newArmed,setNewArmed]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null),loaded=useRef(false);
  const candidates=useMemo(()=>detectCandidates(ed.project.roads),[ed.project.roads]);
  const selectedRoad=selection?.kind==='road'?ed.project.roads.find(r=>r.id===selection.id):undefined;
  const openCrossings=candidates.filter(c=>!ed.project.decisions.some(d=>d.candidateId===c.id)).length;

  // Fit once the stored project has been loaded.
  useEffect(()=>{if(!loaded.current&&ed.project.roads.length){loaded.current=true;setFitKey(k=>k+1);}},[ed.project.roads.length]);

  function chooseTool(next:DesignTool){setDraft([]);setTool(next);}
  function finishDraft(){
    if(draft.length<2){ed.setNotice({text:'ถนนต้องมีอย่างน้อยสองจุด',kind:'error'});return;}
    const ids=new Set(ed.project.roads.map(r=>r.id));let n=1;while(ids.has(`R-${n}`))n++;
    const id=`R-${n}`,r=ed.run({type:'road.add',road:{id,name:`ถนน ${n}`,points:draft,section:presetSection(preset)}});
    if(r.ok){setDraft([]);setTool('select');setSelection({kind:'road',id});}
  }
  function onKey(e:React.KeyboardEvent){
    if((e.target as HTMLElement).matches('input,select,textarea'))return;
    const k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();if(e.shiftKey)ed.redo();else ed.undo();return;}
    if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();ed.redo();return;}
    if(e.key==='Escape'){if(draft.length)setDraft([]);else{setTool('select');setSelection(null);}return;}
    if(e.key==='Enter'&&tool==='road'){finishDraft();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&selectedRoad){if(ed.run({type:'road.remove',roadId:selectedRoad.id}).ok)setSelection(null);return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(k==='v')chooseTool('select');if(k==='h')chooseTool('pan');if(k==='r')chooseTool('road');
  }
  function save(){
    const blob=new Blob([JSON.stringify(ed.project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`${ed.project.title.replace(/[\\/:*?"<>|]+/g,'-')||'project'}.road.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    ed.setNotice({text:'บันทึกไฟล์แล้ว',kind:'info'});
  }
  async function open(file:File|undefined){
    if(!file)return;
    try{
      const text=await file.text(),raw=JSON.parse(text);
      if(raw?.kind==='road-first'){ed.replaceProject(normalizeRoadFirstProject(raw),`เปิด ${file.name} แล้ว`);}
      else{
        const migrated=migrateNetworkProject(activeNetworkProject(parseNetworkProjectFile(text).workspace));
        ed.replaceProject(migrated.project,migrated.issues.length?`เปิด ${file.name} แล้ว · มีรายการให้ตรวจ ${migrated.issues.length} รายการ`:`เปิด ${file.name} แล้ว`);
      }
      setSelection(null);setTool('select');setFitKey(k=>k+1);
    }catch(error){ed.setNotice({text:'เปิดไฟล์ไม่สำเร็จ · '+(error instanceof Error?error.message:'ไฟล์ไม่ถูกต้อง'),kind:'error'});}
  }
  function newProject(){
    if(!newArmed){setNewArmed(true);ed.setNotice({text:'กด “ใหม่” อีกครั้งเพื่อเริ่มโครงการใหม่ งานปัจจุบันจะถูกแทนที่',kind:'info'});return;}
    setNewArmed(false);ed.replaceProject(emptyRoadFirstProject(),'เริ่มโครงการใหม่แล้ว');setSelection(null);setFitKey(k=>k+1);
  }

  return <main className="design-workspace" tabIndex={-1} onKeyDown={onKey} data-design-workspace="true">
    <header className="design-top">
      <div className="design-brand"><Route size={18}/><b>Thai Street Designer</b><span>{ed.project.title}</span></div>
      <div className="design-top-actions">
        <button data-design-file="new" onClick={newProject} onBlur={()=>setNewArmed(false)}>{newArmed?'ยืนยันโครงการใหม่':'ใหม่'}</button>
        <button data-design-file="open" onClick={()=>fileInput.current?.click()}>เปิดไฟล์</button>
        <button data-design-file="save" onClick={save}>บันทึกไฟล์</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden data-design-file-input="true" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void open(f);}}/>
        <span className="design-sep"/>
        <button data-design-undo="true" disabled={!ed.undoText} title={ed.undoText?`ย้อนกลับ: ${ed.undoText}`:'ไม่มีขั้นตอนให้ย้อน'} onClick={ed.undo}><Undo2 size={15}/><span>{ed.undoText??'ย้อนกลับ'}</span></button>
        <button data-design-redo="true" disabled={!ed.redoText} title={ed.redoText?`ทำซ้ำ: ${ed.redoText}`:'ไม่มีขั้นตอนให้ทำซ้ำ'} onClick={ed.redo}><Redo2 size={15}/></button>
        <button data-design-fit="true" onClick={()=>setFitKey(k=>k+1)} title="ดูทั้งแบบ"><Maximize2 size={15}/></button>
      </div>
    </header>
    <div className="design-body">
      <nav className="design-tools" aria-label="เครื่องมือ">
        <button data-design-tool-button="select" className={tool==='select'?'active':''} onClick={()=>chooseTool('select')} title="เลือก (V)"><MousePointer2 size={18}/><span>เลือก</span></button>
        <button data-design-tool-button="pan" className={tool==='pan'?'active':''} onClick={()=>chooseTool('pan')} title="เลื่อนมุมมอง (H)"><Hand size={18}/><span>เลื่อน</span></button>
        <button data-design-tool-button="road" className={tool==='road'?'active':''} onClick={()=>chooseTool('road')} title="วาดถนน (R)"><PenLine size={18}/><span>วาดถนน</span></button>
      </nav>
      <div className="design-center">
        <DesignCanvas project={ed.project} compiled={ed.compiled} selection={selection} onSelect={setSelection} tool={tool} draft={draft} onDraftChange={setDraft} onFinishDraft={finishDraft} run={ed.run} finishGesture={ed.finishGesture} fitKey={fitKey}/>
        {selectedRoad&&<SectionStrip road={selectedRoad}/>}
      </div>
      <DesignInspector selection={selection} project={ed.project} compiled={ed.compiled} candidates={candidates} run={ed.run} onSelect={setSelection} tool={tool} newRoadPreset={preset} onNewRoadPreset={setPreset}/>
    </div>
    <footer className="design-status">
      <span className="design-hint" data-design-hint="true">{TOOL_HINT[tool]}</span>
      {ed.notice.text&&<span className={'design-notice '+ed.notice.kind} data-design-notice={ed.notice.kind}>{ed.notice.text}</span>}
      <span className="design-status-right">
        {openCrossings>0&&<button className="design-open-crossings" data-design-open-crossings={openCrossings} onClick={()=>{const c=candidates.find(x=>!ed.project.decisions.some(d=>d.candidateId===x.id));if(c){setTool('select');setSelection({kind:'crossing',id:c.id});}}}>จุดตัดรอยืนยัน {openCrossings}</button>}
        <span>จราจรชิดซ้าย · หน่วยเมตร · แบบแนวคิด</span>
      </span>
    </footer>
  </main>;
}
