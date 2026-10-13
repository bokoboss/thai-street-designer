export const clamp01=(value:number)=>Math.max(0,Math.min(1,value));

export function smoothstep(value:number){
  const x=clamp01(value);
  return x*x*(3-2*x);
}

export function taperOutFactor(station:number,fullEnd:number,taper:number){
  const width=Math.max(0,Number.isFinite(taper)?taper:0);
  if(width<=1e-9)return station<=fullEnd?1:0;
  return 1-smoothstep((station-fullEnd)/width);
}
