'use client';
import {useEffect,useRef,useState} from 'react';
import {GitBranch,Link2,Map as MapIcon,Minus,MousePointer2,Plus,RotateCw,Trash2,Undo2,Redo2,Maximize2,Move,Network} from 'lucide-react';
import '../junction/style.css';
import './style.css';
import MapBackground,{IMAGERY_BASEMAP_OPTIONS,MAP_PROVIDER_CREDENTIALS_STORAGE,MAP_REFERENCE_STORAGE,STREET_BASEMAP_OPTIONS,basemapAccessLabel,basemapCredentialKey,basemapDescription,basemapKind,mapProviderCredentialsDefaults,mapReferenceDefaults,restoreMapProviderCredentials,restoreMapReference,searchMapPlaces,searchOpenAerialMapImagery,type MapBasemap,type MapPlace,type MapProviderCredentials,type MapReference,type OamImagerySummary} from '../junction/map-background';
import LocalImageReferenceLayer,{clearLocalImageBlob,loadLocalImageBlob,readLocalImageDimensions,saveLocalImageBlob} from './local-reference-layer';
import {LOCAL_IMAGE_REFERENCE_STORAGE,calibrateLocalImageReference,initialLocalImageReference,localImageFootprint,localImageReferenceDefaults,restoreLocalImageReference,type LocalImageReference} from '@/lib/local-reference';
import {clampZoom,panZoom2D} from '../junction/gestures';
import {applyJunctionAuxiliaryProposal,continueJunctionAuxiliaryToCorridor,detachJunctionAuxiliaryHandoff,junctionAuxiliaryHandoffIssues,junctionAuxiliaryProposals,repairJunctionAuxiliaryHandoff,returnJunctionAuxiliaryToLocal,type JunctionAuxiliaryProposalStatus} from '@/lib/junction-auxiliary-proposal';
import {NetworkComparisonGhost,NetworkDrawing,type NetworkComparisonFocus,type NetworkSelection} from './network-drawing';
import {SCENARIO_CHANGE_FILTERS,compareNetworkProjects,filterScenarioObjectDeltas,scenarioObjectBounds,scenarioObjectInspection,type ScenarioChangeFilter,type ScenarioObjectDelta} from '@/lib/network-scenario-comparison';
import {NETWORK_SCENARIO_LIMIT,activeNetworkProject,activeNetworkScenario,createNetworkScenarioWorkspace,duplicateNetworkScenario,removeNetworkScenario,renameNetworkScenario,replaceActiveNetworkProject,restoreNetworkScenarioWorkspace,switchNetworkScenario,type NetworkScenarioWorkspace} from '@/lib/network-scenarios';
import {parseNetworkProjectFile,serializeNetworkProjectFile} from '@/lib/network-project-file';
import {NETWORK_PROJECT_FILE_SESSION_STORAGE,createNetworkProjectFileSession,networkProjectWorkspaceSignature,restoreNetworkProjectFileSession,serializeNetworkProjectFileSession} from '@/lib/network-project-file-session';
import {buildNetworkDesignReport,networkDesignReportHtml} from '@/lib/network-design-report';
import {seedParallelFrontage} from '@/lib/parallel-frontage-seed';
import {insertTransferConnectorVia,moveTransferConnectorVia,removeTransferConnectorVia,transferConnectorControlPoints,updateTransferConnectorViaRadius} from '@/lib/transfer-edit';
import {pocketsFor,sectionFor,type Band,type Direction} from '../junction/model';
import type {Selection} from '../junction/selection';
import NetworkScene3D from './network-scene3d';
import NetworkSectionDock from './network-section-dock';
import ParallelCorridorPanel from './parallel-corridor-panel';
import TransferEditorPanel from './transfer-editor-panel';
import {
  NETWORK_EDIT_JUNCTION_STORAGE,NETWORK_PROJECT_STORAGE,addJunction,addLinkStationComponent,addLinkToParallelCorridor,addParallelCorridor,connectPorts,createNetworkProject,defaultLinkLaneTransition,insertLinkVia,junctionById,junctionConnectedLinkIds,linkControlPoints,linkIssues,linkLaneCounts,linkLaneTransitionPossible,linkLength,linkLinearTransitionPossible,linkWidthTargets,moveJunction,moveJunctionChecked,moveLinkVia,portKey,portPoint,portOccupied,
  markParallelFrontageReviewed,parallelCorridorForLink,projectBounds,reconnectLinkPort,removeJunction,removeLink,removeTransferConnector,removeTransferPort,removeLinkFromParallelCorridor,removeLinkStationComponent,removeParallelCorridor,reverseParallelCorridorReference,removeLinkVia,rotateJunction,rotateJunctionChecked,setJunctionArmEnabled,transformNetworkProject,updateJunctionArmBasics,updateJunctionArmGeometry,updateJunctionArmPocket,updateJunctionArmSection,updateJunctionDesign,updateLinkLaneTransition,updateLinkSectionProfile,updateLinkStationComponent,updateLinkViaRadius,worldJunctionRotation,type LinkDirection,type LinkStationComponentPatch,type LinkWidthTarget,type NetworkProject,type ParallelCorridorMemberRole,type ParallelCorridorSide,type PortRef,type WorldPoint
} from '@/lib/network-project';

type Tool='select'|'junction'|'link'|'pan'|'map-align'|'image-align'|'image-calibrate'|'delete';
type ArmDragState={kind:'arm';id:string;armId:number;before:NetworkProject;startPointer:WorldPoint;startEndpoint:WorldPoint;startClient:{x:number;y:number};active:boolean};
type Drag=
  |{kind:'pan';start:{x:number;y:number};pan:{x:number;y:number}}
  |{kind:'junction';id:string;before:NetworkProject;offset:WorldPoint}
  |{kind:'network-align';before:NetworkProject;start:WorldPoint}
  |{kind:'local-image';start:WorldPoint;center:WorldPoint}
  |ArmDragState
  |{kind:'link-via';id:string;index:number;before:NetworkProject}
  |{kind:'transfer-via';id:string;index:number;before:NetworkProject}
  |null;
type ArmMovePending={drag:ArmDragState;point:WorldPoint;shiftKey:boolean};
type ArmGuideHint={kind:'angle'|'parallel'|'snap';worldAngle:number;label:string};
type ArmDragGuide={junctionId:string;armId:number;worldAngle:number;localAngle:number;length:number;snapped:boolean;hint:ArmGuideHint|null};

const NETWORK_VIEW_SPAN=600,NETWORK_MIN_ZOOM=.2,NETWORK_MAX_ZOOM=5.5;
const comparisonDeltaText=(label:string,delta:number,unit?:string)=>`${label} ${delta>0?'+':''}${delta}${unit?' '+unit:''}`;
const safeFilePart=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,48)||'scenario';
const linkWidthTargetLabel:Record<LinkWidthTarget,string>={walk:'ทางเท้า',bike:'จักรยาน',buffer:'Buffer',shoulder:'ไหล่ทาง',motorcycle:'มอเตอร์ไซค์'};
const proposalStatusLabel:Record<JunctionAuxiliaryProposalStatus,string>={ready:'พร้อมใช้',applied:'ต่อแล้ว','local-only':'Junction only',blocked:'ต้องแก้ก่อน'};
const normalizeAngle=(angle:number)=>((angle%360)+360)%360;
const angleDelta=(a:number,b:number)=>Math.abs((((a-b)+540)%360)-180);
function niceScaleMeters(maxMeters:number){
  const safe=Math.max(.1,maxMeters),power=10**Math.floor(Math.log10(safe));
  for(const factor of [5,2,1]){const value=factor*power;if(value<=safe)return value;}
  return power/2;
}
function nearestArmGuide(project:NetworkProject,junctionId:string,armId:number,worldAngle:number):ArmGuideHint|null{
  const gridAngle=normalizeAngle(Math.round(worldAngle/15)*15),gridDelta=angleDelta(worldAngle,gridAngle);
  let best:{angle:number;delta:number;label:string}|undefined;
  for(const junction of project.junctions)junction.design.arms.forEach((arm,index)=>{
    if(!junction.design.enabled[index]||(junction.id===junctionId&&index===armId))return;
    const heading=normalizeAngle(worldJunctionRotation(junction)+arm.angle);
    for(const candidate of [heading,normalizeAngle(heading+180)]){
      const delta=angleDelta(worldAngle,candidate);
      if(delta<=2.5&&(!best||delta<best.delta))best={angle:candidate,delta,label:`ALIGN ${junction.name} · A${index+1}`};
    }
  });
  if(best)return{kind:'parallel',worldAngle:best.angle,label:best.label};
  return gridDelta<=2.5?{kind:'angle',worldAngle:gridAngle,label:`ANGLE ${gridAngle.toFixed(0)}°`}:null;
}

const tools:[Tool,string,typeof MousePointer2][]=[
  ['select','เลือก',MousePointer2],
  ['junction','ทางแยก',GitBranch],
  ['link','เชื่อมถนน',Link2],
  ['pan','เลื่อนมุมมอง',Move]
];

export default function NetworkWorkspace(){
  const [scenarioWorkspace,setScenarioWorkspace]=useState<NetworkScenarioWorkspace>(createNetworkScenarioWorkspace),
    [project,setProject]=useState<NetworkProject>(()=>activeNetworkProject(scenarioWorkspace)),[selection,setSelection]=useState<NetworkSelection>({kind:'junction',id:'J-1'}),
    [tool,setTool]=useState<Tool>('select'),[pendingPort,setPendingPort]=useState<PortRef|null>(null),[selectedArm,setSelectedArm]=useState<number|null>(null),[selectedDirection,setSelectedDirection]=useState<Direction>('incoming'),[selectedLinkVertex,setSelectedLinkVertex]=useState<number|null>(null),[selectedTransferVertex,setSelectedTransferVertex]=useState<number|null>(null),[deleteArmed,setDeleteArmed]=useState<NetworkSelection>(null),
    [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[notice,setNotice]=useState('เลือกทางแยกแล้วลากจุดกลางเพื่อย้ายทั้งทางแยก'),
    [past,setPast]=useState<NetworkProject[]>([]),[future,setFuture]=useState<NetworkProject[]>([]),
    [mapReference,setMapReference]=useState<MapReference>(mapReferenceDefaults),[mapCredentials,setMapCredentials]=useState<MapProviderCredentials>(mapProviderCredentialsDefaults),[view,setView]=useState<'2d'|'3d'>('2d'),
    [linkCursor,setLinkCursor]=useState<WorldPoint|null>(null),[mapQuery,setMapQuery]=useState(''),[mapPlaces,setMapPlaces]=useState<MapPlace[]>([]),[mapSearching,setMapSearching]=useState(false),
    [oamSummary,setOamSummary]=useState<OamImagerySummary|null>(null),[oamSearching,setOamSearching]=useState(false),[oamError,setOamError]=useState(false),
    [inspectorOpen,setInspectorOpen]=useState(true),[inspectorTab,setInspectorTab]=useState<'object'|'review'|'reference'>('object'),[armGuide,setArmGuide]=useState<ArmDragGuide|null>(null),[mapAlignRotation,setMapAlignRotation]=useState(0),
    [localReference,setLocalReference]=useState<LocalImageReference>(localImageReferenceDefaults),[localImageUrl,setLocalImageUrl]=useState<string|null>(null),
    [calibrationPoints,setCalibrationPoints]=useState<WorldPoint[]>([]),[calibrationDistance,setCalibrationDistance]=useState(20),
    [compareScenarioId,setCompareScenarioId]=useState<string|null>(null),[compareGhostVisible,setCompareGhostVisible]=useState(false),
    [comparisonFilter,setComparisonFilter]=useState<ScenarioChangeFilter>('all'),[comparisonFocus,setComparisonFocus]=useState<NetworkComparisonFocus>(null),
    [comparisonExporting,setComparisonExporting]=useState<'svg'|'png'|null>(null),[comparisonExportStatus,setComparisonExportStatus]=useState(''),
    [networkExporting,setNetworkExporting]=useState<string|null>(null),[networkExportStatus,setNetworkExportStatus]=useState(''),
    [projectFileName,setProjectFileName]=useState(''),[projectFileBaseline,setProjectFileBaseline]=useState<string|null>(null),[saveAsDraft,setSaveAsDraft]=useState<string|null>(null),[fileReplaceArmed,setFileReplaceArmed]=useState<'new'|'open'|null>(null),[resetScenarioArmed,setResetScenarioArmed]=useState(false),
    [parallelDraftMainlineId,setParallelDraftMainlineId]=useState<string|null>(null),[parallelTargetCorridorId,setParallelTargetCorridorId]=useState(''),[parallelSeedOffset,setParallelSeedOffset]=useState(40);
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag>(null),projectRef=useRef(project),scenarioWorkspaceRef=useRef(scenarioWorkspace),storageReady=useRef(false),fieldBefore=useRef<NetworkProject|null>(null),
    pastRef=useRef<NetworkProject[]>([]),futureRef=useRef<NetworkProject[]>([]),scenarioHistoryRef=useRef(new Map<string,{past:NetworkProject[];future:NetworkProject[]}>()),armMoveFrame=useRef<number|null>(null),armMovePending=useRef<ArmMovePending|null>(null),
    localImageInput=useRef<HTMLInputElement>(null),networkProjectFileInput=useRef<HTMLInputElement>(null),localImageUrlRef=useRef<string|null>(null);

  const viewWidthMeters=NETWORK_VIEW_SPAN/zoom,scaleMeters=niceScaleMeters(viewWidthMeters*.18),scaleWidthPercent=scaleMeters/viewWidthMeters*100;
  useEffect(()=>{projectRef.current=project;},[project]);
  useEffect(()=>{scenarioWorkspaceRef.current=scenarioWorkspace;},[scenarioWorkspace]);
  useEffect(()=>{
    let active=true;
    try{
      localStorage.removeItem(NETWORK_EDIT_JUNCTION_STORAGE);
      const restoredWorkspace=restoreNetworkScenarioWorkspace(localStorage.getItem(NETWORK_PROJECT_STORAGE)),restoredProject=activeNetworkProject(restoredWorkspace),restoredMap=restoreMapReference(localStorage.getItem(MAP_REFERENCE_STORAGE)),restoredCredentials=restoreMapProviderCredentials(localStorage.getItem(MAP_PROVIDER_CREDENTIALS_STORAGE)),restoredLocalReference=restoreLocalImageReference(localStorage.getItem(LOCAL_IMAGE_REFERENCE_STORAGE)),restoredFileSession=restoreNetworkProjectFileSession(localStorage.getItem(NETWORK_PROJECT_FILE_SESSION_STORAGE));
      queueMicrotask(()=>{if(!active)return;storageReady.current=true;scenarioWorkspaceRef.current=restoredWorkspace;projectRef.current=restoredProject;setScenarioWorkspace(restoredWorkspace);setProject(restoredProject);setMapReference(restoredMap);setMapCredentials(restoredCredentials);setLocalReference(restoredLocalReference);setProjectFileName(restoredFileSession?.fileName??'');setProjectFileBaseline(restoredFileSession?.baselineSignature??null);});
    }catch{storageReady.current=true;}
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!storageReady.current||drag.current)return;try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(scenarioWorkspace));}catch{}},[scenarioWorkspace]);
  useEffect(()=>()=>{if(armMoveFrame.current!==null)cancelAnimationFrame(armMoveFrame.current);},[]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(MAP_REFERENCE_STORAGE,JSON.stringify(mapReference));}catch{}},[mapReference]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(MAP_PROVIDER_CREDENTIALS_STORAGE,JSON.stringify(mapCredentials));}catch{}},[mapCredentials]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(LOCAL_IMAGE_REFERENCE_STORAGE,JSON.stringify(localReference));}catch{}},[localReference]);
  useEffect(()=>{
    let active=true;
    loadLocalImageBlob().then(blob=>{
      if(!active||!blob)return;
      const url=URL.createObjectURL(blob);if(localImageUrlRef.current)URL.revokeObjectURL(localImageUrlRef.current);localImageUrlRef.current=url;setLocalImageUrl(url);
    }).catch(()=>{});
    return()=>{active=false;if(localImageUrlRef.current){URL.revokeObjectURL(localImageUrlRef.current);localImageUrlRef.current=null;}};
  },[]);
  useEffect(()=>{
    if(!mapReference.enabled||mapReference.basemap!=='oam-global')return;
    let stale=false;const timer=window.setTimeout(()=>{
      setOamSearching(true);setOamError(false);
      searchOpenAerialMapImagery(mapReference.lat,mapReference.lng,3000)
        .then(summary=>{if(!stale)setOamSummary(summary);})
        .catch(()=>{if(!stale){setOamSummary(null);setOamError(true);}})
        .finally(()=>{if(!stale)setOamSearching(false);});
    },450);
    return()=>{stale=true;window.clearTimeout(timer);};
  },[mapReference.enabled,mapReference.basemap,mapReference.lat,mapReference.lng]);

  const currentScenario=activeNetworkScenario(scenarioWorkspace),
    comparisonCandidates=scenarioWorkspace.scenarios.filter(s=>s.id!==currentScenario.id),
    comparisonScenario=comparisonCandidates.find(s=>s.id===compareScenarioId)??comparisonCandidates.find(s=>s.kind==='existing')??comparisonCandidates[0]??null,
    scenarioComparison=comparisonScenario?compareNetworkProjects(comparisonScenario.project,project):null,
    comparisonHighlights=scenarioComparison?scenarioComparison.metrics.filter(metric=>metric.delta!==0).slice(0,4):[],
    filteredComparisonObjects=scenarioComparison?filterScenarioObjectDeltas(scenarioComparison.objects,comparisonFilter):[],
    focusedComparisonObject=scenarioComparison&&comparisonFocus?scenarioComparison.objects.find(item=>item.kind===comparisonFocus.kind&&item.id===comparisonFocus.id)??null:null,
    comparisonInspection=comparisonScenario&&focusedComparisonObject?scenarioObjectInspection(comparisonScenario.project,project,focusedComparisonObject):null,
    focusedComparisonFilteredIndex=focusedComparisonObject?filteredComparisonObjects.findIndex(item=>item.kind===focusedComparisonObject.kind&&item.id===focusedComparisonObject.id):-1,
    focusedComparisonActiveExists=!!focusedComparisonObject&&(focusedComparisonObject.kind==='junction'?project.junctions.some(item=>item.id===focusedComparisonObject.id):project.links.some(item=>item.id===focusedComparisonObject.id)),
    localImageSize=localImageFootprint(localReference),calibrationMeasured=calibrationPoints.length===2?Math.hypot(calibrationPoints[1].x-calibrationPoints[0].x,calibrationPoints[1].y-calibrationPoints[0].y):null,
    mapKind=basemapKind(mapReference.basemap),mapCredentialKey=basemapCredentialKey(mapReference.basemap),
    selectedJunction=selection?.kind==='junction'?junctionById(project,selection.id):undefined,
    selectedLink=selection?.kind==='link'?project.links.find(l=>l.id===selection.id):undefined,
    selectedTransferPort=selection?.kind==='transfer-port'?project.transferPorts.find(port=>port.id===selection.id):undefined,
    selectedTransferConnector=selection?.kind==='transfer-connector'?project.transferConnectors.find(connector=>connector.id===selection.id):undefined,
    selectedParallelMembership=selectedLink?parallelCorridorForLink(project,selectedLink.id):null,
    selectedParallelCorridorId=selectedParallelMembership?.corridor.id??null,
    effectiveParallelTargetCorridorId=project.parallelCorridors.some(v=>v.id===parallelTargetCorridorId)?parallelTargetCorridorId:(project.parallelCorridors[0]?.id??''),
    selectedArmData=selectedJunction&&selectedArm!==null&&selectedJunction.design.enabled[selectedArm]?selectedJunction.design.arms[selectedArm]:undefined,
    selectedSection=selectedArmData?sectionFor(selectedArmData,selectedDirection):undefined,
    selectedPockets=selectedArmData?pocketsFor(selectedArmData,selectedDirection):undefined,
    selectedIssues=selectedLink?linkIssues(project,selectedLink):[],
    selectedVia=selectedLink&&selectedLinkVertex!==null?selectedLink.via[selectedLinkVertex]:undefined,
    selectedTransferVia=selectedTransferConnector&&selectedTransferVertex!==null?selectedTransferConnector.via[selectedTransferVertex]:undefined,
    linearTransitionPossible=selectedLink?linkLinearTransitionPossible(project,selectedLink):false,
    selectedAuxiliaryProposals=selectedLink?junctionAuxiliaryProposals(project,selectedLink):[],
    selectedHandoffIssues=selectedLink?junctionAuxiliaryHandoffIssues(project,selectedLink):[],
    selectedConnectedLinkIds=selectedJunction?junctionConnectedLinkIds(project,selectedJunction.id):[],
    deleteArmedForSelection=!!selection&&!!deleteArmed&&selection.kind===deleteArmed.kind&&selection.id===deleteArmed.id,
    projectFileSignature=networkProjectWorkspaceSignature(scenarioWorkspace),
    projectFileDirty=projectFileBaseline===null||projectFileBaseline!==projectFileSignature,
    suggestedProjectFileName=`${safeFilePart(scenarioWorkspace.scenarios.find(s=>s.kind==='existing')?.project.title??project.title??'street-project')}.tsd.json`;
  const designReport=buildNetworkDesignReport(project,currentScenario.name,comparisonScenario?{name:comparisonScenario.name,project:comparisonScenario.project}:undefined);
  function setProjectNow(next:NetworkProject){
    if(parallelDraftMainlineId&&!next.links.some(link=>link.id===parallelDraftMainlineId))setParallelDraftMainlineId(null);
    projectRef.current=next;setProject(next);
    const workspace=replaceActiveNetworkProject(scenarioWorkspaceRef.current,next);
    scenarioWorkspaceRef.current=workspace;setScenarioWorkspace(workspace);
  }
  function persistProjectSnapshot(next:NetworkProject){
    if(!storageReady.current)return;
    const workspace=replaceActiveNetworkProject(scenarioWorkspaceRef.current,next);
    scenarioWorkspaceRef.current=workspace;setScenarioWorkspace(workspace);
    try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(workspace));}catch{}
  }
  function remember(before:NetworkProject){
    const nextPast=[...pastRef.current.slice(-39),before],scenarioId=scenarioWorkspaceRef.current.activeScenarioId;
    pastRef.current=nextPast;futureRef.current=[];setPast(nextPast);setFuture([]);
    scenarioHistoryRef.current.set(scenarioId,{past:nextPast,future:[]});
  }
  function commit(next:NetworkProject,before=projectRef.current){
    if(next===before)return;
    setDeleteArmed(null);setFileReplaceArmed(null);setResetScenarioArmed(false);remember(before);setProjectNow(next);
  }
  function selectionSurvives(next:NetworkProject,target:NetworkSelection){
    if(!target)return false;
    return target.kind==='junction'?next.junctions.some(v=>v.id===target.id):target.kind==='link'?next.links.some(v=>v.id===target.id):target.kind==='transfer-port'?next.transferPorts.some(v=>v.id===target.id):next.transferConnectors.some(v=>v.id===target.id);
  }
  function restoreHistoryContext(next:NetworkProject){
    const kept=selectionSurvives(next,selection)?selection:null;setSelection(kept);setPendingPort(null);setLinkCursor(null);setDeleteArmed(null);setResetScenarioArmed(false);setArmGuide(null);
    if(kept?.kind==='junction'){const junction=next.junctions.find(v=>v.id===kept.id);if(selectedArm!==null&&!junction?.design.enabled[selectedArm])setSelectedArm(null);}else{setSelectedArm(null);setSelectedDirection('incoming');}
    if(kept?.kind==='link'){const link=next.links.find(v=>v.id===kept.id);if(selectedLinkVertex!==null&&!link?.via[selectedLinkVertex])setSelectedLinkVertex(null);}else setSelectedLinkVertex(null);
    if(kept?.kind==='transfer-connector'){const connector=next.transferConnectors.find(v=>v.id===kept.id);if(selectedTransferVertex!==null&&!connector?.via[selectedTransferVertex])setSelectedTransferVertex(null);}else setSelectedTransferVertex(null);
  }
  function undo(){
    const history=pastRef.current,previous=history.at(-1);if(!previous)return;
    const nextPast=history.slice(0,-1),nextFuture=[projectRef.current,...futureRef.current.slice(0,39)];
    pastRef.current=nextPast;futureRef.current=nextFuture;setPast(nextPast);setFuture(nextFuture);scenarioHistoryRef.current.set(scenarioWorkspaceRef.current.activeScenarioId,{past:nextPast,future:nextFuture});setProjectNow(previous);restoreHistoryContext(previous);
  }
  function redo(){
    const next=futureRef.current[0];if(!next)return;
    const nextPast=[...pastRef.current.slice(-39),projectRef.current],nextFuture=futureRef.current.slice(1);
    pastRef.current=nextPast;futureRef.current=nextFuture;setPast(nextPast);setFuture(nextFuture);scenarioHistoryRef.current.set(scenarioWorkspaceRef.current.activeScenarioId,{past:nextPast,future:nextFuture});setProjectNow(next);restoreHistoryContext(next);
  }
  function installScenarioWorkspace(next:NetworkScenarioWorkspace,message:string,saveCurrentHistory=true){
    const currentId=scenarioWorkspaceRef.current.activeScenarioId;
    if(saveCurrentHistory)scenarioHistoryRef.current.set(currentId,{past:pastRef.current,future:futureRef.current});
    scenarioWorkspaceRef.current=next;setScenarioWorkspace(next);
    const nextProject=activeNetworkProject(next),history=scenarioHistoryRef.current.get(next.activeScenarioId)??{past:[],future:[]};
    projectRef.current=nextProject;setProject(nextProject);pastRef.current=history.past;futureRef.current=history.future;setPast(history.past);setFuture(history.future);
    setSelection(null);setPendingPort(null);setLinkCursor(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setSelectedTransferVertex(null);setDeleteArmed(null);setResetScenarioArmed(false);setArmGuide(null);setParallelDraftMainlineId(null);setParallelTargetCorridorId('');setNotice(message);
  }
  function selectScenario(id:string){
    if(id===scenarioWorkspaceRef.current.activeScenarioId)return;
    const next=switchNetworkScenario(scenarioWorkspaceRef.current,id),scenario=activeNetworkScenario(next);
    installScenarioWorkspace(next,`สลับไป ${scenario.name} · geometry และ Undo/Redo แยกจาก scenario อื่น`);
  }
  function addAlternativeScenario(){
    const result=duplicateNetworkScenario(scenarioWorkspaceRef.current);
    if(result.error||!result.scenario){setNotice(result.error??'สร้าง Alternative ไม่สำเร็จ');return;}
    scenarioHistoryRef.current.set(result.scenario.id,{past:[],future:[]});
    installScenarioWorkspace(result.workspace,`สร้าง ${result.scenario.name} จาก ${currentScenario.name} แล้ว · เริ่มแก้แบบทางเลือกได้โดยไม่กระทบต้นฉบับ`);
  }
  function renameCurrentScenario(name:string){
    const result=renameNetworkScenario(scenarioWorkspaceRef.current,scenarioWorkspaceRef.current.activeScenarioId,name);
    if(result.error){setNotice(result.error);return;}
    scenarioWorkspaceRef.current=result.workspace;setScenarioWorkspace(result.workspace);setNotice(`เปลี่ยนชื่อ scenario เป็น ${result.scenario?.name}`);
  }
  function deleteCurrentScenario(){
    const id=scenarioWorkspaceRef.current.activeScenarioId,scenario=activeNetworkScenario(scenarioWorkspaceRef.current),result=removeNetworkScenario(scenarioWorkspaceRef.current,id);
    if(result.error){setNotice(result.error);return;}
    scenarioHistoryRef.current.delete(id);if(result.workspace.scenarios.length<2){setCompareScenarioId(null);setCompareGhostVisible(false);setComparisonFocus(null);}installScenarioWorkspace(result.workspace,`ลบ ${scenario.name} แล้ว · กลับ Existing`,false);
  }
  function normalizeProjectFileName(value:string){
    const trimmed=value.trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/^\.+/,'').slice(0,100);
    return !trimmed?suggestedProjectFileName:/\.json$/i.test(trimmed)?trimmed:trimmed+'.tsd.json';
  }
  function installProjectFileSession(fileName:string,workspace:NetworkScenarioWorkspace){
    const session=createNetworkProjectFileSession(fileName,workspace);setProjectFileName(session.fileName);setProjectFileBaseline(session.baselineSignature);
    try{localStorage.setItem(NETWORK_PROJECT_FILE_SESSION_STORAGE,serializeNetworkProjectFileSession(session));}catch{}
  }
  function clearProjectFileSession(){
    setProjectFileName('');setProjectFileBaseline(null);
    try{localStorage.removeItem(NETWORK_PROJECT_FILE_SESSION_STORAGE);}catch{}
  }
  function downloadProjectFile(name:string){
    const workspace=scenarioWorkspaceRef.current,fileName=normalizeProjectFileName(name),blob=new Blob([serializeNetworkProjectFile(workspace)],{type:'application/json;charset=utf-8'}),
      url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    installProjectFileSession(fileName,workspace);setSaveAsDraft(null);setFileReplaceArmed(null);setNotice(`บันทึก ${fileName} แล้ว · browser ดาวน์โหลด Project JSON และ autosave ยังคงแยกอยู่ในเครื่องนี้`);
  }
  function saveProjectFile(){downloadProjectFile(projectFileName||suggestedProjectFileName);}
  function requestNewProjectFile(){
    if(projectFileDirty&&fileReplaceArmed!=='new'){setFileReplaceArmed('new');setNotice('Project ปัจจุบันมีการเปลี่ยนแปลงที่ยังไม่ได้ Save เป็นไฟล์ · กด New อีกครั้งเพื่อยืนยัน (browser autosave ยังอยู่จนกว่าจะสร้างไฟล์ใหม่)');return;}
    const next=createNetworkScenarioWorkspace(),nextProject=activeNetworkProject(next);scenarioHistoryRef.current.clear();installScenarioWorkspace(next,'สร้าง Project ใหม่แล้ว · engineering state เริ่มจาก Network demo ใหม่',false);
    clearProjectFileSession();setSaveAsDraft(null);setFileReplaceArmed(null);setCompareScenarioId(null);setCompareGhostVisible(false);setComparisonFocus(null);setView('2d');setPan({x:0,y:0});setZoom(1);setSelection({kind:'junction',id:nextProject.junctions[0]?.id??'J-1'});
  }
  function requestOpenProjectFile(){
    if(projectFileDirty&&fileReplaceArmed!=='open'){setFileReplaceArmed('open');setNotice('Project ปัจจุบันมีการเปลี่ยนแปลงที่ยังไม่ได้ Save เป็นไฟล์ · กด Open อีกครั้งเพื่อเลือกไฟล์ใหม่');return;}
    setFileReplaceArmed(null);networkProjectFileInput.current?.click();
  }
  async function openProjectFile(file:File|undefined){
    if(!file)return;
    if(file.size>20*1024*1024){setNotice('Project JSON ใหญ่เกิน 20 MB · ตรวจว่าเลือกไฟล์ Thai Street Designer ถูกต้อง');return;}
    try{
      const parsed=parseNetworkProjectFile(await file.text()),workspace=parsed.workspace,nextProject=activeNetworkProject(workspace),b=projectBounds(nextProject);
      scenarioHistoryRef.current.clear();installScenarioWorkspace(workspace,`เปิด ${file.name} แล้ว · ${workspace.scenarios.length} scenario`,false);
      installProjectFileSession(file.name,workspace);setSaveAsDraft(null);setFileReplaceArmed(null);setCompareScenarioId(null);setCompareGhostVisible(false);setComparisonFocus(null);setView('2d');
      setPan({x:b.x+b.w/2,y:b.y+b.h/2});setZoom(clampZoom(NETWORK_VIEW_SPAN/Math.max(b.w,b.h)*.9,NETWORK_MIN_ZOOM,Math.min(4.5,NETWORK_MAX_ZOOM)));
      setSelection(nextProject.junctions[0]?{kind:'junction',id:nextProject.junctions[0].id}:null);
    }catch(error){setNotice('เปิด Project ไม่สำเร็จ · '+(error instanceof Error?error.message:'ไฟล์ไม่ถูกต้อง'));}
  }
  function inspectComparisonObject(item:ScenarioObjectDelta){
    if(!comparisonScenario)return;
    const bounds=scenarioObjectBounds(comparisonScenario.project,project,item);
    setComparisonFocus({kind:item.kind,id:item.id});setCompareGhostVisible(true);setView('2d');setInspectorOpen(true);setInspectorTab('review');choose('select');
    if(bounds){
      setPan({x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2});
      setZoom(clampZoom(NETWORK_VIEW_SPAN/Math.max(bounds.w,bounds.h,70)*.72,NETWORK_MIN_ZOOM,Math.min(4.2,NETWORK_MAX_ZOOM)));
    }
    setNotice(`Inspect ${item.kind==='junction'?'Junction':'Road Link'} ${item.id} · ${item.status.toUpperCase()} · ghost reference เปิดแล้ว`);
  }
  function navigateComparison(step:number){
    if(!filteredComparisonObjects.length)return;
    const nextIndex=focusedComparisonFilteredIndex<0
      ?(step>0?0:filteredComparisonObjects.length-1)
      :(focusedComparisonFilteredIndex+step+filteredComparisonObjects.length)%filteredComparisonObjects.length;
    inspectComparisonObject(filteredComparisonObjects[nextIndex]);
  }
  function selectFocusedComparisonActive(){
    if(!focusedComparisonObject||!focusedComparisonActiveExists)return;
    choose('select');setView('2d');setInspectorOpen(true);setInspectorTab('object');setPendingPort(null);setLinkCursor(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setSelectedTransferVertex(null);
    setSelection(focusedComparisonObject.kind==='junction'?{kind:'junction',id:focusedComparisonObject.id}:{kind:'link',id:focusedComparisonObject.id});
    setNotice(`เลือก ${focusedComparisonObject.kind==='junction'?'Junction':'Road Link'} ${focusedComparisonObject.id} ใน ${currentScenario.name} แล้ว · Reference ghost ยังคงเป็น read-only`);
  }
  function downloadBlob(blob:Blob,name:string){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportScenarioComparison(format:'svg'|'png'){
    if(!comparisonScenario||!scenarioComparison||!svg.current||comparisonExporting)return;
    setComparisonExporting(format);setComparisonExportStatus('');
    try{
      setView('2d');setCompareGhostVisible(true);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      await document.fonts.ready;
      const source=svg.current;if(!source)throw Error('Comparison canvas not ready');
      const copy=source.cloneNode(true) as SVGSVGElement,activeBounds=projectBounds(project),referenceBounds=projectBounds(comparisonScenario.project),
        x=Math.min(activeBounds.x,referenceBounds.x),y=Math.min(activeBounds.y,referenceBounds.y),
        right=Math.max(activeBounds.x+activeBounds.w,referenceBounds.x+referenceBounds.w),bottom=Math.max(activeBounds.y+activeBounds.h,referenceBounds.y+referenceBounds.h),
        w=Math.max(40,right-x),h=Math.max(40,bottom-y),base=Math.max(w,h,120),pad=Math.max(12,base*.045),titleSize=Math.max(5,Math.min(9,base*.018)),
        headerH=titleSize*5.8,vx=x-pad,vy=y-pad-headerH,vw=w+pad*2,vh=h+pad*2+headerH,outputWidth=2000,outputHeight=Math.max(700,Math.round(outputWidth*vh/vw));
      copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('viewBox',`${vx} ${vy} ${vw} ${vh}`);copy.setAttribute('width',String(outputWidth));copy.setAttribute('height',String(outputHeight));
      copy.querySelector('[data-network-background="true"]')?.setAttribute('fill','#ffffff');
      copy.querySelector('[data-network-grid="true"]')?.setAttribute('opacity','.12');
      copy.querySelectorAll('[data-network-junction-hit],[data-network-instance-handle],[data-network-instance-selection],[data-network-arm-handle],[data-network-arm-selection],[data-network-port],[data-link-via-group],[data-network-arm-guide],[data-network-link-preview],[data-local-reference-calibration]').forEach(node=>node.remove());
      const ns='http://www.w3.org/2000/svg',group=document.createElementNS(ns,'g'),panel=document.createElementNS(ns,'rect');
      panel.setAttribute('x',String(vx));panel.setAttribute('y',String(vy));panel.setAttribute('width',String(vw));panel.setAttribute('height',String(headerH+pad*.45));panel.setAttribute('fill','#fffaf3');panel.setAttribute('stroke','#dccdbb');panel.setAttribute('stroke-width',String(Math.max(.25,titleSize*.06)));group.appendChild(panel);
      const addText=(tx:number,ty:number,text:string,size:number,weight='500',fill='#45565d')=>{const el=document.createElementNS(ns,'text');el.setAttribute('x',String(tx));el.setAttribute('y',String(ty));el.setAttribute('font-family','Arial, sans-serif');el.setAttribute('font-size',String(size));el.setAttribute('font-weight',weight);el.setAttribute('fill',fill);el.textContent=text;group.appendChild(el);return el;};
      const left=vx+pad*.55,top=vy+titleSize*1.45;
      addText(left,top,'Scenario Comparison',titleSize,'800','#263b44');
      addText(left,top+titleSize*1.45,`${comparisonScenario.name}  →  ${currentScenario.name}`,titleSize*.78,'700','#6b5a48');
      const countText=`${scenarioComparison.counts.added} added · ${scenarioComparison.counts.removed} removed · ${scenarioComparison.counts.changed} changed`,
        highlightText=comparisonHighlights.length?comparisonHighlights.map(metric=>comparisonDeltaText(metric.label,metric.delta,metric.unit)).join(' · '):'No engineering metric delta';
      addText(left,top+titleSize*2.75,countText,titleSize*.64,'700','#7a654e');
      addText(left,top+titleSize*3.82,highlightText,titleSize*.58,'500','#66777d');
      const legendX=vx+vw-pad*.55-titleSize*18,legendY=top;
      for(const [offset,color,label] of [[0,'#0e9f99',`ACTIVE · ${currentScenario.name}`],[titleSize*1.55,'#b56f2d',`REFERENCE · ${comparisonScenario.name}`]] as const){
        const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',String(legendX));dot.setAttribute('cy',String(legendY+offset-titleSize*.2));dot.setAttribute('r',String(titleSize*.34));dot.setAttribute('fill',color);group.appendChild(dot);addText(legendX+titleSize*.7,legendY+offset,label,titleSize*.58,'700','#526066');
      }
      copy.appendChild(group);
      const svgBlob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}),
        baseName=`comparison-${safeFilePart(comparisonScenario.name)}-vs-${safeFilePart(currentScenario.name)}`;
      if(format==='svg'){
        const name=baseName+'.svg';downloadBlob(svgBlob,name);setComparisonExportStatus(name);setNotice('ส่งออก Scenario Comparison SVG แล้ว · geometry-only พร้อม title / legend / summary');return;
      }
      const url=URL.createObjectURL(svgBlob);
      try{
        const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Render comparison image failed'));image.src=url;});
        const canvas=document.createElement('canvas');canvas.width=outputWidth;canvas.height=outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('PNG encode failed');
        const name=baseName+'.png';downloadBlob(png,name);setComparisonExportStatus(name);setNotice('ส่งออก Scenario Comparison PNG แล้ว · geometry-only พร้อม title / legend / summary');
      }finally{URL.revokeObjectURL(url);}
    }catch(error){const message=error instanceof Error?error.message:'Comparison export failed';setComparisonExportStatus('error');setNotice('ส่งออก comparison ไม่สำเร็จ · '+message);}
    finally{setComparisonExporting(null);}
  }
  function exportDesignReport(){
    const html=networkDesignReportHtml(designReport),name=`design-summary-${safeFilePart(project.title)}-${safeFilePart(currentScenario.name)}.html`;
    downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),name);setNetworkExportStatus(name);setNotice('ส่งออก Design Summary HTML แล้ว · ใช้ engineering state / warnings / scenario delta ชุดเดียวกับ workspace');
  }
  async function exportNetworkFigure(scope:'current'|'full',format:'svg'|'png'){
    if(!svg.current||networkExporting)return;
    const exportKey=scope+'-'+format;setNetworkExporting(exportKey);setNetworkExportStatus('');
    try{
      setView('2d');
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      await document.fonts.ready;
      const source=svg.current;if(!source)throw Error('Network canvas not ready');
      const current=source.getAttribute('viewBox')?.trim().split(/\s+/).map(Number)??[];
      if(current.length!==4||current.some(value=>!Number.isFinite(value)))throw Error('Invalid Network viewBox');
      const bounds=scope==='full'?projectBounds(project,0):{x:current[0],y:current[1],w:current[2],h:current[3]},
        w=Math.max(40,bounds.w),h=Math.max(40,bounds.h),base=Math.max(w,h,120),
        pad=scope==='full'?Math.max(10,base*.035):0,titleSize=Math.max(5,Math.min(10,base*.018)),
        headerH=titleSize*4.5,footerH=titleSize*2.4,vx=bounds.x-pad,vy=bounds.y-pad-headerH,
        vw=w+pad*2,vh=h+pad*2+headerH+footerH,outputWidth=2000,outputHeight=Math.max(700,Math.min(4000,Math.round(outputWidth*vh/vw))),
        copy=source.cloneNode(true) as SVGSVGElement;
      copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('viewBox',`${vx} ${vy} ${vw} ${vh}`);copy.setAttribute('width',String(outputWidth));copy.setAttribute('height',String(outputHeight));
      copy.querySelector('[data-network-background="true"]')?.setAttribute('fill','#ffffff');
      copy.querySelector('[data-network-grid="true"]')?.setAttribute('opacity','.10');
      copy.querySelectorAll('[data-network-junction-hit],[data-network-instance-handle],[data-network-instance-selection],[data-network-arm-handle],[data-network-arm-selection],[data-network-port],[data-link-via-group],[data-network-arm-guide],[data-network-link-preview],[data-local-reference-calibration],[data-network-comparison-ghost],[data-network-comparison-active-focus-path],[data-network-comparison-active-focus-ring]').forEach(node=>node.remove());
      const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g'),
        addRect=(x:number,y:number,width:number,height:number,fill:string,stroke='none')=>{const el=document.createElementNS(ns,'rect');el.setAttribute('x',String(x));el.setAttribute('y',String(y));el.setAttribute('width',String(width));el.setAttribute('height',String(height));el.setAttribute('fill',fill);el.setAttribute('stroke',stroke);el.setAttribute('stroke-width',String(Math.max(.2,titleSize*.045)));overlay.appendChild(el);return el;},
        addText=(x:number,y:number,text:string,size:number,weight='500',fill='#45565d',anchor='start')=>{const el=document.createElementNS(ns,'text');el.setAttribute('x',String(x));el.setAttribute('y',String(y));el.setAttribute('font-family','Arial, Noto Sans Thai, sans-serif');el.setAttribute('font-size',String(size));el.setAttribute('font-weight',weight);el.setAttribute('fill',fill);el.setAttribute('text-anchor',anchor);el.textContent=text;overlay.appendChild(el);return el;};
      addRect(vx,vy,vw,headerH,'#f5faf9','#cedbd9');addRect(vx,bounds.y+h+pad,vw,footerH,'#ffffff','#d9e2e1');
      const left=vx+Math.max(titleSize,pad*.55),top=vy+titleSize*1.45;
      addText(left,top,project.title,titleSize,'800','#263b44');
      addText(left,top+titleSize*1.45,`Scenario: ${currentScenario.name} · ${project.junctions.length} junctions · ${project.links.length} road links · ${scope==='full'?'FULL NETWORK':'CURRENT VIEW'}`,titleSize*.62,'650','#60716f');
      addText(vx+vw-Math.max(titleSize,pad*.55),top,'Thai Street Designer',titleSize*.58,'700','#4d7772','end');
      const scale=niceScaleMeters(w*.18),scaleX=left,footerY=bounds.y+h+pad+footerH*.52,scaleLabel=scale>=1000?(scale/1000)+' km':scale+' m',
        line=document.createElementNS(ns,'line');line.setAttribute('x1',String(scaleX));line.setAttribute('x2',String(scaleX+scale));line.setAttribute('y1',String(footerY));line.setAttribute('y2',String(footerY));line.setAttribute('stroke','#263b44');line.setAttribute('stroke-width',String(Math.max(.35,titleSize*.07)));overlay.appendChild(line);
      for(const x of [scaleX,scaleX+scale]){const tick=document.createElementNS(ns,'line');tick.setAttribute('x1',String(x));tick.setAttribute('x2',String(x));tick.setAttribute('y1',String(footerY-titleSize*.35));tick.setAttribute('y2',String(footerY+titleSize*.35));tick.setAttribute('stroke','#263b44');tick.setAttribute('stroke-width',String(Math.max(.35,titleSize*.07)));overlay.appendChild(tick);}
      addText(scaleX,footerY-titleSize*.55,scaleLabel,titleSize*.55,'700','#263b44');
      addText(vx+vw-Math.max(titleSize,pad*.55),footerY,'CONCEPT DESIGN · NOT FOR DETAILED ENGINEERING / CONSTRUCTION',titleSize*.52,'700','#7a5d47','end');
      copy.appendChild(overlay);
      const svgBlob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}),
        baseName=`network-${safeFilePart(project.title)}-${safeFilePart(currentScenario.name)}-${scope}`;
      if(format==='svg'){
        const name=baseName+'.svg';downloadBlob(svgBlob,name);setNetworkExportStatus(name);setNotice(`ส่งออก ${scope==='full'?'Full Network':'Current View'} SVG แล้ว · geometry-only พร้อม title / scale / concept disclaimer`);return;
      }
      const url=URL.createObjectURL(svgBlob);
      try{
        const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Render Network image failed'));image.src=url;});
        const canvas=document.createElement('canvas');canvas.width=outputWidth;canvas.height=outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('PNG encode failed');
        const name=baseName+'.png';downloadBlob(png,name);setNetworkExportStatus(name);setNotice(`ส่งออก ${scope==='full'?'Full Network':'Current View'} PNG แล้ว · geometry-only พร้อม title / scale / concept disclaimer`);
      }finally{URL.revokeObjectURL(url);}
    }catch(error){const message=error instanceof Error?error.message:'Network export failed';setNetworkExportStatus('error');setNotice('ส่งออก Network ไม่สำเร็จ · '+message);}
    finally{setNetworkExporting(null);}
  }
  function point(e:{clientX:number;clientY:number}){const matrix=svg.current?.getScreenCTM();if(!matrix)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y};}
  function choose(next:Tool){setTool(next);setArmGuide(null);setDeleteArmed(null);if(next==='map-align'){setView('2d');if(!mapReference.enabled)setMapReference(v=>({...v,enabled:true}));}if(next==='image-align'||next==='image-calibrate'){setView('2d');if(localImageUrl)setLocalReference(v=>({...v,enabled:true}));}if(next==='image-calibrate')setCalibrationPoints([]);if(next!=='link'){setPendingPort(null);setLinkCursor(null);}if(next!=='select'){setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}setNotice(next==='junction'?'คลิกตำแหน่งบนแผนเพื่อสร้าง Junction instance':next==='link'?'คลิก port ต้นทาง แล้วเลือก port ปลายทาง · ระบบจะแสดงแนว preview':next==='pan'?'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง':next==='map-align'?'ลากพื้นที่ว่างเพื่อย้าย Network ทั้งชุดบนแผนที่ · Design v6 ภายในไม่เปลี่ยน':next==='image-align'?'ลากบน canvas เพื่อย้ายภาพอ้างอิง · engineering geometry ไม่เปลี่ยน':next==='image-calibrate'?'คลิกจุด A และ B บนภาพอ้างอิง แล้ว Apply ตามระยะจริงที่กำหนด':next==='delete'?'คลิกวัตถุเพื่อลบ หรือกด Delete':'เลือกวัตถุ · ลาก Arm อิสระ หรือกด Shift ระหว่างลากเพื่อ snap 15°');}
  function beginFieldEdit(){fieldBefore.current=projectRef.current;}
  function finishFieldEdit(){const before=fieldBefore.current;fieldBefore.current=null;if(before&&before!==projectRef.current)remember(before);}
  async function findPlace(){
    const q=mapQuery.trim();if(q.length<2){setMapPlaces([]);return;}
    setMapSearching(true);
    try{const places=await searchMapPlaces(q);setMapPlaces(places);if(!places.length)setNotice('ไม่พบสถานที่จากคำค้นนี้');}
    catch{setMapPlaces([]);setNotice('ค้นหาสถานที่ไม่สำเร็จ · ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');}
    finally{setMapSearching(false);}
  }
  async function importLocalReference(file:File|undefined){
    if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>50*1024*1024){setNotice('รองรับ JPG/PNG ขนาดไม่เกิน 50 MB');return;}
    try{
      const dimensions=await readLocalImageDimensions(file);await saveLocalImageBlob(file);
      const url=URL.createObjectURL(file);if(localImageUrlRef.current)URL.revokeObjectURL(localImageUrlRef.current);localImageUrlRef.current=url;setLocalImageUrl(url);
      setLocalReference(initialLocalImageReference(file.name,dimensions.width,dimensions.height,pan,Math.min(360,NETWORK_VIEW_SPAN/zoom*.75)));
      setCalibrationPoints([]);setCalibrationDistance(20);choose('select');setNotice('นำเข้าภาพอ้างอิงแล้ว · ตั้งระยะ A–B เพื่อ calibrate สเกลจริงก่อนใช้อ้างอิง');
    }catch{setNotice('อ่านหรือบันทึกภาพอ้างอิงไม่สำเร็จ · ลองใช้ JPG/PNG ไฟล์อื่น');}
  }
  async function removeLocalReference(){
    try{await clearLocalImageBlob();}catch{}
    if(localImageUrlRef.current){URL.revokeObjectURL(localImageUrlRef.current);localImageUrlRef.current=null;}setLocalImageUrl(null);setLocalReference(localImageReferenceDefaults());setCalibrationPoints([]);choose('select');setNotice('ลบภาพอ้างอิงออกจาก browser นี้แล้ว');
  }
  function applyLocalReferenceCalibration(){
    if(calibrationPoints.length!==2)return;
    const next=calibrateLocalImageReference(localReference,calibrationPoints[0],calibrationPoints[1],calibrationDistance);
    if(!next){setNotice('Calibration ใช้ไม่ได้ · จุด A–B ต้องห่างกันและระยะจริงต้องมากกว่า 0');return;}
    setLocalReference(next);setCalibrationPoints([]);choose('select');setNotice(`Calibrate ภาพแล้ว · A–B = ${calibrationDistance.toFixed(2)} m · scale ${next.metersPerPixel.toFixed(4)} m/px`);
  }
  function rotateNetworkForMapAlignment(){
    const degrees=Number(mapAlignRotation);if(!Number.isFinite(degrees)||Math.abs(degrees)<1e-6){setNotice('ระบุมุมหมุน Network ที่ไม่เป็นศูนย์ก่อน');return;}
    const before=projectRef.current,bounds=projectBounds(before,0),origin={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},
      next=transformNetworkProject(before,{origin,translation:{x:0,y:0},rotation:degrees});
    if(next===before){setNotice('มุมนี้ไม่ทำให้ Network เปลี่ยนตำแหน่ง');return;}
    commit(next,before);setMapAlignRotation(0);setNotice(`หมุน Network ทั้งชุด ${degrees.toFixed(2)}° รอบกึ่งกลาง footprint แล้ว · Junction Design และ RoadLink semantics เดิมไม่เปลี่ยน`);
  }
  function fit(){
    const activeBounds=projectBounds(project),referenceBounds=compareGhostVisible&&comparisonScenario?projectBounds(comparisonScenario.project):null,
      b=referenceBounds?{x:Math.min(activeBounds.x,referenceBounds.x),y:Math.min(activeBounds.y,referenceBounds.y),w:Math.max(activeBounds.x+activeBounds.w,referenceBounds.x+referenceBounds.w)-Math.min(activeBounds.x,referenceBounds.x),h:Math.max(activeBounds.y+activeBounds.h,referenceBounds.y+referenceBounds.h)-Math.min(activeBounds.y,referenceBounds.y)}:activeBounds,
      center={x:b.x+b.w/2,y:b.y+b.h/2},next=clampZoom(NETWORK_VIEW_SPAN/Math.max(b.w,b.h)*.9,NETWORK_MIN_ZOOM,Math.min(4.5,NETWORK_MAX_ZOOM));
    setPan(center);setZoom(next);
  }
  function zoomAt(factor:number,screen?:{x:number;y:number}){
    const el=svg.current;if(!el)return;
    const r=el.getBoundingClientRect(),p=screen??{x:r.left+r.width/2,y:r.top+r.height/2},
      g={dx:0,dy:0,factor,before:p,after:p,count:2},next=panZoom2D(pan,zoom,g,{x:r.left+r.width/2,y:r.top+r.height/2},Math.min(r.width,r.height),NETWORK_VIEW_SPAN,NETWORK_MIN_ZOOM,NETWORK_MAX_ZOOM);
    setZoom(next.zoom);setPan(next.pan);
  }
  function applyArmMove(current:ArmDragState,p:WorldPoint,shiftKey:boolean){
    const junction=junctionById(projectRef.current,current.id);if(!junction)return;
    const endpoint={x:current.startEndpoint.x+(p.x-current.startPointer.x),y:current.startEndpoint.y+(p.y-current.startPointer.y)},
      dx=endpoint.x-junction.x,dy=endpoint.y-junction.y,length=Math.max(45,Math.min(400,Math.hypot(dx,dy))),rawWorldAngle=normalizeAngle(Math.atan2(dy,dx)*180/Math.PI),
      appliedWorldAngle=shiftKey?normalizeAngle(Math.round(rawWorldAngle/15)*15):rawWorldAngle,
      localAngle=normalizeAngle(appliedWorldAngle-worldJunctionRotation(junction)),
      hint:ArmGuideHint|null=shiftKey?{kind:'snap',worldAngle:appliedWorldAngle,label:`SNAP ${appliedWorldAngle.toFixed(0)}°`}:nearestArmGuide(projectRef.current,current.id,current.armId,rawWorldAngle),
      previewDesign={...junction.design,arms:junction.design.arms.map((arm,index)=>index===current.armId?{...arm,angle:+localAngle.toFixed(2),length:+length.toFixed(2)}:arm)},
      previewProject=updateJunctionDesign(projectRef.current,current.id,previewDesign);
    // Direct manipulation stays visually continuous. Full engineering validation is deferred to pointer-up.
    setProjectNow(previewProject);
    const nextJ=junctionById(previewProject,current.id),nextArm=nextJ?.design.arms[current.armId];
    setArmGuide({junctionId:current.id,armId:current.armId,worldAngle:nextJ&&nextArm?normalizeAngle(worldJunctionRotation(nextJ)+nextArm.angle):appliedWorldAngle,localAngle:nextArm?.angle??+localAngle.toFixed(2),length:nextArm?.length??+length.toFixed(2),snapped:shiftKey,hint});
  }
  function scheduleArmMove(current:ArmDragState,p:WorldPoint,shiftKey:boolean){
    armMovePending.current={drag:current,point:p,shiftKey};
    if(armMoveFrame.current!==null)return;
    armMoveFrame.current=requestAnimationFrame(()=>{
      armMoveFrame.current=null;
      const pending=armMovePending.current;armMovePending.current=null;
      if(pending)applyArmMove(pending.drag,pending.point,pending.shiftKey);
    });
  }
  function flushArmMove(){
    if(armMoveFrame.current!==null){cancelAnimationFrame(armMoveFrame.current);armMoveFrame.current=null;}
    const pending=armMovePending.current;armMovePending.current=null;
    if(pending)applyArmMove(pending.drag,pending.point,pending.shiftKey);
  }
  function canvasDown(e:React.PointerEvent<SVGSVGElement>){
    if(e.button===1||tool==='pan'){drag.current={kind:'pan',start:{x:e.clientX,y:e.clientY},pan};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(tool==='map-align'){drag.current={kind:'network-align',before:projectRef.current,start:point(e)};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(tool==='image-align'){
      if(!localImageUrl||!localReference.enabled||localReference.locked){setNotice('ปลดล็อกและเปิดภาพอ้างอิงก่อนย้าย');return;}
      drag.current={kind:'local-image',start:point(e),center:{x:localReference.x,y:localReference.y}};e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(tool==='image-calibrate'){
      if(!localImageUrl||!localReference.enabled||localReference.locked){setNotice('ปลดล็อกและเปิดภาพอ้างอิงก่อน calibrate');return;}
      const p=point(e),next=calibrationPoints.length>=2?[p]:[...calibrationPoints,p];setCalibrationPoints(next);setNotice(next.length===1?'เลือกจุด A แล้ว · คลิกจุด B บนภาพ':'เลือก A–B แล้ว · ตรวจระยะจริงและกด Apply calibration');return;
    }
    if(tool==='junction'){
      const before=projectRef.current,result=addJunction(before,point(e));commit(result.project,before);setSelection({kind:'junction',id:result.junction.id});choose('select');setNotice('สร้าง Junction instance แล้ว · ลากจุดกลางเพื่อจัดตำแหน่ง');return;
    }
    if(tool==='select'){setSelection(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}
  }
  function movePointer(e:React.PointerEvent<SVGSVGElement>){
    if(tool==='link'&&pendingPort)setLinkCursor(point(e));
    const current=drag.current;if(!current)return;
    if(current.kind==='pan'){
      const r=e.currentTarget.getBoundingClientRect(),scale=NETWORK_VIEW_SPAN/zoom/Math.min(r.width,r.height);
      setPan({x:current.pan.x-(e.clientX-current.start.x)*scale,y:current.pan.y-(e.clientY-current.start.y)*scale});return;
    }
    const p=point(e);
    if(current.kind==='network-align'){
      const next=transformNetworkProject(current.before,{origin:{x:0,y:0},translation:{x:p.x-current.start.x,y:p.y-current.start.y},rotation:0});
      setProjectNow(next);return;
    }
    if(current.kind==='local-image'){
      setLocalReference(v=>({...v,x:current.center.x+(p.x-current.start.x),y:current.center.y+(p.y-current.start.y)}));return;
    }
    if(current.kind==='link-via'){
      const next=moveLinkVia(projectRef.current,current.id,current.index,p);
      if(next===projectRef.current){setNotice('จุดแนวนี้ทำให้ Link หักกลับ/ตัดตัวเองหรือมีท่อนสั้นเกินไป');return;}
      setProjectNow(next);return;
    }
    if(current.kind==='transfer-via'){
      const result=moveTransferConnectorVia(projectRef.current,current.id,current.index,p);
      if(result.error){setNotice(result.error);return;}
      setProjectNow(result.project);return;
    }
    if(current.kind==='arm'){
      if(!current.active){
        if(Math.hypot(e.clientX-current.startClient.x,e.clientY-current.startClient.y)<5)return;
        current.active=true;
      }
      scheduleArmMove(current,p,e.shiftKey);return;
    }
    const next=moveJunction(projectRef.current,current.id,{x:p.x+current.offset.x,y:p.y+current.offset.y});
    setProjectNow(next);
  }
  function endPointer(e:React.PointerEvent<SVGSVGElement>){
    const current=drag.current;
    if(current?.kind==='arm'){
      if(!current.active){
        drag.current=null;setArmGuide(null);
        try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
        return;
      }
      armMovePending.current={drag:current,point:point(e),shiftKey:e.shiftKey};flushArmMove();
      const previewJunction=junctionById(projectRef.current,current.id),previewArm=previewJunction?.design.arms[current.armId],
        validated=previewArm?updateJunctionArmGeometry(current.before,current.id,current.armId,previewArm.angle,previewArm.length):{project:current.before,error:'ไม่พบขาถนนที่เลือก'};
      drag.current=null;setArmGuide(null);
      try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
      if(validated.error){setProjectNow(current.before);setNotice('ตำแหน่งปลายที่ปล่อยยังใช้ไม่ได้ · '+validated.error);return;}
      setProjectNow(validated.project);
      if(validated.project!==current.before){remember(current.before);persistProjectSnapshot(validated.project);setNotice('ปรับขาถนนแล้ว · ลากลื่นระหว่างทาง และตรวจ geometry เมื่อปล่อย');}
      return;
    }
    drag.current=null;setArmGuide(null);
    try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
    if(current?.kind==='local-image'){setNotice('ย้ายภาพอ้างอิงแล้ว · geometry ของ Network ไม่เปลี่ยน');return;}
    if(current?.kind==='junction'){
      const preview=junctionById(projectRef.current,current.id);
      if(!preview){setProjectNow(current.before);return;}
      const validated=moveJunctionChecked(current.before,current.id,{x:preview.x,y:preview.y});
      if(validated.error){setProjectNow(current.before);setNotice(validated.error+' · ยกเลิกการย้ายและคืนตำแหน่งเดิม');return;}
      setProjectNow(validated.project);
      if(validated.project!==current.before){remember(current.before);persistProjectSnapshot(validated.project);setNotice('ย้ายทั้งทางแยกแล้ว · Road Link ปรับปลายตาม port และยังผ่าน facing guardrail');}
      return;
    }
    if(current?.kind==='link-via'||current?.kind==='transfer-via'||current?.kind==='network-align'){
      const after=projectRef.current;
      if(after!==current.before){
        remember(current.before);persistProjectSnapshot(after);
        setNotice(current.kind==='network-align'?'ย้าย Network ทั้งชุดแล้ว · Junction Design v6 ไม่ถูกแก้ และ RoadLink / TransferConnector via points เคลื่อนแบบ rigid transform':current.kind==='transfer-via'?'ปรับแนว Transfer connector แล้ว · station ports / terminal semantics ยังผูกเดิม':'ปรับแนว Road Link แล้ว · endpoints ยังคงผูกกับ Junction ports');
      }
    }
  }
  function startJunctionMove(id:string,e:React.PointerEvent<SVGCircleElement>){
    if(tool!=='select')return;
    const junction=junctionById(projectRef.current,id);if(!junction)return;
    const p=point(e),before=projectRef.current;
    drag.current={kind:'junction',id,before,offset:{x:junction.x-p.x,y:junction.y-p.y}};
    svg.current?.setPointerCapture(e.pointerId);
  }
  function selectArm(id:string,armId:number){
    if(tool!=='select')return;setSelection({kind:'junction',id});setSelectedArm(armId);setSelectedDirection('incoming');setSelectedLinkVertex(null);setSelectedTransferVertex(null);setInspectorTab('object');setInspectorOpen(true);const junction=junctionById(projectRef.current,id),arm=junction?.design.arms[armId];if(arm)setNotice(arm.name+' · คลิกเพื่อเลือก · ลาก geometry ได้เฉพาะ grip ที่ปลายแขน · Shift = snap 15°');
  }
  function startArmMove(id:string,armId:number,e:React.PointerEvent<SVGElement>){
    if(tool!=='select')return;
    e.preventDefault();
    const junction=junctionById(projectRef.current,id),arm=junction?.design.arms[armId];if(!junction||!arm)return;
    if(armMoveFrame.current!==null){cancelAnimationFrame(armMoveFrame.current);armMoveFrame.current=null;}armMovePending.current=null;
    const startPointer=point(e),startEndpoint=portPoint(junction,armId);
    setSelection({kind:'junction',id});setSelectedArm(armId);setSelectedDirection('incoming');setSelectedLinkVertex(null);setSelectedTransferVertex(null);setInspectorTab('object');setInspectorOpen(true);
    drag.current={kind:'arm',id,armId,before:projectRef.current,startPointer,startEndpoint,startClient:{x:e.clientX,y:e.clientY},active:false};
    setArmGuide(null);
    setNotice(arm.name+' · จับ grip ที่ปลายแล้วลากเพื่อเปลี่ยนมุม/ความยาว · Shift = snap 15°');
    try{svg.current?.setPointerCapture(e.pointerId);}catch{}
  }
  function editSelectedArm(patch:Parameters<typeof updateJunctionArmBasics>[3]){
    if(!selectedJunction||selectedArm===null)return;const before=projectRef.current,result=updateJunctionArmBasics(before,selectedJunction.id,selectedArm,patch);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice('ปรับ '+(result.project.junctions.find(j=>j.id===selectedJunction.id)?.design.arms[selectedArm]?.name??'ขาถนน')+' แล้ว');
  }
  function toggleJunctionArm(armId:number,enabled:boolean){
    if(!selectedJunction)return;const before=projectRef.current,result=setJunctionArmEnabled(before,selectedJunction.id,armId,enabled);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);
    if(!enabled&&selectedArm===armId)setSelectedArm(null);
    setNotice(enabled?'เปิดขาถนนแล้ว':'เปลี่ยนเป็นทางแยก 3 ขาแล้ว');
  }
  function moveSelectedJunctionTo(point:WorldPoint){
    if(!selectedJunction)return false;const before=projectRef.current,result=moveJunctionChecked(before,selectedJunction.id,point);
    if(result.error){setNotice(result.error);return false;}commit(result.project,before);setNotice('ย้าย Junction แล้ว · Road Link ที่ผูกอยู่ยังผ่าน port-facing guardrail');return true;
  }
  function rotateSelectedJunctionTo(rotation:number){
    if(!selectedJunction)return false;const before=projectRef.current,result=rotateJunctionChecked(before,selectedJunction.id,rotation);
    if(result.error){setNotice(result.error);return false;}commit(result.project,before);setNotice('หมุน Junction แล้ว · Road Link ที่ผูกอยู่ยังผ่าน port-facing guardrail');return true;
  }
  function editSelectedArmGeometry(angle:number,length:number){
    if(!selectedJunction||selectedArm===null)return;const before=projectRef.current,result=updateJunctionArmGeometry(before,selectedJunction.id,selectedArm,angle,length);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice('ปรับมุม/ความยาวขาถนนแล้ว');
  }
  function editSelectedSection(patch:Parameters<typeof updateJunctionArmSection>[4]){
    if(!selectedJunction||selectedArm===null)return;const before=projectRef.current,result=updateJunctionArmSection(before,selectedJunction.id,selectedArm,selectedDirection,patch);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice('ปรับหน้าตัด'+(selectedDirection==='incoming'?'ขาเข้า':'ขาออก')+'แล้ว');
  }
  function editSelectedPocket(side:'left'|'right',patch:Parameters<typeof updateJunctionArmPocket>[5]){
    if(!selectedJunction||selectedArm===null)return;const before=projectRef.current,result=updateJunctionArmPocket(before,selectedJunction.id,selectedArm,selectedDirection,side,patch);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice('ปรับเลนเสริม'+(side==='left'?'ริมทาง':'ชิดเกาะกลาง')+'แล้ว');
  }
  function editFromNetworkSection(s:Selection,value:number,currentWidth:number){
    if(!selectedJunction)return;
    const before=projectRef.current,junction=junctionById(before,selectedJunction.id),arm=junction?.design.arms[s.arm];
    if(!junction||!arm)return;
    const direction=s.direction??selectedDirection;
    let result:{project:NetworkProject;error:string|null};
    if(s.kind==='median'){
      result=updateJunctionArmBasics(before,junction.id,s.arm,{median:Math.max(0,Math.min(12,arm.median+(value-currentWidth)))});
    }else if(s.kind==='sidewalk'){
      result=updateJunctionArmSection(before,junction.id,s.arm,direction,{walk:value});
    }else if(s.kind==='band'){
      const section=sectionFor(arm,direction);
      result=updateJunctionArmSection(before,junction.id,s.arm,direction,{bands:section.bands.map(b=>b.id===s.id?{...b,width:value}:b)});
    }else if(s.kind==='lane'){
      result=updateJunctionArmSection(before,junction.id,s.arm,direction,{width:value});
    }else if(s.kind==='pocket'){
      result=updateJunctionArmPocket(before,junction.id,s.arm,direction,s.side??'right',{width:value});
    }else return;
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setSelection({kind:'junction',id:junction.id});setSelectedArm(s.arm);setSelectedDirection(direction);setNotice('ปรับหน้าตัดจาก Cross-section แล้ว');
  }
  function toggleBand(type:Band['type']){
    if(!selectedSection)return;
    const found=selectedSection.bands.find(b=>b.type===type);
    if(found){editSelectedSection({bands:selectedSection.bands.filter(b=>b.id!==found.id)});return;}
    const used=new Set(selectedSection.bands.map(b=>b.id));let n=1;while(used.has('network-'+type+'-'+n))n++;
    const width=type==='bike'?1.5:type==='buffer'?0.5:type==='motorcycle'?1.2:1;
    editSelectedSection({bands:[...selectedSection.bands,{id:'network-'+type+'-'+n,type,width}]});
  }
  function updateBand(id:string,patch:Partial<Band>){
    if(!selectedSection)return;editSelectedSection({bands:selectedSection.bands.map(b=>b.id===id?{...b,...patch}:b)});
  }
  function openSelectedJunctionDetail(){
    if(!selectedJunction)return;
    try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(projectRef.current));localStorage.setItem(NETWORK_EDIT_JUNCTION_STORAGE,selectedJunction.id);}catch{}
    window.location.assign('junction/?from=network');
  }
  function addSelectedLinkPi(){
    if(!selectedLink)return;
    const before=projectRef.current,link=before.links.find(v=>v.id===selectedLink.id);if(!link)return;
    const ps=linkControlPoints(before,link);let best=0,bestLen=-1;
    for(let i=0;i<ps.length-1;i++){const len=Math.hypot(ps[i+1].x-ps[i].x,ps[i+1].y-ps[i].y);if(len>bestLen){best=i;bestLen=len;}}
    const p={x:(ps[best].x+ps[best+1].x)/2,y:(ps[best].y+ps[best+1].y)/2},next=insertLinkVia(before,link.id,best,p);
    if(next===before){setNotice('เพิ่ม PI ไม่ได้ — alignment จะสั้นเกินไปหรือหักกลับ');return;}
    commit(next,before);setSelectedLinkVertex(best);setNotice('เพิ่ม PI แล้ว · ลากจุดบนแผนเพื่อปรับแนว');
  }
  function removeSelectedLinkPi(){
    if(!selectedLink||selectedLinkVertex===null)return;
    const before=projectRef.current,next=removeLinkVia(before,selectedLink.id,selectedLinkVertex);
    if(next!==before){commit(next,before);setSelectedLinkVertex(null);setNotice('ลบ PI แล้ว');}
  }
  function adjustSelectedViaRadius(delta:number){
    if(!selectedLink||selectedLinkVertex===null||!selectedVia)return;
    const before=projectRef.current,nextRadius=Math.max(0,Math.min(200,selectedVia.radius+delta));
    commit(updateLinkViaRadius(before,selectedLink.id,selectedLinkVertex,nextRadius),before);
  }

  function addSelectedTransferPi(){
    if(!selectedTransferConnector)return;
    const before=projectRef.current,connector=before.transferConnectors.find(item=>item.id===selectedTransferConnector.id);if(!connector)return;
    const controls=transferConnectorControlPoints(before,connector.id);if(controls.length<2){setNotice('ยัง resolve แนว Transfer connector ไม่ได้');return;}
    let best=0,bestLen=-1;
    for(let i=0;i<controls.length-1;i++){const len=Math.hypot(controls[i+1].x-controls[i].x,controls[i+1].y-controls[i].y);if(len>bestLen){best=i;bestLen=len;}}
    const p={x:(controls[best].x+controls[best+1].x)/2,y:(controls[best].y+controls[best+1].y)/2},
      result=insertTransferConnectorVia(before,connector.id,best,p);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setSelectedTransferVertex(best);setNotice('เพิ่ม Transfer PI แล้ว · ลากจุดบนแผนเพื่อปรับแนว');
  }
  function removeSelectedTransferPi(){
    if(!selectedTransferConnector||selectedTransferVertex===null)return;
    const before=projectRef.current,result=removeTransferConnectorVia(before,selectedTransferConnector.id,selectedTransferVertex);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setSelectedTransferVertex(null);setNotice('ลบ Transfer PI แล้ว');
  }
  function adjustSelectedTransferViaRadius(delta:number){
    if(!selectedTransferConnector||selectedTransferVertex===null||!selectedTransferVia)return;
    const before=projectRef.current,result=updateTransferConnectorViaRadius(before,selectedTransferConnector.id,selectedTransferVertex,selectedTransferVia.radius+delta);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);
  }
  function beginParallelCorridorDraft(){
    if(!selectedLink)return;
    if(parallelCorridorForLink(projectRef.current,selectedLink.id)){setNotice('Road Link นี้อยู่ใน Parallel corridor แล้ว');return;}
    setParallelDraftMainlineId(selectedLink.id);setNotice(`ตั้ง ${selectedLink.id} เป็น Mainline draft แล้ว · เลือก Road Link อื่นเพื่อกำหนด Frontage Left/Right`);
  }
  function finalizeParallelCorridorDraft(side:ParallelCorridorSide){
    if(!selectedLink||!parallelDraftMainlineId||selectedLink.id===parallelDraftMainlineId)return;
    const before=projectRef.current;
    if(!before.links.some(v=>v.id===parallelDraftMainlineId)){setParallelDraftMainlineId(null);setNotice('Mainline draft ไม่อยู่ใน scenario นี้แล้ว');return;}
    if(parallelCorridorForLink(before,parallelDraftMainlineId)||parallelCorridorForLink(before,selectedLink.id)){setNotice('สร้างกลุ่มไม่ได้ · Mainline หรือ Frontage ถูกจัดกลุ่มไปแล้ว');return;}
    const draftLink=before.links.find(v=>v.id===parallelDraftMainlineId);if(!draftLink){setNotice('Mainline draft ไม่อยู่ใน scenario นี้แล้ว');setParallelDraftMainlineId(null);return;}
    const result=addParallelCorridor(before,{name:`Parallel Corridor ${before.parallelCorridors.length+1}`,mainlineLinkIds:[parallelDraftMainlineId],mainlineStartJunctionId:draftLink.from.junctionId,frontage:[{side,linkIds:[selectedLink.id]}]});
    if(result.error||!result.corridor){setNotice(result.error??'สร้าง Parallel corridor ไม่สำเร็จ');return;}
    commit(result.project,before);setParallelDraftMainlineId(null);setParallelTargetCorridorId(result.corridor.id);setNotice(`สร้าง ${result.corridor.name} แล้ว · ${parallelDraftMainlineId} = Mainline · ${selectedLink.id} = Frontage ${side}`);
  }
  function addSelectedLinkToParallelTarget(role:ParallelCorridorMemberRole,side?:ParallelCorridorSide){
    if(!selectedLink||!effectiveParallelTargetCorridorId)return;
    const before=projectRef.current,result=addLinkToParallelCorridor(before,effectiveParallelTargetCorridorId,selectedLink.id,role,side);
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`เพิ่ม ${selectedLink.id} เข้า ${result.corridor?.name??effectiveParallelTargetCorridorId} เป็น ${role==='mainline'?'Mainline':`Frontage ${side}`}`);
  }
  function removeSelectedParallelMembership(){
    if(!selectedLink)return;const before=projectRef.current,result=removeLinkFromParallelCorridor(before,selectedLink.id);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice(`ถอด ${selectedLink.id} ออกจาก Parallel corridor แล้ว · RoadLink geometry ยังอยู่`);
  }
  function dissolveSelectedParallelCorridor(){
    if(!selectedLink)return;const before=projectRef.current,membership=parallelCorridorForLink(before,selectedLink.id);if(!membership)return;
    const next=removeParallelCorridor(before,membership.corridor.id);commit(next,before);setParallelTargetCorridorId('');setNotice(`Dissolve ${membership.corridor.name} แล้ว · ลบเฉพาะ relationship metadata ไม่ลบ RoadLinks`);
  }
  function reverseSelectedParallelReference(){
    if(!selectedLink)return;const before=projectRef.current,membership=parallelCorridorForLink(before,selectedLink.id);if(!membership)return;
    const result=reverseParallelCorridorReference(before,membership.corridor.id);if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`กลับทิศอ้างอิง ${membership.corridor.name} แล้ว · Left/Right ถูกสลับ label เพื่อคงด้านทางกายภาพเดิม`);
  }
  function markSelectedParallelSeedReviewed(side:ParallelCorridorSide){
    if(!selectedLink)return;const before=projectRef.current,membership=parallelCorridorForLink(before,selectedLink.id);if(!membership)return;
    const result=markParallelFrontageReviewed(before,membership.corridor.id,side);if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`Mark Frontage ${side} seed reviewed แล้ว · geometry ไม่เปลี่ยน และ Design Summary จะหยุดแจ้ง seed-review warning ของด้านนี้`);
  }
  function selectParallelMember(id:string){
    if(!projectRef.current.links.some(v=>v.id===id))return;choose('select');setSelection({kind:'link',id});setSelectedArm(null);setSelectedLinkVertex(null);setNotice(`เลือกสมาชิก Parallel corridor · ${id}`);
  }
  function seedSelectedParallelFrontage(side:ParallelCorridorSide|'both'){
    if(!selectedLink)return;
    const before=projectRef.current,membership=parallelCorridorForLink(before,selectedLink.id),
      mainlineLinkIds=membership?.corridor.mainlineLinkIds??[selectedLink.id],
      mainlineStartJunctionId=membership?.corridor.mainlineStartJunctionId??selectedLink.from.junctionId,
      result=seedParallelFrontage(before,{mainlineLinkIds,mainlineStartJunctionId,side,offset:parallelSeedOffset,corridorId:membership?.corridor.id});
    if(result.error||!result.corridor){setNotice(result.error??'สร้าง Assisted frontage seed ไม่สำเร็จ');return;}
    commit(result.project,before);setParallelDraftMainlineId(null);setParallelTargetCorridorId(result.corridor.id);
    const firstGenerated=result.generated[0]?.linkIds[0];if(firstGenerated)setSelection({kind:'link',id:firstGenerated});
    setSelectedArm(null);setSelectedLinkVertex(null);choose('select');
    const generatedLinks=result.generated.reduce((sum,chain)=>sum+chain.linkIds.length,0),generatedJunctions=result.generated.reduce((sum,chain)=>sum+chain.junctionIds.length,0);
    setNotice(`สร้าง Assisted frontage seed ${side} แล้ว · ${generatedLinks} RoadLink + ${generatedJunctions} Junction · offset ${parallelSeedOffset} m เป็นค่าเริ่มต้น ไม่ใช่ design criterion · Undo ได้ทั้งชุด`);
  }
  function addSelectedStationComponent(kind:'lane'|'width'){
    if(!selectedLink)return;const before=projectRef.current,result=addLinkStationComponent(before,selectedLink.id,kind);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice(kind==='lane'?'เพิ่ม Auxiliary lane lifecycle แล้ว · ปรับ station/taper ได้ด้านล่าง':'เพิ่ม Edge-width lifecycle แล้ว · ปรับ target/station/delta ได้ด้านล่าง');
  }
  function editSelectedStationComponent(componentId:string,patch:LinkStationComponentPatch){
    if(!selectedLink)return;const before=projectRef.current,result=updateLinkStationComponent(before,selectedLink.id,componentId,patch);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice('ปรับ station component แล้ว');
  }
  function removeSelectedStationComponent(componentId:string){
    if(!selectedLink)return;const before=projectRef.current,next=removeLinkStationComponent(before,selectedLink.id,componentId);
    if(next!==before){commit(next,before);setNotice('ลบ station component แล้ว');}
  }
  function linkPortLabel(ref:PortRef){
    const junction=junctionById(project,ref.junctionId),arm=junction?.design.arms[ref.armId];
    return `${junction?.name??ref.junctionId} · ${arm?.name??('Arm '+(ref.armId+1))} · ${portKey(ref)}`;
  }
  function reconnectPortChoices(linkId:string,end:'from'|'to'){
    const link=project.links.find(item=>item.id===linkId);if(!link)return[];
    const current=end==='from'?link.from:link.to,other=end==='from'?link.to:link.from,out:{ref:PortRef;label:string}[]=[];
    for(const junction of project.junctions){
      if(junction.id===other.junctionId)continue;
      junction.design.enabled.forEach((enabled,armId)=>{
        if(!enabled)return;const ref={junctionId:junction.id,armId};
        if(portKey(ref)!==portKey(current)&&portOccupied(project,ref,link.id))return;
        if(reconnectLinkPort(project,link.id,end,ref).error)return;
        out.push({ref,label:linkPortLabel(ref)});
      });
    }
    return out;
  }
  function reconnectSelectedLink(end:'from'|'to',value:string){
    if(!selectedLink)return;const [junctionId,armRaw]=value.split(':'),armId=Number(armRaw);
    if(!junctionId||!Number.isInteger(armId))return;
    const before=projectRef.current,result=reconnectLinkPort(before,selectedLink.id,end,{junctionId,armId});
    if(result.error){setNotice(result.error);return;}
    if(result.project===before)return;
    commit(result.project,before);setSelection({kind:'link',id:selectedLink.id});setSelectedLinkVertex(null);
    const issues=result.link?linkIssues(result.project,result.link):[];
    setNotice(`เปลี่ยน ${end.toUpperCase()} port แล้ว · รักษา Link ID / PI / section / corridor lifecycle เดิม${issues.length?' · มี '+issues.length+' continuity issue ให้ตรวจต่อ':''}`);
  }
  function applySelectedAuxiliaryProposal(proposalId:string){
    if(!selectedLink)return;
    const before=projectRef.current,result=applyJunctionAuxiliaryProposal(before,selectedLink.id,proposalId);
    if(result.error){setNotice(result.error);return;}
    if(result.project===before){setNotice('Cross-boundary handoff รูปแบบนี้ตรงอยู่แล้ว');return;}
    commit(result.project,before);setNotice(`สร้าง/ซ่อม Junction → Corridor handoff แล้ว ${result.created.length} lane lifecycle · Junction + RoadLink เป็น Undo 1 ครั้ง`);
  }
  function continueSelectedAuxiliaryProposal(proposalId:string){
    if(!selectedLink)return;
    const before=projectRef.current,result=continueJunctionAuxiliaryToCorridor(before,selectedLink.id,proposalId);
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`Continue into Corridor แล้ว · Junction treatment เต็มถึง Port + RoadLink ${result.created.length} lane lifecycle · Undo 1 ครั้ง`);
  }
  function returnSelectedAuxiliaryProposalLocal(proposalId:string){
    if(!selectedLink)return;
    const before=projectRef.current,result=returnJunctionAuxiliaryToLocal(before,selectedLink.id,proposalId);
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`กลับเป็น Junction only แล้ว · ถอด handoff-owned RoadLink components ${result.removed?.length??0} รายการ · manual corridor components ไม่ถูกลบ`);
  }
  function repairSelectedHandoff(handoffId:string){
    if(!selectedLink)return;
    const before=projectRef.current,result=repairJunctionAuxiliaryHandoff(before,selectedLink.id,handoffId);
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`Repair handoff แล้ว · rebuild/adopt ${result.created.length} lane lifecycle จาก source ปัจจุบัน · Undo 1 ครั้ง`);
  }
  function detachSelectedHandoff(handoffId:string){
    if(!selectedLink)return;
    const before=projectRef.current,result=detachJunctionAuxiliaryHandoff(before,selectedLink.id,handoffId);
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setNotice(`Detach handoff แล้ว · ${result.detached?.length??0} lane component กลายเป็น manual corridor state และจะไม่ sync กับ Junction`);
  }
  function insertLinkVertexAt(id:string,e:React.MouseEvent<SVGGElement>){
    if(tool!=='select')return;
    const before=projectRef.current,link=before.links.find(v=>v.id===id);if(!link)return;
    const cursor=point(e),ps=linkControlPoints(before,link);let bestIndex=0,bestDistance=Infinity,bestPoint=cursor;
    for(let i=0;i<ps.length-1;i++){
      const a=ps[i],b=ps[i+1],vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy,t=len2?Math.max(0,Math.min(1,((cursor.x-a.x)*vx+(cursor.y-a.y)*vy)/len2)):0,
        q={x:a.x+vx*t,y:a.y+vy*t},distance=Math.hypot(cursor.x-q.x,cursor.y-q.y);
      if(distance<bestDistance){bestDistance=distance;bestIndex=i;bestPoint=q;}
    }
    const next=insertLinkVia(before,id,bestIndex,bestPoint);
    if(next===before){setNotice('เพิ่มจุดแนวตรงนี้ไม่ได้ — แนวจะสั้นเกินไปหรือหักกลับ');return;}
    commit(next,before);setSelection({kind:'link',id});setSelectedArm(null);setSelectedLinkVertex(bestIndex);setNotice('เพิ่มจุดแนวแล้ว · ลากวงกลมเพื่อปรับแนวถนน');
  }
  function startLinkVertexMove(id:string,index:number,e:React.PointerEvent<SVGCircleElement>){
    if(tool!=='select')return;setSelection({kind:'link',id});setSelectedLinkVertex(index);drag.current={kind:'link-via',id,index,before:projectRef.current};svg.current?.setPointerCapture(e.pointerId);
  }

  function insertTransferVertexAt(id:string,e:React.MouseEvent<SVGGElement>){
    if(tool!=='select')return;
    const before=projectRef.current,connector=before.transferConnectors.find(item=>item.id===id);if(!connector)return;
    const cursor=point(e),controls=transferConnectorControlPoints(before,id);let bestIndex=0,bestDistance=Infinity,bestPoint=cursor;
    for(let i=0;i<controls.length-1;i++){
      const a=controls[i],b=controls[i+1],vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy,t=len2?Math.max(0,Math.min(1,((cursor.x-a.x)*vx+(cursor.y-a.y)*vy)/len2)):0,
        q={x:a.x+vx*t,y:a.y+vy*t},distance=Math.hypot(cursor.x-q.x,cursor.y-q.y);
      if(distance<bestDistance){bestDistance=distance;bestIndex=i;bestPoint=q;}
    }
    const result=insertTransferConnectorVia(before,id,bestIndex,bestPoint);
    if(result.error){setNotice(result.error);return;}
    commit(result.project,before);setSelection({kind:'transfer-connector',id});setSelectedArm(null);setSelectedLinkVertex(null);setSelectedTransferVertex(bestIndex);setNotice('เพิ่ม Transfer PI แล้ว · ลากวงกลมเพื่อปรับแนว connector');
  }
  function startTransferVertexMove(id:string,index:number,e:React.PointerEvent<SVGCircleElement>){
    if(tool!=='select')return;setSelection({kind:'transfer-connector',id});setSelectedLinkVertex(null);setSelectedTransferVertex(index);drag.current={kind:'transfer-via',id,index,before:projectRef.current};svg.current?.setPointerCapture(e.pointerId);
  }
  function requestDelete(target:NetworkSelection){
    if(!target)return;
    const before=projectRef.current,connected=target.kind==='junction'?junctionConnectedLinkIds(before,target.id):[],
      transferPort=target.kind==='transfer-port'?before.transferPorts.find(port=>port.id===target.id):undefined,
      transferConnector=target.kind==='transfer-connector'?before.transferConnectors.find(connector=>connector.id===target.id):undefined,
      portConnector=transferPort?before.transferConnectors.find(connector=>connector.fromTransferPortId===transferPort.id||connector.toTransferPortId===transferPort.id):undefined,
      connectorTreatment=transferConnector?(before.links.some(link=>link.components.some(component=>component.kind==='lane'&&component.source?.kind==='transfer-terminal'&&component.source.connectorId===transferConnector.id))||transferConnector.terminalTreatment.from.level!=='none'||transferConnector.terminalTreatment.to.level!=='none'):false,
      needsConfirm=(target.kind==='junction'&&connected.length>0)||!!portConnector||connectorTreatment,
      armed=!!deleteArmed&&deleteArmed.kind===target.kind&&deleteArmed.id===target.id;
    if(needsConfirm&&!armed){
      setSelection(target);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setDeleteArmed(target);
      const message=target.kind==='junction'?`Junction ${target.id} เชื่อม Road Link ${connected.length} รายการ`:target.kind==='transfer-port'?`Transfer Port ${target.id} เชื่อม Connector ${portConnector?.id}`:`Transfer Connector ${target.id} มี terminal treatment`;
      setNotice(message+' · กด Delete/ลบอีกครั้งเพื่อยืนยัน cascade หรือกด Esc เพื่อยกเลิก');return;
    }
    const after=target.kind==='junction'?removeJunction(before,target.id):target.kind==='link'?removeLink(before,target.id):target.kind==='transfer-port'?removeTransferPort(before,target.id):removeTransferConnector(before,target.id);
    commit(after,before);setSelection(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);
    setNotice(`ลบ ${target.kind==='junction'?'Junction':target.kind==='link'?'Road Link':target.kind==='transfer-port'?'Transfer Port':'Transfer Connector'} ${target.id} แล้ว${needsConfirm?' พร้อม dependent treatment · Undo จะคืนทั้งชุด':''}`);
  }
  function selectObject(next:NetworkSelection){
    if(!next)return;
    if(tool==='delete'){requestDelete(next);return;}
    setDeleteArmed(null);
    const changedLink=next.kind==='link'&&!(selection?.kind==='link'&&selection.id===next.id),
      changedTransfer=next.kind==='transfer-connector'&&!(selection?.kind==='transfer-connector'&&selection.id===next.id);
    setSelection(next);setSelectedArm(null);setSelectedDirection('incoming');if(next.kind!=='link'||changedLink)setSelectedLinkVertex(null);if(next.kind!=='transfer-connector'||changedTransfer)setSelectedTransferVertex(null);setInspectorTab('object');setInspectorOpen(true);
    if(next.kind==='transfer-port')setNotice('เลือก Transfer Port แล้ว · ตรวจ station / role / speed-change treatment ใน Inspector');
    if(next.kind==='transfer-connector')setNotice('เลือก Transfer Connector แล้ว · ตรวจ one-way section และ terminal gore treatment ใน Inspector');
  }
  function selectPort(ref:PortRef){
    if(tool!=='link')return;
    if(!pendingPort){setPendingPort(ref);setLinkCursor(null);setSelection({kind:'junction',id:ref.junctionId});setSelectedArm(ref.armId);setSelectedDirection('incoming');setNotice('เลือกต้นทาง '+portKey(ref)+' แล้ว · เลือก port ปลายทางที่ไฮไลต์');return;}
    if(portKey(pendingPort)===portKey(ref)){setPendingPort(null);setLinkCursor(null);setNotice('ยกเลิกการเชื่อม Road Link แล้ว');return;}
    const before=projectRef.current,result=connectPorts(before,pendingPort,ref);
    if(result.error){setNotice(result.error);if(portKey(pendingPort)===portKey(ref))setPendingPort(null);return;}
    commit(result.project,before);setPendingPort(null);setLinkCursor(null);setSelectedArm(null);setSelectedDirection('incoming');setSelection(result.link?{kind:'link',id:result.link.id}:null);choose('select');setNotice('เชื่อม Road Link แล้ว · ปลาย Link ผูกกับ Junction ports แบบ semantic');
  }
  function deleteContext(){
    if(selection?.kind==='link'&&selectedLinkVertex!==null){
      const before=projectRef.current,next=removeLinkVia(before,selection.id,selectedLinkVertex);
      if(next!==before){commit(next,before);setSelectedLinkVertex(null);setNotice('ลบจุดแนวแล้ว');}
      return;
    }
    if(selection?.kind==='transfer-connector'&&selectedTransferVertex!==null){
      const before=projectRef.current,result=removeTransferConnectorVia(before,selection.id,selectedTransferVertex);
      if(result.error){setNotice(result.error);return;}commit(result.project,before);setSelectedTransferVertex(null);setNotice('ลบ Transfer PI แล้ว');return;
    }
    requestDelete(selection);
  }
  function deleteSelection(){requestDelete(selection);}
  function reset(){const before=projectRef.current,next=createNetworkProject();commit(next,before);setSelection({kind:'junction',id:'J-1'});setInspectorTab('object');setPan({x:0,y:0});setZoom(1);setPendingPort(null);setLinkCursor(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setSelectedTransferVertex(null);setParallelDraftMainlineId(null);setParallelTargetCorridorId('');setNotice(`คืนค่า Demo เฉพาะ ${currentScenario.name} แล้ว · scenario อื่นไม่เปลี่ยน`);}
  function requestResetScenario(){if(!resetScenarioArmed){setResetScenarioArmed(true);setDeleteArmed(null);setFileReplaceArmed(null);setNotice(`กำลังจะคืน ${currentScenario.name} เป็น Demo เริ่มต้น · การแก้ไขใน scenario นี้จะถูกแทนที่ กด “ยืนยันคืนค่า Demo” อีกครั้ง หรือ Esc เพื่อยกเลิก`);return;}setResetScenarioArmed(false);reset();}
  const statusTone=deleteArmed||resetScenarioArmed||fileReplaceArmed?'danger':/(ไม่สำเร็จ|ใช้ไม่ได้|ปฏิเสธ|ไม่พบ|ต้องแก้|error|invalid)/i.test(notice)?'warning':'info';

  return <main className="network-workspace" tabIndex={-1} onKeyDown={e=>{if((e.target as HTMLElement).matches('input,select,button'))return;if(e.key==='Delete')deleteContext();if(e.key==='Escape'){setDeleteArmed(null);setFileReplaceArmed(null);setResetScenarioArmed(false);setSaveAsDraft(null);setPendingPort(null);setLinkCursor(null);setParallelDraftMainlineId(null);choose('select');}if(e.key.toLowerCase()==='i'&&!e.ctrlKey&&!e.metaKey){setInspectorOpen(v=>!v);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}}}>
    <header className="network-header">
      <div className="network-brand"><Network size={21}/><div className="network-brand-copy"><b>Thai Street Designer</b><span>Network Concept Workspace</span></div><div className="workspace-switch" aria-label="พื้นที่ทำงาน"><span className="active">Network</span><a href="junction/">ทางแยก</a><a href="roads/" title="Road Alignment Lab · เครื่องมือทดลองแนวถนนอิสระ">Road Lab</a></div></div>
      <div className="network-header-actions">
        <details className="network-file-menu"><summary data-network-file-menu="true">File ▾</summary><div className="network-file-popover"><div className="network-file-status" data-network-file-status="true" data-network-file-dirty={projectFileDirty?'true':'false'}><b>{projectFileName||'Browser autosave'}</b><span>{projectFileDirty?'Unsaved file changes':'Saved to JSON'}</span></div><input ref={networkProjectFileInput} data-network-file-input="true" type="file" accept=".json,.tsd.json,application/json" hidden onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void openProjectFile(file);}}/><button data-network-file-action="new" data-network-file-armed={fileReplaceArmed==='new'?'true':'false'} onClick={requestNewProjectFile}>{fileReplaceArmed==='new'?'Confirm New Project':'New Project'}</button><button data-network-file-action="open" data-network-file-armed={fileReplaceArmed==='open'?'true':'false'} onClick={requestOpenProjectFile}>{fileReplaceArmed==='open'?'Confirm Open…':'Open JSON…'}</button><button data-network-file-action="save" onClick={saveProjectFile}>Save JSON</button><button data-network-file-action="save-as" onClick={()=>{setSaveAsDraft(projectFileName||suggestedProjectFileName);setFileReplaceArmed(null);}}>Save As…</button>{saveAsDraft!==null&&<div className="network-file-saveas"><input data-network-file-saveas-name value={saveAsDraft} onChange={e=>setSaveAsDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();downloadProjectFile(saveAsDraft);}if(e.key==='Escape'){e.preventDefault();setSaveAsDraft(null);}}}/><button data-network-file-saveas-confirm onClick={()=>downloadProjectFile(saveAsDraft)}>Download</button></div>}<p>Project JSON = Scenario Workspace + Network/Junction engineering state. Map credentials, Undo history, view state และ local-image bytes ไม่รวมในไฟล์.</p></div></details>
        <details className="network-export-menu" data-network-export-status={networkExportStatus||'idle'}><summary data-network-export-menu="true">Export ▾</summary><div className="network-export-popover"><div className="network-export-head"><b>Engineering Figure</b><span>Active scenario · geometry only</span></div><button data-network-export="current-svg" disabled={!!networkExporting} onClick={()=>void exportNetworkFigure('current','svg')}>{networkExporting==='current-svg'?'Exporting…':'Current View · SVG'}</button><button data-network-export="current-png" disabled={!!networkExporting} onClick={()=>void exportNetworkFigure('current','png')}>{networkExporting==='current-png'?'Exporting…':'Current View · PNG'}</button><button data-network-export="full-svg" disabled={!!networkExporting} onClick={()=>void exportNetworkFigure('full','svg')}>{networkExporting==='full-svg'?'Exporting…':'Full Network · SVG'}</button><button data-network-export="full-png" disabled={!!networkExporting} onClick={()=>void exportNetworkFigure('full','png')}>{networkExporting==='full-png'?'Exporting…':'Full Network · PNG'}</button><button data-network-export="report-html" disabled={!!networkExporting} onClick={exportDesignReport}>Design Summary · HTML</button><p>Figure export ใส่ title, scenario, scale และ concept-design disclaimer. Design Summary ใช้ engineering state + review findings + scenario delta. Basemap / aerial / local raster ไม่รวมใน engineering export.</p></div></details>
        <button data-network-action="undo" onClick={undo} disabled={!past.length}><Undo2 size={15}/> Undo</button><button data-network-action="redo" onClick={redo} disabled={!future.length}><Redo2 size={15}/> Redo</button><button data-network-action="fit" onClick={fit}><Maximize2 size={15}/> Fit</button>
      </div>
    </header>
    <nav className="network-scenario-strip" data-network-scenarios={scenarioWorkspace.scenarios.length} data-network-active-scenario={currentScenario.id}>
      <div className="network-scenario-tabs">{scenarioWorkspace.scenarios.map(scenario=><button key={scenario.id} data-network-scenario={scenario.id} className={scenario.id===currentScenario.id?'active':''} title={scenario.sourceScenarioId?`Created from ${scenarioWorkspace.scenarios.find(s=>s.id===scenario.sourceScenarioId)?.name??scenario.sourceScenarioId}`:'Baseline existing condition'} onClick={()=>selectScenario(scenario.id)}><span>{scenario.kind==='existing'?'BASE':'ALT'}</span><b>{scenario.name}</b></button>)}</div>
      <div className="network-scenario-actions"><label>Scenario<input data-network-scenario-name key={currentScenario.id+'-'+currentScenario.name} defaultValue={currentScenario.name} onBlur={e=>{if(e.currentTarget.value.trim()!==currentScenario.name)renameCurrentScenario(e.currentTarget.value);}}/></label><button data-network-scenario-add disabled={scenarioWorkspace.scenarios.length>=NETWORK_SCENARIO_LIMIT} onClick={addAlternativeScenario}>＋ Alternative</button>{currentScenario.kind==='alternative'&&<button className="danger" data-network-scenario-delete onClick={deleteCurrentScenario}>Delete alt</button>}<button className="danger" data-network-scenario-reset data-network-scenario-reset-armed={resetScenarioArmed?'true':'false'} onClick={requestResetScenario}>{resetScenarioArmed?'ยืนยันคืนค่า Demo':'คืนค่า Demo'}</button></div>
    </nav>
    {comparisonScenario&&scenarioComparison&&<div className="network-comparison-bar" data-network-comparison="true" data-network-comparison-active={currentScenario.id} data-network-comparison-reference={comparisonScenario.id}>
      <div className="network-comparison-picker"><span>COMPARE</span><b>{currentScenario.name}</b><em>against</em><select data-network-compare-scenario value={comparisonScenario.id} onChange={e=>{setCompareScenarioId(e.target.value);setComparisonFocus(null);}}>{comparisonCandidates.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="network-comparison-quick">{scenarioComparison.metrics.filter(m=>['junctions','roadLinks','mainLanes','pocketLanes','receivingLanes'].includes(m.key)).map(metric=><span key={metric.key} data-network-comparison-metric={metric.key} data-network-comparison-delta={metric.delta}><b>{metric.label}</b> {metric.delta===0?'0':metric.delta>0?'+'+metric.delta:metric.delta}</span>)}</div>
      <div className="network-comparison-actions" data-network-comparison-export-status={comparisonExportStatus||'idle'}>
        <div className="network-comparison-legend" aria-label="Scenario comparison legend"><span className="active">Active</span><span className="reference">Reference</span></div>
        <label className="network-comparison-ghost-toggle"><input data-network-comparison-ghost-toggle type="checkbox" checked={compareGhostVisible} onChange={e=>setCompareGhostVisible(e.target.checked)}/> Ghost</label>
        <button data-network-comparison-export="svg" disabled={!!comparisonExporting} onClick={()=>void exportScenarioComparison('svg')}>{comparisonExporting==='svg'?'Exporting…':'SVG'}</button>
        <button data-network-comparison-export="png" disabled={!!comparisonExporting} onClick={()=>void exportScenarioComparison('png')}>{comparisonExporting==='png'?'Exporting…':'PNG'}</button>
      </div>
    </div>}
    <div className={'network-body'+(!inspectorOpen?' inspector-collapsed':'')} data-network-inspector={inspectorOpen?'open':'closed'}>
      <aside className="network-tools">{tools.map(([id,label,Icon])=><button key={id} data-network-tool={id} className={tool===id?'active':''} title={label} onClick={()=>choose(id)}><Icon size={20}/><span>{label}</span></button>)}</aside>
      <section className="network-canvas-wrap">
        <div className="network-viewbar"><div><b>{project.title}</b><span>{project.junctions.length} junctions · {project.links.length} road links</span></div><div className="network-view-mode"><button data-network-view="2d" className={view==='2d'?'active':''} onClick={()=>setView('2d')}>2D Network</button><button data-network-view="3d" className={view==='3d'?'active':''} onClick={()=>setView('3d')}>3D Overview</button></div><div className="network-view-links"><button data-network-action="toggle-inspector" aria-pressed={inspectorOpen} onClick={()=>setInspectorOpen(v=>!v)}>{inspectorOpen?'ซ่อน Inspector':'Inspector'}</button></div></div>
        <div className="network-canvas">
          {view==='2d'&&<MapBackground reference={mapReference} credentials={mapCredentials} view={{zoom,pan,span:NETWORK_VIEW_SPAN,minZoom:NETWORK_MIN_ZOOM}}/>}
          {view==='2d'&&<LocalImageReferenceLayer reference={localReference} imageUrl={localImageUrl} view={{zoom,pan,span:NETWORK_VIEW_SPAN,minZoom:NETWORK_MIN_ZOOM}}/>}
          <svg ref={svg} data-network-plan="true" data-network-view-span={NETWORK_VIEW_SPAN} data-network-zoom={zoom.toFixed(4)} className={view==='3d'?'network-plan-hidden':''} viewBox={[(-NETWORK_VIEW_SPAN/2/zoom+pan.x),(-NETWORK_VIEW_SPAN/2/zoom+pan.y),(NETWORK_VIEW_SPAN/zoom),(NETWORK_VIEW_SPAN/zoom)].join(' ')}
            onPointerDown={canvasDown} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
            onWheel={e=>{e.preventDefault();zoomAt(e.deltaY>0?.88:1.14,{x:e.clientX,y:e.clientY});}}>
            <defs><pattern id="network-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" stroke="#d8e2e6" strokeWidth=".12" fill="none"/></pattern></defs>
            <rect data-network-background="true" x="-5000" y="-5000" width="10000" height="10000" fill={mapReference.enabled||(localReference.enabled&&!!localImageUrl)?'transparent':'#edf2f4'}/>
            <rect data-network-grid="true" x="-5000" y="-5000" width="10000" height="10000" fill="url(#network-grid)" opacity={mapReference.enabled||(localReference.enabled&&!!localImageUrl)?0.42:1}/>
            {view==='2d'&&compareGhostVisible&&comparisonScenario&&<NetworkComparisonGhost project={comparisonScenario.project} focus={focusedComparisonObject?{kind:focusedComparisonObject.kind,id:focusedComparisonObject.id}:null}/>}
            <g data-network-map-align-layer={tool==='map-align'?'disabled':'interactive'} data-network-reference-tool={tool} pointerEvents={['map-align','image-align','image-calibrate'].includes(tool)?'none':'auto'}><NetworkDrawing project={project} zoom={zoom} selection={selection} comparisonFocus={focusedComparisonObject?{kind:focusedComparisonObject.kind,id:focusedComparisonObject.id}:null} parallelCorridorId={selectedParallelCorridorId} parallelDraftMainlineId={parallelDraftMainlineId} selectedArm={selectedArm} linkMode={tool==='link'} pendingPort={pendingPort} selectedLinkVertex={selectedLinkVertex} selectedTransferVertex={selectedTransferVertex} onSelect={selectObject} onArmSelect={selectArm} onJunctionMoveStart={startJunctionMove} onArmMoveStart={startArmMove} onLinkInsertVertex={insertLinkVertexAt} onLinkVertexMoveStart={startLinkVertexMove} onLinkVertexSelect={setSelectedLinkVertex} onTransferInsertVertex={insertTransferVertexAt} onTransferVertexMoveStart={startTransferVertexMove} onTransferVertexSelect={setSelectedTransferVertex} onPort={selectPort}/></g>
            {view==='2d'&&tool==='image-calibrate'&&calibrationPoints.length>0&&(()=>{const markerScale=1/Math.max(.35,zoom),a=calibrationPoints[0],b=calibrationPoints[1];return <g data-local-reference-calibration="true" pointerEvents="none">{calibrationPoints.map((p,index)=><g key={index}><circle cx={p.x} cy={p.y} r={4*markerScale} fill={index===0?'#0f7d77':'#d18a24'} stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke"/><text x={p.x+6*markerScale} y={p.y-6*markerScale} fontSize={8*markerScale} fontWeight="800" fill="#263b44" stroke="white" strokeWidth={2.5*markerScale} paintOrder="stroke">{index===0?'A':'B'}</text></g>)}{b&&<><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d18a24" strokeWidth="1" strokeDasharray="5 3" vectorEffect="non-scaling-stroke"/><text x={(a.x+b.x)/2} y={(a.y+b.y)/2-7*markerScale} textAnchor="middle" fontSize={7*markerScale} fontWeight="700" fill="#7b5a23" stroke="white" strokeWidth={2.2*markerScale} paintOrder="stroke">{calibrationMeasured?.toFixed(2)} m current</text></>}</g>;})()}
            {armGuide&&(()=>{const junction=junctionById(project,armGuide.junctionId);if(!junction)return null;const a=armGuide.worldAngle*Math.PI/180,reach=Math.max(140,armGuide.length+70),end={x:junction.x+Math.cos(a)*armGuide.length,y:junction.y+Math.sin(a)*armGuide.length},hint=armGuide.hint,hintA=(hint?.worldAngle??armGuide.worldAngle)*Math.PI/180;return <g data-network-arm-guide={armGuide.junctionId+':'+armGuide.armId} data-network-arm-snap={armGuide.snapped?'true':'false'} data-network-arm-guide-kind={hint?.kind??'free'} pointerEvents="none">
              {hint&&<line x1={hint.kind==='parallel'?junction.x-Math.cos(hintA)*reach:junction.x} y1={hint.kind==='parallel'?junction.y-Math.sin(hintA)*reach:junction.y} x2={junction.x+Math.cos(hintA)*reach} y2={junction.y+Math.sin(hintA)*reach} stroke={hint.kind==='snap'?'#d18a24':hint.kind==='parallel'?'#567f9c':'#7e98a6'} strokeWidth=".65" strokeDasharray="5 3" vectorEffect="non-scaling-stroke"/>}
              <circle cx={end.x} cy={end.y} r="5" fill="none" stroke={armGuide.snapped?'#d18a24':'#0e8995'} strokeWidth=".6" vectorEffect="non-scaling-stroke"/>
              <text data-network-arm-measure="true" x={end.x+6} y={end.y-5} fontSize="8" fontWeight="700" fill="#263b44" stroke="#fff" strokeWidth="2.5" paintOrder="stroke">{armGuide.worldAngle.toFixed(2)}° · {armGuide.length.toFixed(2)} m</text>
              {hint&&<text data-network-arm-guide-label="true" x={junction.x+Math.cos(hintA)*Math.min(reach*.62,armGuide.length+28)} y={junction.y+Math.sin(hintA)*Math.min(reach*.62,armGuide.length+28)-5} fontSize="7" fontWeight="700" fill={hint.kind==='snap'?'#a56b17':hint.kind==='parallel'?'#416b88':'#617985'} stroke="#fff" strokeWidth="2.2" paintOrder="stroke">{hint.label}</text>}
            </g>;})()}
            {pendingPort&&(()=>{const j=junctionById(project,pendingPort.junctionId);if(!j)return null;const angle=(j.rotation+j.design.rotation+j.design.arms[pendingPort.armId].angle)*Math.PI/180,d=j.design.arms[pendingPort.armId].length,source={x:j.x+Math.cos(angle)*d,y:j.y+Math.sin(angle)*d};return <g data-network-link-preview="true" pointerEvents="none"><circle cx={source.x} cy={source.y} r="4" fill="none" stroke="#e3a33d" strokeWidth=".8"/>{linkCursor&&<path d={`M${source.x} ${source.y}L${linkCursor.x} ${linkCursor.y}`} fill="none" stroke="#e3a33d" strokeWidth=".8" strokeDasharray="3 2"/>}</g>;})()}
          </svg>
          <NetworkScene3D project={project} mapReference={mapReference} mapCredentials={mapCredentials} active={view==='3d'}/>
          {view==='2d'&&tool==='select'&&(selectedArmData||selectedLink||selectedJunction||selectedTransferPort||selectedTransferConnector)&&<div className="network-context-bar" data-network-context-kind={selectedArmData?'arm':selectedLink?'link':selectedJunction?'junction':selectedTransferPort?'transfer-port':'transfer-connector'}>
            {selectedArmData&&selectedJunction&&selectedArm!==null&&<>
              <div className="network-context-title"><span>ARM</span><b>{selectedArmData.name}</b></div>
              <div className="network-context-segment">
                <button data-network-context-direction="incoming" className={selectedDirection==='incoming'?'active':''} onClick={()=>setSelectedDirection('incoming')}>ขาเข้า</button>
                <button data-network-context-direction="outgoing" className={selectedDirection==='outgoing'?'active':''} onClick={()=>setSelectedDirection('outgoing')}>ขาออก</button>
              </div>
              <div className="network-context-step"><span>IN</span><button data-network-context-action="incoming-dec" disabled={selectedArmData.incoming<=0||selectedArmData.incoming+selectedArmData.outgoing<=1} onClick={()=>editSelectedArm({incoming:selectedArmData.incoming-1})}>−</button><b>{selectedArmData.incoming}</b><button data-network-context-action="incoming-inc" disabled={selectedArmData.incoming>=4} onClick={()=>editSelectedArm({incoming:selectedArmData.incoming+1})}>＋</button></div>
              <div className="network-context-step"><span>OUT</span><button data-network-context-action="outgoing-dec" disabled={selectedArmData.outgoing<=0||selectedArmData.incoming+selectedArmData.outgoing<=1} onClick={()=>editSelectedArm({outgoing:selectedArmData.outgoing-1})}>−</button><b>{selectedArmData.outgoing}</b><button data-network-context-action="outgoing-inc" disabled={selectedArmData.outgoing>=4} onClick={()=>editSelectedArm({outgoing:selectedArmData.outgoing+1})}>＋</button></div>
              <div className="network-context-step wide"><span>Median</span><button data-network-context-action="median-dec" disabled={selectedArmData.median<=0} onClick={()=>editSelectedArm({median:Math.max(0,+(selectedArmData.median-.5).toFixed(2))})}>−</button><b>{selectedArmData.median.toFixed(1)} m</b><button data-network-context-action="median-inc" disabled={selectedArmData.median>=12} onClick={()=>editSelectedArm({median:Math.min(12,+(selectedArmData.median+.5).toFixed(2))})}>＋</button></div>
              <button className="network-context-more" data-network-context-action="junction-detail" onClick={openSelectedJunctionDetail}>Detail</button>
            </>}
            {!selectedArmData&&selectedJunction&&<>
              <div className="network-context-title"><span>JUNCTION</span><b>{selectedJunction.name}</b></div>
              <button data-network-context-action="rotate-dec" onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation-15),before);}}><RotateCw size={13}/> −15°</button>
              <button data-network-context-action="rotate-inc" onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation+15),before);}}><RotateCw size={13}/> +15°</button>
              <button className="network-context-more" data-network-context-action="junction-detail" onClick={openSelectedJunctionDetail}>Detail</button>
            </>}
            {selectedLink&&<>
              <div className="network-context-title"><span>ROAD LINK</span><b>{selectedLink.name}</b><em>{linkLength(project,selectedLink).toFixed(0)} m</em></div>
              <button data-network-context-action="add-pi" onClick={addSelectedLinkPi}>＋ PI</button>
              {selectedVia&&selectedLinkVertex!==null&&<>
                <div className="network-context-step wide"><span>R</span><button data-network-context-action="radius-dec" disabled={selectedVia.radius<=0} onClick={()=>adjustSelectedViaRadius(-5)}>−</button><b>{selectedVia.radius.toFixed(0)} m</b><button data-network-context-action="radius-inc" disabled={selectedVia.radius>=200} onClick={()=>adjustSelectedViaRadius(5)}>＋</button></div>
                <button className="danger" data-network-context-action="remove-pi" onClick={removeSelectedLinkPi}>ลบ PI</button>
              </>}
              {!selectedVia&&<span className="network-context-hint">Double-click Link = เพิ่ม PI</span>}
            </>}
            {selectedTransferPort&&<><div className="network-context-title"><span>TRANSFER PORT</span><b>{selectedTransferPort.name}</b><em>Sta. {selectedTransferPort.station.toFixed(1)} m</em></div><span className="network-context-hint">{selectedTransferPort.terminal.toUpperCase()} · {selectedTransferPort.direction} · {selectedTransferPort.side}</span></>}
            {selectedTransferConnector&&<><div className="network-context-title"><span>TRANSFER CONNECTOR</span><b>{selectedTransferConnector.name}</b><em>{selectedTransferConnector.lanes} × {selectedTransferConnector.laneWidth.toFixed(2)} m</em></div>
              <button data-network-context-action="add-transfer-pi" onClick={addSelectedTransferPi}>＋ PI</button>
              {selectedTransferVia&&selectedTransferVertex!==null&&<><div className="network-context-step wide"><span>R</span><button data-network-context-action="transfer-radius-dec" disabled={selectedTransferVia.radius<=0} onClick={()=>adjustSelectedTransferViaRadius(-5)}>−</button><b>{selectedTransferVia.radius.toFixed(0)} m</b><button data-network-context-action="transfer-radius-inc" disabled={selectedTransferVia.radius>=200} onClick={()=>adjustSelectedTransferViaRadius(5)}>＋</button></div><button className="danger" data-network-context-action="remove-transfer-pi" onClick={removeSelectedTransferPi}>ลบ PI</button></>}
              {!selectedTransferVia&&<span className="network-context-hint">Double-click Connector = เพิ่ม PI</span>}
            </>}
          </div>}
          {view==='2d'&&<div className="network-scale" data-network-scale-meters={scaleMeters} style={{width:`${scaleWidthPercent}%`}}><span>{scaleMeters>=1000?(scaleMeters/1000)+' km':scaleMeters+' m'}</span><div className="network-scale-bar"/></div>}
          <div className="network-zoom" hidden={view==='3d'} data-network-zoom-value={zoom.toFixed(4)}>
            <button data-network-zoom-action="in" title="Zoom in" onClick={()=>zoomAt(1.18)}><Plus size={16}/></button>
            <button className="network-zoom-value" data-network-zoom-action="reset" title="กลับสู่ 100%" onClick={()=>zoomAt(1/zoom)}>{Math.round(zoom*100)}%</button>
            <button data-network-zoom-action="out" title="Zoom out" onClick={()=>zoomAt(.84)}><Minus size={16}/></button>
            <button data-network-zoom-action="fit" title="Fit network" onClick={fit}><Maximize2 size={15}/></button>
          </div>
          <div className="network-status" data-network-status-tone={statusTone}>{notice}</div>
        </div>
        {view==='2d'&&<NetworkSectionDock project={project} junction={selectedJunction} armId={selectedArm} link={selectedLink} onJunctionEdit={editFromNetworkSection}/>}
      </section>
      <aside className={'network-inspector'+(!inspectorOpen?' is-hidden':'')} data-network-inspector-tab={inspectorTab}>
        <div className="network-inspector-head"><div className="network-inspector-title"><span>{inspectorTab==='object'?'OBJECT':inspectorTab==='review'?'REVIEW':'REFERENCE'}</span><b>{inspectorTab==='object'?(selectedJunction?.name??selectedLink?.name??selectedTransferPort?.name??selectedTransferConnector?.name??'ยังไม่ได้เลือกวัตถุ'):inspectorTab==='review'?`ตรวจแบบ · ${currentScenario.name}`:'แผนที่ / ภาพอ้างอิง'}</b></div><div className="network-inspector-tabs" role="tablist" aria-label="Inspector sections"><button role="tab" aria-selected={inspectorTab==='object'} data-network-inspector-tab-button="object" className={inspectorTab==='object'?'active':''} onClick={()=>setInspectorTab('object')}>วัตถุ</button><button role="tab" aria-selected={inspectorTab==='review'} data-network-inspector-tab-button="review" className={inspectorTab==='review'?'active':''} onClick={()=>setInspectorTab('review')}>ตรวจแบบ <b>{designReport.counts.error+designReport.counts.warning}</b></button><button role="tab" aria-selected={inspectorTab==='reference'} data-network-inspector-tab-button="reference" className={inspectorTab==='reference'?'active':''} onClick={()=>setInspectorTab('reference')}>อ้างอิง</button></div></div>
        {selection&&<button hidden={inspectorTab!=='object'} className="network-delete" data-network-delete="true" data-network-delete-armed={deleteArmedForSelection?'true':'false'} onClick={deleteSelection}><Trash2 size={15}/> {deleteArmedForSelection&&selection.kind==='junction'&&selectedConnectedLinkIds.length?`ยืนยันลบ Junction + ${selectedConnectedLinkIds.length} Link`:'ลบวัตถุที่เลือก'}</button>}
        {comparisonScenario&&scenarioComparison&&<section hidden={inspectorTab!=='review'} className="network-comparison-panel" data-network-comparison-summary="true"><div className="network-arm-editor-head"><span>SCENARIO COMPARISON</span><b>{comparisonScenario.name} → {currentScenario.name}</b></div><div className="network-comparison-presentation-summary" data-network-comparison-presentation-summary="true"><span>PRESENTATION SUMMARY</span><b>{scenarioComparison.counts.total} engineering object{scenarioComparison.counts.total===1?'':'s'} differ</b><p>{comparisonHighlights.length?comparisonHighlights.map(metric=>comparisonDeltaText(metric.label,metric.delta,metric.unit)).join(' · '):'No non-zero headline metric delta'}</p></div><div className="network-comparison-counts"><span><b>{scenarioComparison.counts.added}</b> added</span><span><b>{scenarioComparison.counts.removed}</b> removed</span><span><b>{scenarioComparison.counts.changed}</b> changed</span></div><div className="network-comparison-metrics">{scenarioComparison.metrics.map(metric=><div key={metric.key} data-network-comparison-summary-metric={metric.key} data-network-comparison-summary-delta={metric.delta}><span>{metric.label}</span><b>{metric.reference}{metric.unit?' '+metric.unit:''} → {metric.active}{metric.unit?' '+metric.unit:''}</b><em className={metric.delta===0?'zero':metric.delta>0?'positive':'negative'}>{metric.delta===0?'0':metric.delta>0?'+'+metric.delta:metric.delta}{metric.unit?' '+metric.unit:''}</em></div>)}</div><div className="network-comparison-filters" role="group" aria-label="กรองชนิดความเปลี่ยนแปลง">{SCENARIO_CHANGE_FILTERS.map(filter=>{const count=filterScenarioObjectDeltas(scenarioComparison.objects,filter.id).length;return <button key={filter.id} data-network-comparison-filter={filter.id} data-network-comparison-filter-count={count} className={comparisonFilter===filter.id?'active':''} onClick={()=>setComparisonFilter(filter.id)}>{filter.label}<b>{count}</b></button>;})}</div>{scenarioComparison.objects.length===0?<p className="network-note">สอง scenario มี engineering state ตรงกันในขอบเขต comparison ปัจจุบัน</p>:filteredComparisonObjects.length===0?<p className="network-note" data-network-comparison-empty-filter="true">ไม่มีรายการใน filter {SCENARIO_CHANGE_FILTERS.find(v=>v.id===comparisonFilter)?.label}</p>:<div className="network-comparison-object-list">{filteredComparisonObjects.slice(0,20).map(item=><button type="button" key={item.kind+':'+item.id} data-network-comparison-object={item.status} data-network-comparison-inspect={item.kind+':'+item.id} data-network-comparison-focused={focusedComparisonObject?.kind===item.kind&&focusedComparisonObject.id===item.id?'true':undefined} onClick={()=>inspectComparisonObject(item)}><span>{item.kind==='junction'?'JUNCTION':'ROAD LINK'} · {item.id}</span><b>{item.name}</b><em>{item.status.toUpperCase()}</em><p>{item.changes.join(' · ')}</p></button>)}{filteredComparisonObjects.length>20&&<p className="network-note">และอีก {filteredComparisonObjects.length-20} รายการใน filter นี้</p>}</div>}{comparisonInspection&&<div className="network-comparison-inspection" data-network-comparison-inspection={comparisonInspection.kind+':'+comparisonInspection.id}><div className="network-comparison-inspection-head"><div><span>CHANGE INSPECTOR</span><b>{comparisonInspection.name}</b></div><div className="network-comparison-inspection-actions"><button data-network-comparison-prev disabled={filteredComparisonObjects.length<2} onClick={()=>navigateComparison(-1)}>Prev</button><button data-network-comparison-next disabled={filteredComparisonObjects.length<2} onClick={()=>navigateComparison(1)}>Next</button>{focusedComparisonActiveExists?<button data-network-comparison-select-active onClick={selectFocusedComparisonActive}>Select Active</button>:<button data-network-comparison-reference-only disabled>Reference only</button>}<button data-network-comparison-focus-clear onClick={()=>setComparisonFocus(null)}>Clear</button></div></div><div className="network-comparison-before-after-head"><span>Property</span><b>{comparisonScenario.name}</b><b>{currentScenario.name}</b></div>{comparisonInspection.rows.map(row=><div key={row.label} className={row.changed?'changed':''} data-network-comparison-detail={row.label}><span>{row.label}</span><b>{row.reference}</b><b>{row.active}</b></div>)}</div>}<p className="network-note">Delta = active − reference. คลิกรายการเพื่อ zoom + highlight Active/Reference; comparison navigation เป็น UI-only ไม่เข้า Undo/Redo หรือ Scenario JSON.</p></section>}
        <section hidden={inspectorTab!=='review'} className="network-design-summary" data-network-design-summary="true" data-network-design-finding-count={designReport.counts.total}><div className="network-arm-editor-head"><span>DESIGN SUMMARY</span><b>{currentScenario.name}</b></div><div className="network-design-summary-grid"><span><b>{designReport.metrics.junctions}</b> Junctions</span><span><b>{designReport.metrics.roadLinks}</b> RoadLinks</span><span><b>{designReport.metrics.roadLength.toFixed(0)} m</b> Corridor</span><span><b>{designReport.metrics.mainLanes}</b> Main lanes</span><span><b>{designReport.metrics.pocketLanes}</b> Pocket</span><span><b>{designReport.metrics.receivingLanes}</b> Receiving</span></div><div className="network-design-readiness" data-network-design-errors={designReport.counts.error} data-network-design-warnings={designReport.counts.warning} data-network-design-notes={designReport.counts.note}><span className={designReport.counts.error?'bad':'ok'}><b>{designReport.counts.error}</b> error</span><span className={designReport.counts.warning?'warn':'ok'}><b>{designReport.counts.warning}</b> warning</span><span><b>{designReport.counts.note}</b> note</span></div>{designReport.findings.length?<div className="network-design-finding-list">{designReport.findings.slice(0,6).map((item,index)=><div key={item.objectKind+item.objectId+index} className={item.level} data-network-design-finding={item.level}><b>{item.objectKind==='junction'?'J':item.objectKind==='roadlink'?'L':'T'} · {item.objectId}</b><span>{item.message}</span></div>)}{designReport.findings.length>6&&<p>และอีก {designReport.findings.length-6} รายการใน Design Summary HTML</p>}</div>:<p className="network-ok">ไม่พบ engineering review finding ใน state ปัจจุบัน</p>}<p className="network-note">Summary นี้เป็น concept-design review จาก state เดียวกับ editor ไม่ใช่ capacity / LOS / simulation analysis.</p></section>
        {selectedJunction&&<section hidden={inspectorTab!=='object'}>
          <p className="network-object-type">Junction Instance · {selectedJunction.id}</p>
          <div className="network-arm-tabs" aria-label="เลือกขาถนน">{selectedJunction.design.enabled.map((enabled,armId)=>enabled?<button key={armId} className={selectedArm===armId?'active':''} onClick={()=>selectArm(selectedJunction.id,armId)}>{selectedJunction.design.arms[armId].name||('Arm '+(armId+1))}</button>:null)}</div>
          <div className="network-leg-config"><span>ขาทางแยก</span>{selectedJunction.design.enabled.map((enabled,armId)=><label key={armId} className={enabled?'active':''}><input type="checkbox" checked={enabled} onChange={e=>toggleJunctionArm(armId,e.target.checked)}/>{selectedJunction.design.arms[armId].name||('Arm '+(armId+1))}</label>)}</div>
          <label>ชื่อทางแยก<input value={selectedJunction.name} onFocus={beginFieldEdit} onChange={e=>{const before=projectRef.current,next={...before,junctions:before.junctions.map(j=>j.id===selectedJunction.id?{...j,name:e.target.value}:j)};setProjectNow(next);}} onBlur={finishFieldEdit}/></label>
          <div className="network-coords"><label>X (m)<input data-network-junction-x key={'x-'+selectedJunction.id+'-'+selectedJunction.x} type="number" defaultValue={+selectedJunction.x.toFixed(2)} onBlur={e=>{const n=Number(e.currentTarget.value);if(!Number.isFinite(n)||!moveSelectedJunctionTo({x:n,y:selectedJunction.y}))e.currentTarget.value=selectedJunction.x.toFixed(2);}}/></label><label>Y (m)<input data-network-junction-y key={'y-'+selectedJunction.id+'-'+selectedJunction.y} type="number" defaultValue={+selectedJunction.y.toFixed(2)} onBlur={e=>{const n=Number(e.currentTarget.value);if(!Number.isFinite(n)||!moveSelectedJunctionTo({x:selectedJunction.x,y:n}))e.currentTarget.value=selectedJunction.y.toFixed(2);}}/></label></div>
          <label>หมุน Junction ใน world (°)<input data-network-junction-rotation key={'rotation-'+selectedJunction.id+'-'+selectedJunction.rotation} type="number" min="0" max="359" step="1" defaultValue={Math.round(selectedJunction.rotation)} onBlur={e=>{const n=Number(e.currentTarget.value);if(!Number.isFinite(n)||!rotateSelectedJunctionTo(n))e.currentTarget.value=String(Math.round(selectedJunction.rotation));}}/></label>
          <div className="network-inline-actions"><button data-network-junction-rotate="-15" onClick={()=>rotateSelectedJunctionTo(selectedJunction.rotation-15)}><RotateCw size={14}/> −15°</button><button data-network-junction-rotate="+15" onClick={()=>rotateSelectedJunctionTo(selectedJunction.rotation+15)}><RotateCw size={14}/> +15°</button></div>
          {selectedArmData&&selectedArm!==null&&<div className="network-arm-editor">
            <div className="network-arm-editor-head"><span>DIRECT ARM EDIT</span><b>{selectedArmData.name}</b></div>
            <p className="network-arm-hint">ลากปลายขาได้อิสระ · กด <b>Shift</b> ระหว่างลากเพื่อ snap world heading ทุก 15° · เส้น guide ที่ขึ้นเองเป็นเพียงแนวอ้างอิง ไม่ดูดมุม</p>
            <div className="network-coords"><label>มุม (°)<input key={'angle-'+selectedJunction.id+'-'+selectedArm+'-'+selectedArmData.angle} type="number" min="0" max="359.99" step=".01" defaultValue={selectedArmData.angle.toFixed(2)} onBlur={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))editSelectedArmGeometry(n,selectedArmData.length);}}/></label><label>ความยาว (m)<input key={'length-'+selectedJunction.id+'-'+selectedArm+'-'+selectedArmData.length} type="number" min="45" max="400" step=".01" defaultValue={selectedArmData.length.toFixed(2)} onBlur={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))editSelectedArmGeometry(selectedArmData.angle,n);}}/></label></div>
            <div className="network-step-row"><span>เลนเข้า</span><button data-network-lane-step="incoming-dec" disabled={selectedArmData.incoming<=0||selectedArmData.incoming+selectedArmData.outgoing<=1} onClick={()=>editSelectedArm({incoming:selectedArmData.incoming-1})}>−</button><b>{selectedArmData.incoming}</b><button data-network-lane-step="incoming-inc" disabled={selectedArmData.incoming>=4} onClick={()=>editSelectedArm({incoming:selectedArmData.incoming+1})}>＋</button></div>
            <div className="network-step-row"><span>เลนออก</span><button disabled={selectedArmData.outgoing<=0||selectedArmData.incoming+selectedArmData.outgoing<=1} onClick={()=>editSelectedArm({outgoing:selectedArmData.outgoing-1})}>−</button><b>{selectedArmData.outgoing}</b><button disabled={selectedArmData.outgoing>=4} onClick={()=>editSelectedArm({outgoing:selectedArmData.outgoing+1})}>＋</button></div>
            <div className="network-step-row"><span>เกาะกลาง</span><button disabled={selectedArmData.median<=0} onClick={()=>editSelectedArm({median:Math.max(0,+(selectedArmData.median-.5).toFixed(2))})}>−</button><b>{selectedArmData.median.toFixed(1)} m</b><button disabled={selectedArmData.median>=12} onClick={()=>editSelectedArm({median:Math.min(12,+(selectedArmData.median+.5).toFixed(2))})}>＋</button></div>

            <div className="network-arm-subsection">
              <div className="network-direction-tabs"><button className={selectedDirection==='incoming'?'active':''} onClick={()=>setSelectedDirection('incoming')}>ขาเข้า</button><button className={selectedDirection==='outgoing'?'active':''} onClick={()=>setSelectedDirection('outgoing')}>ขาออก</button></div>
              {selectedSection&&<><div className="network-arm-editor-head"><span>STREET SECTION</span><b>{selectedDirection==='incoming'?'Approach':'Departure'}</b></div>
              <div className="network-step-row"><span>กว้างเลนหลัก</span><button disabled={selectedSection.width<=2.5} onClick={()=>editSelectedSection({width:Math.max(2.5,+(selectedSection.width-.25).toFixed(2))})}>−</button><b>{selectedSection.width.toFixed(2)} m</b><button disabled={selectedSection.width>=4.5} onClick={()=>editSelectedSection({width:Math.min(4.5,+(selectedSection.width+.25).toFixed(2))})}>＋</button></div>
              <div className="network-step-row"><span>ทางเท้า</span><button disabled={selectedSection.walk<=0} onClick={()=>editSelectedSection({walk:Math.max(0,+(selectedSection.walk-.25).toFixed(2))})}>−</button><b>{selectedSection.walk.toFixed(2)} m</b><button disabled={selectedSection.walk>=5} onClick={()=>editSelectedSection({walk:Math.min(5,+(selectedSection.walk+.25).toFixed(2))})}>＋</button></div>
              <div className="network-band-actions"><span>องค์ประกอบริมทาง</span>{(['bike','buffer','shoulder','motorcycle'] as const).map(type=>{const active=selectedSection.bands.some(b=>b.type===type),label=type==='bike'?'จักรยาน':type==='buffer'?'Buffer':type==='shoulder'?'ไหล่ทาง':'มอเตอร์ไซค์';return <button key={type} className={active?'active':''} onClick={()=>toggleBand(type)}>{active?'✓ ':''}{label}</button>;})}</div>
              {!!selectedSection.bands.length&&<div className="network-band-list">{selectedSection.bands.map(b=><div key={b.id} className="network-band-row"><span>{b.type==='bike'?'จักรยาน':b.type==='buffer'?'Buffer':b.type==='shoulder'?'ไหล่ทาง':'มอเตอร์ไซค์'}</span><button disabled={b.width<=.25} onClick={()=>updateBand(b.id,{width:Math.max(.25,+(b.width-.25).toFixed(2))})}>−</button><b>{b.width.toFixed(2)} m</b><button disabled={b.width>=4.5} onClick={()=>updateBand(b.id,{width:Math.min(4.5,+(b.width+.25).toFixed(2))})}>＋</button></div>)}</div>}</>}
            </div>

            <div className="network-arm-subsection">
              <div className="network-arm-editor-head"><span>JUNCTION CONTROL</span><b>ใช้ร่วมทั้งขา</b></div>
              <label className="network-switch"><input type="checkbox" checked={selectedArmData.crossing} onChange={e=>editSelectedArm({crossing:e.target.checked})}/> ทางข้ามคนเดินเท้า</label>
              {selectedArmData.crossing&&<div className="network-step-row"><span>ร่นทางข้าม</span><button disabled={selectedArmData.crossOffset<=0} onClick={()=>editSelectedArm({crossOffset:Math.max(0,+(selectedArmData.crossOffset-.5).toFixed(2))})}>−</button><b>{selectedArmData.crossOffset.toFixed(1)} m</b><button disabled={selectedArmData.crossOffset>=35} onClick={()=>editSelectedArm({crossOffset:Math.min(35,+(selectedArmData.crossOffset+.5).toFixed(2))})}>＋</button></div>}
              <label className="network-switch"><input type="checkbox" checked={selectedArmData.signal} onChange={e=>editSelectedArm({signal:e.target.checked})}/> สัญญาณไฟจราจร</label>
              <label className="network-switch"><input type="checkbox" checked={selectedArmData.stop} onChange={e=>editSelectedArm({stop:e.target.checked})}/> เส้นหยุด / ให้ทาง</label>
            </div>

            {selectedPockets&&<div className="network-arm-subsection">
              <div className="network-arm-editor-head"><span>AUXILIARY / TURN LANE</span><b>{selectedDirection==='incoming'?'ขาเข้า':'ขาออก'}</b></div>
              {(['left','right'] as const).map(side=>{const pocket=selectedPockets[side],label=side==='left'?'ริมทาง':'ชิดเกาะกลาง';return <div key={side} className="network-pocket-card"><div className="network-pocket-title"><span>{label}</span><div><button disabled={pocket.lanes<=0} onClick={()=>editSelectedPocket(side,{lanes:pocket.lanes-1})}>−</button><b>{pocket.lanes} เลน</b><button disabled={pocket.lanes>=3} onClick={()=>editSelectedPocket(side,{lanes:pocket.lanes+1})}>＋</button></div></div>{pocket.lanes>0&&<><div className="network-step-row"><span>{selectedDirection==='incoming'?'Storage':'Receiving'}</span><button disabled={pocket.length<=5} onClick={()=>editSelectedPocket(side,{length:Math.max(5,pocket.length-5)})}>−</button><b>{pocket.length.toFixed(0)} m</b><button disabled={pocket.length>=140} onClick={()=>editSelectedPocket(side,{length:Math.min(140,pocket.length+5)})}>＋</button></div><div className="network-step-row"><span>{selectedDirection==='incoming'?'Taper':'Merge taper'}</span><button disabled={pocket.taper<=5} onClick={()=>editSelectedPocket(side,{taper:Math.max(5,pocket.taper-5)})}>−</button><b>{pocket.taper.toFixed(0)} m</b><button disabled={pocket.taper>=80} onClick={()=>editSelectedPocket(side,{taper:Math.min(80,pocket.taper+5)})}>＋</button></div></>}</div>;})}
              <p className="network-arm-hint">ริมทาง = curb-side auxiliary · ชิดเกาะกลาง = median-side auxiliary. ระบบยังใช้ Pocket resolver / allocation / lane marking ชุดเดียวกับ Junction Detail.</p>
            </div>}
          </div>}
          <button className="network-detail-button" onClick={openSelectedJunctionDetail}>แก้รายละเอียดทางแยก</button><p className="network-note">ตำแหน่ง/rotation เป็น transform ของ Junction instance เท่านั้น ไม่แก้ geometry ภายใน Design v6. Road Link ที่ผูกกับ arm จะตาม port ไปอัตโนมัติ</p>
        </section>}
        {selectedLink&&<section hidden={inspectorTab!=='object'}>
          <p className="network-object-type">Road Link · {selectedLink.id}</p>
          <div className="network-link-metrics"><span>Resolved alignment <b>{linkLength(project,selectedLink).toFixed(1)} m</b></span><span>PI / via points <b>{selectedLink.via.length}</b></span></div>
          <ParallelCorridorPanel project={project} selectedLink={selectedLink} draftMainlineId={parallelDraftMainlineId} targetCorridorId={effectiveParallelTargetCorridorId} seedOffset={parallelSeedOffset} onSeedOffset={value=>Number.isFinite(value)&&setParallelSeedOffset(value)} onSeed={seedSelectedParallelFrontage} onStartDraft={beginParallelCorridorDraft} onCancelDraft={()=>{setParallelDraftMainlineId(null);setNotice('ยกเลิก Parallel corridor draft แล้ว');}} onFinalizeDraft={finalizeParallelCorridorDraft} onTargetCorridor={setParallelTargetCorridorId} onAddToTarget={addSelectedLinkToParallelTarget} onRemoveMembership={removeSelectedParallelMembership} onDissolve={dissolveSelectedParallelCorridor} onReverseReference={reverseSelectedParallelReference} onMarkSeedReviewed={markSelectedParallelSeedReviewed} onSelectLink={selectParallelMember}/>
          <div className="network-inline-actions"><button data-network-link-action="add-pi" onClick={addSelectedLinkPi}>＋ PI / จุดแนว</button><button data-network-link-action="remove-pi" disabled={selectedLinkVertex===null} onClick={removeSelectedLinkPi}>ลบ PI</button></div>
          {selectedVia&&selectedLinkVertex!==null&&<div className="network-link-editor"><div className="network-arm-editor-head"><span>CURVE AT PI {selectedLinkVertex+1}</span><b>R {selectedVia.radius.toFixed(0)} m</b></div><div className="network-step-row"><span>รัศมีโค้ง</span><button disabled={selectedVia.radius<=0} onClick={()=>adjustSelectedViaRadius(-5)}>−</button><b>{selectedVia.radius.toFixed(0)} m</b><button disabled={selectedVia.radius>=200} onClick={()=>adjustSelectedViaRadius(5)}>＋</button></div><button className="network-map-reset" disabled={selectedVia.radius===0} onClick={()=>{const before=projectRef.current;commit(updateLinkViaRadius(before,selectedLink.id,selectedLinkVertex,0),before);}}>ใช้มุม PI ตรง (R0)</button><p className="network-note">ระบบ clamp รัศมีตามระยะ tangent ที่มีจริง เพื่อไม่ให้โค้งล้ำ PI ข้างเคียง</p></div>}
          <div className="network-link-profile" data-network-endpoint-lifecycle="true"><div className="network-arm-editor-head"><span>JUNCTION ENDPOINT LIFECYCLE</span><b>{selectedLink.sectionProfile.mode==='linear'?(linearTransitionPossible?'Resolved lifecycle':'Needs topology'):'Review mismatch'}</b></div>
            {(['forward','backward'] as LinkDirection[]).map(direction=>{const counts=linkLaneCounts(project,selectedLink,direction);if(!counts||counts.from===counts.to)return null;const key=direction==='forward'?'forwardLaneTransition':'backwardLaneTransition',transition=selectedLink.sectionProfile[key],possible=linkLaneTransitionPossible(project,selectedLink,direction),label=direction==='forward'?'ทิศไป FROM → TO':'ทิศกลับ TO → FROM';return <div key={direction} className="network-lane-transition"><div className="network-pocket-title"><span>{label}</span><b>{counts.from} → {counts.to} เลน</b></div>{possible?<><div className="network-transition-side"><button data-network-transition-side={direction+'-curb'} className={transition?.side==='curb'?'active':''} onClick={()=>{const before=projectRef.current;commit(defaultLinkLaneTransition(before,selectedLink,direction,'curb'),before);setNotice('กำหนด lane transition ฝั่งริมทางแล้ว');}}>ริมทาง / Curb</button><button data-network-transition-side={direction+'-median'} className={transition?.side==='median'?'active':''} onClick={()=>{const before=projectRef.current;commit(defaultLinkLaneTransition(before,selectedLink,direction,'median'),before);setNotice('กำหนด lane transition ฝั่งชิดเกาะกลางแล้ว');}}>ชิดเกาะกลาง / Median</button></div>{transition&&<><div className="network-step-row"><span>กึ่งกลาง Station</span><button onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,center:Math.max(0,transition.center-10)}),before);}}>−</button><b>{transition.center.toFixed(0)} m</b><button onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,center:transition.center+10}),before);}}>＋</button></div><div className="network-step-row"><span>Transition length</span><button disabled={transition.length<=3} onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,length:Math.max(3,transition.length-5)}),before);}}>−</button><b>{transition.length.toFixed(0)} m</b><button onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,length:transition.length+5}),before);}}>＋</button></div><button className="network-map-reset" onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,null),before);}}>ล้าง lane transition</button></>}</>:<p className="network-note">รุ่นนี้รองรับ transition ทีละ 1 เลน และต้องมีอย่างน้อย 1 เลนทั้งสองปลาย กรณีนี้ยังคงเป็น unresolved topology.</p>}</div>;})}
            <label>การต่อหน้าตัด<select data-network-section-mode="link" value={selectedLink.sectionProfile.mode} onChange={e=>{const before=projectRef.current,next=updateLinkSectionProfile(before,selectedLink.id,e.target.value as 'review'|'linear');if(next===before&&e.target.value==='linear'){setNotice('ใช้ Linear transition ไม่ได้จนกว่าจะกำหนด lane transition และชนิด edge bands ให้สอดคล้อง');return;}if(next===before&&e.target.value==='review'&&selectedLink.components.length){setNotice('กลับ Review ไม่ได้ขณะที่ยังมี station components · ลบ components ก่อน');return;}commit(next,before);setNotice(e.target.value==='linear'?'เปิด resolved section transition แล้ว':'กลับเป็นโหมดตรวจ mismatch แล้ว');}}><option value="review">Review mismatch</option><option value="linear" disabled={!linearTransitionPossible}>Resolved geometric transition</option></select></label><p className="network-note">Lane-count mismatch ที่มาจาก Junction endpoints จะถูกแปลงเป็น runtime lane lifecycle เดียวกับ auxiliary lane ใน corridor หลังเลือก Curb หรือ Median; lane width, median, sidewalk และ band widths ยัง resolve ต่อเนื่องจาก section profile เดิม.</p></div>
          <div className="network-aux-proposals" data-network-auxiliary-proposals="true"><div className="network-arm-editor-head"><span>JUNCTION → CORRIDOR HANDOFF</span><b>{selectedAuxiliaryProposals.length} รายการ</b></div>{selectedAuxiliaryProposals.length===0?<p className="network-note">ยังไม่มี Pocket / Receiving lane บน arm ที่เชื่อมกับ Road Link นี้</p>:<div className="network-aux-proposal-list">{selectedAuxiliaryProposals.map(proposal=><div key={proposal.id} className={'network-aux-proposal '+proposal.status} data-network-auxiliary-proposal={proposal.status} data-network-handoff-mode={proposal.continuation}><div className="network-aux-proposal-head"><div><span>{proposal.end.toUpperCase()} · {proposal.sourceDirection==='incoming'?'POCKET':'RECEIVING'} · {proposal.sourceSide==='left'?'CURB':'MEDIAN'}</span><b>{proposal.lanes} lane{proposal.lanes>1?'s':''} → {proposal.linkDirection==='forward'?'FROM → TO':'TO → FROM'}</b></div><em>{proposalStatusLabel[proposal.status]}</em></div><div className="network-handoff-mode" role="group" aria-label="Cross-boundary handoff mode"><button data-network-handoff-action="local" className={proposal.continuation==='local'?'active':''} onClick={()=>proposal.continuation==='corridor'&&returnSelectedAuxiliaryProposalLocal(proposal.id)}>Junction only</button><button data-network-handoff-action="continue" className={proposal.continuation==='corridor'?'active':''} disabled={proposal.continuation==='local'&&!proposal.canContinue} onClick={()=>proposal.continuation==='local'&&continueSelectedAuxiliaryProposal(proposal.id)}>Continue into Corridor</button></div><div className="network-aux-proposal-metrics"><span>Local full {proposal.sourceLength.toFixed(0)} m · taper {proposal.sourceTaper.toFixed(0)} m</span><span>Port factor {(proposal.portFactor*100).toFixed(0)}%</span><span>Extend to Port {proposal.extensionToPort.toFixed(1)} m</span>{proposal.continuation==='corridor'?<span>Corridor Sta. {proposal.corridorStart.toFixed(1)}–{proposal.corridorEnd.toFixed(1)} m</span>:<span>Gap to Port {Math.max(0,proposal.gapToPort).toFixed(1)} m</span>}</div><p>{proposal.message}</p>{proposal.continuation==='corridor'&&proposal.status==='ready'&&<button data-network-auxiliary-apply={proposal.id} onClick={()=>applySelectedAuxiliaryProposal(proposal.id)}>สร้าง / ซ่อม Corridor handoff</button>}</div>)}</div>}<p className="network-note">Junction only ใช้ taper ภายใน Arm ตามเดิม. Continue into Corridor เป็น explicit cross-boundary intent: Junction lane จะคงเต็มความกว้างถึง Port แล้ว full/taper ที่เหลือ resolve ใน RoadLink. Handoff components มี provenance ของตัวเอง; การกลับ Junction only จะลบเฉพาะ components ที่ handoff สร้าง ไม่แตะ manual corridor lanes.</p></div>
          {selectedHandoffIssues.length>0&&<div className="network-handoff-integrity" data-network-handoff-integrity="true"><div className="network-arm-editor-head"><span>HANDOFF INTEGRITY</span><b>{selectedHandoffIssues.length} issue{selectedHandoffIssues.length>1?'s':''}</b></div><div className="network-handoff-issue-list">{selectedHandoffIssues.map(issue=><div key={issue.id} className={'network-handoff-issue '+issue.level} data-network-handoff-issue={issue.kind}><div className="network-handoff-issue-head"><b>{({stale:'STALE',orphan:'ORPHAN',range:'OUT OF RANGE',topology:'TOPOLOGY'} as const)[issue.kind]}</b><span>{issue.componentIds.join(', ')}</span></div><p>{issue.message}</p><div className="network-handoff-issue-actions">{issue.canRepair&&<button data-network-handoff-repair={issue.handoffId} onClick={()=>repairSelectedHandoff(issue.handoffId)}>Repair from Junction</button>}<button data-network-handoff-detach={issue.handoffId} onClick={()=>detachSelectedHandoff(issue.handoffId)}>Detach as manual</button>{issue.canReturnLocal&&<button data-network-handoff-return-local={issue.handoffId} onClick={()=>returnSelectedAuxiliaryProposalLocal(issue.handoffId)}>Back to Junction only</button>}</div></div>)}</div><p className="network-note">Integrity audit ไม่แก้ geometry เอง: Repair สร้าง station profile ใหม่จาก Junction source, Detach เก็บ geometry ปัจจุบันแต่ลบ provenance, และ Back to Junction only คืน taper ownership เข้า Arm พร้อมลบเฉพาะ handoff-owned components.</p></div>}
          <div className="network-station-components" data-network-station-components="true" data-network-corridor-lifecycles="true"><div className="network-arm-editor-head"><span>CORRIDOR LIFECYCLES</span><b>{selectedLink.components.length} รายการ</b></div><div className="network-station-add"><button data-network-station-add="lane" disabled={selectedLink.sectionProfile.mode!=='linear'||!linearTransitionPossible} onClick={()=>addSelectedStationComponent('lane')}>＋ Auxiliary lane</button><button data-network-station-add="width" disabled={selectedLink.sectionProfile.mode!=='linear'||!linearTransitionPossible} onClick={()=>addSelectedStationComponent('width')}>＋ Edge width zone</button></div>{selectedLink.components.length===0?<p className="network-note">เพิ่ม lifecycle ตาม station ได้เมื่อ Link อยู่ใน Resolved geometric transition. Auxiliary lane ใช้ความกว้างเลนหลัก ณ station นั้น; Edge width ใช้กับทางเท้าหรือ band ที่ต่อเนื่องจากปลาย Link.</p>:<div className="network-station-component-list">{selectedLink.components.map(component=>{const targets=linkWidthTargets(project,selectedLink,component.direction);return <div key={component.id} className="network-station-component-card" data-network-station-component={component.kind} data-network-component-source={component.kind==='lane'&&component.source?component.source.kind:'manual'}><div className="network-station-component-title"><div><span>{component.kind==='lane'?(component.source?.kind==='junction-auxiliary'?'JUNCTION HANDOFF':component.source?.kind==='transfer-terminal'?'TRANSFER TERMINAL':'AUX LANE'):'EDGE WIDTH'}</span><b>{component.id}</b></div><button onClick={()=>removeSelectedStationComponent(component.id)}>ลบ</button></div><div className="network-station-grid"><label>Direction<select value={component.direction} onChange={e=>editSelectedStationComponent(component.id,{direction:e.target.value as LinkDirection})}><option value="forward">FROM → TO</option><option value="backward">TO → FROM</option></select></label>{component.kind==='lane'?<label>Side<select value={component.side} onChange={e=>editSelectedStationComponent(component.id,{side:e.target.value as 'curb'|'median'})}><option value="curb">Curb side</option><option value="median">Median side</option></select></label>:<><label>Target<select value={component.target} onChange={e=>editSelectedStationComponent(component.id,{target:e.target.value as LinkWidthTarget})}>{targets.map(target=><option key={target} value={target}>{linkWidthTargetLabel[target]}</option>)}</select></label><label>Δ width (m)<input key={component.id+'-delta-'+component.delta} type="number" step=".25" defaultValue={component.delta} onBlur={e=>editSelectedStationComponent(component.id,{delta:Number(e.currentTarget.value)})}/></label></>}<label>Start (m)<input key={component.id+'-start-'+component.start} type="number" min="0" step=".5" defaultValue={component.start} onBlur={e=>editSelectedStationComponent(component.id,{start:Number(e.currentTarget.value)})}/></label><label>End (m)<input key={component.id+'-end-'+component.end} type="number" min=".5" step=".5" defaultValue={component.end} onBlur={e=>editSelectedStationComponent(component.id,{end:Number(e.currentTarget.value)})}/></label><label>Taper in (m)<input key={component.id+'-tin-'+component.taperIn} type="number" min="0" step=".5" defaultValue={component.taperIn} onBlur={e=>editSelectedStationComponent(component.id,{taperIn:Number(e.currentTarget.value)})}/></label><label>Taper out (m)<input key={component.id+'-tout-'+component.taperOut} type="number" min="0" step=".5" defaultValue={component.taperOut} onBlur={e=>editSelectedStationComponent(component.id,{taperOut:Number(e.currentTarget.value)})}/></label></div></div>;})}</div>}<p className="network-note">ข้อมูล corridor persist ใน Network schema v5 ส่วน endpoint lane change ยังคงเก็บด้วย sectionProfile เพื่อ compatibility แต่ทั้งสองแบบถูก normalize เข้า LaneLifecycle runtime เดียวก่อนสร้าง 2D, section dock และ 3D. ตั้งแต่ 5B.4 overlapping lane lifecycles ใช้ lane identity แยกและ stack ตาม side ได้ จึงรองรับ proposal หลายเลนโดยไม่ collapse เส้นแบ่งเลน.</p></div>
          <div className="network-link-port-editor" data-network-link-port-editor="true"><div className="network-arm-editor-head"><span>PORT CONNECTIONS</span><b>Safe reconnect</b></div>{(['from','to'] as const).map(end=>{const ref=end==='from'?selectedLink.from:selectedLink.to,choices=reconnectPortChoices(selectedLink.id,end),handoffLocked=selectedLink.components.some(component=>component.kind==='lane'&&component.source?.kind==='junction-auxiliary'&&component.source.junctionId===ref.junctionId&&component.source.armId===ref.armId);return <label key={end}>{end.toUpperCase()}<select data-network-reconnect={end} value={portKey(ref)} disabled={handoffLocked||choices.length<=1} onChange={e=>reconnectSelectedLink(end,e.target.value)}>{choices.map(choice=><option key={portKey(choice.ref)} value={portKey(choice.ref)}>{choice.label}</option>)}</select>{handoffLocked&&<small>ปลายนี้มี Junction handoff provenance · Detach/Back to Junction ก่อนเปลี่ยน port</small>}</label>;})}<p className="network-note">Reconnect รักษา RoadLink เดิมทั้ง ID, PI/radius, section mode และ manual corridor lifecycle. ระบบไม่ย้าย handoff provenance อัตโนมัติ และไม่ล้าง PI เพื่อบังคับให้ต่อสำเร็จ.</p></div>
          <div className="network-link-ends"><span>FROM <b>{portKey(selectedLink.from)}</b></span><span>TO <b>{portKey(selectedLink.to)}</b></span></div>
          {selectedIssues.length?<div className="network-issues">{selectedIssues.map((issue,i)=><p key={i}>! {issue.message}</p>)}</div>:<p className="network-ok">Road Link continuity resolved ในขอบเขต schema v5</p>}
          <p className="network-note">ดับเบิลคลิกบน Road Link เพื่อเพิ่ม PI แล้วลาก PI เพื่อเปลี่ยน alignment. R0 = polyline เดิม; R&gt;0 = tangent–arc–tangent ที่ resolve จาก geometry เดียวกันใน plan, Fit และ length.</p>
        </section>}
        <div hidden={inspectorTab!=='object'} data-network-inspector-pane="object"><TransferEditorPanel key={(selection?.kind??'none')+':'+(selection?.id??'none')} project={project} selection={selection} onSelect={selectObject} onNotice={setNotice} onCommit={(next,message,nextSelection)=>{const before=projectRef.current;commit(next,before);if(nextSelection)setSelection(nextSelection);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setSelectedTransferVertex(null);setInspectorTab('object');setNotice(message);}}/>
        {!selection&&<section><p className="network-note">เลือก Junction, Road Link, Transfer Port หรือ Transfer Connector บนแผน. การสร้าง ramp เริ่มจากเลือก Road Link แล้วสร้าง station port ใน Inspector.</p></section>}</div>
        <section hidden={inspectorTab!=='reference'} className="network-map-panel"><h3><MapIcon size={15}/> แผนที่อ้างอิง</h3><label className="network-switch"><input type="checkbox" checked={mapReference.enabled} onChange={e=>setMapReference(v=>({...v,enabled:e.target.checked}))}/> แสดงแผนที่</label>{mapReference.enabled&&<><div className="network-map-search"><input type="search" placeholder="ค้นหาสถานที่ / ถนน / ทางแยก" value={mapQuery} onChange={e=>setMapQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void findPlace();}}}/><button disabled={mapSearching||mapQuery.trim().length<2} onClick={()=>void findPlace()}>{mapSearching?'กำลังค้นหา…':'ค้นหา'}</button></div>{!!mapPlaces.length&&<div className="network-map-results">{mapPlaces.map((place,i)=><button key={place.label+i} onClick={()=>{setMapReference(v=>({...v,lat:place.lat,lng:place.lng,offsetX:0,offsetY:0}));setMapPlaces([]);setMapQuery(place.label);setNotice('ย้ายแผนที่อ้างอิงไปยัง '+place.label);}}>{place.label}</button>)}</div>}<div className="network-map-source" aria-label="ชนิดพื้นแผนที่"><button data-network-map-source="street" className={mapKind==='street'?'active':''} onClick={()=>setMapReference(v=>({...v,basemap:'positron'}))}>Street / Map</button><button data-network-map-source="imagery" className={mapKind==='imagery'?'active':''} onClick={()=>setMapReference(v=>({...v,basemap:'oam-global'}))}>Aerial / Satellite</button></div><label>Provider<select value={mapReference.basemap} onChange={e=>setMapReference(v=>({...v,basemap:e.target.value as MapBasemap}))}>{Object.entries(mapKind==='street'?STREET_BASEMAP_OPTIONS:IMAGERY_BASEMAP_OPTIONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="map-provider-meta"><span className="map-access-badge">{basemapAccessLabel(mapReference.basemap)}</span><span>{basemapDescription(mapReference.basemap)}</span></div>{mapReference.basemap==='oam-global'&&<div className="map-oam-status" data-oam-coverage-status={oamSearching?'loading':oamError?'error':oamSummary?'ready':'idle'}>{oamSearching?'กำลังตรวจ OpenAerialMap รอบจุดนี้…':oamError?'ตรวจ catalog ไม่สำเร็จ · Global Mosaic ยังเปิดใช้งานได้':oamSummary?(oamSummary.count?'พบ open imagery '+oamSummary.count+' ชุด ภายในรัศมี 3 km'+(oamSummary.latest?' · ล่าสุด '+new Date(oamSummary.latest).toLocaleDateString('th-TH'):'')+(oamSummary.bestGsd!==null?' · GSD ดีที่สุดในตัวอย่าง ~'+oamSummary.bestGsd.toFixed(oamSummary.bestGsd<1?2:1)+' m':''):'ยังไม่พบ OpenAerialMap imagery ภายในรัศมี 3 km · ลอง provider อื่นหรือย้ายตำแหน่ง'):''}</div>}{mapCredentialKey&&<div className="network-map-credential"><label>{mapCredentialKey==='esri'?'ArcGIS / Esri API key':'MapTiler API key'}<input type="password" autoComplete="off" value={mapCredentials[mapCredentialKey]} placeholder="ใส่ key ของคุณ" onChange={e=>setMapCredentials(v=>({...v,[mapCredentialKey]:e.target.value}))}/></label><p className="network-note">เก็บเฉพาะใน browser นี้ ไม่เข้า Project JSON · ควรจำกัด key ให้ใช้ได้เฉพาะ origin bokoboss.github.io</p></div>}<div className="network-coords"><label>Lat<input type="number" step=".00001" value={mapReference.lat} onChange={e=>setMapReference(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Lng<input type="number" step=".00001" value={mapReference.lng} onChange={e=>setMapReference(v=>({...v,lng:Number(e.target.value)}))}/></label></div><div className="network-coords"><label>Offset X (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetX.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetX:n}));}}/></label><label>Offset Y (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetY.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetY:n}));}}/></label></div><div className="network-map-align" data-network-map-align="true"><div className="network-map-align-head"><span>MAP ALIGN</span><b>Rigid Network Transform</b></div><p className="network-note">ล็อกแผนที่ไว้ แล้วลาก Network ทั้งชุดเพื่อจัดตำแหน่งจริงใน world metres. การย้าย/หมุนจะเปลี่ยนเฉพาะ Junction instance + RoadLink via points ไม่แก้ geometry ภายใน Design v6.</p><div className="network-map-align-actions"><button data-network-map-align-action="drag" className={tool==='map-align'?'active':''} onClick={()=>choose(tool==='map-align'?'select':'map-align')}>{tool==='map-align'?'เสร็จสิ้นการลาก':'ลาก Network บนแผนที่'}</button><div className="network-map-align-rotation"><label>หมุนทั้ง Network Δ°<input type="number" step=".1" value={mapAlignRotation} onChange={e=>setMapAlignRotation(Number(e.target.value))}/></label><button data-network-map-align-action="rotate" disabled={!Number.isFinite(mapAlignRotation)||Math.abs(mapAlignRotation)<1e-6} onClick={rotateNetworkForMapAlignment}>Apply</button></div></div><p className="network-note">การหมุนใช้กึ่งกลาง footprint ปัจจุบันเป็น pivot และบันทึกเป็น Undo 1 ครั้ง. Offset X/Y ด้านบนยังคงเป็น reference-only adjustment สำหรับทดลองซ้อนแผนที่โดยไม่แตะ engineering state.</p></div><label>Opacity<input type="range" min="10" max="100" step="5" value={mapReference.opacity*100} onChange={e=>setMapReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label><label className="network-switch"><input type="checkbox" checked={mapReference.locked} onChange={e=>setMapReference(v=>({...v,locked:e.target.checked}))}/> ล็อกตำแหน่งแผนที่</label><button className="network-map-reset" disabled={mapReference.locked} onClick={()=>setMapReference(v=>({...v,offsetX:0,offsetY:0}))}>คืน Offset เป็น 0</button><p className="network-note">Map และ Network ใช้ world scale เดียวกัน: 1 หน่วย = 1 เมตรบนพื้นดิน · scale bar มุมล่างซ้ายเปลี่ยนตาม zoom อัตโนมัติ · X/Y ใช้จัดแนวโดยไม่แก้ geometry</p>{mapReference.basemap==='oam-global'&&<p className="network-note">OpenAerialMap เป็น local open imagery: ระดับ zoom ต่ำแสดง coverage grid; zoom 14+ จะแสดงภาพจริงในพื้นที่ที่มีข้อมูล.</p>}{mapReference.basemap==='satellite-eox-2016'&&<p className="network-note">Satellite ฟรีชุดนี้เป็น Sentinel-2 cloudless 2016 ความละเอียดต้นฉบับประมาณ 10 m เหมาะสำหรับบริบทพื้นที่ ไม่ใช้แทนภาพ orthophoto สำหรับขอบคันหิน/ช่องจราจร</p>}</>}</section>
        <section hidden={inspectorTab!=='reference'} className="network-local-reference-panel" data-local-reference-panel="true"><h3><MapIcon size={15}/> Site plan / local image</h3><input ref={localImageInput} type="file" accept="image/png,image/jpeg" hidden onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void importLocalReference(file);}}/><div className="network-local-reference-actions"><button data-local-reference-action="import" onClick={()=>localImageInput.current?.click()}>นำเข้า JPG / PNG</button>{localImageUrl&&<button className="danger" data-local-reference-action="remove" onClick={()=>void removeLocalReference()}>ลบภาพ</button>}</div>{localImageUrl&&localReference.fileName?<><label className="network-switch"><input type="checkbox" checked={localReference.enabled} onChange={e=>setLocalReference(v=>({...v,enabled:e.target.checked}))}/> แสดงภาพอ้างอิง</label><div className="network-local-reference-meta"><b>{localReference.fileName}</b><span>{Math.round(localReference.widthPx)} × {Math.round(localReference.heightPx)} px · {localImageSize.width.toFixed(1)} × {localImageSize.height.toFixed(1)} m · {localReference.calibrated?'CALIBRATED':'UNCALIBRATED'}</span></div><div className="network-coords"><label>Center X (m)<input type="number" step=".5" disabled={localReference.locked} value={+localReference.x.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setLocalReference(v=>({...v,x:n}));}}/></label><label>Center Y (m)<input type="number" step=".5" disabled={localReference.locked} value={+localReference.y.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setLocalReference(v=>({...v,y:n}));}}/></label></div><label>Rotation (°)<input type="number" step=".1" disabled={localReference.locked} value={+localReference.rotation.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setLocalReference(v=>({...v,rotation:normalizeAngle(n)}));}}/></label><label>Opacity<input type="range" min="5" max="100" step="5" value={localReference.opacity*100} onChange={e=>setLocalReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label><label className="network-switch"><input type="checkbox" checked={localReference.locked} onChange={e=>{const locked=e.target.checked;setLocalReference(v=>({...v,locked}));if(locked&&(tool==='image-align'||tool==='image-calibrate'))choose('select');}}/> ล็อกภาพอ้างอิง</label><div className="network-local-reference-actions"><button data-local-reference-action="move" className={tool==='image-align'?'active':''} disabled={localReference.locked||!localReference.enabled} onClick={()=>choose(tool==='image-align'?'select':'image-align')}>{tool==='image-align'?'เสร็จสิ้นการย้าย':'ย้ายภาพบน canvas'}</button><button data-local-reference-action="calibrate" className={tool==='image-calibrate'?'active':''} disabled={localReference.locked||!localReference.enabled} onClick={()=>choose(tool==='image-calibrate'?'select':'image-calibrate')}>{tool==='image-calibrate'?'ยกเลิก A–B':'เลือกจุด A–B'}</button></div><div className="network-local-calibration"><label>ระยะจริง A–B (m)<input type="number" min=".1" step=".1" value={calibrationDistance} onChange={e=>setCalibrationDistance(Number(e.target.value))}/></label><div className="network-local-calibration-status"><span>{calibrationPoints.length===0?'ยังไม่เลือกจุด':calibrationPoints.length===1?'เลือก A แล้ว · รอ B':`ระยะบน canvas ปัจจุบัน ${calibrationMeasured?.toFixed(2)} m`}</span><button data-local-reference-action="apply-calibration" disabled={calibrationPoints.length!==2||!Number.isFinite(calibrationDistance)||calibrationDistance<=0} onClick={applyLocalReferenceCalibration}>Apply calibration</button></div></div><button className="network-map-reset" disabled={localReference.locked} onClick={()=>{const reset=initialLocalImageReference(localReference.fileName,localReference.widthPx,localReference.heightPx,pan,Math.min(360,NETWORK_VIEW_SPAN/zoom*.75));setLocalReference({...reset,enabled:localReference.enabled,opacity:localReference.opacity});setCalibrationPoints([]);setNotice('คืนตำแหน่ง/rotation/scale ของภาพเป็นค่าเริ่มต้นแบบยังไม่ calibrated แล้ว');}}>Reset image transform</button><p className="network-note">ภาพถูกเก็บใน IndexedDB ของ browser นี้ ส่วน scale/ตำแหน่ง/rotation เก็บเป็น reference metadata แยกจาก NetworkProject JSON. Calibration ขยาย/ย่อแบบ uniform โดยยึดจุด A ไว้คงที่ จึงไม่บิด geometry ของภาพ.</p></>:<p className="network-note">นำเข้า site plan, survey export หรือ orthophoto แบบ JPG/PNG แล้วกำหนดระยะจริง A–B เพื่อให้ภาพอยู่ใน world scale หน่วยเมตรเดียวกับ Network. รุ่น 5A.2 ใช้เป็น reference ใน 2D ก่อน.</p>}</section>

      </aside>
    </div>
    <footer className="network-footer"><span>Scenario workspace v1 · Network schema v5 · Junction Design schema v6 · Thailand left-hand traffic</span><span>{currentScenario.name} · Concept design · no traffic analysis / simulation</span></footer>
  </main>;
}
