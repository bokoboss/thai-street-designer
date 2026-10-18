// Guards user-facing copy (docs/spec/UX_ARCHITECTURE.md, "Copy rules").
// Scans JSX text and prose-like string literals in app/**/*.tsx for developer
// jargon, milestone numbers and schema references that must not reach the UI.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');

const BANNED=[
  [/\bPhase\s*\d/i,'phase number'],
  [/\b\d[A-Z]\.\d\b/,'milestone id (e.g. 8A.2)'],
  [/\bPost-v1\b/i,'release milestone'],
  [/\bschema\b/i,'schema reference'],
  [/\bDesign v\d/i,'schema version'],
  [/provenance/i,'provenance'],
  [/\bruntime\b/i,'runtime'],
  [/\bresolver\b/i,'resolver'],
  [/\bResolved\b/,'resolved (implementation term)'],
  [/\bsemantic/i,'semantic'],
  [/\blifecycles?\b/i,'lifecycle'],
  [/normaliz/i,'normalize'],
  [/\bpersist/i,'persist'],
  [/one-shot/i,'one-shot'],
  [/\binstance\b/i,'instance'],
  [/guardrail/i,'guardrail'],
  [/\btransaction\b/i,'transaction'],
  [/\bmetadata\b/i,'metadata'],
  [/engineering state/i,'engineering state'],
];

function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?files(p):/\.tsx?$/.test(p)?[p]:[];
  });
}
const looksLikeCode=s=>/=>|;|&&|\|\||\[data-|^\s*[\w.$-]+\s*$|https?:\/\/|\bfunction\b|\b(const|let|return)\s|\w\(|\w={1,3}[\w'"({]|\n\s*[\w.]+[,:]/.test(s)||!/[A-Za-z฀-๿]{3}/.test(s.replace(/\b\w+\b(?=\s*[,:)])/g,''));
function candidates(source){
  const out=[];
  // JSX text, including text that sits next to {expressions}
  for(const m of source.matchAll(/(?<=[>}])([^<>{}]*[A-Za-z฀-๿][^<>{}]*)(?=[<{])/g))out.push([m.index,m[1]]);
  for(const m of source.matchAll(/(['`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g)){
    const s=m[2];
    if(/[฀-๿]/.test(s)||/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s))out.push([m.index,s]);
  }
  return out.filter(([,s])=>s.trim()&&!looksLikeCode(s));
}

const violations=[];
// UI components and engine messages that the UI displays (reviews, proposals, errors).
for(const file of [...files('app'),...files('core')]){
  const source=fs.readFileSync(file,'utf8');
  for(const [index,text] of candidates(source)){
    for(const [pattern,label] of BANNED){
      if(pattern.test(text)){
        const line=source.slice(0,index).split('\n').length;
        violations.push(`${file}:${line} [${label}] ${text.trim().slice(0,120)}`);
      }
    }
  }
}
assert.equal(violations.length,0,'Developer-facing text in UI:\n'+violations.join('\n'));

// Lane-count status shown in the road Inspector must reflect actual lane counts.
require('./test-support/build.cjs')();
const {laneCountStatus,laneCountStatusLabel}=require(path.resolve('.test-build/link-lane-status.cjs'));
assert.equal(laneCountStatus('review',false,false),'matched','equal lane counts must not be reported as a mismatch');
assert.equal(laneCountStatus('review',true,false),'mismatch');
assert.equal(laneCountStatus('linear',true,true),'continuous');
assert.equal(laneCountStatus('linear',true,false),'needs-side');
for(const status of ['matched','mismatch','continuous','needs-side'])assert(laneCountStatusLabel[status],'missing label for '+status);

console.log('PASS UI copy guard: no developer jargon in user-facing strings; lane-count status reflects actual counts');
