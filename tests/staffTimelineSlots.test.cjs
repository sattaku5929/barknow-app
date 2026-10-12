/* eslint-disable @typescript-eslint/no-require-imports -- Executes actual page handlers. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=ts.createSourceFile('page.tsx',fs.readFileSync(path.join(__dirname,'../app/page.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n;ts.forEachChild(n,visit);}visit(source);
function handler(name,context){const code=ts.transpileModule(functions[name].getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(context),`${code};return ${name};`)(...Object.values(context));}
function scenario(error=null){
 const state={open:false,calls:[],refreshes:0},context={userRole:'coach',slotCoachId:'',editingSlotId:null,slotDate:'2099-10-15',slotTime:'12:00',slotDuration:30,
  setNotice:v=>state.notice=v,setEditingSlotId:v=>state.edit=v,setSlotDate:v=>state.date=v,setSlotTime:v=>state.time=v,setSlotDuration:v=>state.duration=v,setTimelineSlotDialogOpen:v=>state.open=v,setSaving:v=>state.saving=v,showNotice:v=>state.notice=v,today:()=> '2099-10-15',loadStaffBookingWorkspace:async()=>state.refreshes++,
  supabase:{auth:{getUser:async()=>({data:{user:{id:'coach'}}})},rpc:async(...args)=>{state.calls.push(args);return {error};}}
 };context.resetAvailabilityEditor=handler('resetAvailabilityEditor',context);return {state,context};
}
(async()=>{
 for(const minutes of [0,720,750,1410]){const h=scenario();handler('chooseTimelineTime',h.context)('2099-10-15',minutes);assert.equal(h.state.open,true);assert.equal(h.state.time,`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`);assert.equal(h.state.duration,30);assert.equal(h.state.edit,null);assert.equal(h.state.calls.length,0);}
 let h=scenario();handler('chooseTimelineTime',h.context)('2099-10-15',720);await handler('saveAvailabilitySlot',h.context)({preventDefault(){}});assert.deepEqual(h.state.calls,[['wt_staff_create_availability_slot',{target_coach_id:'coach',next_starts_at:'2099-10-15T03:00:00.000Z',next_ends_at:'2099-10-15T03:30:00.000Z'}]]);assert.equal(h.state.open,false);assert.equal(h.state.refreshes,1);assert.equal(h.state.saving,false);
 h=scenario({message:'overlap'});h.state.open=true;await handler('saveAvailabilitySlot',h.context)({preventDefault(){}});assert.equal(h.state.open,true);assert.equal(h.state.refreshes,0);assert.match(h.state.notice,/overlap/);assert.equal(h.state.saving,false);
 h=scenario();h.context.slotDate='2000-01-01';await handler('saveAvailabilitySlot',h.context)({preventDefault(){}});assert.equal(h.state.calls.length,0);assert.match(h.state.notice,/現在より後/);
 console.log('Timeline selection, noon slot, confirmed registration, failure and past-date checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
