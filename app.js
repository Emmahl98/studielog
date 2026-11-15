import {config} from './config.js';
import {localDate, groupEntries, SheetsStore, validMinutes} from './data.js?v=3';
import {studyProgress,validGoal} from './progress.js?v=3';
import {restoreSession,saveSession,clearSession} from './auth-session.js?v=2';
const $=id=>document.getElementById(id);
let token='', expiresAt=0, entries=[], filter='all', busy=false, loaded=false, pending=null, editingId=null;
let goal=null,goalLoaded=false,goalSaving=false;
const hoursFormatter=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2});
const storageKey='studielog.google-client-id';
const readClientId=()=>{ try {return localStorage.getItem(storageKey)||config.clientId;} catch{return config.clientId;} };
let clientId=readClientId();
let sessionStorageAvailable;
try{sessionStorageAvailable=window.sessionStorage;}catch{/* Use in-memory sign-in if disabled. */}
const previousSession=restoreSession(sessionStorageAvailable,clientId);
if(previousSession){token=previousSession.token;expiresAt=previousSession.expiresAt;}
const store=new SheetsStore(config,()=>Date.now()<expiresAt ? token : '');
const dateFormatter=new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
$('date').value=localDate();
$('today-label').textContent=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
$('origin').textContent=location.origin;
function notify(message, error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
function updateConnection(){
  const locked=busy||goalSaving;
  const connected=!!token && Date.now()<expiresAt;
  if(token && !connected){token='';expiresAt=0;clearSession(sessionStorageAvailable);}
  $('connection-dot').classList.toggle('connected',connected);
  $('connection-title').textContent=connected?'Verbonden met je Google Sheets':'Je studiedagboek, veilig in Google Sheets';
  $('connection-detail').textContent=connected?'Je items worden rechtstreeks in je privéspreadsheet opgeslagen.':'Verbind je Google-account om je items te bekijken en op te slaan.';
  $('connect').textContent=connected?'Opnieuw verbinden':'Verbinden met Google';
  $('disconnect').hidden=!connected;
  $('save').disabled=!connected || locked || !loaded;
  $('refresh').disabled=!connected || locked;
  $('connect').disabled=locked;
  $('disconnect').disabled=locked;
  $('settings-button').disabled=locked;
  $('cancel-edit').disabled=locked;
  document.querySelectorAll('.edit-entry').forEach(button=>button.disabled=locked || !connected || button.dataset.editable!=='true');
  $('entry-form').querySelectorAll('input,textarea').forEach(field=>field.disabled=locked);
  $('goal-hours').disabled=!connected || busy || goalSaving;
  $('save-goal').disabled=!connected || busy || goalSaving;
  $('save-hint').textContent=connected?'Opgeslagen in je eigen Google Sheets.':'Verbind eerst met Google om op te slaan.';
}
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function render(){
  renderProgress();
  $('entries').replaceChildren();$('total-count').textContent=entries.length;
  const groups=groupEntries(entries,filter);
  if (!groups.size){
    const empty=node('div','empty');empty.append(node('span','empty-mark','栞'),node('h3','',loaded?(filter==='all'?'Je eerste stap begint hier':'Nog geen '+(filter==='les'?'lessen':'sessies')):'Ruimte om te groeien'),node('p','',loaded?'Voeg een studie-item toe. Elk leermoment verdient een plekje.':'Verbind met Google en leg je eerste studiemoment vast. Je vindt je items hier terug, netjes per dag.'));$('entries').append(empty);return;
  }
  for (const [date,items] of groups){
    const section=node('section','day');const header=node('div','day-heading');
    const heading=node('h3');
    const time=node('time','',date===localDate()?'Vandaag':dateFormatter.format(new Date(`${date}T12:00:00`)));time.dateTime=date;heading.append(time);header.append(heading,node('small','',`${items.length} ${items.length===1?'item':'items'}`));section.append(header);
    for(const item of items){
      const article=node('article','entry');const body=node('div','entry-body');body.append(node('p','',item.subject));
      body.append(node('span','entry-duration',item.minutes===null?'Duur niet ingevuld':`${new Intl.NumberFormat('nl-NL').format(item.minutes)} min`));
      const edit=node('button','text-button edit-entry','Bewerken');edit.type='button';edit.dataset.editable=String(!!item.id);edit.setAttribute('aria-label',`Bewerken: ${item.subject}`);edit.disabled=busy || !item.id;edit.addEventListener('click',()=>startEdit(item));
      article.append(node('span',`badge ${item.type}`,item.type),body,edit);section.append(article);
    }
    $('entries').append(section);
  }
}
function renderProgress(){
  const progress=studyProgress(entries,goal);
  $('hours-total').textContent=loaded?hoursFormatter.format(progress.hours):'—';
  $('ring-value').setAttribute('stroke-dasharray',`${loaded?progress.ratio*100:0} 100`);
  if(!loaded){$('goal-summary').textContent='Verbind met Google om je voortgang te zien.';$('goal-remaining').textContent='';$('hours-ring').setAttribute('aria-label','Verbind met Google om je gemaakte uren te zien.');return;}
  if(progress.goal===null){$('goal-summary').textContent=goalLoaded?'Vul je urendoel in om je voortgang te bekijken.':'Je urendoel is nog niet geladen.';$('goal-remaining').textContent='';$('hours-ring').setAttribute('aria-label',`${hoursFormatter.format(progress.hours)} uur gemaakt. Geen urendoel ingesteld.`);return;}
  const percent=hoursFormatter.format(progress.percentage);
  $('goal-summary').textContent=`${hoursFormatter.format(progress.hours)} van ${hoursFormatter.format(progress.goal)} uur · ${percent}%`;
  $('goal-remaining').textContent=progress.remaining>0?`Nog ${hoursFormatter.format(progress.remaining)} uur tot je doel.`:'Doel behaald.';
  $('hours-ring').setAttribute('aria-label',`${hoursFormatter.format(progress.hours)} van ${hoursFormatter.format(progress.goal)} uur gemaakt, ${percent} procent.`);
}
async function refreshGoal(){
  try{goal=await store.readGoal();goalLoaded=true;if(document.activeElement!==$('goal-hours'))$('goal-hours').value=goal??'';$('goal-feedback').textContent='Je doel wordt in Google Sheets bewaard.';$('goal-feedback').classList.remove('error');}
  catch(error){goalLoaded=false;goal=null;$('goal-feedback').textContent=error.message;$('goal-feedback').classList.add('error');}
  renderProgress();
}
$('goal-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||goalSaving)return;
  const value=Number($('goal-hours').value);
  if(!validGoal(value)){$('goal-feedback').textContent='Vul een urendoel groter dan 0 in.';$('goal-feedback').classList.add('error');return;}
  goalSaving=true;updateConnection();$('save-goal').textContent='Opslaan…';
  try{await store.saveGoal(value);goal=value;goalLoaded=true;renderProgress();$('goal-feedback').textContent='Urendoel opgeslagen in Google Sheets.';$('goal-feedback').classList.remove('error');}
  catch(error){$('goal-feedback').textContent=error.message;$('goal-feedback').classList.add('error');}
  finally{goalSaving=false;$('save-goal').textContent='Doel opslaan';updateConnection();}
});
function startEdit(item){
  if(busy)return;editingId=item.id;pending=null;
  $('date').value=item.date;$('subject').value=item.subject;$('minutes').value=item.minutes??'';
  document.querySelectorAll('input[name="type"]').forEach(input=>input.checked=input.value===item.type);
  $('char-count').textContent=`${item.subject.length} / 2000`;$('entry-title').textContent='Studie-item bewerken';$('save').textContent='Wijzigingen opslaan';$('cancel-edit').hidden=false;
  $('entry-form').scrollIntoView({behavior:'smooth',block:'center'});$('subject').focus({preventScroll:true});updateConnection();
}
function finishEdit(clear=false){
  editingId=null;pending=null;$('entry-title').textContent='Nieuw studie-item';$('save').textContent='＋ Item opslaan';$('cancel-edit').hidden=true;
  if(clear){$('subject').value='';$('minutes').value='';$('date').value=localDate();$('char-count').textContent='0 / 2000';}
}
$('cancel-edit').addEventListener('click',()=>{finishEdit(true);notify('Bewerken geannuleerd.');});
async function refresh(showMessage=true){
  busy=true;updateConnection();$('entries').setAttribute('aria-busy','true');
  try{entries=await store.read();loaded=true;render();await refreshGoal();if(showMessage)notify('Je studieoverzicht is bijgewerkt.');}
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
  if(next!==clientId){token='';expiresAt=0;clearSession(sessionStorageAvailable);entries=[];loaded=false;goal=null;goalLoaded=false;$('goal-hours').value='';finishEdit(true);render();}
  clientId=next;$('settings').close();updateConnection();notify('Instelling opgeslagen. Klik op ‘Verbinden met Google’.');
});
$('connect').addEventListener('click',()=>{
  if(!clientId){openSettings();return;}
  if(!window.google?.accounts?.oauth2){notify('De Google-inlogfunctie is nog niet geladen. Controleer je internet of advertentieblokker en probeer opnieuw.',true);return;}
  const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:async result=>{
    if(result.error){notify('Verbinden is niet gelukt. Geef toestemming voor Google Sheets en probeer opnieuw.',true);return;}
    if(!google.accounts.oauth2.hasGrantedAllScopes(result,'https://www.googleapis.com/auth/spreadsheets')){notify('Geef toestemming voor Google Sheets om je studiedagboek te gebruiken.',true);return;}
    token=result.access_token;expiresAt=Date.now()+Number(result.expires_in)*1000-30000;
    saveSession(sessionStorageAvailable,{clientId,token,expiresAt});
    entries=[];loaded=false;goal=null;goalLoaded=false;$('goal-hours').value='';render();
    notify('Verbonden. Je studieoverzicht wordt geladen…');await refresh(false);
    if(loaded)notify('Verbonden. Je kunt nu studie-items opslaan.');
  },error_callback:()=>notify('Het Google-inlogvenster is gesloten of geblokkeerd. Sta pop-ups toe en probeer opnieuw.',true)});
  client.requestAccessToken({prompt:''});
});
$('disconnect').addEventListener('click',()=>{token='';expiresAt=0;clearSession(sessionStorageAvailable);entries=[];loaded=false;goal=null;goalLoaded=false;$('goal-hours').value='';finishEdit(true);render();updateConnection();notify('Je bent uitgelogd. Je opgeslagen items blijven in Google Sheets.');});
$('refresh').addEventListener('click',()=>refresh());
$('subject').addEventListener('input',()=>{$('char-count').textContent=`${$('subject').value.length} / 2000`;});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render();}));
$('entry-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  if(!token || Date.now()>=expiresAt){notify('Verbind opnieuw met Google. Je invoer blijft staan.',true);updateConnection();return;}
  const date=$('date').value,type=new FormData(event.currentTarget).get('type'),subject=$('subject').value.trim(),minutes=Number($('minutes').value);
  if(!subject){notify('Beschrijf kort wat je hebt gestudeerd.',true);$('subject').focus();return;}
  if(!validMinutes(minutes)){notify('Vul een heel aantal minuten groter dan 0 in.',true);$('minutes').focus();return;}
  if(!pending || pending.date!==date || pending.type!==type || pending.subject!==subject || pending.minutes!==minutes)pending={date,type,subject,minutes,id:editingId||crypto.randomUUID(),createdAt:entries.find(item=>item.id===editingId)?.createdAt||new Date().toISOString()};
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
updateConnection();
if(previousSession){notify('Google-verbinding hersteld. Je studieoverzicht wordt geladen…');refresh(false).then(()=>{if(loaded)notify('Google-verbinding hersteld. Je studieoverzicht is bijgewerkt.');});}
