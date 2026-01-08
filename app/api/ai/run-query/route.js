// ============================================================================
// app/api/ai/run-query/route.js - Universal Query Parser with Multi-DB Support
// ============================================================================

import { NextResponse } from "next/server";
import { parseUniversalInstruction } from "@/lib/universalAi";
import { getCachedUniversalMetadata } from "@/lib/multiDbIntrospect";
import { detectDatabaseType } from "@/lib/dbAdapters";
import { logStep, validateAction } from "@/lib/debug";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    logStep(`[${requestId}] 📥 REQUEST RECEIVED`, { timestamp: new Date().toISOString() });

    const body = await req.json();
    const { userText, collections = [], previewLimit = 50, uri } = body || {};

    // Validate input
    if (!userText || userText.trim().length === 0) {
      logStep(`[${requestId}] ❌ INVALID INPUT`, { userText });
      return NextResponse.json({ 
        ok: false, 
        error: "userText is required and cannot be empty" 
      }, { status: 400 });
    }

    if (!uri) {
      logStep(`[${requestId}] ❌ MISSING URI`);
      return NextResponse.json({ 
        ok: false, 
        error: "Database connection string is required" 
      }, { status: 400 });
    }

    // Detect database type
    const dbType = detectDatabaseType(uri);
    
    if (!dbType) {
      return NextResponse.json({ 
        ok: false, 
        error: "Unsupported database type. Supported: MongoDB, PostgreSQL, MySQL, Redis, Supabase" 
      }, { status: 400 });
    }

    logStep(`[${requestId}] 📋 REQUEST DETAILS`, { 
      dbType,
      userText, 
      collectionsCount: collections.length, 
      previewLimit
    });

    // ========================================================================
    // Fetch universal database metadata
    // ========================================================================
    let collectionSchemas = {};
    let dbMetadata = null;
    
    try {
      logStep(`[${requestId}] 🔍 FETCHING ${dbType.toUpperCase()} METADATA`, { 
        collectionsProvided: collections.length,
        cacheEnabled: true
      });
      
      dbMetadata = await getCachedUniversalMetadata(uri, false);
      
      // Build collection schemas map
      dbMetadata.collections.forEach(col => {
        collectionSchemas[col.name] = {
          fields: col.fields,
          fieldTypes: col.fieldTypes,
          sampleValues: col.sampleValues,
          documentCount: col.documentCount,
          indexes: col.indexes
        };
      });
      
      const schemaDetails = Object.entries(collectionSchemas).map(([name, schema]) => ({
        name,
        fieldCount: schema.fields?.length || 0,
        fields: schema.fields || [],
        documentCount: schema.documentCount || 0
      }));
      
      logStep(`[${requestId}] ✅ METADATA LOADED`, { 
        totalCollections: Object.keys(collectionSchemas).length,
        totalDocuments: dbMetadata.totalDocuments,
        scannedAt: dbMetadata.scannedAt,
        fromCache: true,
        details: schemaDetails
      });
    } catch (schemaError) {
      logStep(`[${requestId}] ⚠️ INTROSPECTION FAILED`, { 
        error: schemaError.message,
        note: "AI will work without schema context"
      });
    }

    // Prepare collections list
    const collectionsForAI = Object.keys(collectionSchemas).length > 0 
      ? Object.keys(collectionSchemas) 
      : collections;

    logStep(`[${requestId}] 🤖 CALLING OLLAMA AI`, { 
      userText, 
      dbType,
      hasSchemas: Object.keys(collectionSchemas).length > 0,
      collections: collectionsForAI,
      model: "qwen2.5-coder:7b"
    });

    // Call Ollama AI with database-specific context
    const action = await parseUniversalInstruction({ 
      dbType,
      userText, 
      collections: collectionsForAI, 
      previewLimit,
      collectionSchemas
    });

    logStep(`[${requestId}] ✅ OLLAMA RESPONSE PARSED`, {
      action: action.action,
      target: action.collection || action.table,
      hasQuery: !!(action.query || action.where),
      dbType
    });

    // Validate parsed action
    const validation = validateAction(action);
    if (!validation.valid) {
      logStep(`[${requestId}] ❌ ACTION VALIDATION FAILED`, validation.errors);
      return NextResponse.json(
        { 
          ok: false, 
          error: `Invalid query structure: ${validation.errors.join("; ")}`,
          action 
        },
        { status: 400 }
      );
    }

    // ========================================================================
    // Validate fields against schema (if available)
    // ========================================================================
    const targetName = action.collection || action.table;
    if (collectionSchemas[targetName]) {
      const availableFields = collectionSchemas[targetName].fields;
      const queryFields = Object.keys(action.query || action.where || {});
      
      const invalidFields = queryFields.filter(field => {
        if (field.startsWith('$')) return false; // MongoDB operators
        return !availableFields.includes(field);
      });
      
      if (invalidFields.length > 0) {
        logStep(`[${requestId}] ⚠️ FIELD VALIDATION WARNING`, {
          invalidFields,
          availableFields,
          note: "Query may fail or return unexpected results"
        });
      }
    }

    logStep(`[${requestId}] ✅ ACTION VALIDATED SUCCESSFULLY`, { 
      action: action.action,
      target: action.collection || action.table
    });

    // Success response
    return NextResponse.json({ 
      ok: true, 
      action, 
      requestId,
      metadata: {
        dbType,
        schemaUsed: Object.keys(collectionSchemas).length > 0,
        collectionsAvailable: collectionsForAI,
        totalDocuments: dbMetadata?.totalDocuments || 0,
        scannedAt: dbMetadata?.scannedAt || null,
        model: "qwen2.5-coder:7b",
        provider: "Ollama (local)",
        introspectionEngine: "universal-v1.0"
      }
    });
    
  } catch (error) {
    logStep(`[${requestId}] 💥 FATAL ERROR`, { 
      error: error.message, 
      stack: error.stack 
    }, error);
    
    let userMessage = error.message;
    
    if (error.message.includes("Ollama is not running")) {
      userMessage = "🔴 Ollama is not running. Please start it with: ollama serve";
    } else if (error.message.includes("Failed to parse")) {
      userMessage = "🔴 AI response was invalid. Try rephrasing your query.";
    } else if (error.message.includes("connect")) {
      userMessage = "🔴 Cannot connect to database or Ollama. Check your connections.";
    }
    
    return NextResponse.json(
      { 
        ok: false, 
        error: userMessage,
        details: error.message,
        requestId
      },
      { status: 500 }
    );
  }
}