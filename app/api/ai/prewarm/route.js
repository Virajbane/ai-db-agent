// ============================================================================
// app/api/ai/prewarm/route.js - Pre-warm Ollama & Cache Schema
// ============================================================================

import { NextResponse } from "next/server";
import { detectDatabaseType } from "@/lib/dbAdapters";
import { getCachedUniversalMetadata } from "@/lib/multiDbIntrospect";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    console.log(`[${requestId}] 🔥 PRE-WARMING STARTED`);

    const { uri } = await req.json();

    if (!uri) {
      return NextResponse.json({ 
        ok: false, 
        error: "Database URI required" 
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

    console.log(`[${requestId}] 📊 Database type: ${dbType}`);

    // ========================================================================
    // STEP 1: Check if Ollama is running
    // ========================================================================
    console.log(`[${requestId}] 🔍 Checking Ollama...`);
    
    const ollamaCheck = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);

    if (!ollamaCheck || !ollamaCheck.ok) {
      console.log(`[${requestId}] ❌ Ollama not running`);
      return NextResponse.json({ 
        ok: false, 
        error: "Ollama is not running. Start with: ollama serve" 
      }, { status: 503 });
    }

    console.log(`[${requestId}] ✅ Ollama is running`);

    // ========================================================================
    // STEP 2: Pre-warm Ollama with dummy query (parallel with schema scan)
    // ========================================================================
    console.log(`[${requestId}] 🔥 Pre-warming Ollama model...`);

    const prewarmPromise = fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: `You are a ${dbType} database assistant. Respond with just "ready".`,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 10,
        },
      }),
    }).then(res => res.json());

    // ========================================================================
    // STEP 3: Fetch database schema (parallel)
    // ========================================================================
    console.log(`[${requestId}] 📊 Scanning database schema...`);
    
    const schemaPromise = getCachedUniversalMetadata(uri, false);

    // Wait for both operations to complete
    const [prewarmResult, dbMetadata] = await Promise.all([
      prewarmPromise.catch(err => ({ error: err.message })),
      schemaPromise.catch(err => ({ error: err.message }))
    ]);

    console.log(`[${requestId}] ✅ Pre-warming complete`);
    console.log(`[${requestId}] 📊 Schema scan complete`);

    // Build response
    const response = {
      ok: true,
      dbType,
      model: MODEL_NAME,
      prewarmSuccess: !prewarmResult.error,
      schemaSuccess: !dbMetadata.error,
      metadata: dbMetadata.error ? null : {
        totalCollections: dbMetadata.totalCollections || 0,
        totalDocuments: dbMetadata.totalDocuments || 0,
        collections: dbMetadata.collections?.map(c => c.name) || [],
        scannedAt: dbMetadata.scannedAt
      },
      timings: {
        prewarmMs: prewarmResult.eval_duration ? Math.round(prewarmResult.eval_duration / 1000000) : null,
        schemaMs: null // Add timing if needed
      }
    };

    console.log(`[${requestId}] 🎉 Pre-warming successful`, response.metadata);

    return NextResponse.json(response);
    
  } catch (error) {
    console.error(`[${requestId}] 💥 Pre-warming failed:`, error);
    
    return NextResponse.json({
      ok: false,
      error: error.message || "Pre-warming failed"
    }, { status: 500 });
  }
}