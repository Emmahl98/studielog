export const HEADERS = ['Datum', 'Label', 'Onderwerp', 'ID', 'Aangemaakt'];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(+date) && localDate(date) === value;
}
export function parseRows(rows) {
  return rows.filter(row => validDate(row[0] || '') && ['sessie','les'].includes(row[1]) && typeof row[2] === 'string' && row[2].trim()).map(row => ({date:row[0],type:row[1],subject:row[2],id:row[3] || '',createdAt:row[4] || ''}));
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
  constructor(config, getToken, fetcher = fetch) { this.config=config; this.getToken=getToken; this.fetcher=fetcher; }
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
  async read() {
    const result=await this.request(`/values/${this.range('A1:E')}`);
    const rows=result.values || [];
    if (rows.length===0) throw new Error('De spreadsheet is nog niet ingericht. Voeg eerst de kolommen Datum, Label, Onderwerp, ID en Aangemaakt toe.');
    if (!HEADERS.every((header,index)=>rows[0][index]===header)) throw new Error('De kolommen in de spreadsheet zijn gewijzigd. Verwacht: Datum, Label, Onderwerp, ID en Aangemaakt.');
    return parseRows(rows.slice(1));
  }
  async add(entry) {
    if (!validDate(entry.date) || !['sessie','les'].includes(entry.type) || !entry.subject.trim() || entry.subject.length>2000 || !entry.id) throw new Error('Vul een geldige datum, soort en beschrijving in (maximaal 2000 tekens).');
    // Check the stable ID before retrying after an uncertain network response.
    const existing=await this.read();
    if (existing.some(item=>item.id===entry.id)) return;
    await this.request(`/values/${this.range('A:E')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({values:[[entry.date,entry.type,entry.subject,entry.id,entry.createdAt]]})});
  }
}
