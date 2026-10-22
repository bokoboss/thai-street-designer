'use client';
import {useEffect,useMemo,useRef} from 'react';
import {previewAlignmentUpgrade} from '@/core/road-first/alignment-upgrade';
import {detectCandidates} from '@/core/road-first/derive';
import {resolveAlignment} from '@/core/common/resolved-alignment';
import {smoothAlignment} from '@/core/common/alignment';
import type {RoadFirstProject} from '@/core/road-first/project';

export function AlignmentUpgradePanel({project,onClose,onConfirm}:{project:RoadFirstProject;onClose:()=>void;onConfirm:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),review=useMemo(()=>previewAlignmentUpgrade(project),[project]);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const points=project.roads.flatMap(r=>r.points),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=Math.min(0,...xs)-20,y=Math.min(0,...ys)-20,w=Math.max(40,Math.max(0,...xs)-x+20),h=Math.max(40,Math.max(0,...ys)-y+20);
  const before=detectCandidates(project.roads),after=detectCandidates(review.project.roads),size=Math.max(w,h)/100;
  return <dialog ref={dialog} className="design-alignment-review" aria-labelledby="alignment-title" onCancel={onClose}>
    <h2 id="alignment-title">ตรวจผลก่อนแปลงระยะตามแนวโค้ง</h2>
    <p>ใช้กับทางเลือกที่เปิดอยู่เท่านั้น จุดระดับและการตั้งค่าเดิมจะถูกย้ายตามระยะใหม่ ย้อนกลับได้หนึ่งขั้นตอน</p>
    <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="แนวถนนและจุดตัดก่อนและหลังแปลง">
      {project.roads.map(r=><polyline key={`old-${r.id}`} points={smoothAlignment(r.points).map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#64748b" strokeWidth={size*.4} strokeDasharray={`${size} ${size}`}/>)}
      {review.project.roads.map(r=><polyline key={r.id} points={resolveAlignment(r.points).sample().map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth={size*.25}/>)}
      {before.map(c=><circle key={`old-${c.id}`} cx={c.point.x} cy={c.point.y} r={size} fill="none" stroke="#64748b" strokeWidth={size*.3}/>)}
      {after.map(c=><path key={c.id} d={`M${c.point.x-size},${c.point.y-size}l${size*2},${size*2}m${-size*2},0l${size*2},${-size*2}`} stroke="#2563eb" strokeWidth={size*.3}/>)}
    </svg>
    <small>เส้นประและวงกลมสีเทา: ก่อนแปลง · เส้นและกากบาทสีน้ำเงิน: หลังแปลง (แสดงแนวอ้างอิงถนน)</small>
    <ul data-alignment-changes>{review.changes.map((s,i)=><li key={i}>{s}</li>)}</ul>
    {review.errors.length>0&&<div role="alert"><strong>ยังแปลงไม่ได้</strong><ul>{review.errors.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
    <footer><button autoFocus data-alignment-cancel onClick={onClose}>ยกเลิก</button><button data-alignment-confirm disabled={review.errors.length>0} onClick={onConfirm}>ยืนยันการแปลง</button></footer>
  </dialog>;
}
