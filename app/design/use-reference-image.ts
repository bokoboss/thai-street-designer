'use client';
// Reference image under the plan (a site plan or an aerial the user may trace): kept in this browser only,
// the same storage the earlier Network page uses, so an image placed there shows here too.
import {useCallback,useEffect,useRef,useState} from 'react';
import {LOCAL_IMAGE_REFERENCE_STORAGE,calibrateLocalImageReference,initialLocalImageReference,localImageReferenceDefaults,restoreLocalImageReference,type LocalImageReference,type ReferencePoint} from '@/core/network/local-reference';
import {clearLocalImageBlob,loadLocalImageBlob,readLocalImageDimensions,saveLocalImageBlob} from '../network/local-reference-layer';

export const REFERENCE_IMAGE_LIMIT=50*1024*1024;

export function useReferenceImage(onMessage:(text:string,kind?:'info'|'error')=>void){
  const [reference,setReference]=useState<LocalImageReference>(localImageReferenceDefaults);
  const [url,setUrl]=useState<string|null>(null);
  const urlRef=useRef<string|null>(null),[loaded,setLoaded]=useState(false);
  const show=useCallback((blob:Blob)=>{const next=URL.createObjectURL(blob);if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current=next;setUrl(next);},[]);

  useEffect(()=>{
    // Browser storage is only available after mount.
    let alive=true;
    const stored=restoreLocalImageReference((()=>{try{return localStorage.getItem(LOCAL_IMAGE_REFERENCE_STORAGE);}catch{return null;}})());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReference(stored);setLoaded(true);
    if(stored.widthPx>0)loadLocalImageBlob().then(blob=>{if(alive&&blob)show(blob);}).catch(()=>{});
    return()=>{alive=false;};
  },[show]);
  useEffect(()=>{if(loaded)try{localStorage.setItem(LOCAL_IMAGE_REFERENCE_STORAGE,JSON.stringify(reference));}catch{/* keep in memory */}},[reference,loaded]);
  useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);

  /** Place a new image centred on the plan view, about 300 m across until it is scaled. */
  const add=useCallback(async(file:File,center:ReferencePoint)=>{
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>REFERENCE_IMAGE_LIMIT){onMessage('รองรับภาพ JPG หรือ PNG ขนาดไม่เกิน 50 MB','error');return;}
    try{
      const size=await readLocalImageDimensions(file);
      // Show the image right away; keeping it for the next visit happens in the background.
      show(file);setReference(initialLocalImageReference(file.name,size.width,size.height,center));
      onMessage(`เพิ่มภาพอ้างอิง ${file.name} แล้ว · ตั้งมาตราส่วนจากระยะจริงก่อนใช้วัดหรือวาดตาม`);
      saveLocalImageBlob(file).catch(()=>onMessage('แสดงภาพได้ แต่เก็บภาพไว้ในเบราว์เซอร์ไม่ได้ · เมื่อเปิดหน้าใหม่ต้องเพิ่มภาพอีกครั้ง','error'));
    }catch{onMessage('อ่านภาพไม่สำเร็จ ลองใช้ไฟล์ JPG หรือ PNG อื่น','error');}
  },[onMessage,show]);
  const remove=useCallback(async()=>{
    try{await clearLocalImageBlob();}catch{/* the reference is cleared either way */}
    if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
    setUrl(null);setReference(localImageReferenceDefaults());onMessage('ลบภาพอ้างอิงแล้ว');
  },[onMessage]);
  const update=useCallback((patch:Partial<LocalImageReference>)=>setReference(r=>({...r,...patch})),[]);
  /** Scale the image so that A–B measures the typed distance; A stays where it is. */
  const calibrate=useCallback((a:ReferencePoint,b:ReferencePoint,distance:number)=>{
    const next=calibrateLocalImageReference(reference,a,b,distance);
    if(!next){onMessage('ตั้งมาตราส่วนไม่ได้ ตรวจว่าจุด A กับ B ไม่ซ้ำกันและระยะมากกว่า 0','error');return false;}
    setReference(next);onMessage(`ตั้งมาตราส่วนภาพแล้ว: A–B = ${distance} ม.`);return true;
  },[reference,onMessage]);

  return{reference,url,add,remove,update,calibrate,has:reference.widthPx>0&&!!url};
}
