import type { Metadata } from "next";
import "./globals.css";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { AuthStatus } from "@/components/AuthStatus";

export const metadata: Metadata = {
  title: "teepublic://uploader",
  description: "Local-first batch upload manager for TeePublic",
};

// Apply the saved UI theme before paint to avoid a flash. Mirrors lib/theme.ts;
// kept tiny so it's safe to inline. All themes are dark-structured.
const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem("teepublic.uitheme") || "terminal";
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-grad-soft">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-sm border border-accent-700 bg-ink-800 shadow-glow grid place-items-center text-accent-500 font-bold">
                T
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-accent-400">
                  teepublic<span className="text-zinc-500">://</span>uploader
                </h1>
                <p className="text-xs text-zinc-400">
                  <span className="text-accent-700">$</span> local-first batch upload manager
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AuthStatus />
              <ThemeSwitcher />
              <a
                href="https://www.teepublic.com/design/quick_create"
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
              >
                Open TeePublic
              </a>
            </div>
          </header>
          {children}
          <footer className="mt-12 text-center text-xs text-zinc-500">
            <span className="text-accent-700">{"// "}</span>
            runs entirely on your machine. no data leaves your computer.
          </footer>
        </div>
      </body>
    </html>
  );
}
