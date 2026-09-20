'use client';
import {useEffect,useRef,useState} from 'react';
import {roundSettings} from './roundabout';
import {sectionFor,pocketsFor,pocketLaneWidth,type Design,type Direction} from './model';
import {allocate,pocketFactor,originFor} from './allocation';
import {armMouth,armTreatmentOrigins,bandWidths,armIslands,edges} from './geometry';
import {selectionKey,type Selection} from './selection';

export const sectionStart=(d:Design,id:number)=>d.type==='roundabout'?roundSettings(d).splitterLength+d.arms[id].medianOffset+8:0;

type Editable={
  value:number;
  min:number;
  max:number;
  step:number;
  label:string;
};
type Piece={
  width:number;
  label:string;
  kind:string;
  group:'incoming'|'median'|'outgoing';
  selection:Selection;
  editable?:Editable;
};

export function sectionPieces(d:Design,id:number,x:number){
  const a=d.arms[id],mouth=armMouth(d,id),edgeSet=edges(d),origins=armTreatmentOrigins(d,id,edgeSet);
  const allocation=allocate(a,x,origins),pieces:Piece[]=[];
  const add=(piece:Piece)=>{if(piece.width>.001)pieces.push(piece);};

  const addDirection=(direction:Direction)=>{
    const group=direction,section=sectionFor(a,direction),p=pocketsFor(a,direction),origin=originFor(origins,direction);
    const bands=bandWidths(a,direction,x,origins),sidePieces:Piece[]=[];
    const push=(width:number,label:string,kind:string,selection:Selection,editable?:Editable)=>{
      if(width>.001)sidePieces.push({width,label,kind,group,selection,editable});
    };
    const mainLaneEdit:Editable={value:section.width,min:2.5,max:4.5,step:.25,label:`ความกว้างเลนหลัก${direction==='incoming'?'ขาเข้า':'ขาออก'}`};
    const auxEdit=(which:'left'|'right'):Editable=>({value:p[which].width??section.width,min:2.5,max:4.5,step:.25,label:`ความกว้าง${direction==='incoming'?'เลนเสริม':'เลนรับ'}${which==='right'?'ชิดเกาะกลาง':'ริมทาง'}`});

    if(direction==='incoming'){
      push(section.walk,'ทางเท้า','walk',{kind:'sidewalk',arm:id,direction},{value:section.walk,min:0,max:8,step:.25,label:'ความกว้างทางเท้าขาเข้า'});
      [...section.bands].map((b,k)=>({b,k})).reverse().forEach(({b,k})=>push(
        bands[k],
        {bike:'จักรยาน',motorcycle:'มอเตอร์ไซค์',shoulder:'ไหล่ทาง',buffer:'คั่น'}[b.type],
        b.type,
        {kind:'band',arm:id,direction,id:b.id},
        {value:b.width,min:.25,max:4.5,step:.25,label:`ความกว้าง${b.type}`}
      ));
      for(let j=p.left.lanes-1;j>=0;j--){
        const w=pocketLaneWidth(a,direction,'left')*pocketFactor(p.left,x,origin);
        push(w,'เสริมริมทาง','aux',{kind:'pocket',arm:id,direction,side:'left',laneIndex:j,role:'aux-left'},auxEdit('left'));
      }
      for(let j=a.incoming-1;j>=0;j--)push(section.width,`เลน ${j+1}`,'lane',{kind:'lane',arm:id,direction,laneIndex:j,role:'main'},mainLaneEdit);
      for(let j=p.right.lanes-1;j>=0;j--){
        const w=pocketLaneWidth(a,direction,'right')*pocketFactor(p.right,x,origin);
        push(w,'เลนเลี้ยว','aux',{kind:'pocket',arm:id,direction,side:'right',laneIndex:j,role:'aux-right'},auxEdit('right'));
      }
    }else{
      for(let j=0;j<p.right.lanes;j++){
        const w=pocketLaneWidth(a,direction,'right')*pocketFactor(p.right,x,origin);
        push(w,'เลนรับ','aux',{kind:'pocket',arm:id,direction,side:'right',laneIndex:j,role:'aux-right'},auxEdit('right'));
      }
      for(let j=0;j<a.outgoing;j++)push(section.width,`เลน ${j+1}`,'lane',{kind:'lane',arm:id,direction,laneIndex:j,role:'main'},mainLaneEdit);
      for(let j=0;j<p.left.lanes;j++){
        const w=pocketLaneWidth(a,direction,'left')*pocketFactor(p.left,x,origin);
        push(w,'เลนรับริมทาง','aux',{kind:'pocket',arm:id,direction,side:'left',laneIndex:j,role:'aux-left'},auxEdit('left'));
      }
      section.bands.forEach((b,k)=>push(
        bands[k],
        {bike:'จักรยาน',motorcycle:'มอเตอร์ไซค์',shoulder:'ไหล่ทาง',buffer:'คั่น'}[b.type],
        b.type,
        {kind:'band',arm:id,direction,id:b.id},
        {value:b.width,min:.25,max:4.5,step:.25,label:`ความกว้าง${b.type}`}
      ));
      push(section.walk,'ทางเท้า','walk',{kind:'sidewalk',arm:id,direction},{value:section.walk,min:0,max:8,step:.25,label:'ความกว้างทางเท้าขาออก'});
    }
    pieces.push(...sidePieces);
  };

  // Permanent engineering convention: LEFT = incoming, CENTER = median, RIGHT = outgoing.
  addDirection('incoming');

  const planted=armIslands(d,id,edgeSet).some(poly=>Math.min(...poly.map(p=>p.x))<=x&&Math.max(...poly.map(p=>p.x))>=x);
  const opening=a.medianOpenings?.find(o=>x>=mouth+o.start&&x<=mouth+o.start+o.length);
  add({
    width:Math.max(.001,allocation.residual),
    label:opening?'ช่องเปิด':planted?'เกาะกลาง':'พื้นที่กลาง',
    kind:opening||!planted?'median-open':'median',
    group:'median',
    selection:opening?{kind:'opening',arm:id,id:opening.id}:{kind:'median',arm:id},
    editable:opening?undefined:{value:allocation.residual,min:0,max:12,step:.25,label:'ความกว้างเกาะกลาง ณ หน้าตัด'}
  });

  addDirection('outgoing');
  return{pieces,allocation,origins};
}

function InlineWidth({piece,onCommit,onCancel}:{piece:Piece;onCommit:(v:number)=>void;onCancel:()=>void}){
  const [draft,setDraft]=useState(piece.editable?.value.toFixed(2)??piece.width.toFixed(2)),ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();ref.current?.select();},[]);
  const commit=()=>{
    const e=piece.editable,n=Number(draft);
    if(!e||!Number.isFinite(n)){onCancel();return;}
    const v=Math.max(e.min,Math.min(e.max,Math.round(n/e.step)*e.step));
    onCommit(+v.toFixed(4));
  };
  return <input ref={ref} className="section-inline-input" aria-label={piece.editable?.label} value={draft}
    onChange={e=>setDraft(e.target.value)} onBlur={commit}
    onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.preventDefault();onCancel();}}}/>;
}

export function CrossSection({
  d,id,x,onX,selection,onSelect,onEdit
}:{
  d:Design;
  id:number;
  x:number;
  onX:(x:number)=>void;
  selection:Selection;
  onSelect:(s:Selection)=>void;
  onEdit?:(s:Selection,value:number,currentWidth:number)=>void;
}){
  const a=d.arms[id],mouth=armMouth(d,id),{pieces,allocation}=sectionPieces(d,id,x),[editing,setEditing]=useState<string|null>(null);
  useEffect(()=>setEditing(null),[id,x]);

  return <section className="precision-section" aria-label="หน้าตัดถนนแบบโต้ตอบ">
    <header className="section-header">
      <div><b>หน้าตัด · {a.name}</b><span className="section-convention">ซ้ายเข้าแยก · ขวาออกแยก</span></div>
      <label>ระยะจากปากแยก
        <input aria-label="ตำแหน่งหน้าตัด" type="range" min={sectionStart(d,id)} max={Math.max(sectionStart(d,id)+1,a.length-mouth)}
          value={x-mouth} onChange={e=>onX(mouth+Number(e.target.value))}/>
        <span>{(x-mouth).toFixed(1)} ม.</span>
      </label>
    </header>
    <div className="section-side-labels" aria-hidden="true">
      <span>ขาเข้าแยก</span><span>เกาะกลาง</span><span>ขาออกแยก</span>
    </div>
    <div className="section-components">
      {pieces.map((p,i)=>{
        const key=selectionKey(p.selection),active=selectionKey(selection)===key,isEditing=editing===key;
        return <div key={key+'-'+i} className={`section-piece ${p.kind} ${p.group} ${active?'active':''}`} style={{flex:Math.max(.18,p.width)}} title={p.editable&&Math.abs(p.editable.value-p.width)>.01?`${p.label} · กำหนด ${p.editable.value.toFixed(2)} ม. · ณ หน้าตัด ${p.width.toFixed(2)} ม.`:`${p.label} ${p.width.toFixed(2)} ม.`}>
          <button className="section-hit" aria-label={`เลือก ${p.label} ${p.selection.direction??''}`} onClick={()=>onSelect(p.selection)}>
            <span>{p.label}</span>
          </button>
          {isEditing&&p.editable&&onEdit
            ?<InlineWidth piece={p} onCancel={()=>setEditing(null)} onCommit={v=>{onEdit(p.selection,v,p.width);setEditing(null);}}/>
            :<button className="section-value" disabled={!p.editable||!onEdit}
                aria-label={p.editable?`แก้ ${p.editable.label}`:undefined}
                onClick={e=>{e.stopPropagation();onSelect(p.selection);if(p.editable&&onEdit)setEditing(key);}}>
                {(p.editable?.value??p.width).toFixed(2)}
              </button>}
        </div>;
      })}
    </div>
    <footer>
      <span>{d.type==='roundabout'?'หน้าตัดแนวตรงหลัง Splitter':'คลิกตัวเลขเพื่อแก้ความกว้าง · มิติเป็นเมตร'}</span>
      {a.medianTrees?.enabled&&<button onClick={()=>onSelect({kind:'landscape',arm:id})}>♧ ต้นไม้เกาะกลาง</button>}
      <span>เกาะเหลือ {allocation.residual.toFixed(2)} · ขยาย {allocation.widening.toFixed(2)}</span>
    </footer>
  </section>;
}
