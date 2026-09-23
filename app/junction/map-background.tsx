'use client';
import {useMemo} from 'react';

export type MapReference={
  enabled:boolean;
  lat:number;
  lng:number;
  zoom:number;
  opacity:number;
};

const TILE=256,R=6378137,MAX_LAT=85.05112878;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function worldPixels(lat:number,lng:number,z:number){
  const n=2**z,phi=clamp(lat,-MAX_LAT,MAX_LAT)*Math.PI/180;
  return {
    x:(lng+180)/360*n*TILE,
    y:(1-Math.log(Math.tan(phi)+1/Math.cos(phi))/Math.PI)/2*n*TILE
  };
}
function metersPerPixel(lat:number,z:number){
  return Math.cos(clamp(lat,-MAX_LAT,MAX_LAT)*Math.PI/180)*2*Math.PI*R/(TILE*2**z);
}
function wrap(v:number,n:number){return ((v%n)+n)%n;}

export function mapReferenceDefaults():MapReference{
  return {enabled:false,lat:13.7563,lng:100.5018,zoom:17,opacity:.55};
}

export default function MapBackground({
  reference,view
}:{
  reference:MapReference;
  view:{zoom:number;pan:{x:number;y:number}};
}){
  const tiles=useMemo(()=>{
    if(!reference.enabled)return [];
    const z=Math.round(clamp(reference.zoom,12,19)),n=2**z,center=worldPixels(reference.lat,reference.lng,z),mpp=metersPerPixel(reference.lat,z),
      half=125/Math.max(.35,view.zoom),
      minX=view.pan.x-half,maxX=view.pan.x+half,minY=view.pan.y-half,maxY=view.pan.y+half,
      px0=center.x+minX/mpp,px1=center.x+maxX/mpp,py0=center.y+minY/mpp,py1=center.y+maxY/mpp,
      tx0=Math.floor(Math.min(px0,px1)/TILE)-1,tx1=Math.floor(Math.max(px0,px1)/TILE)+1,
      ty0=Math.max(0,Math.floor(Math.min(py0,py1)/TILE)-1),ty1=Math.min(n-1,Math.floor(Math.max(py0,py1)/TILE)+1),
      out:{key:string;href:string;x:number;y:number;size:number}[]=[];
    const count=(tx1-tx0+1)*(ty1-ty0+1);
    if(count>100)return [];
    const size=TILE*mpp;
    for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
      const wx=wrap(tx,n),x=(tx*TILE-center.x)*mpp,y=(ty*TILE-center.y)*mpp;
      out.push({key:`${z}/${wx}/${ty}`,href:`https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`,x,y,size});
    }
    return out;
  },[reference,view.zoom,view.pan.x,view.pan.y]);

  if(!reference.enabled)return null;
  return <g data-map-background="true" pointerEvents="none" opacity={clamp(reference.opacity,.1,1)}>
    {tiles.map(t=><image key={t.key} href={t.href} x={t.x} y={t.y} width={t.size} height={t.size} preserveAspectRatio="none"/>)}
    <g transform={`translate(${view.pan.x-122/Math.max(.35,view.zoom)} ${view.pan.y+118/Math.max(.35,view.zoom)})`} opacity=".9">
      <rect x="0" y="-5" width={52/Math.max(.35,view.zoom)} height={6/Math.max(.35,view.zoom)} rx={1/Math.max(.35,view.zoom)} fill="white"/>
      <text x={2/Math.max(.35,view.zoom)} y={-1.1/Math.max(.35,view.zoom)} fontSize={2.5/Math.max(.35,view.zoom)} fill="#334b57" fontFamily="Arial,Tahoma,sans-serif">© OpenStreetMap contributors</text>
    </g>
  </g>;
}
