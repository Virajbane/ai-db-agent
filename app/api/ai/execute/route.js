// ============================================================================
// app/api/ai/execute/route.js - Universal Query Execution Engine
// ============================================================================

import { getUniversalClient } from "@/lib/db";
import { logStep, validateAction } from "@/lib/debug";
import { detectDatabaseType } from "@/lib/dbAdapters";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  let client = null;

  try {
    logStep(`[${requestId}] EXECUTION REQUEST RECEIVED`);

    const { uri, action } = await req.json();

    // Validate inputs
    if (!uri) {
      logStep(`[${requestId}] MISSING URI`, {});
      return new Response(
        JSON.stringify({ ok: false, error: "Database URI required" }), 
        { status: 400 }
      );
    }

    if (!action) {
      logStep(`[${requestId}] MISSING ACTION`, {});
      return new Response(
        JSON.stringify({ ok: false, error: "Action object required" }), 
        { status: 400 }
      );
    }

    // Detect database type
    const dbType = detectDatabaseType(uri);
    
    if (!dbType) {
      logStep(`[${requestId}] UNSUPPORTED DATABASE TYPE`, {});
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Unsupported database type. Supported: MongoDB, PostgreSQL, MySQL, Redis, Supabase" 
        }), 
        { status: 400 }
      );
    }

    logStep(`[${requestId}] INPUTS VALIDATED`, { 
      dbType,
      actionType: action.action, 
      target: action.collection || action.table || action.key
    });

    // Validate action structure
    const validation = validateAction(action);
    if (!validation.valid) {
      logStep(`[${requestId}] ACTION VALIDATION FAILED`, validation.errors);
      return new Response(
        JSON.stringify({ ok: false, error: validation.errors.join("; ") }), 
        { status: 400 }
      );
    }

    // ========================================================================
    // MongoDB-specific validation (sort values must be 1 or -1)
    // ========================================================================
    if (dbType === 'mongodb' && action.options?.sort) {
      const sortObj = action.options.sort;
      const invalidSorts = Object.entries(sortObj).filter(([field, value]) => {
        return value !== 1 && value !== -1;
      });
      
      if (invalidSorts.length > 0) {
        logStep(`[${requestId}] INVALID SORT VALUES`, { invalidSorts, sortObj });
        
        // Auto-fix: Convert invalid values to 1
        invalidSorts.forEach(([field]) => {
          console.warn(`⚠️ Auto-fixing sort value for "${field}": was ${sortObj[field]}, now 1`);
          action.options.sort[field] = 1;
        });
        
        logStep(`[${requestId}] SORT VALUES AUTO-FIXED`, { fixedSort: action.options.sort });
      }
    }

    logStep(`[${requestId}] CONNECTING TO ${dbType.toUpperCase()}`);

    // Get universal database client
    client = await getUniversalClient(uri);

    logStep(`[${requestId}] CONNECTED TO ${dbType.toUpperCase()}`);

    logStep(`[${requestId}] EXECUTING ${action.action.toUpperCase()}`, {
      dbType,
      target: action.collection || action.table || action.key,
      action: action
    });

    // ========================================================================
    // Execute query using database adapter
    // ========================================================================
    const result = await client.adapter.execute(action);

    logStep(`[${requestId}] EXECUTION COMPLETE`, { 
      dbType,
      resultType: typeof result,
      hasResults: Array.isArray(result) ? result.length : 'N/A'
    });

    // Close connection
    await client.close();
    logStep(`[${requestId}] CONNECTION CLOSED`);

    // Build metadata based on result
    let resultMetadata = {
      action: action.action,
      target: action.collection || action.table || action.key,
      dbType: dbType,
      projectionUsed: false,
      fieldsReturned: []
    };

    // MongoDB-specific metadata
    if (dbType === 'mongodb' && action.options?.projection) {
      resultMetadata.projectionUsed = true;
      resultMetadata.fieldsReturned = Object.keys(action.options.projection)
        .filter(k => action.options.projection[k] === 1);
    }

    // SQL-specific metadata
    if ((dbType === 'postgresql' || dbType === 'mysql' || dbType === 'supabase') && action.fields) {
      resultMetadata.projectionUsed = true;
      resultMetadata.fieldsReturned = action.fields;
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        result, 
        metadata: resultMetadata,
        requestId 
      }), 
      { status: 200 }
    );
  } 
  catch (err) {
    logStep(`[${requestId}] EXECUTION FAILED`, { 
      error: err.message, 
      stack: err.stack 
    }, err);
    
    // Attempt to close connection
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        console.error(`[${requestId}] Failed to close client:`, closeErr);
      }
    }

    // User-friendly error messages
    let userMessage = err.message;
    
    if (err.message.includes("ECONNREFUSED")) {
      userMessage = `Cannot connect to database. Please check your connection string.`;
    } else if (err.message.includes("authentication") || err.message.includes("Authentication")) {
      userMessage = `Authentication failed. Please check your database credentials.`;
    } else if (err.message.includes("not found") || err.message.includes("does not exist")) {
      userMessage = `Database, table, or collection not found. Please check the name.`;
    } else if (err.message.includes("timeout")) {
      userMessage = `Database connection timeout. Please check network or database status.`;
    }

    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: userMessage,
        details: err.message,
        requestId 
      }),
      { status: 500 }
    );
  }
}