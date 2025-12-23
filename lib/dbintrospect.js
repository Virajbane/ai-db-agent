// ============================================================================
// lib/dbIntrospect.js - Database Introspection Engine
// ============================================================================

import { getNativeMongoClient } from "./db";

/**
 * Scans the entire MongoDB database and returns schema information
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<Object>} Database metadata
 */
export async function scanDatabase(uri) {
  let client = null;
  
  try {
    console.log("🔍 Starting database introspection...");
    
    client = await getNativeMongoClient(uri);
    const db = client.db();
    
    // Get all collection names
    const collections = await db.listCollections().toArray();
    console.log(`📂 Found ${collections.length} collections`);
    
    const dbInfo = [];
    
    for (const col of collections) {
      try {
        const collection = db.collection(col.name);
        
        // Sample multiple documents for better schema detection
        const sampleDocs = await collection.find({}).limit(10).toArray();
        
        // Get collection stats (use countDocuments instead of stats)
        const count = await collection.countDocuments();
        
        // Get indexes
        const indexes = await collection.indexes();
        
        // Infer schema from sample documents
        const schema = inferSchema(sampleDocs);
        
        dbInfo.push({
          name: col.name,
          fields: schema.fields,
          fieldTypes: schema.fieldTypes,
          sampleValues: schema.sampleValues,
          indexes: indexes.map(idx => ({
            name: idx.name,
            keys: Object.keys(idx.key),
            unique: idx.unique || false
          })),
          documentCount: count,
          avgDocSize: 0, // Not available without stats
          storageSize: 0 // Not available without stats
        });
        
        console.log(`  ✅ ${col.name}: ${count} documents, ${schema.fields.length} fields`);
      } catch (err) {
        console.error(`  ❌ Failed to analyze ${col.name}:`, err.message);
      }
    }
    
    await client.close();
    console.log("✅ Database introspection complete");
    
    return {
      collections: dbInfo,
      totalCollections: dbInfo.length,
      totalDocuments: dbInfo.reduce((sum, c) => sum + c.documentCount, 0),
      scannedAt: new Date().toISOString()
    };
  } catch (error) {
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        console.error("Failed to close client:", closeErr);
      }
    }
    throw error;
  }
}

/**
 * Infer schema from sample documents
 * @param {Array} documents - Sample documents
 * @returns {Object} Schema information
 */
function inferSchema(documents) {
  if (!documents || documents.length === 0) {
    return {
      fields: [],
      fieldTypes: {},
      sampleValues: {}
    };
  }
  
  const fieldTypes = {};
  const sampleValues = {};
  const fieldSet = new Set();
  
  // Analyze each document
  documents.forEach(doc => {
    Object.entries(doc).forEach(([key, value]) => {
      fieldSet.add(key);
      
      // Determine type
      const type = getFieldType(value);
      
      if (!fieldTypes[key]) {
        fieldTypes[key] = new Set();
      }
      fieldTypes[key].add(type);
      
      // Store sample value (first non-null)
      if (!sampleValues[key] && value !== null && value !== undefined) {
        sampleValues[key] = formatSampleValue(value, type);
      }
    });
  });
  
  // Convert Sets to arrays for JSON serialization
  const fields = Array.from(fieldSet);
  const fieldTypesObj = {};
  
  fields.forEach(field => {
    fieldTypesObj[field] = Array.from(fieldTypes[field]);
  });
  
  return {
    fields,
    fieldTypes: fieldTypesObj,
    sampleValues
  };
}

/**
 * Determine field type
 */
function getFieldType(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object") return "object";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "double";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") {
    // Detect special string types
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date-string";
    if (/^[a-f0-9]{24}$/.test(value)) return "objectid-string";
    if (value.includes("@")) return "email";
    return "string";
  }
  return "unknown";
}

/**
 * Format sample value for display
 */
function formatSampleValue(value, type) {
  if (type === "array") {
    return Array.isArray(value) ? `[${value.length} items]` : "[]";
  }
  if (type === "object") {
    return `{${Object.keys(value).length} keys}`;
  }
  if (type === "date") {
    return value.toISOString();
  }
  if (typeof value === "string" && value.length > 50) {
    return value.substring(0, 47) + "...";
  }
  return value;
}

/**
 * Format DB info for AI system prompt (Trilingual Enhanced)
 * @param {Object} dbInfo - Database metadata
 * @returns {string} Formatted context for AI
 */
export function formatForAI(dbInfo) {
  if (!dbInfo || !dbInfo.collections || dbInfo.collections.length === 0) {
    return "No collections found in database.";
  }
  
  let context = `📊 DATABASE SCHEMA CONTEXT (Last scanned: ${new Date(dbInfo.scannedAt).toLocaleString()})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 DATABASE OVERVIEW:
  • Total Collections: ${dbInfo.totalCollections}
  • Total Documents: ${dbInfo.totalDocuments.toLocaleString()}
  • Database Size: ${formatBytes(dbInfo.collections.reduce((sum, c) => sum + c.storageSize, 0))}

`;
  
  dbInfo.collections.forEach(col => {
    context += `
📂 Collection: "${col.name}"
   Documents: ${col.documentCount.toLocaleString()} | Avg Size: ${formatBytes(col.avgDocSize)}
   
   🔑 Fields (${col.fields.length}):
`;
    
    col.fields.forEach(field => {
      const types = col.fieldTypes[field]?.join(" | ") || "unknown";
      const sample = col.sampleValues[field];
      const sampleStr = sample !== undefined ? ` → Example: ${JSON.stringify(sample)}` : "";
      context += `      • ${field} (${types})${sampleStr}\n`;
    });
    
    if (col.indexes.length > 0) {
      context += `\n   📌 Indexes (${col.indexes.length}):\n`;
      col.indexes.forEach(idx => {
        const unique = idx.unique ? " [UNIQUE]" : "";
        context += `      • ${idx.name}: [${idx.keys.join(", ")}]${unique}\n`;
      });
    }
  });
  
  context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 FIELD MAPPING RULES (Trilingual Support):

When user mentions these terms, map to actual field names above:
  • "name" / "naam" / "naav" → Check for: firstName, lastName, name, fullName
  • "email" / "ईमेल" → Use exact field: email
  • "phone" / "फोन" → Check for: phone, phoneNumber, mobile
  • "age" / "उम्र" / "वय" → Use exact field: age
  • "address" / "पता" / "पत्ता" → Check for: address, location
  • "id" → Check for: _id, userId, id

⚠️ CRITICAL QUERY GENERATION RULES:
  1. Use ONLY fields that exist in the schema above
  2. For name searches, use $or with firstName + lastName if both exist
  3. Always use case-insensitive regex: {"$regex": "value", "$options": "i"}
  4. When projecting fields, always add "_id": 0 unless specifically requested
  5. Respect indexes - prefer indexed fields for filtering

`;
  
  return context;
}

/**
 * Get schema for specific collections (optimized)
 * @param {string} uri - MongoDB URI
 * @param {Array<string>} collectionNames - Collection names to scan
 * @returns {Promise<Object>} Collection schemas
 */
export async function getCollectionSchemas(uri, collectionNames) {
  let client = null;
  
  try {
    client = await getNativeMongoClient(uri);
    const db = client.db();
    
    const schemas = {};
    
    for (const name of collectionNames) {
      const collection = db.collection(name);
      const sampleDocs = await collection.find({}).limit(5).toArray();
      const schema = inferSchema(sampleDocs);
      
      schemas[name] = {
        fields: schema.fields,
        fieldTypes: schema.fieldTypes,
        sampleValues: schema.sampleValues
      };
    }
    
    await client.close();
    return schemas;
  } catch (error) {
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        console.error("Failed to close client:", closeErr);
      }
    }
    throw error;
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Cache for DB metadata (in-memory)
 */
let dbMetadataCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000 // 5 minutes
};

/**
 * Get cached DB metadata or scan if needed
 * @param {string} uri - MongoDB URI
 * @param {boolean} forceRefresh - Force re-scan
 * @returns {Promise<Object>} Database metadata
 */
export async function getCachedDBMetadata(uri, forceRefresh = false) {
  const now = Date.now();
  
  // Return cache if valid
  if (
    !forceRefresh &&
    dbMetadataCache.data &&
    dbMetadataCache.timestamp &&
    (now - dbMetadataCache.timestamp) < dbMetadataCache.ttl
  ) {
    console.log("✅ Using cached DB metadata");
    return dbMetadataCache.data;
  }
  
  // Scan database
  console.log("🔄 Refreshing DB metadata cache...");
  const metadata = await scanDatabase(uri);
  
  // Update cache
  dbMetadataCache.data = metadata;
  dbMetadataCache.timestamp = now;
  
  return metadata;
}

/**
 * Clear metadata cache
 */
export function clearDBMetadataCache() {
  dbMetadataCache.data = null;
  dbMetadataCache.timestamp = null;
  console.log("🗑️ DB metadata cache cleared");
}