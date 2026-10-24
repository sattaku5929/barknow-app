# WanTone パスワード再設定メールの日本語化

## Supabase本番へ反映する操作（要ダッシュボード管理者）

Supabase Dashboard → project `bkihicvavawchnkdhynj` → Authentication → Emails → Templates → **Reset Password / Recovery** を選ぶ。

- **Subject（件名）**: `【WanTone】パスワード再設定のご案内`
- **Body（本文）**: `supabase/templates/recovery.html` の内容全体をコピーして、HTMLテンプレート欄に貼り付ける。
- 内容を確認して保存する。確認メールや招待メールなど、**別のテンプレートを上書きしない**。
- Supabaseのアプリ内プレビューがあれば確認する。

テンプレート内の `{{ .ConfirmationURL }}` は**Supabaseが生成する再設定用リンク**。手作業で `https://barknow-app.vercel.app` に置換しない。リンクに必要な検証情報が失われる。

## 反映後の検証

1. ログインではなくPreviewの `/auth/forgot-password` から登録済みテストメール宛へ送信。
2. 件名が日本語、差出人が意図したアドレスであることを確認。
3. メールが日本語で表示され、WanTone/BarKnow表記とCTA、リンクの見た目が崩れていないことをPCとスマホで確認。
4. メールのリンクがPreviewの `/auth/reset-password` に到達し、パスワード変更後の再ログインと旧パスワード拒否を確認。
5. メール内の認証リンク、コード、パスワードはスクショ・ログ・Issueに記載しない。
6. 不一致やエラーが出たらPR #151のマージは保留。

## 差出人の信頼性

メール本文・件名だけでなく、差出人表示・送信元ドメインも受信者の安心感に影響する。
現在使用する送信サービス／SMTP／差出人アドレスの確認が必要で、このテンプレート追加だけでは差出人は変わらない。
独自ドメインとSPF/DKIM/DMARCを用意できれば運用時の到達性・なりすまし対策にも役立つが、コストを伴う導入は別途判断する。

Supabaseドキュメント: https://supabase.com/docs/guides/auth/auth-email-templates
