"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Bot, Loader2, Send, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  searchRecords: "🔍 Recherche dans Airtable en cours...",
  getRecordDetails: "📄 Lecture du dossier en cours...",
};

const SUGGESTIONS = [
  "Liste mes clients",
  "Chercher un lead",
  "Quels sont les projets en cours ?",
  "Donne-moi les détails d'un client",
];

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "Traitement en cours...";
}

function isToolPart(part: { type: string }): part is { type: string; state?: string; toolCallId: string } {
  return part.type.startsWith("tool-");
}

interface ChatProps {
  chatId?: string;
  initialMessages?: UIMessage[];
}

const PENDING_MESSAGE_KEY = (id: string) => `pendingMessage:${id}`;

export function Chat({ chatId, initialMessages }: ChatProps) {
  const [input, setInput] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ chatId: chatId ?? "" }),
      }),
    [chatId]
  );

  const { messages, sendMessage, status } = useChat({
    id: chatId ?? undefined,
    messages: initialMessages,
    transport,
    onFinish() {
      if (chatId) {
        window.dispatchEvent(new CustomEvent("chat-created"));
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send pending message when landing on /c/[id] with a message stored from home
  useEffect(() => {
    if (!chatId || typeof window === "undefined") return;
    const pending = sessionStorage.getItem(PENDING_MESSAGE_KEY(chatId));
    if (pending) {
      sessionStorage.removeItem(PENDING_MESSAGE_KEY(chatId));
      sendMessage({ text: pending });
    }
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when chatId is set, sendMessage is stable

  async function startNewChatWithMessage(text: string) {
    if (!text.trim() || isCreatingChat) return;
    setIsCreatingChat(true);
    const newId = crypto.randomUUID();
    try {
      const res = await fetch("/api/chat/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: newId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Erreur lors de la création");
      }
      sessionStorage.setItem(PENDING_MESSAGE_KEY(newId), text);
      window.dispatchEvent(new CustomEvent("chat-created"));
      router.push(`/c/${newId}`);
      setInput("");
    } catch (err) {
      console.error(err);
      // Could show a toast here
    } finally {
      setIsCreatingChat(false);
    }
  }

  function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    if (!chatId) {
      startNewChatWithMessage(text);
      return;
    }
    sendMessage({ text });
    setInput("");
  }

  function handleSuggestionClick(suggestion: string) {
    if (!chatId) {
      startNewChatWithMessage(suggestion);
      return;
    }
    setInput(suggestion);
    sendMessage({ text: suggestion });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h2 className="mb-2 text-2xl font-semibold text-neutral-800">
                Que puis-je faire pour vous aujourd'hui ?
              </h2>
              <p className="mb-8 text-sm text-neutral-500">
                Posez une question sur les clients, leads ou projets Volteyr.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    disabled={isLoading || isCreatingChat}
                    className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:border-neutral-300 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "flex-row-reverse" : ""
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  message.role === "user"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-200 text-neutral-600"
                )}
              >
                {message.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    const content =
                      message.role === "assistant" ? (
                        <div className="markdown-chat text-neutral-800 [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                            table: ({ children, ...props }) => (
                              <div className="my-3 w-full overflow-x-auto">
                                <table
                                  className="min-w-full border-collapse border border-neutral-300"
                                  {...props}
                                >
                                  {children}
                                </table>
                              </div>
                            ),
                            th: ({ children, ...props }) => (
                              <th
                                className="border border-neutral-300 bg-neutral-100 px-3 py-2 text-left text-sm font-medium text-neutral-800"
                                {...props}
                              >
                                {children}
                              </th>
                            ),
                            td: ({ children, ...props }) => (
                              <td
                                className="border border-neutral-300 px-3 py-2 text-sm text-neutral-800"
                                {...props}
                              >
                                {children}
                              </td>
                            ),
                          }}
                          >
                            {part.text}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        part.text
                      );
                    return (
                      <div
                        key={`${message.id}-text-${i}`}
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm",
                          message.role === "user"
                            ? "bg-neutral-900 text-white"
                            : "bg-white border border-neutral-200 text-neutral-800 shadow-sm"
                        )}
                      >
                        {content}
                      </div>
                    );
                  }

                  if (isToolPart(part)) {
                    const state = "state" in part ? part.state : undefined;
                    const toolName = part.type.replace(/^tool-/, "");
                    if (state !== "output-available" && state !== "output-error") {
                      return (
                        <div
                          key={`${message.id}-tool-${part.toolCallId}`}
                          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {getToolLabel(toolName)}
                        </div>
                      );
                    }
                    return null;
                  }

                  return null;
                })}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Réflexion...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="flex gap-2 rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm focus-within:ring-2 focus-within:ring-neutral-400 focus-within:ring-offset-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Votre message..."
              disabled={isLoading || isCreatingChat}
              className="flex-1 bg-transparent px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || isCreatingChat || !input.trim()}
              className="flex items-center justify-center rounded-r-xl bg-neutral-900 px-4 text-white transition hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
