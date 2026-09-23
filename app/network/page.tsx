'use client';
import {useEffect,useRef,useState} from 'react';
import {GitBranch,Link2,Map,Minus,MousePointer2,Plus,RotateCw,Trash2,Undo2,Redo2,Maximize2,Move,Network} from 'lucide-react';
import '../junction/style.css';
import './style.css';
import MapBackground,{BASEMAP_OPTIONS,MAP_REFERENCE_STORAGE,mapReferenceDefaults,restoreMapReference,type MapBasemap,type MapReference} from '../junction/map-background';
import {clampZoom,panZoom2D} from '../junction/gestures';
import {NetworkDrawing,type NetworkSelection} from './network-drawing';
import {pocketsFor,sectionFor,type Band,type Direction} from '../junction/model';
import NetworkScene3D from './network-scene3d';
import {
  NETWORK_EDIT_JUNCTION_STORAGE,NETWORK_PROJECT_STORAGE,addJunction,connectPorts,createNetworkProject,insertLinkVia,junctionById,linkIssues,linkLength,linkPoints,moveJunction,moveLinkVia,portKey,
  projectBounds,removeJunction,removeLink,removeLinkVia,restoreNetworkProject,rotateJunction,updateJunctionArmBasics,updateJunctionArmGeometry,updateJunctionArmPocket,updateJunctionArmSection,type NetworkProject,type PortRef,type WorldPoint
} from '@/lib/network-project';

type Tool='select'|'junction'|'link'|'pan'|'delete';
type Drag=
  |{kind:'pan';start:{x:number;y:number};pan:{x:number;y:number}}
  |{kind:'junction';id:string;before:NetworkProject;offset:WorldPoint}
  |{kind:'arm';id:string;armId:number;before:NetworkProject}
  |{kind:'link-via';id:string;index:number;before:NetworkProject}
  |null;

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
    [mapReference,setMapReference]=useState<MapReference>(mapReferenceDefaults),[view,setView]=useState<'2d'|'3d'>('2d');
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag>(null),projectRef=useRef(project),storageReady=useRef(false);

  useEffect(()=>{projectRef.current=project;},[project]);
  useEffect(()=>{
    let active=true;
    try{
      localStorage.removeItem(NETWORK_EDIT_JUNCTION_STORAGE);
      const restoredProject=restoreNetworkProject(localStorage.getItem(NETWORK_PROJECT_STORAGE)),restoredMap=restoreMapReference(localStorage.getItem(MAP_REFERENCE_STORAGE));
      queueMicrotask(()=>{if(!active)return;storageReady.current=true;setProject(restoredProject);setMapReference(restoredMap);});
    }catch{storageReady.current=true;}
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(project));}catch{}},[project]);
  useEffect(()=>{if(!storageReady.current)return;try{localStorage.setItem(MAP_REFERENCE_STORAGE,JSON.stringify(mapReference));}catch{}},[mapReference]);

  const selectedJunction=selection?.kind==='junction'?junctionById(project,selection.id):undefined,
    selectedLink=selection?.kind==='link'?project.links.find(l=>l.id===selection.id):undefined,
    selectedArmData=selectedJunction&&selectedArm!==null&&selectedJunction.design.enabled[selectedArm]?selectedJunction.design.arms[selectedArm]:undefined,
    selectedSection=selectedArmData?sectionFor(selectedArmData,selectedDirection):undefined,
    selectedPockets=selectedArmData?pocketsFor(selectedArmData,selectedDirection):undefined,
    selectedIssues=selectedLink?linkIssues(project,selectedLink):[];

  function setProjectNow(next:NetworkProject){projectRef.current=next;setProject(next);}
  function commit(next:NetworkProject,before=projectRef.current){
    if(next===before)return;
    setPast(h=>[...h.slice(-39),before]);setFuture([]);setProjectNow(next);
  }
  function undo(){const previous=past.at(-1);if(!previous)return;setFuture(f=>[projectRef.current,...f.slice(0,39)]);setPast(p=>p.slice(0,-1));setProjectNow(previous);setSelection(null);setPendingPort(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}
  function redo(){const next=future[0];if(!next)return;setPast(p=>[...p.slice(-39),projectRef.current]);setFuture(f=>f.slice(1));setProjectNow(next);setSelection(null);setPendingPort(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}
  function point(e:{clientX:number;clientY:number}){const matrix=svg.current?.getScreenCTM();if(!matrix)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y};}
  function choose(next:Tool){setTool(next);if(next!=='link')setPendingPort(null);if(next!=='select'){setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}setNotice(next==='junction'?'คลิกตำแหน่งบนแผนเพื่อสร้าง Junction instance':next==='link'?'คลิก port ของทางแยกต้นทาง แล้วคลิก port ปลายทาง':next==='pan'?'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง':next==='delete'?'คลิกวัตถุแล้วกดลบ หรือกด Delete':'เลือกวัตถุ · ลากจุดกลาง Junction เพื่อย้ายทั้งทางแยก');}
  function fit(){
    const b=projectBounds(project),center={x:b.x+b.w/2,y:b.y+b.h/2},next=clampZoom(Math.min(4.5,250/Math.max(b.w,b.h)*.88));
    setPan(center);setZoom(next);
  }
  function zoomAt(factor:number,screen?:{x:number;y:number}){
    const el=svg.current;if(!el)return;
    const r=el.getBoundingClientRect(),p=screen??{x:r.left+r.width/2,y:r.top+r.height/2},
      g={dx:0,dy:0,factor,before:p,after:p,count:2},next=panZoom2D(pan,zoom,g,{x:r.left+r.width/2,y:r.top+r.height/2},Math.min(r.width,r.height));
    setZoom(next.zoom);setPan(next.pan);
  }
  function canvasDown(e:React.PointerEvent<SVGSVGElement>){
    if(e.button===1||tool==='pan'){drag.current={kind:'pan',start:{x:e.clientX,y:e.clientY},pan};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(tool==='junction'){
      const before=projectRef.current,result=addJunction(before,point(e));commit(result.project,before);setSelection({kind:'junction',id:result.junction.id});choose('select');setNotice('สร้าง Junction instance แล้ว · ลากจุดกลางเพื่อจัดตำแหน่ง');return;
    }
    if(tool==='select'){setSelection(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);}
  }
  function movePointer(e:React.PointerEvent<SVGSVGElement>){
    const current=drag.current;if(!current)return;
    if(current.kind==='pan'){
      const r=e.currentTarget.getBoundingClientRect(),scale=250/zoom/Math.min(r.width,r.height);
      setPan({x:current.pan.x-(e.clientX-current.start.x)*scale,y:current.pan.y-(e.clientY-current.start.y)*scale});return;
    }
    const p=point(e);
    if(current.kind==='link-via'){
      const next=moveLinkVia(projectRef.current,current.id,current.index,p);
      if(next===projectRef.current){setNotice('จุดแนวนี้ทำให้ Link หักกลับ/ตัดตัวเองหรือมีท่อนสั้นเกินไป');return;}
      setProjectNow(next);return;
    }
    if(current.kind==='arm'){
      const junction=junctionById(projectRef.current,current.id);if(!junction)return;
      const dx=p.x-junction.x,dy=p.y-junction.y,length=Math.hypot(dx,dy),worldAngle=(Math.atan2(dy,dx)*180/Math.PI+360)%360,
        localAngle=(worldAngle-junction.rotation-junction.design.rotation+720)%360,
        result=updateJunctionArmGeometry(projectRef.current,current.id,current.armId,Math.round(localAngle),Math.round(length));
      if(result.error){setNotice(result.error);return;}
      setProjectNow(result.project);return;
    }
    const next=moveJunction(projectRef.current,current.id,{x:p.x+current.offset.x,y:p.y+current.offset.y});
    setProjectNow(next);
  }
  function endPointer(e:React.PointerEvent<SVGSVGElement>){
    const current=drag.current;drag.current=null;
    try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
    if(current?.kind==='junction'||current?.kind==='arm'||current?.kind==='link-via'){
      const after=projectRef.current;
      if(after!==current.before){
        setPast(h=>[...h.slice(-39),current.before]);setFuture([]);
        setNotice(current.kind==='junction'?'ย้ายทั้งทางแยกแล้ว · Road Link ปรับปลายตาม port อัตโนมัติ':current.kind==='arm'?'ปรับขาถนนแล้ว · ความยาว/มุมและ Road Link ใช้ geometry เดียวกัน':'ปรับแนว Road Link แล้ว · endpoints ยังคงผูกกับ Junction ports');
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
    if(tool!=='select')return;setSelection({kind:'junction',id});setSelectedArm(armId);setSelectedDirection('incoming');setSelectedLinkVertex(null);const junction=junctionById(projectRef.current,id),arm=junction?.design.arms[armId];if(arm)setNotice(arm.name+' · ลากจุดปลายเพื่อยืด/หด/หมุน หรือปรับค่าที่ Inspector');
  }
  function startArmMove(id:string,armId:number,e:React.PointerEvent<SVGCircleElement>){
    if(tool!=='select')return;setSelection({kind:'junction',id});setSelectedArm(armId);setSelectedDirection('incoming');drag.current={kind:'arm',id,armId,before:projectRef.current};svg.current?.setPointerCapture(e.pointerId);
  }
  function editSelectedArm(patch:Parameters<typeof updateJunctionArmBasics>[3]){
    if(!selectedJunction||selectedArm===null)return;const before=projectRef.current,result=updateJunctionArmBasics(before,selectedJunction.id,selectedArm,patch);
    if(result.error){setNotice(result.error);return;}commit(result.project,before);setNotice('ปรับ '+(result.project.junctions.find(j=>j.id===selectedJunction.id)?.design.arms[selectedArm]?.name??'ขาถนน')+' แล้ว');
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
    if(!pendingPort){setPendingPort(ref);setSelection({kind:'junction',id:ref.junctionId});setSelectedArm(ref.armId);setSelectedDirection('incoming');setNotice('เลือกต้นทาง '+portKey(ref)+' แล้ว · เลือก port ของทางแยกปลายทาง');return;}
    const before=projectRef.current,result=connectPorts(before,pendingPort,ref);
    if(result.error){setNotice(result.error);if(portKey(pendingPort)===portKey(ref))setPendingPort(null);return;}
    commit(result.project,before);setPendingPort(null);setSelectedArm(null);setSelectedDirection('incoming');setSelection(result.link?{kind:'link',id:result.link.id}:null);choose('select');setNotice('เชื่อม Road Link แล้ว · ปลาย Link ผูกกับ Junction ports แบบ semantic');
  }
  function deleteSelection(){
    if(!selection)return;const before=projectRef.current,after=selection.kind==='junction'?removeJunction(before,selection.id):removeLink(before,selection.id);commit(after,before);setSelection(null);setSelectedArm(null);setSelectedLinkVertex(null);
  }
  function reset(){const before=projectRef.current,next=createNetworkProject();commit(next,before);setSelection({kind:'junction',id:'J-1'});setPan({x:0,y:0});setZoom(1);setPendingPort(null);setSelectedArm(null);setSelectedDirection('incoming');setSelectedLinkVertex(null);setNotice('คืนค่า Network Foundation demo แล้ว');}

  return <main className="network-workspace" tabIndex={-1} onKeyDown={e=>{if((e.target as HTMLElement).matches('input,select,button'))return;if(e.key==='Delete')deleteSelection();if(e.key==='Escape'){setPendingPort(null);choose('select');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}}}>
    <header className="network-header">
      <div className="network-brand"><Network size={21}/><div><b>Thai Street Designer</b><span>Network Concept Workspace</span></div></div>
      <div className="network-header-actions"><button onClick={undo} disabled={!past.length}><Undo2 size={15}/> Undo</button><button onClick={redo} disabled={!future.length}><Redo2 size={15}/> Redo</button><button onClick={fit}><Maximize2 size={15}/> Fit</button><button onClick={reset}>Reset demo</button></div>
    </header>
    <div className="network-body">
      <aside className="network-tools">{tools.map(([id,label,Icon])=><button key={id} className={tool===id?'active':''} title={label} onClick={()=>choose(id)}><Icon size={20}/><span>{label}</span></button>)}</aside>
      <section className="network-canvas-wrap">
        <div className="network-viewbar"><div><b>{project.title}</b><span>{project.junctions.length} junctions · {project.links.length} road links</span></div><div className="network-view-mode"><button className={view==='2d'?'active':''} onClick={()=>setView('2d')}>2D Network</button><button className={view==='3d'?'active':''} onClick={()=>setView('3d')}>3D Overview</button></div><div className="network-view-links"><a href="junction/">Junction detail</a><a href="roads/">Road alignment lab</a></div></div>
        <div className="network-canvas">
          {view==='2d'&&<MapBackground reference={mapReference} view={{zoom,pan}}/>}
          <svg ref={svg} data-network-plan="true" className={view==='3d'?'network-plan-hidden':''} viewBox={[(-125/zoom+pan.x),(-125/zoom+pan.y),(250/zoom),(250/zoom)].join(' ')}
            onPointerDown={canvasDown} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}
            onWheel={e=>{e.preventDefault();zoomAt(e.deltaY>0?.9:1.1,{x:e.clientX,y:e.clientY});}}>
            <defs><pattern id="network-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" stroke="#d8e2e6" strokeWidth=".12" fill="none"/></pattern></defs>
            <rect data-network-background="true" x="-5000" y="-5000" width="10000" height="10000" fill={mapReference.enabled?'transparent':'#edf2f4'}/>
            <rect data-network-grid="true" x="-5000" y="-5000" width="10000" height="10000" fill="url(#network-grid)" opacity={mapReference.enabled?0.42:1}/>
            <NetworkDrawing project={project} selection={selection} selectedArm={selectedArm} linkMode={tool==='link'} selectedLinkVertex={selectedLinkVertex} onSelect={selectObject} onArmSelect={selectArm} onJunctionMoveStart={startJunctionMove} onArmMoveStart={startArmMove} onLinkVertexMoveStart={startLinkVertexMove} onLinkVertexSelect={setSelectedLinkVertex} onPort={selectPort}/>
            {pendingPort&&(()=>{const j=junctionById(project,pendingPort.junctionId);if(!j)return null;const angle=(j.rotation+j.design.rotation+j.design.arms[pendingPort.armId].angle)*Math.PI/180,d=j.design.arms[pendingPort.armId].length;return <circle cx={j.x+Math.cos(angle)*d} cy={j.y+Math.sin(angle)*d} r="4" fill="none" stroke="#e3a33d" strokeWidth=".8"/>;})()}
          </svg>
          <NetworkScene3D project={project} mapReference={mapReference} active={view==='3d'}/>
          <div className="network-zoom" hidden={view==='3d'}><button onClick={()=>zoomAt(.85)}><Plus size={16}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>zoomAt(1.18)}><Minus size={16}/></button></div>
          <div className="network-status">{notice}</div>
        </div>
      </section>
      <aside className="network-inspector">
        <div className="network-inspector-title"><span>NETWORK OBJECT</span><b>{selectedJunction?.name??selectedLink?.name??'ยังไม่ได้เลือกวัตถุ'}</b></div>
        {selectedJunction&&<section>
          <p className="network-object-type">Junction Instance · {selectedJunction.id}</p>
          <div className="network-arm-tabs" aria-label="เลือกขาถนน">{selectedJunction.design.enabled.map((enabled,armId)=>enabled?<button key={armId} className={selectedArm===armId?'active':''} onClick={()=>selectArm(selectedJunction.id,armId)}>{selectedJunction.design.arms[armId].name||('Arm '+(armId+1))}</button>:null)}</div>
          <label>ชื่อทางแยก<input value={selectedJunction.name} onChange={e=>{const before=projectRef.current,next={...before,junctions:before.junctions.map(j=>j.id===selectedJunction.id?{...j,name:e.target.value}:j)};setProjectNow(next);}}/></label>
          <div className="network-coords"><label>X (m)<input type="number" value={+selectedJunction.x.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){const before=projectRef.current;commit(moveJunction(before,selectedJunction.id,{x:n,y:selectedJunction.y}),before);}}}/></label><label>Y (m)<input type="number" value={+selectedJunction.y.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){const before=projectRef.current;commit(moveJunction(before,selectedJunction.id,{x:selectedJunction.x,y:n}),before);}}}/></label></div>
          <label>หมุน Junction ใน world (°)<input type="number" min="0" max="359" step="1" value={Math.round(selectedJunction.rotation)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,n),before);}}}/></label>
          <div className="network-inline-actions"><button onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation-15),before);}}><RotateCw size={14}/> −15°</button><button onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation+15),before);}}><RotateCw size={14}/> +15°</button></div>
          {selectedArmData&&selectedArm!==null&&<div className="network-arm-editor">
            <div className="network-arm-editor-head"><span>DIRECT ARM EDIT</span><b>{selectedArmData.name}</b></div>
            <p className="network-arm-hint">ลากวงกลมที่ปลายขาบนแผนเพื่อยืด/หดและหมุน ขาที่เชื่อม RoadLink อยู่จะพาปลาย Link ตามไปด้วย</p>
            <div className="network-coords"><label>มุม (°)<input key={'angle-'+selectedJunction.id+'-'+selectedArm+'-'+selectedArmData.angle} type="number" min="0" max="359" defaultValue={Math.round(selectedArmData.angle)} onBlur={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))editSelectedArmGeometry(n,selectedArmData.length);}}/></label><label>ความยาว (m)<input key={'length-'+selectedJunction.id+'-'+selectedArm+'-'+selectedArmData.length} type="number" min="45" max="400" defaultValue={Math.round(selectedArmData.length)} onBlur={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n))editSelectedArmGeometry(selectedArmData.angle,n);}}/></label></div>
            <div className="network-step-row"><span>เลนเข้า</span><button disabled={selectedArmData.incoming<=0||selectedArmData.incoming+selectedArmData.outgoing<=1} onClick={()=>editSelectedArm({incoming:selectedArmData.incoming-1})}>−</button><b>{selectedArmData.incoming}</b><button disabled={selectedArmData.incoming>=4} onClick={()=>editSelectedArm({incoming:selectedArmData.incoming+1})}>＋</button></div>
            <div className="network-step-row"><span>เลนออก</span><button disabled={selectedArmData.outgoing<=0||selectedArmData.incoming+selectedArmData.outgoing<=1} onClick={()=>editSelectedArm({outgoing:selectedArmData.outgoing-1})}>−</button><b>{selectedArmData.outgoing}</b><button disabled={selectedArmData.outgoing>=4} onClick={()=>editSelectedArm({outgoing:selectedArmData.outgoing+1})}>＋</button></div>
            <div className="network-step-row"><span>เกาะกลาง</span><button disabled={selectedArmData.median<=0} onClick={()=>editSelectedArm({median:Math.max(0,+(selectedArmData.median-.5).toFixed(2))})}>−</button><b>{selectedArmData.median.toFixed(1)} m</b><button disabled={selectedArmData.median>=12} onClick={()=>editSelectedArm({median:Math.min(12,+(selectedArmData.median+.5).toFixed(2))})}>＋</button></div>
          </div>}
          <button className="network-detail-button" onClick={()=>{try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(projectRef.current));localStorage.setItem(NETWORK_EDIT_JUNCTION_STORAGE,selectedJunction.id);}catch{}location.href='junction/?from=network';}}>แก้รายละเอียดทางแยก</button><p className="network-note">ตำแหน่ง/rotation เป็น transform ของ Junction instance เท่านั้น ไม่แก้ geometry ภายใน Design v6. Road Link ที่ผูกกับ arm จะตาม port ไปอัตโนมัติ</p>
        </section>}
        {selectedLink&&<section>
          <p className="network-object-type">Road Link · {selectedLink.id}</p>
          <div className="network-link-metrics"><span>Alignment <b>{linkLength(project,selectedLink).toFixed(1)} m</b></span><span>Via points <b>{selectedLink.via.length}</b></span></div>
          <div className="network-inline-actions"><button onClick={()=>{const ps=linkPoints(projectRef.current,selectedLink);let best=0,bestLen=-1;for(let i=0;i<ps.length-1;i++){const len=Math.hypot(ps[i+1].x-ps[i].x,ps[i+1].y-ps[i].y);if(len>bestLen){best=i;bestLen=len;}}const p={x:(ps[best].x+ps[best+1].x)/2,y:(ps[best].y+ps[best+1].y)/2};const before=projectRef.current,next=insertLinkVia(before,selectedLink.id,best,p);if(next!==before){commit(next,before);setSelectedLinkVertex(best);setNotice('เพิ่มจุดแนว Road Link แล้ว · ลากจุดเพื่อปรับ alignment');}}}>＋ จุดแนว</button><button disabled={selectedLinkVertex===null} onClick={()=>{if(selectedLinkVertex===null)return;const before=projectRef.current,next=removeLinkVia(before,selectedLink.id,selectedLinkVertex);if(next!==before){commit(next,before);setSelectedLinkVertex(null);}}}>ลบจุดแนว</button></div>
          <div className="network-link-ends"><span>FROM <b>{portKey(selectedLink.from)}</b></span><span>TO <b>{portKey(selectedLink.to)}</b></span></div>
          {selectedIssues.length?<div className="network-issues">{selectedIssues.map((issue,i)=><p key={i}>! {issue.message}</p>)}</div>:<p className="network-ok">ปลาย Link สอดคล้องกันในระดับ foundation</p>}
          <p className="network-note">Junction เป็นเจ้าของ geometry ใกล้ปากแยก ส่วน Road Link เป็นเจ้าของ corridor ระหว่าง ports. ถ้าปลายสองด้านมี lane/median ไม่เท่ากัน ระบบจะเตือนแทนการสร้าง transition แบบเดาเอง</p>
        </section>}
        {!selection&&<section><p className="network-note">เลือก Junction หรือ Road Link บนแผน หรือใช้เครื่องมือ “ทางแยก” เพื่อสร้าง instance ใหม่ และ “เชื่อมถนน” เพื่อเชื่อม arm-to-arm.</p></section>}
        <section className="network-map-panel"><h3><Map size={15}/> แผนที่อ้างอิง</h3><label className="network-switch"><input type="checkbox" checked={mapReference.enabled} onChange={e=>setMapReference(v=>({...v,enabled:e.target.checked}))}/> แสดงแผนที่</label>{mapReference.enabled&&<><label>Basemap<select value={mapReference.basemap} onChange={e=>setMapReference(v=>({...v,basemap:e.target.value as MapBasemap}))}>{Object.entries(BASEMAP_OPTIONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="network-coords"><label>Lat<input type="number" step=".00001" value={mapReference.lat} onChange={e=>setMapReference(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Lng<input type="number" step=".00001" value={mapReference.lng} onChange={e=>setMapReference(v=>({...v,lng:Number(e.target.value)}))}/></label></div><div className="network-coords"><label>Offset X (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetX.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetX:n}));}}/></label><label>Offset Y (m)<input type="number" step=".5" disabled={mapReference.locked} value={+mapReference.offsetY.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setMapReference(v=>({...v,offsetY:n}));}}/></label></div><label>Opacity<input type="range" min="10" max="100" step="5" value={mapReference.opacity*100} onChange={e=>setMapReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label><label className="network-switch"><input type="checkbox" checked={mapReference.locked} onChange={e=>setMapReference(v=>({...v,locked:e.target.checked}))}/> ล็อกตำแหน่งแผนที่</label><button className="network-map-reset" disabled={mapReference.locked} onClick={()=>setMapReference(v=>({...v,offsetX:0,offsetY:0}))}>คืน Offset เป็น 0</button><p className="network-note">Map เป็น reference layer เท่านั้น · X/Y ใช้จัดแนว Network กับแผนที่โดยไม่แก้ geometry ของ Junction หรือ Road Link</p></>}</section>
        {selection&&<button className="network-delete" onClick={deleteSelection}><Trash2 size={15}/> ลบวัตถุที่เลือก</button>}
      </aside>
    </div>
    <footer className="network-footer"><span>Network schema v1 · Junction Design schema v6 · Thailand left-hand traffic</span><span>Concept design · no traffic analysis / simulation</span></footer>
  </main>;
}
