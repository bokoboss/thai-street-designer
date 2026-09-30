import {Switch} from '@/components/ui/switch';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';

export function Pick({label,value,items,onChange}:{label:string;value:string;items:Record<string,string>;onChange:(v:string)=>void}){
  return <label className="j-pick">{label}<Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{Object.entries(items).map(([k,v])=><SelectItem value={k} key={k}>{v}</SelectItem>)}</SelectContent></Select></label>;
}

export function Num({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(v:number)=>void}){
  const commit=(input:HTMLInputElement)=>{
    const raw=input.value,n=Number(raw);
    if(raw.trim()&&Number.isFinite(n)){
      const next=+Math.max(min,Math.min(max,Math.round(n/step)*step)).toFixed(4);
      if(next!==value)onChange(next);
      else input.value=String(value);
    }else input.value=String(value);
  };
  return <label className="j-num"><span>{label}</span><input key={`${label}:${value}`} aria-label={label} type="number" defaultValue={value} min={min} max={max} step={step}
    onBlur={e=>commit(e.currentTarget)}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.preventDefault();e.currentTarget.value=String(value);e.currentTarget.blur();}}}/></label>;
}

export function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="j-num"><span>{label}</span><Switch aria-label={label} checked={checked} onCheckedChange={onChange}/></label>;
}
