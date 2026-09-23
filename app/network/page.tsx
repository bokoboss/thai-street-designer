'use client';
import {useEffect,useRef,useState} from 'react';
import {GitBranch,Link2,Map,Minus,MousePointer2,Plus,RotateCw,Trash2,Undo2,Redo2,Maximize2,Move,Network} from 'lucide-react';
import '../junction/style.css';
import './style.css';
import MapBackground,{BASEMAP_OPTIONS,MAP_REFERENCE_STORAGE,mapReferenceDefaults,restoreMapReference,type MapBasemap,type MapReference} from '../junction/map-background';
import {clampZoom,panZoom2D} from '../junction/gestures';
import {NetworkDrawing,type NetworkSelection} from './network-drawing';
import {
  NETWORK_PROJECT_STORAGE,addJunction,connectPorts,createNetworkProject,junctionById,linkIssues,moveJunction,portKey,
  projectBounds,removeJunction,removeLink,restoreNetworkProject,rotateJunction,type NetworkProject,type PortRef,type WorldPoint
} from '@/lib/network-project';

type Tool='select'|'junction'|'link'|'pan'|'delete';
type Drag=
  |{kind:'pan';start:{x:number;y:number};pan:{x:number;y:number}}
  |{kind:'junction';id:string;before:NetworkProject;offset:WorldPoint}
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
    [tool,setTool]=useState<Tool>('select'),[pendingPort,setPendingPort]=useState<PortRef|null>(null),
    [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[notice,setNotice]=useState('เลือกทางแยกแล้วลากจุดกลางเพื่อย้ายทั้งทางแยก'),
    [past,setPast]=useState<NetworkProject[]>([]),[future,setFuture]=useState<NetworkProject[]>([]),
    [mapReference,setMapReference]=useState<MapReference>(mapReferenceDefaults);
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag>(null),projectRef=useRef(project);

  useEffect(()=>{projectRef.current=project;},[project]);
  useEffect(()=>{try{setProject(restoreNetworkProject(localStorage.getItem(NETWORK_PROJECT_STORAGE)));setMapReference(restoreMapReference(localStorage.getItem(MAP_REFERENCE_STORAGE)));}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem(NETWORK_PROJECT_STORAGE,JSON.stringify(project));}catch{}},[project]);
  useEffect(()=>{try{localStorage.setItem(MAP_REFERENCE_STORAGE,JSON.stringify(mapReference));}catch{}},[mapReference]);

  const selectedJunction=selection?.kind==='junction'?junctionById(project,selection.id):undefined,
    selectedLink=selection?.kind==='link'?project.links.find(l=>l.id===selection.id):undefined,
    selectedIssues=selectedLink?linkIssues(project,selectedLink):[];

  function setProjectNow(next:NetworkProject){projectRef.current=next;setProject(next);}
  function commit(next:NetworkProject,before=projectRef.current){
    if(next===before)return;
    setPast(h=>[...h.slice(-39),before]);setFuture([]);setProjectNow(next);
  }
  function undo(){const previous=past.at(-1);if(!previous)return;setFuture(f=>[projectRef.current,...f.slice(0,39)]);setPast(p=>p.slice(0,-1));setProjectNow(previous);setSelection(null);setPendingPort(null);}
  function redo(){const next=future[0];if(!next)return;setPast(p=>[...p.slice(-39),projectRef.current]);setFuture(f=>f.slice(1));setProjectNow(next);setSelection(null);setPendingPort(null);}
  function point(e:{clientX:number;clientY:number}){const matrix=svg.current?.getScreenCTM();if(!matrix)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y};}
  function choose(next:Tool){setTool(next);if(next!=='link')setPendingPort(null);setNotice(next==='junction'?'คลิกตำแหน่งบนแผนเพื่อสร้าง Junction instance':next==='link'?'คลิก port ของทางแยกต้นทาง แล้วคลิก port ปลายทาง':next==='pan'?'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง':next==='delete'?'คลิกวัตถุแล้วกดลบ หรือกด Delete':'เลือกวัตถุ · ลากจุดกลาง Junction เพื่อย้ายทั้งทางแยก');}
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
    if(tool==='select')setSelection(null);
  }
  function movePointer(e:React.PointerEvent<SVGSVGElement>){
    const current=drag.current;if(!current)return;
    if(current.kind==='pan'){
      const r=e.currentTarget.getBoundingClientRect(),scale=250/zoom/Math.min(r.width,r.height);
      setPan({x:current.pan.x-(e.clientX-current.start.x)*scale,y:current.pan.y-(e.clientY-current.start.y)*scale});return;
    }
    const p=point(e),next=moveJunction(projectRef.current,current.id,{x:p.x+current.offset.x,y:p.y+current.offset.y});
    setProjectNow(next);
  }
  function endPointer(e:React.PointerEvent<SVGSVGElement>){
    const current=drag.current;drag.current=null;
    try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}
    if(current?.kind==='junction'){
      const after=projectRef.current;
      if(after!==current.before){setPast(h=>[...h.slice(-39),current.before]);setFuture([]);setNotice('ย้ายทั้งทางแยกแล้ว · Road Link ปรับปลายตาม port อัตโนมัติ');}
    }
  }
  function startJunctionMove(id:string,e:React.PointerEvent<SVGCircleElement>){
    if(tool==='delete'){const before=projectRef.current;commit(removeJunction(before,id),before);setSelection(null);return;}
    if(tool!=='select')return;
    const junction=junctionById(projectRef.current,id);if(!junction)return;
    const p=point(e),before=projectRef.current;
    drag.current={kind:'junction',id,before,offset:{x:junction.x-p.x,y:junction.y-p.y}};
    svg.current?.setPointerCapture(e.pointerId);
  }
  function selectObject(next:NetworkSelection){
    if(!next)return;
    if(tool==='delete'){
      const before=projectRef.current,after=next.kind==='junction'?removeJunction(before,next.id):removeLink(before,next.id);
      commit(after,before);setSelection(null);return;
    }
    setSelection(next);
  }
  function selectPort(ref:PortRef){
    if(tool!=='link')return;
    if(!pendingPort){setPendingPort(ref);setSelection({kind:'junction',id:ref.junctionId});setNotice('เลือกต้นทาง '+portKey(ref)+' แล้ว · เลือก port ของทางแยกปลายทาง');return;}
    const before=projectRef.current,result=connectPorts(before,pendingPort,ref);
    if(result.error){setNotice(result.error);if(portKey(pendingPort)===portKey(ref))setPendingPort(null);return;}
    commit(result.project,before);setPendingPort(null);setSelection(result.link?{kind:'link',id:result.link.id}:null);choose('select');setNotice('เชื่อม Road Link แล้ว · ปลาย Link ผูกกับ Junction ports แบบ semantic');
  }
  function deleteSelection(){
    if(!selection)return;const before=projectRef.current,after=selection.kind==='junction'?removeJunction(before,selection.id):removeLink(before,selection.id);commit(after,before);setSelection(null);
  }
  function reset(){const before=projectRef.current,next=createNetworkProject();commit(next,before);setSelection({kind:'junction',id:'J-1'});setPan({x:0,y:0});setZoom(1);setPendingPort(null);setNotice('คืนค่า Network Foundation demo แล้ว');}

  return <main className="network-workspace" tabIndex={-1} onKeyDown={e=>{if((e.target as HTMLElement).matches('input,select,button'))return;if(e.key==='Delete')deleteSelection();if(e.key==='Escape'){setPendingPort(null);choose('select');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}}}>
    <header className="network-header">
      <div className="network-brand"><Network size={21}/><div><b>Thai Street Designer</b><span>Network Concept Workspace</span></div></div>
      <div className="network-header-actions"><button onClick={undo} disabled={!past.length}><Undo2 size={15}/> Undo</button><button onClick={redo} disabled={!future.length}><Redo2 size={15}/> Redo</button><button onClick={fit}><Maximize2 size={15}/> Fit</button><button onClick={reset}>Reset demo</button></div>
    </header>
    <div className="network-body">
      <aside className="network-tools">{tools.map(([id,label,Icon])=><button key={id} className={tool===id?'active':''} title={label} onClick={()=>choose(id)}><Icon size={20}/><span>{label}</span></button>)}</aside>
      <section className="network-canvas-wrap">
        <div className="network-viewbar"><div><b>{project.title}</b><span>{project.junctions.length} junctions · {project.links.length} road links</span></div><div className="network-view-links"><a href="junction/">Junction detail</a><a href="roads/">Road alignment lab</a></div></div>
        <div className="network-canvas">
          <MapBackground reference={mapReference} view={{zoom,pan}}/>
          <svg ref={svg} viewBox={[(-125/zoom+pan.x),(-125/zoom+pan.y),(250/zoom),(250/zoom)].join(' ')}
            onPointerDown={canvasDown} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}
            onWheel={e=>{e.preventDefault();zoomAt(e.deltaY>0?.9:1.1,{x:e.clientX,y:e.clientY});}}>
            <defs><pattern id="network-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" stroke="#d8e2e6" strokeWidth=".12" fill="none"/></pattern></defs>
            <rect x="-5000" y="-5000" width="10000" height="10000" fill={mapReference.enabled?'transparent':'#edf2f4'}/>
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#network-grid)" opacity={mapReference.enabled?.42:1}/>
            <NetworkDrawing project={project} selection={selection} linkMode={tool==='link'} onSelect={selectObject} onJunctionMoveStart={startJunctionMove} onPort={selectPort}/>
            {pendingPort&&(()=>{const j=junctionById(project,pendingPort.junctionId);if(!j)return null;const angle=(j.rotation+j.design.rotation+j.design.arms[pendingPort.armId].angle)*Math.PI/180,d=Math.min(j.design.arms[pendingPort.armId].length,45);return <circle cx={j.x+Math.cos(angle)*d} cy={j.y+Math.sin(angle)*d} r="4" fill="none" stroke="#e3a33d" strokeWidth=".8"/>;})()}
          </svg>
          <div className="network-zoom"><button onClick={()=>zoomAt(.85)}><Plus size={16}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>zoomAt(1.18)}><Minus size={16}/></button></div>
          <div className="network-status">{notice}</div>
        </div>
      </section>
      <aside className="network-inspector">
        <div className="network-inspector-title"><span>NETWORK OBJECT</span><b>{selectedJunction?.name??selectedLink?.name??'ยังไม่ได้เลือกวัตถุ'}</b></div>
        {selectedJunction&&<section>
          <p className="network-object-type">Junction Instance · {selectedJunction.id}</p>
          <label>ชื่อทางแยก<input value={selectedJunction.name} onChange={e=>{const before=projectRef.current,next={...before,junctions:before.junctions.map(j=>j.id===selectedJunction.id?{...j,name:e.target.value}:j)};setProjectNow(next);}}/></label>
          <div className="network-coords"><label>X (m)<input type="number" value={+selectedJunction.x.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){const before=projectRef.current;commit(moveJunction(before,selectedJunction.id,{x:n,y:selectedJunction.y}),before);}}}/></label><label>Y (m)<input type="number" value={+selectedJunction.y.toFixed(2)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){const before=projectRef.current;commit(moveJunction(before,selectedJunction.id,{x:selectedJunction.x,y:n}),before);}}}/></label></div>
          <label>หมุน Junction ใน world (°)<input type="number" min="0" max="359" step="1" value={Math.round(selectedJunction.rotation)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)){const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,n),before);}}}/></label>
          <div className="network-inline-actions"><button onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation-15),before);}}><RotateCw size={14}/> −15°</button><button onClick={()=>{const before=projectRef.current;commit(rotateJunction(before,selectedJunction.id,selectedJunction.rotation+15),before);}}><RotateCw size={14}/> +15°</button></div>
          <p className="network-note">ตำแหน่ง/rotation เป็น transform ของ Junction instance เท่านั้น ไม่แก้ geometry ภายใน Design v6. Road Link ที่ผูกกับ arm จะตาม port ไปอัตโนมัติ</p>
        </section>}
        {selectedLink&&<section>
          <p className="network-object-type">Road Link · {selectedLink.id}</p>
          <div className="network-link-ends"><span>FROM <b>{portKey(selectedLink.from)}</b></span><span>TO <b>{portKey(selectedLink.to)}</b></span></div>
          {selectedIssues.length?<div className="network-issues">{selectedIssues.map((issue,i)=><p key={i}>! {issue.message}</p>)}</div>:<p className="network-ok">ปลาย Link สอดคล้องกันในระดับ foundation</p>}
          <p className="network-note">Junction เป็นเจ้าของ geometry ใกล้ปากแยก ส่วน Road Link เป็นเจ้าของ corridor ระหว่าง ports. ถ้าปลายสองด้านมี lane/median ไม่เท่ากัน ระบบจะเตือนแทนการสร้าง transition แบบเดาเอง</p>
        </section>}
        {!selection&&<section><p className="network-note">เลือก Junction หรือ Road Link บนแผน หรือใช้เครื่องมือ “ทางแยก” เพื่อสร้าง instance ใหม่ และ “เชื่อมถนน” เพื่อเชื่อม arm-to-arm.</p></section>}
        <section className="network-map-panel"><h3><Map size={15}/> แผนที่อ้างอิง</h3><label className="network-switch"><input type="checkbox" checked={mapReference.enabled} onChange={e=>setMapReference(v=>({...v,enabled:e.target.checked}))}/> แสดงแผนที่</label>{mapReference.enabled&&<><label>Basemap<select value={mapReference.basemap} onChange={e=>setMapReference(v=>({...v,basemap:e.target.value as MapBasemap}))}>{Object.entries(BASEMAP_OPTIONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="network-coords"><label>Lat<input type="number" step=".00001" value={mapReference.lat} onChange={e=>setMapReference(v=>({...v,lat:Number(e.target.value)}))}/></label><label>Lng<input type="number" step=".00001" value={mapReference.lng} onChange={e=>setMapReference(v=>({...v,lng:Number(e.target.value)}))}/></label></div><label>Opacity<input type="range" min="10" max="100" step="5" value={mapReference.opacity*100} onChange={e=>setMapReference(v=>({...v,opacity:Number(e.target.value)/100}))}/></label></>}</section>
        {selection&&<button className="network-delete" onClick={deleteSelection}><Trash2 size={15}/> ลบวัตถุที่เลือก</button>}
      </aside>
    </div>
    <footer className="network-footer"><span>Network schema v1 · Junction Design schema v6 · Thailand left-hand traffic</span><span>Concept design · no traffic analysis / simulation</span></footer>
  </main>;
}
