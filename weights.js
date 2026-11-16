import {materialList} from './materials.js';
export function validateWeights(materials,weights){
  if(weights===undefined||weights===null)return;
  const methods=materialList(materials);
  if(!weights||Array.isArray(weights)||typeof weights!=='object'||!methods.length||Object.keys(weights).length!==methods.length||methods.some(m=>!Object.hasOwn(weights,m)||typeof weights[m]!=='number'||!Number.isFinite(weights[m])||weights[m]<0||weights[m]>100)||Math.abs(Object.values(weights).reduce((s,v)=>s+v,0)-100)>0.000001)throw Error('De percentages per methode moeten samen 100% zijn (0–100% per methode).');
}
export function parseWeights(value,materials){
  if(value===undefined||value===null||value==='')return null;
  let weights;try{weights=JSON.parse(value);}catch{throw Error('Ongeldige methodepercentages in de spreadsheet.');}
  validateWeights(materials,weights);return weights;
}
export function methodShares(entry){
  const methods=materialList(entry.materials);validateWeights(entry.materials,entry.weights);
  if(!methods.length)return [['Niet ingevuld',1]];
  return methods.map(m=>[m,entry.weights?entry.weights[m]/100:1/methods.length]);
}
export function equalPercentages(methods){
  const base=Math.floor(10000/methods.length),remainder=10000-base*methods.length;
  return Object.fromEntries(methods.map((m,i)=>[m,(base+(i<remainder?1:0))/100]));
}
