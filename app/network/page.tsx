'use client';
import {useEffect,useRef,useState} from 'react';
import {GitBranch,Link2,Map,Minus,MousePointer2,Plus,RotateCw,Trash2,Undo2,Redo2,Maximize2,Move,Network} from 'lucide-react';
import '../junction/style.css';
import './style.css';
import MapBackground,{IMAGERY_BASEMAP_OPTIONS,MAP_PROVIDER_CREDENTIALS_STORAGE,MAP_REFERENCE_STORAGE,STREET_BASEMAP_OPTIONS,basemapAccessLabel,basemapCredentialKey,basemapDescription,basemapKind,mapProviderCredentialsDefaults,mapReferenceDefaults,restoreMapProviderCredentials,restoreMapReference,searchMapPlaces,searchOpenAerialMapImagery,type MapBasemap,type MapPlace,type MapProviderCredentials,type MapReference,type OamImagerySummary} from '../junction/map-background';
import LocalImageReferenceLayer,{clearLocalImageBlob,loadLocalImageBlob,readLocalImageDimensions,saveLocalImageBlob} from './local-reference-layer';
import {LOCAL_IMAGE_REFERENCE_STORAGE,calibrateLocalImageReference,initialLocalImageReference,localImageFootprint,localImageReferenceDefaults,restoreLocalImageReference,type LocalImageReference} from '@/lib/local-reference';
import {clampZoom,panZoom2D} from '../junction/gestures';
import {NetworkDrawing,type NetworkSelection} from './network-drawing';
import {pocketsFor,sectionFor,type Band,type Direction} from '../junction/model';
import type {Selection} from '../junction/selection';
import NetworkScene3D from './network-scene3d';
import NetworkSectionDock from './network-section-dock';
import {
  NETWORK_EDIT_JUNCTION_STORAGE,NETWORK_PROJECT_STORAGE,addJunction,addLinkStationComponent,connectPorts,createNetworkProject,defaultLinkLaneTransition,insertLinkVia,junctionById,linkControlPoints,linkIssues,linkLaneCounts,linkLaneTransitionPossible,linkLength,linkLinearTransitionPossible,linkWidthTargets,moveJunction,moveLinkVia,portKey,portPoint,
  projectBounds,removeJunction,removeLink,removeLinkStationComponent,removeLinkVia,restoreNetworkProject,rotateJunction,setJunctionArmEnabled,transformNetworkProject,updateJunctionArmBasics,updateJunctionArmGeometry,updateJunctionArmPocket,updateJunctionArmSection,updateJunctionDesign,updateLinkLaneTransition,updateLinkSectionProfile,updateLinkStationComponent,updateLinkViaRadius,worldJunctionRotation,type LinkDirection,type LinkStationComponentPatch,type LinkWidthTarget,type NetworkProject,type PortRef,type WorldPoint
} from '@/lib/network-project';

type Tool='select'|'junction'|'link'|'pan'|'map-align'|'image-align'|'image-calibrate'|'delete';
type ArmDragState={kind:'arm';id:string;armId:number;before:NetworkProject;startPointer:WorldPoint;startEndpoint:WorldPoint};
type Drag=
  |{kind:'pan';start:{x:number;y:number};pan:{x:number;y:number}}
  |{kind:'junction';id:string;before:NetworkProject;offset:WorldPoint}
  |{kind:'network-align';before:NetworkProject;start:WorldPoint}
  |{kind:'local-image';start:WorldPoint;center:WorldPoint}
  |ArmDragState
  |{kind:'link-via';id:string;index:number;before:NetworkProject}
  |null;
type ArmMovePending={drag:ArmDragState;point:WorldPoint;shiftKey:boolean};
type ArmGuideHint={kind:'angle'|'parallel'|'snap';worldAngle:number;label:string};
type ArmDragGuide={junctionId:string;armId:number;worldAngle:number;localAngle:number;length:number;snapped:boolean;hint:ArmGuideHint|null};

const NETWORK_VIEW_SPAN=600,NETWORK_MIN_ZOOM=.2,NETWORK_MAX_ZOOM=5.5;
const linkWidthTargetLabel:Record<LinkWidthTarget,string>={walk:'ทางเท้า',bike:'จักรยาน',buffer:'Buffer',shoulder:'ไหล่ทาง',motorcycle:'มอเตอร์ไซค์'};
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
  ['pan','เลื่อนมุมมอง',Move],
  ['delete','ลบ',Trash2]
];

export default function NetworkWorkspace(){
  const [project,setProject]=useState<NetworkProject>(createNetworkProject),[selection,setSelection]=useState<NetworkSelection>({kind:'junction',id:'J-1'}),
    [tool,setTool]=useState<Tool>('select'),[pendingPort,setPendingPort]=useState<PortRef|null>(null),[selectedArm,setSelectedArm]=useState<number|null>(null),[selectedDirection,setSelectedDirection]=useState<Direction>('incoming'),[selectedLinkVertex,setSelectedLinkVertex]=useState<number|null>(null),
    [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[notice,setNotice]=useState('เลือกทางแยกแล้วลากจุดกลางเพื่อย้ายทั้งทางแยก'),
    [past,setPast]=useState<NetworkProject[]>([]),[future,setFuture]=useState<NetworkProject[]>([]),
    [mapReference,setMapReference]=useState<MapReference>(mapReferenceDefaults),[mapCredentials,setMapCredentials]=useState<MapProviderCredentials>(mapProviderCredentialsDefaults),[view,setView]=useState<'2d'|'3d'>('2d'),
    [linkCursor,setLinkCursor]=useState<WorldPoint|null>(null),[mapQuery,setMapQuery]=useState(''),[mapPlaces,setMapPlaces]=useState<MapPlace[]>([]),[mapSearching,setMapSearching]=useState(false),
    [oamSummary,setOamSummary]=useState<OamImagerySummary|null>(null),[oamSearching,setOamSearching]=useState(false),[oamError,setOamError]=useState(false),
    [inspectorOpen,setInspectorOpen]=useState(true),[armGuide,setArmGuide]=useState<ArmDragGuide|null>(null),[mapAlignRotation,setMapAlignRotation]=useState(0),
    [localReference,setLocalReference]=useState<LocalImageReference>(localImageReferenceDefaults),[localImageUrl,setLocalImageUrl]=useState<string|null>(null),
    [calibrationPoints,setCalibrationPoints]=useState<WorldPoint[]>([]),[calibrationDistance,setCalibrationDistance]=useState(20);
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag>(null),projectRef=useRef(project),storageReady=useRef(false),fieldBefore=useRef<NetworkProject|null>(null),
    pastRef=useRef<NetworkProject[]>([]),futureRef=useRef<NetworkProject[]>([]),armMoveFrame=useRef<number|null>(null),armMovePending=useRef<ArmMovePending|null>(null),
    localImageInput=useRef<HTMLInputElement>(null),localImageUrlRef=useRef<string|null>(null);

  const viewWidthMeters=NETWORK_VIEW_SPAN/zoom,scaleMeters=niceScaleMeters(viewWidthMeters*.18),scaleWidthPercent=scaleMeters/viewWidthMeters*100;
  useEffect(()=>{projectRef.current=project;},[project]);
  useEffect(()=>{
    let active=true;
    try{
      localStorage.removeItem(NETWORK_EDIT_JUNCTION_STORAGE);
      const restoredProject=restoreNetworkProject(localStorage.getItem(NETWORK_PROJECT_STORAGE)),restoredMap=restoreMapReference(localStorage.getItem(MAP_REFERENCE_STORAGE)),restoredCredentials=restoreMapProviderCredentials(localStorage.getItem(MAP_PROVIDER_CREDENTIALS_STORAGE)),restoredLocalReference=restoreLocalImageReference(localStorage.getItem(LOCAL_IMAGE_REFERENCE_STORAGE));
      queueMicrotask(()=>{if(!active)return;storageReady.current=true;setProject(restoredProject);setMapReference(restoredMap);setMapCredentials(restoredCredentials);setLocalReference(restoredLocalReference);});
    }catch{storageReady.current=true;}
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!storageReady.current||drag.current)return;try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(project));}catch{}},[project]);
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

  const localImageSize=localImageFootprint(localReference),calibrationMeasured=calibrationPoints.length===2?Math.hypot(calibrationPoints[1].x-calibrationPoints[0].x,calibrationPoints[1].y-calibrationPoints[0].y):null,
    mapKind=basemapKind(mapReference.basemap),mapCredentialKey=basemapCredentialKey(mapReference.basemap),
    selectedJunction=selection?.kind==='junction'?junctionById(project,selection.id):undefined,
    selectedLink=selection?.kind==='link'?project.links.find(l=>l.id===selection.id):undefined,
    selectedArmData=selectedJunction&&selectedArm!==null&&selectedJunction.design.enabled[selectedArm]?selectedJunction.design.arms[selectedArm]:undefined,
    selectedSection=selectedArmData?sectionFor(selectedArmData,selectedDirection):undefined,
    selectedPockets=selectedArmData?pocketsFor(selectedArmData,selectedDirection):undefined,
    selectedIssues=selectedLink?linkIssues(project,selectedLink):[],
    selectedVia=selectedLink&&selectedLinkVertex!==null?selectedLink.via[selectedLinkVertex]:undefined,
    linearTransitionPossible=selectedLink?linkLinearTransitionPossible(project,selectedLink):false;

  function setProjectNow(next:NetworkProject){projectRef.current=next;setProject(next);}
  function persistProjectSnapshot(next:NetworkProject){if(!storageReady.current)return;try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(next));}catch{}}
  function remember(before:NetworkProject){
    const nextPast=[...pastRef.current.slice(-39),before];
    pastRef.current=nextPast;futureRef.current=[];setPast(nextPast);setFuture([]);
  }
  function commit(next:NetworkProject,before=projectRef.current){
    if(next===before)return;
    remember(before);setProjectNow(next);
  }
  function undo(){
    const history=pastRef.current,previous=history.at(-1);if(!previous)return;
    const nextPast=history.slice(0,-1),nextFuture=[projectRef.current,...futureRef.current.slice(0,39)];
    pastRef.current=nextPast;futureRef.current=nextFuture;setPast(nextPast);setFuture(nextFuture);setProjectNow(previous);
    setSelection(null);setPendingPort(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);
  }
  function redo(){
    const next=futureRef.current[0];if(!next)return;
    const nextPast=[...pastRef.current.slice(-39),projectRef.current],nextFuture=futureRef.current.slice(1);
    pastRef.current=nextPast;futureRef.current=nextFuture;setPast(nextPast);setFuture(nextFuture);setProjectNow(next);
    setSelection(null);setPendingPort(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);
  }
  function point(e:{clientX:number;clientY:number}){const matrix=svg.current?.getScreenCTM();if(!matrix)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y};}
  function choose(next:Tool){setTool(next);setArmGuide(null);if(next==='map-align'){setView('2d');if(!mapReference.enabled)setMapReference(v=>({...v,enabled:true}));}if(next==='image-align'||next==='image-calibrate'){setView('2d');if(localImageUrl)setLocalReference(v=>({...v,enabled:true}));}if(next==='image-calibrate')setCalibrationPoints([]);if(next!=='link'){setPendingPort(null);setLinkCursor(null);}if(next!=='select'){setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}setNotice(next==='junction'?'คลิกตำแหน่งบนแผนเพื่อสร้าง Junction instance':next==='link'?'คลิก port ต้นทาง แล้วเลือก port ปลายทาง · ระบบจะแสดงแนว preview':next==='pan'?'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง':next==='map-align'?'ลากพื้นที่ว่างเพื่อย้าย Network ทั้งชุดบนแผนที่ · Design v6 ภายในไม่เปลี่ยน':next==='image-align'?'ลากบน canvas เพื่อย้ายภาพอ้างอิง · engineering geometry ไม่เปลี่ยน':next==='image-calibrate'?'คลิกจุด A และ B บนภาพอ้างอิง แล้ว Apply ตามระยะจริงที่กำหนด':next==='delete'?'คลิกวัตถุเพื่อลบ หรือกด Delete':'เลือกวัตถุ · ลาก Arm อิสระ หรือกด Shift ระหว่างลากเพื่อ snap 15°');}
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
    const b=projectBounds(project),center={x:b.x+b.w/2,y:b.y+b.h/2},
      next=clampZoom(NETWORK_VIEW_SPAN/Math.max(b.w,b.h)*.9,NETWORK_MIN_ZOOM,Math.min(4.5,NETWORK_MAX_ZOOM));
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
    if(current.kind==='arm'){scheduleArmMove(current,p,e.shiftKey);return;}
    const next=moveJunction(projectRef.current,current.id,{x:p.x+current.offset.x,y:p.y+current.offset.y});
    setProjectNow(next);
  }
  function endPointer(e:React.PointerEvent<SVGSVGElement>){
    const current=drag.current;
    if(current?.kind==='arm'){
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
    if(current?.kind==='junction'||current?.kind==='link-via'||current?.kind==='network-align'){
      const after=projectRef.current;
      if(after!==current.before){
        remember(current.before);persistProjectSnapshot(after);
        setNotice(current.kind==='junction'?'ย้ายทั้งทางแยกแล้ว · Road Link ปรับปลายตาม port อัตโนมัติ':current.kind==='network-align'?'ย้าย Network ทั้งชุดแล้ว · Junction Design v6 ไม่ถูกแก้ และ RoadLink via points เคลื่อนแบบ rigid transform':'ปรับแนว Road Link แล้ว · endpoints ยังคงผูกกับ Junction ports');
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
    if(tool!=='select')return;setSelection({kind:'junction',id});setSelectedArm(armId);setSelectedDirection('incoming');setSelectedLinkVertex(null);const junction=junctionById(projectRef.current,id),arm=junction?.design.arms[armId];if(arm)setNotice(arm.name+' · ลากได้จากตัวแขนหรือ grip ที่ปลาย · Shift = snap 15°');
  }
  function startArmMove(id:string,armId:number,e:React.PointerEvent<SVGElement>){
    if(tool!=='select')return;
    e.preventDefault();
    const junction=junctionById(projectRef.current,id),arm=junction?.design.arms[armId];if(!junction||!arm)return;
    if(armMoveFrame.current!==null){cancelAnimationFrame(armMoveFrame.current);armMoveFrame.current=null;}armMovePending.current=null;
    const startPointer=point(e),startEndpoint=portPoint(junction,armId);
    setSelection({kind:'junction',id});setSelectedArm(armId);setSelectedDirection('incoming');setSelectedLinkVertex(null);
    drag.current={kind:'arm',id,armId,before:projectRef.current,startPointer,startEndpoint};
    const worldAngle=normalizeAngle(worldJunctionRotation(junction)+arm.angle);
    setArmGuide({junctionId:id,armId,worldAngle,localAngle:arm.angle,length:arm.length,snapped:false,hint:nearestArmGuide(projectRef.current,id,armId,worldAngle)});
    setNotice(arm.name+' · กำลังลากแบบ direct manipulation · Shift = snap 15°');
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
  function selectObject(next:NetworkSelection){
    if(!next)return;
    if(tool==='delete'){
      const before=projectRef.current,after=next.kind==='junction'?removeJunction(before,next.id):removeLink(before,next.id);
      commit(after,before);setSelection(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);return;
    }
    const changedLink=next.kind==='link'&&!(selection?.kind==='link'&&selection.id===next.id);
    setSelection(next);setSelectedArm(null);setSelectedDirection('incoming');if(next.kind!=='link'||changedLink)setSelectedLinkVertex(null);
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
    deleteSelection();
  }
  function deleteSelection(){
    if(!selection)return;const before=projectRef.current,after=selection.kind==='junction'?removeJunction(before,selection.id):removeLink(before,selection.id);commit(after,before);setSelection(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);
  }
  function reset(){const before=projectRef.current,next=createNetworkProject();commit(next,before);setSelection({kind:'junction',id:'J-1'});setPan({x:0,y:0});setZoom(1);setPendingPort(null);setLinkCursor(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setNotice('คืนค่า Network Foundation demo แล้ว');}

  return <main className="network-workspace" tabIndex={-1} onKeyDown={e=>{if((e.target as HTMLElement).matches('input,select,button'))return;if(e.key==='Delete')deleteContext();if(e.key==='Escape'){setPendingPort(null);setLinkCursor(null);choose('select');}if(e.key.toLowerCase()==='i'&&!e.ctrlKey&&!e.metaKey){setInspectorOpen(v=>!v);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}}}>
    <header className="network-header">
      <div className="network-brand"><Network size={21}/><div><b>Thai Street Designer</b><span>Network Concept Workspace</span></div></div>
      <div className="network-header-actions"><button data-network-action="undo" onClick={undo} disabled={!past.length}><Undo2 size={15}/> Undo</button><button data-network-action="redo" onClick={redo} disabled={!future.length}><Redo2 size={15}/> Redo</button><button data-network-action="fit" onClick={fit}><Maximize2 size={15}/> Fit</button><button onClick={reset}>Reset demo</button></div>
    </header>
    <div className={'network-body'+(!inspectorOpen?' inspector-collapsed':'')} data-network-inspector={inspectorOpen?'open':'closed'}>
      <aside className="network-tools">{tools.map(([id,label,Icon])=><button key={id} data-network-tool={id} className={tool===id?'active':''} title={label} onClick={()=>choose(id)}><Icon size={20}/><span>{label}</span></button>)}</aside>
      <section className="network-canvas-wrap">
        <div className="network-viewbar"><div><b>{project.title}</b><span>{project.junctions.length} junctions · {project.links.length} road links</span></div><div className="network-view-mode"><button data-network-view="2d" className={view==='2d'?'active':''} onClick={()=>setView('2d')}>2D Network</button><button data-network-view="3d" className={view==='3d'?'active':''} onClick={()=>setView('3d')}>3D Overview</button></div><div className="network-view-links"><button data-network-action="toggle-inspector" aria-pressed={inspectorOpen} onClick={()=>setInspectorOpen(v=>!v)}>{inspectorOpen?'Hide Inspector':'Inspector'}</button><a href="junction/">Junction detail</a><a href="roads/">Road alignment lab</a></div></div>
        <div className="network-canvas">
          {view==='2d'&&<MapBackground reference={mapReference} credentials={mapCredentials} view={{zoom,pan,span:NETWORK_VIEW_SPAN,minZoom:NETWORK_MIN_ZOOM}}/>}
          {view==='2d'&&<LocalImageReferenceLayer reference={localReference} imageUrl={localImageUrl} view={{zoom,pan,span:NETWORK_VIEW_SPAN,minZoom:NETWORK_MIN_ZOOM}}/>}
          <svg ref={svg} data-network-plan="true" data-network-view-span={NETWORK_VIEW_SPAN} data-network-zoom={zoom.toFixed(4)} className={view==='3d'?'network-plan-hidden':''} viewBox={[(-NETWORK_VIEW_SPAN/2/zoom+pan.x),(-NETWORK_VIEW_SPAN/2/zoom+pan.y),(NETWORK_VIEW_SPAN/zoom),(NETWORK_VIEW_SPAN/zoom)].join(' ')}
            onPointerDown={canvasDown} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
            onWheel={e=>{e.preventDefault();zoomAt(e.deltaY>0?.88:1.14,{x:e.clientX,y:e.clientY});}}>
            <defs><pattern id="network-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" stroke="#d8e2e6" strokeWidth=".12" fill="none"/></pattern></defs>
            <rect data-network-background="true" x="-5000" y="-5000" width="10000" height="10000" fill={mapReference.enabled||(localReference.enabled&&!!localImageUrl)?'transparent':'#edf2f4'}/>
            <rect data-network-grid="true" x="-5000" y="-5000" width="10000" height="10000" fill="url(#network-grid)" opacity={mapReference.enabled||(localReference.enabled&&!!localImageUrl)?0.42:1}/>
            <g data-network-map-align-layer={tool==='map-align'?'disabled':'interactive'} data-network-reference-tool={tool} pointerEvents={['map-align','image-align','image-calibrate'].includes(tool)?'none':'auto'}><NetworkDrawing project={project} zoom={zoom} selection={selection} selectedArm={selectedArm} linkMode={tool==='link'} pendingPort={pendingPort} selectedLinkVertex={selectedLinkVertex} onSelect={selectObject} onArmSelect={selectArm} onJunctionMoveStart={startJunctionMove} onArmMoveStart={startArmMove} onLinkInsertVertex={insertLinkVertexAt} onLinkVertexMoveStart={startLinkVertexMove} onLinkVertexSelect={setSelectedLinkVertex} onPort={selectPort}/></g>
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
          {view==='2d'&&tool==='select'&&(selectedArmData||selectedLink||selectedJunction)&&<div className="network-context-bar" data-network-context-kind={selectedArmData?'arm':selectedLink?'link':'junction'}>
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
          </div>}
          {view==='2d'&&<div className="network-scale" data-network-scale-meters={scaleMeters} style={{width:`${scaleWidthPercent}%`}}><span>{scaleMeters>=1000?(scaleMeters/1000)+' km':scaleMeters+' m'}</span><div className="network-scale-bar"/></div>}
          <div className="network-zoom" hidden={view==='3d'} data-network-zoom-value={zoom.toFixed(4)}>
            <button data-network-zoom-action="in" title="Zoom in" onClick={()=>zoomAt(1.18)}><Plus size={16}/></button>
            <button className="network-zoom-value" data-network-zoom-action="reset" title="กลับสู่ 100%" onClick={()=>zoomAt(1/zoom)}>{Math.round(zoom*100)}%</button>
            <button data-network-zoom-action="out" title="Zoom out" onClick={()=>zoomAt(.84)}><Minus size={16}/></button>
            <button data-network-zoom-action="fit" title="Fit network" onClick={fit}><Maximize2 size={15}/></button>
          </div>
          <div className="network-status">{notice}</div>
        </div>
        {view==='2d'&&<NetworkSectionDock project={project} junction={selectedJunction} armId={selectedArm} link={selectedLink} onJunctionEdit={editFromNetworkSection}/>}
      </section>
      <aside className={'network-inspector'+(!inspectorOpen?' is-hidden':'')}>
        <div className="network-inspector-title"><span>NETWORK OBJECT</span><b>{selectedJunction?.name??selectedLink?.name??'ยังไม่ได้เลือกวัตถุ'}</b></div>
        {selectedJunction&&<section>
          <p className="network-object-type">Junction Instance · {selectedJunction.id}</p>
          <div className="network-arm-tabs" aria-label="เลือกขาถนน">{selectedJunction.design.enabled.map((enabled,armId)=>enabled?<button key={armId} className={selectedArm===armId?'active':''} onClick={()=>selectArm(selectedJunction.id,armId)}>{selectedJunction.design.arms[armId].name||('Arm '+(armId+1))}</button>:null)}</div>
          <div className="network-leg-config"><span>ขาทางแยก</span>{selectedJunction.design.enabled.map((enabled,armId)=><label key={armId} className={enabled?'active':''}><input type="checkbox" checked={enabled} onChange={e=>toggleJunctionArm(armId,e.target.checked)}/>{selectedJunction.design.arms[armId].name||('Arm '+(armId+1))}</label>)}</div>
          <label>ชื่อทางแยก<input value={selectedJunction.name} onFocus={beginFieldEdit} onChange={e=>{const before=projectRef.current,next={...before,junctions:before.junctions.map(j=>j.id===selectedJunction.id?{...j,name:e.target.value}:j)};setProjectNow(next);}} onBlur={finishFieldEdit}/></label>
          <div className="network-coords"><label>X (m)<input key={'x-'+selectedJunction.id+'-'+selectedJunction.x} type="number" defaultValue={+selectedJunction.x.toFixed(2)} onFocus={beginFieldEdit} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setProjectNow(moveJunction(projectRef.current,selectedJunction.id,{x:n,y:selectedJunction.y}));}} onBlur={finishFieldEdit}/></label><label>Y (m)<input key={'y-'+selectedJunction.id+'-'+selectedJunction.y} type="number" defaultValue={+selectedJunction.y.toFixed(2)} onFocus={beginFieldEdit} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setProjectNow(moveJunction(projectRef.current,selectedJunction.id,{x:selectedJunction.x,y:n}));}} onBlur={finishFieldEdit}/></label></div>
          <label>หมุน Junction ใน world (°)<input key={'rotation-'+selectedJunction.id+'-'+selectedJunction.rotation} type="number" min="0" max="359" step="1" defaultValue={Math.round(selectedJunction.rotation)} onFocus={beginFieldEdit} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setProjectNow(rotateJunction(projectRef.current,selectedJunction.id,n));}} onBlur={finishFieldEdit}/></label>
          <div className="network-inline-actions"><button onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation-15),before);}}><RotateCw size={14}/> −15°</button><button onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation+15),before);}}><RotateCw size={14}/> +15°</button></div>
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
        {selectedLink&&<section>
          <p className="network-object-type">Road Link · {selectedLink.id}</p>
          <div className="network-link-metrics"><span>Resolved alignment <b>{linkLength(project,selectedLink).toFixed(1)} m</b></span><span>PI / via points <b>{selectedLink.via.length}</b></span></div>
          <div className="network-inline-actions"><button data-network-link-action="add-pi" onClick={addSelectedLinkPi}>＋ PI / จุดแนว</button><button data-network-link-action="remove-pi" disabled={selectedLinkVertex===null} onClick={removeSelectedLinkPi}>ลบ PI</button></div>
          {selectedVia&&selectedLinkVertex!==null&&<div className="network-link-editor"><div className="network-arm-editor-head"><span>CURVE AT PI {selectedLinkVertex+1}</span><b>R {selectedVia.radius.toFixed(0)} m</b></div><div className="network-step-row"><span>รัศมีโค้ง</span><button disabled={selectedVia.radius<=0} onClick={()=>adjustSelectedViaRadius(-5)}>−</button><b>{selectedVia.radius.toFixed(0)} m</b><button disabled={selectedVia.radius>=200} onClick={()=>adjustSelectedViaRadius(5)}>＋</button></div><button className="network-map-reset" disabled={selectedVia.radius===0} onClick={()=>{const before=projectRef.current;commit(updateLinkViaRadius(before,selectedLink.id,selectedLinkVertex,0),before);}}>ใช้มุม PI ตรง (R0)</button><p className="network-note">ระบบ clamp รัศมีตามระยะ tangent ที่มีจริง เพื่อไม่ให้โค้งล้ำ PI ข้างเคียง</p></div>}
          <div className="network-link-profile"><div className="network-arm-editor-head"><span>SECTION CONTINUITY</span><b>{selectedLink.sectionProfile.mode==='linear'?(linearTransitionPossible?'Linear transition':'Linear · needs topology'):'Review mismatch'}</b></div>
            {(['forward','backward'] as LinkDirection[]).map(direction=>{const counts=linkLaneCounts(project,selectedLink,direction);if(!counts||counts.from===counts.to)return null;const key=direction==='forward'?'forwardLaneTransition':'backwardLaneTransition',transition=selectedLink.sectionProfile[key],possible=linkLaneTransitionPossible(project,selectedLink,direction),label=direction==='forward'?'ทิศไป FROM → TO':'ทิศกลับ TO → FROM';return <div key={direction} className="network-lane-transition"><div className="network-pocket-title"><span>{label}</span><b>{counts.from} → {counts.to} เลน</b></div>{possible?<><div className="network-transition-side"><button data-network-transition-side={direction+'-curb'} className={transition?.side==='curb'?'active':''} onClick={()=>{const before=projectRef.current;commit(defaultLinkLaneTransition(before,selectedLink,direction,'curb'),before);setNotice('กำหนด lane transition ฝั่งริมทางแล้ว');}}>ริมทาง / Curb</button><button data-network-transition-side={direction+'-median'} className={transition?.side==='median'?'active':''} onClick={()=>{const before=projectRef.current;commit(defaultLinkLaneTransition(before,selectedLink,direction,'median'),before);setNotice('กำหนด lane transition ฝั่งชิดเกาะกลางแล้ว');}}>ชิดเกาะกลาง / Median</button></div>{transition&&<><div className="network-step-row"><span>กึ่งกลาง Station</span><button onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,center:Math.max(0,transition.center-10)}),before);}}>−</button><b>{transition.center.toFixed(0)} m</b><button onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,center:transition.center+10}),before);}}>＋</button></div><div className="network-step-row"><span>Transition length</span><button disabled={transition.length<=3} onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,length:Math.max(3,transition.length-5)}),before);}}>−</button><b>{transition.length.toFixed(0)} m</b><button onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,{...transition,length:transition.length+5}),before);}}>＋</button></div><button className="network-map-reset" onClick={()=>{const before=projectRef.current;commit(updateLinkLaneTransition(before,selectedLink.id,direction,null),before);}}>ล้าง lane transition</button></>}</>:<p className="network-note">รุ่นนี้รองรับ transition ทีละ 1 เลน และต้องมีอย่างน้อย 1 เลนทั้งสองปลาย กรณีนี้ยังคงเป็น unresolved topology.</p>}</div>;})}
            <label>การต่อหน้าตัด<select data-network-section-mode="link" value={selectedLink.sectionProfile.mode} onChange={e=>{const before=projectRef.current,next=updateLinkSectionProfile(before,selectedLink.id,e.target.value as 'review'|'linear');if(next===before&&e.target.value==='linear'){setNotice('ใช้ Linear transition ไม่ได้จนกว่าจะกำหนด lane transition และชนิด edge bands ให้สอดคล้อง');return;}if(next===before&&e.target.value==='review'&&selectedLink.components.length){setNotice('กลับ Review ไม่ได้ขณะที่ยังมี station components · ลบ components ก่อน');return;}commit(next,before);setNotice(e.target.value==='linear'?'เปิด resolved section transition แล้ว':'กลับเป็นโหมดตรวจ mismatch แล้ว');}}><option value="review">Review mismatch</option><option value="linear" disabled={!linearTransitionPossible}>Resolved geometric transition</option></select></label><p className="network-note">ระบบไม่เดาฝั่งเพิ่ม/ลดเลน ต้องเลือก Curb หรือ Median ต่อทิศทางก่อน ส่วน lane width, median, sidewalk และ band widths จะ interpolate ต่อเนื่องเมื่อเปิด Resolved geometric transition.</p></div>
          <div className="network-station-components" data-network-station-components="true"><div className="network-arm-editor-head"><span>STATION COMPONENTS</span><b>{selectedLink.components.length} รายการ</b></div><div className="network-station-add"><button data-network-station-add="lane" disabled={selectedLink.sectionProfile.mode!=='linear'||!linearTransitionPossible} onClick={()=>addSelectedStationComponent('lane')}>＋ Auxiliary lane</button><button data-network-station-add="width" disabled={selectedLink.sectionProfile.mode!=='linear'||!linearTransitionPossible} onClick={()=>addSelectedStationComponent('width')}>＋ Edge width zone</button></div>{selectedLink.components.length===0?<p className="network-note">เพิ่ม lifecycle ตาม station ได้เมื่อ Link อยู่ใน Resolved geometric transition. Auxiliary lane ใช้ความกว้างเลนหลัก ณ station นั้น; Edge width ใช้กับทางเท้าหรือ band ที่ต่อเนื่องจากปลาย Link.</p>:<div className="network-station-component-list">{selectedLink.components.map(component=>{const targets=linkWidthTargets(project,selectedLink,component.direction);return <div key={component.id} className="network-station-component-card" data-network-station-component={component.kind}><div className="network-station-component-title"><div><span>{component.kind==='lane'?'AUX LANE':'EDGE WIDTH'}</span><b>{component.id}</b></div><button onClick={()=>removeSelectedStationComponent(component.id)}>ลบ</button></div><div className="network-station-grid"><label>Direction<select value={component.direction} onChange={e=>editSelectedStationComponent(component.id,{direction:e.target.value as LinkDirection})}><option value="forward">FROM → TO</option><option value="backward">TO → FROM</option></select></label>{component.kind==='lane'?<label>Side<select value={component.side} onChange={e=>editSelectedStationComponent(component.id,{side:e.target.value as 'curb'|'median'})}><option value="curb">Curb side</option><option value="median">Median side</option></select></label>:<><label>Target<select value={component.target} onChange={e=>editSelectedStationComponent(component.id,{target:e.target.value as LinkWidthTarget})}>{targets.map(target=><option key={target} value={target}>{linkWidthTargetLabel[target]}</option>)}</select></label><label>Δ width (m)<input key={component.id+'-delta-'+component.delta} type="number" step=".25" defaultValue={component.delta} onBlur={e=>editSelectedStationComponent(component.id,{delta:Number(e.currentTarget.value)})}/></label></>}<label>Start (m)<input key={component.id+'-start-'+component.start} type="number" min="0" step=".5" defaultValue={component.start} onBlur={e=>editSelectedStationComponent(component.id,{start:Number(e.currentTarget.value)})}/></label><label>End (m)<input key={component.id+'-end-'+component.end} type="number" min=".5" step=".5" defaultValue={component.end} onBlur={e=>editSelectedStationComponent(component.id,{end:Number(e.currentTarget.value)})}/></label><label>Taper in (m)<input key={component.id+'-tin-'+component.taperIn} type="number" min="0" step=".5" defaultValue={component.taperIn} onBlur={e=>editSelectedStationComponent(component.id,{taperIn:Number(e.currentTarget.value)})}/></label><label>Taper out (m)<input key={component.id+'-tout-'+component.taperOut} type="number" min="0" step=".5" defaultValue={component.taperOut} onBlur={e=>editSelectedStationComponent(component.id,{taperOut:Number(e.currentTarget.value)})}/></label></div></div>;})}</div>}<p className="network-note">ข้อมูลชุดนี้ persist ใน Network schema v3 และเป็น semantic RoadLink state. 2D, section dock และ 3D resolve จาก station-profile เดียวกัน; ไม่มี shape override แยกตาม view.</p></div>
          <div className="network-link-ends"><span>FROM <b>{portKey(selectedLink.from)}</b></span><span>TO <b>{portKey(selectedLink.to)}</b></span></div>
          {selectedIssues.length?<div className="network-issues">{selectedIssues.map((issue,i)=><p key={i}>! {issue.message}</p>)}</div>:<p className="network-ok">Road Link continuity resolved ในขอบเขต schema v3</p>}
          <p className="network-note">ดับเบิลคลิกบน Road Link เพื่อเพิ่ม PI แล้วลาก PI เพื่อเปลี่ยน alignment. R0 = polyline เดิม; R&gt;0 = tangent–arc–tangent ที่ resolve จาก geometry เดียวกันใน plan, Fit และ length.</p>
        </section>}
        {!selection&&<section><p className="network-note">เลือก Junction หรือ Road Link บนแผน หรือใช้เครื่องมือ “ทางแยก” เพื่อสร้าง instance ใหม่ และ “เชื่อมถนน” เพื่อเชื่อม arm-to-arm.</p></section>}
        <section className="network-map-panel"><h3><Map size={15}/> แผนที่อ้างอิง</h3><label className="network-switch"><input type="checkbox" checked={mapReference.enabled} onChange={e=>setMapReference(v=>({...v,enabled:e.target.checked}))}/> แสดงแผนที่</label>{mapReference.enabled&&<><div className="network-map-search"><input type="search" placeholder="ค้นหาสถานที่ / ถนน / ทางแยก" value={mapQuery} onChange={e=>setMapQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void findPlace();}}}/><button disabled={mapSearching||mapQuery.trim().length<2} onClick={()=>void findPlace()}>{mapSearching?'กำลังค้นหา…':'ค้นหา'}</button></div>{!!mapPlaces.length&&<div className="network-map-results">{mapPlaces.map((place,i)=><button key={place.label+i} onClick={()=>{setMapReference(v=>({...v,lat:place.lat,lng:place.lng,offsetX:0,offsetY:0}));setMapPlaces([]);setMapQuery(place.label);setNotice('ย้ายแผนที่อ้างอิงไปยัง '+place.label);}}>{place.label}</button>)}</div>}<div className="network-map-source" aria-label="ชนิดพื้นแผนที่"><button data-network-map-source="street" className={mapKind==='street'?'active':''} onClick={()=>setMapReference(v=>({...v,basemap:'positron'}))}>Street / Map</button><button data-network-map-source="imagery" className={mapKind==='imagery'?'active':''} onClick={()=>setMapReference(v=>({...v,basemap:'oam-global'}))}>Aerial / Satellite</button></div><label>Provider<select value={mapReference.basemap} onChange={e=>setMapReference(v=>({...v,basemap:e.target.value as MapBasemap}))}>{Object.entries(mapKind==='street'?STREET_BASEMAP_OPTIONS:IMAGERY_BASEMAP_OPTIONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="map-provider-meta"><span className="map-access-badge">{basemapAccessLabel(mapReference.basemap)}</span><span>{basemapDescription(mapReference.basemap)}</span></div>{mapReference.basemap==='oam-global'&&<div className="map-oam-status" data-oam-coverage-status={oamSearching?'loading':oamError?'error':oamSummary?'ready':'idle'}>{oamSearching?'กำลังตรวจ OpenAerialMap รอบจุดนี้…':oamError?'ตรวจ catalog ไม่สำเร็จ · Global Mosaic ยังเปิดใช้งานได้':oamSummary?(oamSummary.count?'พบ open imagery '+oamSummary.count+' ชุด ภายในรัศมี 3 km'+(oamSummary.latest?' · ล่าสุด '+new Date(oamSummary.latest).toLocaleDateString('th-TH'):'')+(oamSummary.bestGsd!==null?' · GSD ดีที่สุดในตัวอย่าง ~'+oamSummary.bestGsd.toFixed(oamSummary.bestGsd<1?2:1)+' m':''):'ยังไม่พบ OpenAerialMap imagery ภายในรัศมี 3 km · ลอง provider อื่นหรือย้ายตำแหน่ง'):''}</div>}{mapCredentialKey&&<div className="network-map-credential"><label>{mapCredentialKey==='esri'?'ArcGIS / Esri API key':'MapTiler API key'}<input type="password" autoComplete="off" value={mapCredentials[mapCredentialKey]} placeholder="ใส่ key ของคุณ" onChange={e=>setMapCredentials(v=>({...v,[mapCredentialKey]:e.target.value}))}/></label><p className="network-note">เก็บเฉพาะใน browser นี้ ไม่เข้า Project JSON · ควรจำกัด key ให้ใช้ได้เฉพาะ origin bokoboss.github.io</p></div>}<div className="network-coords"><label>Lat<input type="number" step=".00001" value={mapReference.lat} onChange={e=>setMapReference(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Lng<input type="number" step=".00001" value={mapReference.lng} onChange={e=>setMapReference(v=>({...v,lng:Number(e.target.value)}))}/></label></div><div className="network-coords"><label>Offset X (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetX.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetX:n}));}}/></label><label>Offset Y (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetY.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetY:n}));}}/></label></div><div className="network-map-align" data-network-map-align="true"><div className="network-map-align-head"><span>MAP ALIGN</span><b>Rigid Network Transform</b></div><p className="network-note">ล็อกแผนที่ไว้ แล้วลาก Network ทั้งชุดเพื่อจัดตำแหน่งจริงใน world metres. การย้าย/หมุนจะเปลี่ยนเฉพาะ Junction instance + RoadLink via points ไม่แก้ geometry ภายใน Design v6.</p><div className="network-map-align-actions"><button data-network-map-align-action="drag" className={tool==='map-align'?'active':''} onClick={()=>choose(tool==='map-align'?'select':'map-align')}>{tool==='map-align'?'เสร็จสิ้นการลาก':'ลาก Network บนแผนที่'}</button><div className="network-map-align-rotation"><label>หมุนทั้ง Network Δ°<input type="number" step=".1" value={mapAlignRotation} onChange={e=>setMapAlignRotation(Number(e.target.value))}/></label><button data-network-map-align-action="rotate" disabled={!Number.isFinite(mapAlignRotation)||Math.abs(mapAlignRotation)<1e-6} onClick={rotateNetworkForMapAlignment}>Apply</button></div></div><p className="network-note">การหมุนใช้กึ่งกลาง footprint ปัจจุบันเป็น pivot และบันทึกเป็น Undo 1 ครั้ง. Offset X/Y ด้านบนยังคงเป็น reference-only adjustment สำหรับทดลองซ้อนแผนที่โดยไม่แตะ engineering state.</p></div><label>Opacity<input type="range" min="10" max="100" step="5" value={mapReference.opacity*100} onChange={e=>setMapReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label><label className="network-switch"><input type="checkbox" checked={mapReference.locked} onChange={e=>setMapReference(v=>({...v,locked:e.target.checked}))}/> ล็อกตำแหน่งแผนที่</label><button className="network-map-reset" disabled={mapReference.locked} onClick={()=>setMapReference(v=>({...v,offsetX:0,offsetY:0}))}>คืน Offset เป็น 0</button><p className="network-note">Map และ Network ใช้ world scale เดียวกัน: 1 หน่วย = 1 เมตรบนพื้นดิน · scale bar มุมล่างซ้ายเปลี่ยนตาม zoom อัตโนมัติ · X/Y ใช้จัดแนวโดยไม่แก้ geometry</p>{mapReference.basemap==='oam-global'&&<p className="network-note">OpenAerialMap เป็น local open imagery: ระดับ zoom ต่ำแสดง coverage grid; zoom 14+ จะแสดงภาพจริงในพื้นที่ที่มีข้อมูล.</p>}{mapReference.basemap==='satellite-eox-2016'&&<p className="network-note">Satellite ฟรีชุดนี้เป็น Sentinel-2 cloudless 2016 ความละเอียดต้นฉบับประมาณ 10 m เหมาะสำหรับบริบทพื้นที่ ไม่ใช้แทนภาพ orthophoto สำหรับขอบคันหิน/ช่องจราจร</p>}</>}</section>
        <section className="network-local-reference-panel" data-local-reference-panel="true"><h3><Map size={15}/> Site plan / local image</h3><input ref={localImageInput} type="file" accept="image/png,image/jpeg" hidden onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void importLocalReference(file);}}/><div className="network-local-reference-actions"><button data-local-reference-action="import" onClick={()=>localImageInput.current?.click()}>นำเข้า JPG / PNG</button>{localImageUrl&&<button className="danger" data-local-reference-action="remove" onClick={()=>void removeLocalReference()}>ลบภาพ</button>}</div>{localImageUrl&&localReference.fileName?<><label className="network-switch"><input type="checkbox" checked={localReference.enabled} onChange={e=>setLocalReference(v=>({...v,enabled:e.target.checked}))}/> แสดงภาพอ้างอิง</label><div className="network-local-reference-meta"><b>{localReference.fileName}</b><span>{Math.round(localReference.widthPx)} × {Math.round(localReference.heightPx)} px · {localImageSize.width.toFixed(1)} × {localImageSize.height.toFixed(1)} m · {localReference.calibrated?'CALIBRATED':'UNCALIBRATED'}</span></div><div className="network-coords"><label>Center X (m)<input type="number" step=".5" disabled={localReference.locked} value={+localReference.x.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setLocalReference(v=>({...v,x:n}));}}/></label><label>Center Y (m)<input type="number" step=".5" disabled={localReference.locked} value={+localReference.y.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setLocalReference(v=>({...v,y:n}));}}/></label></div><label>Rotation (°)<input type="number" step=".1" disabled={localReference.locked} value={+localReference.rotation.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setLocalReference(v=>({...v,rotation:normalizeAngle(n)}));}}/></label><label>Opacity<input type="range" min="5" max="100" step="5" value={localReference.opacity*100} onChange={e=>setLocalReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label><label className="network-switch"><input type="checkbox" checked={localReference.locked} onChange={e=>{const locked=e.target.checked;setLocalReference(v=>({...v,locked}));if(locked&&(tool==='image-align'||tool==='image-calibrate'))choose('select');}}/> ล็อกภาพอ้างอิง</label><div className="network-local-reference-actions"><button data-local-reference-action="move" className={tool==='image-align'?'active':''} disabled={localReference.locked||!localReference.enabled} onClick={()=>choose(tool==='image-align'?'select':'image-align')}>{tool==='image-align'?'เสร็จสิ้นการย้าย':'ย้ายภาพบน canvas'}</button><button data-local-reference-action="calibrate" className={tool==='image-calibrate'?'active':''} disabled={localReference.locked||!localReference.enabled} onClick={()=>choose(tool==='image-calibrate'?'select':'image-calibrate')}>{tool==='image-calibrate'?'ยกเลิก A–B':'เลือกจุด A–B'}</button></div><div className="network-local-calibration"><label>ระยะจริง A–B (m)<input type="number" min=".1" step=".1" value={calibrationDistance} onChange={e=>setCalibrationDistance(Number(e.target.value))}/></label><div className="network-local-calibration-status"><span>{calibrationPoints.length===0?'ยังไม่เลือกจุด':calibrationPoints.length===1?'เลือก A แล้ว · รอ B':`ระยะบน canvas ปัจจุบัน ${calibrationMeasured?.toFixed(2)} m`}</span><button data-local-reference-action="apply-calibration" disabled={calibrationPoints.length!==2||!Number.isFinite(calibrationDistance)||calibrationDistance<=0} onClick={applyLocalReferenceCalibration}>Apply calibration</button></div></div><button className="network-map-reset" disabled={localReference.locked} onClick={()=>{const reset=initialLocalImageReference(localReference.fileName,localReference.widthPx,localReference.heightPx,pan,Math.min(360,NETWORK_VIEW_SPAN/zoom*.75));setLocalReference({...reset,enabled:localReference.enabled,opacity:localReference.opacity});setCalibrationPoints([]);setNotice('คืนตำแหน่ง/rotation/scale ของภาพเป็นค่าเริ่มต้นแบบยังไม่ calibrated แล้ว');}}>Reset image transform</button><p className="network-note">ภาพถูกเก็บใน IndexedDB ของ browser นี้ ส่วน scale/ตำแหน่ง/rotation เก็บเป็น reference metadata แยกจาก NetworkProject JSON. Calibration ขยาย/ย่อแบบ uniform โดยยึดจุด A ไว้คงที่ จึงไม่บิด geometry ของภาพ.</p></>:<p className="network-note">นำเข้า site plan, survey export หรือ orthophoto แบบ JPG/PNG แล้วกำหนดระยะจริง A–B เพื่อให้ภาพอยู่ใน world scale หน่วยเมตรเดียวกับ Network. รุ่น 5A.2 ใช้เป็น reference ใน 2D ก่อน.</p>}</section>
        {selection&&<button className="network-delete" onClick={deleteSelection}><Trash2 size={15}/> ลบวัตถุที่เลือก</button>}
      </aside>
    </div>
    <footer className="network-footer"><span>Network schema v3 · Junction Design schema v6 · Thailand left-hand traffic</span><span>Concept design · no traffic analysis / simulation</span></footer>
  </main>;
}
