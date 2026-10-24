# WanTone × Stripe 月額会員：テストモード検証手順

> 2026-10-25 / 本番課金・本番顧客への操作は禁止。これはテスト実施手順であり、現時点で実際のStripe E2E完了を示すものではない。

## 前提
- 公式サイト → WanTone `/plans/coaching` でログイン／新規登録 → Stripe Checkout → Webhookによる会員紐付け → マイページ `契約・お支払い` → Billing Customer Portalで解約。無料診断は必須ではない。
- 本番Vercelで確認した環境変数一覧には`STRIPE_SECRET_KEY`、`STRIPE_COACHING_PRICE_ID`、`STRIPE_WEBHOOK_SECRET`が存在せず、現時点では決済未設定（管理画面変更後は再確認）。
- `GET /api/stripe/checkout` は決済利用可否、Stripeから取得した月額（JPY）と税の扱いを返す。Previewではテスト用キー以外を拒否。
- 現在の `wt_subscriptions` はユーザーID単位の契約1件とStripe IDを管理。無料診断やコーチの割当では課金契約とみなさない。

## Stripe接続と環境分離
1. Stripeアカウントを開き「テストモード」で定期課金の商品・月額JPY価格を作成。実際の月額料金・税込／税別・初月割引の設定を確認。
2. Billing Customer Portalで解約を有効化（解約時の即時終了・期間末終了などの設定も確定）。
3. **Previewにはsk_test_で始まるキーのみ**登録。Vercel Previewへ `STRIPE_SECRET_KEY`、`STRIPE_COACHING_PRICE_ID`、`STRIPE_WEBHOOK_SECRET` をそれぞれ設定。シークレットをGitHub・チャット・クライアント側環境変数へ貼り付けない。
4. **テスト決済と本番の個人データを混ぜない**。Previewと本番で同じSupabaseプロジェクトを共有する場合は、Stripeテスト支払いの結果が本番DB `wt_subscriptions` に記録されるので、原則として別の検証用Supabaseプロジェクト／検証用データベースを用意し、安全なサンドボックスとして接続する。DB変更時は既存の承認済み手順を守る。
5. StripeにPreview向けの署名付きWebhook endpoint `https://<preview-host>/api/stripe/webhook` を登録し、`checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted` を購読する。失敗課金時の `invoice.payment_failed` による会員権限更新は**現コードで未対応**、追加設計・試験が必要。
6. 公開予定のプラン価格・契約主体・特商法表示・自動更新・解約期限・返金条件は法務PR #161で確定するまで本番申込みを開始しない。

## シナリオと期待結果
| ID | ケース | 期待結果 |
|---|---|---|
| A | Stripe未設定のPreview | `/api/stripe/checkout` は `{available:false}`、申込ボタンは押せない |
| B | Previewに本番用Stripeキーを設定した場合 | 月額プランは利用不可。誤課金しない |
| C | 未ログインで申込APIを実行 | 401。会員ID・Stripe IDを取得できない |
| D | 他のユーザーIDを送信 | 403。別ユーザーの契約を開始できない |
| E | 無料会員のマイページ | 契約・お支払いメニューを表示しない |
| F | テスト契約初回申込み | Stripe Checkoutでテスト決済、`wt_subscriptions.user_id` に本人ID、顧客ID・契約IDを紐付け |
| G | 決済が完了しているがWebhookのDB更新待ち | 二重申込みを防ぎ、完了後に契約を有効化 |
| H | 契約中ユーザーのマイページ | 本人の契約管理メニューが表示される |
| I | 契約中ユーザーの管理画面 | 他人ではなく本人のStripe Portalを発行する |
| J | Billing Portalで期間末解約を予約 | 期間末までは契約状態を確認可能、期間末にcanceledへ同期 |
| K | 解約済み／失効ユーザー | 契約管理は非表示、必要に応じ問合せへ案内 |
| L | 契約中にアカウント削除を要求 | 409で中止。先に解約・請求停止を促す |
| M | Checkoutがopenまたは決済反映待ちの状態で削除 | 409で中止。孤立した継続請求を防ぐ |
| N | Stripe顧客ID・会員ID・Priceが不一致 | Webhookはエラーを記録し、有料権限を付与しない |
| O | Webhookを同一IDで再送 | 重複会員登録・通知を行わない |
| P | 支払失敗、再試行、解約直後、ブラウザ中断 | 手動・自動で権限と請求を照合し不整合がないことを確認。**自動反映の完全性は未検証** |

## 実行前・リリース判断
- [ ] PreviewのみでStripeテストキーが有効、Stripe Checkoutの月額JPY価格が正しく表示される
- [ ] Stripe Portalから解約が可能で、決済方法変更・返金・解約期限の表示も運用に一致
- [ ] 安全な検証用Supabaseで本人確認から退会までE2Eを完走
- [ ] Webhook購読、署名検証、再試行、料金変更、同時申込み、支払失敗の全分岐を検証
- [ ] 本番料金・キャンペーン・最終確認画面・特商法表示・規約・プライバシーを弁護士等と確認
- [ ] 検証用契約をキャンセルし、検証データとログを点検
- [ ] 公式サイトPR #38／アプリPR #163／法務PR #161 の公開順を決め、正式ローンチ前にまとめて整合検証する

**重要：実際のStripeアカウント接続とPreviewへのテスト用設定がない限り、テストカードによる実課金フローは検証できません。**
