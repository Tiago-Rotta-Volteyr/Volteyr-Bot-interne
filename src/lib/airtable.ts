import Airtable from "airtable";

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

if (!apiKey || !baseId) {
  throw new Error(
    "Missing Airtable config: set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env.local"
  );
}

const base = new Airtable({ apiKey }).base(baseId);

/** Schéma Airtable simplifié (tableName + champs avec options pour singleSelect/multipleSelect) */
export interface SimplifiedAirtableSchema {
  tables: Array<{
    tableName: string;
    fields: Array<
      | { name: string; type: string }
      | { name: string; type: string; options: string[] }
    >;
  }>;
}

interface AirtableMetaChoice {
  name?: string;
  id?: string;
}

interface AirtableMetaField {
  id: string;
  name: string;
  type: string;
  options?: { choices?: AirtableMetaChoice[] };
}

interface AirtableMetaTable {
  id: string;
  name: string;
  fields: AirtableMetaField[];
}

interface AirtableMetaTablesResponse {
  tables: AirtableMetaTable[];
}

const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
let schemaCache: { data: SimplifiedAirtableSchema; expiresAt: number } | null = null;

/**
 * Récupère la structure des tables via l'API Metadata. Cache 5 min. Erreur => { tables: [], error }.
 */
export async function fetchAirtableSchema(): Promise<
  SimplifiedAirtableSchema & { error?: string }
> {
  if (schemaCache && Date.now() < schemaCache.expiresAt) return schemaCache.data;

  const url = `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId!)}/tables`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey!}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return { tables: [], error: `Metadata API: ${res.status} ${text || res.statusText}` };
    }
    const data = (await res.json()) as AirtableMetaTablesResponse;
    const simplified: SimplifiedAirtableSchema = {
      tables: data.tables.map((t) => ({
        tableName: t.name,
        fields: t.fields.map((f) => {
          const baseField = { name: f.name, type: f.type };
          const choices =
            (f.type === "singleSelect" || f.type === "multipleSelect") &&
            Array.isArray(f.options?.choices)
              ? (f.options.choices as AirtableMetaChoice[])
                  .map((c) => c?.name)
                  .filter((n): n is string => typeof n === "string")
              : undefined;
          if (choices && choices.length > 0) {
            return { ...baseField, options: choices };
          }
          return baseField;
        }),
      })),
    };
    schemaCache = { data: simplified, expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS };
    return simplified;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return { tables: [], error: `Metadata: ${message}` };
  }
}

/** Réponse de l'API Airtable List Comments (GET /comments) */
export interface AirtableComment {
  id: string;
  author: { id: string; email: string; name: string };
  text: string;
  createdTime: string;
  lastUpdatedTime: string | null;
  parentCommentId?: string;
  mentioned?: Record<string, { id: string; email: string; displayName: string; type: string }>;
}

export interface AirtableCommentsResponse {
  comments: AirtableComment[];
  offset: string | null;
}

/**
 * Récupère les commentaires d'un record via l'API Comments (GET /comments).
 * Nécessite un Personal Access Token (PAT) dans AIRTABLE_API_KEY.
 */
export async function fetchRecordComments(
  recordId: string,
  tableIdOrName: string
): Promise<{ comments: AirtableComment[] } | { error: string }> {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId!)}/${encodeURIComponent(tableIdOrName)}/${encodeURIComponent(recordId)}/comments`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey!}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      return {
        error:
          "Commentaires non disponibles: l'API Comments exige un Personal Access Token (PAT) dans AIRTABLE_API_KEY.",
      };
    }
    return { error: `Commentaires: ${res.status} ${text || res.statusText}` };
  }

  const data = (await res.json()) as AirtableCommentsResponse;
  return { comments: data.comments };
}

export { base };
