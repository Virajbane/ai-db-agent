// ============================================================================
// lib/ai.js - Ollama Integration with Schema-Aware Prompting
// ============================================================================

import { formatForAI } from "./dbintrospect";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";

// ============================================================================
//  MAIN FUNCTION – OLLAMA WITH SCHEMA CONTEXT
// ============================================================================
export async function parseUserInstruction({
  dbType = "mongodb",
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
        "❌ Ollama is not running. Please start it:\n\n" +
        "1. Install from https://ollama.com\n" +
        "2. Run: ollama serve\n" +
        "3. Pull model: ollama pull qwen2.5-coder:7b"
      );
    }

    // Parse with Ollama (with schema context)
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
//  PREVIEW GENERATION FUNCTION
// ============================================================================
export async function generateQueryPreview(query, userText, dbType = "mongodb") {
  try {
    const isRunning = await checkOllamaRunning();
    if (!isRunning) {
      return "⚠️ Preview unavailable - Ollama not running. Start with: ollama serve";
    }

    const previewPrompt = buildPreviewPrompt(query, userText, dbType);
    
    console.log("🔍 Generating preview with Ollama...");
    
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: previewPrompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 200,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama preview failed: ${response.status}`);
    }

    const data = await response.json();
    const explanation = data.response.trim();
    
    console.log("✅ Preview generated:", explanation.substring(0, 50) + "...");
    
    return explanation;
  } catch (error) {
    console.error("❌ Preview generation failed:", error);
    return "Preview unavailable - " + error.message;
  }
}

// ============================================================================
//  CHECK OLLAMA IS RUNNING
// ============================================================================
async function checkOllamaRunning() {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (error) {
    console.error("⚠️ Ollama check failed:", error.message);
    return false;
  }
}

// ============================================================================
//  OLLAMA INFERENCE WITH SCHEMA CONTEXT
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
    collectionSchemas,
    dbType
  );

  console.log(`🤖 Sending to Ollama (${MODEL_NAME})...`);
  console.log(`📝 User query: "${userText}"`);
  
  // Log if schema is available
  const schemaAvailable = Object.keys(collectionSchemas).length > 0;
  console.log(`📊 Schema context: ${schemaAvailable ? "✅ Available" : "❌ Not available"}`);

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
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const rawText = data.response;

    console.log("✅ Ollama raw response:", rawText.substring(0, 150) + "...");

    return parseJSONResponse(rawText, previewLimit, dbType);
  } catch (error) {
    console.error("❌ Ollama request failed:", error);
    
    if (error.message.includes("fetch")) {
      throw new Error("Cannot connect to Ollama. Make sure it's running: ollama serve");
    }
    
    throw new Error(`Ollama failed: ${error.message}`);
  }
}

// ============================================================================
//  BUILD PREVIEW PROMPT
// ============================================================================
function buildPreviewPrompt(query, userText, dbType) {
  return `You are a database query explainer. Explain this ${dbType} query in simple, friendly language.

USER ASKED: "${userText}"

GENERATED QUERY:
${JSON.stringify(query, null, 2)}

Provide a brief (2-3 sentences), clear explanation of what this query will do. 
- Use simple language, no technical jargon
- Be specific about what data will be returned
- Mention any filters or conditions

Explanation:`;
}

// ============================================================================
//  BUILD SYSTEM PROMPT (Enhanced with Schema Context)
// ============================================================================
function buildSystemPrompt(userText, collections, collectionSchemas, dbType) {
  // ✅ NEW: Build schema context from actual database
  let schemaContext = "";
  if (Object.keys(collectionSchemas).length > 0) {
    schemaContext = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    schemaContext += "📊 ACTUAL DATABASE SCHEMA (Use ONLY these fields):\n";
    schemaContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    
    Object.entries(collectionSchemas).forEach(([name, schema]) => {
      schemaContext += `📂 Collection: "${name}"\n`;
      schemaContext += `   Fields: ${schema.fields.length}\n\n`;
      
      schema.fields.forEach(field => {
        const types = schema.fieldTypes[field]?.join(" | ") || "unknown";
        const sample = schema.sampleValues[field];
        const sampleStr = sample !== undefined ? ` → Example: ${JSON.stringify(sample)}` : "";
        schemaContext += `   • ${field} (${types})${sampleStr}\n`;
      });
      schemaContext += "\n";
    });
    
    schemaContext += "⚠️ CRITICAL: Use ONLY the field names listed above. Do not invent fields.\n\n";
    schemaContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  }

  const availableCollections =
    collections.length > 0
      ? collections.join(", ")
      : Object.keys(collectionSchemas).join(", ") || "users";

  const systemPrompt = `${schemaContext}You are an expert ${dbType.toUpperCase()} query generator with TRILINGUAL support.

🌍 LANGUAGE UNDERSTANDING (English, Hindi, Marathi):

ENGLISH KEYWORDS:
  • Actions: show, find, get, list, all, search, display, fetch, count, delete, update
  • Fields: name, email, phone, address, age, id, firstname, lastname
  • Filters: where, with, having, containing, equals, like, matching

HINDI (हिंदी) KEYWORDS:
  • Actions: दिखाओ (dikhao), बताओ (batao), खोजो (khojo), ढूंढो (dhundho), सभी (sabhi), सारे (saare), गिनो (gino)
  • Fields: नाम (naam), पहला नाम (pehla naam), ईमेल (email), फोन (phone), पता (pata)
  • Filters: का (ka), के (ke), की (ki), वाला (wala), वाली (wali), है (hai), हो (ho)

MARATHI (मराठी) KEYWORDS:
  • Actions: दाखव (dakhav), सांग (sang), शोध (shodh), सर्व (sarva), सगळे (sagle), मोज (moj)
  • Fields: नाव (naav), पहिले नाव (pahile naav), ईमेल (email), फोन (phone), पत्ता (patta)
  • Filters: चा (cha), ची (chi), चे (che), आहे (aahe), असलेला (asalela)

📖 TRILINGUAL QUERY EXAMPLES:

1. "Find all users" / "सभी users दिखाओ" / "सर्व users दाखव"
   → {"action": "find", "collection": "users", "query": {}}

2. "Show email of Ram" / "Ram का email बताओ" / "Ram चा email सांग"
   → {"action": "find", "collection": "users", "query": {"$or": [{"firstName": {"$regex": "Ram", "$options": "i"}}, {"lastName": {"$regex": "Ram", "$options": "i"}}]}, "options": {"projection": {"email": 1, "_id": 0}}}

3. "Count all users" / "सभी users गिनो" / "सर्व users मोज"
   → {"action": "aggregate", "collection": "users", "pipeline": [{"$count": "total"}]}

4. "Show third user" / "तीसरा user दिखाओ"
   → {"action": "find", "collection": "users", "query": {}, "options": {"sort": {"_id": 1}, "skip": 2, "limit": 1}}

5. "Show last 5 users" / "आखिरी 5 users"
   → {"action": "find", "collection": "users", "query": {}, "options": {"sort": {"_id": -1}, "limit": 5}}

6. "Delete user with email test@example.com"
   → {"action": "delete", "collection": "users", "query": {"email": "test@example.com"}}

🎯 CRITICAL MONGODB QUERY RULES:

1. **SCHEMA ADHERENCE** - Use ONLY fields from the schema above
   • If schema shows "firstName" and "lastName", use those exact names
   • DO NOT invent fields like "name" if only "firstName" exists
   • Check schema before generating any query

2. **NAME MATCHING** - Map user terms to actual schema fields:
   • If user says "name" / "naam" / "naav":
     - Check schema for firstName + lastName → use $or with both
     - Check schema for single "name" field → use that
     - If neither exists, return error

3. **CASE INSENSITIVITY** - Always use {"$options": "i"} with $regex

4. **FIELD PROJECTION** - When user asks for specific fields:
   • Use only fields that exist in schema
   • Include "_id: 0" unless explicitly requested
   • Example: {"email": 1, "_id": 0}

5. **SORTING** - CRITICAL: Sort values MUST be 1 or -1 ONLY
   • Ascending: {"_id": 1}
   • Descending: {"_id": -1}
   • NEVER use 2, 0, or any other values
   • For "third user" or "nth item": Use skip + limit, NOT sort with numbers

6. **PAGINATION** - For "nth item" queries:
   • Use skip and limit: {"skip": n-1, "limit": 1}
   • Example: "third user" → {"skip": 2, "limit": 1}
   • Always sort by _id for consistent ordering: {"sort": {"_id": 1}}

7. **COUNTING** - Use aggregate with $count:
   {"action": "aggregate", "collection": "users", "pipeline": [{"$count": "total"}]}

8. **SAFETY** - Never delete/update without query conditions

📋 RESPONSE FORMAT - RETURN ONLY THIS JSON (NO MARKDOWN, NO EXPLANATIONS):

{
  "action": "find",
  "collection": "users",
  "query": {},
  "options": {
    "limit": 50,
    "sort": {},
    "projection": {}
  }
}

Valid actions: find, insert, update, delete, aggregate

🔍 AVAILABLE COLLECTIONS: ${availableCollections}

👤 USER QUERY: "${userText}"

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON
- NO markdown code blocks (no \`\`\`json)
- NO explanations before or after
- Use ONLY field names from the schema above
- Map language terms to actual database fields from schema
- Use case-insensitive regex for all text searches
- Include projection when user asks for specific fields`;

  return systemPrompt;
}

// ============================================================================
//  PARSE RAW OLLAMA OUTPUT
// ============================================================================
function parseJSONResponse(rawText, previewLimit, dbType) {
  let text = rawText.trim();

  console.log("🔍 Parsing Ollama response...");

  // Remove markdown code blocks
  if (text.includes("```")) {
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  // Extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  // Fix common JSON issues
  text = text
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/'/g, '"');

  try {
    const json = JSON.parse(text);

    // Validate required fields
    if (!json.action) {
      throw new Error("Missing 'action' field in response");
    }

    const collectionField = dbType === 'mongodb' ? 'collection' : 'table';
    if (!json[collectionField] && !json.collection && !json.table) {
      throw new Error(`Missing '${collectionField}' field in response`);
    }

    // Set defaults for MongoDB
    if (dbType === 'mongodb') {
      json.options = json.options || {};
      json.options.limit = json.options.limit || previewLimit;
      json.query = json.query || {};
      
      if (json.options.projection && typeof json.options.projection !== 'object') {
        json.options.projection = {};
      }
    } else {
      json.limit = json.limit || previewLimit;
    }

    console.log("✅ Successfully parsed query:", JSON.stringify(json, null, 2));
    return json;
  } catch (error) {
    console.error("❌ JSON parsing failed:", error.message);
    console.error("📄 Raw text was:", text);
    
    throw new Error(
      `Failed to parse AI response as JSON. ` +
      `The AI returned invalid JSON format. ` +
      `Error: ${error.message}`
    );
  }
}