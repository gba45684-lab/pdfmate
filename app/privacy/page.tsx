import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy notice", description: "How PDFMate handles your files and data." };

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <Link href="/" className="text-sm font-semibold text-violet-700">← Back to PDFMate</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">Privacy notice</h1>
        <p className="mt-2 text-sm text-slate-500">Plain-language summary of what happens to your files and data.</p>

        <Section title="Files processed in your browser">
          <p>Most tools (merge, split, extract, delete, rotate, reorder, crop, resize, watermark, page numbers, sign, edit, forms, flatten, redact, images, PDF to images, text extraction) run entirely in your browser. These files are not uploaded to PDFMate.</p>
        </Section>

        <Section title="Tools that send data to a server">
          <p><strong>Optimize, Protect and Office to PDF</strong> send the file you choose, over HTTPS, to the PDFMate worker. The worker processes it in a temporary folder, returns the result and deletes the temporary files immediately after each request. Files are not kept. For Protect, the password you enter is sent with the file and is not stored or logged.</p>
          <p><strong>AI PDF</strong> sends the text extracted from your PDF and your question to an AI provider (OpenRouter and the underlying model provider) to generate an answer. Do not use it for documents you are not allowed to share with those providers. Their own terms and privacy policies apply.</p>
          <p><strong>OCR</strong> runs entirely in your browser using engine and language files served by PDFMate itself. Your document is not uploaded and no third-party download is involved.</p>
        </Section>

        <Section title="Accounts and cloud files (optional)">
          <p>You can use PDFMate without an account. If you sign in with an email link, we store your email address and a session cookie through our authentication provider (Supabase). If you choose to save a document to the cloud, the file and its name and size are stored in a private area that only your account can access. You can delete any saved document in the app, which also deletes the stored file.</p>
        </Section>

        <Section title="On your device">
          <p>PDFMate stores a short list of recently used tools in your browser&apos;s local storage, and caches static app files (not your documents or account data) so the app loads faster. You can clear this at any time by clearing site data in your browser.</p>
        </Section>

        <Section title="What we don&apos;t do">
          <p>PDFMate&apos;s code contains no advertising or third-party analytics trackers, and we do not sell your data. Our hosting providers may keep standard server logs (such as IP address and request time) for security and reliability.</p>
        </Section>

        <Section title="Your choices and contact">
          <p>You can use the browser-only tools without signing in, delete cloud files at any time, and ask us to delete your account data.{contact ? <> Contact: <a className="font-semibold text-violet-700 underline" href={"mailto:" + contact}>{contact}</a>.</> : null}</p>
        </Section>
      </article>
    </main>
  );
}
