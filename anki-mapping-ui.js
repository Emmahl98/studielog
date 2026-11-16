import {AnkiMappingsStore} from './anki-mappings.js?v=2';
import {methodForDeck} from './anki.js?v=3';
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
      const methods=[...new Set([...this.options.entries().flatMap(entry=>materialList(entry.materials)),...Object.values(this.mappings).flatMap(materialList)])].sort((a,b)=>a.localeCompare(b,'nl',{numeric:true}));
      $('anki-map-methods').replaceChildren(...methods.map(method=>{const option=document.createElement('option');option.value=method;return option;}));
      for(const deck of [...new Set([...decks,...Object.keys(this.mappings)])].sort((a,b)=>a.localeCompare(b,'nl',{numeric:true}))){
        const row=document.createElement('div');row.style.marginBottom='16px';
        const input=document.createElement('input');input.type='text';input.maxLength=2000;input.placeholder='Methodes, gescheiden door komma’s';input.value=this.mappings[deck]||'';input.dataset.deck=deck;input.id=`anki-map-deck-${$('anki-map-rows').children.length}`;
        const label=document.createElement('label');label.htmlFor=input.id;label.textContent=deck;
        const hint=document.createElement('p');hint.className='goal-feedback';hint.dataset.hint=deck;
        const add=document.createElement('input');add.type='text';add.setAttribute('list','anki-map-methods');add.placeholder='Kies of typ een methode';add.setAttribute('aria-label',`Methode toevoegen aan ${deck}`);
        const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='Methode toevoegen';
        const append=()=>{const value=materialList([...materialList(input.value),...materialList(add.value)].join(', ')).join(', ');if(value.length>2000){$('anki-map-message').textContent='Gebruik maximaal 2000 tekens per deck.';return;}input.value=value;add.value='';this.preview();};
        button.addEventListener('click',append);add.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();append();}});
        row.append(label,input,add,button,hint);$('anki-map-rows').append(row);
        input.addEventListener('input',()=>this.preview());
      }
      this.preview();$('anki-map-save').disabled=false;$('anki-map-message').textContent=`Profiel: ${this.profile}. Voeg meerdere methodes toe per deck. De tijd wordt gelijk verdeeld.`;
    }catch(error){$('anki-map-message').textContent=error.message;}
    finally{this.options.setBusy(false);}
  }
  values(){return Object.fromEntries([...$('anki-map-rows').querySelectorAll('input[data-deck]')].map(input=>[input.dataset.deck,materialList(input.value).join(', ')]).filter(([,method])=>method));}
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
