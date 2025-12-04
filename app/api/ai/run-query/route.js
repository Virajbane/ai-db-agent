// app/api/ai/run-query/route.js
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
    
    // Get sample documents to infer schema (increased to 20 for better coverage)
    const samples = await db.collection(collectionName)
      .find()
      .limit(20)
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
    console.error(`Error getting schema for ${collectionName}:`, error.message);
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
      collectionNames = collections
        .map(col => col.name)
        .filter(name => !name.startsWith('system.')); // Filter out system collections
    } catch (error) {
      console.error('Error listing collections:', error);
      return {};
    } finally {
      if (client) await client.close();
    }
  }
  
  // Fetch schemas in parallel for better performance
  const schemaPromises = collectionNames.map(async (collectionName) => {
    const schema = await getCollectionSchema(uri, collectionName);
    return [collectionName, schema];
  });
  
  const schemaEntries = await Promise.all(schemaPromises);
  schemaEntries.forEach(([name, schema]) => {
    schemas[name] = schema;
  });
  
  return schemas;
}

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    logStep(`[${requestId}] REQUEST RECEIVED`, { timestamp: new Date().toISOString() });

    // Parse request body
    const body = await req.json();
    const { dbType = "mongodb", userText, collections = [], previewLimit = 50, uri } = body || {};

    logStep(`[${requestId}] BODY PARSED`, { 
      dbType, 
      userText, 
      collectionsCount: collections.length, 
      previewLimit,
      hasUri: !!uri 
    });

    // ========================================================================
    // ✅ REMOVED API KEY CHECK - Ollama doesn't need API keys!
    // ========================================================================

    // Validate input
    if (!userText || userText.trim().length === 0) {
      logStep(`[${requestId}] INVALID INPUT`, { userText });
      return NextResponse.json({ 
        ok: false, 
        error: "userText is required and cannot be empty" 
      }, { status: 400 });
    }

    // Get database URI from request
    const dbUri = uri || body.dbURI;
    
    // Fetch schemas for all collections (or auto-detect if none provided)
    let collectionSchemas = {};
    if (dbUri) {
      logStep(`[${requestId}] FETCHING SCHEMAS`, { 
        collectionsProvided: collections.length,
        willAutoDetect: collections.length === 0 
      });
      
      try {
        collectionSchemas = await getAllSchemas(dbUri, collections);
        logStep(`[${requestId}] SCHEMAS FETCHED`, { 
          collections: Object.keys(collectionSchemas),
          details: Object.entries(collectionSchemas).map(([name, schema]) => ({
            collection: name,
            fieldCount: schema.fields?.length || 0,
            fields: schema.fields?.slice(0, 10) // Show first 10 fields in logs
          }))
        });
      } catch (schemaError) {
        logStep(`[${requestId}] SCHEMA FETCH FAILED`, { error: schemaError.message });
        // Continue without schemas - AI will work with less context
      }
    } else {
      logStep(`[${requestId}] NO URI PROVIDED`, { note: "AI will work without schema context" });
    }

    logStep(`[${requestId}] CALLING OLLAMA AI`, { 
      userText, 
      hasSchemas: Object.keys(collectionSchemas).length > 0,
      schemaCollections: Object.keys(collectionSchemas)
    });

    // Call Ollama AI with schema context
    const action = await parseUserInstruction({ 
      dbType, 
      userText, 
      collections: Object.keys(collectionSchemas).length > 0 ? Object.keys(collectionSchemas) : collections, 
      previewLimit,
      collectionSchemas // Pass schemas to AI
    });

    logStep(`[${requestId}] OLLAMA RESPONSE RECEIVED`, action);

    // Validate parsed action
    const validation = validateAction(action);
    if (!validation.valid) {
      logStep(`[${requestId}] ACTION VALIDATION FAILED`, validation.errors);
      return NextResponse.json(
        { ok: false, error: `Invalid action: ${validation.errors.join("; ")}` },
        { status: 400 }
      );
    }

    logStep(`[${requestId}] ACTION VALIDATED`, { 
      action: action.action,
      collection: action.collection,
      hasProjection: !!(action.options?.projection)
    });

    return NextResponse.json({ 
      ok: true, 
      action, 
      requestId,
      schemaUsed: Object.keys(collectionSchemas).length > 0
    });
  } catch (error) {
    logStep(`[${requestId}] FATAL ERROR`, { 
      error: error.message, 
      stack: error.stack 
    }, error);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Something went wrong parsing your request",
        requestId 
      },
      { status: 500 }
    );
  }
}