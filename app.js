import {displayDate,inputDate} from './dates.js?v=14';
import {AnalyticsUI} from './analytics-ui.js?v=18';
import {WeightsUI} from './weights-ui.js?v=18';
import {materialList} from './materials.js';
import {config} from './config.js';
import {localDate, groupEntries, SheetsStore, validMinutes} from './data.js?v=19';
import {studyProgress,validGoal} from './progress.js?v=5';
import {GoalsStore} from './goals.js?v=13';
import {goalSchedule} from './goal-schedule.js?v=8';
import {NotesUI} from './notes-ui.js?v=5';
import {restoreSession,saveSession,clearSession} from './auth-session.js?v=2';
const $=id=>document.getElementById(id);
let token='', expiresAt=0, entries=[], filter='all', busy=false, loaded=false, pending=null, editingId=null;
let goal=null,goalLoaded=false,goalSaving=false;
let goals=[],selectedGoalId='',editingGoalId=null,pendingGoalId=null,deletingGoalId=null;
let noteSaving=false,chartSaving=false,highlightedGoalId='';
const hoursFormatter=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2});
const storageKey='studielog.google-client-id';
const readClientId=()=>{ try {return localStorage.getItem(storageKey)||config.clientId;} catch{return config.clientId;} };
let clientId=readClientId();
let sessionStorageAvailable;
try{sessionStorageAvailable=window.sessionStorage;}catch{/* Use in-memory sign-in if disabled. */}
const previousSession=restoreSession(sessionStorageAvailable,clientId);
if(previousSession){token=previousSession.token;expiresAt=previousSession.expiresAt;}
const store=new SheetsStore(config,()=>Date.now()<expiresAt ? token : '');
const goalsStore=new GoalsStore(store);
const notesUI=new NotesUI(store,{setBusy:value=>{noteSaving=value;updateConnection();},canMutate:()=>!!token&&Date.now()<expiresAt&&!busy&&!goalSaving&&!noteSaving&&!chartSaving});
const analyticsUI=new AnalyticsUI(store,{setBusy:value=>{chartSaving=value;updateConnection();},canMutate:()=>!!token&&Date.now()<expiresAt&&!busy&&!goalSaving&&!noteSaving&&!chartSaving});

const weightsUI=new WeightsUI();
$('date').value=displayDate(localDate());
$('today-label').textContent=displayDate(localDate());
$('origin').textContent=location.origin;
function notify(message, error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
function updateConnection(){
  const locked=busy||goalSaving||noteSaving||chartSaving;
  const connected=!!token && Date.now()<expiresAt;
  if(token && !connected){token='';expiresAt=0;clearSession(sessionStorageAvailable);}
  $('connection-dot').classList.toggle('connected',connected);
  $('connection-title').textContent=connected?'Google Sheets · verbonden':'Google Sheets · niet verbonden';
  $('connection-detail').textContent=connected?'Je items worden rechtstreeks in je privéspreadsheet opgeslagen.':'Verbind je Google-account om je items te bekijken en op te slaan.';
  $('connect').textContent=connected?'Opnieuw verbinden':'Verbinden';
  $('disconnect').hidden=!connected;
  $('save').disabled=!connected || locked || !loaded;
  $('refresh').disabled=!connected || locked;
  $('connect').disabled=locked;
  $('disconnect').disabled=locked;
  $('settings-button').disabled=locked;
  $('cancel-edit').disabled=locked;
  document.querySelectorAll('.edit-entry').forEach(button=>button.disabled=locked || !connected || button.dataset.editable!=='true');
  $('entry-form').querySelectorAll('input,textarea').forEach(field=>field.disabled=locked);
  $('add-material').disabled=locked;$('equal-weights').disabled=locked;
  $('goal-hours').disabled=!connected || busy || goalSaving;
  $('goal-name').disabled=!connected || locked;
  $('goal-start').disabled=!connected||locked;$('goal-deadline').disabled=!connected||locked;
  $('save-goal').disabled=!connected || busy || goalSaving;
  $('new-goal').disabled=!connected || locked || !goalLoaded;
  $('open-goal-archive').disabled=!connected||locked||!goalLoaded;$('close-goal-archive').disabled=locked;
  document.querySelectorAll('[data-goal-action]').forEach(button=>button.disabled=!connected || locked || !goalLoaded);
  $('close-goal-editor').disabled=locked;
  $('confirm-delete-goal').disabled=locked;
  $('cancel-delete-goal').disabled=locked;
  notesUI.updateDisabled(connected,locked);analyticsUI.updateDisabled(connected,locked);
  $('save-hint').textContent=connected?'Opgeslagen in je eigen Google Sheets.':'Verbind eerst met Google om op te slaan.';
}
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function renderMaterials(){
  const selected=materialList($('materials').value);
  const options=[...new Set([...entries.flatMap(e=>materialList(e.materials)),...selected])].sort((a,b)=>a.localeCompare(b,'nl',{numeric:true}));
  $('material-options').replaceChildren();
  for(const method of options){const label=node('label','material-choice'),input=node('input');input.type='checkbox';input.value=method;input.checked=selected.includes(method);input.disabled=busy||goalSaving||noteSaving||chartSaving;input.addEventListener('change',()=>{const values=[...$('material-options').querySelectorAll('input:checked')].map(input=>input.value);if(values.join(', ').length>2000){input.checked=false;$('material-error').textContent='Kies maximaal 2000 tekens aan methoden.';$('material-error').hidden=false;return;}$('materials').value=values.join(', ');$('material-error').hidden=true;updateMaterialsSummary();weightsUI.selectionChanged();});label.append(input,document.createTextNode(method));$('material-options').append(label);}
  if(!options.length)$('material-options').append(node('p','goal-feedback','Nog geen methoden. Voeg hieronder je eerste methode toe.'));
  updateMaterialsSummary();
}
function updateMaterialsSummary(){const selected=materialList($('materials').value);$('materials-summary').textContent=selected.length?selected.join(', '):'Selecteer studieboeken / methoden';}
function addMaterial(){
  if(busy||goalSaving||noteSaving||chartSaving)return;
  const added=materialList($('new-material').value);if(!added.length)return;
  const value=[...new Set([...materialList($('materials').value),...added])].join(', ');
  if(value.length>2000){$('material-error').textContent='Kies maximaal 2000 tekens aan methoden.';$('material-error').hidden=false;return;}
  $('materials').value=value;$('new-material').value='';$('material-error').hidden=true;renderMaterials();weightsUI.selectionChanged();
}
$('add-material').addEventListener('click',addMaterial);
$('new-material').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addMaterial();}});
function render(){
  renderProgress();
  analyticsUI.setEntries(entries,loaded);
  renderMaterials();
  $('entries').replaceChildren();$('total-count').textContent=entries.length;
  const groups=groupEntries(entries,filter);
  if (!groups.size){
    const empty=node('div','empty');empty.append(node('span','empty-mark','栞'),node('h3','',loaded?(filter==='all'?'Je eerste stap begint hier':'Nog geen '+(filter==='les'?'lessen':'sessies')):'Ruimte om te groeien'),node('p','',loaded?'Voeg een studie-item toe. Elk leermoment verdient een plekje.':'Verbind met Google en leg je eerste studiemoment vast. Je vindt je items hier terug, netjes per dag.'));$('entries').append(empty);return;
  }
  for (const [date,items] of groups){
    const section=node('section','day');const header=node('div','day-heading');
    const heading=node('h3');
    const time=node('time','',displayDate(date));time.dateTime=date;heading.append(time);header.append(heading,node('small','',`${items.length} ${items.length===1?'item':'items'}`));section.append(header);
    for(const item of items){
      const article=node('article','entry');const body=node('div','entry-body');
      const toggle=node('button','entry-details-toggle',item.subject);toggle.type='button';toggle.setAttribute('aria-expanded','false');body.append(toggle);
      if(item.materials)body.append(node('p','entry-materials',item.weights?materialList(item.materials).map(m=>`${m} (${new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(item.weights[m])}%)`).join(', '):item.materials));
      body.append(node('span','entry-duration',item.minutes===null?'Duur niet ingevuld':`${new Intl.NumberFormat('nl-NL').format(item.minutes)} min`));
      const created=node('p','entry-created');created.hidden=true;
      const createdDate=item.createdAt?new Date(item.createdAt):null;
      if(createdDate&&!Number.isNaN(createdDate.getTime())){
        created.append(document.createTextNode('Aangemaakt op '));
        const time=node('time','',new Intl.DateTimeFormat('nl-NL',{dateStyle:'long',timeStyle:'medium'}).format(createdDate));time.dateTime=createdDate.toISOString();created.append(time);
      }else created.textContent='Aanmaaktijdstip niet beschikbaar';
      body.append(created);
      article.addEventListener('click',event=>{if(event.target.closest('.edit-entry'))return;created.hidden=!created.hidden;toggle.setAttribute('aria-expanded',String(!created.hidden));});
      const edit=node('button','text-button edit-entry','Bewerken');edit.type='button';edit.dataset.editable=String(!!item.id);edit.setAttribute('aria-label',`Bewerken: ${item.subject}`);edit.disabled=busy || !item.id;edit.addEventListener('click',()=>startEdit(item));
      article.append(node('span',`badge ${item.type}`,item.type),body,edit);section.append(article);
    }
    $('entries').append(section);
  }
}
function renderProgress(){
  renderGoalControls();
}
function makeGoalCard(item){
  const progress=goalSchedule(entries,item),article=node('article','goal-card');
  article.classList.toggle('highlighted-goal',item.id===highlightedGoalId);
  const titleRow=node('div','goal-title-row');titleRow.append(node('h3','goal-card-title',item.name));
  const highlightLabel=node('label','highlight-label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=item.id===highlightedGoalId;checkbox.dataset.goalAction='';checkbox.setAttribute('aria-label',`Highlight: ${item.name}`);checkbox.addEventListener('change',()=>mutateGoal(()=>goalsStore.setHighlight(checkbox.checked?item.id:''),'Highlight bijgewerkt.'));highlightLabel.append(checkbox,document.createTextNode('Highlight'));titleRow.append(highlightLabel);article.append(titleRow);
  const datesRow=node('div','goal-dates-row');datesRow.append(node('p','goal-status',progress.scheduled?`Start ${displayDate(item.startDate)}`:item.startDate?`Live · ${displayDate(item.startDate)}`:'Live'));if(item.deadline)datesRow.append(node('p','goal-dates',`Deadline ${displayDate(item.deadline)}`));article.append(datesRow);
  if(item.deadline){
    article.append(node('p','goal-daily',progress.remaining===0?'0 uur per dag · doel behaald':progress.overdue?'Deadline verstreken':`${new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2,roundingMode:'ceil'}).format(progress.dailyHours)} uur per dag${progress.scheduled?' vanaf de startdatum':''}`));
    if(progress.dailyHours!==null)article.append(node('p','goal-weekly',`${new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2,roundingMode:'ceil'}).format(progress.dailyHours*7)} uur per week`));}
  const ring=node('div','hours-ring');ring.setAttribute('role','img');ring.setAttribute('aria-label',`${hoursFormatter.format(progress.hours)} van ${hoursFormatter.format(item.hours)} uur, ${hoursFormatter.format(progress.percentage)} procent.`);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 176 176');svg.setAttribute('aria-hidden','true');
  for(const className of ['ring-track','ring-value']){const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');for(const [key,value] of Object.entries({cx:'88',cy:'88',r:'73',class:className,pathLength:'100'}))circle.setAttribute(key,value);if(className==='ring-value')circle.setAttribute('stroke-dasharray',`${progress.ratio*100} 100`);svg.append(circle);}
  const center=node('div','ring-center');center.append(node('strong','',hoursFormatter.format(progress.hours)),node('span','','uur gemaakt'));ring.append(svg,center);article.append(ring);
  article.append(node('p','goal-summary',`van ${hoursFormatter.format(item.hours)} uur · ${hoursFormatter.format(progress.percentage)}%`),node('p','goal-remaining',progress.remaining>0?`Nog ${hoursFormatter.format(progress.remaining)} uur`:'Doel behaald.'));
  article.append(goalActions(item,false));return article;
}
function goalActions(item,archived){
  const actions=node('div','goal-actions');
  const options=archived?[['Terugzetten',()=>changeGoalStatus(item,'actief')],['Wijzigen',()=>openGoalEditor(item)],['Verwijderen',()=>openGoalDelete(item)]]:[['Wijzigen',()=>openGoalEditor(item)],['Archiveren',()=>changeGoalStatus(item,'gearchiveerd')],['Verwijderen',()=>openGoalDelete(item)]];
  for(const [label,action] of options){const button=node('button',`text-button${label==='Verwijderen'?' danger':''}`,label);button.type='button';button.dataset.goalAction='';button.setAttribute('aria-label',`${label}: ${item.name}`);button.addEventListener('click',action);actions.append(button);}return actions;
}
function renderGoalControls(){
  if(!goalLoaded){goals=[];selectedGoalId='';highlightedGoalId='';}
  const active=goals.filter(item=>item.status==='actief');
  $('goal-cards').replaceChildren(...active.slice(0,3).map(makeGoalCard));
  $('goals-empty').hidden=active.length>0;$('goals-empty').textContent=!loaded?'Verbind met Google om je doelen te zien.':goalLoaded?'Geen actieve doelen. Maak een nieuw doel aan.':'Je doelen zijn nog niet geladen.';
  const extra=active.slice(3);$('more-goals').hidden=!extra.length;$('more-goals-title').textContent=`Overige doelen (${extra.length})`;$('overflow-goals').replaceChildren(...extra.map(makeGoalCard));if(!extra.length)$('more-goals').open=false;
  const archived=goals.filter(item=>item.status==='gearchiveerd');
  $('goal-archive-title').textContent=`Archief (${archived.length})`;$('open-goal-archive').textContent=`Archief (${archived.length})`;$('archived-goals').replaceChildren();
  if(!archived.length)$('archived-goals').append(node('p','goal-feedback','Geen gearchiveerde doelen.'));
  for(const item of archived){
    const article=node('article','archived-goal');article.append(node('strong','',item.name),node('p','goal-feedback',item.archivedHours===null?`Doel: ${hoursFormatter.format(item.hours)} uur`:`${hoursFormatter.format(item.archivedHours)} van ${hoursFormatter.format(item.hours)} uur bij archiveren`));
    article.append(goalActions(item,true));$('archived-goals').append(article);
  }
  analyticsUI.setHighlight(goals.find(g=>g.id===highlightedGoalId&&g.status==='actief')||null);
  updateConnection();
}
async function refreshGoal(){
  try{goals=await goalsStore.read();highlightedGoalId=await goalsStore.readHighlight();goalLoaded=true;$('goal-feedback').textContent='Je doelen worden in Google Sheets bewaard.';$('goal-feedback').classList.remove('error');}
  catch(error){goalLoaded=false;goal=null;goals=[];$('goal-feedback').textContent=error.message;$('goal-feedback').classList.add('error');}
  renderProgress();
}
function openGoalEditor(item=null){
  if(busy||goalSaving||!goalLoaded)return;
  $('goal-start').value=displayDate(item?.startDate||'');$('goal-deadline').value=displayDate(item?.deadline||'');
  editingGoalId=item?.id||null;pendingGoalId=item?.id||crypto.randomUUID();$('goal-name').value=item?.name||'';$('goal-hours').value=item?.hours??'';$('goal-editor-title').textContent=item?'Doel wijzigen':'Nieuw doel';$('goal-editor-error').hidden=true;$('goal-editor').showModal();
}
function openGoalDelete(item){if(busy||goalSaving)return;deletingGoalId=item.id;$('goal-delete-name').textContent=item.name;$('goal-delete-dialog').showModal();}
async function mutateGoal(action,message,selectId=null){
  if(busy||goalSaving)return false;goalSaving=true;updateConnection();
  try{await action();if(selectId)selectedGoalId=selectId;goals=await goalsStore.read();highlightedGoalId=await goalsStore.readHighlight();goalLoaded=true;renderProgress();$('goal-feedback').textContent=message;$('goal-feedback').classList.remove('error');return true;}
  catch(error){$('goal-feedback').textContent=error.message;$('goal-feedback').classList.add('error');if($('goal-editor').open){$('goal-editor-error').textContent=error.message;$('goal-editor-error').hidden=false;}return false;}
  finally{goalSaving=false;updateConnection();}
}
async function changeGoalStatus(item,status){
  const hours=goalSchedule(entries,item).hours;
  await mutateGoal(()=>goalsStore.setStatus(item.id,status,hours),status==='gearchiveerd'?'Doel gearchiveerd.':'Doel teruggezet.',status==='actief'?item.id:null);
}
$('open-goal-archive').addEventListener('click',()=>$('goal-archive-dialog').showModal());
$('close-goal-archive').addEventListener('click',()=>$('goal-archive-dialog').close());
$('new-goal').addEventListener('click',()=>openGoalEditor());
$('close-goal-editor').addEventListener('click',()=>$('goal-editor').close());
$('cancel-delete-goal').addEventListener('click',()=>$('goal-delete-dialog').close());
for(const id of ['goal-editor','goal-delete-dialog','goal-archive-dialog'])$(id).addEventListener('cancel',event=>{if(goalSaving)event.preventDefault();});
$('confirm-delete-goal').addEventListener('click',async()=>{if(!deletingGoalId)return;const id=deletingGoalId;if(await mutateGoal(()=>goalsStore.setStatus(id,'verwijderd'),'Doel verwijderd. Je studie-items zijn behouden.')){$('goal-delete-dialog').close();deletingGoalId=null;}});
$('goal-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||goalSaving)return;
  const value=Number($('goal-hours').value),name=$('goal-name').value.trim();
  if(!validGoal(value)||!name||name.length>100){$('goal-editor-error').textContent='Vul een naam en een urendoel groter dan 0 in.';$('goal-editor-error').hidden=false;return;}
  const item={id:pendingGoalId,name,hours:value,startDate:inputDate($('goal-start').value),deadline:inputDate($('goal-deadline').value)};$('save-goal').textContent='Opslaan…';
  const success=await mutateGoal(()=>editingGoalId?goalsStore.update(item):goalsStore.create(item),'Doel opgeslagen.',editingGoalId&&goals.find(goal=>goal.id===editingGoalId)?.status==='gearchiveerd'?null:item.id);
  $('save-goal').textContent='Doel opslaan';if(success){$('goal-editor').close();editingGoalId=null;pendingGoalId=null;}
});
function startEdit(item){
  if(busy)return;editingId=item.id;pending=null;
  $('date').value=displayDate(item.date);$('subject').value=item.subject;$('minutes').value=item.minutes??'';$('materials').value=item.materials||'';
  renderMaterials();weightsUI.set(item);$('new-material').value='';$('material-error').hidden=true;
  document.querySelectorAll('input[name="type"]').forEach(input=>input.checked=input.value===item.type);
  $('char-count').textContent=`${item.subject.length} / 2000`;$('entry-title').textContent='Studie-item bewerken';$('save').textContent='Wijzigingen opslaan';$('cancel-edit').hidden=false;
  $('entry-form').scrollIntoView({behavior:'smooth',block:'center'});$('subject').focus({preventScroll:true});updateConnection();
}
function finishEdit(clear=false){
  editingId=null;pending=null;$('entry-title').textContent='Nieuw studie-item';$('save').textContent='＋ Item opslaan';$('cancel-edit').hidden=true;
  if(clear){$('materials').value='';$('subject').value='';$('minutes').value='';$('date').value=displayDate(localDate());$('char-count').textContent='0 / 2000';$('new-material').value='';$('materials-dropdown').open=false;$('material-error').hidden=true;renderMaterials();weightsUI.set(null);}
}
$('cancel-edit').addEventListener('click',()=>{finishEdit(true);notify('Bewerken geannuleerd.');});
async function refresh(showMessage=true){
  busy=true;updateConnection();$('entries').setAttribute('aria-busy','true');
  try{entries=await store.read();loaded=true;render();await refreshGoal();await notesUI.refresh();await analyticsUI.refresh();if(showMessage)notify('Je studieoverzicht is bijgewerkt.');}
  catch(error){notify(error.message,true);}
  finally{busy=false;updateConnection();$('entries').setAttribute('aria-busy','false');}
}
function openSettings(){ $('client-id').value=clientId; $('settings-error').hidden=true; $('settings').showModal(); }
$('settings-button').addEventListener('click',openSettings);
$('close-settings').addEventListener('click',()=>$('settings').close());
$('settings-form').addEventListener('submit',event=>{
  event.preventDefault();const next=$('client-id').value.trim();
  if(!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(next)){$('settings-error').textContent='Vul een geldige Google OAuth-client-ID in.';$('settings-error').hidden=false;return;}
  try{localStorage.setItem(storageKey,next);}catch{notify('Instelling geldt voor deze pagina. Je browser kon deze niet onthouden.');}
  if(next!==clientId){token='';expiresAt=0;clearSession(sessionStorageAvailable);entries=[];loaded=false;goal=null;goalLoaded=false;$('goal-hours').value='';notesUI.reset();analyticsUI.reset();finishEdit(true);render();}
  clientId=next;$('settings').close();updateConnection();notify('');
});
$('connect').addEventListener('click',()=>{
  if(!clientId){openSettings();return;}
  if(!window.google?.accounts?.oauth2){notify('De Google-inlogfunctie is nog niet geladen. Controleer je internet of advertentieblokker en probeer opnieuw.',true);return;}
  const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:async result=>{
    if(result.error){notify('Verbinden is niet gelukt. Geef toestemming voor Google Sheets en probeer opnieuw.',true);return;}
    if(!google.accounts.oauth2.hasGrantedAllScopes(result,'https://www.googleapis.com/auth/spreadsheets')){notify('Geef toestemming voor Google Sheets om je studiedagboek te gebruiken.',true);return;}
    token=result.access_token;expiresAt=Date.now()+Number(result.expires_in)*1000-30000;
    saveSession(sessionStorageAvailable,{clientId,token,expiresAt});
    entries=[];loaded=false;goal=null;goalLoaded=false;$('goal-hours').value='';notesUI.reset();analyticsUI.reset();render();
    notify('');await refresh(false);
  },error_callback:()=>notify('Het Google-inlogvenster is gesloten of geblokkeerd. Sta pop-ups toe en probeer opnieuw.',true)});
  client.requestAccessToken({prompt:''});
});
$('disconnect').addEventListener('click',()=>{token='';expiresAt=0;clearSession(sessionStorageAvailable);entries=[];loaded=false;goal=null;goalLoaded=false;$('goal-hours').value='';notesUI.reset();analyticsUI.reset();finishEdit(true);render();updateConnection();notify('');});
$('refresh').addEventListener('click',()=>refresh());
$('subject').addEventListener('input',()=>{$('char-count').textContent=`${$('subject').value.length} / 2000`;});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render();}));
$('entry-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  if(!token || Date.now()>=expiresAt){notify('Verbind opnieuw met Google. Je invoer blijft staan.',true);updateConnection();return;}
  const date=inputDate($('date').value),type=new FormData(event.currentTarget).get('type'),subject=$('subject').value.trim(),minutes=Number($('minutes').value),materials=materialList($('materials').value).join(', ');
  let weights;try{weights=weightsUI.value();if(materialList(materials).some(m=>/^tobira$/i.test(m)))throw Error('Kies voor Tobira een hoofdstuk, bijvoorbeeld Tobira H1.');}catch(error){notify(error.message,true);return;}
  if(!subject){notify('Beschrijf kort wat je hebt gestudeerd.',true);$('subject').focus();return;}
  if(!$('minutes').value.trim()||!validMinutes(minutes)){notify('Vul een heel aantal minuten van 0 of meer in.',true);$('minutes').focus();return;}
  if(!pending || pending.date!==date || pending.type!==type || pending.subject!==subject || pending.minutes!==minutes || pending.materials!==materials || JSON.stringify(pending.weights)!==JSON.stringify(weights))pending={date,type,subject,minutes,materials,weights,id:editingId||crypto.randomUUID(),createdAt:entries.find(item=>item.id===editingId)?.createdAt||new Date().toISOString()};
  busy=true;updateConnection();$('save').textContent='Opslaan…';
  let saved=false;
  try{
    const wasEditing=!!editingId;
    if(wasEditing)await store.update(pending);else await store.add(pending);
    saved=true;const savedEntry=pending;const index=entries.findIndex(item=>item.id===savedEntry.id);if(index>=0)entries[index]=savedEntry;else entries.push(savedEntry);
    finishEdit(true);loaded=true;render();notify(wasEditing?'Wijzigingen opgeslagen in Google Sheets.':'Opgeslagen in Google Sheets. Mooi meegenomen!');
  }
  catch(error){notify(error.message+' Je kunt opnieuw op ‘Item opslaan’ klikken.',true);}
  finally{busy=false;$('save').textContent=editingId?'Wijzigingen opslaan':'＋ Item opslaan';updateConnection();}
  // A refresh failure must not turn a confirmed successful write into a retry.
  if(saved){try{entries=await store.read();render();}catch{/* Keep the confirmed saved entry visible. */}}
});
setInterval(updateConnection,15000);
function showPage(page){
 const isNotes=page==='notes',isData=page==='data';
 document.querySelectorAll('[data-overview-panel]').forEach(panel=>panel.hidden=isNotes||isData);
 $('notes-panel').hidden=!isNotes;$('data-panel').hidden=!isData;
 for(const [id,key] of [['overview-tab','overview'],['notes-tab','notes'],['data-tab','data']])$(id).setAttribute('aria-pressed',String(page===key));
 document.querySelector('h1').textContent=isNotes?'Studienotities':isData?'Mijn studiedata':'Wat heb je geleerd?';
 history.replaceState(null,'',isNotes?'#notities':isData?'#data':location.pathname);
}
$('overview-tab').addEventListener('click',()=>showPage('overview'));
$('notes-tab').addEventListener('click',()=>showPage('notes'));
$('data-tab').addEventListener('click',()=>showPage('data'));
showPage(location.hash==='#notities'?'notes':location.hash==='#data'?'data':'overview');
updateConnection();
if(previousSession)refresh(false);

let renderedDay=localDate();
function refreshDay(){const today=localDate();if(today!==renderedDay){renderedDay=today;$('today-label').textContent=displayDate(today);renderProgress();analyticsUI.setEntries(entries,loaded);}}
setInterval(refreshDay,30000);window.addEventListener('focus',refreshDay);document.addEventListener('visibilitychange',refreshDay);

