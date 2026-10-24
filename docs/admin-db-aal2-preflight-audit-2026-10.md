# WanTone 管理者DB AAL2 適用前監査（READ ONLY）

調査日: 2026-10-24 / 本番Supabase: bkihicvavawchnkdhynj
対象: PR #140（`supabase/migrations/20261021150000_admin_mfa_aal2.sql`）
**適用状態: 未適用。このドキュメントは承認・適用を意味しない。**

## 実施した確認

- GitHub PR #140のSQL・関連UI差分を読み取り。
- 本番DBのロール件数: admin **1**, coach **1**, owner **4**（閲覧時）。
- 管理者のTOTP要素: verified **1**, unverified **0**（閲覧時）。
- 本番の `public.wt_is_admin()` は role='admin' のみを判定し、AAL未検査。
- 本番の `public.wt_is_staff()` は role in ('coach','admin') のみを判定し、AAL未検査。
- `wt_is_coach()` はcoachロールのみを判定。
- 現行public RLSポリシー **61** 件、うち `wt_is_admin` を参照するもの **21** 件、`wt_is_staff` の直接参照 **0** 件、`wt_user_roles` の直接参照 **0** 件（静的文字列一致による計数であり意味論的監査ではない）。
- public関数 **231** 件中、定義テキストで `wt_is_admin` がヒット **17** 件、`wt_is_staff` **6** 件、`wt_user_roles` **14** 件（自己参照や文字列コメント等を含む可能性がある。合計数はユニーク件数ではない）。
- `SECURITY DEFINER`を使う管理関連RPCに `wt_admin_set_role`, `wt_admin_accounts`, `wt_admin_assign_customer`, `wt_staff_online_sessions` などが存在する。共通関数の変更は広範囲に影響しうる。
- 適用済みmigration一覧に `20261021150000_admin_mfa_aal2` は存在しない。
- API側PR #146のAAL1/AAL2実認証5ケースはPreviewでPASS、本番にmerge/deploy済。ただしDB/RPCのAAL1/AAL2テストは未実施。

## Supabase Security Advisors（2026-10-24）

| Advisory | 件数 | 解釈 |
|---|---:|---|
| `authenticated_security_definer_function_executable` | 27 | authenticatedから呼べるSECURITY DEFINER関数の点検を要求。すべてが脆弱性と確定した意味ではない |
| `rls_enabled_no_policy` | 5 | RLS有効でポリシーなし。意図したサービスロール専用テーブルを含み得る |
| `extension_in_public` | 1 | publicに`btree_gist`拡張 |
| `auth_leaked_password_protection` | 1 | 漏洩パスワード対策設定の確認推奨 |

参照:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/auth/auth-mfa

## PR #140 の設計と注意点

- `wt_is_admin()`: role='admin' と `auth.jwt()->>'aal'='aal2'` の両方を要求。
- `wt_is_staff()`: coachは従来どおり、adminはAAL2が必要。
- `wt_is_coach()` は変更しない。
- これにより対象ヘルパーを経由するRLS/RPCの境界は強化されるが、raw role参照やヘルパーを使わないSECURITY DEFINER関数、service-role権限使用経路は別途監査必須。
- 単一管理者のTOTP要素が紛失・無効になった際の代替経路が十分に検証されていない。適用後の管理者ロックアウトと運用障害に注意。
- SQLの `SECURITY DEFINER` とsearch_path設定、権限GRANT、対象関数の依存先を、現行関数定義の事前スナップショットと比較して確認すること。

## 本番適用の前提条件と停止条件

1. 本番スモークテスト: 管理者MFAログイン、管理画面、コーチ/オーナー基本導線、Google Calendar statusを実行し記録。
2. 既存関数定義・RLS・GRANT・migration履歴のread-onlyスナップショットを保管。ユーザー情報や機密値は保存しない。
3. 全対象RPC/ポリシー/Storage/APIの権限マトリクスを洗い出す。特に管理者AAL1のすべての特権経路を調べる。
4. 本番から独立したローカル/検証環境でSQL適用、AAL1/AAL2の認可・拒否・リグレッションテストを実施。
5. 紛失端末時の本人確認・要素リセット・再登録・復旧手順を、適切に隔離した非本番環境でリハーサル。
6. 適用・復旧SQLをコードレビューし、単一管理者のロックアウトを回避できる担当者と手順を確定。
7. 想定外のRLS差分、関数差分、データ件数変動、テスト失敗があれば**適用前に停止**。
8. DB適用は別途明示的な承認後、本番事前・事後の比較と監視を伴って実行。

## 今回の変更範囲

**ドキュメントのみ。DB変更・マイグレーション適用・本番RLS変更・PR #140のマージは実施しない。**

記録を更新する場合、テスト日時、対象環境、使用した権限とAAL、期待結果/実測結果を記す。JWT、TOTPコード、秘密鍵、個人情報は記載しない。
