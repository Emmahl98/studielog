import {NotesStore,filterNotes,noteParts} from './notes.js?v=5';
const $=id=>document.getElementById(id);
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
export class NotesUI{
  constructor(sheets,{setBusy,canMutate}){
    this.store=new NotesStore(sheets);this.setBusy=setBusy;this.canMutate=canMutate;this.notes=[];this.loaded=false;this.status='actief';this.editingId=null;this.pendingId=null;this.deletingId=null;this.saving=false;
    $('note-form').addEventListener('submit',event=>{event.preventDefault();this.save();});
    $('cancel-note-edit').addEventListener('click',()=>this.clearForm());
    $('note-search').addEventListener('input',()=>this.render());
    for(const [id,status] of [['active-notes','actief'],['archived-notes','gearchiveerd']])$(id).addEventListener('click',()=>{this.status=status;this.render();});
    $('cancel-delete-note').addEventListener('click',()=>$('note-delete-dialog').close());
    $('note-delete-dialog').addEventListener('cancel',event=>{if(this.saving)event.preventDefault();});
    $('confirm-delete-note').addEventListener('click',async()=>{const id=this.deletingId;if(!id)return;if(await this.mutate(()=>this.store.setStatus(id,'verwijderd'),'Notitie verwijderd.')){if(this.editingId===id)this.clearForm();$('note-delete-dialog').close();this.deletingId=null;}});
    this.render();
  }
  message(text,error=false){$('note-feedback').textContent=text;$('note-feedback').classList.toggle('error',error);}
  updateDisabled(connected,locked){
    $('save-note').disabled=!connected||locked||!this.loaded;
    $('note-title').disabled=locked;$('note-body').disabled=locked;$('cancel-note-edit').disabled=locked;
    document.querySelectorAll('[data-note-action]').forEach(button=>button.disabled=!connected||locked||!this.loaded);
    $('confirm-delete-note').disabled=locked;$('cancel-delete-note').disabled=locked;
  }
  clearForm(){this.editingId=null;this.pendingId=null;$('note-title').value='';$('note-body').value='';$('note-form-title').textContent='Nieuwe notitie';$('cancel-note-edit').hidden=true;$('save-note').textContent='Notitie opslaan';}
  reset(){this.notes=[];this.loaded=false;this.clearForm();if($('note-delete-dialog').open)$('note-delete-dialog').close();this.render();this.message('Je notities worden in Google Sheets bewaard.');}
  async refresh(){try{this.notes=await this.store.read();this.loaded=true;this.render();}catch(error){this.notes=[];this.loaded=false;this.render();this.message(error.message,true);}}
  render(){
    $('notes-list').replaceChildren();
    $('active-notes').textContent=`Actief (${this.notes.filter(note=>note.status==='actief').length})`;$('archived-notes').textContent=`Archief (${this.notes.filter(note=>note.status==='gearchiveerd').length})`;
    $('active-notes').setAttribute('aria-pressed',String(this.status==='actief'));$('archived-notes').setAttribute('aria-pressed',String(this.status==='gearchiveerd'));
    const visible=filterNotes(this.notes,this.status,$('note-search').value);$('notes-count').textContent=this.loaded?`${visible.length} ${visible.length===1?'notitie':'notities'}`:'';
    if(!visible.length){$('notes-list').append(node('p','notes-empty',!this.loaded?'Verbind met Google om je notities te bekijken.':$('note-search').value?'Geen notities gevonden.':this.status==='gearchiveerd'?'Geen gearchiveerde notities.':'Nog geen notities.'));return;}
    for(const note of visible){
      const article=node('article','note-card');if(note.title)article.append(node('h3','',note.title));
      const body=node('p','note-body');for(const part of noteParts(note.body)){if(part.url){const link=node('a','',part.text);link.href=part.url;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}else body.append(document.createTextNode(part.text));}article.append(body);
      const actions=node('div','goal-actions');
      for(const [label,action] of [['Wijzigen',()=>this.edit(note)],[note.status==='actief'?'Archiveren':'Terugzetten',()=>this.mutate(()=>this.store.setStatus(note.id,note.status==='actief'?'gearchiveerd':'actief'),note.status==='actief'?'Notitie gearchiveerd.':'Notitie teruggezet.')],['Verwijderen',()=>this.askDelete(note)]]){
        const button=node('button',`text-button${label==='Verwijderen'?' danger':''}`,label);button.type='button';button.dataset.noteAction='';button.setAttribute('aria-label',`${label}: ${note.title||'notitie'}`);button.addEventListener('click',action);actions.append(button);
      }
      article.append(actions);$('notes-list').append(article);
    }
  }
  edit(note){if(!this.canMutate())return;this.editingId=note.id;this.pendingId=note.id;$('note-title').value=note.title;$('note-body').value=note.body;$('note-form-title').textContent='Notitie wijzigen';$('save-note').textContent='Wijzigingen opslaan';$('cancel-note-edit').hidden=false;$('note-form').scrollIntoView({behavior:'smooth',block:'center'});$('note-body').focus({preventScroll:true});}
  askDelete(note){if(!this.canMutate())return;this.deletingId=note.id;$('note-delete-title').textContent=note.title||note.body.slice(0,100);$('note-delete-dialog').showModal();}
  async mutate(action,message){
    if(!this.canMutate()||!this.loaded)return false;this.saving=true;this.setBusy(true);
    try{await action();this.notes=await this.store.read();this.render();this.message(message);return true;}catch(error){this.message(error.message,true);return false;}finally{this.saving=false;this.setBusy(false);}
  }
  async save(){
    if(!this.canMutate()||!this.loaded)return;const title=$('note-title').value.trim(),body=$('note-body').value.trim();if(!body){this.message('Vul een notitie of link in.',true);return;}
    this.pendingId||=crypto.randomUUID();const note={id:this.pendingId,title,body};const editing=!!this.editingId;$('save-note').textContent='Opslaan…';
    const success=await this.mutate(()=>editing?this.store.update(note):this.store.create(note),editing?'Wijzigingen opgeslagen.':'Notitie opgeslagen.');
    if(success)this.clearForm();else $('save-note').textContent=editing?'Wijzigingen opslaan':'Notitie opslaan';
  }
}
