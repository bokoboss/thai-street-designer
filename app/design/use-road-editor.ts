'use client';
// Editor state for the road-first workspace: every change goes through a typed command,
// so the undo history has a readable label for each step.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createEditor,endGesture,redo as redoEditor,runCommand,undo as undoEditor,type RoadFirstCommand,type RoadFirstEditor} from '@/core/road-first/commands';
import {compileRoadFirstProject,type RoadFirstProject} from '@/core/road-first/project';
import {SCENARIO_LIMIT,activeScenario,appendScenarios,createWorkspace,duplicateScenario,migrateNetworkWorkspace,normalizeWorkspace,referenceScenario,removeScenario,renameScenario,switchScenario,type RoadFirstScenario,type RoadFirstWorkspace,type ScenarioEdit} from '@/core/road-first/scenarios';
import {redoLabel,undoLabel} from '@/core/common/history';
import {NETWORK_PROJECT_STORAGE} from '@/core/network/network-project';
import {restoreNetworkScenarioWorkspace} from '@/core/network/network-scenarios';
import {DESIGN_HANDOFF_STORAGE,handoffCommand,readHandoff} from '@/core/road-first/junction-handoff';
import type {RoadSection} from '@/core/road-first/derive';
import {DEFAULT_PRESET,presetSection} from '@/core/road-first/presets';

export const ROAD_FIRST_STORAGE='thai-street-road-first-v1';
export const emptyRoadFirstProject=():RoadFirstProject=>({kind:'road-first',schemaVersion:1,title:'โครงการใหม่',roads:[],decisions:[],options:{approachLength:40}});

/** Copy of stored work that could not be read; kept until the user downloads or clears it. */
export const ROAD_FIRST_UNREADABLE_STORAGE='thai-street-road-first-v1-unreadable';
export type StorageState='saved'|'error'|'blocked';

/**
 * First open: the saved workspace (or an earlier single saved project), else every scenario of the earlier Network page,
 * else an empty project. Stored work that cannot be read is copied aside first; if that copy fails, autosave stays off so
 * nothing overwrites it.
 */
function initialWorkspace():{workspace:RoadFirstWorkspace;notice:string;error?:boolean;blocked?:boolean}{
  let saved:string|null=null;
  try{saved=localStorage.getItem(ROAD_FIRST_STORAGE);}catch{/* storage unavailable */}
  if(saved){
    try{return{workspace:normalizeWorkspace(JSON.parse(saved)),notice:'เปิดงานล่าสุดแล้ว'};}
    catch(e){
      const why=e instanceof Error?e.message:'ข้อมูลไม่ถูกต้อง';
      try{localStorage.setItem(ROAD_FIRST_UNREADABLE_STORAGE,saved);}
      catch{return{workspace:createWorkspace(emptyRoadFirstProject()),error:true,blocked:true,notice:`งานที่บันทึกไว้ในเบราว์เซอร์อ่านไม่ได้ (${why}) · ปิดการบันทึกอัตโนมัติไว้เพื่อไม่ให้ทับข้อมูลเดิม`};}
      return{workspace:createWorkspace(emptyRoadFirstProject()),error:true,notice:`งานที่บันทึกไว้ในเบราว์เซอร์อ่านไม่ได้ (${why}) · เก็บสำเนาไว้แล้ว ดาวน์โหลดได้ที่แผงโครงการ`};
    }
  }
  try{
    const network=localStorage.getItem(NETWORK_PROJECT_STORAGE);
    if(network){
      const migrated=migrateNetworkWorkspace(restoreNetworkScenarioWorkspace(network));
      return{workspace:migrated.workspace,notice:migrated.issues?`นำแบบเดิมมาแล้ว · มีรายการให้ตรวจ ${migrated.issues} รายการ`:'นำแบบจากหน้าจอเดิมมาแล้ว'};
    }
  }catch{/* fall through to an empty project */}
  return{workspace:createWorkspace(emptyRoadFirstProject()),notice:'เลือกเครื่องมือวาดถนน แล้วคลิกบนแบบเพื่อเริ่ม'};
}

export type CommandOutcome={ok:boolean;message:string};
/** autoJunctions: crossings that became junctions in the last step, offered for Undo / grade separation. */
/** restorable: name of an alternative just removed, offered for restore. */
export type EditorNotice={text:string;kind:'info'|'error';autoJunctions?:string[];restorable?:string};

/** Each scenario keeps its own editor, so its undo history survives switching between scenarios. */
type Book={workspace:RoadFirstWorkspace;editors:Record<string,RoadFirstEditor>};
const bookOf=(workspace:RoadFirstWorkspace):Book=>({workspace,editors:Object.fromEntries(workspace.scenarios.map(s=>[s.id,createEditor(s.project)]))});
/** The workspace with every scenario's current project. */
const currentWorkspace=(b:Book):RoadFirstWorkspace=>({...b.workspace,scenarios:b.workspace.scenarios.map(s=>({...s,project:b.editors[s.id]?.project??s.project}))});

export function useRoadEditor(){
  const [book,setBookState]=useState<Book>(()=>bookOf(createWorkspace(emptyRoadFirstProject())));
  const [notice,setNotice]=useState<EditorNotice>({text:'',kind:'info'});
  /** Junction whose advanced edits were just brought back (selected by the page). */
  const [returned,setReturned]=useState<string|null>(null),[storage,setStorage]=useState<StorageState>('saved');
  // New roads start with the section used last (drawn or edited), not always the default preset.
  const [lastSection,setLastSection]=useState<RoadSection>(()=>presetSection(DEFAULT_PRESET));
  const ready=useRef(false),bookRef=useRef(book);
  const setBook=useCallback((next:Book)=>{bookRef.current=next;setBookState(next);},[]);
  const activeId=book.workspace.activeScenarioId,editor=book.editors[activeId]!;
  const setEditor=useCallback((next:RoadFirstEditor)=>{const b=bookRef.current;setBook({...b,editors:{...b.editors,[b.workspace.activeScenarioId]:next}});},[setBook]);
  const editorNow=()=>bookRef.current.editors[bookRef.current.workspace.activeScenarioId]!;

  useEffect(()=>{
    // Browser storage is only available after mount; load the saved work once.
    const first=initialWorkspace(),next=bookOf(first.workspace);let text=first.notice,returnedId:string|null=null;
    // Coming back from the advanced junction editor: bring its edits back as one undoable step in that scenario.
    try{
      const handoff=readHandoff(localStorage.getItem(DESIGN_HANDOFF_STORAGE)),scenario=handoff&&next.workspace.scenarios.find(s=>s.id===handoff.scenarioId);
      if(handoff){
        localStorage.removeItem(DESIGN_HANDOFF_STORAGE);
        if(!scenario)text='ทางเลือกที่ส่งทางแยกไปแก้ไม่มีแล้ว จึงไม่ได้นำค่ากลับมา';
        else{
          const back=handoffCommand(handoff,scenario.project);
          if(back.cmd){
            const out=runCommand(next.editors[scenario.id]!,back.cmd);
            if(out.result.error)text=`นำค่าจากหน้าแก้ทางแยกกลับมาไม่ได้ · ${out.result.error}`;
            else{next.editors[scenario.id]=out.editor;next.workspace={...next.workspace,activeScenarioId:scenario.id};text=[out.result.label,...back.issues].join(' · ');returnedId=handoff.candidateId;}
          }else text=[back.message,...back.issues].join(' · ');
        }
      }
    }catch{/* storage unavailable: keep the loaded work */}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBook(next);setNotice({text,kind:first.error?'error':'info'});setReturned(returnedId);if(first.blocked)setStorage('blocked');ready.current=true;
  },[setBook]);
  const workspace=useMemo(()=>currentWorkspace(book),[book]);
  useEffect(()=>{
    if(!ready.current||storage==='blocked')return;
    // Autosave state is shown in the status bar; a failed write (storage full or unavailable) must not pass silently.
    let ok=true;
    try{localStorage.setItem(ROAD_FIRST_STORAGE,JSON.stringify(workspace));}catch{ok=false;}
    setStorage(ok?'saved':'error');
  },[workspace,storage]);
  const [unreadable,setUnreadable]=useState<string|null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{try{setUnreadable(localStorage.getItem(ROAD_FIRST_UNREADABLE_STORAGE));}catch{/* unavailable */}},[]);
  const clearUnreadable=useCallback(()=>{try{localStorage.removeItem(ROAD_FIRST_UNREADABLE_STORAGE);}catch{/* unavailable */}setUnreadable(null);setStorage(s=>s==='blocked'?'saved':s);},[]);

  const compiled=useMemo(()=>compileRoadFirstProject(editor.project),[editor.project]);

  /** Typed values, buttons and menu actions are one undo step each; drags pass gesture and end with finishGesture. */
  const run=useCallback((cmd:RoadFirstCommand,opts?:{gesture?:boolean}):CommandOutcome=>{
    const {editor:stepped,result}=runCommand(editorNow(),cmd);
    if(result.error){setNotice({text:result.error,kind:'error'});return{ok:false,message:result.error};}
    const next=opts?.gesture?stepped:endGesture(stepped);
    setEditor(next);
    setNotice({text:result.openCrossings.length||result.blocked.length?`${result.label} · ${result.warnings.at(-1)}`:result.label,kind:'info',autoJunctions:result.autoJunctions.length?result.autoJunctions:undefined});
    if(cmd.type==='road.add')setLastSection(structuredClone(cmd.road.section));
    if(cmd.type==='road.setSection'){const r=next.project.roads.find(x=>x.id===cmd.roadId);if(r)setLastSection(structuredClone(r.section));}
    return{ok:true,message:result.label};
  },[setEditor]);
  const finishGesture=useCallback(()=>setEditor(endGesture(editorNow())),[setEditor]);
  const undo=useCallback(()=>{const r=undoEditor(editorNow());if(!r)return;setEditor(r.editor);setNotice({text:`ย้อนกลับ: ${r.label}`,kind:'info'});},[setEditor]);
  const redo=useCallback(()=>{const r=redoEditor(editorNow());if(!r)return;setEditor(r.editor);setNotice({text:`ทำซ้ำ: ${r.label}`,kind:'info'});},[setEditor]);
  const replaceWorkspace=useCallback((next:RoadFirstWorkspace,text:string)=>{setBook(bookOf(next));setNotice({text,kind:'info'});},[setBook]);

  // Scenario edits keep every scenario's current project and editor.
  const applyScenario=useCallback((edit:(w:RoadFirstWorkspace)=>ScenarioEdit,ok:(e:ScenarioEdit)=>string)=>{
    const b=bookRef.current,e=edit(currentWorkspace(b));
    if(e.error){setNotice({text:e.error,kind:'error'});return false;}
    const editors={...b.editors};
    for(const s of e.workspace.scenarios)if(!editors[s.id])editors[s.id]=createEditor(s.project);
    for(const id of Object.keys(editors))if(!e.workspace.scenarios.some(s=>s.id===id))delete editors[id];
    setBook({workspace:e.workspace,editors});setNotice({text:ok(e),kind:'info'});return true;
  },[setBook]);
  const duplicate=useCallback(()=>applyScenario(w=>duplicateScenario(w),e=>`สร้าง ${e.scenario!.name} จาก ${activeScenario(currentWorkspace(bookRef.current)).name} แล้ว`),[applyScenario]);
  const rename=useCallback((id:string,name:string)=>applyScenario(w=>renameScenario(w,id,name),e=>`เปลี่ยนชื่อทางเลือกเป็น ${e.scenario!.name}`),[applyScenario]);
  // A removed alternative can be restored (with its own undo history) from the notice right after removing it.
  const removedRef=useRef<{scenario:RoadFirstScenario;editor:RoadFirstEditor;index:number;active:string}|null>(null);
  const remove=useCallback((id:string)=>{
    const b=bookRef.current,w=currentWorkspace(b),index=w.scenarios.findIndex(s=>s.id===id),scenario=w.scenarios[index];
    const done=applyScenario(x=>removeScenario(x,id),e=>`ลบ ${e.scenario!.name} แล้ว`);
    if(done&&scenario){removedRef.current={scenario,editor:b.editors[id]!,index,active:w.activeScenarioId};setNotice({text:`ลบ ${scenario.name} แล้ว`,kind:'info',restorable:scenario.name});}
    return done;
  },[applyScenario]);
  const restoreRemoved=useCallback(()=>{
    const r=removedRef.current,b=bookRef.current;if(!r)return;
    if(b.workspace.scenarios.length>=SCENARIO_LIMIT||b.workspace.scenarios.some(s=>s.id===r.scenario.id)){setNotice({text:'เรียกคืนทางเลือกไม่ได้ เพราะมีทางเลือกครบจำนวนแล้ว',kind:'error'});return;}
    const scenarios=[...b.workspace.scenarios];scenarios.splice(Math.min(r.index,scenarios.length),0,r.scenario);
    setBook({workspace:{...b.workspace,scenarios,activeScenarioId:r.scenario.id},editors:{...b.editors,[r.scenario.id]:r.editor}});
    removedRef.current=null;setNotice({text:`เรียกคืน ${r.scenario.name} แล้ว`,kind:'info'});
  },[setBook]);
  const switchTo=useCallback((id:string)=>applyScenario(w=>({workspace:switchScenario(w,id),error:null}),e=>`แก้ไข ${activeScenario(e.workspace).name}`),[applyScenario]);

  /** Work left in the earlier Network page in this browser, added as extra alternatives (nothing is replaced). */
  const importEarlier=useCallback(()=>{
    let raw:string|null=null;try{raw=localStorage.getItem(NETWORK_PROJECT_STORAGE);}catch{/* unavailable */}
    if(!raw){setNotice({text:'ไม่พบงานจากหน้าจอเดิมในเบราว์เซอร์นี้',kind:'error'});return false;}
    const migrated=migrateNetworkWorkspace(restoreNetworkScenarioWorkspace(raw));
    return applyScenario(w=>appendScenarios(w,migrated.workspace,'(หน้าเดิม)'),e=>[`นำเข้างานจากหน้าจอเดิมเป็นทางเลือกเพิ่มแล้ว (เริ่มที่ ${e.scenario!.name})`,e.note,migrated.issues?`มีรายการให้ตรวจ ${migrated.issues} รายการ`:''].filter(Boolean).join(' · '));
  },[applyScenario]);
  const reference=referenceScenario(workspace);
  return{
    project:editor.project,compiled,run,finishGesture,undo,redo,notice,setNotice,lastSection,setLastSection,
    undoText:undoLabel(editor.history),redoText:redoLabel(editor.history),
    workspace,active:activeScenario(workspace),reference,replaceWorkspace,duplicate,rename,remove,switchTo,returned,importEarlier,restoreRemoved,storage,unreadable,clearUnreadable,
  };
}
