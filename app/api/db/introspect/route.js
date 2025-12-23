// ============================================================================
// app/api/db/introspect/route.js - Database Introspection API
// ============================================================================

import { scanDatabase, formatForAI, getCachedDBMetadata, clearDBMetadataCache } from "@/lib/dbIntrospect";

/**
 * GET /api/db/introspect?uri=mongodb://...&format=json|ai
 * Returns database schema information
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const uri = searchParams.get("uri");
    const format = searchParams.get("format") || "json"; // 'json' or 'ai'
    const refresh = searchParams.get("refresh") === "true"; // Force refresh cache
    
    if (!uri) {
      return new Response(
        JSON.stringify({ ok: false, error: "MongoDB URI required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    console.log(`🔍 Introspection request: format=${format}, refresh=${refresh}`);
    
    // Get metadata (cached or fresh)
    const metadata = await getCachedDBMetadata(uri, refresh);
    
    // Return based on format
    if (format === "ai") {
      // Format for AI consumption
      const aiContext = formatForAI(metadata);
      return new Response(
        JSON.stringify({ ok: true, context: aiContext, metadata }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      // Return raw JSON
      return new Response(
        JSON.stringify({ ok: true, metadata }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("❌ Introspection failed:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/db/introspect
 * Body: { uri: string, refresh?: boolean }
 * Returns database schema (supports body for sensitive URIs)
 */
export async function POST(req) {
  try {
    const { uri, refresh = false } = await req.json();
    
    if (!uri) {
      return new Response(
        JSON.stringify({ ok: false, error: "MongoDB URI required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    console.log(`🔍 Introspection (POST): refresh=${refresh}`);
    
    // Get metadata
    const metadata = await getCachedDBMetadata(uri, refresh);
    const aiContext = formatForAI(metadata);
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        metadata, 
        aiContext,
        summary: {
          collections: metadata.totalCollections,
          documents: metadata.totalDocuments,
          scannedAt: metadata.scannedAt
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Introspection failed:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * DELETE /api/db/introspect
 * Clears the metadata cache
 */
export async function DELETE(req) {
  try {
    clearDBMetadataCache();
    return new Response(
      JSON.stringify({ ok: true, message: "Cache cleared successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Cache clear failed:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}