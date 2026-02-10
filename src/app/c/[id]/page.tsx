import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { ChatLayout } from "@/components/chat-layout";

function parseAssistantContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return typeof parsed.text === "string" ? parsed.text : content;
  } catch {
    return content;
  }
}

function dbMessagesToUIMessages(
  rows: Array<{ id: string; role: string; content: string }>
): Array<{ id: string; role: "user" | "assistant"; parts: Array<{ type: "text"; text: string }> }> {
  return rows.map((row) => {
    const text =
      row.role === "assistant" ? parseAssistantContent(row.content) : row.content;
    return {
      id: row.id,
      role: row.role as "user" | "assistant",
      parts: [{ type: "text" as const, text }],
    };
  });
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chatId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("id, title")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .single();

  if (chatError || !chat) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  const initialMessages = dbMessagesToUIMessages(messages ?? []);

  return (
    <ChatLayout headerTitle={chat.title || "Assistant Volteyr"}>
      <Chat chatId={chatId} initialMessages={initialMessages} />
    </ChatLayout>
  );
}
