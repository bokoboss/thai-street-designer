'use client';
import Drawing from '../junction/drawing';
import {path} from '../junction/geometry';
import {parallel} from '@/lib/alignment';
import {
  activeArmIds,junctionDisplayDesign,linkEndSection,linkIssues,linkPoints,portPoint,worldJunctionRotation,
  type JunctionInstance,type NetworkProject,type PortRef,type RoadLink
} from '@/lib/network-project';

export type NetworkSelection={kind:'junction'|'link';id:string}|null;

const sectionHalf=(section:ReturnType<typeof linkEndSection>)=>{
  if(!section)return{left:5,right:5,total:10};
  const left=section.median/2+section.forwardLanes*section.forwardLaneWidth,right=section.median/2+section.backwardLanes*section.backwardLaneWidth;
  return{left,right,total:left+right};
};
const bandFill:Record<string,string>={bike:'#467d70',motorcycle:'#526c91',shoulder:'#66727c',buffer:'#899396'};
function stripPath(ps:{x:number;y:number}[],inner:number,outer:number){
  return path([...parallel(ps,inner),...parallel(ps,outer).reverse()],true);
}

export function RoadLinkDrawing({
  project,link,selected,selectedVertex,onSelect,onVertexMoveStart,onVertexSelect
}:{project:NetworkProject;link:RoadLink;selected:boolean;selectedVertex:number|null;onSelect:()=>void;onVertexMoveStart:(index:number,e:React.PointerEvent<SVGCircleElement>)=>void;onVertexSelect:(index:number)=>void}){
  const ps=linkPoints(project,link);
  if(ps.length<2)return null;
  const from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to'),a=sectionHalf(from),b=sectionHalf(to),
    issues=linkIssues(project,link),compatible=issues.length===0,
    laneCompatible=!issues.some(v=>['lane-count','lane-width','median','alignment','missing-port'].includes(v.kind)),
    edgeCompatible=!issues.some(v=>['edge-section','alignment','missing-port'].includes(v.kind)),
    left=Math.max(a.left,b.left),right=Math.max(a.right,b.right),roadWidth=left+right,
    center=path(ps),leftEdge=path(parallel(ps,left)),rightEdge=path(parallel(ps,-right)),
    midpoint=ps[Math.floor(ps.length/2)];
  const laneLines:number[]=[];
  if(from&&laneCompatible){
    for(let i=1;i<from.forwardLanes;i++)laneLines.push(from.median/2+i*from.forwardLaneWidth);
    for(let i=1;i<from.backwardLanes;i++)laneLines.push(-(from.median/2+i*from.backwardLaneWidth));
  }
  const edgePieces:React.ReactNode[]=[];
  if(from&&edgeCompatible){
    let forward=from.median/2+from.forwardLanes*from.forwardLaneWidth;
    from.forwardBands.forEach((band,index)=>{edgePieces.push(<path key={'f-'+index} data-network-link-band={band.type} data-link-side="forward" d={stripPath(ps,forward,forward+band.width)} fill={bandFill[band.type]}/>);forward+=band.width;});
    if(from.forwardWalk>0)edgePieces.push(<path key="f-walk" data-network-link-sidewalk="forward" d={stripPath(ps,forward,forward+from.forwardWalk)} fill="#b9c5cc"/>);
    let backward=from.median/2+from.backwardLanes*from.backwardLaneWidth;
    from.backwardBands.forEach((band,index)=>{edgePieces.push(<path key={'b-'+index} data-network-link-band={band.type} data-link-side="backward" d={stripPath(ps,-backward,-(backward+band.width))} fill={bandFill[band.type]}/>);backward+=band.width;});
    if(from.backwardWalk>0)edgePieces.push(<path key="b-walk" data-network-link-sidewalk="backward" d={stripPath(ps,-backward,-(backward+from.backwardWalk))} fill="#b9c5cc"/>);
  }
  return <g data-network-link={link.id} onPointerDown={e=>{e.stopPropagation();onSelect();}} style={{cursor:'pointer'}}>
    {edgePieces}
    <path d={center} stroke={selected?'#1c7974':'#9aa8ae'} strokeWidth={roadWidth+1.2} fill="none" strokeLinejoin="round"/>
    <path d={center} stroke="#35424e" strokeWidth={roadWidth} fill="none" strokeLinejoin="round"/>
    {from?.median&&<path d={center} stroke="#83957a" strokeWidth={Math.max(.5,from.median)} fill="none" strokeLinejoin="round"/>}
    <path d={leftEdge} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    <path d={rightEdge} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    {laneLines.map(offset=><path key={offset} d={path(parallel(ps,offset))} stroke="#e7ecef" strokeWidth=".16" strokeDasharray="3 5" fill="none"/>)}
    {!compatible&&<g transform={`translate(${midpoint.x} ${midpoint.y})`} pointerEvents="none"><circle data-network-link-warning="true" r="3.2" fill="#c3914c" stroke="white" strokeWidth=".6"/><text y=".9" textAnchor="middle" fontSize="2.6" fill="white" fontWeight="700">!</text></g>}
    <path d={center} stroke="transparent" strokeWidth={Math.max(14,roadWidth+8)} fill="none"/>
    {selected&&link.via.map((p,index)=><circle key={'via-'+index} data-link-via={index} cx={p.x} cy={p.y} r={selectedVertex===index?2.8:2.2} fill={selectedVertex===index?'#0f7d77':'white'} stroke="#0f7d77" strokeWidth=".6" onPointerDown={e=>{e.stopPropagation();onVertexSelect(index);onVertexMoveStart(index,e);}} style={{cursor:'move'}}/>)}
  </g>;
}

export function JunctionInstanceDrawing({
  junction,selected,linkMode,occupiedPorts,onSelect,onMoveStart,onPort
}:{
  junction:JunctionInstance;
  selected:boolean;
  linkMode:boolean;
  occupiedPorts:ReadonlySet<string>;
  onSelect:()=>void;
  onMoveStart:(e:React.PointerEvent<SVGCircleElement>)=>void;
  onPort:(ref:PortRef)=>void;
}){
  const display=junctionDisplayDesign(junction),rotation=worldJunctionRotation(junction);
  return <g data-network-junction={junction.id}>
    <g transform={`translate(${junction.x} ${junction.y}) rotate(${rotation})`} pointerEvents="none">
      <Drawing d={display} selected={-1} onSelect={()=>{}} handlesEnabled={false}/>
    </g>
    {activeArmIds(junction).map(armId=>{
      const p=portPoint(junction,armId),arm=junction.design.arms[armId],hitWidth=Math.max(14,arm.median+(arm.incoming+arm.outgoing)*arm.width+8);
      return <line key={'hit-'+armId} data-network-junction-hit={`${junction.id}:${armId}`} x1={junction.x} y1={junction.y} x2={p.x} y2={p.y}
        stroke="transparent" strokeWidth={hitWidth} pointerEvents={linkMode?'none':'stroke'} onPointerDown={e=>{e.stopPropagation();onSelect();}} style={{cursor:linkMode?undefined:'pointer'}}/>;
    })}
    <circle data-network-instance-handle="true" cx={junction.x} cy={junction.y} r={selected?7:5.2} fill={selected?'#0f7d77':'#ffffffdd'} stroke="#0f7d77" strokeWidth=".7"
      onPointerDown={e=>{e.stopPropagation();onSelect();onMoveStart(e);}} style={{cursor:'move'}}/>
    {selected&&<g data-network-instance-selection="true" pointerEvents="none"><circle cx={junction.x} cy={junction.y} r="10" fill="none" stroke="#0f7d77" strokeWidth=".25" strokeDasharray="1.2 1.2"/></g>}
    {activeArmIds(junction).map(armId=>{
      const p=portPoint(junction,armId),ref={junctionId:junction.id,armId},key=`${junction.id}:${armId}`,occupied=occupiedPorts.has(key),interactive=linkMode&&!occupied;
      return <circle key={armId} data-network-port={key} data-network-port-occupied={occupied?'true':undefined} cx={p.x} cy={p.y} r={linkMode?(occupied?1.8:2.4):1.5}
        fill={linkMode?(occupied?'#9ca9ae':'#ffffff'):'#8ba2aa'} stroke={linkMode?(occupied?'#ffffff':'#0e8a82'):'white'} strokeWidth=".55"
        pointerEvents={interactive?'auto':'none'} onPointerDown={e=>{e.stopPropagation();onPort(ref);}} style={{cursor:interactive?'crosshair':undefined}}>
        <title>{occupied?'port นี้เชื่อม Road Link อยู่แล้ว':`port ${key}`}</title>
      </circle>;
    })}
  </g>;
}

export function NetworkDrawing({
  project,selection,linkMode,selectedLinkVertex,onSelect,onJunctionMoveStart,onLinkVertexMoveStart,onLinkVertexSelect,onPort
}:{
  project:NetworkProject;
  selection:NetworkSelection;
  linkMode:boolean;
  selectedLinkVertex:number|null;
  onSelect:(selection:NetworkSelection)=>void;
  onJunctionMoveStart:(id:string,e:React.PointerEvent<SVGCircleElement>)=>void;
  onLinkVertexMoveStart:(id:string,index:number,e:React.PointerEvent<SVGCircleElement>)=>void;
  onLinkVertexSelect:(index:number)=>void;
  onPort:(ref:PortRef)=>void;
}){
  const occupiedPorts=new Set(project.links.flatMap(link=>[`${link.from.junctionId}:${link.from.armId}`,`${link.to.junctionId}:${link.to.armId}`]));
  return <g>
    {project.links.map(link=><RoadLinkDrawing key={link.id} project={project} link={link} selected={selection?.kind==='link'&&selection.id===link.id} selectedVertex={selection?.kind==='link'&&selection.id===link.id?selectedLinkVertex:null} onSelect={()=>onSelect({kind:'link',id:link.id})} onVertexSelect={onLinkVertexSelect} onVertexMoveStart={(index,e)=>onLinkVertexMoveStart(link.id,index,e)}/>)}
    {project.junctions.map(junction=><JunctionInstanceDrawing key={junction.id} junction={junction} selected={selection?.kind==='junction'&&selection.id===junction.id} linkMode={linkMode} occupiedPorts={occupiedPorts} onSelect={()=>onSelect({kind:'junction',id:junction.id})} onMoveStart={e=>onJunctionMoveStart(junction.id,e)} onPort={onPort}/>)}
  </g>;
}
