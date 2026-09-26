export type StationInterpolation='linear'|'smooth'|'hold';
export type StationValueKnot={station:number;value:number};
export type StationValueProfile={knots:StationValueKnot[];interpolation:StationInterpolation};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export function createStationProfile(knots:StationValueKnot[],interpolation:StationInterpolation='linear'):StationValueProfile{
  const sorted=knots
    .filter(k=>Number.isFinite(k.station)&&Number.isFinite(k.value))
    .map(k=>({station:Math.max(0,k.station),value:k.value}))
    .sort((a,b)=>a.station-b.station);
  const normalized:StationValueKnot[]=[];
  for(const knot of sorted){
    const last=normalized.at(-1);
    if(last&&Math.abs(last.station-knot.station)<1e-9)last.value=knot.value;
    else normalized.push(knot);
  }
  return{knots:normalized,interpolation};
}

export function constantStationProfile(value:number,total:number):StationValueProfile{
  const end=Math.max(0,Number.isFinite(total)?total:0);
  return createStationProfile([{station:0,value},{station:end,value}],'linear');
}

export function endpointStationProfile(startValue:number,endValue:number,total:number):StationValueProfile{
  const end=Math.max(0,Number.isFinite(total)?total:0);
  return createStationProfile([{station:0,value:startValue},{station:end,value:endValue}],'linear');
}

export function transitionStationProfile(startValue:number,endValue:number,total:number,start:number,end:number,interpolation:StationInterpolation='smooth'):StationValueProfile{
  const length=Math.max(0,Number.isFinite(total)?total:0),a=clamp(Number.isFinite(start)?start:0,0,length),b=clamp(Number.isFinite(end)?end:length,0,length),
    lo=Math.min(a,b),hi=Math.max(a,b);
  if(hi-lo<1e-9)return createStationProfile([{station:0,value:startValue},{station:lo,value:startValue},{station:hi,value:endValue},{station:length,value:endValue}],'hold');
  return createStationProfile([{station:0,value:startValue},{station:lo,value:startValue},{station:hi,value:endValue},{station:length,value:endValue}],interpolation);
}

export function valueAtStation(profile:StationValueProfile,station:number){
  const knots=profile.knots;
  if(!knots.length)return 0;
  const s=Number.isFinite(station)?station:0;
  if(s<=knots[0].station)return knots[0].value;
  for(let i=1;i<knots.length;i++){
    const a=knots[i-1],b=knots[i];
    if(s<=b.station){
      if(profile.interpolation==='hold')return a.value;
      const raw=(s-a.station)/(b.station-a.station||1),t=profile.interpolation==='smooth'?smooth(raw):clamp(raw,0,1);
      return mix(a.value,b.value,t);
    }
  }
  return knots.at(-1)?.value??0;
}

export function sampleStationProfile(profile:StationValueProfile,stations:number[]){
  return stations.map(station=>valueAtStation(profile,station));
}

export function sampleStationSeries(stations:number[],values:number[],station:number){
  if(!stations.length||!values.length)return 0;
  if(station<=stations[0])return values[0]??0;
  for(let i=1;i<stations.length;i++){
    if(station<=stations[i]){
      const a=stations[i-1],b=stations[i],t=(station-a)/(b-a||1);
      return mix(values[i-1]??0,values[i]??0,clamp(t,0,1));
    }
  }
  return values.at(-1)??0;
}

/**
 * Review mode intentionally keeps exact endpoint collars and an envelope in
 * every interior sample. This preserves legacy geometry while still routing
 * station sampling through the shared profile layer.
 */
export function endpointEnvelopeValues(stations:number[],startValue:number,endValue:number,envelope:number,total:number){
  const last=stations.length-1;
  return stations.map((station,index)=>{
    if(index===0)return startValue;
    if(index===last)return endValue;
    if(total<=0)return envelope;
    return envelope;
  });
}
