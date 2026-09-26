import {useMemo,useState} from 'react';
import {X,Search} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';

export type Command={
  label:string;
  run:()=>void;
  group?:'ออกแบบ'|'มุมมอง'|'ไฟล์และส่งออก'|'พื้นที่ทำงาน';
  hint?:string;
  keywords?:string;
};

const groupOrder=['ออกแบบ','มุมมอง','ไฟล์และส่งออก','พื้นที่ทำงาน'] as const;

export function ActionSearch({open,onOpenChange,actions}:{open:boolean;onOpenChange:(v:boolean)=>void;actions:Command[]}){
  const [q,setQ]=useState('');
  const filtered=useMemo(()=>{
    const needle=q.trim().toLowerCase();
    return actions.filter(a=>!needle||`${a.label} ${a.keywords??''}`.toLowerCase().includes(needle));
  },[actions,q]);
  const grouped=groupOrder
    .map(group=>({group,items:filtered.filter(a=>(a.group??'ออกแบบ')===group)}))
    .filter(v=>v.items.length);

  const run=(a:Command)=>{a.run();onOpenChange(false);};

  return <Dialog open={open} onOpenChange={v=>{if(!v)setQ('');onOpenChange(v);}}>
    <DialogContent showCloseButton={false} className="action-search" aria-label="ค้นหาคำสั่ง">
      <header className="action-search-head">
        <div>
          <DialogTitle>ค้นหาคำสั่ง</DialogTitle>
          <DialogDescription>ค้นหาเครื่องมือของแบบปัจจุบัน · Ctrl / Cmd + K</DialogDescription>
        </div>
        <button className="action-search-close" aria-label="ปิดหน้าต่างค้นหาคำสั่ง" title="ปิด (Esc)" onClick={()=>onOpenChange(false)}><X size={18}/></button>
      </header>
      <label className="action-search-field">
        <Search size={17}/>
        <input autoFocus aria-label="ค้นหาคำสั่ง" placeholder="เช่น เลนรอเลี้ยว, ช่องกลับรถ, มิติ, ส่งออก…" value={q}
          onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&filtered[0])run(filtered[0]);}}/>
        <kbd>⌘ K</kbd>
      </label>
      <div className="action-search-results">
        {grouped.map(({group,items})=><section key={group}>
          <h3>{group}</h3>
          {items.map(a=><button key={a.label} onClick={()=>run(a)}>
            <span>{a.label}</span>{a.hint&&<small>{a.hint}</small>}
          </button>)}
        </section>)}
        {!filtered.length&&<p className="action-search-empty">ไม่พบคำสั่งที่ตรงกัน</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
