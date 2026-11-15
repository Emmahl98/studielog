import {studyProgress} from './progress.js';
import {localDate} from './data.js';
const dayNumber=date=>{const [y,m,d]=date.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};
export function goalSchedule(entries,goal,today=localDate()){
  const start=goal.startDate||'',deadline=goal.deadline||'';
  const progress=studyProgress(entries.filter(entry=>(!start||entry.date>=start)&&entry.date<=today),goal.hours);
  const scheduled=!!start&&start>today;
  const from=scheduled?start:today;
  const days=deadline?Math.max(0,dayNumber(deadline)-dayNumber(from)+1):null;
  return {...progress,scheduled,days,overdue:!!deadline&&deadline<today,dailyHours:days===null?null:progress.remaining===0?0:days>0?progress.remaining/days:null};
}
