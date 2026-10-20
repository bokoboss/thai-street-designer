// Regression: opening Junction detail from an Alternative must not drop scenarios or write into Existing.
// Found in the Phase 0B baseline (T4) on main cc4994c.
const path=require('path'),assert=require('node:assert/strict');
require('./test-support/build.cjs')();
const T=p=>require(path.resolve('.test-build/tree/'+p));
const ns=T('core/network/network-scenarios.cjs'),n=T('core/network/network-project.cjs'),sl=T('core/junction/slip-model.cjs');
const fs=require('fs');

// Workspace with Existing + Alt A, Alt A active, as the Network page stores it.
const alt=ns.duplicateNetworkScenario(ns.createNetworkScenarioWorkspace());assert.equal(alt.error,null);
const stored=JSON.stringify(alt.workspace);

const ctx=ns.junctionEditContext(stored,'J-1');
assert(ctx,'junction found in the active scenario');assert.equal(ctx.scenario.name,'Alt A');
const design=sl.addSlip(ctx.junction.design,1);assert.equal(design.slips.length,1);
const saved=ns.replaceActiveNetworkProject(ctx.workspace,n.updateJunctionDesign(ctx.project,'J-1',design));
const back=ns.restoreNetworkScenarioWorkspace(JSON.stringify(saved));
assert.equal(back.scenarios.length,2,'both scenarios kept');assert.equal(back.activeScenarioId,alt.workspace.activeScenarioId,'Alternative stays active');
const byName=name=>back.scenarios.find(s=>s.name===name).project.junctions.find(j=>j.id==='J-1').design.slips.length;
assert.equal(byName('Alt A'),1,'edit lands in the Alternative');assert.equal(byName('Existing'),0,'Existing is unchanged');

// Older storage that holds a single project still opens; unreadable storage is not overwritten.
assert(ns.junctionEditContext(JSON.stringify(n.createNetworkProject()),'J-1'),'single-project storage still readable');
assert.equal(ns.junctionEditContext('{broken','J-1'),null);assert.equal(ns.junctionEditContext(stored,'J-404'),null);

// The pages use the workspace path (no single-project write into the shared storage key).
const junction=fs.readFileSync('app/junction/page.tsx','utf8');
assert(junction.includes('junctionEditContext(')&&!junction.includes('restoreNetworkProject(localStorage.getItem(NETWORK_PROJECT_STORAGE))'),'Junction detail reads and writes through the workspace');

console.log('PASS junction detail hand-off keeps every scenario and edits only the active one');
