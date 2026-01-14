// ============================================================================
// app/api/ai/run-query/route.js - WITH USER-FRIENDLY ERROR HANDLING
// ============================================================================

import { NextResponse } from "next/server";
import { parseUniversalInstruction } from "@/lib/universalAi";
import { getCachedUniversalMetadata } from "@/lib/multiDbIntrospect";
import { detectDatabaseType } from "@/lib/dbAdapters";
import { formatErrorResponse, logError } from "@/lib/errorHandler";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    const body = await req.json();
    const { userText, collections = [], previewLimit = 50, uri } = body || {};

    // Validation with friendly errors
    if (!userText || userText.trim().length === 0) {
      return NextResponse.json(formatErrorResponse(
        new Error("Please provide a query or command"),
        { requestId, userText }
      ), { status: 400 });
    }

    if (!uri) {
      return NextResponse.json(formatErrorResponse(
        new Error("Database connection string is required. Please check your connection settings."),
        { requestId }
      ), { status: 400 });
    }

    const dbType = detectDatabaseType(uri);
    if (!dbType) {
      return NextResponse.json(formatErrorResponse(
        new Error("Unsupported database type. We support MongoDB, PostgreSQL, MySQL, Redis, and Supabase."),
        { requestId, uri }
      ), { status: 400 });
    }

    const startTime = Date.now();
    console.log(`[${requestId}] ⚡ OPTIMIZED PIPELINE START`);

    // ========================================================================
    // Run normalization and introspection IN PARALLEL
    // ========================================================================
    
    const hasDevanagari = /[\u0900-\u097F]/.test(userText);
    const promises = [];
    
    // Promise 1: Normalization (only if non-English)
    if (hasDevanagari) {
      console.log(`[${requestId}] 🌍 Normalizing (parallel)...`);
      promises.push(
        fetch("http://localhost:3000/api/ai/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userText }),
          signal: AbortSignal.timeout(8000)
        }).then(res => res.json()).catch(() => ({ 
          ok: true, 
          normalized: userText, 
          detectedLanguage: "unknown",
          confidence: 0.5 
        }))
      );
    } else {
      console.log(`[${requestId}] ✅ English - skip normalize`);
      promises.push(Promise.resolve({ 
        ok: true, 
        normalized: userText,
        detectedLanguage: "english",
        confidence: 1.0
      }));
    }
    
    // Promise 2: DB Introspection (parallel with normalization)
    console.log(`[${requestId}] 🔍 Introspecting (parallel)...`);
    promises.push(
      getCachedUniversalMetadata(uri, false).catch((err) => {
        console.warn(`[${requestId}] ⚠️ Introspection failed:`, err.message);
        return {
          collections: [],
          totalDocuments: 0
        };
      })
    );
    
    // Wait for both to complete
    const [normData, dbMetadata] = await Promise.all(promises);
    
    const normalizedText = normData.normalized || userText;
    const detectedLanguage = normData.detectedLanguage || "english";
    const langConfidence = normData.confidence || 0.9;
    
    console.log(`[${requestId}] ✅ Parallel tasks done in ${Date.now() - startTime}ms`);

    // ========================================================================
    // INTENT CLASSIFICATION
    // ========================================================================
    console.log(`[${requestId}] 🎯 Classifying intent...`);
    
    let intent = "UNKNOWN";
    let intentConfidence = 0.5;
    let isDestructive = false;
    let needsConfirmation = true;
    
    try {
      const classifyRes = await fetch("http://localhost:3000/api/ai/classify-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          normalizedText,
          dbType,
          langConfidence
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (classifyRes.ok) {
        const classifyData = await classifyRes.json();
        if (classifyData.ok) {
          intent = classifyData.intent;
          intentConfidence = classifyData.confidence;
          isDestructive = classifyData.isDestructive;
          needsConfirmation = classifyData.needsConfirmation;
        }
      }
    } catch (error) {
      console.warn(`[${requestId}] ⚠️ Intent classification timeout, using fallback`);
      isDestructive = /\b(update|delete|drop|remove|modify)\b/i.test(normalizedText);
      intent = isDestructive ? "UPDATE" : "READ";
    }

    console.log(`[${requestId}] ✅ Intent: ${intent} (${intentConfidence})`);

    // ========================================================================
    // Process schema data
    // ========================================================================
    let collectionSchemas = {};
    
    if (dbMetadata && dbMetadata.collections) {
      dbMetadata.collections.forEach(col => {
        collectionSchemas[col.name] = {
          fields: col.fields || [],
          fieldTypes: col.fieldTypes || {},
          sampleValues: col.sampleValues || {},
          documentCount: col.documentCount || 0,
        };
      });
    }

    const collectionsForAI = Object.keys(collectionSchemas).length > 0 
      ? Object.keys(collectionSchemas) 
      : collections;

    // ========================================================================
    // Generate Query (with error handling)
    // ========================================================================
    console.log(`[${requestId}] 🤖 Generating query...`);

    let action;
    try {
      action = await parseUniversalInstruction({ 
        dbType,
        userText: normalizedText,
        collections: collectionsForAI, 
        previewLimit,
        collectionSchemas
      });
    } catch (aiError) {
      logError(aiError, { 
        requestId, 
        action: 'parseInstruction', 
        userText: normalizedText, 
        dbType 
      });
      
      return NextResponse.json(
        formatErrorResponse(aiError, { 
          requestId, 
          userText: normalizedText, 
          dbType 
        }), 
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(`[${requestId}] ⚡ TOTAL TIME: ${totalTime}ms`);

    // ========================================================================
    // Build success response
    // ========================================================================
    return NextResponse.json({ 
      ok: true, 
      action, 
      requestId,
      pipeline: {
        original: userText,
        normalized: normalizedText,
        detectedLanguage,
        intent,
        confidence: Math.min(langConfidence, intentConfidence),
        isDestructive,
        needsConfirmation
      },
      metadata: {
        dbType,
        schemaUsed: Object.keys(collectionSchemas).length > 0,
        collectionsAvailable: collectionsForAI,
        totalDocuments: dbMetadata?.totalDocuments || 0,
        processingTime: totalTime,
        model: "qwen2.5-coder:7b"
      }
    });
    
  } catch (error) {
    // Catch-all error handler
    logError(error, { 
      requestId, 
      action: 'general', 
      userText: req.body?.userText 
    });
    
    return NextResponse.json(
      formatErrorResponse(error, { 
        requestId,
        userText: req.body?.userText
      }), 
      { status: 500 }
    );
  }
}