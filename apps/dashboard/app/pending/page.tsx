import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PendingPage() {
  const { user, profile } = await getSessionProfile();
  const email = user?.email ?? profile?.email ?? "your account";
  const signedUpAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
    : null;

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-lg">
        {/* Animated status badge */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-warn-500/20 blur-2xl animate-pulse" />
            <div className="relative h-20 w-20 rounded-full border border-warn-500/40 bg-ink-900/70 grid place-items-center shadow-card">
              <HourglassIcon />
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="surface p-7 text-center space-y-5">
          <div className="space-y-2">
            <span className="chip-warn">Awaiting approval</span>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Your account is pending
            </h1>
            <p className="text-sm text-zinc-400">
              Signed in as{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-200 break-all">{email}</span>
              {signedUpAt && (
                <>
                  {" "}· requested{" "}
                  <span className="text-zinc-300">{signedUpAt}</span>
                </>
              )}
            </p>
          </div>

          <div className="surface-soft p-4 text-left text-sm text-zinc-300 space-y-2">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">What happens next</p>
            <ul className="space-y-1.5 text-zinc-400">
              <li className="flex gap-2">
                <span className="text-accent-400 mt-0.5">→</span>
                An administrator reviews new sign-ups and approves access.
              </li>
              <li className="flex gap-2">
                <span className="text-accent-400 mt-0.5">→</span>
                Once approved, you&apos;ll land directly on the uploader after your
                next sign-in.
              </li>
              <li className="flex gap-2">
                <span className="text-accent-400 mt-0.5">→</span>
                Already approved? Sign out and back in to refresh your session.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 justify-center pt-1">
            <SignOutButton className="btn-primary" />
            <Link href="/login" className="btn-ghost">
              Back to sign in
            </Link>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-zinc-500">
          Need help? Contact the workspace administrator who invited you.
        </p>
      </div>
    </div>
  );
}

function HourglassIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-9 w-9 text-warn-500"
      aria-hidden
    >
      <path d="M6 2h12" />
      <path d="M6 22h12" />
      <path d="M6 2v4a6 6 0 0 0 12 0V2" />
      <path d="M6 22v-4a6 6 0 0 1 12 0v4" />
    </svg>
  );
}
