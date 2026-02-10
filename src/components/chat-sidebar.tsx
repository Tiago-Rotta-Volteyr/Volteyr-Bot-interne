import { createClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";
import Link from "next/link";

export async function ChatSidebar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: chats, error } = await supabase
    .from("chats")
    .select("id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
        <p className="text-sm text-red-600">Erreur: {error.message}</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 p-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" />
          Nouvelle conversation
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {(chats ?? []).map((chat) => (
            <li key={chat.id}>
              <Link
                href={`/c/${chat.id}`}
                className="block rounded-lg px-3 py-2 text-sm text-neutral-700 line-clamp-2 transition hover:bg-neutral-100"
              >
                {chat.title || "Sans titre"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
