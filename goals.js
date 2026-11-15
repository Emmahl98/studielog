import {validGoal} from './progress.js';
import {validDate} from './data.js';
export const GOAL_HEADERS=['ID','Naam','Doeluren','Status','Aangemaakt','Bijgewerkt','Gearchiveerd op','Uren bij archiveren','Startdatum','Deadline'];
const statuses=['actief','gearchiveerd','verwijderd'];
export function validateNamedGoal(goal){
  if(typeof goal.id!=='string'||!goal.id||typeof goal.name!=='string'||!goal.name.trim()||goal.name.trim().length>100||!validGoal(goal.hours))throw new Error('Vul een naam (maximaal 100 tekens) en een urendoel groter dan 0 in.');
  if((goal.startDate&&!validDate(goal.startDate))||(goal.deadline&&!validDate(goal.deadline)))throw new Error('Vul geldige datums in.');
  if(goal.startDate&&goal.deadline&&goal.startDate>goal.deadline)throw new Error('De deadline mag niet vóór de startdatum liggen.');
}
export function parseGoals(rows){
  return rows.map((row,index)=>({row,index})).filter(({row})=>row.some(value=>value!==''&&value!==null&&value!==undefined)).map(({row,index})=>{
    const goal={id:String(row[0]??''),name:String(row[1]??''),hours:Number(row[2]),status:row[3],createdAt:row[4]||'',updatedAt:row[5]||'',archivedAt:row[6]||'',archivedHours:row[7]===undefined||row[7]===''?null:Number(row[7]),rowNumber:index+2};
    goal.startDate=row[8]||'';goal.deadline=row[9]||'';
    validateNamedGoal(goal);
    if(!statuses.includes(goal.status)||(goal.archivedHours!==null&&(!Number.isFinite(goal.archivedHours)||goal.archivedHours<0)))throw new Error('Een doel in Google Sheets bevat ongeldige gegevens.');
    return goal;
  });
}
export class GoalsStore{
  constructor(sheets,now=()=>new Date().toISOString()){this.sheets=sheets;this.now=now;}
  range(value){return encodeURIComponent(`'Doelen'!${value}`);}
  async readHighlight(){const result=await this.sheets.request(`/values/${encodeURIComponent("'Instellingen'!A3:B3")}?valueRenderOption=UNFORMATTED_VALUE`);if(result.values?.[0]?.[0]!=='HighlightDoelID')throw Error('De highlight-instelling in Google Sheets ontbreekt.');return String(result.values[0][1]||'');}
  async setHighlight(id){if(id){const goal=await this.find(id);if(goal.status!=='actief')throw Error('Kies een actief doel als highlight.');}await this.readHighlight();await this.sheets.request(`/values/${encodeURIComponent("'Instellingen'!B3")}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[[id]]})});}
  async read(){
    const result=await this.sheets.request(`/values/${this.range('A1:J')}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows=result.values||[];
    if(!GOAL_HEADERS.every((header,index)=>rows[0]?.[index]===header))throw new Error('De kolommen in het tabblad Doelen zijn gewijzigd.');
    return parseGoals(rows.slice(1));
  }
  values(goal){return[goal.id,goal.name.trim(),goal.hours,goal.status,goal.createdAt,goal.updatedAt,goal.archivedAt||'',goal.archivedHours??'',goal.startDate||'',goal.deadline||''];}
  async find(id,includeRemoved=false){
    const matches=(await this.read()).filter(goal=>goal.id===id);
    if(matches.length!==1)throw new Error(matches.length?'Dit doel-ID staat dubbel in Google Sheets.':'Dit doel is niet meer gevonden. Vernieuw het overzicht.');
    if(matches[0].status==='verwijderd'&&!includeRemoved)throw new Error('Dit doel is al verwijderd.');
    return matches[0];
  }
  async create(goal){
    validateNamedGoal(goal);
    const matches=(await this.read()).filter(item=>item.id===goal.id);
    if(matches.length>1)throw new Error('Dit doel-ID staat dubbel in Google Sheets.');
    if(matches.length===1){if(matches[0].status==='verwijderd')throw new Error('Dit doel is al verwijderd.');return;}
    const now=this.now();
    await this.sheets.request(`/values/${this.range('A:J')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({values:[this.values({...goal,status:'actief',createdAt:now,updatedAt:now})]})});
  }
  async write(goal){
    await this.sheets.request(`/values/${this.range(`A${goal.rowNumber}:J${goal.rowNumber}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[this.values(goal)]})});
  }
  async update(goal){
    validateNamedGoal(goal);
    const current=await this.find(goal.id);
    await this.write({...current,name:goal.name,hours:goal.hours,startDate:goal.startDate||'',deadline:goal.deadline||'',updatedAt:this.now()});
  }
  async setStatus(id,status,hours){
    if(!statuses.includes(status))throw new Error('Ongeldige doelstatus.');
    if(status==='gearchiveerd'&&(!Number.isFinite(hours)||hours<0))throw new Error('De gemaakte uren konden niet worden bepaald.');
    const goal=await this.find(id,true);const now=this.now();
    if(goal.status===status)return;
    if(goal.status==='verwijderd')throw new Error('Dit doel is al verwijderd.');
    await this.write({...goal,status,updatedAt:now,archivedAt:status==='gearchiveerd'?now:status==='actief'?'':goal.archivedAt,archivedHours:status==='gearchiveerd'?hours:status==='actief'?null:goal.archivedHours});
  }
}
