'use client';
import {useEffect,useMemo,useRef,useState} from 'react';

export type MapBasemap=
  |'positron'|'bright'|'liberty'|'dark'
  |'osm-raster'|'opentopo-raster'|'esri-streets'
  |'satellite-eox-2016'|'esri-imagery'|'maptiler-satellite';
export type MapLayerKind='street'|'imagery';
export type MapProviderCredentials={esri:string;maptiler:string};
export type MapCredentialKey=keyof MapProviderCredentials;
export type MapBasemapMeta={label:string;kind:MapLayerKind;provider:string;credential:MapCredentialKey|null;description:string};

export const MAP_BASEMAP_META:Record<MapBasemap,MapBasemapMeta>={
  positron:{label:'OpenFreeMap · Positron',kind:'street',provider:'OpenFreeMap',credential:null,description:'Vector · clean engineering background · no API key'},
  bright:{label:'OpenFreeMap · Bright',kind:'street',provider:'OpenFreeMap',credential:null,description:'Vector · brighter labels · no API key'},
  liberty:{label:'OpenFreeMap · Liberty',kind:'street',provider:'OpenFreeMap',credential:null,description:'Vector · detailed street style · no API key'},
  dark:{label:'OpenFreeMap · Dark',kind:'street',provider:'OpenFreeMap',credential:null,description:'Vector dark style · no API key'},
  'osm-raster':{label:'OpenStreetMap · Standard',kind:'street',provider:'OpenStreetMap',credential:null,description:'Raster · public OSM tile service · best-effort / fair-use'},
  'opentopo-raster':{label:'OpenTopoMap · Topographic',kind:'street',provider:'OpenTopoMap',credential:null,description:'Raster topo map with terrain · no API key'},
  'esri-streets':{label:'Esri · Streets',kind:'street',provider:'Esri',credential:'esri',description:'Commercial-quality streets · ArcGIS API key required'},
  'satellite-eox-2016':{label:'EOX · Sentinel-2 Cloudless 2016',kind:'imagery',provider:'EOX',credential:null,description:'Open satellite context · ~10 m source resolution · no API key'},
  'esri-imagery':{label:'Esri · World Imagery',kind:'imagery',provider:'Esri',credential:'esri',description:'High-resolution satellite/aerial imagery · ArcGIS API key required'},
  'maptiler-satellite':{label:'MapTiler · Satellite',kind:'imagery',provider:'MapTiler',credential:'maptiler',description:'High-resolution satellite/aerial imagery · MapTiler API key required'}
};
export const BASEMAP_OPTIONS=Object.fromEntries(Object.entries(MAP_BASEMAP_META).map(([id,m])=>[id,m.label])) as Record<MapBasemap,string>;
export const STREET_BASEMAP_OPTIONS=Object.fromEntries(Object.entries(MAP_BASEMAP_META).filter(([,m])=>m.kind==='street').map(([id,m])=>[id,m.label])) as Partial<Record<MapBasemap,string>>;
export const IMAGERY_BASEMAP_OPTIONS=Object.fromEntries(Object.entries(MAP_BASEMAP_META).filter(([,m])=>m.kind==='imagery').map(([id,m])=>[id,m.label])) as Partial<Record<MapBasemap,string>>;
export const MAP_PROVIDER_CREDENTIALS_STORAGE='thai-street-map-provider-credentials-v1';
export const mapProviderCredentialsDefaults=():MapProviderCredentials=>({esri:'',maptiler:''});
export function restoreMapProviderCredentials(raw:string|null):MapProviderCredentials{
  const defaults=mapProviderCredentialsDefaults();if(!raw)return defaults;
  try{const v=JSON.parse(raw) as Partial<MapProviderCredentials>;return{
    esri:typeof v.esri==='string'&&v.esri.length<=1000?v.esri:'',
    maptiler:typeof v.maptiler==='string'&&v.maptiler.length<=1000?v.maptiler:''
  };}catch{return defaults;}
}
export const basemapKind=(basemap:MapBasemap)=>MAP_BASEMAP_META[basemap]?.kind??'street';
export const basemapCredentialKey=(basemap:MapBasemap)=>MAP_BASEMAP_META[basemap]?.credential??null;
export const basemapDescription=(basemap:MapBasemap)=>MAP_BASEMAP_META[basemap]?.description??'';
export const basemapHasCredential=(basemap:MapBasemap,credentials:MapProviderCredentials)=>{
  const key=basemapCredentialKey(basemap);return !key||!!credentials[key].trim();
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
  once:(event:string,handler:()=>void)=>void;
  on:(event:string,handler:(event?:unknown)=>void)=>void;
  off:(event:string,handler:(event?:unknown)=>void)=>void;
  getCanvas:()=>HTMLCanvasElement;
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
    preserveDrawingBuffer?:boolean;
  })=>MapLibreMap;
};

const TILE=256,MAPLIBRE_TILE=512,R=6378137,MAX_LAT=85.05112878;
const MAPLIBRE_JS=[
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js'
];
const MAPLIBRE_CSS=[
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css'
];
const STYLE_URLS:Partial<Record<MapBasemap,string>>={
  positron:'https://tiles.openfreemap.org/styles/positron',
  bright:'https://tiles.openfreemap.org/styles/bright',
  liberty:'https://tiles.openfreemap.org/styles/liberty',
  dark:'https://tiles.openfreemap.org/styles/dark'
};
const BASEMAPS=new Set<MapBasemap>(Object.keys(MAP_BASEMAP_META) as MapBasemap[]);
function vectorStyleUrl(basemap:MapBasemap,credentials:MapProviderCredentials){
  if(STYLE_URLS[basemap])return STYLE_URLS[basemap]!;
  if(basemap==='esri-streets')return 'https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/streets?token='+encodeURIComponent(credentials.esri.trim());
  if(basemap==='esri-imagery')return 'https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery/standard?token='+encodeURIComponent(credentials.esri.trim());
  return STYLE_URLS.positron!;
}
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
      link.rel='stylesheet';link.href=MAPLIBRE_CSS[0];link.dataset.thaiStreetMaplibre='true';
      link.addEventListener('error',()=>{link.href=MAPLIBRE_CSS[1];},{once:true});
      document.head.appendChild(link);
    }
    const done=()=>{
      const lib=(window as typeof window&{maplibregl?:MapLibreGlobal}).maplibregl;
      if(lib)resolve(lib);else reject(new Error('MapLibre loaded without global'));
    };
    const trySource=(index:number)=>{
      if(index>=MAPLIBRE_JS.length){reject(new Error('MapLibre CDN unavailable'));return;}
      document.querySelectorAll('script[data-thai-street-maplibre]').forEach(node=>node.remove());
      const script=document.createElement('script');
      script.src=MAPLIBRE_JS[index];script.async=true;script.dataset.thaiStreetMaplibre='true';
      script.addEventListener('load',done,{once:true});
      script.addEventListener('error',()=>{script.remove();trySource(index+1);},{once:true});
      document.head.appendChild(script);
    };
    const existing=document.querySelector<HTMLScriptElement>('script[data-thai-street-maplibre]');
    if(existing){existing.remove();}
    trySource(0);
  }).catch(error=>{mapLibrePromise=null;throw error;});
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
    dx=pan.x-reference.offsetX,dy=pan.y-reference.offsetY,
    groundScale=Math.max(.01,Math.cos(clamp(reference.lat,-MAX_LAT,MAX_LAT)*Math.PI/180));
  // Workspace coordinates are ground metres; Web Mercator projected metres expand by sec(latitude).
  return fromMercatorMeters(origin.x+dx/groundScale,origin.y-dy/groundScale);
}

export function mapZoomForViewport(lat:number,workspaceZoom:number,pixelsPerView:number,workspaceSpan=250,minWorkspaceZoom=.35){
  const mpp=workspaceSpan/Math.max(minWorkspaceZoom,workspaceZoom)/Math.max(1,pixelsPerView),
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

export function mapDragOffset(reference:MapReference,dxPixels:number,dyPixels:number,workspaceZoom:number,pixelsPerView:number,workspaceSpan=250,minWorkspaceZoom=.35){
  const metersPerScreenPixel=workspaceSpan/Math.max(minWorkspaceZoom,workspaceZoom)/Math.max(1,pixelsPerView);
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

type RasterTileSpec={template:string;minZoom:number;maxZoom:number;provider:string};
function rasterTileSpec(basemap:MapBasemap,credentials:MapProviderCredentials):RasterTileSpec{
  if(basemap==='satellite-eox-2016')return{template:'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',minZoom:0,maxZoom:14,provider:'eox-sentinel-2-cloudless-2016'};
  if(basemap==='opentopo-raster')return{template:'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',minZoom:0,maxZoom:17,provider:'opentopomap'};
  if(basemap==='maptiler-satellite')return{template:'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key='+encodeURIComponent(credentials.maptiler.trim()),minZoom:0,maxZoom:20,provider:'maptiler-satellite-v2'};
  return{template:process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',minZoom:0,maxZoom:19,provider:'osm-raster'};
}
function isRasterBasemap(basemap:MapBasemap){return ['osm-raster','opentopo-raster','satellite-eox-2016','maptiler-satellite'].includes(basemap);}
function tileUrl(spec:RasterTileSpec,z:number,x:number,y:number){return spec.template.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));}

type MapWorkspaceView={zoom:number;pan:{x:number;y:number};span?:number;minZoom?:number};

function RasterFallback({reference,view,credentials}:{reference:MapReference;view:MapWorkspaceView;credentials:MapProviderCredentials}){
  const provider=rasterTileSpec(reference.basemap,credentials).provider;
  const tiles=useMemo(()=>{
    const spec=rasterTileSpec(reference.basemap,credentials),span=view.span??250,safeZoom=Math.max(view.minZoom??.35,view.zoom),
      z=Math.round(clamp(reference.zoom,spec.minZoom,spec.maxZoom)),n=2**z,center=worldPixels(reference.lat,reference.lng,z),mpp=metersPerPixel(reference.lat,z),
      half=span/2/safeZoom,
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
      out.push({key:`${z}/${wx}/${ty}`,href:tileUrl(spec,z,wx,ty),x,y,size});
    }
    return out;
  },[reference,credentials,view.zoom,view.pan.x,view.pan.y,view.span,view.minZoom]);
  const span=view.span??250,safeZoom=Math.max(view.minZoom??.35,view.zoom),half=span/2/safeZoom;
  return <svg data-map-background="true" data-map-provider={provider} className="map-raster-fallback"
    viewBox={`${-half+view.pan.x} ${-half+view.pan.y} ${span/safeZoom} ${span/safeZoom}`}>
    {tiles.map(t=><image key={t.key} href={t.href} x={t.x} y={t.y} width={t.size} height={t.size} preserveAspectRatio="none"/>)}
  </svg>;
}

function VectorBasemap({reference,view,credentials}:{reference:MapReference;view:MapWorkspaceView;credentials:MapProviderCredentials}){
  const container=useRef<HTMLDivElement>(null),map=useRef<MapLibreMap|null>(null),[generation,setGeneration]=useState(0),[status,setStatus]=useState<'loading'|'ready'|'failed'>('loading'),[pixels,setPixels]=useState(800);
  const style=vectorStyleUrl(reference.basemap,credentials),
    center=mapCenterForView(reference,view.pan),cameraZoom=mapZoomForViewport(center.lat,view.zoom,pixels,view.span??250,view.minZoom??.35),
    cameraRef=useRef({center,zoom:cameraZoom});
  useEffect(()=>{cameraRef.current={center:{lat:center.lat,lng:center.lng},zoom:cameraZoom};},[center.lat,center.lng,cameraZoom]);

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
    let cancelled=false,timer=0;
    loadMapLibre().then(lib=>{
      if(cancelled||!container.current)return;
      const initial=cameraRef.current;
      const instance=new lib.Map({
        container:container.current,style,center:[initial.center.lng,initial.center.lat],zoom:initial.zoom,bearing:0,pitch:0,
        interactive:false,attributionControl:false,maplibreLogo:false,renderWorldCopies:false
      });
      map.current=instance;
      let styleLoaded=false;
      const loaded=()=>{if(cancelled)return;styleLoaded=true;window.clearTimeout(timer);setStatus('ready');setGeneration(v=>v+1);};
      const failed=()=>{if(!cancelled&&!styleLoaded)setStatus('failed');};
      instance.once('load',loaded);
      instance.on('error',failed);
      timer=window.setTimeout(failed,12000);
    }).catch(()=>{if(!cancelled)setStatus('failed');});
    return()=>{cancelled=true;window.clearTimeout(timer);map.current?.remove();map.current=null;};
  },[style]);

  useEffect(()=>{
    const instance=map.current;
    if(!instance)return;
    instance.resize();
    instance.jumpTo({center:[center.lng,center.lat],zoom:cameraZoom,bearing:0,pitch:0});
  },[generation,center.lng,center.lat,cameraZoom]);

  return <div ref={container} data-map-background="true" data-map-provider="openfreemap" data-map-basemap={reference.basemap} data-map-status={status}
    className="map-reference-map">{status==='loading'&&<div className="map-reference-loading">กำลังโหลด OpenFreeMap…</div>}{status==='failed'&&<div className="map-reference-error">OpenFreeMap โหลดไม่ได้ · เลือก OSM Raster เพื่อใช้งานสำรอง</div>}</div>;
}


function loadRasterImage(src:string){
  return new Promise<HTMLImageElement|null>(resolve=>{
    const image=new Image();
    image.crossOrigin='anonymous';
    image.onload=()=>resolve(image);
    image.onerror=()=>resolve(null);
    image.src=src;
  });
}

async function renderRasterTexture(reference:MapReference,credentials:MapProviderCredentials,extent:number,size:number,worldCenter:{x:number;y:number}){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const spec=rasterTileSpec(reference.basemap,credentials),z=Math.round(clamp(reference.zoom,spec.minZoom,spec.maxZoom)),n=2**z,center=worldPixels(reference.lat,reference.lng,z),mpp=metersPerPixel(reference.lat,z),
    minX=worldCenter.x-extent,maxX=worldCenter.x+extent,minY=worldCenter.y-extent,maxY=worldCenter.y+extent,
    px0=center.x+(minX-reference.offsetX)/mpp,px1=center.x+(maxX-reference.offsetX)/mpp,
    py0=center.y+(minY-reference.offsetY)/mpp,py1=center.y+(maxY-reference.offsetY)/mpp,
    tx0=Math.floor(Math.min(px0,px1)/TILE)-1,tx1=Math.floor(Math.max(px0,px1)/TILE)+1,
    ty0=Math.max(0,Math.floor(Math.min(py0,py1)/TILE)-1),ty1=Math.min(n-1,Math.floor(Math.max(py0,py1)/TILE)+1),
    worldToPixel=size/(extent*2),tileWorld=TILE*mpp;
  const jobs:Promise<void>[]=[];
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
    const wx=wrap(tx,n),worldX=(tx*TILE-center.x)*mpp+reference.offsetX,worldY=(ty*TILE-center.y)*mpp+reference.offsetY;
    jobs.push(loadRasterImage(tileUrl(spec,z,wx,ty)).then(image=>{if(!image)return;ctx.drawImage(image,(worldX-(worldCenter.x-extent))*worldToPixel,(worldY-(worldCenter.y-extent))*worldToPixel,tileWorld*worldToPixel,tileWorld*worldToPixel);}));
  }
  await Promise.all(jobs);
  return canvas;
}

async function renderVectorTexture(reference:MapReference,credentials:MapProviderCredentials,extent:number,size:number,worldCenter:{x:number;y:number}){
  const lib=await loadMapLibre(),holder=document.createElement('div');
  Object.assign(holder.style,{position:'fixed',left:'-20000px',top:'0',width:size+'px',height:size+'px',pointerEvents:'none'});
  document.body.appendChild(holder);
  const center=mapCenterForView(reference,worldCenter),workspaceZoom=250/(extent*2),zoom=mapZoomForViewport(center.lat,workspaceZoom,size),
    style=vectorStyleUrl(reference.basemap,credentials);
  const map=new lib.Map({container:holder,style,center:[center.lng,center.lat],zoom,bearing:0,pitch:0,interactive:false,attributionControl:false,maplibreLogo:false,renderWorldCopies:false,preserveDrawingBuffer:true});
  try{
    await new Promise<void>((resolve,reject)=>{
      let settled=false;
      const finish=()=>{if(settled)return;settled=true;window.clearTimeout(timer);resolve();};
      const fail=()=>{if(settled)return;settled=true;window.clearTimeout(timer);reject(new Error('MapLibre texture failed'));};
      const timer=window.setTimeout(fail,15000);
      map.once('idle',finish);
      map.once('load',()=>{window.setTimeout(finish,1200);});
    });
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.drawImage(map.getCanvas(),0,0,size,size);
    return canvas;
  }finally{map.remove();holder.remove();}
}

export async function renderMapTexture(reference:MapReference,credentials:MapProviderCredentials,extent:number,size=1200,worldCenter:{x:number;y:number}={x:0,y:0}){
  if(!reference.enabled||typeof document==='undefined'||!basemapHasCredential(reference.basemap,credentials))return null;
  try{return isRasterBasemap(reference.basemap)?await renderRasterTexture(reference,credentials,extent,size,worldCenter):await renderVectorTexture(reference,credentials,extent,size,worldCenter);}
  catch{return null;}
}
function attributionFor(basemap:MapBasemap){
  if(basemap==='satellite-eox-2016')return <><a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless</a> by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX</a> · modified Copernicus Sentinel data 2016/2017 · CC BY 4.0</>;
  if(basemap==='opentopo-raster')return <>Map data © OpenStreetMap contributors, SRTM · map style © OpenTopoMap (CC-BY-SA)</>;
  if(basemap==='esri-imagery')return <>© Esri, Vantor, Earthstar Geographics, GIS User Community</>;
  if(basemap==='esri-streets')return <>© Esri and data providers</>;
  if(basemap==='maptiler-satellite')return <>© MapTiler · imagery providers</>;
  if(basemap==='osm-raster')return <>© OpenStreetMap contributors</>;
  return <>OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors</>;
}
export default function MapBackground({reference,view,credentials}:{reference:MapReference;view:MapWorkspaceView;credentials:MapProviderCredentials}){
  if(!reference.enabled)return null;
  const raster=isRasterBasemap(reference.basemap),missing=!basemapHasCredential(reference.basemap,credentials);
  return <div className="map-reference-layer" aria-hidden="true">
    <div className="map-reference-surface" style={{opacity:clamp(reference.opacity,.1,1)}}>
      {missing?<div className="map-reference-error">Provider นี้ต้องตั้งค่า API key ก่อนใช้งาน</div>:raster?<RasterFallback reference={reference} view={view} credentials={credentials}/>:<VectorBasemap reference={reference} view={view} credentials={credentials}/>}
    </div>
    <div className="map-reference-attribution">{attributionFor(reference.basemap)}</div>
  </div>;
}
