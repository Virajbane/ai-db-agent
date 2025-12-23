// app/api/ai/execute/route.js
import { getNativeMongoClient } from "@/lib/db";
import { logStep, validateAction } from "@/lib/debug";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  let client = null;

  try {
    logStep(`[${requestId}] EXECUTION REQUEST RECEIVED`);

    const { uri, action } = await req.json();

    // Validate inputs
    if (!uri) {
      logStep(`[${requestId}] MISSING URI`, {});
      return new Response(JSON.stringify({ ok: false, error: "MongoDB URI required" }), { status: 400 });
    }

    if (!action) {
      logStep(`[${requestId}] MISSING ACTION`, {});
      return new Response(JSON.stringify({ ok: false, error: "Action object required" }), { status: 400 });
    }

    logStep(`[${requestId}] INPUTS VALIDATED`, { actionType: action.action, collection: action.collection });

    // Validate action structure
    const validation = validateAction(action);
    if (!validation.valid) {
      logStep(`[${requestId}] ACTION VALIDATION FAILED`, validation.errors);
      return new Response(JSON.stringify({ ok: false, error: validation.errors.join("; ") }), { status: 400 });
    }

    // ========================================================================
    // ✅ NEW: Validate sort values (must be 1 or -1)
    // ========================================================================
    if (action.options && action.options.sort) {
      const sortObj = action.options.sort;
      const invalidSorts = Object.entries(sortObj).filter(([field, value]) => {
        return value !== 1 && value !== -1;
      });
      
      if (invalidSorts.length > 0) {
        const errorMsg = `Invalid sort direction(s): ${invalidSorts.map(([f, v]) => `${f}=${v}`).join(', ')}. Must be 1 (ascending) or -1 (descending).`;
        logStep(`[${requestId}] INVALID SORT VALUES`, { invalidSorts, sortObj });
        
        // Auto-fix: Convert invalid values to 1
        invalidSorts.forEach(([field]) => {
          console.warn(`⚠️ Auto-fixing sort value for "${field}": was ${sortObj[field]}, now 1`);
          action.options.sort[field] = 1;
        });
        
        logStep(`[${requestId}] SORT VALUES AUTO-FIXED`, { fixedSort: action.options.sort });
      }
    }

    logStep(`[${requestId}] CONNECTING TO MONGODB`);

    // Connect to MongoDB
    client = await getNativeMongoClient(uri);
    logStep(`[${requestId}] CONNECTED TO MONGODB`);

    const db = client.db();
    const col = db.collection(action.collection);

    logStep(`[${requestId}] EXECUTING ${action.action.toUpperCase()}`, {
      collection: action.collection,
      query: action.query,
      options: action.options,
    });

    let result;
    let resultMetadata = {
      action: action.action,
      collection: action.collection,
      projectionUsed: false,
      fieldsReturned: []
    };

    if (action.action === "find") {
      const limit = (action.options && action.options.limit) || 100;
      const sort = (action.options && action.options.sort) || {};
      const skip = (action.options && action.options.skip) || 0;
      const projection = (action.options && action.options.projection) || null;
      
      // Build find query
      let cursor = col.find(action.query || {});
      
      // Apply skip if specified
      if (skip > 0) {
        cursor = cursor.skip(skip);
        resultMetadata.skipped = skip;
      }
      
      // Apply projection if specified
      if (projection && Object.keys(projection).length > 0) {
        cursor = cursor.project(projection);
        resultMetadata.projectionUsed = true;
        resultMetadata.fieldsReturned = Object.keys(projection).filter(k => projection[k] === 1);
      }
      
      result = await cursor.sort(sort).limit(limit).toArray();
      
      logStep(`[${requestId}] FIND COMPLETE`, { 
        documentCount: result.length,
        skipped: skip,
        projectionUsed: resultMetadata.projectionUsed,
        fieldsReturned: resultMetadata.fieldsReturned
      });
    } 
    else if (action.action === "aggregate") {
      const pipeline = action.pipeline || [];
      result = await col.aggregate(pipeline).toArray();
      logStep(`[${requestId}] AGGREGATE COMPLETE`, { documentCount: result.length });
    } 
    else if (action.action === "insert") {
      const payload = Array.isArray(action.insert) ? action.insert : [action.insert];
      const res = await col.insertMany(payload);
      result = { insertedIds: res.insertedIds, insertedCount: res.insertedCount };
      logStep(`[${requestId}] INSERT COMPLETE`, result);
    } 
    else if (action.action === "update") {
      const query = action.query || {};
      const updateDoc = action.update || {};
      const res = await col.updateMany(query, updateDoc);
      result = { matchedCount: res.matchedCount, modifiedCount: res.modifiedCount, upsertedCount: res.upsertedCount };
      logStep(`[${requestId}] UPDATE COMPLETE`, result);
    } 
    else if (action.action === "delete") {
      const query = action.query || {};
      
      // Safety check - prevent full collection deletes
      if (!query || Object.keys(query).length === 0) {
        throw new Error("Delete operation requires a query condition. Cannot delete entire collection.");
      }
      
      const res = await col.deleteMany(query);
      result = { deletedCount: res.deletedCount };
      logStep(`[${requestId}] DELETE COMPLETE`, result);
    } 
    else {
      throw new Error(`Unsupported action: ${action.action}`);
    }

    // Close connection
    await client.close();
    logStep(`[${requestId}] CONNECTION CLOSED`);

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
    logStep(`[${requestId}] EXECUTION FAILED`, { error: err.message, stack: err.stack }, err);
    
    // Attempt to close connection
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        console.error(`[${requestId}] Failed to close client:`, closeErr);
      }
    }

    return new Response(
      JSON.stringify({ ok: false, error: err.message || "Execution failed", requestId }),
      { status: 500 }
    );
  }
}