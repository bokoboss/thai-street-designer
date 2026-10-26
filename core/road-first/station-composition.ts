// Review generated station components in a single canonical link. No silent reduction or reordering.
// Values here are integrity/data limits, not traffic design standards.
import type {RoadLink} from '../network/network-project';

export const STATION_COMPONENT_BUDGET=24;
/** Treat endpoint contact as non-overlap; existing authored values remain untouched. */
export function stationCompositionIssues(link:RoadLink):string[]{
  const out:string[]=[];
  if(link.components.length>STATION_COMPONENT_BUDGET)
    out.push(`${link.name}: มีองค์ประกอบหน้าตัด ${link.components.length} รายการ เกินขอบเขต ${STATION_COMPONENT_BUDGET} รายการต่อช่วงถนน — ตรวจช่วงที่ซ้อนกัน`);
  const points=[...new Set(link.components.flatMap(c=>[c.start,c.end,c.start+c.taperIn,c.end-c.taperOut]).filter(Number.isFinite))].sort((a,b)=>a-b);
  for(let i=1;i<points.length;i++){
    const station=(points[i-1]+points[i])/2;
    const active=link.components.filter(c=>c.start<station&&c.end>station);
    for(const direction of ['forward','backward'] as const){
      const lanes=active.filter(c=>c.kind==='lane'&&c.direction===direction);
      if(lanes.length>2)out.push(`${link.name}: ระยะ ${station.toFixed(1)} ม. มีช่องเพิ่มใน${direction==='forward'?'ทิศที่วาด':'ทิศสวน'}ซ้อนกัน ${lanes.length} ช่อง — ตรวจความต่อเนื่อง`);
      for(const target of ['walk','shoulder','bike','motorcycle','buffer'] as const){
        const widths=active.filter(c=>c.kind==='width'&&c.direction===direction&&c.target===target);
        if(widths.length>1)out.push(`${link.name}: ระยะ ${station.toFixed(1)} ม. มีการปรับความกว้าง ${target} ซ้อนกัน ${widths.length} รายการ — ตรวจผลรวม`);
      }
    }
  }
  return [...new Set(out)];
}
