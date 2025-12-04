// ============================================================================
// lib/ai.js - Ollama Integration (No External APIs)
// ============================================================================

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";

// ============================================================================
//  MAIN FUNCTION – OLLAMA ONLY
// ============================================================================
export async function parseUserInstruction({
  dbType,
  userText,
  collections = [],
  previewLimit = 50,
  collectionSchemas = {},
}) {
  try {
    // Check if Ollama is running
    const isRunning = await checkOllamaRunning();
    if (!isRunning) {
      throw new Error(
        "Ollama is not running. Please start it: 'ollama serve' or install from https://ollama.com"
      );
    }

    // Parse with Ollama
    return await parseWithOllama({
      dbType,
      userText,
      collections,
      previewLimit,
      collectionSchemas,
    });
  } catch (error) {
    console.error("❌ Ollama parsing failed:", error.message);
    throw error;
  }
}

// ============================================================================
//  CHECK OLLAMA IS RUNNING
// ============================================================================
async function checkOllamaRunning() {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// ============================================================================
//  OLLAMA INFERENCE
// ============================================================================
async function parseWithOllama({
  dbType,
  userText,
  collections,
  previewLimit,
  collectionSchemas,
}) {
  const systemPrompt = buildSystemPrompt(
    userText,
    collections,
    collectionSchemas
  );

  console.log("🤖 Sending to Ollama (qwen2.5-coder:7b)...");

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 500,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data.response;

    console.log("✅ Ollama response received:", rawText.substring(0, 100));

    return parseJSONResponse(rawText, previewLimit);
  } catch (error) {
    console.error("❌ Ollama request failed:", error);
    throw new Error(`Ollama failed: ${error.message}`);
  }
}

// ============================================================================
//  BUILD SYSTEM PROMPT (Multilingual + Schema Aware)
// ============================================================================
function buildSystemPrompt(userText, collections, collectionSchemas) {
  let schemaContext = "";
  if (Object.keys(collectionSchemas).length > 0) {
    schemaContext = "📊 DATABASE SCHEMA:\n";
    schemaContext += Object.entries(collectionSchemas)
      .map(([name, schema]) => {
        const fields = schema.fields?.join(", ") || "unknown";
        return `- Collection "${name}": fields = [${fields}]`;
      })
      .join("\n");
    schemaContext += "\n\n";
  }

  const availableCollections =
    collections.length > 0
      ? collections.join(", ")
      : Object.keys(collectionSchemas).join(", ") || "users";

  const systemPrompt = `${schemaContext}You are an expert MongoDB query generator with multilingual support (English, Hindi, Marathi, Spanish, French).

🌍 MULTILINGUAL UNDERSTANDING:
- Understand queries in ANY language
- Map language terms to database fields using schema above
- Examples:
  * Hindi: naam/नाम = name, email/ईमेल = email, batao/बताओ = show, sabhi/सभी = all
  * Marathi: नाव = name, ईमेल = email, दाखव = show, सर्व = all
  * English: show, find, get, list, all

🎯 QUERY RULES:
1. Flexible name matching:
   - Use firstName OR lastName for name queries
   - Case-insensitive regex: {"$regex": "^Ram$", "$options": "i"}
   - Partial match: {"$regex": "Ram", "$options": "i"}
2. Map requested fields to schema fields accurately
3. Include projection for specific field requests (e.g., "email only")
4. Always add "_id: 0" to projections unless explicitly requested
5. No full collection deletes without query conditions
6. For counting: use aggregate with $count stage

📋 RESPONSE FORMAT (CRITICAL - MUST BE VALID JSON):
Return ONLY a valid JSON object with NO markdown, NO explanations, NO extra text:

{
  "action": "find",
  "collection": "users",
  "query": {"name": {"$regex": "Ram", "$options": "i"}},
  "options": {
    "limit": 50,
    "sort": {},
    "projection": {"email": 1, "_id": 0}
  }
}

Valid actions: find, insert, update, delete, aggregate

🔍 Available collections: ${availableCollections}

USER QUERY: "${userText}"

Remember: Return ONLY valid JSON, nothing else.`;

  return systemPrompt;
}

// ============================================================================
//  PARSE RAW OLLAMA OUTPUT
// ============================================================================
function parseJSONResponse(rawText, previewLimit) {
  let text = rawText.trim();

  // Remove markdown code blocks if present
  if (text.includes("```")) {
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  // Remove any leading/trailing text before/after JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  try {
    const json = JSON.parse(text);

    // Validate required fields
    if (!json.action) {
      throw new Error("Missing 'action' field in response");
    }
    if (!json.collection) {
      throw new Error("Missing 'collection' field in response");
    }

    // Set defaults
    json.options = json.options || {};
    json.options.limit = json.options.limit || previewLimit;
    json.query = json.query || {};

    console.log("✅ Parsed action:", JSON.stringify(json, null, 2));
    return json;
  } catch (error) {
    console.error("❌ JSON parsing failed:", error.message);
    console.error("Raw text:", text);
    throw new Error(`Failed to parse JSON: ${error.message}. Raw: ${text.substring(0, 100)}`);
  }
}