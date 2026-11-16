import {AnkiMappingsStore} from './anki-mappings.js';
import {methodForDeck} from './anki.js?v=2';
import {materialList} from './materials.js';
const $=id=>document.getElementById(id);
export class AnkiMappingUI {
  constructor(sheets,anki,options){
    this.store=new AnkiMappingsStore(sheets);this.anki=anki;this.options=options;this.saving=false;
    $('anki-map-open').addEventListener('click',()=>this.open());
    $('anki-map-close').addEventListener('click',()=>{if(!this.saving)$('anki-map-dialog').close();});
    $('anki-map-dialog').addEventListener('cancel',event=>{if(this.saving)event.preventDefault();});
    $('anki-map-form').addEventListener('submit',event=>{event.preventDefault();this.save();});
  }
  async open(){
    if(!this.options.canMutate()){$('anki-status').textContent='Verbind eerst met Google en wacht tot het bijwerken klaar is.';return;}
    $('anki-map-dialog').showModal();$('anki-map-message').textContent='Decks en koppelingen ophalen…';$('anki-map-save').disabled=true;$('anki-map-rows').replaceChildren();
    this.options.setBusy(true);
    try{
      this.profile=await this.anki.call('getActiveProfile');
      this.options.checkProfile(this.profile);
      const decks=await this.anki.call('deckNames');
      if(!Array.isArray(decks)||decks.some(deck=>typeof deck!=='string'))throw Error('Ongeldige decknamen van AnkiConnect.');
      this.mappings=await this.store.read(this.profile);
      const methods=[...new Set([...this.options.entries().flatMap(entry=>materialList(entry.materials)),...Object.values(this.mappings)])].sort((a,b)=>a.localeCompare(b,'nl',{numeric:true}));
      $('anki-map-methods').replaceChildren(...methods.map(method=>{const option=document.createElement('option');option.value=method;return option;}));
      for(const deck of [...new Set([...decks,...Object.keys(this.mappings)])].sort((a,b)=>a.localeCompare(b,'nl',{numeric:true}))){
        const row=document.createElement('div');row.style.marginBottom='16px';
        const input=document.createElement('input');input.type='text';input.maxLength=200;input.setAttribute('list','anki-map-methods');input.placeholder='Erven van bovenliggend deck, anders Anki';input.value=this.mappings[deck]||'';input.dataset.deck=deck;input.id=`anki-map-deck-${$('anki-map-rows').children.length}`;
        const label=document.createElement('label');label.htmlFor=input.id;label.textContent=deck;
        const hint=document.createElement('p');hint.className='goal-feedback';hint.dataset.hint=deck;
        row.append(label,input,hint);$('anki-map-rows').append(row);
        input.addEventListener('input',()=>this.preview());
      }
      this.preview();$('anki-map-save').disabled=false;$('anki-map-message').textContent=`Profiel: ${this.profile}. Kies een bestaande methode of typ een nieuwe naam.`;
    }catch(error){$('anki-map-message').textContent=error.message;}
    finally{this.options.setBusy(false);}
  }
  values(){return Object.fromEntries([...$('anki-map-rows').querySelectorAll('input')].map(input=>[input.dataset.deck,input.value.trim()]).filter(([,method])=>method));}
  preview(){const values=this.values();for(const hint of $('anki-map-rows').querySelectorAll('[data-hint]'))hint.textContent=`Telt mee bij: ${methodForDeck(hint.dataset.hint,values)}`;}
  async save(){
    if(this.saving||!this.options.canMutate())return;
    this.saving=true;this.options.setBusy(true);$('anki-map-save').disabled=true;$('anki-map-close').disabled=true;
    let saved=false;
    try{
      const profile=await this.anki.call('getActiveProfile');
      if(profile!==this.profile)throw Error('Het Anki-profiel is gewijzigd. Sluit dit venster en open de koppelingen opnieuw.');
      await this.store.save(this.profile,this.values());saved=true;
      $('anki-map-dialog').close();$('anki-status').textContent='Deckkoppelingen opgeslagen. Anki-items worden opnieuw verdeeld…';
    }catch(error){$('anki-map-message').textContent=error.message;}
    finally{this.saving=false;this.options.setBusy(false);$('anki-map-save').disabled=false;$('anki-map-close').disabled=false;}
    if(saved)await this.options.afterSave();
  }
}
