'use client';
// Editor state for the road-first workspace: every change goes through a typed command,
// so the undo history has a readable label for each step.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createEditor,endGesture,redo as redoEditor,runCommand,undo as undoEditor,type RoadFirstCommand,type RoadFirstEditor} from '@/core/road-first/commands';
import {compileRoadFirstProject,normalizeRoadFirstProject,type RoadFirstProject} from '@/core/road-first/project';
import {migrateNetworkProject} from '@/core/road-first/migrate';
import {redoLabel,undoLabel} from '@/core/common/history';
import {NETWORK_PROJECT_STORAGE} from '@/core/network/network-project';
import {activeNetworkProject,restoreNetworkScenarioWorkspace} from '@/core/network/network-scenarios';
import type {RoadSection} from '@/core/road-first/derive';
import {DEFAULT_PRESET,presetSection} from '@/core/road-first/presets';

export const ROAD_FIRST_STORAGE='thai-street-road-first-v1';
export const emptyRoadFirstProject=():RoadFirstProject=>({kind:'road-first',schemaVersion:1,title:'โครงการใหม่',roads:[],decisions:[],options:{approachLength:40}});

/** First open: the saved road-first project, else the design from the earlier Network page, else an empty project. */
function initialProject():{project:RoadFirstProject;notice:string}{
  try{
    const saved=localStorage.getItem(ROAD_FIRST_STORAGE);
    if(saved)return{project:normalizeRoadFirstProject(JSON.parse(saved)),notice:'เปิดงานล่าสุดแล้ว'};
    const network=localStorage.getItem(NETWORK_PROJECT_STORAGE);
    if(network){
      const migrated=migrateNetworkProject(activeNetworkProject(restoreNetworkScenarioWorkspace(network)));
      return{project:migrated.project,notice:migrated.issues.length?`นำแบบเดิมมาแล้ว · มีรายการให้ตรวจ ${migrated.issues.length} รายการ`:'นำแบบจากหน้าจอเดิมมาแล้ว'};
    }
  }catch{/* fall through to an empty project */}
  return{project:emptyRoadFirstProject(),notice:'เลือกเครื่องมือวาดถนน แล้วคลิกบนแบบเพื่อเริ่ม'};
}

export type CommandOutcome={ok:boolean;message:string};
/** autoJunctions: crossings that became junctions in the last step, offered for Undo / grade separation. */
export type EditorNotice={text:string;kind:'info'|'error';autoJunctions?:string[]};

export function useRoadEditor(){
  const [editor,setEditor]=useState<RoadFirstEditor>(()=>createEditor(emptyRoadFirstProject()));
  const [notice,setNotice]=useState<EditorNotice>({text:'',kind:'info'});
  // New roads start with the section used last (drawn or edited), not always the default preset.
  const [lastSection,setLastSection]=useState<RoadSection>(()=>presetSection(DEFAULT_PRESET));
  const ready=useRef(false),editorRef=useRef(editor);
  useEffect(()=>{editorRef.current=editor;},[editor]);

  useEffect(()=>{
    // Browser storage is only available after mount; load the saved work once.
    const first=initialProject();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditor(createEditor(first.project));setNotice({text:first.notice,kind:'info'});ready.current=true;
  },[]);
  useEffect(()=>{
    if(!ready.current)return;
    try{localStorage.setItem(ROAD_FIRST_STORAGE,JSON.stringify(editor.project));}catch{/* storage unavailable: keep working in memory */}
  },[editor.project]);

  const compiled=useMemo(()=>compileRoadFirstProject(editor.project),[editor.project]);

  const run=useCallback((cmd:RoadFirstCommand):CommandOutcome=>{
    const {editor:next,result}=runCommand(editorRef.current,cmd);
    if(result.error){setNotice({text:result.error,kind:'error'});return{ok:false,message:result.error};}
    editorRef.current=next;setEditor(next);
    setNotice({text:result.openCrossings.length?`${result.label} · ${result.warnings.at(-1)}`:result.label,kind:'info',autoJunctions:result.autoJunctions.length?result.autoJunctions:undefined});
    if(cmd.type==='road.add')setLastSection(structuredClone(cmd.road.section));
    if(cmd.type==='road.setSection'){const r=next.project.roads.find(x=>x.id===cmd.roadId);if(r)setLastSection(structuredClone(r.section));}
    return{ok:true,message:result.label};
  },[]);
  const finishGesture=useCallback(()=>{const next=endGesture(editorRef.current);editorRef.current=next;setEditor(next);},[]);
  const undo=useCallback(()=>{const r=undoEditor(editorRef.current);if(!r)return;editorRef.current=r.editor;setEditor(r.editor);setNotice({text:`ย้อนกลับ: ${r.label}`,kind:'info'});},[]);
  const redo=useCallback(()=>{const r=redoEditor(editorRef.current);if(!r)return;editorRef.current=r.editor;setEditor(r.editor);setNotice({text:`ทำซ้ำ: ${r.label}`,kind:'info'});},[]);
  const replaceProject=useCallback((project:RoadFirstProject,text:string)=>{const next=createEditor(project);editorRef.current=next;setEditor(next);setNotice({text,kind:'info'});},[]);

  return{
    project:editor.project,compiled,run,finishGesture,undo,redo,replaceProject,notice,setNotice,lastSection,setLastSection,
    undoText:undoLabel(editor.history),redoText:redoLabel(editor.history),
  };
}
