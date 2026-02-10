"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Bot, Loader2, Paperclip, Send, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  searchRecords: "🔍 Recherche dans Airtable en cours...",
  getRecordDetails: "📄 Lecture du dossier en cours...",
  generateVisualChart: "📊 Calcul des statistiques en cours...",
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

const CHART_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a855f7", "#ec4899", "#64748b"];

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: {
  minHeight: number;
  maxHeight?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-full border border-neutral-500 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white hover:border-neutral-400 transition-colors text-xs disabled:opacity-50"
    >
      <span>{label}</span>
    </button>
  );
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
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });

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

  useEffect(() => {
    if (!chatId || typeof window === "undefined") return;
    const pending = sessionStorage.getItem(PENDING_MESSAGE_KEY(chatId));
    if (pending) {
      sessionStorage.removeItem(PENDING_MESSAGE_KEY(chatId));
      sendMessage({ text: pending });
    }
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setInput("");
      adjustHeight(true);
      return;
    }
    sendMessage({ text });
    setInput("");
    adjustHeight(true);
  }

  function handleSuggestionClick(suggestion: string) {
    if (!chatId) {
      startNewChatWithMessage(suggestion);
      return;
    }
    sendMessage({ text: suggestion });
    setInput("");
    adjustHeight(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h2 className="mb-2 text-2xl font-semibold text-neutral-100">
                Que puis-je faire pour vous aujourd'hui ?
              </h2>
              <p className="text-sm text-neutral-400">
                Posez une question sur les clients, leads ou projets Volteyr.
              </p>
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
                    ? "bg-neutral-500 text-white"
                    : "bg-neutral-600 text-neutral-100"
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
                        <div className="markdown-chat text-neutral-100 [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({ children, ...props }) => (
                                <div className="my-3 w-full overflow-x-auto">
                                  <table
                                    className="min-w-full border-collapse border border-neutral-600"
                                    {...props}
                                  >
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({ children, ...props }) => (
                                <th
                                  className="border border-neutral-500 bg-neutral-700 px-3 py-2 text-left text-sm font-medium text-neutral-100"
                                  {...props}
                                >
                                  {children}
                                </th>
                              ),
                              td: ({ children, ...props }) => (
                                <td
                                  className="border border-neutral-500 px-3 py-2 text-sm text-neutral-100"
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
                            ? "bg-neutral-600 text-white"
                            : "bg-neutral-800 border border-neutral-600 text-neutral-100"
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
                          className="flex items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-xs text-neutral-200"
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

                {message.toolInvocations?.map((toolInvocation: any) => {
                  if (toolInvocation.toolName !== "generateVisualChart") return null;

                  const key = `${message.id}-chart-${toolInvocation.toolCallId ?? "0"}`;

                  if (toolInvocation.state !== "result") {
                    return (
                      <div
                        key={key}
                        className="mt-2 rounded-xl border border-neutral-600 bg-neutral-800 px-3 py-2 text-xs text-neutral-200"
                      >
                        📊 Calcul des statistiques en cours...
                      </div>
                    );
                  }

                  const result = toolInvocation.result as {
                    chartType?: string;
                    data?: { name: string; value: number }[];
                    error?: string;
                  };

                  if (!result || !Array.isArray(result.data) || result.data.length === 0) {
                    return (
                      <div
                        key={key}
                        className="mt-2 rounded-xl border border-neutral-600 bg-neutral-800 px-3 py-2 text-xs text-neutral-200"
                      >
                        Aucun résultat à afficher pour ce graphique.
                        {result?.error ? ` (${result.error})` : ""}
                      </div>
                    );
                  }

                  const chartType = result.chartType === "bar" ? "bar" : "pie";

                  return (
                    <div
                      key={key}
                      className="mt-3 rounded-xl border border-neutral-600 bg-neutral-900 px-3 py-3"
                    >
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === "pie" ? (
                            <PieChart>
                              <Pie
                                data={result.data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={2}
                              >
                                {result.data.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend />
                            </PieChart>
                          ) : (
                            <BarChart data={result.data}>
                              <XAxis dataKey="name" />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="value">
                                {result.data.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-600 text-neutral-100">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-xs text-neutral-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Réflexion...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-700 bg-neutral-950 px-4 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <form onSubmit={handleSubmit}>
            <div className="relative rounded-xl border border-neutral-600 bg-neutral-800 shadow-sm focus-within:ring-2 focus-within:ring-neutral-500 focus-within:ring-offset-2 focus-within:ring-offset-neutral-950 focus-within:border-neutral-500">
              <div className="overflow-y-auto">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    adjustHeight();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Votre message..."
                  disabled={isLoading || isCreatingChat}
                  className={cn(
                    "w-full px-4 py-3 resize-none bg-transparent border-none",
                    "text-white text-sm",
                    "focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                    "placeholder:text-neutral-400 placeholder:text-sm",
                    "min-h-[60px] disabled:opacity-50"
                  )}
                  style={{ overflow: "hidden" }}
                />
              </div>
              <div className="flex items-center justify-between p-3 border-t border-neutral-600">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="group p-2 hover:bg-neutral-700 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Paperclip className="w-4 h-4 text-neutral-300" />
                    <span className="text-xs text-neutral-400 hidden group-hover:inline transition-opacity">
                      Joindre
                    </span>
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={isLoading || isCreatingChat || !input.trim()}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm transition-colors border flex items-center gap-1",
                    input.trim()
                      ? "bg-white text-black border-white hover:bg-neutral-200"
                      : "text-neutral-400 border-neutral-600 bg-neutral-700"
                  )}
                >
                  <Send className={cn("w-4 h-4", input.trim() ? "text-black" : "text-neutral-400")} />
                  <span className="sr-only">Envoyer</span>
                </button>
              </div>
            </div>
          </form>

          {isEmpty && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <ActionButton
                  key={suggestion}
                  label={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading || isCreatingChat}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
