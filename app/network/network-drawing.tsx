'use client';
import Drawing from '../junction/drawing';
import {path} from '../junction/geometry';
import {profiledParallel,variableParallel} from '@/lib/alignment';
import {
  activeArmIds,assessPortConnection,junctionDisplayDesign,linkEndSection,linkIssues,linkLinearTransitionPossible,linkPoints,portPoint,worldJunctionRotation,
  type JunctionInstance,type NetworkProject,type PortRef,type RoadLink,type TransferConnector
} from '@/lib/network-project';
import {resolveLinkSectionGeometry} from '@/lib/network-link-geometry';
import {resolveTransferConnectorGores,resolveTransferConnectorPavement,resolveTransferPortGeometry} from '@/lib/transfer-geometry';

export type NetworkSelection={kind:'junction'|'link'|'transfer-port'|'transfer-connector';id:string}|null;
export type NetworkComparisonFocus={kind:'junction'|'roadlink';id:string}|null;

const sectionHalf=(section:ReturnType<typeof linkEndSection>)=>{
  if(!section)return{left:5,right:5,total:10};
  const left=section.median/2+section.forwardLanes*section.forwardLaneWidth,right=section.median/2+section.backwardLanes*section.backwardLaneWidth;
  return{left,right,total:left+right};
};
const bandFill:Record<string,string>={bike:'#467d70',motorcycle:'#526c91',shoulder:'#66727c',buffer:'#899396'};
function variableStripPath(ps:{x:number;y:number}[],innerStart:number,innerEnd:number,outerStart:number,outerEnd:number){
  return path([...variableParallel(ps,innerStart,innerEnd),...variableParallel(ps,outerStart,outerEnd).reverse()],true);
}
function profiledStripPath(ps:{x:number;y:number}[],inner:number[],outer:number[]){
  return path([...profiledParallel(ps,inner),...profiledParallel(ps,outer).reverse()],true);
}
function profiledLinePaths(ps:{x:number;y:number}[],offsets:(number|null)[]){
  const out:string[]=[];let points:{x:number;y:number}[]=[],values:number[]=[];
  const flush=()=>{if(points.length>1)out.push(path(profiledParallel(points,values)));points=[];values=[];};
  offsets.forEach((offset,i)=>{if(offset===null){flush();return;}points.push(ps[i]);values.push(offset);});
  flush();return out;
}

export function RoadLinkDrawing({
  project,link,selected,comparisonFocused,parallelRole,parallelCorridorId,selectedVertex,transferPlacementActive,onSelect,onInsertVertex,onVertexMoveStart,onVertexSelect
}:{project:NetworkProject;link:RoadLink;selected:boolean;comparisonFocused:boolean;parallelRole?:'mainline'|'left'|'right'|'draft-mainline';parallelCorridorId?:string;selectedVertex:number|null;transferPlacementActive:boolean;onSelect:(e:React.PointerEvent<SVGGElement>)=>void;onInsertVertex:(e:React.MouseEvent<SVGGElement>)=>void;onVertexMoveStart:(index:number,e:React.PointerEvent<SVGCircleElement>)=>void;onVertexSelect:(index:number)=>void}){
  const ps=linkPoints(project,link);
  if(ps.length<2)return null;
  const from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to'),a=sectionHalf(from),b=sectionHalf(to),resolved=resolveLinkSectionGeometry(project,link),
    issues=linkIssues(project,link),compatible=issues.length===0,linear=!!resolved?.linear&&linkLinearTransitionPossible(project,link),
    laneCompatible=!issues.some(v=>['lane-count','lane-width','median','alignment','missing-port'].includes(v.kind)),
    edgeCompatible=!issues.some(v=>['lane-count','lane-width','median','edge-section','alignment','missing-port'].includes(v.kind)),
    renderPoints=resolved?.points??ps,
    left0=Math.max(a.left,b.left),right0=Math.max(a.right,b.right),roadWidth=resolved?Math.max(...resolved.left.map((v,i)=>v+resolved.right[i])):left0+right0,center=path(ps),
    roadSurface=resolved?profiledStripPath(renderPoints,resolved.right.map(v=>-v),resolved.left):variableStripPath(ps,-right0,-right0,left0,left0),
    leftEdge=resolved?path(profiledParallel(renderPoints,resolved.left)):path(variableParallel(ps,left0,left0)),
    rightEdge=resolved?path(profiledParallel(renderPoints,resolved.right.map(v=>-v))):path(variableParallel(ps,-right0,-right0)),
    midpoint=ps[Math.floor(ps.length/2)];
  const laneLines:{start:number;end:number;key:string}[]=[];
  if(from&&to&&!linear&&laneCompatible){
    for(let i=1;i<from.forwardLanes;i++)laneLines.push({start:from.median/2+i*from.forwardLaneWidth,end:from.median/2+i*from.forwardLaneWidth,key:'f'+i});
    for(let i=1;i<from.backwardLanes;i++)laneLines.push({start:-(from.median/2+i*from.backwardLaneWidth),end:-(from.median/2+i*from.backwardLaneWidth),key:'b'+i});
  }
  const edgePieces:React.ReactNode[]=[];
  if(resolved&&(linear||edgeCompatible)){
    resolved.forwardBands.forEach((band,index)=>edgePieces.push(<path key={'rf-'+index} data-network-link-band={band.type} data-link-side="forward" d={profiledStripPath(renderPoints,band.inner,band.outer)} fill={bandFill[band.type]}/>));
    resolved.backwardBands.forEach((band,index)=>edgePieces.push(<path key={'rb-'+index} data-network-link-band={band.type} data-link-side="backward" d={profiledStripPath(renderPoints,band.inner,band.outer)} fill={bandFill[band.type]}/>));
    if(resolved.forwardWalk)edgePieces.push(<path key="rf-walk" data-network-link-sidewalk="forward" d={profiledStripPath(renderPoints,resolved.forwardWalk.inner,resolved.forwardWalk.outer)} fill="#b9c5cc"/>);
    if(resolved.backwardWalk)edgePieces.push(<path key="rb-walk" data-network-link-sidewalk="backward" d={profiledStripPath(renderPoints,resolved.backwardWalk.inner,resolved.backwardWalk.outer)} fill="#b9c5cc"/>);
  }else if(from&&to&&edgeCompatible){
    let f0=a.left;
    from.forwardBands.forEach((band,index)=>{edgePieces.push(<path key={'f-'+index} data-network-link-band={band.type} data-link-side="forward" d={variableStripPath(ps,f0,f0,f0+band.width,f0+band.width)} fill={bandFill[band.type]}/>);f0+=band.width;});
    if(from.forwardWalk>0)edgePieces.push(<path key="f-walk" data-network-link-sidewalk="forward" d={variableStripPath(ps,f0,f0,f0+from.forwardWalk,f0+from.forwardWalk)} fill="#b9c5cc"/>);
    let b0=-a.right;
    from.backwardBands.forEach((band,index)=>{edgePieces.push(<path key={'b-'+index} data-network-link-band={band.type} data-link-side="backward" d={variableStripPath(ps,b0,b0,b0-band.width,b0-band.width)} fill={bandFill[band.type]}/>);b0-=band.width;});
    if(from.backwardWalk>0)edgePieces.push(<path key="b-walk" data-network-link-sidewalk="backward" d={variableStripPath(ps,b0,b0,b0-from.backwardWalk,b0-from.backwardWalk)} fill="#b9c5cc"/>);
  }
  return <g data-network-link={link.id} data-network-transfer-placement-host={transferPlacementActive?'true':undefined} data-network-comparison-active-focus={comparisonFocused?'true':undefined} onPointerDown={e=>{e.stopPropagation();onSelect(e);}} onDoubleClick={e=>{e.stopPropagation();onInsertVertex(e);}} style={{cursor:'pointer'}}>
    {edgePieces}
    {selected&&<path d={roadSurface} stroke="#1c7974" strokeWidth="1.2" fill="#35424e" strokeLinejoin="round"/>}
    {!selected&&<path d={roadSurface} stroke="#9aa8ae" strokeWidth=".35" fill="#35424e" strokeLinejoin="round"/>}
    {from&&to&&(from.median>0||to.median>0)&&<path data-network-link-median="true" d={resolved?profiledStripPath(renderPoints,resolved.medianHalf.map(v=>-v),resolved.medianHalf):variableStripPath(ps,-from.median/2,-from.median/2,from.median/2,from.median/2)} fill="#83957a"/>}
    <path data-scene-detail="true" d={leftEdge} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    <path data-scene-detail="true" d={rightEdge} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    {linear&&resolved?resolved.laneLines.flatMap(line=>profiledLinePaths(renderPoints,line.offsets).map((d,index)=><path key={line.id+'-'+index} data-scene-detail="true" data-network-link-lane-transition={line.id} d={d} stroke="#e7ecef" strokeWidth=".16" strokeDasharray="3 5" fill="none"/>)):laneLines.map(line=><path key={line.key} data-scene-detail="true" data-network-link-lane-line="true" d={path(variableParallel(ps,line.start,line.end))} stroke="#e7ecef" strokeWidth=".16" strokeDasharray="3 5" fill="none"/>)}
    {transferPlacementActive&&<path data-network-transfer-placement-guide="true" d={center} stroke="#d18a24" strokeWidth="2.1" strokeDasharray="6 3" fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke"/>}
    {parallelRole&&<path className="network-parallel-link-focus" data-network-parallel-role={parallelRole} data-network-parallel-corridor={parallelCorridorId} d={center} fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke"/>}
    {!compatible&&<g transform={`translate(${midpoint.x} ${midpoint.y})`} pointerEvents="none"><circle data-network-link-warning="true" r="3.2" fill="#c3914c" stroke="white" strokeWidth=".6"/><text y=".9" textAnchor="middle" fontSize="2.6" fill="white" fontWeight="700">!</text></g>}
    {comparisonFocused&&<path data-network-comparison-active-focus-path="true" d={center} stroke="#0e9f99" strokeWidth="2.2" strokeDasharray="7 3" fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke"/>}
    <path d={center} stroke="transparent" strokeWidth={Math.max(14,roadWidth+8)} fill="none"/>
    {selected&&link.via.map((p,index)=><g key={'via-'+index} data-link-via-group={index}><circle data-link-via={index} cx={p.x} cy={p.y} r={selectedVertex===index?2.8:2.2} fill={selectedVertex===index?'#0f7d77':'white'} stroke="#0f7d77" strokeWidth=".6" onPointerDown={e=>{e.stopPropagation();onVertexSelect(index);onVertexMoveStart(index,e);}} style={{cursor:'move'}}/>{p.radius>0&&<text x={p.x+3.5} y={p.y-2.8} fontSize="2.4" fill="#0f6f69" pointerEvents="none">R{Math.round(p.radius)}</text>}</g>)}
  </g>;
}

export function JunctionInstanceDrawing({
  project,zoom,junction,selected,comparisonFocused,selectedArm,linkMode,occupiedPorts,pendingPort,onSelect,onArmSelect,onMoveStart,onArmMoveStart,onPort
}:{
  project:NetworkProject;
  zoom:number;
  junction:JunctionInstance;
  selected:boolean;
  comparisonFocused:boolean;
  selectedArm:number|null;
  linkMode:boolean;
  occupiedPorts:ReadonlySet<string>;
  pendingPort:PortRef|null;
  onSelect:()=>void;
  onArmSelect:(armId:number)=>void;
  onMoveStart:(e:React.PointerEvent<SVGCircleElement>)=>void;
  onArmMoveStart:(armId:number,e:React.PointerEvent<SVGElement>)=>void;
  onPort:(ref:PortRef)=>void;
}){
  const display=junctionDisplayDesign(junction),rotation=worldJunctionRotation(junction),interactionScale=1/Math.max(.2,zoom),activeIds=activeArmIds(junction),
    hitArmIds=[...activeIds].sort((a,b)=>(a===selectedArm?1:0)-(b===selectedArm?1:0));
  return <g data-network-junction={junction.id} data-network-comparison-active-focus={comparisonFocused?'true':undefined}>
    <g transform={`translate(${junction.x} ${junction.y}) rotate(${rotation})`} pointerEvents="none">
      <Drawing d={display} selected={-1} onSelect={()=>{}} handlesEnabled={false}/>
    </g>
    {hitArmIds.map(armId=>{
      const p=portPoint(junction,armId),arm=junction.design.arms[armId],hitWidth=Math.max(arm.median+(arm.incoming+arm.outgoing)*arm.width+10,20*interactionScale),armSelected=selected&&selectedArm===armId,
        gripHit=12*interactionScale,gripVisible=3.6*interactionScale;
      return <g key={'hit-'+armId}>
        <line data-network-junction-hit={`${junction.id}:${armId}`} data-network-arm-select-target="true" x1={junction.x} y1={junction.y} x2={p.x} y2={p.y}
          stroke="transparent" strokeWidth={hitWidth} pointerEvents={linkMode?'none':'stroke'}
          onPointerDown={e=>{e.preventDefault();e.stopPropagation();onSelect();onArmSelect(armId);}} style={{cursor:linkMode?undefined:'pointer'}}/>
        {armSelected&&<line data-network-arm-selection={`${junction.id}:${armId}`} x1={junction.x} y1={junction.y} x2={p.x} y2={p.y}
          stroke="#0eabb8" strokeWidth={1.15*interactionScale} strokeDasharray={`${2.4*interactionScale} ${1.5*interactionScale}`} pointerEvents="none"/>}
        {armSelected&&!linkMode&&<>
          <circle data-network-arm-handle-visible={`${junction.id}:${armId}`} cx={p.x} cy={p.y} r={gripVisible} fill="#ffffff" stroke="#0e8995" strokeWidth={.75*interactionScale} pointerEvents="none"/>
          <circle data-network-arm-handle={`${junction.id}:${armId}`} data-network-arm-hit-radius={gripHit.toFixed(2)} cx={p.x} cy={p.y} r={gripHit} fill="transparent" stroke="transparent"
            onPointerDown={e=>{e.preventDefault();e.stopPropagation();onArmMoveStart(armId,e);}} style={{cursor:'grab'}}>
            <title>ลากจาก grip ที่ปลายแขนเพื่อเปลี่ยนมุม/ความยาว</title>
          </circle>
        </>}
      </g>;
    })}
    {comparisonFocused&&<g data-network-comparison-active-focus-ring="true" pointerEvents="none">{activeIds.map(armId=>{const p=portPoint(junction,armId);return <line key={armId} x1={junction.x} y1={junction.y} x2={p.x} y2={p.y} stroke="#0e9f99" strokeWidth="1.5" strokeDasharray="7 3" vectorEffect="non-scaling-stroke"/>;})}<circle cx={junction.x} cy={junction.y} r={13*interactionScale} fill="none" stroke="#0e9f99" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></g>}
    <circle data-network-instance-handle="true" cx={junction.x} cy={junction.y} r={selected?7:5.2} fill={selected?'#0f7d77':'#ffffffdd'} stroke="#0f7d77" strokeWidth=".7"
      onPointerDown={e=>{e.stopPropagation();onSelect();onMoveStart(e);}} style={{cursor:'move'}}/>
    {selected&&<g data-network-instance-selection="true" pointerEvents="none"><circle cx={junction.x} cy={junction.y} r="10" fill="none" stroke="#0f7d77" strokeWidth=".25" strokeDasharray="1.2 1.2"/></g>}
    {activeArmIds(junction).map(armId=>{
      const p=portPoint(junction,armId),ref={junctionId:junction.id,armId},key=`${junction.id}:${armId}`,occupied=occupiedPorts.has(key),
        source=!!pendingPort&&pendingPort.junctionId===junction.id&&pendingPort.armId===armId,
        sameJunction=!!pendingPort&&pendingPort.junctionId===junction.id&&!source,
        facing=pendingPort&&!source&&!sameJunction&&!occupied?assessPortConnection(project,pendingPort,ref):null,
        facingInvalid=facing?.status==='invalid',facingCaution=facing?.status==='caution',
        interactive=linkMode&&!occupied&&!sameJunction&&!facingInvalid,
        state=source?'source':occupied?'occupied':sameJunction?'invalid':facingInvalid?'facing-invalid':facingCaution?'caution':pendingPort?'target':'available';
      return <circle key={armId} data-network-port={key} data-network-port-state={state} data-network-port-facing={facing?.status} data-network-port-occupied={occupied?'true':undefined} cx={p.x} cy={p.y}
        r={linkMode?(source?3:occupied||sameJunction||facingInvalid?1.8:facingCaution?2.7:2.5):1.5}
        fill={linkMode?(source?'#e3a33d':occupied||sameJunction?'#9ca9ae':facingInvalid?'#f1dada':facingCaution?'#fff4d8':'#ffffff'):'#8ba2aa'}
        stroke={linkMode?(source?'#fff4d6':occupied||sameJunction?'#ffffff':facingInvalid?'#b85858':facingCaution?'#c48a28':'#0e8a82'):'white'} strokeWidth={source?'.8':'.55'}
        pointerEvents={interactive||source?'auto':'none'} onPointerDown={e=>{e.stopPropagation();if(source||interactive)onPort(ref);}} style={{cursor:interactive?'crosshair':source?'pointer':undefined}}>
        <title>{source?'port ต้นทาง · คลิกซ้ำเพื่อยกเลิก':occupied?'port นี้เชื่อม Road Link อยู่แล้ว':sameJunction?'เชื่อม Road Link ข้ามคนละ Junction เท่านั้น':facingInvalid?`port หันออกจากแนวเชื่อม · FROM ${facing?.fromDeviation.toFixed(0)}° / TO ${facing?.toDeviation.toFixed(0)}°`:facingCaution?`เชื่อมได้ แต่ต้องโค้งเข้าหา port มาก · FROM ${facing?.fromDeviation.toFixed(0)}° / TO ${facing?.toDeviation.toFixed(0)}°`:pendingPort?'ปลายทางที่หันเข้าหากัน · คลิกเพื่อเชื่อม':`port ${key}`}</title>
      </circle>;
    })}
  </g>;
}

function RoadLinkComparisonGhost({project,link,focused}:{project:NetworkProject;link:RoadLink;focused:boolean}){
  const ps=linkPoints(project,link);if(ps.length<2)return null;
  const from=linkEndSection(project,link,'from'),to=linkEndSection(project,link,'to'),a=sectionHalf(from),b=sectionHalf(to),resolved=resolveLinkSectionGeometry(project,link),
    renderPoints=resolved?.points??ps,left0=Math.max(a.left,b.left),right0=Math.max(a.right,b.right),
    leftEdge=resolved?path(profiledParallel(renderPoints,resolved.left)):path(variableParallel(ps,left0,left0)),
    rightEdge=resolved?path(profiledParallel(renderPoints,resolved.right.map(v=>-v))):path(variableParallel(ps,-right0,-right0));
  return <g data-network-comparison-link={link.id} data-network-comparison-reference-focus={focused?'true':undefined}>
    <path d={leftEdge} stroke="#b56f2d" strokeWidth=".7" strokeDasharray="4 3" fill="none" vectorEffect="non-scaling-stroke"/>
    <path d={rightEdge} stroke="#b56f2d" strokeWidth=".7" strokeDasharray="4 3" fill="none" vectorEffect="non-scaling-stroke"/>
    <path d={path(ps)} stroke={focused?'#d4761f':'#b56f2d'} strokeWidth={focused?2.2:.45} strokeDasharray={focused?'7 3':'2 3'} fill="none" vectorEffect="non-scaling-stroke"/>
  </g>;
}

export function NetworkComparisonGhost({project,focus}:{project:NetworkProject;focus:NetworkComparisonFocus}){
  return <g data-network-comparison-ghost="true" pointerEvents="none">
    {project.links.map(link=><RoadLinkComparisonGhost key={link.id} project={project} link={link} focused={focus?.kind==='roadlink'&&focus.id===link.id}/>)}
    {project.junctions.map(junction=>{
      const display=junctionDisplayDesign(junction),rotation=worldJunctionRotation(junction);
      const focused=focus?.kind==='junction'&&focus.id===junction.id;
      return <g key={junction.id} data-network-comparison-junction={junction.id} data-network-comparison-reference-focus={focused?'true':undefined}>
        <g transform={`translate(${junction.x} ${junction.y}) rotate(${rotation})`} opacity=".18">
          <Drawing d={display} selected={-1} onSelect={()=>{}} handlesEnabled={false}/>
        </g>
        {activeArmIds(junction).map(armId=>{const p=portPoint(junction,armId);return <line key={armId} x1={junction.x} y1={junction.y} x2={p.x} y2={p.y} stroke="#b56f2d" strokeWidth=".45" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>;})}
        <circle cx={junction.x} cy={junction.y} r={focused?10:4} fill="#fff7ec" fillOpacity=".65" stroke={focused?'#d4761f':'#b56f2d'} strokeWidth={focused?2:.7} vectorEffect="non-scaling-stroke"/>
      </g>;
    })}
  </g>;
}

export function TransferConnectorDrawing({
  project,connector,selected,selectedVertex,onSelect,onInsertVertex,onVertexMoveStart,onVertexSelect
}:{project:NetworkProject;connector:TransferConnector;selected:boolean;selectedVertex:number|null;onSelect:()=>void;onInsertVertex:(e:React.MouseEvent<SVGGElement>)=>void;onVertexMoveStart:(index:number,e:React.PointerEvent<SVGCircleElement>)=>void;onVertexSelect:(index:number)=>void}){
  const g=resolveTransferConnectorPavement(project,connector);if(!g)return null;
  const surface=path([...g.left,...[...g.right].reverse()],true),gores=resolveTransferConnectorGores(project,connector),center=path(g.alignment.points);
  return <g data-network-transfer-connector={connector.id} data-network-transfer-selected={selected?'true':undefined} onPointerDown={e=>{e.stopPropagation();onSelect();}} onDoubleClick={e=>{e.stopPropagation();onInsertVertex(e);}} style={{cursor:'pointer'}}>
    <path d={surface} fill="#35424e" stroke={selected?'#1c7974':'#9aa8ae'} strokeWidth={selected?'1.1':'.35'} strokeLinejoin="round"/>
    <path data-scene-detail="true" d={path(g.left)} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    <path data-scene-detail="true" d={path(g.right)} stroke="#f3f6f7" strokeWidth=".22" fill="none"/>
    {g.laneLines.map((line,index)=><path key={index} data-scene-detail="true" data-network-transfer-lane-line={index} d={path(line)} stroke="#e7ecef" strokeWidth=".16" strokeDasharray="3 5" fill="none"/>)}
    <path d={center} stroke="transparent" strokeWidth={Math.max(12,g.width+7)} fill="none"/>
    {gores.map(result=>result.gore?<g key={result.terminal} data-network-transfer-gore={result.terminal} data-network-transfer-gore-level={result.treatment.level}>
      <path data-network-transfer-neutral-gore={result.terminal} d={path(result.gore.neutralPolygon,true)} fill="#d8cfaa" fillOpacity=".48" stroke="#f3e9be" strokeWidth=".18" strokeDasharray="1.2 1.1"/>
      <circle data-scene-detail="true" data-network-transfer-painted-nose={result.terminal} cx={result.gore.paintedNose.x} cy={result.gore.paintedNose.y} r=".65" fill="#f5f2dc" stroke="#8d8154" strokeWidth=".18"/>
      {result.gore.physicalNose&&<path data-network-transfer-physical-nose={result.terminal} d={path(result.gore.physicalNose.polygon,true)} fill="#83957a" stroke="#65725f" strokeWidth=".18"/>}
    </g>:<g key={result.terminal} data-network-transfer-gore={result.terminal} data-network-transfer-gore-level={result.treatment.level} data-network-transfer-gore-error={result.issue??'unresolved'}/>)}
    {selected&&connector.via.map((point,index)=><g key={'transfer-via-'+index} data-transfer-via-group={index}>
      <circle data-transfer-via={index} cx={point.x} cy={point.y} r={selectedVertex===index?2.8:2.2} fill={selectedVertex===index?'#0f7d77':'white'} stroke="#0f7d77" strokeWidth=".6" onPointerDown={e=>{e.stopPropagation();onVertexSelect(index);onVertexMoveStart(index,e);}} style={{cursor:'move'}}/>
      {point.radius>0&&<text x={point.x+3.5} y={point.y-2.8} fontSize="2.4" fill="#0f6f69" pointerEvents="none">R{Math.round(point.radius)}</text>}
    </g>)}
  </g>;
}
export function TransferPortDrawing({project,portId,selected,onSelect}:{project:NetworkProject;portId:string;selected:boolean;onSelect:()=>void}){
  const g=resolveTransferPortGeometry(project,portId);if(!g)return null;
  const r=selected?2.8:2.1,fill=g.port.terminal==='diverge'?'#d9873f':'#4b8f87';
  return <g data-network-transfer-port={g.port.id} data-network-transfer-port-role={g.port.terminal} data-network-transfer-selected={selected?'true':undefined} onPointerDown={e=>{e.stopPropagation();onSelect();}} style={{cursor:'pointer'}}>
    <circle cx={g.point.x} cy={g.point.y} r={r} fill={fill} stroke={selected?'#153e3b':'white'} strokeWidth={selected?'.8':'.45'}/>
    <circle cx={g.point.x} cy={g.point.y} r="7" fill="transparent"/>
  </g>;
}

export function NetworkDrawing({
  project,zoom,selection,comparisonFocus,parallelCorridorId,parallelDraftMainlineId,transferPlacementLinkId,selectedArm,linkMode,pendingPort,selectedLinkVertex,selectedTransferVertex,onSelect,onLinkSelect,onArmSelect,onJunctionMoveStart,onArmMoveStart,onLinkInsertVertex,onLinkVertexMoveStart,onLinkVertexSelect,onTransferInsertVertex,onTransferVertexMoveStart,onTransferVertexSelect,onPort
}:{
  project:NetworkProject;
  zoom:number;
  selection:NetworkSelection;
  comparisonFocus:NetworkComparisonFocus;
  parallelCorridorId:string|null;
  parallelDraftMainlineId:string|null;
  transferPlacementLinkId:string|null;
  selectedArm:number|null;
  linkMode:boolean;
  pendingPort:PortRef|null;
  selectedLinkVertex:number|null;
  selectedTransferVertex:number|null;
  onSelect:(selection:NetworkSelection)=>void;
  onLinkSelect:(id:string,e:React.PointerEvent<SVGGElement>)=>void;
  onArmSelect:(junctionId:string,armId:number)=>void;
  onJunctionMoveStart:(id:string,e:React.PointerEvent<SVGCircleElement>)=>void;
  onArmMoveStart:(id:string,armId:number,e:React.PointerEvent<SVGElement>)=>void;
  onLinkInsertVertex:(id:string,e:React.MouseEvent<SVGGElement>)=>void;
  onLinkVertexMoveStart:(id:string,index:number,e:React.PointerEvent<SVGCircleElement>)=>void;
  onLinkVertexSelect:(index:number)=>void;
  onTransferInsertVertex:(id:string,e:React.MouseEvent<SVGGElement>)=>void;
  onTransferVertexMoveStart:(id:string,index:number,e:React.PointerEvent<SVGCircleElement>)=>void;
  onTransferVertexSelect:(index:number)=>void;
  onPort:(ref:PortRef)=>void;
}){
  const occupiedPorts=new Set(project.links.flatMap(link=>[`${link.from.junctionId}:${link.from.armId}`,`${link.to.junctionId}:${link.to.armId}`])),
    parallelCorridor=parallelCorridorId?project.parallelCorridors.find(v=>v.id===parallelCorridorId):undefined,
    parallelRole=(id:string):'mainline'|'left'|'right'|'draft-mainline'|undefined=>{
      if(parallelCorridor?.mainlineLinkIds.includes(id))return'mainline';
      for(const chain of parallelCorridor?.frontage??[])if(chain.linkIds.includes(id))return chain.side;
      return id===parallelDraftMainlineId?'draft-mainline':undefined;
    };
  return <g>
    {project.links.map(link=>{const role=parallelRole(link.id);return <RoadLinkDrawing key={link.id} project={project} link={link} selected={selection?.kind==='link'&&selection.id===link.id} comparisonFocused={comparisonFocus?.kind==='roadlink'&&comparisonFocus.id===link.id} parallelRole={role} parallelCorridorId={role==='draft-mainline'?'draft':parallelCorridor?.id} selectedVertex={selection?.kind==='link'&&selection.id===link.id?selectedLinkVertex:null} transferPlacementActive={transferPlacementLinkId===link.id} onSelect={e=>onLinkSelect(link.id,e)} onInsertVertex={e=>onLinkInsertVertex(link.id,e)} onVertexSelect={onLinkVertexSelect} onVertexMoveStart={(index,e)=>onLinkVertexMoveStart(link.id,index,e)}/>;})}
    {project.transferConnectors.map(connector=><TransferConnectorDrawing key={connector.id} project={project} connector={connector} selected={selection?.kind==='transfer-connector'&&selection.id===connector.id} selectedVertex={selection?.kind==='transfer-connector'&&selection.id===connector.id?selectedTransferVertex:null} onSelect={()=>onSelect({kind:'transfer-connector',id:connector.id})} onInsertVertex={e=>onTransferInsertVertex(connector.id,e)} onVertexSelect={onTransferVertexSelect} onVertexMoveStart={(index,e)=>onTransferVertexMoveStart(connector.id,index,e)}/>)}
    {project.transferPorts.map(port=><TransferPortDrawing key={port.id} project={project} portId={port.id} selected={selection?.kind==='transfer-port'&&selection.id===port.id} onSelect={()=>onSelect({kind:'transfer-port',id:port.id})}/>)}
    {project.junctions.map(junction=><JunctionInstanceDrawing key={junction.id} project={project} zoom={zoom} junction={junction} selected={selection?.kind==='junction'&&selection.id===junction.id} comparisonFocused={comparisonFocus?.kind==='junction'&&comparisonFocus.id===junction.id} selectedArm={selection?.kind==='junction'&&selection.id===junction.id?selectedArm:null} linkMode={linkMode} occupiedPorts={occupiedPorts} pendingPort={pendingPort} onSelect={()=>onSelect({kind:'junction',id:junction.id})} onArmSelect={armId=>onArmSelect(junction.id,armId)} onMoveStart={e=>onJunctionMoveStart(junction.id,e)} onArmMoveStart={(armId,e)=>onArmMoveStart(junction.id,armId,e)} onPort={onPort}/>)}
  </g>;
}
