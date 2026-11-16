import {materialList} from './materials.js';
import {equalPercentages,validateWeights} from './weights.js';
const $=id=>document.getElementById(id);
export class WeightsUI{
 constructor(){this.methods=[];$('custom-weights').addEventListener('change',()=>this.render());$('equal-weights').addEventListener('click',()=>this.render());this.set(null);}
 set(entry){this.methods=materialList(entry?.materials);$('custom-weights').checked=!!entry?.weights;this.render(entry?.weights);}
 selectionChanged(){this.methods=materialList($('materials').value);this.render();}
 render(weights=null){
  const custom=$('custom-weights').checked;$('weights-fields').hidden=!custom;$('method-weights').replaceChildren();
  const values=weights||equalPercentages(this.methods);
  for(const [i,method] of this.methods.entries()){const label=document.createElement('label');label.className='weight-row';label.append(document.createTextNode(method));const field=document.createElement('input');field.type='number';field.min='0';field.max='100';field.step='0.01';field.required=custom;field.value=values[method];field.dataset.method=method;field.id='method-weight-'+i;field.setAttribute('aria-label',method+' percentage');field.addEventListener('input',()=>this.total());label.append(field,document.createTextNode('%'));$('method-weights').append(label);}
  this.total();
 }
 total(){const fields=[...$('method-weights').querySelectorAll('input')];const total=fields.reduce((s,f)=>s+(Number(f.value)||0),0);$('weights-total').textContent=`Totaal: ${total.toLocaleString('nl-NL',{maximumFractionDigits:2})}% / 100%`;$('weights-total').classList.toggle('error',!fields.length||Math.abs(total-100)>0.000001);}
 value(){if(!$('custom-weights').checked)return null;const weights=Object.fromEntries([...$('method-weights').querySelectorAll('input')].map(f=>[f.dataset.method,f.value===''?NaN:Number(f.value)]));validateWeights($('materials').value,weights);return weights;}
}
