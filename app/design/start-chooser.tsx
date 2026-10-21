'use client';
// First open (UX / workflow review 2026-10-21): three ways to start, on the plan itself, never a modal.
// Shown while the scenario has no road, no reference image and no map, and Draw Road is not active.
import {useRef} from 'react';
import {Image as ImageIcon,MapPinned,PenLine} from 'lucide-react';

export function StartChooser({onMap,onImage,onBlank}:{onMap:()=>void;onImage:(file:File)=>void;onBlank:()=>void}){
  const file=useRef<HTMLInputElement>(null);
  return <div className="design-start" data-design-start="true">
    <section className="design-start-card" aria-label="เริ่มงาน">
      <h2>เริ่มงานออกแบบ</h2>
      <p>เลือกวิธีเริ่ม ทุกแบบวาดถนนต่อได้เหมือนกัน และเปลี่ยนภายหลังได้</p>
      <div className="design-start-options">
        <button data-design-start-option="map" onClick={onMap}><MapPinned size={18}/><b>ค้นหาสถานที่บนแผนที่</b><small>เปิดแผนที่ถนนแบบฟรี แล้ววาดแนวถนนทับตำแหน่งจริง</small></button>
        <button data-design-start-option="image" onClick={()=>file.current?.click()}><ImageIcon size={18}/><b>ใช้ภาพหรือผังอ้างอิง</b><small>ผังบริเวณหรือภาพถ่ายที่มีสิทธิ์ใช้ แล้วตั้งมาตราส่วนจากระยะจริง</small></button>
        <button data-design-start-option="blank" onClick={onBlank}><PenLine size={18}/><b>เริ่มแบบว่าง</b><small>วาดถนนสายแรกได้ทันที</small></button>
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg" hidden data-design-start-image="true" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(f)onImage(f);}}/>
      <footer>มีงานเดิมอยู่แล้ว ใช้ “เปิดไฟล์” ที่แถบด้านบน</footer>
    </section>
  </div>;
}
