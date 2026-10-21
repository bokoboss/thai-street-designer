// Road section presets for Draw Road (roadmap Phase 3). Starting values only: once applied they are
// ordinary editable section values. These are tool defaults for concept sketches, not Thai standards.
import type {RoadSection} from './derive';

export type RoadPresetId='two-lane'|'four-divided'|'six-divided'|'local-street'|'access';
export type RoadPreset={id:RoadPresetId;label:string;section:RoadSection};

export const ROAD_PRESETS:readonly RoadPreset[]=[
  {id:'two-lane',label:'2 ช่องจราจร ไม่มีเกาะกลาง',section:{forwardLanes:1,backwardLanes:1,laneWidth:3.25,median:0,walk:2}},
  {id:'four-divided',label:'4 ช่องจราจร มีเกาะกลาง',section:{forwardLanes:2,backwardLanes:2,laneWidth:3.25,median:2,walk:2}},
  {id:'six-divided',label:'6 ช่องจราจร มีเกาะกลาง',section:{forwardLanes:3,backwardLanes:3,laneWidth:3.25,median:3,walk:2.5}},
  {id:'local-street',label:'ถนนในชุมชน 2 ช่องจราจร',section:{forwardLanes:1,backwardLanes:1,laneWidth:3,median:0,walk:2.5}},
];
export const DEFAULT_PRESET:RoadPresetId='four-divided';
/** Starting section of a project access (driveway): one lane each way, no median, no sidewalk of its own. Tool value. */
export const ACCESS_PRESET:RoadPreset={id:'access',label:'ทางเข้าโครงการ 2 ช่องจราจร',section:{forwardLanes:1,backwardLanes:1,laneWidth:3,median:0,walk:0}};

export const presetSection=(id:RoadPresetId):RoadSection=>structuredClone((id==='access'?ACCESS_PRESET:ROAD_PRESETS.find(p=>p.id===id)??ROAD_PRESETS[1]).section);
/** The preset a section still matches, if any (used to highlight the active preset). */
export function matchingPreset(s:RoadSection):RoadPresetId|null{
  const same=(a:RoadSection)=>a.forwardLanes===s.forwardLanes&&a.backwardLanes===s.backwardLanes&&a.laneWidth===s.laneWidth&&a.median===s.median&&a.walk===s.walk&&!(s.bands?.length);
  return ROAD_PRESETS.find(p=>same(p.section))?.id??null;
}
