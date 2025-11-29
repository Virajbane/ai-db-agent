import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

/**
 * Try Gemini first, fallback to OpenAI if Gemini fails
 */
export async function parseUserInstruction({ dbType, userText, collections = [], previewLimit = 50 }) {
  // Try Gemini first
  try {
    return await parseWithGemini({ dbType, userText, collections, previewLimit });
  } catch (geminiError) {
    console.warn("⚠️ Gemini failed, trying OpenAI fallback...", geminiError.message);
    
    // Fallback to OpenAI
    try {
      return await parseWithOpenAI({ dbType, userText, collections, previewLimit });
    } catch (openaiError) {
      console.error("❌ Both Gemini and OpenAI failed");
      throw new Error(`AI parsing failed: Gemini (${geminiError.message}) | OpenAI (${openaiError.message})`);
    }
  }
}

/**
 * Parse using Google Gemini API
 */
async function parseWithGemini({ dbType, userText, collections, previewLimit }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not found in environment");
  }

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  const systemPrompt = `You are a MongoDB query translator. Convert user instructions into MongoDB operations.

IMPORTANT RULES:
1. Always respond with ONLY valid JSON (no markdown, no explanations)
2. Return an object with: { action, collection, query, update, insert, pipeline, options }
3. Valid actions: "find", "insert", "update", "delete", "aggregate"
4. For FIND: include query object and options (limit, sort, projection)
5. For UPDATE: include query (what to match) and update (what to change with $set)
6. For DELETE: include query (required - no full deletes!)
7. For INSERT: include insert array/object
8. For AGGREGATE: include pipeline array
9. Guess collection name if not explicitly mentioned
10. Use MongoDB operators: $gt, $lt, $eq, $in, $regex, etc.

EXAMPLES:
User: "Find all users older than 30"
{"action":"find","collection":"users","query":{"age":{"$gt":30}},"options":{"limit":50}}

User: "Find users named John in the accounts collection"
{"action":"find","collection":"accounts","query":{"name":"John"},"options":{"limit":50}}

User: "Delete users with age less than 18"
{"action":"delete","collection":"users","query":{"age":{"$lt":18}}}

User: "Update user John's email to john@example.com"
{"action":"update","collection":"users","query":{"name":"John"},"update":{"$set":{"email":"john@example.com"}}}

User: "Insert a new user"
{"action":"insert","collection":"users","insert":{"name":"Unknown","createdAt":new Date()}}

Available collections: ${collections.length > 0 ? collections.join(", ") : "users, posts, comments, products, orders (guess if needed)"}

Now convert this user instruction: "${userText}"`;

  try {
    const response = await model.generateContent(systemPrompt);
    const rawText = response.response.text();
    
    console.log("✅ Gemini response received:", rawText.substring(0, 100));

    return parseJSONResponse(rawText, previewLimit);
  } catch (error) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

/**
 * Parse using OpenAI API (fallback)
 */
async function parseWithOpenAI({ dbType, userText, collections, previewLimit }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const systemPrompt = `You are a MongoDB query translator. Convert user instructions into MongoDB operations.

IMPORTANT RULES:
1. Always respond with ONLY valid JSON (no markdown, no explanations)
2. Return an object with: { action, collection, query, update, insert, pipeline, options }
3. Valid actions: "find", "insert", "update", "delete", "aggregate"
4. For FIND: include query object and options (limit, sort, projection)
5. For UPDATE: include query (what to match) and update (what to change with $set)
6. For DELETE: include query (required - no full deletes!)
7. For INSERT: include insert array/object
8. For AGGREGATE: include pipeline array
9. Guess collection name if not explicitly mentioned
10. Use MongoDB operators: $gt, $lt, $eq, $in, $regex, etc.

Available collections: ${collections.length > 0 ? collections.join(", ") : "users, posts, comments, products, orders (guess if needed)"}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const rawText = response.choices[0].message.content;
    console.log("✅ OpenAI response received:", rawText.substring(0, 100));

    return parseJSONResponse(rawText, previewLimit);
  } catch (error) {
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Extract and parse JSON from response
 */
function parseJSONResponse(rawText, previewLimit) {
  let jsonText = rawText.trim();

  // Remove markdown code blocks
  if (jsonText.includes("```json")) {
    jsonText = jsonText.split("```json")[1].split("```")[0].trim();
  } else if (jsonText.includes("```")) {
    jsonText = jsonText.split("```")[1].split("```")[0].trim();
  }

  const action = JSON.parse(jsonText);

  // Validate required fields
  if (!action.action) throw new Error("No action returned from AI");
  if (!action.collection) throw new Error("No collection specified by AI");

  // Set defaults
  if (!action.options) action.options = {};
  if (!action.options.limit) action.options.limit = previewLimit;
  if (!action.query) action.query = {};

  console.log("✅ Action parsed successfully:", action);
  return action;
}