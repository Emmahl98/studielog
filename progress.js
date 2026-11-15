export function validGoal(value){return typeof value==='number' && Number.isFinite(value) && value>0;}
export function studyProgress(entries,goal){
  const minutes=entries.reduce((sum,item)=>sum+(Number.isFinite(item.minutes) && item.minutes>=0?item.minutes:0),0);
  const hours=minutes/60;
  return{minutes,hours,goal:validGoal(goal)?goal:null,ratio:validGoal(goal)?Math.min(hours/goal,1):0,percentage:validGoal(goal)?hours/goal*100:null,remaining:validGoal(goal)?Math.max(goal-hours,0):null};
}
