import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </div>
  );
}
