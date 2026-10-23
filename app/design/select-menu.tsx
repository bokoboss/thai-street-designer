'use client';
// Right-click menu in Select: the actions that apply to what is selected (and the road under the pointer).
// The same actions are buttons in the inspector, so touch and keyboard users reach them without a right-click.
import {useEffect,useRef} from 'react';
import type {RoadFirstProject} from '@/core/road-first/project';
import {joinablePair} from '@/core/road-first/selection';
import {tangentConnectPlan} from '@/core/road-first/tangent-connect';
import type {WorldPoint} from '@/core/network/network-project';

export type MenuAt={x:number;y:number;world:WorldPoint;roadId?:string};
export type MenuAction='zoom'|'split'|'join'|'reverse'|'straighten'|'tangent'|'select-all'|'delete'|'clear';
export function menuItems(project:RoadFirstProject,ids:string[],at?:MenuAt):{action:MenuAction;label:string;danger?:boolean}[]{
  const out:{action:MenuAction;label:string;danger?:boolean}[]=[];
  if(ids.length)out.push({action:'zoom',label:ids.length>1?`ซูมไปที่ถนนที่เลือก (${ids.length} สาย) · Z`:'ซูมไปที่ถนนนี้ · Z'});
  if(at?.roadId&&ids.length===1&&ids[0]===at.roadId)out.push({action:'split',label:'แยกถนนตรงนี้'});
  if(joinablePair(project.roads,ids))out.push({action:'join',label:'ต่อสองเส้นนี้เป็นถนนเดียว'});
  if(ids.length===2){const t=tangentConnectPlan(project,ids[0],ids[1]);if(!('error' in t))out.push({action:'tangent',label:`เชื่อมด้วยโค้งสัมผัส (รัศมี ${t.radius} ม.)`});}
  const one=ids.length===1?project.roads.find(r=>r.id===ids[0]):undefined;
  if(one)out.push({action:'reverse',label:one.role==='ramp'?'กลับทิศเดินรถของทางลาด':'กลับทิศการวาด'});
  if(one&&one.points.length>2)out.push({action:'straighten',label:'ทำแนวตรงทั้งเส้น'});
  if(project.roads.length>ids.length)out.push({action:'select-all',label:'เลือกถนนทั้งหมด · Ctrl+A'});
  if(ids.length)out.push({action:'clear',label:'ยกเลิกการเลือก · Esc'},{action:'delete',label:ids.length>1?`ลบถนนที่เลือก ${ids.length} สาย · Delete`:'ลบถนนนี้ · Delete',danger:true});
  return out;
}

export function SelectMenu({at,items,onAction,onClose}:{at:MenuAt;items:ReturnType<typeof menuItems>;onAction:(a:MenuAction)=>void;onClose:()=>void}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const away=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))onClose();};
    window.addEventListener('pointerdown',away,true);return()=>window.removeEventListener('pointerdown',away,true);
  },[onClose]);
  if(!items.length)return null;
  // Kept inside the window.
  const left=Math.min(at.x,(typeof window!=='undefined'?window.innerWidth:1200)-240),top=Math.min(at.y,(typeof window!=='undefined'?window.innerHeight:800)-items.length*36-12);
  return <div ref={ref} className="design-context-menu" role="menu" data-design-context-menu="true" style={{left,top}}
    onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();onClose();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const bs=[...(ref.current?.querySelectorAll('button')??[])],i=bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length]?.focus();}
    }}>
    {items.map(it=><button key={it.action} role="menuitem" className={it.danger?'danger':''} data-design-menu={it.action} onClick={()=>{onAction(it.action);onClose();}}>{it.label}</button>)}
  </div>;
}
