import test from 'node:test';
import assert from 'node:assert/strict';
import {goalSchedule} from '../goal-schedule.js';
import {validateNamedGoal} from '../goals.js';
const entries=[{date:'2026-11-14',minutes:120},{date:'2026-11-15',minutes:60},{date:'2026-11-17',minutes:600}];
test('optional dates, inclusive days, planned starts and live transition',()=>{
 const goal={hours:10};assert.equal(goalSchedule(entries,goal,'2026-11-15').dailyHours,null);
 assert.equal(goalSchedule(entries,{...goal,deadline:'2026-11-16'},'2026-11-15').dailyHours,3.5);
 const dated={...goal,startDate:'2026-11-16',deadline:'2026-11-20'};
 const planned=goalSchedule(entries,dated,'2026-11-15');assert.equal(planned.scheduled,true);assert.equal(planned.hours,0);assert.equal(planned.dailyHours,2);
 assert.equal(goalSchedule(entries,dated,'2026-11-16').scheduled,false);
 assert.equal(goalSchedule(entries,{...goal,startDate:'2026-11-15'},'2026-11-15').hours,1);
});
test('deadline today, past, completed and daylight saving use calendar days',()=>{
 assert.equal(goalSchedule([],{hours:10,deadline:'2026-11-15'},'2026-11-15').dailyHours,10);
 assert.equal(goalSchedule([],{hours:10,deadline:'2026-11-14'},'2026-11-15').overdue,true);
 assert.equal(goalSchedule(entries,{hours:1,deadline:'2026-11-14'},'2026-11-15').dailyHours,0);
 assert.equal(goalSchedule([],{hours:10,deadline:'2026-03-30'},'2026-03-28').days,3);
});
test('invalid dates and reversed date ranges are rejected',()=>{
 for(const dates of [{startDate:'2026-02-30'},{deadline:'invalid'},{startDate:'2026-11-20',deadline:'2026-11-19'}])assert.throws(()=>validateNamedGoal({id:'id',name:'Doel',hours:10,...dates}));
});
