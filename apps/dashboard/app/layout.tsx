import type { Metadata } from "next";
import "./globals.css";
import { AuthStatus } from "@/components/AuthStatus";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "TeePublic Uploader",
  description: "Batch upload manager for TeePublic",
};

// Apply the saved light/dark choice before paint to avoid a flash. Default dark.
const themeBootstrap = `
(function(){
  try {
    var m = localStorage.getItem("teepublic.colormode");
    if (m !== "light" && m !== "dark") m = "dark";
    document.documentElement.classList.toggle("dark", m === "dark");
    document.documentElement.style.colorScheme = m;
  } catch (e) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
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
      <body className="min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent-600 grid place-items-center text-white font-bold">
                T
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  TeePublic Uploader
                </h1>
                <p className="text-xs text-zinc-400">
                  Batch upload manager
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
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
            Runs entirely on your machine. No data leaves your computer.
          </footer>
        </div>
      </body>
    </html>
  );
}
