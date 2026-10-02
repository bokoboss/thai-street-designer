import {designError} from '../app/junction/design-validation';
import {pocketsFor} from '../app/junction/model';
import {designReviews} from '../app/junction/reviews';
import {junctionAuxiliaryHandoffIssues} from './junction-auxiliary-proposal';
import {compareNetworkProjects,type ScenarioComparison} from './network-scenario-comparison';
import {activeArmIds,linkIssues,linkLength,parallelCorridorForLink,portKey,type NetworkProject} from './network-project';

export type DesignReportFindingLevel='error'|'warning'|'note';
export type DesignReportFinding={
  level:DesignReportFindingLevel;
  objectKind:'junction'|'roadlink';
  objectId:string;
  objectName:string;
  category:string;
  message:string;
};
export type NetworkDesignMetrics={
  junctions:number;roadLinks:number;parallelCorridors:number;frontageChains:number;seedReviewPoints:number;enabledArms:number;roundabouts:number;slips:number;
  mainLanes:number;pocketLanes:number;receivingLanes:number;medianArms:number;
  signalArms:number;crossingArms:number;stopArms:number;stationComponents:number;
  roadLength:number;
};
export type JunctionReportRow={
  id:string;name:string;type:string;enabledArms:number;mainLanes:number;pocketLanes:number;
  receivingLanes:number;slips:number;signals:number;crossings:number;stops:number;findings:number;
};
export type RoadLinkReportRow={
  id:string;name:string;from:string;to:string;length:number;sectionMode:'review'|'linear';
  stationComponents:number;parallelRole:string;findings:number;
};
export type NetworkDesignReport={
  projectTitle:string;scenarioName:string;metrics:NetworkDesignMetrics;
  findings:DesignReportFinding[];counts:{error:number;warning:number;note:number;total:number};
  junctions:JunctionReportRow[];roadLinks:RoadLinkReportRow[];
  comparison?:{referenceName:string;comparison:ScenarioComparison};
};

const rounded=(value:number,decimals=1)=>{const factor=10**decimals;return Math.round(value*factor)/factor;};
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const findingRank:Record<DesignReportFindingLevel,number>={error:0,warning:1,note:2};

export function networkDesignMetrics(project:NetworkProject):NetworkDesignMetrics{
  let enabledArms=0,roundabouts=0,slips=0,mainLanes=0,pocketLanes=0,receivingLanes=0,medianArms=0,signalArms=0,crossingArms=0,stopArms=0;
  for(const junction of project.junctions){
    if(junction.design.type==='roundabout')roundabouts++;
    slips+=junction.design.slips.length;
    for(const armId of activeArmIds(junction)){
      enabledArms++;const arm=junction.design.arms[armId],incoming=pocketsFor(arm,'incoming'),outgoing=pocketsFor(arm,'outgoing');
      mainLanes+=arm.incoming+arm.outgoing;pocketLanes+=incoming.left.lanes+incoming.right.lanes;receivingLanes+=outgoing.left.lanes+outgoing.right.lanes;
      if(arm.median>0)medianArms++;if(arm.signal)signalArms++;if(arm.crossing)crossingArms++;if(arm.stop)stopArms++;
    }
  }
  return{
    junctions:project.junctions.length,roadLinks:project.links.length,parallelCorridors:project.parallelCorridors.length,frontageChains:project.parallelCorridors.reduce((sum,corridor)=>sum+corridor.frontage.length,0),seedReviewPoints:project.parallelCorridors.reduce((sum,corridor)=>sum+corridor.frontage.reduce((inner,chain)=>inner+(chain.seedReviewJunctionIds?.length??0),0),0),enabledArms,roundabouts,slips,mainLanes,pocketLanes,receivingLanes,medianArms,
    signalArms,crossingArms,stopArms,stationComponents:project.links.reduce((sum,link)=>sum+link.components.length,0),
    roadLength:rounded(project.links.reduce((sum,link)=>sum+linkLength(project,link),0),1)
  };
}
export function buildNetworkDesignReport(project:NetworkProject,scenarioName:string,reference?:{name:string;project:NetworkProject}):NetworkDesignReport{
  const findings:DesignReportFinding[]=[],junctions:JunctionReportRow[]=[],roadLinks:RoadLinkReportRow[]=[],seedReviewByJunction=new Map<string,{corridorId:string;side:string}[]>();
  for(const corridor of project.parallelCorridors)for(const chain of corridor.frontage)for(const junctionId of chain.seedReviewJunctionIds??[]){
    const rows=seedReviewByJunction.get(junctionId)??[];rows.push({corridorId:corridor.id,side:chain.side});seedReviewByJunction.set(junctionId,rows);
  }
  for(const junction of project.junctions){
    const ids=activeArmIds(junction),arms=ids.map(id=>junction.design.arms[id]);
    const invalid=designError(junction.design);
    if(invalid)findings.push({level:'error',objectKind:'junction',objectId:junction.id,objectName:junction.name,category:'geometry',message:invalid});
    else for(const review of designReviews(junction.design))findings.push({
      level:review.level==='geometry'?'error':review.level==='engineering'?'warning':'note',
      objectKind:'junction',objectId:junction.id,objectName:junction.name,category:review.level,message:review.message
    });
    for(const review of seedReviewByJunction.get(junction.id)??[])findings.push({
      level:'warning',objectKind:'junction',objectId:junction.id,objectName:junction.name,category:'parallel-seed-review',
      message:`Assisted frontage seed review point · ${review.corridorId} / ${review.side}. ตรวจ cross-street connection, controls และ geometry ก่อนใช้แบบ`
    });
    junctions.push({
      id:junction.id,name:junction.name,type:junction.design.type,enabledArms:ids.length,
      mainLanes:arms.reduce((sum,arm)=>sum+arm.incoming+arm.outgoing,0),
      pocketLanes:arms.reduce((sum,arm)=>{const p=pocketsFor(arm,'incoming');return sum+p.left.lanes+p.right.lanes;},0),
      receivingLanes:arms.reduce((sum,arm)=>{const p=pocketsFor(arm,'outgoing');return sum+p.left.lanes+p.right.lanes;},0),
      slips:junction.design.slips.length,signals:arms.filter(arm=>arm.signal).length,crossings:arms.filter(arm=>arm.crossing).length,stops:arms.filter(arm=>arm.stop).length,findings:0
    });
  }
  for(const link of project.links){
    const issues=linkIssues(project,link);
    for(const issue of issues)findings.push({
      level:['missing-port','alignment','port-facing'].includes(issue.kind)?'error':'warning',
      objectKind:'roadlink',objectId:link.id,objectName:link.name,category:issue.kind,message:issue.message
    });
    for(const issue of junctionAuxiliaryHandoffIssues(project,link))findings.push({
      level:issue.level,objectKind:'roadlink',objectId:link.id,objectName:link.name,category:'handoff-'+issue.kind,message:issue.message
    });
    const membership=parallelCorridorForLink(project,link.id),parallelRole=membership?membership.role==='mainline'?('Mainline · '+membership.corridor.id):('Frontage '+membership.side+' · '+membership.corridor.id):'—';
    roadLinks.push({id:link.id,name:link.name,from:portKey(link.from),to:portKey(link.to),length:rounded(linkLength(project,link),1),sectionMode:link.sectionProfile.mode,stationComponents:link.components.length,parallelRole,findings:0});
  }
  findings.sort((a,b)=>findingRank[a.level]-findingRank[b.level]||a.objectKind.localeCompare(b.objectKind)||a.objectId.localeCompare(b.objectId)||a.message.localeCompare(b.message));
  for(const row of junctions)row.findings=findings.filter(item=>item.objectKind==='junction'&&item.objectId===row.id).length;
  for(const row of roadLinks)row.findings=findings.filter(item=>item.objectKind==='roadlink'&&item.objectId===row.id).length;
  const counts={error:findings.filter(v=>v.level==='error').length,warning:findings.filter(v=>v.level==='warning').length,note:findings.filter(v=>v.level==='note').length,total:findings.length};
  const report:NetworkDesignReport={projectTitle:project.title,scenarioName,metrics:networkDesignMetrics(project),findings,counts,junctions,roadLinks};
  if(reference)report.comparison={referenceName:reference.name,comparison:compareNetworkProjects(reference.project,project)};
  return report;
}
function metricCard(label:string,value:string){
  return `<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}
export function networkDesignReportHtml(report:NetworkDesignReport){
  const m=report.metrics,rows=report.findings.map(item=>`<tr class="${item.level}"><td>${escapeHtml(item.level.toUpperCase())}</td><td>${escapeHtml(item.objectKind==='junction'?'Junction':'RoadLink')} ${escapeHtml(item.objectId)} · ${escapeHtml(item.objectName)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.message)}</td></tr>`).join(''),
    junctionRows=report.junctions.map(row=>`<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.type)}</td><td>${row.enabledArms}</td><td>${row.mainLanes}</td><td>${row.pocketLanes}</td><td>${row.receivingLanes}</td><td>${row.slips}</td><td>${row.signals}/${row.crossings}/${row.stops}</td><td>${row.findings}</td></tr>`).join(''),
    linkRows=report.roadLinks.map(row=>`<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.from)} → ${escapeHtml(row.to)}</td><td>${row.length.toFixed(1)} m</td><td>${escapeHtml(row.sectionMode)}</td><td>${row.stationComponents}</td><td>${escapeHtml(row.parallelRole)}</td><td>${row.findings}</td></tr>`).join(''),
    comparison=report.comparison,comparisonHtml=comparison?`<section><h2>Scenario Delta</h2><p class="muted">Active − Reference · ${escapeHtml(comparison.referenceName)} → ${escapeHtml(report.scenarioName)}</p><div class="metrics">${comparison.comparison.metrics.map(metric=>metricCard(metric.label,`${metric.reference}${metric.unit?' '+metric.unit:''} → ${metric.active}${metric.unit?' '+metric.unit:''} (Δ ${metric.delta>0?'+':''}${metric.delta}${metric.unit?' '+metric.unit:''})`)).join('')}</div><p><b>${comparison.comparison.counts.added}</b> added · <b>${comparison.comparison.counts.removed}</b> removed · <b>${comparison.comparison.counts.changed}</b> changed engineering objects.</p></section>`:'';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.projectTitle)} · Design Summary</title><style>
  body{font:14px/1.55 Arial,"Noto Sans Thai",sans-serif;color:#263b44;max-width:1180px;margin:0 auto;padding:36px;background:#fff}h1{margin:0;font-size:26px}h2{font-size:17px;margin:28px 0 10px;border-bottom:1px solid #ccd9d7;padding-bottom:6px}p{margin:5px 0}.muted{color:#687b7f}.badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef6f4;color:#176f69;font-weight:700;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}.metric{padding:9px;border:1px solid #d7e2e0;border-radius:7px}.metric span{display:block;font-size:11px;color:#687b7f}.metric b{font-size:15px}table{width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:12px}th,td{border:1px solid #dbe3e2;padding:6px 7px;text-align:left;vertical-align:top}th{background:#f4f8f7}.error td:first-child{color:#a33b3b;font-weight:700}.warning td:first-child{color:#9a681f;font-weight:700}.note td:first-child{color:#526d7d;font-weight:700}.scope{margin-top:28px;padding:12px;border:1px solid #ead6ae;background:#fff9ec;border-radius:7px}.footer{margin-top:28px;color:#738286;font-size:11px}@media print{body{max-width:none;padding:18mm}.metrics{grid-template-columns:repeat(4,1fr)}.scope{break-inside:avoid}section{break-inside:auto}tr{break-inside:avoid}}
  </style></head><body><header><span class="badge">THAI STREET DESIGNER · CONCEPT DESIGN</span><h1>${escapeHtml(report.projectTitle)}</h1><p>Scenario: <b>${escapeHtml(report.scenarioName)}</b></p><p class="muted">Design summary generated from persisted engineering state. No traffic capacity, LOS, demand forecasting or simulation is included.</p></header>
  <section><h2>Engineering Summary</h2><div class="metrics">${[
    metricCard('Junctions',String(m.junctions)),metricCard('RoadLinks',String(m.roadLinks)),metricCard('Parallel corridors',String(m.parallelCorridors)),metricCard('Frontage chains',String(m.frontageChains)),metricCard('Seed review points',String(m.seedReviewPoints)),metricCard('RoadLink length',m.roadLength.toFixed(1)+' m'),metricCard('Enabled arms',String(m.enabledArms)),
    metricCard('Main lanes',String(m.mainLanes)),metricCard('Pocket lanes',String(m.pocketLanes)),metricCard('Receiving lanes',String(m.receivingLanes)),metricCard('Station components',String(m.stationComponents)),
    metricCard('Roundabouts',String(m.roundabouts)),metricCard('Slip lanes',String(m.slips)),metricCard('Signal / Crossing / Stop',`${m.signalArms} / ${m.crossingArms} / ${m.stopArms}`),metricCard('Review findings',`${report.counts.error} error · ${report.counts.warning} warning · ${report.counts.note} note`)
  ].join('')}</div></section>
  <section><h2>Junction Register</h2><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Arms</th><th>Main lanes</th><th>Pocket</th><th>Receiving</th><th>Slip</th><th>Signal/Cross/Stop</th><th>Findings</th></tr></thead><tbody>${junctionRows||'<tr><td colspan="10">No Junction</td></tr>'}</tbody></table></section>
  <section><h2>RoadLink Register</h2><table><thead><tr><th>ID</th><th>Name</th><th>Endpoints</th><th>Length</th><th>Section mode</th><th>Components</th><th>Parallel role</th><th>Findings</th></tr></thead><tbody>${linkRows||'<tr><td colspan="8">No RoadLink</td></tr>'}</tbody></table></section>
  <section><h2>Engineering Review Findings</h2><p class="muted">Findings reuse the same Junction review, RoadLink continuity and handoff-integrity logic used by the editor.</p><table><thead><tr><th>Level</th><th>Object</th><th>Category</th><th>Finding</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No current review findings.</td></tr>'}</tbody></table></section>
  ${comparisonHtml}<div class="scope"><b>Scope limitation</b><p>This document is a concept-design summary. Dimensions and geometry must be verified against survey/control data and applicable project standards before detailed engineering or construction use.</p></div><div class="footer">Thai Street Designer · Network schema v4 · Junction Design schema v6 · Thailand left-hand traffic</div></body></html>`;
}
