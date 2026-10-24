import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261024110000_admin_announcements.sql", import.meta.url), "utf8");
const [admin, owner, coach, other] = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const db = new PGlite();
await db.exec(`create role authenticated;
create role anon;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
create table public.wt_user_roles(user_id uuid primary key, role text not null);
insert into auth.users(id) values ('${admin}'),('${owner}'),('${coach}'),('${other}');
insert into public.wt_user_roles values ('${admin}','admin'),('${owner}','owner'),('${coach}','coach'),('${other}','owner');
create function public.wt_is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='admin')
$$;
grant usage on schema public,auth to authenticated;
grant select on public.wt_user_roles to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.wt_is_admin() to authenticated;
`);
await db.exec(migration);
async function act(id) {
  await db.exec(`reset role; select set_config('app.user_id','${id}',false);set role authenticated;`);
}
async function adminSql(sql, params) {
  await act(admin);
  return db.query(sql, params);
}
const created = await adminSql("insert into public.wt_announcements(title,body,audience,is_published,created_by) values ('Owner message','Welcome','owner',true,$1) returning id", [admin]);
const id = created.rows[0].id;
const future = await adminSql("insert into public.wt_announcements(title,body,audience,is_published,starts_at,created_by) values ('Future','Later','all',true,now()+interval '1 day',$1) returning id", [admin]);
const futureId = future.rows[0].id;
const draft = await adminSql("insert into public.wt_announcements(title,body,audience,is_published,created_by) values ('Draft','Hidden','all',false,$1) returning id", [admin]);
const draftId = draft.rows[0].id;

test("owner sees role-matching published announcements only", async () => {
  await act(owner);
  assert.deepEqual((await db.query("select title from public.wt_announcements order by title")).rows, [{title:"Owner message"}]);
  await assert.rejects(db.query("insert into public.wt_announcements(title,body,audience,created_by) values ('Attack','Attack','all',$1)", [owner]), /row-level security|violates row-level/);
});
test("coach cannot access owner-only, draft or future announcements", async () => {
  await act(coach);
  assert.equal((await db.query("select count(*)::int as n from public.wt_announcements")).rows[0].n, 0);
});
test("read receipts are user-specific and cannot be spoofed", async () => {
  await act(owner);
  await db.query("insert into public.wt_announcement_reads(announcement_id,user_id) values ($1,$2)", [id,owner]);
  await assert.rejects(db.query("insert into public.wt_announcement_reads(announcement_id,user_id) values ($1,$2)", [id,other]), /row-level security|violates row-level/);
  await assert.rejects(db.query("insert into public.wt_announcement_reads(announcement_id,user_id) values ($1,$2)", [draftId,owner]), /row-level security|violates row-level/);
  await act(other);
  assert.equal((await db.query("select count(*)::int as n from public.wt_announcement_reads")).rows[0].n, 0);
  await act(owner);
  assert.equal((await db.query("select count(*)::int as n from public.wt_announcement_reads")).rows[0].n, 1);
});
test("admin can manage drafts and publication, owner cannot publish", async () => {
  await adminSql("update public.wt_announcements set is_published=true where id=$1", [draftId]);
  await act(owner);
  await db.query("update public.wt_announcements set is_published=true where id=$1", [futureId]);
  assert.equal((await db.query("select count(*)::int as n from public.wt_announcements where id=$1",[futureId])).rows[0].n,0);
  await act(admin);
  assert.equal((await db.query("select count(*)::int as n from public.wt_announcements")).rows[0].n,3);
});
