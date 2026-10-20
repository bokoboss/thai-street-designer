'use client';
// Online map under the plan (street map or imagery), kept per browser in the same storage as the earlier pages.
// Place search sets the map so the found place sits at the middle of the design; "ย้ายแผนที่" drags the map
// (its offset) to line it up with the roads. Provider keys stay in this browser and are never saved to the file.
import {useEffect,useState} from 'react';
import {IMAGERY_BASEMAP_OPTIONS,MAP_PROVIDER_CREDENTIALS_STORAGE,MAP_REFERENCE_STORAGE,STREET_BASEMAP_OPTIONS,basemapAccessLabel,basemapCredentialKey,basemapDescription,basemapKind,mapProviderCredentialsDefaults,mapReferenceDefaults,restoreMapProviderCredentials,restoreMapReference,searchMapPlaces,type MapBasemap,type MapPlace,type MapProviderCredentials,type MapReference} from '../junction/map-background';
import type {WorldPoint} from '@/core/network/network-project';
import type {DesignTool} from './design-canvas';

const read=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const write=(key:string,value:unknown)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* keep in memory */}};

export function useMapReference(){
  const [reference,setReference]=useState<MapReference>(mapReferenceDefaults),[credentials,setCredentials]=useState<MapProviderCredentials>(mapProviderCredentialsDefaults);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    // Browser storage is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReference(restoreMapReference(read(MAP_REFERENCE_STORAGE)));setCredentials(restoreMapProviderCredentials(read(MAP_PROVIDER_CREDENTIALS_STORAGE)));setLoaded(true);
  },[]);
  useEffect(()=>{if(loaded)write(MAP_REFERENCE_STORAGE,reference);},[reference,loaded]);
  useEffect(()=>{if(loaded)write(MAP_PROVIDER_CREDENTIALS_STORAGE,credentials);},[credentials,loaded]);
  const update=(patch:Partial<MapReference>)=>setReference(r=>({...r,...patch}));
  return{reference,credentials,update,setCredentials};
}
export type MapState=ReturnType<typeof useMapReference>;

export function MapPanel({map,tool,onTool,center,onMessage}:{map:MapState;tool:DesignTool;onTool:(t:DesignTool)=>void;center:()=>WorldPoint;onMessage:(text:string,kind?:'info'|'error')=>void}){
  const r=map.reference,kind=basemapKind(r.basemap),key=basemapCredentialKey(r.basemap);
  const [host]=useState(()=>typeof window==='undefined'?'':window.location.host);
  const [query,setQuery]=useState(''),[places,setPlaces]=useState<MapPlace[]>([]),[busy,setBusy]=useState(false);
  async function find(){
    if(query.trim().length<2)return;setBusy(true);
    try{const found=await searchMapPlaces(query.trim());setPlaces(found);if(!found.length)onMessage('ไม่พบสถานที่จากคำค้นนี้');}
    catch{setPlaces([]);onMessage('ค้นหาสถานที่ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่','error');}
    finally{setBusy(false);}
  }
  return <section className="design-block" data-design-map={r.enabled?'on':'off'}>
    <header><small className="design-block-title">แผนที่พื้นหลัง</small>
      <label className="design-check"><input type="checkbox" checked={r.enabled} data-design-map-visible="true" onChange={e=>map.update({enabled:e.currentTarget.checked})}/> แสดง</label></header>
    {r.enabled&&<>
      <div className="design-map-search">
        <input type="search" placeholder="ค้นหาสถานที่ ถนน ทางแยก" value={query} data-design-map-query="true" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void find();}}}/>
        <button disabled={busy||query.trim().length<2} onClick={()=>void find()}>{busy?'กำลังค้นหา…':'ค้นหา'}</button>
      </div>
      {places.length>0&&<div className="design-map-results">{places.map((p,i)=><button key={p.label+i} onClick={()=>{const c=center();map.update({lat:p.lat,lng:p.lng,offsetX:c.x,offsetY:c.y});setPlaces([]);setQuery(p.label);onMessage(`ย้ายแผนที่ไปที่ ${p.label} แล้ว · ใช้ “ย้ายแผนที่” เพื่อจัดให้ตรงกับถนน`);}}>{p.label}</button>)}</div>}
      <div className="design-reference-tools">
        <button className={kind==='street'?'active':''} data-design-map-kind="street" onClick={()=>map.update({basemap:'positron'})}>แผนที่ถนน</button>
        <button className={kind==='imagery'?'active':''} data-design-map-kind="imagery" onClick={()=>map.update({basemap:'oam-global'})}>ภาพถ่ายทางอากาศ</button>
      </div>
      <label className="design-select"><span>ผู้ให้บริการ</span><select value={r.basemap} onChange={e=>map.update({basemap:e.target.value as MapBasemap})}>
        {Object.entries(kind==='street'?STREET_BASEMAP_OPTIONS:IMAGERY_BASEMAP_OPTIONS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <p className="design-meta">{basemapAccessLabel(r.basemap)} · {basemapDescription(r.basemap)}</p>
      {key&&<label className="design-select"><span>{key==='esri'?'คีย์ ArcGIS / Esri':'คีย์ MapTiler'}</span>
        <input type="password" autoComplete="off" value={map.credentials[key]} placeholder="ใส่คีย์ของคุณ" onChange={e=>{const v=e.currentTarget.value;map.setCredentials(c=>({...c,[key]:v}));}}/></label>}
      <label className="design-select"><span>ความทึบ</span><input type="range" min="10" max="100" step="5" value={Math.round(r.opacity*100)} onChange={e=>map.update({opacity:Number(e.currentTarget.value)/100})}/></label>
      <div className="design-reference-tools">
        <button className={tool==='map-move'?'active':''} disabled={r.locked} data-design-action="move-map" onClick={()=>onTool(tool==='map-move'?'select':'map-move')}>{tool==='map-move'?'จบการย้ายแผนที่':'ย้ายแผนที่'}</button>
        <label className="design-check"><input type="checkbox" checked={r.locked} onChange={e=>{map.update({locked:e.currentTarget.checked});if(e.currentTarget.checked&&tool==='map-move')onTool('select');}}/> ล็อกตำแหน่ง</label>
      </div>
      <p className="design-meta">แผนที่ใช้มาตราส่วนเดียวกับแบบ (1 หน่วย = 1 ม.) · ตรวจสิทธิ์การใช้ภาพของผู้ให้บริการก่อนนำไปใช้ในรายงาน · คีย์เก็บในเบราว์เซอร์นี้เท่านั้น ควรจำกัดคีย์ให้ใช้ได้เฉพาะโดเมน {host||'ของเว็บนี้'}</p>
    </>}
  </section>;
}
