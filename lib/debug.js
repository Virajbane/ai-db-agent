// ============================================================================
// lib/debug.js - Enhanced Logging & Universal Validation
// ============================================================================

/**
 * DEBUG UTILITIES - Logs each step of the pipeline
 */
export function logStep(step, data, error = null) {
  const timestamp = new Date().toISOString();
  const status = error ? "❌ ERROR" : "✅ OK";
  console.log(`[${timestamp}] ${status} - ${step}`, data);
  if (error) console.error(error);
}

/**
 * Validate MongoDB URI (legacy - kept for backward compatibility)
 */
export function validateMongoURI(uri) {
  if (!uri) return { valid: false, error: "URI is empty" };
  if (!uri.startsWith("mongodb")) return { valid: false, error: "URI must start with mongodb://" };
  if (!uri.includes("@")) return { valid: false, error: "URI missing authentication (user:pass@)" };
  return { valid: true };
}

/**
 * Universal connection string validator
 */
export function validateConnectionString(uri) {
  if (!uri || typeof uri !== 'string') {
    return { valid: false, error: 'Connection string must be a non-empty string' };
  }
  
  const patterns = {
    mongodb: /^mongodb(\+srv)?:\/\/.+/i,
    postgresql: /^postgres(ql)?:\/\/.+/i,
    mysql: /^mysql:\/\/.+/i,
    redis: /^rediss?:\/\/.+/i
  };
  
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(uri)) {
      return { valid: true, type };
    }
  }
  
  // Check for Supabase
  if (uri.includes('supabase.co')) {
    return { valid: true, type: 'supabase' };
  }
  
  return { 
    valid: false, 
    error: 'Unsupported connection string format. Supported: MongoDB, PostgreSQL, MySQL, Redis, Supabase' 
  };
}

/**
 * Universal action validator - works for all database types
 * Validates MongoDB, PostgreSQL, MySQL, Redis queries
 */
export function validateAction(action) {
  const errors = [];

  // Basic structure validation
  if (!action || typeof action !== 'object') {
    return { valid: false, errors: ['Action must be an object'] };
  }

  // Validate action type
  if (!action.action) {
    errors.push("Missing 'action' field");
  }

  const validActions = ["find", "insert", "update", "delete", "aggregate", "count"];
  if (action.action && !validActions.includes(action.action)) {
    errors.push(`Invalid action '${action.action}'. Must be: ${validActions.join(", ")}`);
  }

  // ========================================================================
  // UNIVERSAL TARGET VALIDATION (collection/table/key)
  // ========================================================================
  const hasCollection = action.collection && typeof action.collection === 'string';
  const hasTable = action.table && typeof action.table === 'string';
  const hasKey = action.key !== undefined; // Redis keys can be strings

  // At least one target must exist
  if (!hasCollection && !hasTable && !hasKey) {
    errors.push("Missing target: must have 'collection' (MongoDB), 'table' (SQL), or 'key' (Redis)");
  }

  // ========================================================================
  // ACTION-SPECIFIC VALIDATION
  // ========================================================================

  switch (action.action) {
    case 'find':
      // Find doesn't require specific fields beyond target
      break;

    case 'aggregate':
      // MongoDB aggregation requires pipeline
      if (hasCollection && (!action.pipeline || !Array.isArray(action.pipeline))) {
        errors.push("Aggregate action must have 'pipeline' array");
      }
      break;

    case 'insert':
      // Insert requires data
      if (!action.insert && !action.data) {
        errors.push("Insert action missing 'insert' or 'data' field (payload)");
      }

      // Validate insert data structure
      const insertData = action.insert || action.data;
      if (insertData) {
        if (typeof insertData !== 'object') {
          errors.push("Insert data must be an object or array");
        }

        // For arrays, check each item
        if (Array.isArray(insertData)) {
          if (insertData.length === 0) {
            errors.push("Insert array cannot be empty");
          }
          insertData.forEach((item, idx) => {
            if (typeof item !== 'object' || item === null) {
              errors.push(`Insert item at index ${idx} must be an object`);
            }
          });
        }
      }
      break;

    case 'update':
      // Update requires update data
      if (!action.update && !action.data && !action.set) {
        errors.push("Update action requires 'update', 'data', or 'set' field");
      }

      // Update should have conditions (query/where)
      const hasUpdateConditions = 
        (action.query && Object.keys(action.query).length > 0) ||
        (action.where && Object.keys(action.where).length > 0);

      if (!hasUpdateConditions) {
        errors.push("Update without query/where conditions would update entire collection/table - BLOCKED");
      }
      break;

    case 'delete':
      // Delete should have conditions
      const hasDeleteConditions = 
        (action.query && Object.keys(action.query).length > 0) ||
        (action.where && Object.keys(action.where).length > 0) ||
        (action.key !== undefined);

      if (!hasDeleteConditions) {
        errors.push("Delete without query/where/key conditions would delete entire collection/table - BLOCKED");
      }
      break;
  }

  // ========================================================================
  // MONGODB-SPECIFIC VALIDATION
  // ========================================================================
  if (hasCollection) {
    // Validate sort options
    if (action.options?.sort) {
      const sortObj = action.options.sort;
      if (typeof sortObj !== 'object') {
        errors.push("Sort must be an object");
      } else {
        Object.entries(sortObj).forEach(([field, value]) => {
          if (value !== 1 && value !== -1) {
            errors.push(`Invalid sort value for field "${field}": ${value}. Must be 1 (ascending) or -1 (descending)`);
          }
        });
      }
    }

    // Validate projection
    if (action.options?.projection) {
      const projObj = action.options.projection;
      if (typeof projObj !== 'object') {
        errors.push("Projection must be an object");
      }
    }

    // Validate limit
    if (action.options?.limit !== undefined) {
      const limit = action.options.limit;
      if (typeof limit !== 'number' || limit < 0) {
        errors.push("Limit must be a non-negative number");
      }
    }

    // Validate skip
    if (action.options?.skip !== undefined) {
      const skip = action.options.skip;
      if (typeof skip !== 'number' || skip < 0) {
        errors.push("Skip must be a non-negative number");
      }
    }
  }

  // ========================================================================
  // SQL-SPECIFIC VALIDATION (PostgreSQL, MySQL, Supabase)
  // ========================================================================
  if (hasTable) {
    // Validate where clause
    if (action.where && typeof action.where !== 'object') {
      errors.push("Where clause must be an object");
    }

    // Validate limit
    if (action.limit !== undefined) {
      if (typeof action.limit !== 'number' || action.limit < 0) {
        errors.push("Limit must be a non-negative number");
      }
    }

    // Validate offset
    if (action.offset !== undefined) {
      if (typeof action.offset !== 'number' || action.offset < 0) {
        errors.push("Offset must be a non-negative number");
      }
    }

    // Validate sort
    if (action.sort) {
      const sortObj = action.sort;
      if (typeof sortObj !== 'object') {
        errors.push("Sort must be an object");
      } else {
        Object.entries(sortObj).forEach(([field, value]) => {
          if (value !== 1 && value !== -1) {
            errors.push(`Invalid sort value for field "${field}": ${value}. Must be 1 (ASC) or -1 (DESC)`);
          }
        });
      }
    }

    // Validate fields (projection for SQL)
    if (action.fields !== undefined && !Array.isArray(action.fields)) {
      errors.push("Fields must be an array of column names");
    }
  }

  // ========================================================================
  // REDIS-SPECIFIC VALIDATION
  // ========================================================================
  if (hasKey && !hasCollection && !hasTable) {
    // Redis operations are simpler, key is the main requirement
    if (action.action === 'insert' && !action.value && !action.data) {
      errors.push("Redis insert requires 'value' or 'data' field");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect database type from action structure
 */
export function detectActionDatabaseType(action) {
  if (action.collection) return 'mongodb';
  if (action.table) return 'sql';
  if (action.key && !action.collection && !action.table) return 'redis';
  return null;
}

/**
 * Format action for logging (sanitize sensitive data)
 */
export function sanitizeActionForLogging(action) {
  const sanitized = { ...action };

  // Remove potentially sensitive data from logs
  if (sanitized.insert && Array.isArray(sanitized.insert) && sanitized.insert.length > 3) {
    sanitized.insert = [
      ...sanitized.insert.slice(0, 2),
      `... (${sanitized.insert.length - 2} more items)`
    ];
  }

  return sanitized;
}