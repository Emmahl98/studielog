import test from 'node:test';
import assert from 'node:assert/strict';
import {goalColors} from '../goal-colors.js';
const today='2026-11-15',goal={hours:7,deadline:'2026-11-21'};
const data={from:'2026-11-09',to:today,hours:7,monthly:false,points:[{label:'2026-11-14',hours:0},{label:today,hours:2}]};
test('whole periods compare average hours including zero days to daily pace',()=>{
 const colors=goalColors([],goal,data,today);assert.equal(colors.target,1);assert.equal(colors.days,7);assert.equal(colors.status,'green');assert.deepEqual(colors.points.map(p=>p.goalStatus),['orange','green']);
 assert.equal(goalColors([],goal,{...data,hours:6.9},today).status,'orange');
 assert.equal(goalColors([],goal,{...data,from:'2026-11-13',hours:3},today).status,'green');
 assert.equal(goalColors([],goal,{...data,from:today,hours:.5},today).status,'orange');
});
test('no goal, no deadline, overdue and planned goals explain missing colors',()=>{
 for(const g of [null,{hours:10},{hours:10,deadline:'2026-11-14'},{hours:10,startDate:'2026-11-16',deadline:'2026-11-21'}]){const result=goalColors([],g,data,today);assert.ok(result.message);assert.equal(result.status,undefined);}
});
test('completed goals have zero pace and monthly points stay neutral',()=>{
 const result=goalColors([{minutes:600}],goal,{...data,monthly:true,points:[{label:'2026-11',hours:2}]},today);assert.equal(result.status,'green');assert.equal(result.points[0].goalStatus,null);
});
