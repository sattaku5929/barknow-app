# 公式サイト → WanTone → Stripe：会員・契約連携仕様（ドラフト）

## 目的
公式サイトから申込を開始した人のうち、実際に有料契約を保有する人だけにWanToneの「契約・お支払い」導線を表示する。別人の契約を表示・解約できないようにする。

## 現在の構成
- 公式サイト（`sattaku5929/barknow_official`）は現状、静的HTMLで、決済と会員認証のAPIを持たない。
- WanTone（`sattaku5929/barknow-app`）はSupabase Authで会員を認証し、Stripe Checkoutの `client_reference_id` と契約metadataにSupabase `user.id` を設定する実装がある。
- Stripe `checkout.session.completed` webhookで `public.wt_subscriptions` の `user_id` / `stripe_customer_id` / `stripe_subscription_id` に決済結果を書き込む。
- 今回追加した `GET /api/billing/portal` は認証した本人のDBレコードとStripe契約の顧客ID・metadata.user_id・契約状態を照合し、管理できる契約の有無のみ返す。
- `POST /api/billing/portal` は同じ検査と解約可能なPortal設定確認後に、Stripeホストの契約管理URLを生成する。クライアントから顧客ID・契約IDを受け取らない。
- マイページ「契約・お支払い」はGETが `manageable: true` の場合だけ描画し、非契約者に表示しない。

## サイト申込フロー（第1段階）
1. 公式サイト `/app/` の「コーチングのプラン詳細・お申し込み」からWanTone `/plans/coaching` にアクセス。
2. 未ログインのユーザーはWanToneで新規登録・ログイン。アカウントを識別するのはメールアドレスの類似ではなく認証済み `user.id`。
3. WanToneのサーバー側APIが認証済みIDをStripe Checkoutのメタデータへ付与し、Stripeホストの決済画面へ遷移。カード番号はWanToneに保存しない。
4. Webhook署名検証済みイベントが `wt_subscriptions.user_id` に顧客・定期課金契約を紐付ける。
5. 支払い後、同じWanToneアカウントにログインすると契約管理導線が表示される。

**注意**：これは「公式サイトから申込開始 → WanTone認証 → Stripe画面で決済」という構成。公式サイトのドメイン上で直接カード情報や申込フォームを運用する仕様とは異なる。将来、公式サイトに専用のサーバーを構築する場合も、署名付きの短期認証引継ぎ等が必要で、URLに任意の会員IDやメールを付けるだけで紐付けないこと。

## 運用の公開前必須条件
- Stripe `STRIPE_SECRET_KEY` と `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` をサーバー側に設定し、後者の `subscription_cancel.enabled` を有効化。値はGitへコミットしない。
- テスト用Stripe環境で「サイト→ログイン/登録→Checkout→Webhook→マイページ→Portalで解約」を実際の別アカウントでE2E確認。未購入者と他人のIDで操作しても契約にアクセスできないこと。
- **既存 `app/api/stripe/webhook/route.ts` はcheckout完了のみ処理する**。解約・支払失敗・契約更新のイベント連携、権限の停止、課金停止の証跡、遅延リトライを実装・検証する。
- アカウント削除を契約更新中はブロックする追加ガードは、決済停止の代わりにはならない。解約できない場合の問い合わせ・代理対応窓口を整える。
- サイトから決済に進む前に、初回・次回以降の料金、更新周期、解約方法と期限、返金条件、特商法表示、正式版の利用規約・同意を明示する（Draft法務PR #161）。
- 本番有料提供は上記が全て整い、Stripe Billing Portal設定、法務確認、申込導線、Webhook状態同期、セキュリティテストが完了するまで開始しない。

## 技術的な確認事項
- Stripe顧客IDは秘匿値ではないが、APIから無条件で返さない。すべてサーバーが認証済みIDに基づき取得する。
- 既存Stripe Checkoutの metadata.user_id と Webhookによる保存値が一致していることを追跡する。共有メールのみで契約を紐付けない。
- 契約状態・課金履歴・更新処理はStripeを一次情報とし、DB情報は表示・権限制御のために整合性を保つ。
- 最終的な決済事業者をStripe以外にする場合は、この実装をそのまま公開せず、契約IDと本人確認・解約APIの設計を見直す。
