import {MethodsStore,methodInfo,defaultGroup,defaultColor} from './method-catalog.js?v=30';
import {materialList} from './materials.js';
import {methodTag,tagColors} from './method-tags.js?v=22';
const $=id=>document.getElementById(id);
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
export class MethodsUI{
 constructor(sheets,options){this.sheets=sheets;this.options=options;this.store=new MethodsStore(sheets);this.catalog=[];this.entries=[];this.loaded=false;this.locked=false;
 $('new-group').addEventListener('click',()=>this.editGroup());$('group-cancel').addEventListener('click',()=>{if(!this.saving)$('group-dialog').close();});$('group-dialog').addEventListener('cancel',e=>{if(this.saving)e.preventDefault();});$('group-form').addEventListener('submit',e=>{e.preventDefault();this.saveGroup();});$('group-remove').addEventListener('click',()=>this.saveGroup(true));for(const id of ['group-name','group-color'])$(id).addEventListener('input',()=>this.groupPreview());
 $('new-method').addEventListener('click',()=>this.edit());$('method-cancel').addEventListener('click',()=>{if(!this.saving)$('method-dialog').close();});$('method-dialog').addEventListener('cancel',e=>{if(this.saving)e.preventDefault();});$('method-form').addEventListener('submit',e=>{e.preventDefault();this.save();});for(const id of ['method-search','show-archived-methods'])$(id).addEventListener('input',()=>this.render());for(const id of ['method-name','method-color','method-group'])$(id).addEventListener('input',()=>this.preview());this.render();
 }
 async refresh(){this.catalog=await this.store.read();this.sheets.methodCatalog=this.catalog;this.loaded=true;}
 reset(){this.catalog=[];this.sheets.methodCatalog=[];this.entries=[];this.loaded=false;$('method-dialog').close();$('group-dialog').close();this.render();}
 setEntries(entries){this.entries=entries;this.render();}
 updateDisabled(connected,locked){this.connected=connected;this.locked=locked;$('new-method').disabled=!connected||locked||!this.loaded;$('new-group').disabled=!connected||locked||!this.loaded;document.querySelectorAll('[data-method-action]').forEach(b=>b.disabled=!connected||locked||!this.loaded);for(const id of ['method-form','group-form'])$(id).querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=locked);if(!locked&&$('method-dialog').open)this.preview();}
 all(){const known=new Set(this.catalog.flatMap(m=>[m.name,...m.aliases]));return [...this.catalog,...[...new Set(this.entries.flatMap(e=>materialList(e.materials)))].filter(n=>!known.has(n)).map(name=>methodInfo(name))];}
 render(){
  const list=$('methods-list');
  list.replaceChildren();
  if(!this.loaded){
   list.append(node('p','notes-empty','Verbind met Google om je leermethodes te beheren.'));
   return;
  }
  const query=$('method-search').value.toLocaleLowerCase('nl');
  const archived=$('show-archived-methods').checked;
  const methods=this.all()
   .filter(m=>(archived||m.status==='actief')&&[m.name,m.group,m.description,m.type].join(' ').toLocaleLowerCase('nl').includes(query))
   .sort((a,b)=>(a.group||'Overig').localeCompare(b.group||'Overig','nl',{numeric:true})||a.name.localeCompare(b.name,'nl',{numeric:true}));
  const columns=node('div','method-type-columns');
  columns.append(
   this.renderType('Boeken',methods.filter(m=>m.type==='Boek')),
   this.renderType('Niveau algemeen',methods.filter(m=>m.type==='Niveau algemeen'))
  );
  list.append(columns);
  const untyped=methods.filter(m=>!m.type);
  if(untyped.length)list.append(this.renderType('Zonder type',untyped));
  this.updateDisabled(this.connected,this.locked);
 }
 renderType(title,methods){
  const section=node('section','method-type-section');
  section.setAttribute('aria-label',title);
  section.append(node('h3','method-type-title',title));
  if(!methods.length)section.append(node('p','notes-empty','Geen leermethodes gevonden.'));
  let group,grid;
  for(const method of methods){
   const label=method.group||'Overig';
   if(label!==group){
    group=label;
    const subsection=node('section','method-group');
    const heading=node('div','method-group-heading');
    heading.append(node('h4','method-group-title',label));
    if(method.group){
     const editGroup=node('button','text-button','Groep bewerken');
     editGroup.type='button';
     editGroup.dataset.methodAction='';
     editGroup.setAttribute('aria-label',`Groep bewerken: ${label} (${title})`);
     editGroup.addEventListener('click',()=>this.editGroup(label));
     heading.append(editGroup);
    }
    grid=node('div','methods-grid');
    subsection.append(heading,grid);
    section.append(subsection);
   }
   grid.append(this.renderCard(method));
  }
  return section;
 }
 renderCard(method){
  const card=node('article','method-card');
  card.append(methodTag(method.name,[method]));
  if(method.description)card.append(node('p','method-description',method.description));
  if(method.status==='gearchiveerd')card.append(node('p','goal-feedback','Gearchiveerd'));
  const actions=node('div','method-actions');
  const edit=node('button','text-button','Bewerken');
  edit.type='button';
  edit.dataset.methodAction='';
  edit.setAttribute('aria-label',`Bewerken: ${method.name}`);
  edit.addEventListener('click',()=>this.edit(method));
  actions.append(edit);
  if(method.id){
   const archive=node('button','text-button',method.status==='actief'?'Archiveren':'Terugzetten');
   archive.type='button';
   archive.dataset.methodAction='';
   archive.setAttribute('aria-label',`${archive.textContent}: ${method.name}`);
   archive.addEventListener('click',()=>this.mutate({...method,status:method.status==='actief'?'gearchiveerd':'actief'}));
   actions.append(archive);
  }
  card.append(actions);
  return card;
 }
 editGroup(original=''){
  if(!this.options.canMutate()||!this.loaded)return;this.originalGroup=original;$('group-editor-title').textContent=original?'Groep bewerken':'Nieuwe groep';$('group-name').value=original;$('group-color').value=this.catalog.find(m=>m.group===original)?.color||defaultColor('Nieuwe groep');$('group-type').value='';$('group-remove').hidden=!original;$('group-error').hidden=true;
  this.groupMethods=this.all().map(m=>({...m,id:m.id||crypto.randomUUID()}));$('group-methods').replaceChildren();for(const method of [...this.groupMethods].sort((a,b)=>a.name.localeCompare(b.name,'nl',{numeric:true}))){const label=node('label','group-method-choice'),input=node('input');input.type='checkbox';input.value=method.id;input.checked=!!original&&method.group===original;input.addEventListener('change',()=>this.groupPreview());label.append(input,methodTag(method.name,this.catalog),node('span','group-method-current',method.group||'Overig'));if(method.status==='gearchiveerd')label.append(node('small','','Gearchiveerd'));$('group-methods').append(label);}
  this.groupPreview();$('group-dialog').showModal();
 }
 groupPreview(){
  const target=$('group-name').value.trim(),count=$('group-methods').querySelectorAll('input:checked').length,merge=target!==this.originalGroup&&this.catalog.some(m=>m.group===target);
  for(const label of $('group-methods').children){const input=label.querySelector('input'),tag=label.querySelector('.method-tag'),method=this.groupMethods.find(m=>m.id===input.value),colors=tagColors(input.checked?$('group-color').value:method.color);tag.style.backgroundColor=colors.background;tag.style.color=colors.foreground;}
  $('group-preview').textContent=`${count} leermethodes geselecteerd. ${merge?'Deze naam bestaat al: de groepen worden samengevoegd. ':''}Aangevinkte methodes verhuizen naar deze groep. Uitgevinkte methodes uit de oorspronkelijke groep komen onder Overig.`;
 }
 async saveGroup(remove=false){
  if(this.saving||!this.options.canMutate())return;const value={original:this.originalGroup,name:$('group-name').value,color:$('group-color').value,ids:[...$('group-methods').querySelectorAll('input:checked')].map(el=>el.value),remove,type:$('group-type').value};
  this.saving=true;this.options.setBusy(true);try{for(const method of this.groupMethods.filter(m=>!this.catalog.some(saved=>saved.id===m.id)&&(value.ids.includes(m.id)||m.group===value.original)))await this.store.save(method);await this.store.saveGroup(value);await this.refresh();await this.options.afterChange();$('group-dialog').close();$('methods-feedback').textContent=remove?'Groep opgeheven. De leermethodes staan nu onder Overig.':'Groep opgeslagen.';}catch(error){$('group-error').textContent=error.message;$('group-error').hidden=false;}finally{this.saving=false;this.options.setBusy(false);}
 }
 edit(method=null){if(!this.options.canMutate()||!this.loaded)return;this.editing=method||{id:'',name:'',color:defaultColor('Nieuw'),description:'',group:'',aliases:[],status:'actief'};this.draftId=method?.id||crypto.randomUUID();$('method-editor-title').textContent=method?'Leermethode bewerken':'Nieuwe leermethode';for(const field of ['name','color','description','group','type'])$('method-'+field).value=this.editing[field]??'';$('method-groups').replaceChildren(...[...new Set(this.catalog.map(m=>m.group).filter(Boolean))].sort().map(g=>new Option(g)));$('method-error').hidden=true;this.preview();$('method-dialog').showModal();}
 preview(){const member=this.catalog.find(m=>m.group&&m.group.toLocaleLowerCase('nl')===$('method-group').value.trim().toLocaleLowerCase('nl'));if(member)$('method-color').value=member.color;$('method-color').disabled=!!member||this.locked;$('method-color-hint').hidden=!member;const name=$('method-name').value.trim()||'Voorbeeld';$('method-preview').replaceChildren(methodTag(name,[{name,color:$('method-color').value,description:'',group:'',aliases:[]} ]));}
 async mutate(value){if(!this.options.canMutate())return false;this.saving=true;this.options.setBusy(true);try{await this.store.save(value);await this.refresh();await this.options.afterChange();$('methods-feedback').textContent='Leermethode opgeslagen.';return true;}catch(error){$('method-error').textContent=error.message;$('method-error').hidden=false;$('methods-feedback').textContent=error.message;return false;}finally{this.saving=false;this.options.setBusy(false);}}
 async save(){const value={...this.editing,id:this.draftId,name:$('method-name').value,color:$('method-color').value,description:$('method-description').value,group:$('method-group').value,type:$('method-type').value};if(await this.mutate(value))$('method-dialog').close();}
}
