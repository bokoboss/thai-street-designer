'use client';
import {useMemo} from 'react';

export type MapReference={
  enabled:boolean;
  lat:number;
  lng:number;
  zoom:number;
  opacity:number;
  offsetX:number;
  offsetY:number;
  locked:boolean;
};

export type MapPlace={label:string;lat:number;lng:number};

const TILE=256,R=6378137,MAX_LAT=85.05112878;
export const MAP_REFERENCE_STORAGE='thai-street-map-reference-v1';
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
function validMapReference(v:unknown):v is MapReference{
  if(!v||typeof v!=='object')return false;
  const m=v as Partial<MapReference>;
  return typeof m.enabled==='boolean'&&Number.isFinite(m.lat)&&Number.isFinite(m.lng)&&Number.isFinite(m.zoom)&&
    Number.isFinite(m.opacity)&&Number.isFinite(m.offsetX)&&Number.isFinite(m.offsetY)&&typeof m.locked==='boolean';
}

export function mapReferenceDefaults():MapReference{
  return {enabled:false,lat:13.7563,lng:100.5018,zoom:17,opacity:.55,offsetX:0,offsetY:0,locked:false};
}

export function restoreMapReference(raw:string|null):MapReference{
  if(!raw)return mapReferenceDefaults();
  try{const v=JSON.parse(raw);return validMapReference(v)?v:mapReferenceDefaults();}catch{return mapReferenceDefaults();}
}

export async function searchMapPlaces(query:string):Promise<MapPlace[]>{
  const q=query.trim();
  if(q.length<2)return [];
  const key='thai-street-geocode:'+q.toLocaleLowerCase('th');
  try{
    if(typeof sessionStorage==='undefined')throw new Error('no session storage');
    const cached=sessionStorage.getItem(key);
    if(cached){
      const parsed=JSON.parse(cached);
      if(Array.isArray(parsed))return parsed.slice(0,5);
    }
  }catch{}
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format','jsonv2');
  url.searchParams.set('limit','5');
  url.searchParams.set('q',q);
  url.searchParams.set('accept-language','th,en');
  const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('geocoder unavailable');
  const raw=await response.json() as {display_name?:string;lat?:string;lon?:string}[];
  const places=raw.map(v=>({label:v.display_name??'',lat:Number(v.lat),lng:Number(v.lon)}))
    .filter(v=>v.label&&Number.isFinite(v.lat)&&Number.isFinite(v.lng)).slice(0,5);
  try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem(key,JSON.stringify(places));}catch{}
  return places;
}

function tileTemplate(){
  return process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
}
function tileUrl(z:number,x:number,y:number){
  return tileTemplate().replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));
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
      minX=view.pan.x-half-reference.offsetX,maxX=view.pan.x+half-reference.offsetX,
      minY=view.pan.y-half-reference.offsetY,maxY=view.pan.y+half-reference.offsetY,
      px0=center.x+minX/mpp,px1=center.x+maxX/mpp,py0=center.y+minY/mpp,py1=center.y+maxY/mpp,
      tx0=Math.floor(Math.min(px0,px1)/TILE)-1,tx1=Math.floor(Math.max(px0,px1)/TILE)+1,
      ty0=Math.max(0,Math.floor(Math.min(py0,py1)/TILE)-1),ty1=Math.min(n-1,Math.floor(Math.max(py0,py1)/TILE)+1),
      out:{key:string;href:string;x:number;y:number;size:number}[]=[];
    const count=(tx1-tx0+1)*(ty1-ty0+1);
    if(count>100)return [];
    const size=TILE*mpp;
    for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
      const wx=wrap(tx,n),x=(tx*TILE-center.x)*mpp+reference.offsetX,y=(ty*TILE-center.y)*mpp+reference.offsetY;
      out.push({key:`${z}/${wx}/${ty}`,href:tileUrl(z,wx,ty),x,y,size});
    }
    return out;
  },[reference,view.zoom,view.pan.x,view.pan.y]);

  if(!reference.enabled)return null;
  return <g data-map-background="true" pointerEvents="none" opacity={clamp(reference.opacity,.1,1)}>
    {tiles.map(t=><image key={t.key} href={t.href} x={t.x} y={t.y} width={t.size} height={t.size} preserveAspectRatio="none"/>)}
    <g transform={`translate(${view.pan.x-122/Math.max(.35,view.zoom)} ${view.pan.y+118/Math.max(.35,view.zoom)})`} opacity=".92">
      <rect x="0" y="-5" width={58/Math.max(.35,view.zoom)} height={6/Math.max(.35,view.zoom)} rx={1/Math.max(.35,view.zoom)} fill="white"/>
      <text x={2/Math.max(.35,view.zoom)} y={-1.1/Math.max(.35,view.zoom)} fontSize={2.5/Math.max(.35,view.zoom)} fill="#334b57" fontFamily="Arial,Tahoma,sans-serif">© OpenStreetMap contributors</text>
    </g>
  </g>;
}
