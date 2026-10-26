// Report figure from the plan (roadmap Phase 3 slice 5): the drawing as shown, without editing aids,
// framed to the whole design with a title block, scale bar and the concept-design note.
// When a comparison is shown, its highlights and a legend are kept in the figure.
import type {ScenarioDiff} from '@/core/road-first/compare';

export type FigureFormat='png'|'svg';
export type FigureInput={svg:SVGSVGElement;bounds:{x:number;y:number;w:number;h:number};title:string;scenario:string;comparison?:{reference:string;diff:ScenarioDiff}|null;format:FigureFormat};

const NS='http://www.w3.org/2000/svg';
/** Editing aids that never belong in a report figure. */
const EDITING_ONLY='[data-design-connector-review],[data-design-end-joins],[data-design-shortfalls],[data-design-roads],[data-design-candidates],[data-design-handles],[data-design-snap],[data-design-draft],[data-network-junction-hit],[data-network-instance-handle],[data-network-instance-selection],[data-network-arm-handle],[data-network-arm-handle-visible],[data-network-arm-selection],[data-network-port],[data-link-via-group],[data-network-arm-guide],[data-network-link-preview]';
const niceLength=(m:number)=>{const p=10**Math.floor(Math.log10(m));return [1,2,5,10].map(k=>k*p).filter(v=>v<=m).at(-1)??p;};
export const safeFilePart=(s:string)=>s.replace(/[\\/:*?"<>|\s]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||'design';

export function buildFigureSvg({svg,bounds,title,scenario,comparison}:Omit<FigureInput,'format'>){
  const copy=svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll(EDITING_ONLY).forEach(n=>n.remove());
  copy.querySelector(':scope>rect')?.setAttribute('fill','#ffffff');
  const base=Math.max(bounds.w,bounds.h,120),pad=Math.max(10,base*.04),t=Math.max(5,Math.min(12,base*.02));
  const headH=t*(comparison?5.6:4.2),footH=t*2.8;
  const vx=bounds.x-pad,vy=bounds.y-pad-headH,vw=bounds.w+pad*2,vh=bounds.h+pad*2+headH+footH;
  const width=2000,height=Math.max(700,Math.min(4000,Math.round(width*vh/vw)));
  copy.setAttribute('xmlns',NS);copy.setAttribute('viewBox',`${vx} ${vy} ${vw} ${vh}`);copy.setAttribute('width',String(width));copy.setAttribute('height',String(height));
  const g=document.createElementNS(NS,'g');g.setAttribute('data-figure-frame','true');
  const el=(name:string,attrs:Record<string,string|number>,text?:string)=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;g.appendChild(e);return e;};
  const font='Arial, "Noto Sans Thai", Tahoma, sans-serif';
  const label=(x:number,y:number,text:string,size:number,weight=500,fill='#45565d',anchor='start')=>el('text',{x,y,'font-family':font,'font-size':size,'font-weight':weight,fill,'text-anchor':anchor},text);
  // White background under the plan so the figure is opaque when placed in a report.
  const bg=document.createElementNS(NS,'rect');
  for(const [k,v] of Object.entries({x:vx,y:vy,width:vw,height:vh,fill:'#ffffff'}))bg.setAttribute(k,String(v));
  copy.insertBefore(bg,copy.firstChild);
  el('rect',{x:vx,y:vy,width:vw,height:headH,fill:'#f5faf9',stroke:'#cedbd9','stroke-width':t*.05});
  const left=vx+pad*.6,top=vy+t*1.5;
  label(left,top,title,t,800,'#263b44');
  label(left,top+t*1.4,`ทางเลือก: ${scenario}`,t*.68,700,'#4d6461');
  if(comparison){
    const c=comparison.diff.counts,metrics=comparison.diff.metrics.filter(m=>m.delta).map(m=>`${m.label} ${m.delta>0?'+':''}${m.delta}${m.unit?' '+m.unit:''}`).join(' · ')||'ไม่มีความต่างของตัวเลขสรุป';
    label(left,top+t*2.6,`เทียบกับ ${comparison.reference}: เพิ่ม ${c.added} · ตัดออก ${c.removed} · แก้ไข ${c.changed}`,t*.62,700,'#7a654e');
    label(left,top+t*3.6,metrics,t*.56,500,'#66777d');
    let lx=vx+vw-pad*.6-t*13;
    for(const [color,text,dash] of [['#1f8a4c','เพิ่ม',''],['#b3261e','ตัดออก',`${t*.3} ${t*.2}`],['#c47b12','แก้ไข','']] as const){
      el('rect',{x:lx,y:top-t*.7,width:t*.9,height:t*.7,fill:color,'fill-opacity':.1,stroke:color,'stroke-width':t*.08,...(dash?{'stroke-dasharray':dash}:{})});
      label(lx+t*1.1,top-t*.05,text,t*.58,700,color);lx+=t*4.2;
    }
  }else label(vx+vw-pad*.6,top,'Thai Street Designer',t*.6,700,'#4d7772','end');
  // Footer: scale bar and the concept note. No north arrow: the plan has no surveyed orientation.
  const fy=bounds.y+bounds.h+pad,mid=fy+footH*.55,scale=niceLength(bounds.w*.2);
  el('rect',{x:vx,y:fy,width:vw,height:footH,fill:'#ffffff',stroke:'#d9e2e1','stroke-width':t*.05});
  el('line',{x1:left,x2:left+scale,y1:mid,y2:mid,stroke:'#263b44','stroke-width':t*.08});
  for(const x of [left,left+scale])el('line',{x1:x,x2:x,y1:mid-t*.35,y2:mid+t*.35,stroke:'#263b44','stroke-width':t*.08});
  label(left,mid-t*.55,scale>=1000?`${scale/1000} กม.`:`${scale} ม.`,t*.55,700,'#263b44');
  label(vx+vw-pad*.6,mid+t*.2,'แบบแนวคิด · ไม่ใช่แบบก่อสร้าง · จราจรชิดซ้าย',t*.55,700,'#7a5d47','end');
  copy.appendChild(g);
  return{svg:copy,width,height};
}

export async function exportFigure(input:FigureInput):Promise<{blob:Blob;name:string}>{
  await document.fonts?.ready;
  const {svg,width,height}=buildFigureSvg(input);
  // The reference image lives in this browser (blob URL); embed it so the SVG opens elsewhere and the PNG includes it.
  for(const img of [...svg.querySelectorAll('image')]){
    const href=img.getAttribute('href')??img.getAttribute('xlink:href')??'';
    if(!href.startsWith('blob:'))continue;
    try{const blob=await (await fetch(href)).blob();img.setAttribute('href',await new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>no(r.error);r.readAsDataURL(blob);}));}
    catch{img.remove();}
  }
  const svgBlob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
  const name=`${safeFilePart(input.title)}-${safeFilePart(input.scenario)}${input.comparison?'-เทียบ-'+safeFilePart(input.comparison.reference):''}.${input.format}`;
  if(input.format==='svg')return{blob:svgBlob,name};
  const url=URL.createObjectURL(svgBlob);
  try{
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('สร้างภาพไม่สำเร็จ'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('เบราว์เซอร์นี้สร้างภาพไม่ได้');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
    const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('สร้างไฟล์ PNG ไม่สำเร็จ');
    return{blob:png,name};
  }finally{URL.revokeObjectURL(url);}
}
