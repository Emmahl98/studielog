import {materialList} from './materials.js';
export const HEADERS = ['Datum', 'Label', 'Onderwerp', 'ID', 'Aangemaakt', 'Naam', 'Minuten', 'Uren', 'Lesmateriaal'];
export function validMinutes(value) { return typeof value==='number' && Number.isSafeInteger(value) && value>0; }
export function parseMinutes(value) {
  if(value===undefined || value===null || String(value).trim()==='')return null;
  const number=Number(value);
  return Number.isFinite(number) && number>=0 ? number : null;
}
export function validateEntry(entry) {
  if(entry.materials!==undefined&&(typeof entry.materials!=='string'||entry.materials.length>2000))throw new Error('Gebruik maximaal 2000 tekens voor studieboeken en methoden.');
  if (!validDate(entry.date) || !['sessie','les'].includes(entry.type) || typeof entry.subject!=='string' || !entry.subject.trim() || entry.subject.length>2000 || !entry.id || !validMinutes(entry.minutes)) throw new Error('Vul een geldige datum, soort, beschrijving en een heel aantal minuten groter dan 0 in.');
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(+date) && localDate(date) === value;
}
export function parseRows(rows) {
  return rows.map((row,index)=>({row,index})).filter(({row}) => validDate(row[0] || '') && ['sessie','les'].includes(row[1]) && typeof row[2] === 'string' && row[2].trim()).map(({row,index}) => ({date:row[0],type:row[1],subject:row[2],id:row[3] || '',createdAt:row[4] || '',minutes:parseMinutes(row[6]),materials:materialList(row[8]).join(", "),rowNumber:index+2}));
}
export function groupEntries(entries, filter = 'all') {
  const groups = new Map();
  for (const entry of [...entries].sort((a,b)=>b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) {
    if (filter !== 'all' && entry.type !== filter) continue;
    if (!groups.has(entry.date)) groups.set(entry.date,[]);
    groups.get(entry.date).push(entry);
  }
  return groups;
}
export class SheetsStore {
  constructor(config, getToken, fetcher = fetch) {
    this.config=config; this.getToken=getToken;
    // Native browser fetch rejects a SheetsStore instance as its receiver.
    this.fetcher=(...args)=>fetcher(...args);
  }
  async request(path, options={}) {
    const token=this.getToken();
    if (!token) throw new Error('Verbind eerst opnieuw met Google. Je invoer blijft staan.');
    let response;
    try { response=await this.fetcher(`https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}${path}`, {...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}}); }
    catch { throw new Error('Geen verbinding met Google Sheets. Controleer je internet en probeer opnieuw.'); }
    if (!response.ok) {
      if (response.status===401) throw new Error('Je Google-verbinding is verlopen. Verbind opnieuw; je invoer blijft staan.');
      if (response.status===403) throw new Error('Geen toegang tot de spreadsheet. Gebruik het Google-account dat toegang heeft en geef toestemming voor Google Sheets. Controleer ook of de Sheets API is ingeschakeld.');
      if (response.status===429) throw new Error('Google Sheets is even druk. Wacht een minuut en probeer opnieuw.');
      throw new Error(`Google Sheets kon de actie niet uitvoeren (${response.status}). Je invoer blijft staan.`);
    }
    return response.json();
  }
  range(value) { return encodeURIComponent(`'${this.config.sheetName.replaceAll("'","''")}'!${value}`); }
  async readGoal(){
    const result=await this.request(`/values/${encodeURIComponent("'Instellingen'!A1:B2")}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows=result.values||[];
    if(rows[0]?.[0]!=='Instelling' || rows[0]?.[1]!=='Waarde' || rows[1]?.[0]!=='Urendoel')throw new Error('De instellingen voor het urendoel zijn gewijzigd in Google Sheets.');
    const value=rows[1]?.[1];
    if(value===undefined || value===null || value==='')return null;
    const goal=Number(value);
    if(!Number.isFinite(goal)||goal<=0)throw new Error('Het urendoel in Google Sheets moet een getal groter dan 0 zijn.');
    return goal;
  }
  async saveGoal(goal){
    if(typeof goal!=='number'||!Number.isFinite(goal)||goal<=0)throw new Error('Vul een urendoel groter dan 0 in.');
    await this.readGoal();
    await this.request(`/values/${encodeURIComponent("'Instellingen'!B2")}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[[goal]]})});
  }
  async read() {
    const result=await this.request(`/values/${this.range('A1:I')}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows=result.values || [];
    if (rows.length===0) throw new Error('De spreadsheet is nog niet ingericht. Voeg eerst de kolommen Datum, Label, Onderwerp, ID en Aangemaakt toe.');
    if (!HEADERS.every((header,index)=>rows[0][index]===header)) throw new Error('De kolommen in de spreadsheet zijn gewijzigd. Verwacht: '+HEADERS.join(', ')+'.');
    return parseRows(rows.slice(1));
  }
  async add(entry) {
    validateEntry(entry);
    // Check the stable ID before retrying after an uncertain network response.
    const existing=await this.read();
    if (existing.some(item=>item.id===entry.id)) return;
    await this.request(`/values/${this.range('A:I')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({values:[[entry.date,entry.type,entry.subject,entry.id,entry.createdAt,'',entry.minutes,Math.round(entry.minutes/60*10)/10,entry.materials||'']]})});
  }
  async update(entry) {
    validateEntry(entry);
    // Resolve the stable ID again, so sorting the sheet cannot leave a stale row number.
    const matches=(await this.read()).filter(item=>item.id===entry.id);
    if(matches.length!==1)throw new Error(matches.length?'Dit item-ID komt dubbel voor. Pas dit eerst aan in Google Sheets.':'Dit item is niet meer gevonden. Vernieuw het overzicht.');
    const row=matches[0].rowNumber;
    await this.request('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:[
      {range:`'${this.config.sheetName.replaceAll("'","''")}'!A${row}:C${row}`,values:[[entry.date,entry.type,entry.subject]]},
      {range:`'${this.config.sheetName.replaceAll("'","''")}'!G${row}:H${row}`,values:[[entry.minutes,Math.round(entry.minutes/60*10)/10]]},
      ...(entry.materials!==undefined&&entry.materials!==matches[0].materials?[{range:`'${this.config.sheetName.replaceAll("'","''")}'!I${row}:I${row}`,values:[[entry.materials]]}]:[])
    ]})});
  }
}
