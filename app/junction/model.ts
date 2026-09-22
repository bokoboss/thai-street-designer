import type {AllocationMode} from './allocation';
import type {RoundaboutSettings} from './roundabout';

export const MAX_SLIP_CROSS_OFFSET=600;
export type Band={id:string;type:"shoulder"|"bike"|"motorcycle"|"buffer";width:number};
export type Direction='incoming'|'outgoing';
export type Section={width:number;walk:number;bands:Band[]};
export type Pocket={allocation?:AllocationMode;retainedMedian?:number;width?:number;lanes:number;length:number;taper:number};
export type SlipAuxMode='direct'|'added'|'channelized';
export type SlipAccelerationSeparator='chevron'|'raised';
/** Legacy channelized approach values are interpreted as an ordinary adjacent auxiliary lane. */
export const slipApproachMode=(value:SlipAuxMode|undefined,hasLane:boolean):'direct'|'added'=>value==='direct'?'direct':(value||hasLane?'added':'direct');
/** Departure modes: direct = enter existing curb lane, added = junction departure auxiliary, channelized = protected Slip acceleration lane. */
export const slipDepartureMode=(value:SlipAuxMode|undefined,hasDepartureAux:boolean):SlipAuxMode=>value??(hasDepartureAux?'added':'direct');
export const slipSeparatorWidth=(value:number|undefined)=>Math.max(.5,Math.min(4,value??1.5));
export const slipAccelerationWidth=(a:Arm)=>Math.max(2.5,Math.min(6,a.slipAccelerationWidth??a.slipWidth));
export const slipAccelerationLength=(a:Arm)=>Math.max(5,Math.min(200,a.slipAccelerationLength??40));
export const slipAccelerationMerge=(a:Arm)=>Math.max(5,Math.min(120,a.slipAccelerationMerge??25));
export const slipAccelerationSeparator=(a:Arm):SlipAccelerationSeparator=>a.slipAccelerationSeparator??'chevron';
export type Pockets={left:Pocket;right:Pocket};
export const emptyPockets=():Pockets=>({
  left:{lanes:0,length:25,taper:15},
  right:{lanes:0,length:25,taper:15}
});
export const sectionFor=(a:Arm,side:Direction):Section=>a[side==='incoming'?'incomingSection':'outgoingSection']??{width:a.width,walk:a.walk,bands:a.bands};
export const pocketsFor=(a:Arm,side:Direction):Pockets=>a[side==='incoming'?'incomingPockets':'outgoingPockets']??emptyPockets();
export const pocketLaneWidth=(a:Arm,side:Direction,which:'left'|'right')=>pocketsFor(a,side)[which].width??sectionFor(a,side).width;

export type LaneArrowCode='straight'|'left'|'right'|'sl'|'sr'|'lr'|'all'|'ru'|'uturn'|'su'|'none'|'merge';
export type LaneRole='main'|'aux-left'|'aux-right';
export type LaneArrowPlacement={id:string;code:LaneArrowCode;offset:number};
export type LaneArrowOverrides=Record<string,LaneArrowPlacement[]>;
export type LaneMarkings={
  incomingMain:LaneArrowCode[];
  outgoingMain:LaneArrowCode[];
  incomingAux:{left:LaneArrowCode[];right:LaneArrowCode[]};
  outgoingAux:{left:LaneArrowCode[];right:LaneArrowCode[]};
};

const validBands=(v:Band[])=>Array.isArray(v)&&v.length<=6&&v.every(b=>!!b&&typeof b.id==='string'&&['shoulder','bike','motorcycle','buffer'].includes(b.type)&&Number.isFinite(b.width)&&b.width>=.25&&b.width<=4.5);
const validSection=(s:Section)=>!!s&&Number.isFinite(s.width)&&s.width>=2.5&&s.width<=4.5&&Number.isFinite(s.walk)&&s.walk>=0&&s.walk<=5&&validBands(s.bands);
const validPockets=(p:Pockets)=>!!p&&['left','right'].every(k=>{
  const v=p[k as keyof Pockets];
  return !!v
    &&(v.allocation===undefined||['auto','median','retain','widen','reallocate','legacy-preserve'].includes(v.allocation))
    &&(v.retainedMedian===undefined||(Number.isFinite(v.retainedMedian)&&v.retainedMedian>=0&&v.retainedMedian<=8))
    &&(v.width===undefined||(Number.isFinite(v.width)&&v.width>=2.5&&v.width<=4.5))
    &&[0,1,2,3].includes(v.lanes)
    &&Number.isFinite(v.length)&&v.length>=5&&v.length<=140
    &&Number.isFinite(v.taper)&&v.taper>=5&&v.taper<=80;
});

export type Roadside={trees:boolean;lights:boolean;spacing:number;offset:number;start:number;stagger:boolean;treeHeight:number;treeSize:number;lightHeight:number;lightSize:number;lightReach:number};
export const roadsideDefaults=():Roadside=>({trees:false,lights:false,spacing:15,offset:.5,start:10,stagger:false,treeHeight:5,treeSize:3.2,lightHeight:8,lightSize:.22,lightReach:3});
export function roadsideFor(d:Design,a:Arm,side:'incoming'|'outgoing'):Roadside{
  return a.roadside?.[side]??{...roadsideDefaults(),trees:d.trees,lights:d.lights,spacing:d.objectSpacing,offset:d.objectOffset,start:d.objectStart,stagger:d.stagger};
}
function validRoadside(v:Roadside){
  return !!v
    &&['trees','lights','stagger'].every(k=>typeof v[k as keyof Roadside]==='boolean')
    &&Object.entries({spacing:[5,50],offset:[0,5],start:[0,80],treeHeight:[2,15],treeSize:[1,8],lightHeight:[3,15],lightSize:[.1,.6],lightReach:[1,6]}).every(([k,[lo,hi]])=>{
      const n=v[k as keyof Roadside];
      return typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
    });
}

export type MedianTrees={enabled:boolean;start:number;spacing:number;height:number;crown:number;offset:number};
export const medianTreeDefaults=():MedianTrees=>({enabled:false,start:18,spacing:8,height:5,crown:1.5,offset:0});
export type MedianOpening={id:string;start:number;length:number;type?:'opening'|'uturn'};
export type Display={grid:boolean;trees:boolean;lights:boolean;dimensions:boolean;reviews:boolean;handles:boolean};
export const displayFor=(d:Design):Display=>({grid:true,trees:true,lights:true,dimensions:false,reviews:true,handles:true,...d.display});

export type Arm={
  /** Deprecated schema-4 retained-median helper. Migration converts explicit values to per-pocket retain mode. */
  residualTarget?:number;
  medianTrees?:MedianTrees;
  medianOpenings?:MedianOpening[];
  corridorMode?:'preserve'|'widen';
  incomingSection?:Section;
  outgoingSection?:Section;
  incomingPockets?:Pockets;
  outgoingPockets?:Pockets;
  laneMarkings?:LaneMarkings;
  arrowOverrides?:LaneArrowOverrides;
  outgoingDividerMode?:'solid'|'dashed';
  outgoingSolidLength?:number;
  dividerMode?:'solid'|'dashed';
  solidLength?:number;
  roadside?:{incoming:Roadside;outgoing:Roadside};
  angle:number;
  length:number;
  bands:Band[];
  stopOffset:number;
  slipCrossing:boolean;
  slipCrossOffset:number;
  /** Optional centerline distance from Slip entry tangent; omitted = automatic mid-arc placement. */
  slipArrowOffset?:number;
  /** Slip approach: direct from curbside lane or an adjacent auxiliary left-turn lane. Legacy 'channelized' reads as 'added'. */
  slipApproachMode?:SlipAuxMode;
  /** Slip departure: direct, added auxiliary lane from junction mouth, or protected Slip acceleration lane ('channelized'). */
  slipReceivingMode?:SlipAuxMode;
  /** Deprecated legacy approach separator; retained only for schema compatibility. */
  slipApproachSeparator?:number;
  /** Width of the departure gore/raised separator protecting a Slip acceleration lane. */
  slipReceivingSeparator?:number;
  slipAccelerationWidth?:number;
  slipAccelerationLength?:number;
  slipAccelerationMerge?:number;
  slipAccelerationSeparator?:SlipAccelerationSeparator;
  medianOffset:number;
  crossOffset:number;
  slipWidth:number;
  slipRadius:number;
  slip:boolean;
  name:string;
  incoming:number;
  outgoing:number;
  width:number;
  median:number;
  crossing:boolean;
  signal:boolean;
  stop:boolean;
  walk:number;
  /** Legacy incoming-main arrow array retained for schema migration/export compatibility. */
  arrows:string[];
};

export type Design={
  display?:Partial<Display>;
  roundabout?:RoundaboutSettings;
  schemaVersion:number;
  trees:boolean;
  lights:boolean;
  objectSpacing:number;
  objectOffset:number;
  objectStart:number;
  stagger:boolean;
  showNames:boolean;
  showScale:boolean;
  showArrows:boolean;
  enabled:boolean[];
  corner:number;
  circulation:number;
  type:string;
  arms:Arm[];
  rotation:number;
  radius:number;
  ring:number;
  title:string
};

export const names=['ตะวันออก','ใต้','ตะวันตก','เหนือ'];
export const options:Record<LaneArrowCode,string>={
  straight:'ตรง',
  left:'ซ้าย',
  right:'ขวา',
  sl:'ตรง + ซ้าย',
  sr:'ตรง + ขวา',
  lr:'ซ้าย + ขวา',
  all:'ตรง + ซ้าย + ขวา',
  ru:'ขวา + กลับรถ',
  uturn:'กลับรถ',
  su:'ตรง + กลับรถ',
  merge:'รวมเข้าช่องหลัก',
  none:'ไม่มีลูกศร'
};

const asCode=(v:unknown,fallback:LaneArrowCode):LaneArrowCode=>
  typeof v==='string'&&Object.hasOwn(options,v)?v as LaneArrowCode:fallback;

export function markingsFor(a:Arm):LaneMarkings{
  const m=a.laneMarkings;
  const legacy=(a.arrows??[]) as LaneArrowCode[];
  const incomingPockets=pocketsFor(a,'incoming'),outgoingPockets=pocketsFor(a,'outgoing');
  const fill=(n:number,source:LaneArrowCode[]|undefined,fallback:(i:number)=>LaneArrowCode)=>
    Array.from({length:n},(_,i)=>asCode(source?.[i],fallback(i)));
  return {
    incomingMain:fill(a.incoming,m?.incomingMain,i=>asCode(legacy[i],'straight')),
    outgoingMain:fill(a.outgoing,m?.outgoingMain,()=> 'straight'),
    incomingAux:{
      left:fill(incomingPockets.left.lanes,m?.incomingAux?.left,()=> 'left'),
      right:fill(incomingPockets.right.lanes,m?.incomingAux?.right,()=> 'right')
    },
    outgoingAux:{
      left:fill(outgoingPockets.left.lanes,m?.outgoingAux?.left,()=> 'merge'),
      right:fill(outgoingPockets.right.lanes,m?.outgoingAux?.right,()=> 'merge')
    }
  };
}

export function laneArrowFor(a:Arm,dir:Direction,role:LaneRole,index:number):LaneArrowCode{
  const m=markingsFor(a);
  if(role==='main')return (dir==='incoming'?m.incomingMain:m.outgoingMain)[index]??'none';
  const side=role==='aux-left'?'left':'right';
  return (dir==='incoming'?m.incomingAux:m.outgoingAux)[side][index]??(dir==='outgoing'?'merge':side);
}

export function withLaneArrow(a:Arm,dir:Direction,role:LaneRole,index:number,code:LaneArrowCode):LaneMarkings{
  const m=markingsFor(a);
  if(role==='main'){
    const key=dir==='incoming'?'incomingMain':'outgoingMain';
    return {...m,[key]:m[key].map((v,i)=>i===index?code:v)};
  }
  const side=role==='aux-left'?'left':'right',key=dir==='incoming'?'incomingAux':'outgoingAux';
  return {...m,[key]:{...m[key],[side]:m[key][side].map((v,i)=>i===index?code:v)}};
}

function validArrowOverrides(v:LaneArrowOverrides|undefined){
  if(v===undefined)return true;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>32)return false;
  return Object.entries(v).every(([key,list])=>
    /^(incoming|outgoing):(main|aux-left|aux-right):[0-7]$/.test(key)
    &&Array.isArray(list)&&list.length<=8
    &&new Set(list.map(p=>p.id)).size===list.length
    &&list.every(p=>!!p&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=40&&typeof p.code==='string'&&Object.hasOwn(options,p.code)&&Number.isFinite(p.offset)&&p.offset>=0&&p.offset<=400)
  );
}
function validMarkings(v:LaneMarkings|undefined){
  if(v===undefined)return true;
  const arr=(x:unknown)=>Array.isArray(x)&&x.length<=8&&x.every(c=>typeof c==='string'&&Object.hasOwn(options,c));
  return !!v&&arr(v.incomingMain)&&arr(v.outgoingMain)&&arr(v.incomingAux?.left)&&arr(v.incomingAux?.right)&&arr(v.outgoingAux?.left)&&arr(v.outgoingAux?.right);
}

export const initial=():Design=>{
  const arms:Arm[]=names.map((name,i)=>({
    dividerMode:"solid",
    solidLength:30,
    angle:i*90,
    length:92,
    bands:[],
    stopOffset:2,
    slipCrossing:false,
    slipCrossOffset:10,
    medianOffset:9,
    crossOffset:4,
    slipWidth:4,
    slipRadius:32,
    slip:false,
    name,
    incoming:2,
    outgoing:2,
    width:3.25,
    median:2,
    crossing:true,
    signal:true,
    stop:true,
    walk:2,
    arrows:['sr','sl','straight','straight']
  }));
  arms.forEach(a=>a.laneMarkings=markingsFor(a));
  return {
    schemaVersion:5,
    trees:false,lights:false,objectSpacing:15,objectOffset:.5,objectStart:10,stagger:false,
    showNames:true,showScale:true,showArrows:true,
    enabled:[true,true,true,true],
    corner:10,circulation:7,type:'junction',title:'แบบทางแยกแนวคิด',
    rotation:0,radius:15,ring:2,arms
  };
};

export function roundaboutDesign(d:Design,singleLane=false):Design{
  const arms=d.arms.map(a=>{
    const base:Arm={
      ...a,
      ...(singleLane?{
        incoming:1,
        outgoing:1,
        incomingSection:{...sectionFor(a,'incoming'),width:3.5},
        outgoingSection:{...sectionFor(a,'outgoing'),width:3.5},
        incomingPockets:undefined,
        outgoingPockets:undefined,
        median:2
      }:{median:Math.max(2,a.median)}),
      medianOffset:0,
      crossOffset:6,
      signal:false,
      stop:true,
      slip:false,
      slipCrossing:false,
      slipApproachMode:undefined,
      slipReceivingMode:undefined,
      slipApproachSeparator:undefined,
      slipReceivingSeparator:undefined,
      slipAccelerationWidth:undefined,
      slipAccelerationLength:undefined,
      slipAccelerationMerge:undefined,
      slipAccelerationSeparator:undefined,
      arrows:['straight','straight','straight','straight'],
      laneMarkings:undefined,
      arrowOverrides:undefined
    };
    return {...base,laneMarkings:markingsFor(base)};
  });
  return {...d,type:'roundabout',...(singleLane?{ring:1,circulation:5.5,radius:15}:{}),arms};
}

export function valid(d:unknown):d is Design{
  if(!d||typeof d!=='object')return false;
  const v=d as Design;
  return v.schemaVersion===5
    &&(v.roundabout===undefined||Object.entries({apron:[0,4],entryRadius:[6,35],exitRadius:[8,45],splitterLength:[12,40],splitterWidth:[1,6],yieldOffset:[.3,3]}).every(([k,[lo,hi]])=>{
      const n=v.roundabout![k as keyof RoundaboutSettings];
      return Number.isFinite(n)&&n>=lo&&n<=hi;
    }))
    &&['trees','lights','stagger'].every(k=>typeof v[k as keyof Design]==='boolean')
    &&Number.isFinite(v.objectSpacing)&&v.objectSpacing>=5&&v.objectSpacing<=50
    &&Number.isFinite(v.objectOffset)&&v.objectOffset>=0&&v.objectOffset<=5
    &&Number.isFinite(v.objectStart)&&v.objectStart>=0&&v.objectStart<=80
    &&['showNames','showScale','showArrows'].every(k=>typeof v[k as keyof Design]==='boolean')
    &&['junction','roundabout'].includes(v.type)
    &&typeof v.title==='string'&&v.title.length<=100
    &&Number.isFinite(v.rotation)&&v.rotation>=0&&v.rotation<=360
    &&Number.isFinite(v.radius)&&v.radius>=10&&v.radius<=30
    &&[1,2,3].includes(v.ring)
    &&Array.isArray(v.arms)&&v.arms.length===4
    &&Array.isArray(v.enabled)&&v.enabled.length===4&&v.enabled.every(x=>typeof x==='boolean')&&v.enabled.filter(Boolean).length>=3
    &&Number.isFinite(v.corner)&&v.corner>=4&&v.corner<=20
    &&Number.isFinite(v.circulation)&&v.circulation>=3&&v.circulation<=22
    &&(v.display===undefined||Object.entries(v.display).every(([k,x])=>['grid','trees','lights','dimensions','reviews','handles'].includes(k)&&typeof x==='boolean'))
    &&v.arms.every(a=>
      (a.residualTarget===undefined||(Number.isFinite(a.residualTarget)&&a.residualTarget>=0&&a.residualTarget<=8))
      &&(a.medianTrees===undefined||(typeof a.medianTrees.enabled==='boolean'&&Object.entries({start:[0,200],spacing:[3,50],height:[2,15],crown:[.5,8],offset:[-3,3]}).every(([k,[lo,hi]])=>{
        const n=a.medianTrees![k as keyof MedianTrees];
        return typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
      })))
      &&(a.medianOpenings===undefined||(Array.isArray(a.medianOpenings)&&a.medianOpenings.length<=8&&a.medianOpenings.every(o=>typeof o.id==='string'&&(o.type===undefined||['opening','uturn'].includes(o.type))&&Number.isFinite(o.start)&&o.start>=0&&Number.isFinite(o.length)&&o.length>=2&&o.length<=40&&o.start+o.length<a.length)))
      &&(a.corridorMode===undefined||['preserve','widen'].includes(a.corridorMode))
      &&(a.incomingSection===undefined||validSection(a.incomingSection))
      &&(a.outgoingSection===undefined||validSection(a.outgoingSection))
      &&(a.incomingPockets===undefined||validPockets(a.incomingPockets))
      &&(a.outgoingPockets===undefined||validPockets(a.outgoingPockets))
      &&validMarkings(a.laneMarkings)
      &&validArrowOverrides(a.arrowOverrides)
      &&(a.outgoingDividerMode===undefined||["solid","dashed"].includes(a.outgoingDividerMode))
      &&(a.outgoingSolidLength===undefined||(Number.isFinite(a.outgoingSolidLength)&&a.outgoingSolidLength>=1&&a.outgoingSolidLength<=140))
      &&(a.dividerMode===undefined||["solid","dashed"].includes(a.dividerMode))
      &&(a.solidLength===undefined||(Number.isFinite(a.solidLength)&&a.solidLength>=1&&a.solidLength<=140))
      &&(a.roadside===undefined||(validRoadside(a.roadside.incoming)&&validRoadside(a.roadside.outgoing)))
      &&Number.isFinite(a.angle)&&a.angle>=0&&a.angle<360
      &&Number.isFinite(a.length)&&a.length>=45&&a.length<=400
      &&Array.isArray(a.bands)&&a.bands.length<=6&&a.bands.every(b=>typeof b.id==='string'&&['shoulder','bike','motorcycle','buffer'].includes(b.type)&&Number.isFinite(b.width)&&b.width>=.25&&b.width<=4.5)
      &&Number.isFinite(a.stopOffset)&&a.stopOffset>=0&&a.stopOffset<=35
      &&typeof a.slipCrossing==='boolean'
      &&Number.isFinite(a.slipCrossOffset)&&a.slipCrossOffset>=2&&a.slipCrossOffset<=MAX_SLIP_CROSS_OFFSET
      &&(a.slipArrowOffset===undefined||(Number.isFinite(a.slipArrowOffset)&&a.slipArrowOffset>=2&&a.slipArrowOffset<=MAX_SLIP_CROSS_OFFSET))
      &&(a.slipApproachMode===undefined||['direct','added','channelized'].includes(a.slipApproachMode))
      &&(a.slipReceivingMode===undefined||['direct','added','channelized'].includes(a.slipReceivingMode))
      &&(a.slipApproachSeparator===undefined||(Number.isFinite(a.slipApproachSeparator)&&a.slipApproachSeparator>=.5&&a.slipApproachSeparator<=4))
      &&(a.slipReceivingSeparator===undefined||(Number.isFinite(a.slipReceivingSeparator)&&a.slipReceivingSeparator>=.5&&a.slipReceivingSeparator<=4))
      &&(a.slipAccelerationWidth===undefined||(Number.isFinite(a.slipAccelerationWidth)&&a.slipAccelerationWidth>=2.5&&a.slipAccelerationWidth<=6))
      &&(a.slipAccelerationLength===undefined||(Number.isFinite(a.slipAccelerationLength)&&a.slipAccelerationLength>=5&&a.slipAccelerationLength<=200))
      &&(a.slipAccelerationMerge===undefined||(Number.isFinite(a.slipAccelerationMerge)&&a.slipAccelerationMerge>=5&&a.slipAccelerationMerge<=120))
      &&(a.slipAccelerationSeparator===undefined||['chevron','raised'].includes(a.slipAccelerationSeparator))
      &&Number.isFinite(a.medianOffset)&&a.medianOffset>=0&&a.medianOffset<=35
      &&Number.isFinite(a.crossOffset)&&a.crossOffset>=0&&a.crossOffset<=35
      &&Number.isFinite(a.slipWidth)&&a.slipWidth>=3&&a.slipWidth<=6
      &&Number.isFinite(a.slipRadius)&&a.slipRadius>=10&&a.slipRadius<=60
      &&typeof a.slip==='boolean'
      &&typeof a.name==='string'&&a.name.length<=40
      &&[0,1,2,3,4].includes(a.incoming)
      &&[0,1,2,3,4].includes(a.outgoing)
      &&a.incoming+a.outgoing>0
      &&a.width>=2.5&&a.width<=4.5&&Number.isFinite(a.width)
      &&a.median>=0&&a.median<=12&&Number.isFinite(a.median)
      &&a.walk>=0&&a.walk<=8&&Number.isFinite(a.walk)
      &&['crossing','signal','stop'].every(k=>typeof a[k as keyof Arm]==='boolean')
      &&Array.isArray(a.arrows)&&a.arrows.length===4&&a.arrows.every(c=>typeof c==='string'&&Object.hasOwn(options,c))
    );
}

function preserveSchema4Allocation(a:Arm){
  const convert=(p:Pockets|undefined)=>{
    if(!p)return p;
    const right={...p.right};
    if(right.lanes){
      const mode=right.allocation??(a.corridorMode==='preserve'?'legacy-preserve':a.corridorMode==='widen'?'widen':'auto');
      // Schema 4 Auto silently retained 1.50 m (or residualTarget) and "median" retained 0.20 m.
      // Preserve that visual result only when importing old files; new Auto has no hidden retained width.
      if(mode==='auto'){right.allocation='retain';right.retainedMedian=a.residualTarget??1.5;}
      else if(mode==='median'){right.allocation='retain';right.retainedMedian=.2;}
    }
    return {left:{...p.left},right};
  };
  return {...a,incomingPockets:convert(a.incomingPockets),outgoingPockets:convert(a.outgoingPockets)};
}

type LegacyDesignInput=Partial<Design>&{type:string;arms:Partial<Arm>[];schemaVersion?:number;omitted?:number};
export function migrate(raw:unknown):Design{
  if(!raw||typeof raw!=='object')throw Error('Invalid design');
  const candidate=raw as Partial<LegacyDesignInput>;
  if((candidate.schemaVersion??0)>5)throw Error('Unsupported future schema');
  if(typeof candidate.type!=='string'||!Array.isArray(candidate.arms))throw Error('Invalid design');
  const source=candidate as LegacyDesignInput,version=source.schemaVersion??0,defaults=initial(),r=source.type.startsWith('round');
  const arms=source.arms.map((input,i)=>{
    const fallback=defaults.arms[i]??defaults.arms[0];
    let a:Arm={
      ...fallback,
      ...input,
      ...(version>=4?{}:{corridorMode:input.corridorMode??(version===3?'preserve':'widen')}),
      angle:input.angle??i*90,
      length:input.length??92,
      bands:input.bands??[],
      medianOffset:input.medianOffset??(r?0:9),
      crossOffset:input.crossOffset??(r?14:4)
    };
    if(version===4)a=preserveSchema4Allocation(a);
    // Schema-5 files round-trip byte-for-structure: derived defaults are filled at read/use time.
    // Older schemas receive an explicit marking model during migration.
    if(version!==5||input.laneMarkings===undefined)a={...a,laneMarkings:markingsFor(a)};
    return a;
  });
  const d:Design={
    ...defaults,
    ...source,
    schemaVersion:5,
    type:r?'roundabout':'junction',
    enabled:source.enabled??[0,1,2,3].map(i=>!['three','round3'].includes(source.type)||i!==(source.omitted??3)),
    circulation:source.circulation??(source.ring??defaults.ring)*3.5,
    arms
  };
  if(!valid(d))throw Error('Invalid design');
  return d;
}
