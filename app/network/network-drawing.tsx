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
  const left=section.median/2+section.forwardLanes*section.laneWidth,right=section.median/2+section.backwardLanes*section.laneWidth;
  return{left,right,total:left+right};
};

export function RoadLinkDrawing({
  project,link,selected,selectedVertex,onSelect,onVertexMoveStart,onVertexSelect
}:{project:NetworkProject;link:RoadLink;selected:boolean;selectedVertex:number|null;onSelect:()=>void;onVertexMoveStart:(index:number,e:React.PointerEvent<SVGCircleElement>)=>void;onVertexSelect:(index:number)=>void}){
  const ps=linkPoints(project,link);
  if(ps.length<2)return null;
  const from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to'),a=sectionHalf(from),b=sectionHalf(to),
    compatible=linkIssues(project,link).length===0,
    left=Math.max(a.left,b.left),right=Math.max(a.right,b.right),roadWidth=left+right,
    center=path(ps),leftEdge=path(parallel(ps,left)),rightEdge=path(parallel(ps,-right)),
    midpoint=ps[Math.floor(ps.length/2)];
  const laneLines:number[]=[];
  if(from&&compatible){
    for(let i=1;i<from.forwardLanes;i++)laneLines.push(from.median/2+i*from.laneWidth);
    for(let i=1;i<from.backwardLanes;i++)laneLines.push(-(from.median/2+i*from.laneWidth));
  }
  return <g data-network-link={link.id} onPointerDown={e=>{e.stopPropagation();onSelect();}} style={{cursor:'pointer'}}>
    <path d={center} stroke={selected?'#1c7974':'#9aa8ae'} strokeWidth={roadWidth+1.2} fill="none" strokeLinejoin="round"/>
    <path d={center} stroke="#35424e" strokeWidth={roadWidth} fill="none" strokeLinejoin="round"/>
    {from?.median&&<path d={center} stroke="#83957a" strokeWidth={Math.max(.5,from.median)} fill="none" strokeLinejoin="round"/>}
    <path d={leftEdge} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    <path d={rightEdge} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    {laneLines.map(offset=><path key={offset} d={path(parallel(ps,offset))} stroke="#e7ecef" strokeWidth=".16" strokeDasharray="3 5" fill="none"/>)}
    {!compatible&&<g transform={`translate(${midpoint.x} ${midpoint.y})`} pointerEvents="none"><circle r="3.2" fill="#c3914c" stroke="white" strokeWidth=".6"/><text y=".9" textAnchor="middle" fontSize="2.6" fill="white" fontWeight="700">!</text></g>}
    <path d={center} stroke="transparent" strokeWidth={Math.max(14,roadWidth+8)} fill="none"/>
    {selected&&link.via.map((p,index)=><circle key={'via-'+index} data-link-via={index} cx={p.x} cy={p.y} r={selectedVertex===index?2.8:2.2} fill={selectedVertex===index?'#0f7d77':'white'} stroke="#0f7d77" strokeWidth=".6" onPointerDown={e=>{e.stopPropagation();onVertexSelect(index);onVertexMoveStart(index,e);}} style={{cursor:'move'}}/>)}
  </g>;
}

export function JunctionInstanceDrawing({
  junction,selected,linkMode,onSelect,onMoveStart,onPort
}:{
  junction:JunctionInstance;
  selected:boolean;
  linkMode:boolean;
  onSelect:()=>void;
  onMoveStart:(e:React.PointerEvent<SVGCircleElement>)=>void;
  onPort:(ref:PortRef)=>void;
}){
  const display=junctionDisplayDesign(junction),rotation=worldJunctionRotation(junction);
  return <g data-network-junction={junction.id}>
    <g transform={`translate(${junction.x} ${junction.y}) rotate(${rotation})`} pointerEvents="none">
      <Drawing d={display} selected={-1} onSelect={()=>{}} handlesEnabled={false}/>
    </g>
    <circle cx={junction.x} cy={junction.y} r={selected?7:5.2} fill={selected?'#0f7d77':'#ffffffdd'} stroke="#0f7d77" strokeWidth=".7"
      onPointerDown={e=>{e.stopPropagation();onSelect();onMoveStart(e);}} style={{cursor:'move'}}/>
    {selected&&<g pointerEvents="none"><circle cx={junction.x} cy={junction.y} r="10" fill="none" stroke="#0f7d77" strokeWidth=".25" strokeDasharray="1.2 1.2"/></g>}
    {activeArmIds(junction).map(armId=>{
      const p=portPoint(junction,armId),ref={junctionId:junction.id,armId};
      return <circle key={armId} data-network-port={`${junction.id}:${armId}`} cx={p.x} cy={p.y} r={linkMode?2.4:1.5}
        fill={linkMode?'#ffffff':'#8ba2aa'} stroke={linkMode?'#0e8a82':'white'} strokeWidth=".55"
        pointerEvents={linkMode?'auto':'none'} onPointerDown={e=>{e.stopPropagation();onPort(ref);}} style={{cursor:linkMode?'crosshair':undefined}}/>;
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
  return <g>
    {project.links.map(link=><RoadLinkDrawing key={link.id} project={project} link={link} selected={selection?.kind==='link'&&selection.id===link.id} selectedVertex={selection?.kind==='link'&&selection.id===link.id?selectedLinkVertex:null} onSelect={()=>onSelect({kind:'link',id:link.id})} onVertexSelect={onLinkVertexSelect} onVertexMoveStart={(index,e)=>onLinkVertexMoveStart(link.id,index,e)}/>)}
    {project.junctions.map(junction=><JunctionInstanceDrawing key={junction.id} junction={junction} selected={selection?.kind==='junction'&&selection.id===junction.id} linkMode={linkMode} onSelect={()=>onSelect({kind:'junction',id:junction.id})} onMoveStart={e=>onJunctionMoveStart(junction.id,e)} onPort={onPort}/>)}
  </g>;
}
