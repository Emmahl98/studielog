import {methodNames} from './method-catalog.js?v=21';
import {methodTag} from './method-tags.js?v=21';
import {AnkiMappingsStore} from './anki-mappings.js?v=26';
import {methodForDeck} from './anki.js?v=4';
import {materialList} from './materials.js';
const $=id=>document.getElementById(id);
export class AnkiMappingUI {
  constructor(sheets,anki,options){
    this.deckStore=new AnkiMappingsStore(sheets);
    this.tagStore=new AnkiMappingsStore(sheets,'Tag');
    this.anki=anki;this.options=options;this.saving=false;
    $('anki-map-open').addEventListener('click',()=>this.open(false));
    $('anki-tag-map-open').addEventListener('click',()=>this.open(true));
    $('anki-map-close').addEventListener('click',()=>{if(!this.saving)$('anki-map-dialog').close();});
    $('anki-map-dialog').addEventListener('cancel',event=>{if(this.saving)event.preventDefault();});
    $('anki-map-form').addEventListener('submit',event=>{event.preventDefault();this.save();});
  }
  async open(byTag){
    if(!this.options.canMutate()){$('anki-status').textContent='Verbind eerst met Google en wacht tot het bijwerken klaar is.';return;}
    this.byTag=byTag;
    this.store=byTag?this.tagStore:this.deckStore;
    $('anki-map-title').textContent=byTag?'Anki-tags en lesmethodes':'Anki-decks en lesmethodes';
    $('anki-map-description').textContent=byTag
      ? 'Een gekoppelde tag gaat voor de deckkoppeling. Elke unieke lesmethode krijgt een gelijk deel van de antwoordtijd.'
      : 'Een hoofddeck geldt ook voor subdecks. Een specifiek gekoppeld subdeck gaat voor.';
    $('anki-map-dialog').showModal();$('anki-map-message').textContent='Anki-koppelingen ophalen…';$('anki-map-save').disabled=true;$('anki-map-rows').replaceChildren();
    this.options.setBusy(true);
    try{
      this.profile=await this.anki.call('getActiveProfile');
      this.options.checkProfile(this.profile);
      const decks=await this.anki.call(byTag?'getTags':'deckNames');
      if(!Array.isArray(decks)||decks.some(deck=>typeof deck!=='string'||!deck))throw Error('Ongeldige namen van AnkiConnect.');
      this.mappings=await this.store.read(this.profile);
      const otherMappings=await (byTag?this.deckStore:this.tagStore).read(this.profile);
      const methods=methodNames(this.store.sheets.methodCatalog||[],this.options.entries(),[...Object.values(this.mappings),...Object.values(otherMappings)].flatMap(materialList));
      this.selections=new Map();
      for(const deck of [...new Set([...decks,...Object.keys(this.mappings)])].sort((a,b)=>a.localeCompare(b,'nl',{numeric:true}))){
        const row=document.createElement('section');row.className='anki-deck-row';
        const selected=new Set(materialList(Object.hasOwn(this.mappings,deck)?this.mappings[deck]:''));this.selections.set(deck,selected);
        const title=document.createElement('h3');title.className='anki-deck-title';title.textContent=deck;
        const tags=document.createElement('div');tags.className='anki-method-tags';tags.setAttribute('aria-label',`Geselecteerde lesmethodes voor ${deck}`);
        const dropdown=document.createElement('details');dropdown.className='anki-method-picker';
        const summary=document.createElement('summary');summary.setAttribute('aria-label',`Lesmethodes kiezen voor ${deck}`);
        const menu=document.createElement('div');menu.className='anki-method-menu';
        const search=document.createElement('input');search.type='search';search.placeholder='Zoek een lesmethode';search.setAttribute('aria-label',`Lesmethodes zoeken voor ${deck}`);
        const choices=document.createElement('div');choices.className='anki-method-options';choices.setAttribute('role','group');choices.setAttribute('aria-label',`Lesmethodes voor ${deck}`);
        const checkboxes=new Map();
        const renderTags=()=>{
          summary.textContent=selected.size?`Lesmethodes kiezen (${selected.size})`:'Lesmethodes kiezen';
          tags.replaceChildren(...[...selected].map(method=>{const tag=document.createElement('span');tag.className='anki-method-tag';const name=methodTag(method,this.store.sheets.methodCatalog||[]);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`${method} verwijderen bij ${deck}`);remove.addEventListener('click',()=>{selected.delete(method);checkboxes.get(method).checked=false;renderTags();this.preview();summary.focus();});tag.append(name,remove);return tag;}));
        };
        for(const method of methods){
          const label=document.createElement('label');label.className='anki-method-choice';
          const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(method);checkboxes.set(method,checkbox);
          checkbox.addEventListener('change',()=>{if(checkbox.checked){if([...selected,method].join(', ').length>2000){checkbox.checked=false;$('anki-map-message').textContent='Kies maximaal 2000 tekens aan methodes per koppeling.';return;}selected.add(method);}else selected.delete(method);renderTags();this.preview();});
          label.append(checkbox,document.createTextNode(method));label.dataset.method=method;choices.append(label);
        }
        const empty=document.createElement('p');empty.className='goal-feedback';empty.textContent='Geen lesmethodes gevonden.';empty.hidden=methods.length>0;
        search.addEventListener('input',()=>{let count=0;for(const label of choices.children){label.hidden=!label.dataset.method.toLocaleLowerCase('nl').includes(search.value.toLocaleLowerCase('nl'));if(!label.hidden)count++;}empty.hidden=count>0;});
        dropdown.addEventListener('toggle',()=>{if(dropdown.open)for(const other of $('anki-map-rows').querySelectorAll('details'))if(other!==dropdown)other.open=false;});
        menu.append(search,choices,empty);dropdown.append(summary,menu);renderTags();
        const hint=document.createElement('p');hint.className='goal-feedback';hint.dataset.hint=deck;
        row.append(title,tags,dropdown,hint);$('anki-map-rows').append(row);
      }
      this.preview();$('anki-map-save').disabled=false;$('anki-map-message').textContent=`Profiel ${this.profile}. Je kunt meerdere lesmethodes aanvinken.`;
    }catch(error){$('anki-map-message').textContent=error.message;}
    finally{this.options.setBusy(false);}
  }
  values(){return Object.fromEntries([...this.selections||[]].map(([deck,selected])=>[deck,[...selected].join(', ')]).filter(([,method])=>method));}
  preview(){
    const values=this.values();
    for(const hint of $('anki-map-rows').querySelectorAll('[data-hint]')){
      const name=hint.dataset.hint;
      hint.textContent=this.byTag
        ? (Object.hasOwn(values,name)?`Telt mee bij ${values[name]}`:'Geen lesmethode gekoppeld')
        : `Telt mee bij ${methodForDeck(name,values)}`;
    }
  }
  async save(){
    if(this.saving||!this.options.canMutate())return;
    const mappings=this.values();
    this.saving=true;this.options.setBusy(true);$('anki-map-save').disabled=true;$('anki-map-close').disabled=true;
    let saved=false;
    try{
      const profile=await this.anki.call('getActiveProfile');
      if(profile!==this.profile)throw Error('Het Anki-profiel is gewijzigd. Sluit dit venster en open de koppelingen opnieuw.');
      await this.store.save(this.profile,mappings);saved=true;
      $('anki-map-dialog').close();$('anki-status').textContent='Koppelingen opgeslagen. Anki-items worden opnieuw verdeeld…';
    }catch(error){$('anki-map-message').textContent=error.message;}
    finally{this.saving=false;this.options.setBusy(false);$('anki-map-save').disabled=false;$('anki-map-close').disabled=false;}
    if(saved)await this.options.afterSave();
  }
}
