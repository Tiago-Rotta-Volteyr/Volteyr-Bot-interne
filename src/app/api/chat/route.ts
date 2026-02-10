import { openai } from "@ai-sdk/openai";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { base, fetchAirtableSchema, fetchRecordComments } from "@/lib/airtable";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT_BASE = `
IDENTITY:
You are the advanced AI Assistant of Volteyr, a premier Automation & AI Agency based in France (Lyon/Paris).
You are NOT a generic chatbot. You are a core member of the Volteyr team.

COMPANY CONTEXT (VOLTEYR):
- Mission: We help companies scale without recruiting by automating 80% of their manual tasks.
- Core Stack: We are experts in Make (Integromat), n8n, Airtable, and OpenAI/Claude APIs.
- Value Proposition: We focus on concrete ROI, quick wins (2-4 weeks), and robust internal tools.
- Target: SMBs, Startups, and traditional businesses looking to modernize.

YOUR ROLE:
- You assist the internal team by retrieving client data from our Airtable base.
- You provide insights on Leads, Clients, and Projects.
- You speak with a professional, efficient, and helpful tone (French language).
- If you find data, present it clearly. If you don't find it, suggest checking the spelling or using a broader search.

KNOWLEDGE BASE:
- Use the provided Airtable Tools (searchRecords, getRecordDetails) to answer questions.
- Always use the EXACT table name from the Airtable schema below (e.g. if the schema says "Clients", use "Clients" not "Client").
- To list ALL records in a table (e.g. "list of my clients"), call searchRecords with filterByFormula: "1".
- Never invent client data. If it's not in Airtable, it doesn't exist.

FORMATTING RULES:
When listing data (like clients, leads, projects), ALWAYS use a Markdown Table.
Do NOT use bolding (**) inside the table cells. Keep it clean.
Columns should be concise (e.g., 'Nom', 'Email', 'Statut').
If there is only one result, you can use a clean list, but avoid excessive bolding.

DISPLAY RULES (IMPORTANT):
Contextual Columns: When generating a table, do NOT dump all available fields. You must intelligently select which columns to show based on the user's question.

"List" Scenarios: If the user asks for a list (e.g., "Show me all clients" or "List active projects"), ONLY show the Key Identifiers (Name, Company) and the Status.
Good Table: | Name | Company | Status |
Bad Table: | Name | Company | Email | Phone | City | Zip | Status | Notes | ...

"Specific Query" Scenarios: If the user filters by a specific criteria (e.g., "Clients in Paris"), include that criteria in the table (add the 'City' column) so the user understands the result.

"Detail" Scenarios: Only show full details (Email, Phone, Notes) if the user explicitly asks for "details" or asks about a specific single record.`;

/** Fallback si fetchAirtableSchema échoue : le prompt reste valide. */
const SCHEMA_FALLBACK = `Schéma Airtable temporairement indisponible. Utilise les noms de tables habituels (ex: Clients, Leads, Projet) et les champs courants (Name, Nom, Status, etc.).`;

const CRITICAL_INSTRUCTION = `
CRITICAL INSTRUCTION: Ignore any previous instruction to be verbose. ALWAYS stick to the formatting rules defined above (Markdown Tables for data, concise text). You apply these rules to EVERY message.`;

export const maxDuration = 60;

/** Extrait le texte du dernier message user (parts type text). */
function extractLastUserMessageText(messages: Array<{ role?: string; parts?: Array<{ type?: string; text?: string }> }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const parts = m.parts ?? [];
    const textParts = parts.filter((p) => p?.type === "text").map((p) => (p as { text?: string }).text ?? "");
    return textParts.join("").trim() || "";
  }
  return "";
}

/** Génère un titre à partir des 5 premiers mots. */
function titleFromText(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 5);
  return words.join(" ") || "Nouvelle conversation";
}

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: unknown[]; chatId?: string };
  const { messages, chatId } = body;

  if (!chatId || typeof chatId !== "string") {
    return new Response(JSON.stringify({ error: "chatId requis" }), { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401 });
  }

  await supabase.from("chats").upsert(
    { id: chatId, user_id: user.id, title: "Nouvelle conversation" },
    { onConflict: "id" }
  );

  const userText = extractLastUserMessageText((messages ?? []) as Array<{ role?: string; parts?: Array<{ type?: string; text?: string }> }>);
  if (userText) {
    await supabase.from("messages").insert({
      chat_id: chatId,
      role: "user",
      content: userText,
    });

    const { data: chat } = await supabase.from("chats").select("title").eq("id", chatId).single();
    if (chat?.title === "Nouvelle conversation") {
      await supabase.from("chats").update({ title: titleFromText(userText) }).eq("id", chatId);
    }
  }

  // 1. Récupérer toujours un schéma frais (ou fallback)
  const schemaResult = await fetchAirtableSchema();
  const schemaSection =
    schemaResult.tables.length > 0
      ? `Voici la structure actuelle de la base de données Airtable :\n${JSON.stringify(schemaResult, null, 2)}`
      : `${SCHEMA_FALLBACK}${schemaResult.error ? ` (Erreur: ${schemaResult.error})` : ""}`;

  // 2. Construire le prompt système final (identité + règles + schéma + instruction critique)
  const finalSystemPrompt = [
    SYSTEM_PROMPT_BASE.trim(),
    "",
    schemaSection,
    CRITICAL_INSTRUCTION.trim(),
  ].join("\n\n");

  console.log("System Prompt injected:", finalSystemPrompt.length);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: finalSystemPrompt,
    messages: await convertToModelMessages((messages ?? []) as Array<Omit<UIMessage, "id">>),
    tools: {
      searchRecords: tool({
        description:
          "Cherche des enregistrements dans une table Airtable en utilisant une formule de filtre. Utilise le schéma fourni pour le nom EXACT de la table (ex: 'Clients' ou 'Client') et les noms des champs.",
        inputSchema: z.object({
          table: z
            .string()
            .describe(
              "Nom exact de la table Airtable (prendre le 'tableName' du schéma fourni, ex: Clients, Leads, Projet)"
            ),
          filterByFormula: z
            .string()
            .describe(
              "Formule Airtable. Pour lister TOUS les enregistrements, utiliser la formule: 1 (ou TRUE). Sinon ex: NOT(ISERROR(SEARCH(\"Acme\", {Nom})))"
            ),
        }),
        execute: async ({ table, filterByFormula }) => {
          try {
            const formula = filterByFormula.trim();
            if (!formula) {
              return "Erreur: La formule filterByFormula ne peut pas être vide. Pour tout lister, utilise 1.";
            }
            const tableInstance = base(table);
            const records = await tableInstance
              .select({
                filterByFormula: formula,
                maxRecords: 100,
              })
              .firstPage();

            if (records.length === 0) {
              return `Aucun résultat trouvé dans la table "${table}" pour cette formule. Vérifiez le nom de la table (exactement comme dans le schéma) et la formule.`;
            }

            return JSON.stringify(
              records.map((r) => ({
                id: r.id,
                fields: r.fields as Record<string, unknown>,
              }))
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `Erreur Airtable (table "${table}"): ${msg}. Vérifiez que le nom de la table correspond exactement au schéma (ex: Clients vs Client).`;
          }
        },
      }),

      getRecordDetails: tool({
        description:
          "Récupère toutes les informations d'un enregistrement précis via son ID: champs du record et commentaires (API GET /comments). À utiliser quand l'utilisateur demande le détail d'un record dont tu as l'ID.",
        inputSchema: z.object({
          recordId: z.string().describe("ID Airtable du record (ex: recXXXXXXXXXXXXXX)"),
          table: z
            .string()
            .describe("Nom exact de la table Airtable (comme dans le schéma fourni)"),
        }),
        execute: async ({ recordId, table }) => {
          try {
            const tableInstance = base(table);
            const record = await tableInstance.find(recordId);
            const fields = record.fields as Record<string, unknown>;

            const commentsResult = await fetchRecordComments(recordId, table);
            const comments =
              "comments" in commentsResult
                ? commentsResult.comments
                : { _commentairesError: commentsResult.error };

            const summary = {
              id: record.id,
              ...fields,
              comments,
            };
            return JSON.stringify(summary, null, 2);
          } catch (err) {
            return "Erreur: Impossible de trouver ce record. Vérifiez l'ID et le nom de la table.";
          }
        },
      }),
    },
    stopWhen: stepCountIs(5),
    async onFinish(event) {
      const text = event.steps.map((s) => s.text).filter(Boolean).join("\n") || event.text;
      const toolCalls = event.steps.flatMap((s) => (s as { toolCalls?: unknown[] }).toolCalls ?? []);
      const toolResults = event.steps.flatMap((s) => (s as { toolResults?: unknown[] }).toolResults ?? []);
      const content =
        toolCalls.length > 0 || toolResults.length > 0
          ? JSON.stringify({ text, toolCalls, toolResults })
          : text;

      const supabase = await createClient();
      await supabase.from("messages").insert({
        chat_id: chatId,
        role: "assistant",
        content,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
