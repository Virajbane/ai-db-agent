// ============================================================================
// lib/db.js - Universal Database Connection Manager
// ============================================================================

import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import { createDatabaseAdapter, detectDatabaseType } from "./dbAdapters";

/**
 * Legacy: connectWithMongoose(uri) - used to validate MongoDB connection
 */
export async function connectWithMongoose(uri) {
  if (!uri) throw new Error("Mongo URI required");
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri);
  return mongoose;
}

/**
 * Legacy: getNativeMongoClient(uri) - returns a native mongodb client
 */
export async function getNativeMongoClient(uri) {
  if (!uri) throw new Error("Mongo URI required");
  const client = new MongoClient(uri);
  await client.connect();
  return client;
}

/**
 * NEW: Universal database client getter
 * Returns appropriate client based on connection string
 * @param {string} uri - Database connection string
 * @returns {Promise<Object>} Database adapter with execute() method
 */
export async function getUniversalClient(uri) {
  if (!uri) throw new Error("Database URI required");
  
  const dbType = detectDatabaseType(uri);
  
  if (!dbType) {
    throw new Error(
      "Unsupported database type. Supported: MongoDB, PostgreSQL, MySQL, Redis, Supabase"
    );
  }
  
  console.log(`🔌 Creating ${dbType.toUpperCase()} adapter...`);
  
  const adapter = createDatabaseAdapter(uri);
  
  // Connect to database
  await adapter.connect();
  
  console.log(`✅ Connected to ${dbType.toUpperCase()}`);
  
  return {
    adapter,
    dbType,
    close: async () => {
      await adapter.disconnect();
    }
  };
}

/**
 * Test any database connection
 * @param {string} uri - Database connection string
 * @returns {Promise<Object>} Connection test result
 */
export async function testUniversalConnection(uri) {
  try {
    const dbType = detectDatabaseType(uri);
    
    if (!dbType) {
      return { 
        ok: false, 
        error: "Could not detect database type from connection string" 
      };
    }
    
    const adapter = createDatabaseAdapter(uri);
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