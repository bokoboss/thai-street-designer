export type ReferencePoint={x:number;y:number};

export type LocalImageReference={
  enabled:boolean;
  fileName:string;
  widthPx:number;
  heightPx:number;
  metersPerPixel:number;
  x:number;
  y:number;
  rotation:number;
  opacity:number;
  locked:boolean;
  calibrated:boolean;
  calibrationDistance:number|null;
};

export const LOCAL_IMAGE_REFERENCE_STORAGE='thai-street-local-image-reference-v1';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const finite=(value:unknown,fallback:number)=>{
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
};
const normalizeRotation=(value:number)=>((value%360)+360)%360;

export function localImageReferenceDefaults():LocalImageReference{
  return{
    enabled:false,fileName:'',widthPx:0,heightPx:0,metersPerPixel:1,
    x:0,y:0,rotation:0,opacity:.55,locked:false,calibrated:false,calibrationDistance:null
  };
}

export function initialLocalImageReference(fileName:string,widthPx:number,heightPx:number,center:ReferencePoint,targetSpan=300):LocalImageReference{
  const width=Math.max(1,finite(widthPx,1)),height=Math.max(1,finite(heightPx,1)),
    span=Math.max(20,finite(targetSpan,300)),metersPerPixel=clamp(span/Math.max(width,height),1e-5,1e4);
  return{
    ...localImageReferenceDefaults(),enabled:true,fileName:fileName.slice(0,240),widthPx:width,heightPx:height,
    metersPerPixel,x:finite(center.x,0),y:finite(center.y,0)
  };
}

export function restoreLocalImageReference(raw:string|null):LocalImageReference{
  const defaults=localImageReferenceDefaults();
  if(!raw)return defaults;
  try{
    const value=JSON.parse(raw) as Partial<LocalImageReference>,widthPx=finite(value.widthPx,0),heightPx=finite(value.heightPx,0),
      metersPerPixel=finite(value.metersPerPixel,1),calibrationDistance=value.calibrationDistance===null?null:finite(value.calibrationDistance,0);
    if(widthPx<0||heightPx<0||metersPerPixel<=0)return defaults;
    return{
      enabled:!!value.enabled,
      fileName:typeof value.fileName==='string'?value.fileName.slice(0,240):'',
      widthPx:clamp(widthPx,0,100000),
      heightPx:clamp(heightPx,0,100000),
      metersPerPixel:clamp(metersPerPixel,1e-5,1e4),
      x:finite(value.x,0),y:finite(value.y,0),rotation:normalizeRotation(finite(value.rotation,0)),
      opacity:clamp(finite(value.opacity,.55),.05,1),locked:!!value.locked,calibrated:!!value.calibrated,
      calibrationDistance:calibrationDistance!==null&&calibrationDistance>0?calibrationDistance:null
    };
  }catch{return defaults;}
}

export function localImageFootprint(reference:LocalImageReference){
  return{width:reference.widthPx*reference.metersPerPixel,height:reference.heightPx*reference.metersPerPixel};
}

export function calibrateLocalImageReference(reference:LocalImageReference,a:ReferencePoint,b:ReferencePoint,knownDistance:number):LocalImageReference|null{
  const measured=Math.hypot(b.x-a.x,b.y-a.y),target=Number(knownDistance);
  if(!Number.isFinite(measured)||measured<1e-6||!Number.isFinite(target)||target<=0)return null;
  const factor=target/measured,nextMetersPerPixel=reference.metersPerPixel*factor;
  if(!Number.isFinite(nextMetersPerPixel)||nextMetersPerPixel<1e-5||nextMetersPerPixel>1e4)return null;
  return{
    ...reference,
    metersPerPixel:nextMetersPerPixel,
    x:a.x+(reference.x-a.x)*factor,
    y:a.y+(reference.y-a.y)*factor,
    calibrated:true,
    calibrationDistance:target
  };
}
