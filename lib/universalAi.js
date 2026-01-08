// ============================================================================
// lib/universalAi.js - Universal Database-Aware AI Engine
// ============================================================================

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";

/**
 * Parse user instruction for ANY database type
 */
export async function parseUniversalInstruction({
  dbType = "mongodb",
  userText,
  collections = [],
  previewLimit = 50,
  collectionSchemas = {},
}) {
  try {
    const isRunning = await checkOllamaRunning();
    if (!isRunning) {
      throw new Error(
        "❌ Ollama is not running. Please start it:\n\n" +
        "1. Install from https://ollama.com\n" +
        "2. Run: ollama serve\n" +
        "3. Pull model: ollama pull qwen2.5-coder:7b"
      );
    }

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

async function checkOllamaRunning() {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function parseWithOllama({
  dbType,
  userText,
  collections,
  previewLimit,
  collectionSchemas,
}) {
  const systemPrompt = buildUniversalPrompt(
    userText,
    collections,
    collectionSchemas,
    dbType
  );

  console.log(`🤖 Sending to Ollama (${MODEL_NAME})...`);
  console.log(`📝 User query: "${userText}"`);
  console.log(`📊 Database type: ${dbType}`);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

function buildUniversalPrompt(userText, collections, collectionSchemas, dbType) {
  let schemaContext = "";
  if (Object.keys(collectionSchemas).length > 0) {
    schemaContext = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    schemaContext += `📊 ${dbType.toUpperCase()} DATABASE SCHEMA:\n`;
    schemaContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    
    Object.entries(collectionSchemas).forEach(([name, schema]) => {
      const itemType = dbType === 'mongodb' ? 'Collection' : 'Table';
      schemaContext += `📂 ${itemType}: "${name}"\n`;
      schemaContext += `   Fields: ${schema.fields.length}\n\n`;
      
      schema.fields.forEach(field => {
        const types = schema.fieldTypes[field]?.join(" | ") || "unknown";
        const sample = schema.sampleValues[field];
        const sampleStr = sample !== undefined ? ` → Example: ${JSON.stringify(sample)}` : "";
        schemaContext += `   • ${field} (${types})${sampleStr}\n`;
      });
      schemaContext += "\n";
    });
    
    schemaContext += "⚠️ CRITICAL: Use ONLY the field names listed above.\n\n";
    schemaContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  }

  const availableCollections = collections.length > 0
    ? collections.join(", ")
    : Object.keys(collectionSchemas).join(", ") || "users";

  // Database-specific instructions
  let dbSpecificRules = "";
  let exampleFormat = "";
  
  if (dbType === "mongodb") {
    dbSpecificRules = `
🎯 MONGODB QUERY RULES:

1. **STRUCTURE**: Use "collection" field (not "table")
2. **QUERY**: Use "query" field with MongoDB operators
3. **SORTING**: Sort values MUST be 1 (asc) or -1 (desc) ONLY
4. **PAGINATION**: Use skip + limit for nth items
5. **PROJECTION**: Include "_id: 0" unless requested

Valid actions: find, aggregate, insert, update, delete
`;

    exampleFormat = `
📖 MONGODB EXAMPLES:

1. "Show all users"
   → {"action": "find", "collection": "users", "query": {}}

2. "Third user"
   → {"action": "find", "collection": "users", "query": {}, "options": {"sort": {"_id": 1}, "skip": 2, "limit": 1}}

3. "Count users"
   → {"action": "aggregate", "collection": "users", "pipeline": [{"$count": "total"}]}
`;
  } else if (dbType === "postgresql" || dbType === "mysql" || dbType === "supabase") {
    dbSpecificRules = `
🎯 SQL DATABASE QUERY RULES:

1. **STRUCTURE**: Use "table" field (not "collection")
2. **CONDITIONS**: Use "where" field (not "query")
3. **SORTING**: Use "sort" with 1 (ASC) or -1 (DESC)
4. **PAGINATION**: Use "limit" and "offset"
5. **PROJECTION**: Use "fields" array for SELECT columns

Valid actions: find (SELECT), insert (INSERT), update (UPDATE), delete (DELETE)
`;

    exampleFormat = `
📖 SQL EXAMPLES:

1. "Show all users"
   → {"action": "find", "table": "users", "where": {}}

2. "Third user"
   → {"action": "find", "table": "users", "where": {}, "limit": 1, "offset": 2}

3. "User with email test@example.com"
   → {"action": "find", "table": "users", "where": {"email": "test@example.com"}}
`;
  } else if (dbType === "redis") {
    dbSpecificRules = `
🎯 REDIS QUERY RULES:

1. **STRUCTURE**: Use "key" field for key patterns
2. **ACTIONS**: find (GET), insert (SET), delete (DEL)
3. **PATTERNS**: Use wildcards (e.g., "user:*")

Valid actions: find, insert, delete
`;

    exampleFormat = `
📖 REDIS EXAMPLES:

1. "Get all user keys"
   → {"action": "find", "key": "user:*"}

2. "Set user data"
   → {"action": "insert", "insert": {"key": "user:123", "value": "John"}}
`;
  }

  const systemPrompt = `${schemaContext}You are an expert ${dbType.toUpperCase()} query generator with TRILINGUAL support.

🌍 LANGUAGE UNDERSTANDING (English, Hindi, Marathi):

ENGLISH: show, find, get, all, count, delete, update, third, first, last
HINDI: दिखाओ, बताओ, सभी, गिनो, तीसरा, पहला, आखिरी
MARATHI: दाखव, सांग, सर्व, मोज, तिसरा, पहिला, शेवटचा

${dbSpecificRules}

${exampleFormat}

📋 RESPONSE FORMAT - RETURN ONLY JSON (NO MARKDOWN):

{
  "action": "find",
  "${dbType === 'mongodb' ? 'collection' : 'table'}": "${collections[0] || 'users'}",
  "${dbType === 'mongodb' ? 'query' : 'where'}": {},
  "options": {
    "limit": 50
  }
}

🔍 AVAILABLE ${dbType === 'mongodb' ? 'COLLECTIONS' : 'TABLES'}: ${availableCollections}

👤 USER QUERY: "${userText}"

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON (no \`\`\`json\`\`\`)
- Use ONLY field names from schema
- Map language terms to actual database fields
- Follow ${dbType.toUpperCase()} syntax rules
`;

  return systemPrompt;
}

function parseJSONResponse(rawText, previewLimit, dbType) {
  let text = rawText.trim();

  // Remove markdown
  if (text.includes("```")) {
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  // Extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  // Fix common issues
  text = text
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/'/g, '"');

  try {
    const json = JSON.parse(text);

    if (!json.action) {
      throw new Error("Missing 'action' field in response");
    }

    // Validate target field based on DB type
    if (dbType === 'mongodb' && !json.collection) {
      throw new Error("Missing 'collection' field for MongoDB");
    } else if ((dbType === 'postgresql' || dbType === 'mysql' || dbType === 'supabase') && !json.table && !json.collection) {
      // Auto-convert collection to table
      if (json.collection) {
        json.table = json.collection;
      } else {
        throw new Error("Missing 'table' field for SQL database");
      }
    }

    // Set defaults
    if (dbType === 'mongodb') {
      json.options = json.options || {};
      json.options.limit = json.options.limit || previewLimit;
      json.query = json.query || {};
    } else {
      json.limit = json.limit || previewLimit;
      json.where = json.where || json.query || {};
    }

    console.log("✅ Successfully parsed query:", JSON.stringify(json, null, 2));
    return json;
  } catch (error) {
    console.error("❌ JSON parsing failed:", error.message);
    console.error("📄 Raw text was:", text);
    
    throw new Error(
      `Failed to parse AI response as JSON. ` +
      `Error: ${error.message}`
    );
  }
}