// ============================================================================
// app/api/ai/run-query/route.js - Enhanced with Multi-Stage Pipeline
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
        error: "Unsupported database type" 
      }, { status: 400 });
    }

    logStep(`[${requestId}] 📋 ORIGINAL INPUT`, { 
      dbType,
      userText
    });

    // ========================================================================
    // 🆕 STAGE 1: Language Normalization
    // ========================================================================
    logStep(`[${requestId}] 🌍 STAGE 1: Language Normalization`);
    
    const normResponse = await fetch("http://localhost:3000/api/ai/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userText })
    });

    if (!normResponse.ok) {
      throw new Error("Language normalization failed");
    }

    const normData = await normResponse.json();
    
    if (!normData.ok) {
      throw new Error(normData.error || "Normalization failed");
    }

    const normalizedText = normData.normalized;
    const detectedLanguage = normData.detectedLanguage;

    logStep(`[${requestId}] ✅ NORMALIZED`, {
      original: userText,
      normalized: normalizedText,
      language: detectedLanguage
    });

    // ========================================================================
    // 🆕 STAGE 2: Intent Classification
    // ========================================================================
    logStep(`[${requestId}] 🎯 STAGE 2: Intent Classification`);
    
    const intentResponse = await fetch("http://localhost:3000/api/ai/classify-intent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    normalizedText, 
    dbType,
    langConfidence: normData.confidence // 🆕 Pass this through
  })
});

    if (!intentResponse.ok) {
      throw new Error("Intent classification failed");
    }

    const intentData = await intentResponse.json();
    
    if (!intentData.ok) {
      throw new Error(intentData.error || "Intent classification failed");
    }

    logStep(`[${requestId}] ✅ INTENT CLASSIFIED`, {
      intent: intentData.intent,
      confidence: intentData.confidence,
      isDestructive: intentData.isDestructive,
      needsConfirmation: intentData.needsConfirmation
    });

    // ========================================================================
    // Fetch database metadata
    // ========================================================================
    let collectionSchemas = {};
    let dbMetadata = null;
    
    try {
      logStep(`[${requestId}] 🔍 FETCHING ${dbType.toUpperCase()} METADATA`);
      
      dbMetadata = await getCachedUniversalMetadata(uri, false);
      
      dbMetadata.collections.forEach(col => {
        collectionSchemas[col.name] = {
          fields: col.fields,
          fieldTypes: col.fieldTypes,
          sampleValues: col.sampleValues,
          documentCount: col.documentCount,
          indexes: col.indexes
        };
      });
      
      logStep(`[${requestId}] ✅ METADATA LOADED`, { 
        totalCollections: Object.keys(collectionSchemas).length
      });
    } catch (schemaError) {
      logStep(`[${requestId}] ⚠️ INTROSPECTION FAILED`, { 
        error: schemaError.message
      });
    }

    const collectionsForAI = Object.keys(collectionSchemas).length > 0 
      ? Object.keys(collectionSchemas) 
      : collections;

    // ========================================================================
    // Generate Query (use normalized text)
    // ========================================================================
    logStep(`[${requestId}] 🤖 GENERATING QUERY`);

    const action = await parseUniversalInstruction({ 
      dbType,
      userText: normalizedText, // 🆕 Use normalized text
      collections: collectionsForAI, 
      previewLimit,
      collectionSchemas
    });

    logStep(`[${requestId}] ✅ QUERY GENERATED`, {
      action: action.action,
      target: action.collection || action.table
    });

    // Validate action
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
    // Build enriched response with pipeline metadata
    // ========================================================================
    return NextResponse.json({ 
      ok: true, 
      action, 
      requestId,
      pipeline: {
        original: userText,
        normalized: normalizedText,
        detectedLanguage,
        intent: intentData.intent,
        confidence: intentData.confidence,
        isDestructive: intentData.isDestructive,
        needsConfirmation: intentData.needsConfirmation
      },
      metadata: {
        dbType,
        schemaUsed: Object.keys(collectionSchemas).length > 0,
        collectionsAvailable: collectionsForAI,
        totalDocuments: dbMetadata?.totalDocuments || 0,
        model: "qwen2.5-coder:7b"
      }
    });
    
  } catch (error) {
    logStep(`[${requestId}] 💥 FATAL ERROR`, { 
      error: error.message, 
      stack: error.stack 
    }, error);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message,
        requestId
      },
      { status: 500 }
    );
  }
}