// Object identity for roads (independent review 2026-10-20): ids are never reused, so a road deleted and a new road
// drawn later are different objects in every scenario and in the scenario comparison. Names stay short and readable.
import type {Road} from './derive';

const ALPHABET='0123456789abcdefghijklmnopqrstuvwxyz';
function randomPart(length=8){
  const bytes=new Uint8Array(length);
  if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);else for(let i=0;i<length;i++)bytes[i]=Math.floor(Math.random()*256);
  return Array.from(bytes,b=>ALPHABET[b%36]).join('');
}
/** A road id not used by any of the given roads (pass every scenario's roads). */
export function newRoadId(roads:Road[]):string{
  const used=new Set(roads.map(r=>r.id));
  let id=`R-${randomPart()}`;while(used.has(id))id=`R-${randomPart()}`;
  return id;
}
/** "ถนน n" with the first n not used by a road name in this scenario. */
export function nextRoadName(roads:Road[]):string{
  const names=new Set(roads.map(r=>r.name));let n=1;while(names.has(`ถนน ${n}`))n++;
  return `ถนน ${n}`;
}
