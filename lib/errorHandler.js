// ============================================================================
// lib/errorHandler.js - User-Friendly Error Messages + Solutions
// ============================================================================

/**
 * Convert technical errors into user-friendly messages with solutions
 */
export function translateError(error, context = {}) {
  const errorMessage = error.message || String(error);
  const { action, dbType = 'mongodb', userText } = context;

  // ========================================================================
  // 1. INVALID ACTION ERRORS
  // ========================================================================
  if (errorMessage.includes("Invalid action")) {
    const actionMatch = errorMessage.match(/Invalid action '(\w+)'/);
    const invalidAction = actionMatch ? actionMatch[1] : 'unknown';
    
    return {
      userMessage: `❌ Cannot perform "${invalidAction}" operation`,
      technicalError: errorMessage,
      explanation: `The system doesn't recognize "${invalidAction}" as a valid operation.`,
      solution: `Try using simpler commands like:
• "show all users" - to view data
• "delete users where age > 30" - to remove data
• "update users set status = active" - to modify data
• "count all users" - to count records`,
      suggestedQuery: userText ? `Try rephrasing: "${userText}"` : null
    };
  }

  // ========================================================================
  // 2. MONGODB MODIFIER ERRORS (complex syntax issues)
  // ========================================================================
  if (errorMessage.includes("Modifiers operate on fields")) {
    return {
      userMessage: `❌ Invalid update format - wrong syntax used`,
      technicalError: errorMessage,
      explanation: `MongoDB update operators (like $unset, $set) need to work with field objects, not arrays.`,
      solution: `Correct format for updates:

✅ CORRECT:
• Delete field: { $unset: { "fieldName": "" } }
• Update field: { $set: { "name": "John" } }

❌ WRONG:
• { $unset: ["fieldName"] } - This won't work!

Try asking in plain language:
• "remove the first_name field from users"
• "delete the email column"
• "clear the phone field"`,
      suggestedFix: errorMessage.includes('$unset') 
        ? `Use: { $unset: { "first_name": "" } } instead of array format`
        : null
    };
  }

  // ========================================================================
  // 3. FIELD/COLUMN NOT FOUND
  // ========================================================================
  if (errorMessage.toLowerCase().includes("field") && 
      (errorMessage.includes("not found") || errorMessage.includes("does not exist"))) {
    const fieldMatch = errorMessage.match(/['"]([^'"]+)['"]/);
    const fieldName = fieldMatch ? fieldMatch[1] : 'unknown';
    
    return {
      userMessage: `❌ Field "${fieldName}" doesn't exist in the database`,
      technicalError: errorMessage,
      explanation: `The database doesn't have a field/column named "${fieldName}".`,
      solution: `Check your spelling or try:
• "show all fields" - to see available columns
• "describe the table structure"
• Use the correct field name from your schema`,
      suggestedQuery: `Did you mean one of these fields? Check the available fields first.`
    };
  }

  // ========================================================================
  // 4. SYNTAX ERRORS (malformed queries)
  // ========================================================================
  if (errorMessage.toLowerCase().includes("syntax error") || 
      errorMessage.includes("unexpected token")) {
    return {
      userMessage: `❌ Query syntax error - the command format is incorrect`,
      technicalError: errorMessage,
      explanation: `The generated query has invalid syntax or formatting.`,
      solution: `Try simplifying your request:

Instead of complex queries, use:
• "show me all users"
• "find users with age > 25"
• "delete old records"
• "count total entries"

The AI will handle the technical syntax.`,
      suggestedQuery: userText ? `Simplify: "${userText}"` : null
    };
  }

  // ========================================================================
  // 5. PERMISSION ERRORS
  // ========================================================================
  if (errorMessage.includes("permission denied") || 
      errorMessage.includes("not authorized") ||
      errorMessage.includes("access denied")) {
    return {
      userMessage: `🔒 Permission denied - you don't have access to perform this action`,
      technicalError: errorMessage,
      explanation: `Your database user doesn't have the required permissions.`,
      solution: `Contact your database administrator to:
• Grant read/write permissions
• Update user roles
• Check connection credentials`,
      suggestedQuery: null
    };
  }

  // ========================================================================
  // 6. CONNECTION ERRORS
  // ========================================================================
  if (errorMessage.includes("connection") || 
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("timeout")) {
    return {
      userMessage: `🔌 Cannot connect to database`,
      technicalError: errorMessage,
      explanation: `The application cannot reach your database server.`,
      solution: `Check:
• Is your database running?
• Is the connection string correct?
• Are you connected to the right network/VPN?
• Check firewall settings`,
      suggestedQuery: null
    };
  }

  // ========================================================================
  // 7. TYPE MISMATCH ERRORS
  // ========================================================================
  if (errorMessage.includes("type") && 
      (errorMessage.includes("expected") || errorMessage.includes("mismatch"))) {
    return {
      userMessage: `❌ Data type mismatch - wrong type of value provided`,
      technicalError: errorMessage,
      explanation: `The value you're trying to use doesn't match the expected data type.`,
      solution: `Check:
• Numbers should be: 123 (not "123")
• Text should be: "hello" (in quotes)
• Dates should be in correct format
• Arrays should use [ ] brackets`,
      suggestedQuery: `Try rephrasing with correct value types`
    };
  }

  // ========================================================================
  // 8. DUPLICATE KEY ERRORS
  // ========================================================================
  if (errorMessage.includes("duplicate key") || errorMessage.includes("unique constraint")) {
    return {
      userMessage: `❌ Duplicate entry - this record already exists`,
      technicalError: errorMessage,
      explanation: `A record with this unique value already exists in the database.`,
      solution: `Try:
• Use a different unique value (like email, ID)
• Update the existing record instead of inserting
• Delete the old record first if appropriate`,
      suggestedQuery: `Try "update" instead of "insert"`
    };
  }

  // ========================================================================
  // 9. EMPTY RESULT ERRORS
  // ========================================================================
  if (errorMessage.includes("no documents") || 
      errorMessage.includes("no results") ||
      errorMessage.includes("not found")) {
    return {
      userMessage: `ℹ️ No matching records found`,
      technicalError: errorMessage,
      explanation: `Your query didn't find any matching data.`,
      solution: `Try:
• Broadening your search criteria
• Checking spelling of values
• Removing filters to see all data
• "show all records" to verify data exists`,
      suggestedQuery: null
    };
  }

  // ========================================================================
  // 10. OLLAMA/AI ERRORS
  // ========================================================================
  if (errorMessage.includes("Ollama") || errorMessage.includes("model")) {
    return {
      userMessage: `🤖 AI service error - query generation failed`,
      technicalError: errorMessage,
      explanation: `The AI service (Ollama) is not available or encountered an error.`,
      solution: `Check:
• Is Ollama running? (ollama serve)
• Is the model installed? (ollama pull qwen2.5-coder:7b)
• Restart Ollama service if needed`,
      suggestedQuery: null
    };
  }

  // ========================================================================
  // FALLBACK: Generic error
  // ========================================================================
  return {
    userMessage: `❌ Operation failed`,
    technicalError: errorMessage,
    explanation: `An unexpected error occurred while processing your request.`,
    solution: `Try:
• Simplifying your query
• Checking your input for typos
• Contacting support if the issue persists`,
    suggestedQuery: userText ? `Rephrase: "${userText}"` : null
  };
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error, context = {}) {
  const translated = translateError(error, context);
  
  return {
    ok: false,
    error: translated.userMessage,
    details: {
      message: translated.explanation,
      solution: translated.solution,
      suggestedQuery: translated.suggestedQuery,
      technicalError: process.env.NODE_ENV === 'development' ? translated.technicalError : undefined
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Log error with context
 */
export function logError(error, context = {}) {
  const { requestId, action, userText, dbType } = context;
  
  console.error('\n' + '='.repeat(80));
  console.error('❌ ERROR OCCURRED');
  console.error('='.repeat(80));
  console.error(`Request ID: ${requestId || 'unknown'}`);
  console.error(`Action: ${action || 'unknown'}`);
  console.error(`Database: ${dbType || 'unknown'}`);
  console.error(`User Query: ${userText || 'N/A'}`);
  console.error(`Error: ${error.message || error}`);
  console.error('='.repeat(80) + '\n');
}