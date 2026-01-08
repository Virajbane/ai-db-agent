// ============================================================================
// app/api/db/introspect/route.js - Universal Database Scanner (FIXED)
// ============================================================================

import { getCachedUniversalMetadata } from "@/lib/multiDbIntrospect";
import { detectDatabaseType } from "@/lib/dbAdapters";
import { NextResponse } from "next/server";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    console.log(`[${requestId}] 🔍 INTROSPECTION REQUEST`);
    
    const { uri, forceRefresh = false } = await req.json();
    
    if (!uri) {
      return NextResponse.json({ 
        ok: false, 
        error: "Connection string required" 
      }, { status: 400 });
    }
    
    // Detect database type
    const dbType = detectDatabaseType(uri);
    
    if (!dbType) {
      return NextResponse.json({ 
        ok: false, 
        error: "Could not detect database type from connection string" 
      }, { status: 400 });
    }
    
    console.log(`[${requestId}] 📊 Scanning ${dbType.toUpperCase()}...`);
    
    // Scan database
    const metadata = await getCachedUniversalMetadata(uri, forceRefresh);
    
    console.log(`[${requestId}] ✅ Metadata received:`, {
      type: metadata?.type,
      collections: metadata?.collections?.length,
      totalCollections: metadata?.totalCollections,
      totalDocuments: metadata?.totalDocuments
    });
    
    // Validate metadata structure
    if (!metadata || !metadata.collections) {
      throw new Error("Invalid metadata structure received from introspection");
    }
    
    // Build safe summary with proper defaults
    const summary = {
      dbType: metadata.type || dbType,
      totalTables: metadata.totalCollections || metadata.collections.length || 0,
      totalRecords: metadata.totalDocuments || 0,
      tables: metadata.collections.map(c => c.name || 'unknown'),
      scannedAt: metadata.scannedAt || new Date().toISOString()
    };
    
    // Build safe collections array
    const collections = metadata.collections.map(col => ({
      name: col.name || 'unknown',
      type: col.type || 'unknown',
      fields: col.fields || [],
      fieldCount: (col.fields || []).length,
      recordCount: col.documentCount || 0,
      sampleData: col.sampleValues || {}
    }));
    
    console.log(`[${requestId}] ✅ Found ${summary.totalTables} collections/tables`);
    
    return NextResponse.json({ 
      ok: true, 
      summary,
      collections,
      metadata,
      requestId
    });
    
  } catch (error) {
    console.error(`[${requestId}] ❌ Introspection failed:`, error);
    console.error('Error stack:', error.stack);
    
    let userMessage = error.message;
    
    // Provide helpful error messages
    if (error.message.includes("ECONNREFUSED")) {
      userMessage = "Cannot connect to database. Check if database server is running.";
    } else if (error.message.includes("authentication") || error.message.includes("Authentication")) {
      userMessage = "Authentication failed. Check username and password.";
    } else if (error.message.includes("timeout")) {
      userMessage = "Connection timeout. Check network and database status.";
    } else if (error.message.includes("ENOTFOUND")) {
      userMessage = "Database host not found. Check connection string.";
    }
    
    return NextResponse.json({ 
      ok: false, 
      error: userMessage,
      details: error.message,
      requestId
    }, { status: 500 });
  }
}