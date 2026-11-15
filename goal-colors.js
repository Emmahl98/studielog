import {goalSchedule} from './goal-schedule.js';
const dayNumber=date=>{const [y,m,d]=date.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};
export function goalColors(entries,goal,data,today){
 if(!goal)return{message:'Kies eerst een highlight-doel bij Mijn doelen.'};
 const pace=goalSchedule(entries,goal,today);
 if(pace.dailyHours===null||pace.overdue)return{message:'Geef je highlight-doel een geldige deadline om doelkleuren te gebruiken.'};
 if(pace.scheduled)return{message:'De doelkleuren worden actief op de startdatum van je highlight-doel.'};
 const days=Math.max(1,dayNumber(data.to)-dayNumber(data.from)+1),target=pace.dailyHours;
 const status=hours=>hours+1e-9>=target?'green':'orange';
 return{target,days,average:data.hours/days,status:status(data.hours/days),points:data.points.map(p=>({...p,goalStatus:!data.monthly&&/^\d{4}-\d{2}-\d{2}$/.test(p.label)?status(p.hours):null}))};
}
