export const NOTE_HEADERS=['ID','Titel','Notitie','Status','Aangemaakt','Bijgewerkt'];
function validate(note){if(!note.id||typeof note.title!=='string'||note.title.length>100||typeof note.body!=='string'||!note.body.trim()||note.body.length>5000)throw new Error('Vul een notitie in (maximaal 5000 tekens). Een titel mag maximaal 100 tekens bevatten.');}
export function parseNotes(rows){return rows.map((row,index)=>({row,index})).filter(({row})=>row.some(value=>value!==''&&value!==null&&value!==undefined)).map(({row,index})=>{
  const note={id:row[0]||'',title:row[1]||'',body:row[2]||'',status:row[3],createdAt:row[4]||'',updatedAt:row[5]||'',rowNumber:index+2};validate(note);if(!['actief','gearchiveerd','verwijderd'].includes(note.status))throw new Error('Een notitie heeft een ongeldige status in Google Sheets.');return note;
});}
export function filterNotes(notes,status,query=''){
  const norm=value=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('nl-NL');const search=norm(query);
  return notes.filter(note=>note.status===status&&norm(`${note.title} ${note.body}`).includes(search)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export function noteParts(text){
  const pattern=/(?:https?:\/\/|www\.)[^\s<>"']+/gi,parts=[];let cursor=0,match;
  while((match=pattern.exec(text))){
    if(match.index>cursor)parts.push({text:text.slice(cursor,match.index)});
    let value=match[0],tail='';
    while(/[.,!?;]$/.test(value)||(value.endsWith(')')&&(value.match(/\)/g)||[]).length>(value.match(/\(/g)||[]).length)){tail=value.slice(-1)+tail;value=value.slice(0,-1);}
    let url;try{const parsed=new URL(/^www\./i.test(value)?`https://${value}`:value);if(['http:','https:'].includes(parsed.protocol)&&parsed.hostname)url=parsed.href;}catch{}
    parts.push(url?{text:value,url}:{text:value});if(tail)parts.push({text:tail});cursor=pattern.lastIndex;
  }
  if(cursor<text.length)parts.push({text:text.slice(cursor)});return parts;
}
export class NotesStore{
  constructor(sheets,now=()=>new Date().toISOString()){this.sheets=sheets;this.now=now;}
  range(value){return encodeURIComponent(`'Studienotities'!${value}`);}
  async read(){const result=await this.sheets.request(`/values/${this.range('A1:F')}?valueRenderOption=UNFORMATTED_VALUE`);const rows=result.values||[];if(!NOTE_HEADERS.every((header,index)=>rows[0]?.[index]===header))throw new Error('De kolommen in Studienotities zijn gewijzigd.');return parseNotes(rows.slice(1));}
  values(note){return[note.id,note.title.trim(),note.body.trim(),note.status,note.createdAt,note.updatedAt];}
  async find(id){const matches=(await this.read()).filter(note=>note.id===id);if(matches.length!==1)throw new Error(matches.length?'Dit notitie-ID staat dubbel in Google Sheets.':'Deze notitie is niet meer gevonden.');return matches[0];}
  async create(note){validate(note);const matches=(await this.read()).filter(item=>item.id===note.id);if(matches.length>1)throw new Error('Dit notitie-ID staat dubbel in Google Sheets.');if(matches.length)return;const now=this.now();await this.sheets.request(`/values/${this.range('A:F')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({values:[this.values({...note,status:'actief',createdAt:now,updatedAt:now})]})});}
  async write(note){await this.sheets.request(`/values/${this.range(`A${note.rowNumber}:F${note.rowNumber}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[this.values(note)]})});}
  async update(note){validate(note);const current=await this.find(note.id);if(current.status==='verwijderd')throw new Error('Deze notitie is verwijderd.');await this.write({...current,title:note.title,body:note.body,updatedAt:this.now()});}
  async setStatus(id,status){if(!['actief','gearchiveerd','verwijderd'].includes(status))throw new Error('Ongeldige notitiestatus.');const current=await this.find(id);if(current.status===status)return;if(current.status==='verwijderd')throw new Error('Deze notitie is verwijderd.');await this.write({...current,status,updatedAt:this.now()});}
}
