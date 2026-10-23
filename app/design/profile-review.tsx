'use client';
import {useEffect,useRef,useState} from 'react';
import type {RoadFirstProject} from '@/core/road-first/project';
import type {RoadFirstCommand} from '@/core/road-first/commands';
import {resolveVerticalProfile} from '@/core/road-first/elevation';
import {roadLength} from '@/core/road-first/road-openings';
import type {CommandOutcome} from './use-road-editor';

type Change=Extract<RoadFirstCommand,{type:'crossing.setOver'}>;
type Review={command:Change;before:RoadFirstProject;after?:()=>void};
export function useProfileReview(project:RoadFirstProject,run:(cmd:RoadFirstCommand)=>CommandOutcome,onMessage:(s:string,kind?:'info'|'error')=>void){
  const [pending,setPending]=useState<Review|null>(null);
  const request=(proposal:{cmd:RoadFirstCommand}|{error:string},after?:()=>void)=>{
    if('error' in proposal){onMessage(proposal.error,'error');return;}
    if(proposal.cmd.type==='crossing.setOver')setPending({command:proposal.cmd,before:project,after});
  };
  const review=pending?<ProfileReview review={pending} stale={project!==pending.before} onClose={()=>setPending(null)} onConfirm={()=>{
    if(project===pending.before&&run(pending.command).ok){setPending(null);pending.after?.();}
  }}/>:null;
  return{request,review};
}
function ProfileReview({review,stale,onClose,onConfirm}:{review:Review;stale:boolean;onClose:()=>void;onConfirm:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="design-alignment-review" data-profile-review aria-labelledby="profile-review-title" onCancel={onClose} onKeyDown={e=>e.stopPropagation()}>
    <h2 id="profile-review-title">ตรวจแนวดิ่งก่อนยืนยัน</h2>
    <p>{review.command.label} · ใช้กับทางเลือกที่เปิดอยู่ ย้อนกลับได้หนึ่งขั้นตอน</p>
    {Object.entries(review.command.profiles).map(([id,next])=>{
      const road=review.before.roads.find(r=>r.id===id)!;
      const before=resolveVerticalProfile(road.profile),after=resolveVerticalProfile(next??undefined),total=roadLength(road);
      const s=[...new Set([...before.sampleStations(0,total),...after.sampleStations(0,total)])].sort((a,b)=>a-b);
      const zs=s.flatMap(st=>[before.levelAt(st),after.levelAt(st)]),lo=Math.min(0,...zs)-1,hi=Math.max(0,...zs)+1;
      const x=(st:number)=>20+st/(total||1)*640,y=(z:number)=>130-(z-lo)/(hi-lo)*110;
      const line=(profile:typeof before)=>s.map(st=>`${x(st)},${y(profile.levelAt(st))}`).join(' ');
      return <section key={id} data-profile-delta={id}>
        <b>{road.name}</b>
        <svg viewBox="0 0 680 150" role="img" aria-label={`แนวดิ่งก่อนและหลังปรับ ${road.name}`} style={{height:150}}>
          <polyline points={line(before)} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="6 4"/>
          <polyline points={line(after)} fill="none" stroke="#2563eb" strokeWidth="2"/>
        </svg>
        <p>นำจุดที่สร้างจากจุดตัดนี้ออก {before.points.filter(p=>p.generatedBy===(review.command.owner??review.command.candidateId)&&!after.points.some(q=>q.station===p.station&&q.z===p.z&&q.generatedBy===p.generatedBy)).length} จุด · เส้นประสีเทา: ก่อนปรับ · สีน้ำเงิน: หลังปรับ · เก็บจุดที่ผู้ใช้กำหนด {after.points.filter(p=>!p.generatedBy).length} จุด</p>
        <table><thead><tr><th>ระยะ (ม.)</th><th>ระดับจุดเดิม (ม.)</th><th>ระดับจุดหลังปรับ (ม.)</th><th>ที่มา</th></tr></thead><tbody>
          {after.points.map((p,i)=><tr key={i}><td>{p.station.toFixed(1)}</td><td>{before.points.find(q=>q.station===p.station)?.z.toFixed(2)??'—'}</td><td>{p.z.toFixed(2)}</td><td>{p.generatedBy?'สร้างจากการปรับจุดตัด':'ผู้ใช้กำหนด / ข้อมูลเดิม'}</td></tr>)}
        </tbody></table>
        {!after.points.length&&<p>นำเฉพาะจุดที่สร้างจากการปรับจุดตัดนี้ออก คืนแนวดิ่งเดิม</p>}
      </section>;
    })}
    {!Object.keys(review.command.profiles).length&&<p>เปลี่ยนเฉพาะการเลือกถนนด้านบน ระดับเดิมคงไว้ ต้องตรวจระยะช่องลอดต่อ</p>}
    {stale&&<p role="alert">โครงการเปลี่ยนระหว่างตรวจผล กรุณาปิดแล้วตรวจใหม่</p>}
    <footer><button autoFocus data-profile-review-cancel onClick={onClose}>ยกเลิก</button><button data-profile-review-confirm disabled={stale} onClick={onConfirm}>ยืนยันแนวดิ่ง</button></footer>
  </dialog>;
}
