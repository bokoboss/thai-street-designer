'use client';
// Inspector for several selected roads: what is selected, moving them by typed distances (the touch / keyboard
// equivalent of dragging), and the same actions as the right-click menu.
import {useState} from 'react';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import {joinablePair} from '@/core/road-first/selection';
import type {DesignSelection} from './design-canvas';
import type {MenuAction} from './select-menu';
import type {CommandOutcome} from './use-road-editor';

export function MultiRoadInspector({project,ids,run,onSelect,onAction}:{project:RoadFirstProject;ids:string[];run:(cmd:RoadFirstCommand)=>CommandOutcome;onSelect:(s:DesignSelection)=>void;onAction:(a:MenuAction)=>void}){
  const [dx,setDx]=useState('0'),[dy,setDy]=useState('0'),[armed,setArmed]=useState(false);
  const roads=ids.map(id=>project.roads.find(r=>r.id===id)).filter((r):r is NonNullable<typeof r>=>!!r);
  const x=Number(dx),y=Number(dy),valid=Number.isFinite(x)&&Number.isFinite(y)&&(x!==0||y!==0)&&dx.trim()!==''&&dy.trim()!=='';
  const ramps=roads.filter(r=>r.role==='ramp').length;
  return <>
    <header className="design-inspector-head"><small>เลือกหลายชิ้น</small><b data-design-multi-count={roads.length}>ถนน {roads.length} สาย</b></header>
    <section className="design-block">
      <ul className="design-piece-list">{roads.map(r=><li key={r.id}><button className="design-link" data-design-multi-road={r.id} onClick={()=>onSelect({kind:'road',id:r.id})}>{r.name}</button>{r.role==='ramp'?' (ทางลาด)':''}</li>)}</ul>
      <p className="design-meta">Shift+คลิก หรือปุ่ม “เลือกหลายชิ้น” เพื่อเพิ่ม/เอาออก · ลากบนพื้นที่ว่างเพื่อเลือกเป็นกรอบ · ลากถนนที่เลือกเพื่อย้ายทั้งชุด</p>
    </section>
    <section className="design-block" data-design-multi-move>
      <small className="design-block-title">ย้ายทั้งชุดตามระยะ</small>
      <div className="design-grade-fields">
        <label className="design-field"><span>ไปทางขวา (ม.)</span><input type="number" inputMode="decimal" step={1} value={dx} data-design-field="multi-dx" onChange={e=>setDx(e.target.value)}/></label>
        <label className="design-field"><span>ลงล่าง (ม.)</span><input type="number" inputMode="decimal" step={1} value={dy} data-design-field="multi-dy" onChange={e=>setDy(e.target.value)}/></label>
      </div>
      <div className="design-actions"><button className="primary" data-design-action="multi-move" disabled={!valid}
        onClick={()=>{if(run({type:'roads.move',roadIds:ids,delta:{x,y}}).ok){setDx('0');setDy('0');}}}>ย้าย</button></div>
      <p className="design-meta">ทางแยกระหว่างถนนที่ย้ายไปด้วยกันคงการตั้งค่าไว้{ramps?' · ทางลาดที่ย้ายโดยไม่มีถนนหลักไปด้วย จะเลื่อนตามขอบถนนหลัก หรือหลุดออกถ้าห่างเกิน':''}</p>
    </section>
    <div className="design-actions">
      <button data-design-action="multi-zoom" onClick={()=>onAction('zoom')}>ซูมไปที่ที่เลือก</button>
      {joinablePair(project.roads,ids)&&<button data-design-action="multi-join" onClick={()=>onAction('join')}>ต่อเป็นถนนเดียว</button>}
      <button data-design-action="multi-clear" onClick={()=>onAction('clear')}>ยกเลิกการเลือก</button>
      <button className="danger" data-design-action="multi-delete" onClick={()=>{if(!armed){setArmed(true);return;}onAction('delete');}}>{armed?`กดอีกครั้งเพื่อลบ ${roads.length} สาย`:'ลบที่เลือก'}</button>
    </div>
  </>;
}
