import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, weekStart, periodStart, monthDays, moveMonth, isBirthday, isDateKey, scheduleError, eventsOnDate } from "../lib/calendar/model.ts";
test("care periods do not depend on browser timezone; week resets Monday",()=>{
  assert.equal(weekStart("2026-10-11"),"2026-10-05");
  assert.equal(weekStart("2026-10-12"),"2026-10-12");
  assert.equal(periodStart("day","2026-10-07"),"2026-10-07");
  assert.equal(periodStart("month","2026-10-07"),"2026-10-01");
  assert.equal(addDays("2026-12-31",1),"2027-01-01");
});
test("calendar grids cover complete Monday-Sunday weeks, leap years and year changes",()=>{
  for(const date of ["2026-10-01","2024-02-29","2026-12-31","2027-01-01"]){
    const days=monthDays(date);
    assert.equal(days.length%7,0); assert.equal(weekStart(days[0]),days[0]);
    assert.ok(days.includes(date)); assert.ok(days.every(isDateKey));
    for(let i=1;i<days.length;i++)assert.equal(days[i],addDays(days[i-1],1));
  }
  assert.equal(moveMonth("2026-01-31",1),"2026-02-28");
  assert.equal(moveMonth("2024-01-31",1),"2024-02-29");
  assert.equal(moveMonth("2026-01-31",-1),"2025-12-31");
});
test("birthday uses dog profile, not a fabricated observation",()=>{
  assert.equal(isBirthday("2020-10-07","2026-10-07"),true);
  assert.equal(isBirthday("2020-02-29","2026-02-28"),false);
  assert.equal(isBirthday("2020-02-29","2028-02-29"),true);
  assert.equal(isBirthday("","2026-10-07"),false);
});
const event={id:"1",dog_id:"dog",category:"travel",title:"旅行",start_date:"2026-10-07",end_date:"2026-10-09",start_time:null,location:"",note:""};
test("multiday plans include both boundaries and survive sorting without mutation",()=>{
  assert.equal(eventsOnDate([event],"2026-10-07").length,1);
  assert.equal(eventsOnDate([event],"2026-10-09").length,1);
  assert.equal(eventsOnDate([event],"2026-10-10").length,0);
});
test("schedule validation rejects invalid dates, reversed ranges and oversized inputs",()=>{
  assert.equal(scheduleError(event),null);
  for(const change of [{title:" "},{category:"invalid"},{end_date:"2026-10-06"},{start_date:"2026-02-30"},{end_date:"2028-10-07"},{start_time:"25:00"},{note:"a".repeat(2001)}]) assert.ok(scheduleError({...event,...change}));
  assert.equal(scheduleError({...event,start_time:"09:30:00"}),null);
});
