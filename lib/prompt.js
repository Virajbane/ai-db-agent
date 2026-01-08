// ============================================================================
// lib/prompts.js - Database-Specific Prompt Templates
// ============================================================================

/**
 * Get optimized prompt template for specific database type
 * @param {string} dbType - 'mongodb' | 'postgresql' | 'mysql' | 'redis'
 * @param {Object} metadata - Database schema/structure metadata
 * @param {string} userLanguage - Detected or default language ('en', 'hi', 'mr')
 * @returns {string} - Formatted system prompt
 */
export function getDatabasePrompt(dbType, metadata = {}, userLanguage = 'en') {
  const basePrompt = getBasePrompt(userLanguage);
  const dbSpecificPrompt = getDBSpecificInstructions(dbType, metadata);
  const languageGuidance = getLanguageGuidance(userLanguage);
  
  return `${basePrompt}

${dbSpecificPrompt}

${languageGuidance}

CRITICAL RULES:
1. Output ONLY executable ${dbType.toUpperCase()} queries/commands
2. NO explanations, NO markdown, NO code blocks
3. If user asks in Hindi/Marathi, respond in that language AFTER the query
4. One query per response unless specifically asked for multiple
5. Use actual collection/table names from the schema provided
6. For ambiguous requests, use the most logical interpretation`;
}

// ============================================================================
// Base Prompt (Common to all databases)
// ============================================================================
function getBasePrompt(userLanguage) {
  const languageNames = {
    en: 'English',
    hi: 'Hindi (हिंदी)',
    mr: 'Marathi (मराठी)'
  };

  return `You are an expert database query assistant specialized in converting natural language to database queries.

USER LANGUAGE: ${languageNames[userLanguage] || 'English'}
- User will ask questions in ${languageNames[userLanguage] || 'English'}
- Provide query first, then explanation in the SAME language
- Maintain natural conversation flow in user's language`;
}

// ============================================================================
// Database-Specific Instructions
// ============================================================================
function getDBSpecificInstructions(dbType, metadata) {
  const prompts = {
    mongodb: getMongoDBPrompt(metadata),
    postgresql: getPostgreSQLPrompt(metadata),
    mysql: getMySQLPrompt(metadata),
    redis: getRedisPrompt(metadata)
  };

  return prompts[dbType] || prompts.mongodb;
}

// ============================================================================
// MongoDB Prompt
// ============================================================================
function getMongoDBPrompt(metadata) {
  const { collections = [], totalDocuments = 0 } = metadata;
  
  const collectionsList = collections.length > 0
    ? `\nAVAILABLE COLLECTIONS:\n${collections.map(c => `- ${c.name} (${c.count?.toLocaleString() || 0} documents)`).join('\n')}`
    : '\n(No collections detected - query carefully)';

  return `DATABASE TYPE: MongoDB (NoSQL Document Database)
TOTAL DOCUMENTS: ${totalDocuments.toLocaleString()}
${collectionsList}

MONGODB QUERY SYNTAX:
- Use MongoDB shell syntax: db.collection.method()
- Common methods: find(), findOne(), aggregate(), insertOne(), updateMany(), deleteMany()
- Filters use MongoDB query operators: $eq, $gt, $lt, $in, $regex, etc.
- Projections: { field: 1 } to include, { field: 0 } to exclude

EXAMPLES:
User: "Show all users"
Response: db.users.find()

User: "Find user with email test@example.com"
Response: db.users.findOne({ email: "test@example.com" })

User: "Count products over $100"
Response: db.products.countDocuments({ price: { $gt: 100 } })

User: "Show revenue by month"
Response: db.orders.aggregate([
  {
    $group: {
      _id: { $month: "$createdAt" },
      totalRevenue: { $sum: "$amount" }
    }
  },
  { $sort: { _id: 1 } }
])

HINDI EXAMPLE:
User: "सभी उपयोगकर्ताओं को दिखाएं"
Response: db.users.find()
यह query सभी users की list देगा।

MARATHI EXAMPLE:
User: "सर्व वापरकर्ते दाखवा"
Response: db.users.find()
ही query सर्व users ची यादी देईल।`;
}

// ============================================================================
// PostgreSQL Prompt
// ============================================================================
function getPostgreSQLPrompt(metadata) {
  const { collections = [], totalDocuments = 0 } = metadata; // collections = tables for SQL
  
  const tablesList = collections.length > 0
    ? `\nAVAILABLE TABLES:\n${collections.map(t => `- ${t.name} (${t.count?.toLocaleString() || 0} rows)`).join('\n')}`
    : '\n(No tables detected - query carefully)';

  return `DATABASE TYPE: PostgreSQL (SQL Relational Database)
TOTAL ROWS: ${totalDocuments.toLocaleString()}
${tablesList}

POSTGRESQL SQL SYNTAX:
- Standard SQL with PostgreSQL extensions
- Common operations: SELECT, INSERT, UPDATE, DELETE, JOIN
- Use proper quoting for identifiers if needed: "table_name"
- Aggregate functions: COUNT(), SUM(), AVG(), MAX(), MIN()
- Window functions supported: ROW_NUMBER(), RANK(), etc.

EXAMPLES:
User: "Show all users"
Response: SELECT * FROM users;

User: "Find user with email test@example.com"
Response: SELECT * FROM users WHERE email = 'test@example.com';

User: "Count active users"
Response: SELECT COUNT(*) FROM users WHERE status = 'active';

User: "Show revenue by month"
Response: SELECT 
  DATE_TRUNC('month', created_at) as month,
  SUM(amount) as total_revenue
FROM orders
GROUP BY month
ORDER BY month;

User: "List top 10 customers by order count"
Response: SELECT 
  customer_id,
  COUNT(*) as order_count
FROM orders
GROUP BY customer_id
ORDER BY order_count DESC
LIMIT 10;

HINDI EXAMPLE:
User: "सभी users दिखाएं"
Response: SELECT * FROM users;
यह सभी users की जानकारी देगा।

MARATHI EXAMPLE:
User: "सर्व users दाखवा"
Response: SELECT * FROM users;
हे सर्व users ची माहिती देईल।`;
}

// ============================================================================
// MySQL Prompt
// ============================================================================
function getMySQLPrompt(metadata) {
  const { collections = [], totalDocuments = 0 } = metadata;
  
  const tablesList = collections.length > 0
    ? `\nAVAILABLE TABLES:\n${collections.map(t => `- ${t.name} (${t.count?.toLocaleString() || 0} rows)`).join('\n')}`
    : '\n(No tables detected - query carefully)';

  return `DATABASE TYPE: MySQL (SQL Relational Database)
TOTAL ROWS: ${totalDocuments.toLocaleString()}
${tablesList}

MYSQL SQL SYNTAX:
- Standard SQL with MySQL-specific functions
- Common operations: SELECT, INSERT, UPDATE, DELETE, JOIN
- Use backticks for identifiers if needed: \`table_name\`
- Aggregate functions: COUNT(), SUM(), AVG(), MAX(), MIN()
- String functions: CONCAT(), SUBSTRING(), LOWER(), UPPER()

EXAMPLES:
User: "Show all customers"
Response: SELECT * FROM customers;

User: "Find products by category"
Response: SELECT * FROM products WHERE category = 'electronics';

User: "Count orders by status"
Response: SELECT status, COUNT(*) as count FROM orders GROUP BY status;

User: "Show top 5 selling products"
Response: SELECT 
  product_id,
  SUM(quantity) as total_sold
FROM order_items
GROUP BY product_id
ORDER BY total_sold DESC
LIMIT 5;

HINDI EXAMPLE:
User: "सभी customers दिखाएं"
Response: SELECT * FROM customers;
यह सभी customers की जानकारी देगा।

MARATHI EXAMPLE:
User: "सर्व customers दाखवा"
Response: SELECT * FROM customers;
हे सर्व customers ची माहिती देईल।`;
}

// ============================================================================
// Redis Prompt
// ============================================================================
function getRedisPrompt(metadata) {
  return `DATABASE TYPE: Redis (In-Memory Key-Value Store)

REDIS COMMAND SYNTAX:
- Key-value operations: GET, SET, DEL, EXISTS
- List operations: LPUSH, RPUSH, LPOP, LRANGE
- Set operations: SADD, SMEMBERS, SISMEMBER
- Hash operations: HSET, HGET, HGETALL
- Sorted set operations: ZADD, ZRANGE, ZRANK

EXAMPLES:
User: "Get user session"
Response: GET user:session:12345

User: "Show all session keys"
Response: KEYS user:session:*

User: "Get user cache"
Response: HGETALL user:cache:12345

User: "List all active users"
Response: SMEMBERS active_users

User: "Get top 10 scores"
Response: ZRANGE leaderboard 0 9 WITHSCORES

HINDI EXAMPLE:
User: "user session लाओ"
Response: GET user:session:12345
यह user का session data लाएगा।

MARATHI EXAMPLE:
User: "user session आणा"
Response: GET user:session:12345
हे user चा session data आणेल।`;
}

// ============================================================================
// Language-Specific Guidance
// ============================================================================
function getLanguageGuidance(userLanguage) {
  const guidance = {
    en: `RESPONSE FORMAT (English):
1. First line: Database query/command
2. Second line: Brief explanation in English
3. Keep explanations concise and clear`,

    hi: `जवाब का फॉर्मेट (हिंदी):
1. पहली line: Database query/command
2. दूसरी line: संक्षिप्त explanation हिंदी में
3. Explanation छोटा और clear रखें`,

    mr: `प्रतिसाद स्वरूप (मराठी):
1. पहिली line: Database query/command
2. दुसरी line: संक्षिप्त स्पष्टीकरण मराठीत
3. स्पष्टीकरण लहान आणि स्पष्ट ठेवा`
  };

  return guidance[userLanguage] || guidance.en;
}

// ============================================================================
// Detect Language from User Input
// ============================================================================
export function detectLanguage(text) {
  if (!text) return 'en';

  // Hindi detection (Devanagari script)
  const hindiPattern = /[\u0900-\u097F]/;
  if (hindiPattern.test(text)) return 'hi';

  // Marathi detection (also Devanagari, but with specific patterns)
  // Note: Marathi uses same script as Hindi, detection is approximate
  const marathiWords = ['दाखव', 'आण', 'काय', 'कस', 'सर्व'];
  if (marathiWords.some(word => text.includes(word))) return 'mr';

  return 'en';
}

// ============================================================================
// Build Complete Prompt for Ollama
// ============================================================================
export function buildOllamaPrompt(userQuery, dbType, metadata = {}) {
  const userLanguage = detectLanguage(userQuery);
  const systemPrompt = getDatabasePrompt(dbType, metadata, userLanguage);

  return `${systemPrompt}

USER QUERY: ${userQuery}

Generate the appropriate ${dbType.toUpperCase()} query for this request.`;
}

// ============================================================================
// Export for Testing
// ============================================================================
export const promptTemplates = {
  getDatabasePrompt,
  detectLanguage,
  buildOllamaPrompt,
  getMongoDBPrompt,
  getPostgreSQLPrompt,
  getMySQLPrompt,
  getRedisPrompt
};