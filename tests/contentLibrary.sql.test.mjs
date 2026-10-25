import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = await readFile(new URL("../supabase/migrations/20261025140000_content_library.sql",import.meta.url),"utf8");
const owner="11111111-1111-4111-8111-111111111111";
const coach="22222222-2222-4222-8222-222222222222";
const other="33333333-3333-4333-8333-333333333333";
const dog="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const db=new PGlite();
await db.exec(`
create role authenticated; create role anon; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
create table public.wt_user_roles(user_id uuid primary key,role text not null);
create table public.wt_coach_messages(id uuid primary key default gen_random_uuid(),owner_id uuid,dog_id uuid,sender text,body text);
alter table public.wt_coach_messages enable row level security;
create policy owner_send on public.wt_coach_messages for insert to authenticated with check (owner_id=auth.uid() and sender='owner');
create policy coach_send on public.wt_coach_messages for insert to authenticated with check (sender='coach' and exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='coach'));
create policy read_chat on public.wt_coach_messages for select to authenticated using (owner_id=auth.uid() or exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='coach'));
grant usage on schema auth,public to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on wt_user_roles to authenticated;
grant select,insert,update on wt_coach_messages to authenticated;
insert into auth.users values ('${owner}'),('${coach}'),('${other}');
insert into wt_user_roles values ('${owner}','owner'),('${coach}','coach'),('${other}','coach');
`);
await db.exec(migration);
async function as(id){await db.exec("reset role; select set_config('app.user_id','"+id+"',false); set role authenticated;");}
async function root(){await db.exec("reset role; select set_config('app.user_id','',false);");}
async function add(author,sharing){await root();const {rows}=await db.query("insert into wt_content_items(author_id,origin,sharing,format,title,article_body) values ($1,'coach',$2,'article','吠え','練習方法') returning id",[author,sharing]);return rows[0].id;}
const privateId=await add(coach,"private");
const sharedId=await add(coach,"coaches");
test("arbitrary authenticated readers cannot list staff content",async()=>{await as(owner);await assert.rejects(db.query("select * from wt_content_items"),/permission denied/);});
test("owner cannot attach coach content",async()=>{await as(owner);await assert.rejects(db.query("insert into wt_coach_messages(owner_id,dog_id,sender,body,content_id) values ($1,$2,'owner','attack',$3)",[owner,dog,sharedId]),/Only an authenticated coach|Only staff/);});
test("coach can send private own content",async()=>{await as(coach);const {rows}=await db.query("insert into wt_coach_messages(owner_id,dog_id,sender,body,content_id) values ($1,$2,'coach','recommendation',$3) returning id",[owner,dog,privateId]);assert.equal(rows.length,1);});
test("other coach cannot use private but can use shared content",async()=>{await as(other);await assert.rejects(db.query("insert into wt_coach_messages(owner_id,dog_id,sender,body,content_id) values ($1,$2,'coach','private',$3)",[owner,dog,privateId]),/not shared/);const {rows}=await db.query("insert into wt_coach_messages(owner_id,dog_id,sender,body,content_id) values ($1,$2,'coach','shared',$3) returning id",[owner,dog,sharedId]);assert.equal(rows.length,1);});
test("archive blocks new sends but preserves old references",async()=>{await root();await db.query("update wt_content_items set archived_at=now() where id=$1",[sharedId]);await as(coach);await assert.rejects(db.query("insert into wt_coach_messages(owner_id,dog_id,sender,body,content_id) values ($1,$2,'coach','archived',$3)",[owner,dog,sharedId]),/not available/);await root();const {rows}=await db.query("select count(*)::int as n from wt_coach_messages where content_id=$1",[sharedId]);assert.equal(rows[0].n,1);});
test("retiring a coach preserves already sent content",async()=>{await root();await db.query("delete from auth.users where id=$1",[coach]);const {rows}=await db.query("select author_id from wt_content_items where id=$1",[privateId]);assert.equal(rows[0].author_id,null);const x=await db.query("select count(*)::int as n from wt_coach_messages where content_id=$1",[privateId]);assert.equal(x.rows[0].n,1);});