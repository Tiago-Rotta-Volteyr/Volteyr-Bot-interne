import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { chatId?: string };
  const { chatId } = body;

  if (!chatId || typeof chatId !== "string") {
    return new Response(JSON.stringify({ error: "chatId requis" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("chats").upsert(
    { id: chatId, user_id: user.id, title: "Nouvelle conversation" },
    { onConflict: "id" }
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
