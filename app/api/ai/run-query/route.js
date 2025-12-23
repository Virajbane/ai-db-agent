// ============================================================================
// app/api/ai/run-query/route.js - Enhanced with DB Introspection Engine
// ============================================================================

import { NextResponse } from "next/server";
import { parseUserInstruction } from "@/lib/ai";
import { logStep, validateAction } from "@/lib/debug";
import { getCachedDBMetadata } from "@/lib/dbintrospect";

// ============================================================================
// Main POST Handler
// ============================================================================
export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    logStep(`[${requestId}] 📥 REQUEST RECEIVED`, { timestamp: new Date().toISOString() });

    // Parse request body
    const body = await req.json();
    const { dbType = "mongodb", userText, collections = [], previewLimit = 50, uri } = body || {};

    logStep(`[${requestId}] 📋 REQUEST DETAILS`, { 
      dbType, 
      userText, 
      collectionsCount: collections.length, 
      previewLimit,
      hasUri: !!uri 
    });

    // ========================================================================
    // ✅ NO API KEY NEEDED - Using Ollama locally!
    // ========================================================================

    // Validate input
    if (!userText || userText.trim().length === 0) {
      logStep(`[${requestId}] ❌ INVALID INPUT`, { userText });
      return NextResponse.json({ 
        ok: false, 
        error: "userText is required and cannot be empty" 
      }, { status: 400 });
    }

    // Get database URI from request
    const dbUri = uri || body.dbURI;
    
    // ========================================================================
    // ✅ NEW: Use Introspection Engine (Cached, Optimized)
    // ========================================================================
    let collectionSchemas = {};
    let dbMetadata = null;
    
    if (dbUri) {
      logStep(`[${requestId}] 🔍 FETCHING DATABASE METADATA (Introspection Engine)`, { 
        collectionsProvided: collections.length,
        cacheEnabled: true
      });
      
      try {
        // Get cached metadata (or scan if needed)
        dbMetadata = await getCachedDBMetadata(dbUri, false);
        
        // Build collection schemas map from metadata
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
          collection: name,
          fieldCount: schema.fields?.length || 0,
          fields: schema.fields || [],
          documentCount: schema.documentCount || 0,
          indexes: schema.indexes?.length || 0
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
          note: "AI will work without schema context - accuracy may be reduced"
        });
        // Continue without schemas - AI will still work but with less context
      }
    } else {
      logStep(`[${requestId}] ⚠️ NO DATABASE URI`, { 
        note: "AI will work without schema context - may be less accurate" 
      });
    }

    // Prepare collections list for AI
    const collectionsForAI = Object.keys(collectionSchemas).length > 0 
      ? Object.keys(collectionSchemas) 
      : collections;

    logStep(`[${requestId}] 🤖 CALLING OLLAMA AI`, { 
      userText, 
      hasSchemas: Object.keys(collectionSchemas).length > 0,
      collections: collectionsForAI,
      schemasAvailable: Object.keys(collectionSchemas),
      model: "qwen2.5-coder:7b"
    });

    // Call Ollama AI with rich schema context from introspection engine
    const action = await parseUserInstruction({ 
      dbType, 
      userText, 
      collections: collectionsForAI, 
      previewLimit,
      collectionSchemas // Rich schema with types, examples, indexes
    });

    logStep(`[${requestId}] ✅ OLLAMA RESPONSE PARSED`, {
      action: action.action,
      collection: action.collection,
      hasQuery: !!action.query,
      hasProjection: !!(action.options?.projection),
      queryFields: Object.keys(action.query || {}),
      projectionFields: Object.keys(action.options?.projection || {})
    });

    // Validate parsed action structure
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
    // ✅ NEW: Validate fields against schema (if available)
    // ========================================================================
    if (collectionSchemas[action.collection]) {
      const availableFields = collectionSchemas[action.collection].fields;
      const queryFields = Object.keys(action.query || {});
      const projectionFields = Object.keys(action.options?.projection || {});
      
      // Check query fields
      const invalidQueryFields = queryFields.filter(field => {
        // Skip MongoDB operators like $or, $and
        if (field.startsWith('$')) return false;
        return !availableFields.includes(field);
      });
      
      // Check projection fields
      const invalidProjectionFields = projectionFields.filter(field => 
        field !== '_id' && !availableFields.includes(field)
      );
      
      if (invalidQueryFields.length > 0 || invalidProjectionFields.length > 0) {
        const errorMsg = [];
        
        if (invalidQueryFields.length > 0) {
          errorMsg.push(`Query uses non-existent fields: ${invalidQueryFields.join(', ')}`);
        }
        
        if (invalidProjectionFields.length > 0) {
          errorMsg.push(`Projection uses non-existent fields: ${invalidProjectionFields.join(', ')}`);
        }
        
        errorMsg.push(`Available fields: ${availableFields.join(', ')}`);
        
        logStep(`[${requestId}] ⚠️ FIELD VALIDATION WARNING`, {
          invalidQueryFields,
          invalidProjectionFields,
          availableFields,
          note: "Query may fail or return unexpected results"
        });
        
        // Log warning but don't block - let MongoDB handle it
        // This helps catch AI mistakes while allowing valid MongoDB operators
      }
    }

    logStep(`[${requestId}] ✅ ACTION VALIDATED SUCCESSFULLY`, { 
      action: action.action,
      collection: action.collection,
      queryFields: Object.keys(action.query || {}),
      projectionFields: Object.keys(action.options?.projection || {})
    });

    // Success response with enhanced metadata
    return NextResponse.json({ 
      ok: true, 
      action, 
      requestId,
      metadata: {
        schemaUsed: Object.keys(collectionSchemas).length > 0,
        collectionsAvailable: collectionsForAI,
        totalDocuments: dbMetadata?.totalDocuments || 0,
        scannedAt: dbMetadata?.scannedAt || null,
        model: "qwen2.5-coder:7b",
        provider: "Ollama (local)",
        introspectionEngine: "v1.0 (cached)",
        // Field information for the target collection
        targetCollectionInfo: collectionSchemas[action.collection] ? {
          fields: collectionSchemas[action.collection].fields,
          documentCount: collectionSchemas[action.collection].documentCount,
          indexes: collectionSchemas[action.collection].indexes?.length || 0
        } : null
      }
    });
    
  } catch (error) {
    logStep(`[${requestId}] 💥 FATAL ERROR`, { 
      error: error.message, 
      stack: error.stack 
    }, error);
    
    // Provide helpful error messages based on error type
    let userMessage = error.message;
    
    if (error.message.includes("Ollama is not running")) {
      userMessage = "🔴 Ollama is not running. Please start it with: ollama serve";
    } else if (error.message.includes("Failed to parse")) {
      userMessage = "🔴 AI response was invalid. Try rephrasing your query.";
    } else if (error.message.includes("connect")) {
      userMessage = "🔴 Cannot connect to database or Ollama. Check your connections.";
    } else if (error.message.includes("introspect") || error.message.includes("schema")) {
      userMessage = "🔴 Database introspection failed. Query will work but may be less accurate.";
    }
    
    return NextResponse.json(
      { 
        ok: false, 
        error: userMessage,
        details: error.message,
        requestId,
        help: "Make sure Ollama is running: ollama serve"
      },
      { status: 500 }
    );
  }
}