import {config} from './config.js';
import {localDate, groupEntries, SheetsStore} from './data.js';
const $=id=>document.getElementById(id);
let token='', expiresAt=0, entries=[], filter='all', busy=false, loaded=false, pending=null;
const storageKey='studielog.google-client-id';
const readClientId=()=>{ try {return localStorage.getItem(storageKey)||config.clientId;} catch{return config.clientId;} };
let clientId=readClientId();
const store=new SheetsStore(config,()=>Date.now()<expiresAt ? token : '');
const dateFormatter=new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
$('date').value=localDate();
$('today-label').textContent=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
$('origin').textContent=location.origin;
function notify(message, error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
function updateConnection(){
  const connected=!!token && Date.now()<expiresAt;
  $('connection-dot').classList.toggle('connected',connected);
  $('connection-title').textContent=connected?'Verbonden met je Google Sheets':'Je studiedagboek, veilig in Google Sheets';
  $('connection-detail').textContent=connected?'Je items worden rechtstreeks in je privéspreadsheet opgeslagen.':'Verbind je Google-account om je items te bekijken en op te slaan.';
  $('connect').textContent=connected?'Opnieuw verbinden':'Verbinden met Google';
  $('disconnect').hidden=!connected;
  $('save').disabled=!connected || busy || !loaded;
  $('refresh').disabled=!connected || busy;
  $('connect').disabled=busy;
  $('disconnect').disabled=busy;
  $('settings-button').disabled=busy;
  $('entry-form').querySelectorAll('input,textarea').forEach(field=>field.disabled=busy);
  $('save-hint').textContent=connected?'Opgeslagen in je eigen Google Sheets.':'Verbind eerst met Google om op te slaan.';
}
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function render(){
  $('entries').replaceChildren();$('total-count').textContent=entries.length;
  const groups=groupEntries(entries,filter);
  if (!groups.size){
    const empty=node('div','empty');empty.append(node('span','empty-mark','栞'),node('h3','',loaded?(filter==='all'?'Je eerste stap begint hier':'Nog geen '+(filter==='les'?'lessen':'sessies')):'Ruimte om te groeien'),node('p','',loaded?'Voeg een studie-item toe. Elk leermoment verdient een plekje.':'Verbind met Google en leg je eerste studiemoment vast. Je vindt je items hier terug, netjes per dag.'));$('entries').append(empty);return;
  }
  for (const [date,items] of groups){
    const section=node('section','day');const header=node('div','day-heading');
    const heading=node('h3');
    const time=node('time','',date===localDate()?'Vandaag':dateFormatter.format(new Date(`${date}T12:00:00`)));time.dateTime=date;heading.append(time);header.append(heading,node('small','',`${items.length} ${items.length===1?'item':'items'}`));section.append(header);
    for(const item of items){const article=node('article','entry');article.append(node('span',`badge ${item.type}`,item.type),node('p','',item.subject));section.append(article);}
    $('entries').append(section);
  }
}
async function refresh(showMessage=true){
  busy=true;updateConnection();$('entries').setAttribute('aria-busy','true');
  try{entries=await store.read();loaded=true;render();if(showMessage)notify('Je studieoverzicht is bijgewerkt.');}
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
  if(next!==clientId){token='';expiresAt=0;entries=[];loaded=false;render();}
  clientId=next;$('settings').close();updateConnection();notify('Instelling opgeslagen. Klik op ‘Verbinden met Google’.');
});
$('connect').addEventListener('click',()=>{
  if(!clientId){openSettings();return;}
  if(!window.google?.accounts?.oauth2){notify('De Google-inlogfunctie is nog niet geladen. Controleer je internet of advertentieblokker en probeer opnieuw.',true);return;}
  const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:async result=>{
    if(result.error){notify('Verbinden is niet gelukt. Geef toestemming voor Google Sheets en probeer opnieuw.',true);return;}
    if(!google.accounts.oauth2.hasGrantedAllScopes(result,'https://www.googleapis.com/auth/spreadsheets')){notify('Geef toestemming voor Google Sheets om je studiedagboek te gebruiken.',true);return;}
    token=result.access_token;expiresAt=Date.now()+Number(result.expires_in)*1000-30000;
    entries=[];loaded=false;render();
    notify('Verbonden. Je studieoverzicht wordt geladen…');await refresh(false);
    if(loaded)notify('Verbonden. Je kunt nu studie-items opslaan.');
  },error_callback:()=>notify('Het Google-inlogvenster is gesloten of geblokkeerd. Sta pop-ups toe en probeer opnieuw.',true)});
  client.requestAccessToken({prompt:''});
});
$('disconnect').addEventListener('click',()=>{token='';expiresAt=0;entries=[];loaded=false;pending=null;render();updateConnection();notify('Je bent uitgelogd. Je opgeslagen items blijven in Google Sheets.');});
$('refresh').addEventListener('click',()=>refresh());
$('subject').addEventListener('input',()=>{$('char-count').textContent=`${$('subject').value.length} / 2000`;});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render();}));
$('entry-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  if(!token || Date.now()>=expiresAt){notify('Verbind opnieuw met Google. Je invoer blijft staan.',true);updateConnection();return;}
  const date=$('date').value,type=new FormData(event.currentTarget).get('type'),subject=$('subject').value.trim();
  if(!subject){notify('Beschrijf kort wat je hebt gestudeerd.',true);$('subject').focus();return;}
  if(!pending || pending.date!==date || pending.type!==type || pending.subject!==subject)pending={date,type,subject,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  busy=true;updateConnection();$('save').textContent='Opslaan…';
  let saved=false;
  try{await store.add(pending);saved=true;const savedEntry=pending;if(!entries.some(item=>item.id===savedEntry.id))entries.push(savedEntry);pending=null;loaded=true;render();$('subject').value='';$('char-count').textContent='0 / 2000';notify('Opgeslagen in Google Sheets. Mooi meegenomen!');$('subject').focus();}
  catch(error){notify(error.message+' Je kunt opnieuw op ‘Item opslaan’ klikken.',true);}
  finally{busy=false;$('save').textContent='＋ Item opslaan';updateConnection();}
  // A refresh failure must not turn a confirmed successful write into a retry.
  if(saved){try{entries=await store.read();render();}catch{/* Keep the confirmed saved entry visible. */}}
});
setInterval(updateConnection,15000);
updateConnection();
