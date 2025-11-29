/**
 * DEBUG UTILITIES - Add this to test each step of the pipeline
 * Import in your routes to log exactly what's happening
 */

export function logStep(step, data, error = null) {
  const timestamp = new Date().toISOString();
  const status = error ? "❌ ERROR" : "✅ OK";
  console.log(`[${timestamp}] ${status} - ${step}`, data);
  if (error) console.error(error);
}

export function validateMongoURI(uri) {
  if (!uri) return { valid: false, error: "URI is empty" };
  if (!uri.startsWith("mongodb")) return { valid: false, error: "URI must start with mongodb://" };
  if (!uri.includes("@")) return { valid: false, error: "URI missing authentication (user:pass@)" };
  return { valid: true };
}

export function validateAction(action) {
  const errors = [];

  if (!action.action) errors.push("Missing 'action' field");
  if (!action.collection) errors.push("Missing 'collection' field");

  const validActions = ["find", "insert", "update", "delete", "aggregate"];
  if (action.action && !validActions.includes(action.action)) {
    errors.push(`Invalid action '${action.action}'. Must be: ${validActions.join(", ")}`);
  }

  if (action.action === "delete" && (!action.query || Object.keys(action.query).length === 0)) {
    errors.push("Delete without query would delete entire collection - BLOCKED");
  }

  if (action.action === "update" && (!action.query || Object.keys(action.query).length === 0)) {
    errors.push("Update without query would update entire collection - BLOCKED");
  }

  if (action.action === "insert" && !action.insert) {
    errors.push("Insert action missing 'insert' field (payload)");
  }

  if (action.action === "aggregate" && !Array.isArray(action.pipeline)) {
    errors.push("Aggregate action must have 'pipeline' array");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}