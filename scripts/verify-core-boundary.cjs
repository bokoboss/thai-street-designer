// core/ is the React-free engine: model, geometry, validation, migration and
// review logic. UI (app/, components/, lib/) may import core; core must not
// import UI code, frameworks or browser-only modules.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
const ROOT=path.resolve(__dirname,'..');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):p.endsWith('.ts')?[p]:[];});
const files=walk(path.join(ROOT,'core'));
assert(files.length>0,'core/ must contain the engine modules');
const violations=[];
for(const file of files){
  const rel=path.relative(ROOT,file),source=fs.readFileSync(file,'utf8');
  if(file.endsWith('.tsx'))violations.push(rel+': JSX in core');
  for(const {fileName:spec} of ts.preProcessFile(source,true,true).importedFiles){
    if(!spec.startsWith('.')){violations.push(`${rel}: imports package or alias "${spec}"`);continue;}
    const target=path.resolve(path.dirname(file),spec);
    if(!target.startsWith(path.join(ROOT,'core')+path.sep))violations.push(`${rel}: imports outside core "${spec}"`);
  }
}
assert.equal(violations.length,0,'core/ boundary violations:\n'+violations.join('\n'));
console.log(`PASS core boundary: ${files.length} engine modules import only other core modules`);
