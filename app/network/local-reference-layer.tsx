'use client';
import type {LocalImageReference} from '@/lib/local-reference';

const DB_NAME='thai-street-local-reference-v1',STORE_NAME='images',IMAGE_KEY='active-site-plan';

function openDb(){
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error('IndexedDB open failed'));
  });
}

export async function saveLocalImageBlob(blob:Blob){
  const db=await openDb();
  try{
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,'readwrite');
      transaction.objectStore(STORE_NAME).put(blob,IMAGE_KEY);
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error??new Error('Image save failed'));
      transaction.onabort=()=>reject(transaction.error??new Error('Image save aborted'));
    });
  }finally{db.close();}
}

export async function loadLocalImageBlob(){
  const db=await openDb();
  try{
    return await new Promise<Blob|null>((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,'readonly'),request=transaction.objectStore(STORE_NAME).get(IMAGE_KEY);
      request.onsuccess=()=>resolve(request.result instanceof Blob?request.result:null);
      request.onerror=()=>reject(request.error??new Error('Image load failed'));
    });
  }finally{db.close();}
}

export async function clearLocalImageBlob(){
  const db=await openDb();
  try{
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,'readwrite');
      transaction.objectStore(STORE_NAME).delete(IMAGE_KEY);
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error??new Error('Image delete failed'));
      transaction.onabort=()=>reject(transaction.error??new Error('Image delete aborted'));
    });
  }finally{db.close();}
}

export async function readLocalImageDimensions(blob:Blob){
  if(typeof createImageBitmap==='function'){
    const bitmap=await createImageBitmap(blob);
    try{return{width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}
  }
  return await new Promise<{width:number;height:number}>((resolve,reject)=>{
    const url=URL.createObjectURL(blob),image=new Image();
    image.onload=()=>{const result={width:image.naturalWidth,height:image.naturalHeight};URL.revokeObjectURL(url);resolve(result);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image decode failed'));};
    image.src=url;
  });
}

export default function LocalImageReferenceLayer({
  reference,imageUrl,view
}:{
  reference:LocalImageReference;
  imageUrl:string|null;
  view:{zoom:number;pan:{x:number;y:number};span?:number;minZoom?:number};
}){
  if(!reference.enabled||!imageUrl||reference.widthPx<=0||reference.heightPx<=0)return null;
  const span=view.span??250,safeZoom=Math.max(view.minZoom??.35,view.zoom),half=span/2/safeZoom,
    width=reference.widthPx*reference.metersPerPixel,height=reference.heightPx*reference.metersPerPixel;
  return <svg
    className="network-local-reference-layer"
    data-local-reference-image="true"
    data-local-reference-calibrated={reference.calibrated?'true':'false'}
    viewBox={`${-half+view.pan.x} ${-half+view.pan.y} ${span/safeZoom} ${span/safeZoom}`}
    aria-hidden="true"
  >
    <g transform={`translate(${reference.x} ${reference.y}) rotate(${reference.rotation})`} opacity={reference.opacity}>
      <image href={imageUrl} x={-width/2} y={-height/2} width={width} height={height} preserveAspectRatio="none"/>
    </g>
  </svg>;
}
