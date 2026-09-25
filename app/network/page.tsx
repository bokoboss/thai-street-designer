'use client';
import {useEffect,useRef,useState} from 'react';
import {GitBranch,Link2,Map,Minus,MousePointer2,Plus,RotateCw,Trash2,Undo2,Redo2,Maximize2,Move,Network} from 'lucide-react';
import '../junction/style.css';
import './style.css';
import MapBackground,{IMAGERY_BASEMAP_OPTIONS,MAP_PROVIDER_CREDENTIALS_STORAGE,MAP_REFERENCE_STORAGE,STREET_BASEMAP_OPTIONS,basemapCredentialKey,basemapDescription,basemapKind,mapProviderCredentialsDefaults,mapReferenceDefaults,restoreMapProviderCredentials,restoreMapReference,searchMapPlaces,type MapBasemap,type MapPlace,type MapProviderCredentials,type MapReference} from '../junction/map-background';
import {clampZoom,panZoom2D} from '../junction/gestures';
import {NetworkDrawing,type NetworkSelection} from './network-drawing';
import {pocketsFor,sectionFor,type Band,type Direction} from '../junction/model';
import type {Selection} from '../junction/selection';
import NetworkScene3D from './network-scene3d';
import NetworkSectionDock from './network-section-dock';
import {
  NETWORK_EDIT_JUNCTION_STORAGE,NETWORK_PROJECT_STORAGE,addJunction,connectPorts,createNetworkProject,defaultLinkLaneTransition,insertLinkVia,junctionById,linkControlPoints,linkIssues,linkLaneCounts,linkLaneTransitionPossible,linkLength,linkLinearTransitionPossible,moveJunction,moveLinkVia,portKey,portPoint,
  projectBounds,removeJunction,removeLink,removeLinkVia,restoreNetworkProject,rotateJunction,setJunctionArmEnabled,updateJunctionArmBasics,updateJunctionArmGeometry,updateJunctionArmPocket,updateJunctionArmSection,updateJunctionDesign,updateLinkLaneTransition,updateLinkSectionProfile,updateLinkViaRadius,worldJunctionRotation,type LinkDirection,type NetworkProject,type PortRef,type WorldPoint
} from '@/lib/network-project';

type Tool='select'|'junction'|'link'|'pan'|'delete';
type ArmDragState={kind:'arm';id:string;armId:number;before:NetworkProject;startPointer:WorldPoint;startEndpoint:WorldPoint};
type Drag=
  |{kind:'pan';start:{x:number;y:number};pan:{x:number;y:number}}
  |{kind:'junction';id:string;before:NetworkProject;offset:WorldPoint}
  |ArmDragState
  |{kind:'link-via';id:string;index:number;before:NetworkProject}
  |null;
type ArmMovePending={drag:ArmDragState;point:WorldPoint;shiftKey:boolean};
type ArmGuideHint={kind:'angle'|'parallel'|'snap';worldAngle:number;label:string};
type ArmDragGuide={junctionId:string;armId:number;worldAngle:number;localAngle:number;length:number;snapped:boolean;hint:ArmGuideHint|null};

const NETWORK_VIEW_SPAN=600,NETWORK_MIN_ZOOM=.2,NETWORK_MAX_ZOOM=5.5;
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
    [inspectorOpen,setInspectorOpen]=useState(true),[armGuide,setArmGuide]=useState<ArmDragGuide|null>(null);
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag>(null),projectRef=useRef(project),storageReady=useRef(false),fieldBefore=useRef<NetworkProject|null>(null),
    pastRef=useRef<NetworkProject[]>([]),futureRef=useRef<NetworkProject[]>([]),armMoveFrame=useRef<number|null>(null),armMovePending=useRef<ArmMovePending|null>(null);

  const viewWidthMeters=NETWORK_VIEW_SPAN/zoom,scaleMeters=niceScaleMeters(viewWidthMeters*.18),scaleWidthPercent=scaleMeters/viewWidthMeters*100;
  useEffect(()=>{projectRef.current=project;},[project]);
  useEffect(()=>{
    let active=true;
    try{
      localStorage.removeItem(NETWORK_EDIT_JUNCTION_STORAGE);
      const restoredProject=restoreNetworkProject(localStorage.getItem(NETWORK_PROJECT_STORAGE)),restoredMap=restoreMapReference(localStorage.getItem(MAP_REFERENCE_STORAGE)),restoredCredentials=restoreMapProviderCredentials(localStorage.getItem(MAP_PROVIDER_CREDENTIALS_STORAGE));
      queueMicrotask(()=>{if(!active)return;storageReady.current=true;setProject(restoredProject);setMapReference(restoredMap);setMapCredentials(restoredCredentials);});
    }catch{storageReady.current=true;}
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!storageReady.current||drag.current)return;try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(project));}catch{}},[project]);
  useEffect(()=>()=>{if(armMoveFrame.current!==null)cancelAnimationFrame(armMoveFrame.current);},[]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(MAP_REFERENCE_STORAGE,JSON.stringify(mapReference));}catch{}},[mapReference]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(MAP_PROVIDER_CREDENTIALS_STORAGE,JSON.stringify(mapCredentials));}catch{}},[mapCredentials]);

  const mapKind=basemapKind(mapReference.basemap),mapCredentialKey=basemapCredentialKey(mapReference.basemap),
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
  function choose(next:Tool){setTool(next);setArmGuide(null);if(next!=='link'){setPendingPort(null);setLinkCursor(null);}if(next!=='select'){setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}setNotice(next==='junction'?'คลิกตำแหน่งบนแผนเพื่อสร้าง Junction instance':next==='link'?'คลิก port ต้นทาง แล้วเลือก port ปลายทาง · ระบบจะแสดงแนว preview':next==='pan'?'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง':next==='delete'?'คลิกวัตถุเพื่อลบ หรือกด Delete':'เลือกวัตถุ · ลาก Arm อิสระ หรือกด Shift ระหว่างลากเพื่อ snap 15°');}
  function beginFieldEdit(){fieldBefore.current=projectRef.current;}
  function finishFieldEdit(){const before=fieldBefore.current;fieldBefore.current=null;if(before&&before!==projectRef.current)remember(before);}
  async function findPlace(){
    const q=mapQuery.trim();if(q.length<2){setMapPlaces([]);return;}
    setMapSearching(true);
    try{const places=await searchMapPlaces(q);setMapPlaces(places);if(!places.length)setNotice('ไม่พบสถานที่จากคำค้นนี้');}
    catch{setMapPlaces([]);setNotice('ค้นหาสถานที่ไม่สำเร็จ · ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');}
    finally{setMapSearching(false);}
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
    if(current?.kind==='junction'||current?.kind==='link-via'){
      const after=projectRef.current;
      if(after!==current.before){
        remember(current.before);persistProjectSnapshot(after);
        setNotice(current.kind==='junction'?'ย้ายทั้งทางแยกแล้ว · Road Link ปรับปลายตาม port อัตโนมัติ':'ปรับแนว Road Link แล้ว · endpoints ยังคงผูกกับ Junction ports');
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
          <svg ref={svg} data-network-plan="true" data-network-view-span={NETWORK_VIEW_SPAN} data-network-zoom={zoom.toFixed(4)} className={view==='3d'?'network-plan-hidden':''} viewBox={[(-NETWORK_VIEW_SPAN/2/zoom+pan.x),(-NETWORK_VIEW_SPAN/2/zoom+pan.y),(NETWORK_VIEW_SPAN/zoom),(NETWORK_VIEW_SPAN/zoom)].join(' ')}
            onPointerDown={canvasDown} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
            onWheel={e=>{e.preventDefault();zoomAt(e.deltaY>0?.88:1.14,{x:e.clientX,y:e.clientY});}}>
            <defs><pattern id="network-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" stroke="#d8e2e6" strokeWidth=".12" fill="none"/></pattern></defs>
            <rect data-network-background="true" x="-5000" y="-5000" width="10000" height="10000" fill={mapReference.enabled?'transparent':'#edf2f4'}/>
            <rect data-network-grid="true" x="-5000" y="-5000" width="10000" height="10000" fill="url(#network-grid)" opacity={mapReference.enabled?0.42:1}/>
            <NetworkDrawing project={project} zoom={zoom} selection={selection} selectedArm={selectedArm} linkMode={tool==='link'} pendingPort={pendingPort} selectedLinkVertex={selectedLinkVertex} onSelect={selectObject} onArmSelect={selectArm} onJunctionMoveStart={startJunctionMove} onArmMoveStart={startArmMove} onLinkInsertVertex={insertLinkVertexAt} onLinkVertexMoveStart={startLinkVertexMove} onLinkVertexSelect={setSelectedLinkVertex} onPort={selectPort}/>
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
            <label>การต่อหน้าตัด<select data-network-section-mode="link" value={selectedLink.sectionProfile.mode} onChange={e=>{const before=projectRef.current,next=updateLinkSectionProfile(before,selectedLink.id,e.target.value as 'review'|'linear');if(next===before&&e.target.value==='linear'){setNotice('ใช้ Linear transition ไม่ได้จนกว่าจะกำหนด lane transition และชนิด edge bands ให้สอดคล้อง');return;}commit(next,before);setNotice(e.target.value==='linear'?'เปิด resolved section transition แล้ว':'กลับเป็นโหมดตรวจ mismatch แล้ว');}}><option value="review">Review mismatch</option><option value="linear" disabled={!linearTransitionPossible}>Resolved geometric transition</option></select></label><p className="network-note">ระบบไม่เดาฝั่งเพิ่ม/ลดเลน ต้องเลือก Curb หรือ Median ต่อทิศทางก่อน ส่วน lane width, median, sidewalk และ band widths จะ interpolate ต่อเนื่องเมื่อเปิด Resolved geometric transition.</p></div>
          <div className="network-link-ends"><span>FROM <b>{portKey(selectedLink.from)}</b></span><span>TO <b>{portKey(selectedLink.to)}</b></span></div>
          {selectedIssues.length?<div className="network-issues">{selectedIssues.map((issue,i)=><p key={i}>! {issue.message}</p>)}</div>:<p className="network-ok">Road Link continuity resolved ในขอบเขต schema v2</p>}
          <p className="network-note">ดับเบิลคลิกบน Road Link เพื่อเพิ่ม PI แล้วลาก PI เพื่อเปลี่ยน alignment. R0 = polyline เดิม; R&gt;0 = tangent–arc–tangent ที่ resolve จาก geometry เดียวกันใน plan, Fit และ length.</p>
        </section>}
        {!selection&&<section><p className="network-note">เลือก Junction หรือ Road Link บนแผน หรือใช้เครื่องมือ “ทางแยก” เพื่อสร้าง instance ใหม่ และ “เชื่อมถนน” เพื่อเชื่อม arm-to-arm.</p></section>}
        <section className="network-map-panel"><h3><Map size={15}/> แผนที่อ้างอิง</h3><label className="network-switch"><input type="checkbox" checked={mapReference.enabled} onChange={e=>setMapReference(v=>({...v,enabled:e.target.checked}))}/> แสดงแผนที่</label>{mapReference.enabled&&<><div className="network-map-search"><input type="search" placeholder="ค้นหาสถานที่ / ถนน / ทางแยก" value={mapQuery} onChange={e=>setMapQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void findPlace();}}}/><button disabled={mapSearching||mapQuery.trim().length<2} onClick={()=>void findPlace()}>{mapSearching?'กำลังค้นหา…':'ค้นหา'}</button></div>{!!mapPlaces.length&&<div className="network-map-results">{mapPlaces.map((place,i)=><button key={place.label+i} onClick={()=>{setMapReference(v=>({...v,lat:place.lat,lng:place.lng,offsetX:0,offsetY:0}));setMapPlaces([]);setMapQuery(place.label);setNotice('ย้ายแผนที่อ้างอิงไปยัง '+place.label);}}>{place.label}</button>)}</div>}<div className="network-map-source" aria-label="ชนิดพื้นแผนที่"><button data-network-map-source="street" className={mapKind==='street'?'active':''} onClick={()=>setMapReference(v=>({...v,basemap:'positron'}))}>Street / Map</button><button data-network-map-source="imagery" className={mapKind==='imagery'?'active':''} onClick={()=>setMapReference(v=>({...v,basemap:'satellite-eox-2016'}))}>Aerial / Satellite</button></div><label>Provider<select value={mapReference.basemap} onChange={e=>setMapReference(v=>({...v,basemap:e.target.value as MapBasemap}))}>{Object.entries(mapKind==='street'?STREET_BASEMAP_OPTIONS:IMAGERY_BASEMAP_OPTIONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p className="network-note">{basemapDescription(mapReference.basemap)}</p>{mapCredentialKey&&<div className="network-map-credential"><label>{mapCredentialKey==='esri'?'ArcGIS / Esri API key':'MapTiler API key'}<input type="password" autoComplete="off" value={mapCredentials[mapCredentialKey]} placeholder="ใส่ key ของคุณ" onChange={e=>setMapCredentials(v=>({...v,[mapCredentialKey]:e.target.value}))}/></label><p className="network-note">เก็บเฉพาะใน browser นี้ ไม่เข้า Project JSON · ควรจำกัด key ให้ใช้ได้เฉพาะ origin bokoboss.github.io</p></div>}<div className="network-coords"><label>Lat<input type="number" step=".00001" value={mapReference.lat} onChange={e=>setMapReference(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Lng<input type="number" step=".00001" value={mapReference.lng} onChange={e=>setMapReference(v=>({...v,lng:Number(e.target.value)}))}/></label></div><div className="network-coords"><label>Offset X (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetX.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetX:n}));}}/></label><label>Offset Y (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetY.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetY:n}));}}/></label></div><label>Opacity<input type="range" min="10" max="100" step="5" value={mapReference.opacity*100} onChange={e=>setMapReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label><label className="network-switch"><input type="checkbox" checked={mapReference.locked} onChange={e=>setMapReference(v=>({...v,locked:e.target.checked}))}/> ล็อกตำแหน่งแผนที่</label><button className="network-map-reset" disabled={mapReference.locked} onClick={()=>setMapReference(v=>({...v,offsetX:0,offsetY:0}))}>คืน Offset เป็น 0</button><p className="network-note">Map และ Network ใช้ world scale เดียวกัน: 1 หน่วย = 1 เมตรบนพื้นดิน · scale bar มุมล่างซ้ายเปลี่ยนตาม zoom อัตโนมัติ · X/Y ใช้จัดแนวโดยไม่แก้ geometry</p>{mapReference.basemap==='satellite-eox-2016'&&<p className="network-note">Satellite ฟรีชุดนี้เป็น Sentinel-2 cloudless 2016 ความละเอียดต้นฉบับประมาณ 10 m เหมาะสำหรับบริบทพื้นที่ ไม่ใช้แทนภาพ orthophoto สำหรับขอบคันหิน/ช่องจราจร</p>}</>}</section>
        {selection&&<button className="network-delete" onClick={deleteSelection}><Trash2 size={15}/> ลบวัตถุที่เลือก</button>}
      </aside>
    </div>
    <footer className="network-footer"><span>Network schema v2 · Junction Design schema v6 · Thailand left-hand traffic</span><span>Concept design · no traffic analysis / simulation</span></footer>
  </main>;
}
