import Modal from "./Modal";
import Icon from "./icons";

export default function ApiModal({ onClose }: { onClose: () => void }) {
  return <Modal title="API reference" onClose={onClose}>
    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest"><Icon name="code" className="h-6 w-6" /></div>
    <p className="text-[10px] font-bold tracking-[0.18em] text-forest">MADE TO FIT YOUR WORKFLOW</p>
    <h2 className="mt-2 text-3xl font-semibold tracking-tight">Meet the API.</h2>
    <p className="mt-3 text-sm leading-6 text-muted">The same simple conversions, from your code. All endpoints use JSON and live under <code className="text-forest">/api</code>.</p>
    <div className="mt-6 space-y-5">
      <section><h3 className="text-sm font-semibold">Encode text</h3><pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-4 font-mono text-[11px] leading-6 text-mint">{'POST /api/base64/encode\n{"text": "Hello, world!"}\n\n→ {"encoded": "SGVsbG8sIHdvcmxkIQ=="}'}</pre></section>
      <section><h3 className="text-sm font-semibold">Decode Base64</h3><pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-4 font-mono text-[11px] leading-6 text-mint">{'POST /api/base64/decode\n{"encoded": "SGVsbG8sIHdvcmxkIQ=="}\n\n→ {"text": "Hello, world!"}'}</pre></section>
      <section className="rounded-lg border border-line p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="lock" />Accounts & private history</h3><p className="mt-2 text-xs leading-6 text-muted">Register at <code>/api/auth/register</code>, then sign in at <code>/api/auth/login</code> with <code>{'{"username": "you", "password": "…"}'}</code>. Pass the returned token as <code>Authorization: Bearer &lt;token&gt;</code>.</p><div className="mt-3 space-y-2 font-mono text-[11px]"><p>POST /api/conversions</p><p className="break-all text-muted">{'{"direction": "encode", "input": "Hello"}'}</p><p>GET /api/conversions?page=1&page_size=10</p><p>DELETE /api/conversions/&#123;id&#125;</p></div></section>
    </div>
    <p className="mt-5 flex items-center gap-2 text-xs text-muted"><Icon name="info" />Base64 is an encoding, not encryption.</p>
  </Modal>;
}
