// Temporary color-scheme preview. Each card renders with its OWN hardcoded
// colors (inline styles) so it shows true regardless of the global theme.
// Pick one, then it gets applied to globals.css and this page is removed.

interface Scheme {
  name: string;
  bg: string;
  card: string;
  soft: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  btn: string;
}

const SCHEMES: Scheme[] = [
  {
    name: "Ocean Blue",
    bg: "#0f172a", card: "#1e293b", soft: "#243244", border: "#334155",
    text: "#e2e8f0", muted: "#94a3b8", accent: "#3b82f6", accentText: "#60a5fa", btn: "#2563eb",
  },
  {
    name: "Violet",
    bg: "#0f0f17", card: "#1a1a24", soft: "#21212e", border: "#2c2c3a",
    text: "#ececf2", muted: "#9a9aae", accent: "#8b5cf6", accentText: "#a78bfa", btn: "#7c3aed",
  },
  {
    name: "AWS Orange",
    bg: "#16191f", card: "#1f242c", soft: "#262d37", border: "#333b46",
    text: "#e9edf2", muted: "#9aa4b2", accent: "#ff9900", accentText: "#ffb84d", btn: "#ec7211",
  },
  {
    name: "Emerald",
    bg: "#0c1512", card: "#14201b", soft: "#1a2a23", border: "#1f3a30",
    text: "#e6f0ea", muted: "#8fa89a", accent: "#10b981", accentText: "#34d399", btn: "#059669",
  },
  {
    name: "Teal (current)",
    bg: "#0f1219", card: "#161b22", soft: "#1e252e", border: "#333b47",
    text: "#e6eaf0", muted: "#8a95a3", accent: "#14b8a6", accentText: "#2dd4bf", btn: "#0d9488",
  },
  {
    name: "Slate Minimal",
    bg: "#0a0a0b", card: "#161617", soft: "#1d1d1f", border: "#2a2a2d",
    text: "#ededed", muted: "#9a9a9e", accent: "#e5e5e5", accentText: "#cfcfcf", btn: "#3f3f46",
  },
];

function Mockup({ s }: { s: Scheme }) {
  return (
    <div style={{ background: s.bg, borderRadius: 12, padding: 20, border: `1px solid ${s.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ height: 28, width: 28, borderRadius: 8, background: s.btn, color: "#fff",
          display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>T</div>
        <div style={{ color: s.text, fontWeight: 600 }}>{s.name}</div>
      </div>

      <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ color: s.text, fontWeight: 600, marginBottom: 4 }}>Design Configuration</div>
        <div style={{ color: s.muted, fontSize: 13, marginBottom: 14 }}>
          Pick a preset, then override <span style={{ color: s.accentText }}>individual products</span>.
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button style={{ background: s.btn, color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 500 }}>Import</button>
          <button style={{ background: s.soft, color: s.text, border: `1px solid ${s.border}`,
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500 }}>Send to extension</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6,
            background: `${s.accent}22`, color: s.accentText, border: `1px solid ${s.accent}55` }}>9 rows</span>
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6,
            background: "#22c55e22", color: "#4ade80", border: "1px solid #22c55e55" }}>matched</span>
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6,
            background: "#ef444422", color: "#f87171", border: "1px solid #ef444455" }}>2 errors</span>
        </div>

        {["T-Shirt", "Hoodie", "Hats"].map((p, i) => (
          <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${s.border}` }}>
            <span style={{ color: s.text, fontSize: 13 }}>{p}</span>
            <span style={{ background: s.soft, color: s.text, border: `1px solid ${s.border}`,
              borderRadius: 8, padding: "5px 10px", fontSize: 12, minWidth: 110, textAlign: "center" }}>
              {["White", "Heather", "Creme"][i]} ▾
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#000", padding: 24 }}>
      <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
        Color scheme preview
      </h1>
      <p style={{ color: "#9a9a9e", fontSize: 14, marginBottom: 24 }}>
        Each card shows its real colors. Tell me the name of the one you want and I&apos;ll apply it.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
        {SCHEMES.map((s) => <Mockup key={s.name} s={s} />)}
      </div>
    </div>
  );
}
