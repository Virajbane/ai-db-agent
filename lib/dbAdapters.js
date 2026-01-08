// ============================================================================
// lib/dbAdapters.js - Multi-Database Adapter System
// ============================================================================

import { MongoClient } from "mongodb";
import pg from "pg";
import mysql from "mysql2/promise";
import { createClient as createRedisClient } from "redis";

// ============================================================================
// DATABASE TYPE DETECTION
// ============================================================================

export function detectDatabaseType(connectionString) {
  if (!connectionString) return null;
  
  const lower = connectionString.toLowerCase();
  
  if (lower.startsWith("mongodb://") || lower.startsWith("mongodb+srv://")) {
    return "mongodb";
  }
  if (lower.startsWith("postgresql://") || lower.startsWith("postgres://")) {
    return "postgresql";
  }
  if (lower.startsWith("mysql://")) {
    return "mysql";
  }
  if (lower.startsWith("redis://") || lower.startsWith("rediss://")) {
    return "redis";
  }
  if (lower.includes("supabase.co") || lower.includes("supabase.")) {
    return "supabase"; // PostgreSQL-based
  }
  
  return null;
}

// ============================================================================
// BASE ADAPTER INTERFACE
// ============================================================================

class DatabaseAdapter {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.client = null;
  }

  async connect() {
    throw new Error("connect() must be implemented by subclass");
  }

  async disconnect() {
    throw new Error("disconnect() must be implemented by subclass");
  }

  async introspect() {
    throw new Error("introspect() must be implemented by subclass");
  }

  async execute(action) {
    throw new Error("execute() must be implemented by subclass");
  }

  async testConnection() {
    throw new Error("testConnection() must be implemented by subclass");
  }
}

// ============================================================================
// MONGODB ADAPTER
// ============================================================================

export class MongoDBAdapter extends DatabaseAdapter {
  async connect() {
    this.client = new MongoClient(this.connectionString);
    await this.client.connect();
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async testConnection() {
    try {
      const client = await this.connect();
      await client.db().admin().ping();
      await this.disconnect();
      return { ok: true, message: "MongoDB connection successful" };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async introspect() {
    const client = await this.connect();
    const db = client.db();
    
    const collections = await db.listCollections().toArray();
    const dbInfo = [];

    for (const col of collections) {
      try {
        const collection = db.collection(col.name);
        const sampleDocs = await collection.find({}).limit(10).toArray();
        const indexes = await collection.indexes();
        const count = await collection.countDocuments();
        
        const schema = this._inferSchema(sampleDocs);
        
        dbInfo.push({
          name: col.name,
          type: "collection",
          fields: schema.fields,
          fieldTypes: schema.fieldTypes,
          sampleValues: schema.sampleValues,
          indexes: indexes.map(idx => ({
            name: idx.name,
            keys: Object.keys(idx.key),
            unique: idx.unique || false
          })),
          documentCount: count
        });
      } catch (err) {
        console.error(`Failed to analyze ${col.name}:`, err.message);
      }
    }

    await this.disconnect();

    return {
      type: "mongodb",
      collections: dbInfo,
      totalCollections: dbInfo.length,
      totalDocuments: dbInfo.reduce((sum, c) => sum + c.documentCount, 0),
      scannedAt: new Date().toISOString()
    };
  }

  async execute(action) {
    const client = await this.connect();
    const db = client.db();
    const col = db.collection(action.collection);

    let result;

    try {
      switch (action.action) {
        case "find":
          const limit = action.options?.limit || 100;
          const sort = action.options?.sort || {};
          const skip = action.options?.skip || 0;
          const projection = action.options?.projection || null;
          
          let cursor = col.find(action.query || {});
          
          if (skip > 0) cursor = cursor.skip(skip);
          if (projection) cursor = cursor.project(projection);
          
          result = await cursor.sort(sort).limit(limit).toArray();
          break;

        case "aggregate":
          result = await col.aggregate(action.pipeline || []).toArray();
          break;

        case "insert":
          const payload = Array.isArray(action.insert) ? action.insert : [action.insert];
          const insertRes = await col.insertMany(payload);
          result = { insertedIds: insertRes.insertedIds, insertedCount: insertRes.insertedCount };
          break;

        case "update":
          const updateRes = await col.updateMany(action.query || {}, action.update || {});
          result = { 
            matchedCount: updateRes.matchedCount, 
            modifiedCount: updateRes.modifiedCount 
          };
          break;

        case "delete":
          if (!action.query || Object.keys(action.query).length === 0) {
            throw new Error("Delete requires a query condition");
          }
          const deleteRes = await col.deleteMany(action.query);
          result = { deletedCount: deleteRes.deletedCount };
          break;

        default:
          throw new Error(`Unsupported action: ${action.action}`);
      }
    } finally {
      await this.disconnect();
    }

    return result;
  }

  _inferSchema(documents) {
    if (!documents || documents.length === 0) {
      return { fields: [], fieldTypes: {}, sampleValues: {} };
    }

    const fieldTypes = {};
    const sampleValues = {};
    const fieldSet = new Set();

    documents.forEach(doc => {
      Object.entries(doc).forEach(([key, value]) => {
        fieldSet.add(key);
        
        const type = this._getFieldType(value);
        if (!fieldTypes[key]) fieldTypes[key] = new Set();
        fieldTypes[key].add(type);
        
        if (!sampleValues[key] && value !== null) {
          sampleValues[key] = this._formatSampleValue(value, type);
        }
      });
    });

    const fields = Array.from(fieldSet);
    const fieldTypesObj = {};
    fields.forEach(field => {
      fieldTypesObj[field] = Array.from(fieldTypes[field]);
    });

    return { fields, fieldTypes: fieldTypesObj, sampleValues };
  }

  _getFieldType(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (value instanceof Date) return "date";
    if (typeof value === "object") return "object";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "double";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date-string";
      if (value.includes("@")) return "email";
      return "string";
    }
    return "unknown";
  }

  _formatSampleValue(value, type) {
    if (type === "array") return `[${value.length} items]`;
    if (type === "object") return `{${Object.keys(value).length} keys}`;
    if (type === "date") return value.toISOString();
    if (typeof value === "string" && value.length > 50) return value.substring(0, 47) + "...";
    return value;
  }
}

// ============================================================================
// POSTGRESQL ADAPTER (including Supabase)
// ============================================================================

export class PostgreSQLAdapter extends DatabaseAdapter {
  async connect() {
    const { Client } = pg;
    this.client = new Client({ connectionString: this.connectionString });
    await this.client.connect();
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async testConnection() {
    try {
      const client = await this.connect();
      await client.query("SELECT 1");
      await this.disconnect();
      return { ok: true, message: "PostgreSQL connection successful" };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async introspect() {
    const client = await this.connect();
    
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;
    
    const { rows: tables } = await client.query(tablesQuery);
    const dbInfo = [];

    for (const table of tables) {
      const tableName = table.table_name;
      
      try {
        const columnsQuery = `
          SELECT 
            column_name, 
            data_type, 
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE table_name = $1
          ORDER BY ordinal_position
        `;
        
        const { rows: columns } = await client.query(columnsQuery, [tableName]);
        
        const countQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
        const { rows: countResult } = await client.query(countQuery);
        const count = parseInt(countResult[0].count);
        
        const sampleQuery = `SELECT * FROM "${tableName}" LIMIT 5`;
        const { rows: samples } = await client.query(sampleQuery);
        
        const indexQuery = `
          SELECT 
            indexname, 
            indexdef 
          FROM pg_indexes 
          WHERE tablename = $1
        `;
        const { rows: indexes } = await client.query(indexQuery, [tableName]);
        
        const fieldTypes = {};
        const sampleValues = {};
        
        columns.forEach(col => {
          fieldTypes[col.column_name] = [this._mapPostgreSQLType(col.data_type)];
          
          if (samples.length > 0 && samples[0][col.column_name] !== null) {
            sampleValues[col.column_name] = samples[0][col.column_name];
          }
        });
        
        dbInfo.push({
          name: tableName,
          type: "table",
          fields: columns.map(c => c.column_name),
          fieldTypes,
          sampleValues,
          indexes: indexes.map(idx => ({
            name: idx.indexname,
            definition: idx.indexdef
          })),
          documentCount: count
        });
      } catch (err) {
        console.error(`Failed to analyze ${tableName}:`, err.message);
      }
    }

    await this.disconnect();

    return {
      type: "postgresql",
      collections: dbInfo,
      totalCollections: dbInfo.length,
      totalDocuments: dbInfo.reduce((sum, c) => sum + c.documentCount, 0),
      scannedAt: new Date().toISOString()
    };
  }

  async execute(action) {
    const client = await this.connect();
    let result;

    try {
      switch (action.action) {
        case "find":
          result = await this._executeSelect(client, action);
          break;
        case "insert":
          result = await this._executeInsert(client, action);
          break;
        case "update":
          result = await this._executeUpdate(client, action);
          break;
        case "delete":
          result = await this._executeDelete(client, action);
          break;
        default:
          throw new Error(`Unsupported action: ${action.action}`);
      }
    } finally {
      await this.disconnect();
    }

    return result;
  }

  async _executeSelect(client, action) {
    const table = action.table || action.collection;
    const limit = action.limit || action.options?.limit || 100;
    const offset = action.offset || action.options?.skip || 0;
    
    let query = `SELECT * FROM "${table}"`;
    const params = [];
    
    if (action.where || action.query) {
      const conditions = action.where || action.query;
      const whereClauses = [];
      let paramIndex = 1;
      
      for (const [field, value] of Object.entries(conditions)) {
        whereClauses.push(`"${field}" = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
      
      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }
    }
    
    if (action.sort || action.options?.sort) {
      const sort = action.sort || action.options.sort;
      const orderClauses = Object.entries(sort).map(([field, dir]) => 
        `"${field}" ${dir === -1 ? "DESC" : "ASC"}`
      );
      query += ` ORDER BY ${orderClauses.join(", ")}`;
    }
    
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    
    const { rows } = await client.query(query, params);
    return rows;
  }

  async _executeInsert(client, action) {
    const table = action.table || action.collection;
    const data = action.insert || action.data;
    const records = Array.isArray(data) ? data : [data];
    
    if (records.length === 0) {
      return { insertedCount: 0 };
    }
    
    const fields = Object.keys(records[0]);
    const fieldList = fields.map(f => `"${f}"`).join(", ");
    
    let insertedCount = 0;
    
    for (const record of records) {
      const values = fields.map(f => record[f]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const query = `INSERT INTO "${table}" (${fieldList}) VALUES (${placeholders})`;
      
      await client.query(query, values);
      insertedCount++;
    }
    
    return { insertedCount };
  }

  async _executeUpdate(client, action) {  // ✅ Accept both parameters
  console.log('🔍 UPDATE action received:', JSON.stringify(action, null, 2));
  
  const table = action.table || action.collection;
  
  // Get update data
  const updateData = action.set || action.data || action.update;
  
  if (!updateData) {
    throw new Error('Update action requires "set", "data", or "update" field. Received keys: ' + Object.keys(action).join(', '));
  }
  
  if (typeof updateData !== 'object' || updateData === null) {
    throw new Error('Update data must be an object');
  }
  
  // Build SET clause
  const setEntries = Object.entries(updateData);
  
  if (setEntries.length === 0) {
    throw new Error('Update data cannot be empty');
  }
  
  const setClause = setEntries
    .map(([key], idx) => `"${key}" = $${idx + 1}`)
    .join(', ');
  
  const setValues = setEntries.map(([, value]) => value);
  
  // Build WHERE clause
  let whereClause = '';
  let whereValues = [];
  
  if (action.where && Object.keys(action.where).length > 0) {
    const whereEntries = Object.entries(action.where);
    whereClause = 'WHERE ' + whereEntries
      .map(([key], idx) => `"${key}" = $${setEntries.length + idx + 1}`)
      .join(' AND ');
    whereValues = whereEntries.map(([, value]) => value);
  } else {
    console.warn('⚠️ WARNING: UPDATE without WHERE clause will update ALL rows!');
  }
  
  // Combine values
  const values = [...setValues, ...whereValues];
  
  // Build final query
  const query = `UPDATE "${table}" SET ${setClause} ${whereClause}`.trim();
  
  console.log('🔧 PostgreSQL UPDATE query:', query);
  console.log('📊 Values:', values);
  
  try {
    const result = await client.query(query, values);  // ✅ Use client parameter
    
    console.log('✅ UPDATE successful:', result.rowCount, 'rows affected');
    
    return {
      modifiedCount: result.rowCount || 0,
      matchedCount: result.rowCount || 0
    };
  } catch (error) {
    console.error('❌ PostgreSQL UPDATE failed:', error.message);
    throw new Error(`PostgreSQL UPDATE failed: ${error.message}`);
  }
}

  async _executeDelete(client, action) {
    const table = action.table || action.collection;
    const conditions = action.where || action.query;
    
    if (!conditions || Object.keys(conditions).length === 0) {
      throw new Error("Delete requires WHERE conditions");
    }
    
    const whereClauses = [];
    const params = [];
    let paramIndex = 1;
    
    for (const [field, value] of Object.entries(conditions)) {
      whereClauses.push(`"${field}" = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
    
    const query = `DELETE FROM "${table}" WHERE ${whereClauses.join(" AND ")}`;
    const result = await client.query(query, params);
    
    return { deletedCount: result.rowCount };
  }

  _mapPostgreSQLType(pgType) {
    const typeMap = {
      "integer": "integer",
      "bigint": "integer",
      "smallint": "integer",
      "numeric": "double",
      "real": "double",
      "double precision": "double",
      "character varying": "string",
      "varchar": "string",
      "text": "string",
      "char": "string",
      "boolean": "boolean",
      "date": "date",
      "timestamp": "date",
      "timestamptz": "date",
      "json": "object",
      "jsonb": "object",
      "array": "array"
    };
    
    return typeMap[pgType.toLowerCase()] || pgType;
  }
}

// ============================================================================
// MYSQL ADAPTER
// ============================================================================

export class MySQLAdapter extends DatabaseAdapter {
  async connect() {
    this.client = await mysql.createConnection(this.connectionString);
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async testConnection() {
    try {
      const client = await this.connect();
      await client.query("SELECT 1");
      await this.disconnect();
      return { ok: true, message: "MySQL connection successful" };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async introspect() {
    const client = await this.connect();
    
    const [tables] = await client.query("SHOW TABLES");
    const dbInfo = [];

    for (const tableRow of tables) {
      const tableName = Object.values(tableRow)[0];
      
      try {
        const [columns] = await client.query(`DESCRIBE ${tableName}`);
        const [countResult] = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = countResult[0].count;
        const [samples] = await client.query(`SELECT * FROM ${tableName} LIMIT 5`);
        const [indexes] = await client.query(`SHOW INDEX FROM ${tableName}`);
        
        const fieldTypes = {};
        const sampleValues = {};
        
        columns.forEach(col => {
          fieldTypes[col.Field] = [this._mapMySQLType(col.Type)];
          
          if (samples.length > 0 && samples[0][col.Field] !== null) {
            sampleValues[col.Field] = samples[0][col.Field];
          }
        });
        
        dbInfo.push({
          name: tableName,
          type: "table",
          fields: columns.map(c => c.Field),
          fieldTypes,
          sampleValues,
          indexes: [...new Set(indexes.map(idx => idx.Key_name))].map(name => ({ name })),
          documentCount: count
        });
      } catch (err) {
        console.error(`Failed to analyze ${tableName}:`, err.message);
      }
    }

    await this.disconnect();

    return {
      type: "mysql",
      collections: dbInfo,
      totalCollections: dbInfo.length,
      totalDocuments: dbInfo.reduce((sum, c) => sum + c.documentCount, 0),
      scannedAt: new Date().toISOString()
    };
  }

  async execute(action) {
    const client = await this.connect();
    let result;

    try {
      switch (action.action) {
        case "find":
          result = await this._executeSelect(client, action);
          break;
        case "insert":
          result = await this._executeInsert(client, action);
          break;
        case "update":
          result = await this._executeUpdate(client, action);
          break;
        case "delete":
          result = await this._executeDelete(client, action);
          break;
        default:
          throw new Error(`Unsupported action: ${action.action}`);
      }
    } finally {
      await this.disconnect();
    }

    return result;
  }

  async _executeSelect(client, action) {
    const table = action.table || action.collection;
    const limit = action.limit || action.options?.limit || 100;
    const offset = action.offset || action.options?.skip || 0;
    
    let query = `SELECT * FROM ${table}`;
    const params = [];
    
    if (action.where || action.query) {
      const conditions = action.where || action.query;
      const whereClauses = [];
      
      for (const [field, value] of Object.entries(conditions)) {
        whereClauses.push(`${field} = ?`);
        params.push(value);
      }
      
      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }
    }
    
    if (action.sort || action.options?.sort) {
      const sort = action.sort || action.options.sort;
      const orderClauses = Object.entries(sort).map(([field, dir]) => 
        `${field} ${dir === -1 ? "DESC" : "ASC"}`
      );
      query += ` ORDER BY ${orderClauses.join(", ")}`;
    }
    
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    
    const [rows] = await client.query(query, params);
    return rows;
  }

  async _executeInsert(client, action) {
    const table = action.table || action.collection;
    const data = action.insert || action.data;
    const records = Array.isArray(data) ? data : [data];
    
    if (records.length === 0) {
      return { insertedCount: 0 };
    }
    
    const fields = Object.keys(records[0]);
    const fieldList = fields.join(", ");
    const placeholders = fields.map(() => "?").join(", ");
    
    let insertedCount = 0;
    
    for (const record of records) {
      const values = fields.map(f => record[f]);
      const query = `INSERT INTO ${table} (${fieldList}) VALUES (${placeholders})`;
      
      await client.query(query, values);
      insertedCount++;
    }
    
    return { insertedCount };
  }

  async _executeUpdate(client, action) {
    const table = action.table || action.collection;
    const updates = action.update || action.data;
    const conditions = action.where || action.query;
    
    if (!conditions || Object.keys(conditions).length === 0) {
      throw new Error("Update requires WHERE conditions");
    }
    
    const setClauses = [];
    const params = [];
    
    for (const [field, value] of Object.entries(updates)) {
      setClauses.push(`${field} = ?`);
      params.push(value);
    }
    
    const whereClauses = [];
    for (const [field, value] of Object.entries(conditions)) {
      whereClauses.push(`${field} = ?`);
      params.push(value);
    }
    
    const query = `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`;
    const [result] = await client.query(query, params);
    
    return { modifiedCount: result.affectedRows };
  }

  async _executeDelete(client, action) {
    const table = action.table || action.collection;
    const conditions = action.where || action.query;
    
    if (!conditions || Object.keys(conditions).length === 0) {
      throw new Error("Delete requires WHERE conditions");
    }
    
    const whereClauses = [];
    const params = [];
    
    for (const [field, value] of Object.entries(conditions)) {
      whereClauses.push(`${field} = ?`);
      params.push(value);
    }
    
    const query = `DELETE FROM ${table} WHERE ${whereClauses.join(" AND ")}`;
    const [result] = await client.query(query, params);
    
    return { deletedCount: result.affectedRows };
  }

  _mapMySQLType(mysqlType) {
    const type = mysqlType.toLowerCase();
    
    if (type.includes("int")) return "integer";
    if (type.includes("decimal") || type.includes("float") || type.includes("double")) return "double";
    if (type.includes("char") || type.includes("text")) return "string";
    if (type.includes("bool")) return "boolean";
    if (type.includes("date") || type.includes("time")) return "date";
    if (type.includes("json")) return "object";
    
    return "string";
  }
}

// ============================================================================
// REDIS ADAPTER
// ============================================================================

export class RedisAdapter extends DatabaseAdapter {
  async connect() {
    this.client = createRedisClient({ url: this.connectionString });
    await this.client.connect();
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  async testConnection() {
    try {
      const client = await this.connect();
      await client.ping();
      await this.disconnect();
      return { ok: true, message: "Redis connection successful" };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async introspect() {
    const client = await this.connect();
    
    const keys = await client.keys("*");
    const keysByPattern = {};
    
    for (const key of keys.slice(0, 100)) {
      const type = await client.type(key);
      const pattern = this._extractPattern(key);
      
      if (!keysByPattern[pattern]) {
        keysByPattern[pattern] = {
          pattern,
          type,
          count: 0,
          sampleKeys: []
        };
      }
      
      keysByPattern[pattern].count++;
      if (keysByPattern[pattern].sampleKeys.length < 3) {
        keysByPattern[pattern].sampleKeys.push(key);
      }
    }
    
    await this.disconnect();
    
    return {
      type: "redis",
      collections: Object.values(keysByPattern).map(p => ({
        name: p.pattern,
        type: "redis-" + p.type,
        fields: ["key", "value"],
        fieldTypes: { key: ["string"], value: [p.type] },
        sampleValues: { key: p.sampleKeys[0] || "" },
        documentCount: p.count
      })),
      totalCollections: Object.keys(keysByPattern).length,
      totalDocuments: keys.length,
      scannedAt: new Date().toISOString()
    };
  }

  async execute(action) {
    const client = await this.connect();
    let result;

    try {
      switch (action.action) {
        case "find":
          result = await this._executeGet(client, action);
          break;
        case "insert":
          result = await this._executeSet(client, action);
          break;
        case "delete":
          result = await this._executeDelete(client, action);
          break;
        default:
          throw new Error(`Unsupported action for Redis: ${action.action}`);
      }
    } finally {
      await this.disconnect();
    }

    return result;
  }

  async _executeGet(client, action) {
    const pattern = action.key || action.query?.key || "*";
    const keys = await client.keys(pattern);
    
    const results = [];
    const limit = Math.min(keys.length, action.options?.limit || 100);
    
    for (let i = 0; i < limit; i++) {
      const key = keys[i];
      const type = await client.type(key);
      let value;
      
      switch (type) {
        case "string":
          value = await client.get(key);
          break;
        case "hash":
          value = await client.hGetAll(key);
          break;
        case "list":
          value = await client.lRange(key, 0, -1);
          break;
        case "set":
          value = await client.sMembers(key);
          break;
        default:
          value = null;
      }
      
      results.push({ key, type, value });
    }
    
    return results;
  }

  async _executeSet(client, action) {
    const data = action.insert || action.data;
    const records = Array.isArray(data) ? data : [data];
    
    let insertedCount = 0;
    
    for (const record of records) {
      if (record.key && record.value !== undefined) {
        await client.set(record.key, 
          typeof record.value === "object" ? JSON.stringify(record.value) : record.value
        );
        insertedCount++;
      }
    }
    
    return { insertedCount };
  }

  async _executeDelete(client, action) {
    const key = action.key || action.query?.key;
    
    if (!key) {
      throw new Error("Delete requires a key");
    }
    
    const deletedCount = await client.del(key);
    return { deletedCount };
  }

  _extractPattern(key) {
    const parts = key.split(":");
    if (parts.length > 1) {
      return parts[0] + ":*";
    }
    return key;
  }
}

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

export function createDatabaseAdapter(connectionString) {
  const dbType = detectDatabaseType(connectionString);
  
  switch (dbType) {
    case "mongodb":
      return new MongoDBAdapter(connectionString);
    
    case "postgresql":
    case "supabase":
      return new PostgreSQLAdapter(connectionString);
    
    case "mysql":
      return new MySQLAdapter(connectionString);
    
    case "redis":
      return new RedisAdapter(connectionString);
    
    default:
      throw new Error(`Unsupported database type: ${dbType}. Supported: MongoDB, PostgreSQL, MySQL, Redis, Supabase`);
  }
}