import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-neutral-100">
          Connexion
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
