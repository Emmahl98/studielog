export function materialList(value=''){
  return [...new Set(String(value).replace(/\s*\(https?:\/\/[^\s)]+\)/g,'').split(/[,;\n]+/).map(item=>{
    const name=item.trim();const chapter=name.match(/^H\s*(\d+)【とびら】$/i);
    return chapter?`Tobira H${chapter[1]}`:name==='上級へのとびら'?'Tobira':name;
  }).filter(Boolean))];
}
