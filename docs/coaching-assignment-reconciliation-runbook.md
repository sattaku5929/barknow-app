# コーチ割当の本番整合性修復｜安全な作業手順

更新日: 2026-10-25。**本番データの自動修復は禁止。** DBへの書き込み・既存権限を増やす変更は、対象者と担当コーチの妥当性を管理者が確認した後に実施する。

## 現時点の read-only preflight
本番Supabase project `bkihicvavawchnkdhynj` にて確認:
- 有料契約: 0件 / コーチング申込み: 2件 / チャット: 44件 / オンラインセッション: 3件
- 有効な担当コーチ割当テーブル (`wt_coach_assignments`): **0件**
- コーチ確定済み・現在`assigned`の申込み: **1件**（過去のオンラインセッション3件）
- この申込みの`assigned_coach_id`は存在するユーザーだが、`wt_user_roles.role='admin'`。Coachロールではない。ただし`wt_coach_profiles`は存在する
- 既存の管理者向け割当RPC `wt_admin_assign_customer` / `wt_admin_assign_coaching_application` は`coach`ロールを要求する。管理者兼コーチの場合はそのままでは割当不可
- 別の`closed`申込みは対応中ではないため、古い担当を再作成してはならない
- 安易な再割当やユーザーロール変更により既存のメッセージ・セッションの閲覧範囲が変わり得る

## 実行順序
1. **read-only確認:** 該当する`assigned`申込み、飼い主、愛犬、担当者の関係を管理者本人が確認する。メール・個人情報をCIログやチャットに出力しない
2. **業務上の確認:** 現在も管理者兼コーチが担当する契約か、当時のテスト用担当か、意図的に担当解除されたのか確認。現在の正当な担当でなければレコードを追加しない
3. **回復方法の決定:**
   - 同じ管理者が正当な担当コーチを継続する場合、**AdminロールをCoachロールへ勝手に変更しない**。管理者兼コーチを明示的に扱える管理者専用RPCまたはトランザクションを、検証環境でテストしてから使う
   - 通常のCoachへ切り替える場合、Adminの正式な割当・コーチ受諾・オーナー承認を再実施。以前の確定日時を流用しない
   - 開発用旧契約であれば申込みのクローズを運営承認後に検討（履歴や予約を削除しない）
4. **スナップショット:** 編集前の`wt_coach_assignments`、対象申込み、対象チャット件数、セッション件数、関連RLS／ロール設定を別のアクセス制限付き場所に保全
5. **ローカルテスト:** 割当1件だけを追加する場合も、誤認可、既存メッセージ、予約、ロール切替、Admin兼Coachの受諾・辞退をPGlite/PostgreSQLで検証
6. **本番作業:** 修正対象を一致条件付きで確認し、1トランザクションで実行。影響件数が想定の1件と異なればロールバック
7. **postflight:** 関連テーブルのbefore/after件数、RLS、オーナー・担当者両画面、既存チャット44件と予約3件の保存を確認
8. その後でも**有料会員の強制制限はOFF**のまま。本番決済・返金・解約・契約移行の検証が完了した別承認でのみONにする

## 再検証用のread-only SQL
```sql
select
 (select count(*) from public.wt_coaching_applications where owner_confirmed_at is not null and status in ('assigned','consulting','payment_pending','active')) as active_confirmed_applications,
 (select count(*) from public.wt_coach_assignments) as assignment_rows,
 (select count(*) from public.wt_coaching_applications a
    where a.owner_confirmed_at is not null
      and a.assigned_coach_id is not null
      and a.status in ('assigned','consulting','payment_pending','active')
      and not exists (select 1 from public.wt_coach_assignments ca
        where ca.owner_id=a.owner_id and ca.dog_id=a.dog_id and ca.coach_id=a.assigned_coach_id)
 ) as assignment_mismatches,
 (select count(*) from public.wt_coach_messages) as message_rows,
 (select count(*) from public.wt_online_sessions) as online_session_rows;
```

## 防止策
PR #167のmigrationは初期設定`enforce_paid=false`。
有効化時に確認済みの申込みとコーチ割当が一致しなければ、DBトリガーが設定変更を拒否する。
割当が不一致の場合に、検証用の180日特例権限を自動で与えることも禁止した。

**このドキュメントは修復を実施したという証明ではない。** 運営側で担当者の正当性を確認するまでは本番変更を行わない。
