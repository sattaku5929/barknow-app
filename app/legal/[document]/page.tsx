import Link from "next/link";
import { notFound } from "next/navigation";
import { legalDocuments } from "@/lib/legalDocuments";

export function generateStaticParams() {
  return [{ document: "disclaimer" }, { document: "terms" }, { document: "privacy" }];
}

export default async function LegalDocumentPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (document !== "disclaimer" && document !== "terms" && document !== "privacy") notFound();
  const doc = legalDocuments[document];
  return (
    <main style={{ background: "#f9fafb", color: "#23372c", minHeight: "100vh", padding: "36px 18px" }}>
      <div style={{ maxWidth: 790, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#008661", textDecoration: "none", fontWeight: 700 }}>← WanToneへ戻る</Link>
        <header style={{ padding: "36px 0 22px" }}>
          <p style={{ color: "#008661", letterSpacing: "0.15em", fontSize: 12, fontWeight: 700 }}>{doc.eyebrow}</p>
          <h1 style={{ fontSize: "clamp(28px, 6vw, 40px)", margin: "10px 0 16px" }}>{doc.title}</h1>
          <p style={{ fontSize: 13, color: "#667469" }}>改訂草案（施行日は公開時に確定）</p>
          <p role="status" style={{ background: "#eef5f1", borderRadius: 12, padding: 16, fontSize: 13 }}>運営者情報・課金解約条件等の確認前の草案です。正式な契約文書としての公開前に法務確認が必要です。</p>
        </header>
        <div style={{ background: "#fff", border: "1px solid #e4eae6", borderRadius: 20, padding: "clamp(20px, 4vw, 36px)" }}>
          {doc.sections.map(section => <section key={section.heading} style={{ paddingBottom: 24, marginBottom: 25, borderBottom: "1px solid #e4eae6" }}>
            <h2 style={{ fontSize: 17, lineHeight: 1.5, marginBottom: 10 }}>{section.heading}</h2>
            <p style={{ fontSize: 14, lineHeight: 2, margin: 0, whiteSpace: "pre-line" }}>{section.body}</p>
          </section>)}
        </div>
        <nav aria-label="その他の規約" style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "25px 0" }}>
          <Link href="/legal/disclaimer" style={{ color: "#008661" }}>免責事項</Link>
          <Link href="/legal/terms" style={{ color: "#008661" }}>利用規約</Link>
          <Link href="/legal/privacy" style={{ color: "#008661" }}>プライバシーポリシー</Link>
        </nav>
      </div>
    </main>
  );
}
