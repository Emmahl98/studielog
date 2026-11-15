import test from 'node:test';
import assert from 'node:assert/strict';
import {displayDate,inputDate} from '../dates.js';
import {validDate} from '../data.js';
test('Dutch display and input dates use fixed day-month-year format',()=>{
 assert.equal(displayDate('2026-01-01'),'01-jan-2026');assert.equal(displayDate('2026-03-09'),'09-mrt-2026');assert.equal(displayDate('2026-10-31'),'31-okt-2026');assert.equal(displayDate('2026-11'),'nov-2026');
 assert.equal(inputDate('01-JAN-2026'),'2026-01-01');assert.equal(inputDate('09-mrt-2026'),'2026-03-09');assert.equal(inputDate(''),'');assert.equal(displayDate('Tobira H6'),'Tobira H6');
 assert.equal(validDate(inputDate('30-feb-2026')),false);
 for(let m=1;m<=12;m++){const iso=`2026-${String(m).padStart(2,'0')}-01`;assert.equal(inputDate(displayDate(iso)),iso);}
});
