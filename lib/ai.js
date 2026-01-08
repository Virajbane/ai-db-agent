// ============================================================================
// lib/ai.js - Enhanced Ollama Integration with DB-Specific Prompts
// ============================================================================

import { buildOllamaPrompt, detectLanguage } from "./prompt";

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
  // ✅ NEW: Use database-specific prompt builder
  const systemPrompt = buildSystemPrompt(
    userText,
    collections,
    collectionSchemas,
    dbType
  );

  console.log(`🤖 Sending to Ollama (${MODEL_NAME})...`);
  console.log(`📝 User query: "${userText}"`);
  
  // Detect user language
  const userLanguage = detectLanguage(userText);
  console.log(`🌍 Detected language: ${userLanguage}`);
  
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
          temperature: 0.2, // ✅ Updated: More deterministic for queries
          top_p: 0.9,
          top_k: 40,
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
//  ✅ NEW: BUILD SYSTEM PROMPT WITH DB-SPECIFIC TEMPLATES
// ============================================================================
function buildSystemPrompt(userText, collections, collectionSchemas, dbType) {
  // Convert collectionSchemas to metadata format expected by buildOllamaPrompt
  const metadata = {
    totalDocuments: 0,
    totalCollections: Object.keys(collectionSchemas).length,
    collections: Object.entries(collectionSchemas).map(([name, schema]) => ({
      name,
      count: schema.documentCount || 0,
      fields: schema.fields || [],
      fieldTypes: schema.fieldTypes || {},
      sampleValues: schema.sampleValues || {},
      indexes: schema.indexes || []
    }))
  };

  // Calculate total documents
  metadata.totalDocuments = metadata.collections.reduce(
    (sum, col) => sum + (col.count || 0), 
    0
  );

  // ✅ Use the new database-specific prompt builder
  try {
    return buildOllamaPrompt(userText, dbType, metadata);
  } catch (error) {
    console.error("⚠️ Error building prompt, falling back to basic:", error);
    
    // Fallback to a basic prompt if new system fails
    return buildFallbackPrompt(userText, collections, collectionSchemas, dbType);
  }
}

// ============================================================================
//  FALLBACK PROMPT (Safety Net)
// ============================================================================
function buildFallbackPrompt(userText, collections, collectionSchemas, dbType) {
  let schemaContext = "";
  if (Object.keys(collectionSchemas).length > 0) {
    schemaContext = "📊 AVAILABLE COLLECTIONS:\n";
    Object.entries(collectionSchemas).forEach(([name, schema]) => {
      schemaContext += `\n• ${name} (${schema.fields?.length || 0} fields)\n`;
      if (schema.fields) {
        schemaContext += `  Fields: ${schema.fields.slice(0, 10).join(", ")}\n`;
      }
    });
  }

  const availableCollections = collections.length > 0 
    ? collections.join(", ")
    : Object.keys(collectionSchemas).join(", ") || "users";

  return `${schemaContext}

You are a ${dbType.toUpperCase()} query generator.

USER QUERY: "${userText}"

AVAILABLE: ${availableCollections}

Generate a valid JSON query. Return ONLY JSON, no markdown, no explanations.

Format:
{
  "action": "find",
  "collection": "name",
  "query": {},
  "options": {"limit": 50}
}`;
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