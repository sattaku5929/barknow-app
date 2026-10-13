/** Keep Auth errors actionable without exposing backend details or account lookup results. */
export function authErrorMessage(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: string; message?: string; status?: number; name?: string } : {};
  const code = value.code ?? "";
  const message = (value.message ?? "").toLowerCase();
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "メールアドレスの確認がまだ完了していません。確認メール内のリンクを開いてからログインしてください。";
  if (["user_already_exists", "email_exists"].includes(code) || message.includes("already registered") || message.includes("already been registered")) return "このメールアドレスは登録済みです。「ログイン」からお進みください。";
  if (code === "invalid_credentials" || message.includes("invalid login")) return "メールアドレスまたはパスワードが違います。";
  if (["email_address_invalid", "validation_failed"].includes(code) && message.includes("email") || message.includes("invalid email")) return "メールアドレスの形式を確認してください。";
  if (code === "weak_password" || message.includes("password")) return "パスワードは8文字以上で設定してください。英字・数字・記号を組み合わせてお試しください。";
  if (value.status === 429 || code.startsWith("over_") || message.includes("rate limit") || message.includes("too many requests")) return "送信回数が上限に達したか、送信間隔が短すぎます。しばらく待ってから再度お試しください。";
  if (code === "email_address_not_authorized" || message.includes("sending") || message.includes("smtp")) return "確認メールを送信できませんでした。時間をおいて再度お試しください。届かない場合は運営へお問い合わせください。";
  if (value.name === "AuthRetryableFetchError" || error instanceof TypeError || message.includes("fetch") || message.includes("network")) return "通信できませんでした。ネットワーク接続を確認して、再度お試しください。";
  return "認証手続きを完了できませんでした。時間をおいて再度お試しください。解決しない場合は運営へお問い合わせください。";
}
