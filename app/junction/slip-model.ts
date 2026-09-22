import type {Design} from './model';

export type SlipApproach=
  |{mode:'direct'}
  |{mode:'auxiliary';width:number;storage:number;taper:number};

export type SlipDeparture=
  |{mode:'direct'}
  |{mode:'shared-aux';width:number;length:number;taper:number}
  |{mode:'acceleration';width:number;length:number;merge:number;separator:'chevron'|'raised';separatorWidth:number};

export type SlipLane={
  id:string;
  fromArm:number;
  toArm:number;
  width:number;
  radius:number;
  approach:SlipApproach;
  departure:SlipDeparture;
  crossing:{enabled:boolean;offset:number};
  arrowOffset?:number;
};

export const slipIdForArm=(fromArm:number)=>`slip-${fromArm}`;

export function defaultSlip(fromArm:number,toArm:number,width=4,radius=32):SlipLane{
  return{
    id:slipIdForArm(fromArm),
    fromArm,toArm,width,radius,
    approach:{mode:'direct'},
    departure:{mode:'direct'},
    crossing:{enabled:false,offset:10}
  };
}

export function slipForArm(d:Pick<Design,'slips'>,fromArm:number){
  return d.slips.find(s=>s.fromArm===fromArm);
}

export function nextActiveArm(d:Pick<Design,'enabled'|'arms'>,fromArm:number){
  const ids=d.enabled.map((v,i)=>v?i:-1).filter(i=>i>=0);
  const k=ids.indexOf(fromArm);
  return k<0||ids.length<2?null:ids[(k+1)%ids.length];
}

export function validSlip(s:SlipLane,armCount=4){
  if(!s||typeof s!=='object')return false;
  if(typeof s.id!=='string'||!/^slip-[0-9]+$/.test(s.id))return false;
  if(!Number.isInteger(s.fromArm)||s.fromArm<0||s.fromArm>=armCount)return false;
  if(!Number.isInteger(s.toArm)||s.toArm<0||s.toArm>=armCount||s.toArm===s.fromArm)return false;
  if(!Number.isFinite(s.width)||s.width<3||s.width>6)return false;
  if(!Number.isFinite(s.radius)||s.radius<10||s.radius>60)return false;
  if(!s.crossing||typeof s.crossing.enabled!=='boolean'||!Number.isFinite(s.crossing.offset)||s.crossing.offset<2||s.crossing.offset>600)return false;
  if(s.arrowOffset!==undefined&&(!Number.isFinite(s.arrowOffset)||s.arrowOffset<2||s.arrowOffset>600))return false;

  if(!s.approach||typeof s.approach!=='object')return false;
  if(s.approach.mode==='auxiliary'){
    if(!Number.isFinite(s.approach.width)||s.approach.width<2.5||s.approach.width>4.5)return false;
    if(!Number.isFinite(s.approach.storage)||s.approach.storage<5||s.approach.storage>140)return false;
    if(!Number.isFinite(s.approach.taper)||s.approach.taper<5||s.approach.taper>80)return false;
  }else if(s.approach.mode!=='direct')return false;

  if(!s.departure||typeof s.departure!=='object')return false;
  if(s.departure.mode==='shared-aux'){
    if(!Number.isFinite(s.departure.width)||s.departure.width<2.5||s.departure.width>4.5)return false;
    if(!Number.isFinite(s.departure.length)||s.departure.length<5||s.departure.length>140)return false;
    if(!Number.isFinite(s.departure.taper)||s.departure.taper<5||s.departure.taper>80)return false;
  }else if(s.departure.mode==='acceleration'){
    if(!Number.isFinite(s.departure.width)||s.departure.width<2.5||s.departure.width>6)return false;
    if(!Number.isFinite(s.departure.length)||s.departure.length<5||s.departure.length>200)return false;
    if(!Number.isFinite(s.departure.merge)||s.departure.merge<5||s.departure.merge>120)return false;
    if(!['chevron','raised'].includes(s.departure.separator))return false;
    if(!Number.isFinite(s.departure.separatorWidth)||s.departure.separatorWidth<.5||s.departure.separatorWidth>4)return false;
  }else if(s.departure.mode!=='direct')return false;
  return true;
}

export function addSlip(d:Design,fromArm:number):Design{
  if(slipForArm(d,fromArm))return d;
  const toArm=nextActiveArm(d,fromArm);
  if(toArm===null)return d;
  const source=d.arms[fromArm],target=d.arms[toArm];
  if(!source?.incoming||!target?.outgoing)return d;
  return{...d,slips:[...d.slips,defaultSlip(fromArm,toArm,source.slipWidth??4,source.slipRadius??32)]};
}

export function removeSlip(d:Design,fromArm:number):Design{
  return{...d,slips:d.slips.filter(s=>s.fromArm!==fromArm)};
}

export function updateSlip(d:Design,id:string,patch:Partial<Omit<SlipLane,'id'|'fromArm'|'toArm'>>):Design{
  return{...d,slips:d.slips.map(s=>s.id===id?{...s,...patch}:s)};
}
