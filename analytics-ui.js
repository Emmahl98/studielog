import {methodNames,resolveMaterials} from './method-catalog.js?v=21';
import {methodTag} from './method-tags.js?v=21';
import {displayDate,inputDate} from './dates.js?v=14';
import {ChartStore,chartData,selectedMethods} from './analytics.js?v=35';
import {goalColors} from './goal-colors.js?v=13';
import {materialList} from './materials.js';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2});
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
const minuteFmt=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0});
const minutes=hours=>minuteFmt.format(hours*60);
function duration(hours,{goal=false,short=false,range=''}={}){
 const value=node('span','chart-duration',goal?`${range}${minutes(hours)} min`:`${range}${fmt.format(hours)} ${short?'u':'uur'}`);
 if(goal)value.append(document.createTextNode(' '),node('small','chart-hours',`(${range}${fmt.format(hours)} u)`));
 return value;
}
function goalSummary(name,{target,average,days,status}){
 const summary=node('div','chart-goal-summary');
 const heading=node('div','chart-goal-heading');
 heading.append(node('strong','',name),node('span','chart-goal-status',status==='green'?'Op schema':'Onder dagtempo'));
 const metrics=node('div','chart-goal-metrics');
 for(const [label,hours] of [['Nodig per dag',target],[`Gem. per dag · ${days} ${days===1?'dag':'dagen'}`,average]]){
  const metric=node('div','chart-goal-metric');
  metric.append(node('span','',label),duration(hours,{goal:true}));
  metrics.append(metric);
 }
 summary.append(heading,metrics);
 return summary;
}
export class AnalyticsUI{
 constructor(sheets,{setBusy,canMutate}){this.store=new ChartStore(sheets);this.sheets=sheets;this.setBusy=setBusy;this.canMutate=canMutate;this.charts=[];this.entries=[];this.loaded=false;this.id=null;this.studyLoaded=false;
  $('new-chart').addEventListener('click',()=>this.edit());$('chart-cancel').addEventListener('click',()=>$('chart-dialog').close());
  $('chart-period').addEventListener('change',()=>this.dates());$('chart-form').addEventListener('submit',e=>{e.preventDefault();this.save();});
  $('chart-delete-cancel').addEventListener('click',()=>$('chart-delete-dialog').close());$('chart-delete-confirm').addEventListener('click',async()=>{if(await this.mutate(()=>this.store.remove(this.deleting),'Grafiek verwijderd.'))$('chart-delete-dialog').close();});
  for(const id of ['chart-dialog','chart-delete-dialog'])$(id).addEventListener('cancel',e=>{if(this.saving)e.preventDefault();});
  this.render();
 }
 dates(){$('chart-dates').hidden=$('chart-period').value!=='custom';for(const id of ['chart-from','chart-to'])$(id).required=$('chart-period').value==='custom';}
 message(text,error=false){$('data-feedback').textContent=text;$('data-feedback').classList.toggle('error',error);}
 updateDisabled(connected,locked){this.locked=locked;this.connected=connected;$('new-chart').disabled=!connected||locked||!this.loaded;document.querySelectorAll('[data-chart-action]').forEach(b=>b.disabled=!connected||locked||!this.loaded);$('chart-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=locked);$('chart-delete-confirm').disabled=locked;$('chart-delete-cancel').disabled=locked;}
 setHighlight(goal){this.highlight=goal;this.render();}
 setEntries(entries,loaded){this.entries=entries;this.studyLoaded=loaded;this.render();}
 reset(){this.charts=[];this.highlight=null;this.loaded=false;this.entries=[];this.studyLoaded=false;for(const id of ['chart-dialog','chart-delete-dialog'])if($(id).open)$(id).close();this.render();this.message('Je grafieken worden in Google Sheets bewaard.');}
 async refresh(){try{this.charts=await this.store.read();this.loaded=true;this.render();}catch(e){this.charts=[];this.loaded=false;this.render();this.message(e.message,true);}}
 methods(){return methodNames(this.sheets.methodCatalog||[],this.entries);}
 canonical(chart){return {...chart,method:JSON.stringify([...new Set(selectedMethods(chart.method).flatMap(m=>materialList(resolveMaterials(m,this.sheets.methodCatalog||[]))))])};}
 edit(chart=null){if(chart)chart=this.canonical(chart);if(!this.canMutate()||!this.loaded)return;this.id=chart?.id||crypto.randomUUID();$('chart-editor-title').textContent=chart?'Grafiek wijzigen':'Nieuwe grafiek';$('chart-name').value=chart?.name||'';$('chart-period').value=chart?.period||'7';$('chart-group').value=chart?.group||'day';$('chart-view').value=chart?.view||'bar';$('chart-sort').value=chart?.sort||'';$('chart-goal-colors').checked=!!chart?.goalColors;$('chart-from').value=displayDate(chart?.from||'');$('chart-to').value=displayDate(chart?.to||'');
  const selected=selectedMethods(chart?.method||'');
  const options=[...new Set([...this.methods(),...selected])];
  $('chart-method').replaceChildren();
  for(const method of options){const label=node('label','chart-method-option'),input=node('input');input.type='checkbox';input.value=method;input.checked=selected.includes(method);label.append(input,methodTag(method,this.sheets.methodCatalog||[]));$('chart-method').append(label);}
  if(!options.length)$('chart-method').append(node('p','goal-feedback','Nog geen methoden ingevuld.'));
  $('chart-error').hidden=true;this.dates();$('chart-dialog').showModal();}
 async mutate(action,message){if(!this.canMutate()||!this.loaded)return false;this.saving=true;this.setBusy(true);try{await action();this.charts=await this.store.read();this.render();this.message(message);return true;}catch(e){this.message(e.message,true);$('chart-error').textContent=e.message;$('chart-error').hidden=false;return false;}finally{this.saving=false;this.setBusy(false);}}
 async save(){const c={id:this.id,name:$('chart-name').value,period:$('chart-period').value,group:$('chart-group').value,view:$('chart-view').value,sort:$('chart-sort').value,goalColors:$('chart-goal-colors').checked,method:JSON.stringify([...$('chart-method').querySelectorAll('input:checked')].map(input=>input.value)),from:inputDate($('chart-from').value),to:inputDate($('chart-to').value)};if(await this.mutate(()=>this.store.save(c),'Grafiek opgeslagen.'))$('chart-dialog').close();}
 render(){
  if(this.layout?.drag)return;
  const list=$('data-charts');list.replaceChildren();const charts=this.layout?this.layout.sorted(this.charts.filter(c=>c.status==='actief'),'charts'):this.charts.filter(c=>c.status==='actief');
  if(!this.studyLoaded){list.append(node('p','notes-empty','Verbind met Google om je studiedata te bekijken.'));return;}
  if(!charts.length){list.append(node('p','notes-empty','Nog geen grafieken. Kies ‘Grafiek toevoegen’ om je eerste grafiek te maken.'));return;}
  for(const original of charts){const chart=this.canonical(original);const data=chartData(this.entries,chart,undefined,this.sheets.methodCatalog||[]),card=node('article','chart-card'),head=node('div','chart-heading');card.dataset.orderKind='charts';card.dataset.orderId=chart.id;const title=node('div','sort-title');if(this.layout)title.append(this.layout.handle('charts',chart.id,chart.name));title.append(node('h3','',chart.name));head.append(title);const actions=node('div','goal-actions');
   for(const [label,action] of [['Wijzigen',()=>this.edit(chart)],['Verwijderen',()=>{if(!this.canMutate())return;this.deleting=chart.id;$('chart-delete-name').textContent=chart.name;$('chart-delete-dialog').showModal();}]]){const b=node('button','text-button',label);b.type='button';b.dataset.chartAction='';b.setAttribute('aria-label',`${label}: ${chart.name}`);b.addEventListener('click',action);actions.append(b);}head.append(actions);
   const total=node('p','chart-total');
   total.append(duration(data.hours,{goal:chart.goalColors}),document.createTextNode(` · ${data.count} ${data.count===1?'item':'items'}`));
   card.append(head,total,node('p','goal-feedback',`${displayDate(data.from)} t/m ${displayDate(data.to)}${selectedMethods(chart.method).length?' · '+selectedMethods(chart.method).join(', '):''}`));
   let colored;
   if(chart.goalColors){colored=goalColors(this.entries,this.highlight,data);if(colored.status){card.classList.add(`goal-card-${colored.status}`);data.points=colored.points;card.append(goalSummary(this.highlight.name,colored));}else card.append(node('p','goal-feedback',colored.message));}
   if(data.missing)card.append(node('p','goal-feedback',`${data.missing} items zonder duur zijn niet meegeteld in de uren.`));
   if(!data.points.length||(data.hours===0&&!colored?.status))card.append(node('p','notes-empty','Geen geregistreerde studietijd in deze selectie.'));
   else if(chart.view==='line')card.append(this.line(data.points,chart.goalColors));else card.append(this.bars(data.points,chart.goalColors));
   if(chart.group==='jlpt')card.append(node('p','goal-feedback','De tijd per leermethode wordt gelijk verdeeld over de gekoppelde JLPT-niveaus.'));
   if(chart.group==='method')card.append(node('p','goal-feedback','Uren volgen de percentages per studie-item. Zonder aangepaste percentages wordt de tijd gelijk verdeeld.'));
   if(data.monthly)card.append(node('p','goal-feedback','Lange periodes worden per maand getoond.'));
   list.append(card);
  }
  this.updateDisabled(this.connected,this.locked);this.layout?.updateDisabled(this.connected,this.locked);
 }
 bars(points,goal){const container=node('div',goal?'chart-bars chart-bars-goal':'chart-bars'),max=Math.max(...points.map(p=>p.hours),1);for(const p of points){const row=node('div',`chart-bar-row${p.goalStatus?' day-'+p.goalStatus:''}`),track=node('div','chart-bar-track'),bar=node('div','chart-bar');bar.style.width=`${p.hours/max*100}%`;track.append(bar);const value=node('span','chart-value');value.append(duration(p.hours,{goal,short:true}));row.append(node('span','chart-label',displayDate(p.label)),track,value);if(p.goalStatus)row.append(node('span','chart-sr-only',p.goalStatus==='green'?'Op schema':'Onder dagtempo'));container.append(row);}return container;}
 line(points,goal){const wrap=node('div','chart-line-wrap'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 240');svg.setAttribute('role','img');svg.setAttribute('aria-label',goal?'Studieminuten per groep':'Studie-uren per groep');const max=Math.max(...points.map(p=>p.hours),1);const values=node('ul','chart-sr-only');const coords=points.map((p,i)=>`${40+i/Math.max(points.length-1,1)*570},${200-p.hours/max*175}`);const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',coords.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#31584a');line.setAttribute('stroke-width','3');svg.append(line);for(let i=0;i<points.length;i++){const circle=document.createElementNS(svg.namespaceURI,'circle');const [x,y]=coords[i].split(',');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','3');circle.setAttribute('fill',points[i].goalStatus==='orange'?'#bb6b20':points[i].goalStatus==='green'?'#397344':'#31584a');const point=points[i],title=document.createElementNS(svg.namespaceURI,'title');const label=`${displayDate(point.label)}: ${duration(point.hours,{goal}).textContent}${point.goalStatus?' · '+(point.goalStatus==='green'?'Op schema':'Onder dagtempo'):''}`;title.textContent=label;circle.append(title);svg.append(circle);values.append(node('li','',label));}const scale=node('p','goal-feedback','Schaal: ');scale.append(duration(max,{goal,range:'0–'}));wrap.append(scale,svg,values,node('p','line-labels',`${displayDate(points[0].label)} → ${displayDate(points.at(-1).label)}`));return wrap;}
}

