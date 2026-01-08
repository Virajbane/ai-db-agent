// ============================================================================
// lib/multiDbIntrospect.js - Universal Database Introspection
// ============================================================================

import { createDatabaseAdapter, detectDatabaseType } from "./dbAdapters";

/**
 * Universal database metadata cache
 */
let universalCache = {
  data: null,
  timestamp: null,
  connectionString: null,
  ttl: 5 * 60 * 1000 // 5 minutes
};

/**
 * Scan any database type and return unified schema
 * @param {string} connectionString - Database connection string
 * @returns {Promise<Object>} Unified database metadata
 */
export async function scanUniversalDatabase(connectionString) {
  console.log("🔍 Starting universal database introspection...");
  
  const dbType = detectDatabaseType(connectionString);
  console.log(`📊 Detected database type: ${dbType}`);
  
  if (!dbType) {
    throw new Error("Could not detect database type from connection string");
  }
  
  const adapter = createDatabaseAdapter(connectionString);
  
  try {
    const metadata = await adapter.introspect();
    console.log(`✅ Introspection complete: ${metadata.totalCollections} collections/tables`);
    return metadata;
  } catch (error) {
    console.error("❌ Universal introspection failed:", error);
    throw error;
  }
}

/**
 * Get cached database metadata or scan if needed (universal)
 * @param {string} connectionString - Database connection string
 * @param {boolean} forceRefresh - Force re-scan
 * @returns {Promise<Object>} Database metadata
 */
export async function getCachedUniversalMetadata(connectionString, forceRefresh = false) {
  const now = Date.now();
  
  // Check if cache is valid and for the same connection
  if (
    !forceRefresh &&
    universalCache.data &&
    universalCache.timestamp &&
    universalCache.connectionString === connectionString &&
    (now - universalCache.timestamp) < universalCache.ttl
  ) {
    console.log("✅ Using cached universal DB metadata");
    return universalCache.data;
  }
  
  // Scan database
  console.log("🔄 Refreshing universal DB metadata cache...");
  const metadata = await scanUniversalDatabase(connectionString);
  
  // Update cache
  universalCache.data = metadata;
  universalCache.timestamp = now;
  universalCache.connectionString = connectionString;
  
  return metadata;
}

/**
 * Format universal metadata for AI consumption
 * @param {Object} metadata - Database metadata
 * @returns {string} AI-friendly context
 */
export function formatUniversalForAI(metadata) {
  if (!metadata || !metadata.collections || metadata.collections.length === 0) {
    return "No tables/collections found in database.";
  }
  
  const dbTypeLabel = {
    mongodb: "MongoDB",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    redis: "Redis",
    supabase: "Supabase (PostgreSQL)"
  }[metadata.type] || metadata.type.toUpperCase();
  
  let context = `📊 ${dbTypeLabel} DATABASE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 DATABASE OVERVIEW:
  • Database Type: ${dbTypeLabel}
  • Total ${metadata.type === 'mongodb' ? 'Collections' : 'Tables'}: ${metadata.totalCollections}
  • Total ${metadata.type === 'mongodb' ? 'Documents' : 'Records'}: ${metadata.totalDocuments.toLocaleString()}
  • Last Scanned: ${new Date(metadata.scannedAt).toLocaleString()}

`;
  
  metadata.collections.forEach(col => {
    const itemType = metadata.type === 'mongodb' ? 'Documents' : 'Records';
    
    context += `
📂 ${metadata.type === 'mongodb' ? 'Collection' : 'Table'}: "${col.name}"
   ${itemType}: ${col.documentCount.toLocaleString()}
   
   🔑 Fields (${col.fields.length}):
`;
    
    col.fields.forEach(field => {
      const types = col.fieldTypes[field]?.join(" | ") || "unknown";
      const sample = col.sampleValues[field];
      const sampleStr = sample !== undefined ? ` → Example: ${JSON.stringify(sample)}` : "";
      context += `      • ${field} (${types})${sampleStr}\n`;
    });
    
    if (col.indexes && col.indexes.length > 0) {
      context += `\n   📌 Indexes (${col.indexes.length}):\n`;
      col.indexes.forEach(idx => {
        const unique = idx.unique ? " [UNIQUE]" : "";
        const keys = idx.keys ? `[${idx.keys.join(", ")}]` : "";
        context += `      • ${idx.name}${keys}${unique}\n`;
      });
    }
  });
  
  context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 QUERY GENERATION RULES FOR ${dbTypeLabel}:
`;

  if (metadata.type === 'mongodb') {
    context += `
• Use MongoDB query syntax with JSON
• Collection: "${metadata.collections[0]?.name || 'collection_name'}"
• Actions: find, aggregate, insert, update, delete
• Example: {"action": "find", "collection": "users", "query": {"email": "test@example.com"}}
`;
  } else if (metadata.type === 'postgresql' || metadata.type === 'mysql') {
    context += `
• Use SQL-style queries with table and where clauses
• Table: "${metadata.collections[0]?.name || 'table_name'}"
• Actions: find (SELECT), insert (INSERT), update (UPDATE), delete (DELETE)
• Use "table" field instead of "collection"
• Use "where" field instead of "query"
• Example: {"action": "find", "table": "users", "where": {"email": "test@example.com"}}
`;
  } else if (metadata.type === 'redis') {
    context += `
• Use Redis key-value operations
• Actions: find (GET), insert (SET), delete (DEL)
• Specify "key" field for operations
• Example: {"action": "find", "key": "user:*"}
`;
  }
  
  context += `
⚠️ CRITICAL FIELD MAPPING RULES:
  1. Use ONLY fields that exist in the schema above
  2. Field names are case-sensitive
  3. Always validate field existence before generating queries
  4. For name searches, check available name fields (firstName, lastName, etc.)
  
`;
  
  return context;
}

/**
 * Clear universal metadata cache
 */
export function clearUniversalCache() {
  universalCache.data = null;
  universalCache.timestamp = null;
  universalCache.connectionString = null;
  console.log("🗑️ Universal DB metadata cache cleared");
}

/**
 * Test database connection
 * @param {string} connectionString - Database connection string
 * @returns {Promise<Object>} Connection test result
 */
export async function testUniversalConnection(connectionString) {
  try {
    const dbType = detectDatabaseType(connectionString);
    
    if (!dbType) {
      return { 
        ok: false, 
        error: "Could not detect database type from connection string" 
      };
    }
    
    const adapter = createDatabaseAdapter(connectionString);
    const result = await adapter.testConnection();
    
    return {
      ok: result.ok,
      message: result.message,
      error: result.error,
      dbType
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

/**
 * Execute query on any database
 * @param {string} connectionString - Database connection string
 * @param {Object} action - Query action
 * @returns {Promise<any>} Query result
 */
export async function executeUniversalQuery(connectionString, action) {
  const adapter = createDatabaseAdapter(connectionString);
  
  try {
    const result = await adapter.execute(action);
    return result;
  } catch (error) {
    console.error("❌ Universal query execution failed:", error);
    throw error;
  }
}