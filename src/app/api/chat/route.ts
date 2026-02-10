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

"Detail" Scenarios: Only show full details (Email, Phone, Notes) if the user explicitly asks for "details" or asks about a specific single record.

Comments / Notes Scenarios: When the user specifically asks for comments, notes, or history for a person or a record, DO NOT use tables. Instead:
- Write a short introductory sentence.
- Then use a Markdown bullet list (one bullet per comment), including only the relevant information (e.g. date, author, and the comment text).
- Avoid showing other fields or dumping the entire record; focus on the comments themselves.

VISUAL REPORTS: When asked for a visual chart or graph, ALWAYS use the \`generateVisualChart\` tool. DO NOT try to make text-based charts. Once the tool returns the data, just add a short 1-sentence analytical comment below it.

AIRTABLE SEARCH RULES (CRITICAL):
Never guess Enum values: For fields with predefined options (like Status), strictly use the exact string provided in the schema options. Do not invent statuses like 'Closed' if the schema says 'Projet fini'.

Case-Insensitive Searching: When writing filterByFormula for text fields (Name, Company, etc.), NEVER use strict equality (=). You MUST use SEARCH(LOWER('query'), LOWER({FieldName})) to ensure case-insensitivity.

Partial Word Matching: If a user searches for a full name (e.g., 'Jean Dupont'), do not search for the exact string. Search for just one strong keyword (e.g., 'Dupont') to avoid word-order issues.

If a search returns 0 results, retry automatically with a shorter, partial keyword before telling the user you found nothing.`;

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
              return `Aucun résultat trouvé dans la table "${table}" pour cette formule. Vérifiez le nom de la table (exactement comme dans le schéma) et la formule. Si 0 résultats, réessaie avec un mot-clé plus court ou partiel (règles AIRTABLE SEARCH RULES).`;
            }

            return JSON.stringify(
              records.map((r) => ({
                id: r.id,
                fields: r.fields as Record<string, unknown>,
              }))
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `Erreur Airtable (table "${table}"): ${msg}. Il peut s'agir d'une erreur de syntaxe dans filterByFormula ou d'un nom de champ incorrect. Corrige la formule (respecte les règles: SEARCH(LOWER('x'), LOWER({Champ})), options exactes pour les select) et réessaie.`;
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

      generateVisualChart: tool({
        description:
          "Use this tool MUST be used when the user asks for a visual chart, pie chart, bar chart, or a dashboard showing the distribution of data (e.g., 'Montre moi un camembert des statuts').",
        inputSchema: z.object({
          table: z
            .enum(["Leads", "Clients", "Projets"])
            .describe("Nom de la table Airtable à analyser (Leads, Clients ou Projets)."),
          chartType: z
            .enum(["pie", "bar"])
            .describe("Type de graphique à générer (camembert ou barres)."),
          groupBy: z
            .string()
            .describe(
              "Nom exact du champ sur lequel regrouper (souvent 'Status', 'Statut' ou 'Secteur')."
            ),
        }),
        execute: async ({ table, chartType, groupBy }) => {
          try {
            const tableInstance = base(table);
            const records = await tableInstance
              .select({
                fields: [groupBy],
                maxRecords: 500,
              })
              .all();

            const counts = new Map<string, number>();

            for (const record of records) {
              const value = record.get(groupBy);

              // Gère les single/multiple select (tableau) ou simple string/number
              const values: string[] = Array.isArray(value)
                ? value.map((v) =>
                    typeof v === "string"
                      ? v
                      : typeof v === "object" && v !== null && "name" in v
                      ? String((v as { name?: unknown }).name ?? "")
                      : String(v)
                  )
                : value == null
                ? []
                : [String(value)];

              for (const v of values) {
                const key = v.trim() || "(Inconnu)";
                counts.set(key, (counts.get(key) ?? 0) + 1);
              }
            }

            const data = Array.from(counts.entries()).map(([name, value]) => ({
              name,
              value,
            }));

            return {
              chartType,
              data,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              chartType,
              data: [],
              error: `Erreur lors du calcul du graphique pour la table \"${table}\" groupée par \"${groupBy}\": ${msg}`,
            };
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
