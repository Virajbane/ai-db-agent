import { NextResponse } from "next/server";
import { parseUserInstruction } from "@/lib/ai";
import { logStep, validateAction } from "@/lib/debug";
import { MongoClient } from "mongodb";

// Helper function to get collection schema
async function getCollectionSchema(uri, collectionName) {
  let client;
  try {
    client = await MongoClient.connect(uri);
    const db = client.db();
    
    // Get sample documents to infer schema
    const samples = await db.collection(collectionName)
      .find()
      .limit(10)
      .toArray();
    
    if (samples.length === 0) {
      return { fields: [], sampleDocument: null };
    }
    
    // Extract all unique fields
    const fieldsSet = new Set();
    samples.forEach(doc => {
      Object.keys(doc).forEach(key => fieldsSet.add(key));
    });
    
    // Build schema with types
    const schema = {};
    const fields = Array.from(fieldsSet);
    
    fields.forEach(field => {
      const sampleValue = samples[0][field];
      schema[field] = typeof sampleValue;
    });
    
    return {
      fields,
      schema,
      sampleDocument: samples[0]
    };
  } catch (error) {
    console.error('Error getting schema:', error);
    return { fields: [], schema: {}, sampleDocument: null };
  } finally {
    if (client) await client.close();
  }
}

// Get schemas for all collections
async function getAllSchemas(uri, collectionNames) {
  const schemas = {};
  
  // If no collections specified, fetch all collections
  if (collectionNames.length === 0) {
    let client;
    try {
      client = await MongoClient.connect(uri);
      const db = client.db();
      const collections = await db.listCollections().toArray();
      collectionNames = collections.map(col => col.name);
    } catch (error) {
      console.error('Error listing collections:', error);
      return {};
    } finally {
      if (client) await client.close();
    }
  }
  
  for (const collectionName of collectionNames) {
    schemas[collectionName] = await getCollectionSchema(uri, collectionName);
  }
  
  return schemas;
}

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    logStep(`[${requestId}] REQUEST RECEIVED`, { timestamp: new Date().toISOString() });

    // Parse request body
    const body = await req.json();
    const { dbType = "mongodb", userText, collections = [], previewLimit = 50, uri } = body || {};

    logStep(`[${requestId}] BODY PARSED`, { dbType, userText, collectionsCount: collections.length, previewLimit });

    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      logStep(`[${requestId}] MISSING API KEY`, {}, new Error("GEMINI_API_KEY not set"));
      return NextResponse.json(
        { ok: false, error: "Gemini API key is missing. Check .env.local" },
        { status: 500 }
      );
    }

    // Validate input
    if (!userText || userText.trim().length === 0) {
      logStep(`[${requestId}] INVALID INPUT`, { userText });
      return NextResponse.json({ ok: false, error: "userText is required and cannot be empty" }, { status: 400 });
    }

    // Get database URI from request or localStorage (you might need to adjust this)
    const dbUri = uri || body.dbURI;
    
    // Fetch schemas for all collections (or auto-detect if none provided)
    let collectionSchemas = {};
    if (dbUri) {
      logStep(`[${requestId}] FETCHING SCHEMAS`, { 
        collectionsProvided: collections.length,
        willAutoDetect: collections.length === 0 
      });
      collectionSchemas = await getAllSchemas(dbUri, collections);
      logStep(`[${requestId}] SCHEMAS FETCHED`, { 
        collections: Object.keys(collectionSchemas),
        fields: Object.entries(collectionSchemas).map(([name, schema]) => ({
          collection: name,
          fieldCount: schema.fields?.length || 0
        }))
      });
    }

    logStep(`[${requestId}] CALLING AI PARSER`, { userText, hasSchemas: Object.keys(collectionSchemas).length > 0 });

    // Call AI with schema context
    const action = await parseUserInstruction({ 
      dbType, 
      userText, 
      collections, 
      previewLimit,
      collectionSchemas // Pass schemas to AI
    });

    logStep(`[${requestId}] AI RESPONSE RECEIVED`, action);

    // Validate parsed action
    const validation = validateAction(action);
    if (!validation.valid) {
      logStep(`[${requestId}] ACTION VALIDATION FAILED`, validation.errors);
      return NextResponse.json(
        { ok: false, error: `Invalid action: ${validation.errors.join("; ")}` },
        { status: 400 }
      );
    }

    logStep(`[${requestId}] ACTION VALIDATED`, action);

    return NextResponse.json({ ok: true, action, requestId });
  } catch (error) {
    logStep(`[${requestId}] FATAL ERROR`, { error: error.message, stack: error.stack }, error);
    return NextResponse.json(
      { ok: false, error: error.message || "Something went wrong parsing your request" },
      { status: 500 }
    );
  }
}