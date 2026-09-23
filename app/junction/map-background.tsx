'use client';
import {useEffect,useMemo,useRef,useState} from 'react';

export type MapBasemap='positron'|'bright'|'liberty'|'dark'|'osm-raster';
export const BASEMAP_OPTIONS:Record<MapBasemap,string>={
  positron:'OpenFreeMap · Positron',
  bright:'OpenFreeMap · Bright',
  liberty:'OpenFreeMap · Liberty',
  dark:'OpenFreeMap · Dark',
  'osm-raster':'OpenStreetMap · Raster fallback'
};

export type MapReference={
  enabled:boolean;
  lat:number;
  lng:number;
  zoom:number;
  opacity:number;
  offsetX:number;
  offsetY:number;
  locked:boolean;
  basemap:MapBasemap;
};

export type MapPlace={label:string;lat:number;lng:number};

type MapLibreMap={
  jumpTo:(options:{center:[number,number];zoom:number;bearing:number;pitch:number})=>void;
  resize:()=>void;
  remove:()=>void;
};
type MapLibreGlobal={
  Map:new(options:{
    container:HTMLElement;
    style:string;
    center:[number,number];
    zoom:number;
    bearing:number;
    pitch:number;
    interactive:boolean;
    attributionControl:boolean;
    maplibreLogo:boolean;
    renderWorldCopies:boolean;
  })=>MapLibreMap;
};

const TILE=256,MAPLIBRE_TILE=512,R=6378137,MAX_LAT=85.05112878;
const MAPLIBRE_JS='https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS='https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.css';
const STYLE_URLS:Record<Exclude<MapBasemap,'osm-raster'>,string>={
  positron:'https://tiles.openfreemap.org/styles/positron',
  bright:'https://tiles.openfreemap.org/styles/bright',
  liberty:'https://tiles.openfreemap.org/styles/liberty',
  dark:'https://tiles.openfreemap.org/styles/dark'
};
const BASEMAPS=new Set<MapBasemap>(Object.keys(BASEMAP_OPTIONS) as MapBasemap[]);
export const MAP_REFERENCE_STORAGE='thai-street-map-reference-v1';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

let mapLibrePromise:Promise<MapLibreGlobal>|null=null;
function loadMapLibre(){
  if(typeof window==='undefined')return Promise.reject(new Error('MapLibre requires a browser'));
  const w=window as typeof window&{maplibregl?:MapLibreGlobal};
  if(w.maplibregl)return Promise.resolve(w.maplibregl);
  if(mapLibrePromise)return mapLibrePromise;
  mapLibrePromise=new Promise<MapLibreGlobal>((resolve,reject)=>{
    if(!document.querySelector('link[data-thai-street-maplibre]')){
      const link=document.createElement('link');
      link.rel='stylesheet';link.href=MAPLIBRE_CSS;link.dataset.thaiStreetMaplibre='true';
      document.head.appendChild(link);
    }
    const done=()=>{
      const lib=(window as typeof window&{maplibregl?:MapLibreGlobal}).maplibregl;
      if(lib)resolve(lib);else reject(new Error('MapLibre loaded without global'));
    };
    const existing=document.querySelector<HTMLScriptElement>('script[data-thai-street-maplibre]');
    if(existing){existing.addEventListener('load',done,{once:true});existing.addEventListener('error',()=>reject(new Error('MapLibre CDN unavailable')),{once:true});return;}
    const script=document.createElement('script');
    script.src=MAPLIBRE_JS;script.async=true;script.dataset.thaiStreetMaplibre='true';
    script.addEventListener('load',done,{once:true});
    script.addEventListener('error',()=>reject(new Error('MapLibre CDN unavailable')),{once:true});
    document.head.appendChild(script);
  });
  return mapLibrePromise;
}

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

function mercatorMeters(lat:number,lng:number){
  const phi=clamp(lat,-MAX_LAT,MAX_LAT)*Math.PI/180;
  return{x:R*lng*Math.PI/180,y:R*Math.log(Math.tan(Math.PI/4+phi/2))};
}
function fromMercatorMeters(x:number,y:number){
  return{lng:x/R*180/Math.PI,lat:(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI};
}

export function mapCenterForView(reference:MapReference,pan:{x:number;y:number}){
  const origin=mercatorMeters(reference.lat,reference.lng),
    dx=pan.x-reference.offsetX,dy=pan.y-reference.offsetY;
  return fromMercatorMeters(origin.x+dx,origin.y-dy);
}

export function mapZoomForViewport(lat:number,workspaceZoom:number,pixelsPerView:number){
  const mpp=250/Math.max(.35,workspaceZoom)/Math.max(1,pixelsPerView),
    circumference=Math.cos(clamp(lat,-MAX_LAT,MAX_LAT)*Math.PI/180)*2*Math.PI*R;
  return clamp(Math.log2(circumference/(MAPLIBRE_TILE*mpp)),0,22);
}

function baseMapFields(v:unknown){
  if(!v||typeof v!=='object')return null;
  const m=v as Partial<MapReference>;
  if(typeof m.enabled!=='boolean'||!Number.isFinite(m.lat)||!Number.isFinite(m.lng)||!Number.isFinite(m.zoom)||
    !Number.isFinite(m.opacity)||!Number.isFinite(m.offsetX)||!Number.isFinite(m.offsetY)||typeof m.locked!=='boolean')return null;
  return m;
}
export function validMapReference(v:unknown):v is MapReference{
  const m=baseMapFields(v);
  return !!m&&typeof m.basemap==='string'&&BASEMAPS.has(m.basemap as MapBasemap);
}

export function mapDragOffset(reference:MapReference,dxPixels:number,dyPixels:number,workspaceZoom:number,pixelsPerView:number){
  const metersPerScreenPixel=250/Math.max(.35,workspaceZoom)/Math.max(1,pixelsPerView);
  return {...reference,offsetX:reference.offsetX-dxPixels*metersPerScreenPixel,offsetY:reference.offsetY-dyPixels*metersPerScreenPixel};
}

export function mapReferenceDefaults():MapReference{
  return {enabled:false,lat:13.7563,lng:100.5018,zoom:17,opacity:.55,offsetX:0,offsetY:0,locked:false,basemap:'positron'};
}

export function restoreMapReference(raw:string|null):MapReference{
  const defaults=mapReferenceDefaults();
  if(!raw)return defaults;
  try{
    const parsed=JSON.parse(raw),base=baseMapFields(parsed);
    if(!base)return defaults;
    const basemap=typeof base.basemap==='string'&&BASEMAPS.has(base.basemap as MapBasemap)?base.basemap as MapBasemap:'positron';
    return {...defaults,...base,basemap};
  }catch{return defaults;}
}

export async function searchMapPlaces(query:string):Promise<MapPlace[]>{
  const q=query.trim();
  if(q.length<2)return [];
  const key='thai-street-geocode:'+q.toLocaleLowerCase('th');
  try{
    const cached=typeof sessionStorage!=='undefined'?sessionStorage.getItem(key):null;
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

function RasterFallback({reference,view}:{reference:MapReference;view:{zoom:number;pan:{x:number;y:number}}}){
  const tiles=useMemo(()=>{
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
  return <svg data-map-background="true" data-map-provider="osm-raster" className="map-raster-fallback"
    viewBox={`${-125/view.zoom+view.pan.x} ${-125/view.zoom+view.pan.y} ${250/view.zoom} ${250/view.zoom}`}>
    {tiles.map(t=><image key={t.key} href={t.href} x={t.x} y={t.y} width={t.size} height={t.size} preserveAspectRatio="none"/>)}
  </svg>;
}

function VectorBasemap({reference,view}:{reference:MapReference;view:{zoom:number;pan:{x:number;y:number}}}){
  const container=useRef<HTMLDivElement>(null),map=useRef<MapLibreMap|null>(null),[generation,setGeneration]=useState(0),[failed,setFailed]=useState(false),[pixels,setPixels]=useState(800);
  const style=reference.basemap==='osm-raster'?STYLE_URLS.positron:STYLE_URLS[reference.basemap],
    center=mapCenterForView(reference,view.pan),cameraZoom=mapZoomForViewport(center.lat,view.zoom,pixels);

  useEffect(()=>{
    const node=container.current;
    if(!node)return;
    const observer=new ResizeObserver(entries=>{
      const r=entries[0]?.contentRect;
      if(r)setPixels(Math.max(1,Math.min(r.width,r.height)));
    });
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    let cancelled=false;
    loadMapLibre().then(lib=>{
      if(cancelled||!container.current)return;
      const instance=new lib.Map({
        container:container.current,style,center:[0,0],zoom:0,bearing:0,pitch:0,
        interactive:false,attributionControl:false,maplibreLogo:false,renderWorldCopies:false
      });
      map.current=instance;setFailed(false);setGeneration(v=>v+1);
    }).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;map.current?.remove();map.current=null;};
  },[style]);

  useEffect(()=>{
    const instance=map.current;
    if(!instance)return;
    instance.resize();
    instance.jumpTo({center:[center.lng,center.lat],zoom:cameraZoom,bearing:0,pitch:0});
  },[generation,center.lng,center.lat,cameraZoom]);

  return <div ref={container} data-map-background="true" data-map-provider="openfreemap" data-map-basemap={reference.basemap}
    className="map-reference-map">{failed&&<div className="map-reference-error">OpenFreeMap โหลดไม่ได้ · เลือก OSM Raster เพื่อใช้งานสำรอง</div>}</div>;
}

export default function MapBackground({reference,view}:{reference:MapReference;view:{zoom:number;pan:{x:number;y:number}}}){
  if(!reference.enabled)return null;
  const raster=reference.basemap==='osm-raster';
  return <div className="map-reference-layer" aria-hidden="true">
    <div className="map-reference-surface" style={{opacity:clamp(reference.opacity,.1,1)}}>
      {raster?<RasterFallback reference={reference} view={view}/>:<VectorBasemap reference={reference} view={view}/>}
    </div>
    <div className="map-reference-attribution">
      {raster?'© OpenStreetMap contributors':'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors'}
    </div>
  </div>;
}
