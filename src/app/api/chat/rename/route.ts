import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  const body = (await req.json()) as { chatId?: string; title?: string };
  const { chatId, title } = body;

  if (!chatId || typeof chatId !== "string" || !title || typeof title !== "string") {
    return new Response(
      JSON.stringify({ error: "chatId et title requis" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
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

  const { error } = await supabase
    .from("chats")
    .update({ title: title.trim() })
    .eq("id", chatId)
    .eq("user_id", user.id);

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
