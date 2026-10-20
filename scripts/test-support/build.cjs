// Transpiles core/, app/ and lib/ TypeScript into .test-build/tree/ (CommonJS),
// rewriting relative and "@/" imports, then writes flat shims in .test-build/
// so regression scripts can require('.test-build/<name>.cjs').
const fs=require('fs'),path=require('path'),ts=require('typescript');

const ROOT=path.resolve(__dirname,'../..');
const OUT=path.join(ROOT,'.test-build');
const TREE=path.join(OUT,'tree');
const SOURCE_DIRS=['core','app','lib'];

// Flat aliases kept for the existing regression scripts.
const FLAT={
  'network-alignment':'core/common/alignment.ts',
  'network-geometry':'core/free-draw/geometry.ts',
  'network-network':'core/free-draw/network.ts',
};
const FLAT_DIRS=['core/junction','core/network','core/common','app/junction','lib'];

function walk(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?walk(p):/\.tsx?$/.test(e.name)&&!e.name.endsWith('.d.ts')?[p]:[];
  });
}
function resolveSource(fromFile,spec){
  let base;
  if(spec.startsWith('@/'))base=path.join(ROOT,spec.slice(2));
  else if(spec.startsWith('.'))base=path.resolve(path.dirname(fromFile),spec);
  else return null;
  for(const ext of ['','.ts','.tsx','/index.ts'])if(fs.existsSync(base+ext)&&fs.statSync(base+ext).isFile()&&/\.tsx?$/.test(base+ext))return base+ext;
  return null;
}
const treePath=src=>path.join(TREE,path.relative(ROOT,src)).replace(/\.tsx?$/,'.cjs');

let built=false;
module.exports=function build(){
  if(built)return OUT;built=true;
  fs.rmSync(TREE,{recursive:true,force:true});
  const sources=SOURCE_DIRS.flatMap(d=>walk(path.join(ROOT,d)));
  for(const src of sources){
    const out=ts.transpileModule(fs.readFileSync(src,'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm,'// (stylesheet import removed for Node tests)'),{fileName:src,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
      .replace(/require\("([^"]+)"\)/g,(m,spec)=>{
        const target=resolveSource(src,spec);if(!target)return m;
        let rel=path.relative(path.dirname(treePath(src)),treePath(target)).split(path.sep).join('/');
        if(!rel.startsWith('.'))rel='./'+rel;
        return `require("${rel}")`;
      });
    const dest=treePath(src);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,out);
  }
  const shim=(name,src)=>fs.writeFileSync(path.join(OUT,name+'.cjs'),`module.exports=require(${JSON.stringify('./'+path.relative(OUT,treePath(path.join(ROOT,src))).split(path.sep).join('/'))});\n`);
  for(const dir of FLAT_DIRS)for(const src of walk(path.join(ROOT,dir))){
    const name=path.basename(src).replace(/\.tsx?$/,'');
    if(!FLAT[name])shim(name,path.relative(ROOT,src));
  }
  for(const [name,src] of Object.entries(FLAT))shim(name,src);
  return OUT;
};
