// ============================================================================
//  IMPORTS
// ============================================================================
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

// ============================================================================
//  MAIN FUNCTION – TRY GEMINI → FALLBACK TO OPENAI
// ============================================================================
export async function parseUserInstruction({
  dbType,
  userText,
  collections = [],
  previewLimit = 50,
  collectionSchemas = {},
}) {
  try {
    // 1) Try Gemini with retry logic
    return await parseWithGemini({
      dbType,
      userText,
      collections,
      previewLimit,
      collectionSchemas,
    });
  } catch (geminiError) {
    console.warn("⚠️ Gemini failed → Trying OpenAI fallback:", geminiError.message);

    // 2) If Gemini failed → Try OpenAI
    try {
      return await parseWithOpenAI({
        dbType,
        userText,
        collections,
        previewLimit,
        collectionSchemas,
      });
    } catch (openaiError) {
      throw new Error(
        `❌ Both Gemini & OpenAI failed → Gemini: (${geminiError.message}) | OpenAI: (${openaiError.message})`
      );
    }
  }
}

// ============================================================================
//  GEMINI INFERENCE (with retries + multilingual + schema aware)
// ============================================================================
async function parseWithGemini({
  dbType,
  userText,
  collections,
  previewLimit,
  collectionSchemas,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing in environment");
  }

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" }); // stable working model

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildSystemPrompt(userText, collections, collectionSchemas);

      const response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      });

      const rawText = response.response.text();
      console.log("✅ Gemini response received:", rawText.substring(0, 100));
      return parseJSONResponse(rawText, previewLimit);
    } catch (err) {
      lastError = err;

      // Retry for rate limit errors
      if (err.message.includes("429") || err.message.includes("quota")) {
        const wait = attempt * 2000;
        console.warn(`⚠️ Gemini Rate Limit → Retrying in ${wait / 1000}s...`);
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Gemini failed after retries: ${lastError.message}`);
}

// ============================================================================
//  OPENAI FALLBACK
// ============================================================================
async function parseWithOpenAI({
  dbType,
  userText,
  collections,
  previewLimit,
  collectionSchemas,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing in environment");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildSystemPrompt(userText, collections, collectionSchemas);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    temperature: 0.2,
    max_tokens: 500,
  });

  const rawText = response.choices[0].message.content;
  console.log("✅ OpenAI response received:", rawText.substring(0, 100));
  return parseJSONResponse(rawText, previewLimit);
}

// ============================================================================
//  BUILD SYSTEM PROMPT (Multilingual + Schema Aware)
// ============================================================================
function buildSystemPrompt(userText, collections, collectionSchemas) {
  let schemaContext = "";
  if (Object.keys(collectionSchemas).length > 0) {
    schemaContext = Object.entries(collectionSchemas)
      .map(([name, schema]) => `- ${name}: fields = ${schema.fields?.join(", ")}`)
      .join("\n");
  }

  const systemPrompt = `You are an intelligent MongoDB query translator with multilingual support (English, Hindi, Marathi, Spanish, French, etc.).

${schemaContext}

🌍 MULTILINGUAL UNDERSTANDING:
- Understand queries in ANY language (Hindi: "Ram naam ke user ka email batao", English: "show Ram's email")
- Common translations:
  * Hindi: naam/नाम = name, email/ईमेल = email, batao/बताओ = show/tell, user/यूजर = user, sabhi/सभी = all
  * Marathi: नाव = name, ईमेल = email, दाखव = show, सर्व = all
- Map local language terms to actual database field names using the schema above

🎯 QUERY PRECISION RULES:
1. Be FLEXIBLE with name matching:
   - "Ram" should match firstName: "Ram" OR lastName: "Ram"
   - Use case-insensitive regex: {"$regex": "^Ram$", "$options": "i"}
   - For partial names, use: {"$regex": "Ram", "$options": "i"}

2. Field name mapping (use schema above):
   - "name" → check if "firstName" or "name" field exists in schema
   - "email" → "email" field
   - "age" → "age" field
   - Always use EXACT field names from the schema

3. SMART OUTPUT - Include projection for specific requests:
   - If user asks for "email only" → options: { projection: { email: 1, _id: 0 } }
   - If user asks for "name and email" → options: { projection: { firstName: 1, lastName: 1, email: 1, _id: 0 } }
   - If user asks "show all" → no projection (return everything)
   - ALWAYS include _id: 0 in projection unless user specifically asks for id

📋 RESPONSE FORMAT:
Return ONLY valid JSON (no markdown, no explanations):
{
  "action": "find|insert|update|delete|aggregate",
  "collection": "collection_name",
  "query": {},
  "update": {},
  "insert": {},
  "pipeline": [],
  "options": {
    "limit": 50,
    "sort": {},
    "projection": {}
  }
}

🔍 Available collections: ${
    collections.length > 0 ? collections.join(", ") : Object.keys(collectionSchemas).join(", ") || "users (guess if needed)"
}

Now convert this user instruction: "${userText}"`;

  return systemPrompt;
}

// ============================================================================
//  PARSE RAW LLM OUTPUT (Gemini/OpenAI)
// ============================================================================
function parseJSONResponse(rawText, previewLimit) {
  let text = rawText.trim();
  if (text.includes("```")) text = text.replace(/```json|```/g, "").trim();

  const json = JSON.parse(text);

  if (!json.action) throw new Error("AI response missing action");
  if (!json.collection) throw new Error("AI response missing collection");

  json.options = json.options || {};
  json.options.limit = json.options.limit || previewLimit;
  json.query = json.query || {};

  console.log("✅ Action parsed successfully:", json);
  return json;
}
