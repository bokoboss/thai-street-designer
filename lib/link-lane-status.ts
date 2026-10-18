export type LaneCountStatus='matched'|'mismatch'|'continuous'|'needs-side';

/** Status shown for a road's lane counts between its two junction ends. */
export function laneCountStatus(mode:'review'|'linear',hasMismatch:boolean,linearPossible:boolean):LaneCountStatus{
  if(mode==='linear')return linearPossible?'continuous':'needs-side';
  return hasMismatch?'mismatch':'matched';
}

export const laneCountStatusLabel:Record<LaneCountStatus,string>={
  matched:'จำนวนช่องตรงกัน',
  mismatch:'จำนวนช่องไม่ตรงกัน',
  continuous:'เปลี่ยนต่อเนื่องตามระยะ',
  'needs-side':'ต้องกำหนดฝั่งที่เพิ่ม/ลดช่อง',
};
