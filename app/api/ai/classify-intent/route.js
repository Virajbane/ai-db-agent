// ============================================================================
// app/api/ai/classify-intent/route.js - Intent Classification Engine
// ============================================================================

import { NextResponse } from "next/server";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";


// Add rule-based detection for fast fallback
function detectIntentRuleBased(text) {
  const INTENT_PATTERNS = {
    READ: ['show', 'list', 'display', 'get', 'fetch', 'find', 'search', 'count', 'what', 'how many'],
    WRITE: ['add', 'insert', 'create', 'new', 'save', 'register'],
    UPDATE: ['update', 'modify', 'change', 'edit', 'set', 'alter', 'replace'],
    DELETE: ['delete', 'remove', 'drop', 'erase', 'clear', 'purge']
  };
  
  const lowerText = text.toLowerCase();
  let bestMatch = { intent: 'UNKNOWN', confidence: 0 };
  
  for (const [intent, keywords] of Object.entries(INTENT_PATTERNS)) {
    let matchCount = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) matchCount++;
    }
    
    if (matchCount > 0) {
      const confidence = Math.min(0.95, 0.7 + (matchCount * 0.1));
      if (confidence > bestMatch.confidence) {
        bestMatch = { intent, confidence };
      }
    }
  }
  
  return bestMatch.confidence > 0.6 ? bestMatch : { intent: 'UNKNOWN', confidence: 0.3 };
}

// Add completeness checker
function checkQueryCompleteness(text) {
  const hasAction = /\b(show|get|find|update|delete|add|create|list|count)\b/i.test(text);
  const hasTarget = /\b(user|email|name|data|record|table|collection)\b/i.test(text);
  const hasSpecificity = text.length > 10;
  
  let score = 0.5;
  if (hasAction) score += 0.25;
  if (hasTarget) score += 0.25;
  if (hasSpecificity) score += 0.1;
  
  return Math.min(1.0, score);
}

// Add multi-factor confidence calculation
function calculateOverallConfidence(intentConf, langConf, completeness) {
  return (intentConf * 0.5) + (langConf * 0.3) + (completeness * 0.2);
}

/**
 * Classify user intent into: READ, WRITE, UPDATE, DELETE, UNKNOWN
 * Also returns confidence score
 */
export async function POST(req) {
  try {
    const { normalizedText, dbType = "mongodb", langConfidence = 0.9 } = await req.json();

    if (!normalizedText) {
      return NextResponse.json({ ok: false, error: "Normalized text required" }, { status: 400 });
    }

    console.log("🎯 Classifying intent:", normalizedText);

    // 🆕 Step 1: Try rule-based first (fast)
    const ruleResult = detectIntentRuleBased(normalizedText);
    console.log("📋 Rule-based result:", ruleResult);

    // 🆕 Step 2: If rule-based is confident, use it
    if (ruleResult.confidence >= 0.85) {
      const completeness = checkQueryCompleteness(normalizedText);
      const overallConf = calculateOverallConfidence(ruleResult.confidence, langConfidence, completeness);
      
      return NextResponse.json({
        ok: true,
        intent: ruleResult.intent,
        confidence: overallConf,
        confidenceBreakdown: {
          intent: ruleResult.confidence,
          language: langConfidence,
          completeness: completeness
        },
        isDestructive: ["UPDATE", "DELETE"].includes(ruleResult.intent),
        needsConfirmation: overallConf < 0.8 || ["UPDATE", "DELETE"].includes(ruleResult.intent),
        method: "rule-based"
      });
    }

    // 🆕 Step 3: If rule-based not confident, use AI (your existing code)
    const prompt = buildIntentPrompt(normalizedText, dbType);
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 150 }
      })
    });

    const data = await response.json();
    const parsed = parseIntentResponse(data.response.trim());
    
    console.log("🤖 AI result:", parsed);

    // 🆕 Step 4: Hybrid scoring - if both agree, boost confidence
    let finalIntent = parsed.intent;
    let finalConf = parsed.confidence;
    
    if (ruleResult.intent === parsed.intent && ruleResult.intent !== 'UNKNOWN') {
      finalConf = Math.min(0.98, (parsed.confidence + ruleResult.confidence) / 2 + 0.1);
      console.log("✨ Hybrid agreement boost:", finalConf);
    }

    // 🆕 Step 5: Calculate overall with completeness
    const completeness = checkQueryCompleteness(normalizedText);
    const overallConf = calculateOverallConfidence(finalConf, langConfidence, completeness);

    return NextResponse.json({
      ok: true,
      intent: finalIntent,
      confidence: overallConf,
      confidenceBreakdown: {
        intent: finalConf,
        language: langConfidence,
        completeness: completeness
      },
      isDestructive: ["UPDATE", "DELETE"].includes(finalIntent),
      needsConfirmation: overallConf < 0.8 || ["UPDATE", "DELETE"].includes(finalIntent),
      method: ruleResult.intent === parsed.intent ? "hybrid-agreement" : "ai-primary"
    });

  } catch (error) {
    console.error("❌ Intent classification failed:", error);
    
    // 🆕 Fallback to rule-based on error
    try {
      const ruleResult = detectIntentRuleBased(normalizedText);
      const completeness = checkQueryCompleteness(normalizedText);
      const overallConf = calculateOverallConfidence(ruleResult.confidence, 0.7, completeness);
      
      return NextResponse.json({
        ok: true,
        intent: ruleResult.intent,
        confidence: overallConf,
        confidenceBreakdown: { intent: ruleResult.confidence, language: 0.7, completeness },
        isDestructive: ["UPDATE", "DELETE"].includes(ruleResult.intent),
        needsConfirmation: true, // Always confirm on fallback
        method: "rule-based-fallback"
      });
    } catch (fallbackError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }
}

function buildIntentPrompt(normalizedText, dbType) {
  return `You are an intent classifier for database queries.

🎯 TASK: Classify the user's intent into ONE category.

📋 INTENT CATEGORIES:
- READ: show, find, get, list, display, count, search, view
- WRITE: add, insert, create, new
- UPDATE: modify, change, update, edit, set
- DELETE: remove, delete, drop
- UNKNOWN: unclear or not a database operation

🔍 USER QUERY: "${normalizedText}"
📊 DATABASE: ${dbType.toUpperCase()}

📋 OUTPUT FORMAT (JSON only):
{
  "intent": "READ|WRITE|UPDATE|DELETE|UNKNOWN",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}

EXAMPLES:

Input: "Show all users"
Output: {"intent": "READ", "confidence": 1.0, "reasoning": "Clearly asking to view data"}

Input: "Update Ram's email"
Output: {"intent": "UPDATE", "confidence": 0.95, "reasoning": "Modifying existing record"}

Input: "Delete Ram"
Output: {"intent": "DELETE", "confidence": 0.9, "reasoning": "Removing a record"}

Input: "Add new user John"
Output: {"intent": "WRITE", "confidence": 0.95, "reasoning": "Creating new record"}

Input: "What is the weather?"
Output: {"intent": "UNKNOWN", "confidence": 0.3, "reasoning": "Not a database query"}

CRITICAL:
- Return ONLY JSON
- confidence: How sure you are (0.0-1.0)
- Be conservative: If unsure, use UNKNOWN

YOUR RESPONSE:`;
}

function parseIntentResponse(rawText) {
  let text = rawText.trim();

  if (text.includes("```")) {
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  try {
    const json = JSON.parse(text);
    
    return {
      intent: json.intent || "UNKNOWN",
      confidence: json.confidence || 0.5,
      reasoning: json.reasoning || ""
    };
  } catch (error) {
    console.error("Failed to parse intent JSON:", error);
    
    // Fallback: try to detect intent from text
    const lower = rawText.toLowerCase();
    
    if (lower.includes("delete") || lower.includes("remove")) {
      return { intent: "DELETE", confidence: 0.6, reasoning: "Keyword detected" };
    }
    if (lower.includes("update") || lower.includes("modify")) {
      return { intent: "UPDATE", confidence: 0.6, reasoning: "Keyword detected" };
    }
    if (lower.includes("insert") || lower.includes("add") || lower.includes("create")) {
      return { intent: "WRITE", confidence: 0.6, reasoning: "Keyword detected" };
    }
    if (lower.includes("show") || lower.includes("find") || lower.includes("get")) {
      return { intent: "READ", confidence: 0.6, reasoning: "Keyword detected" };
    }
    
    return { intent: "UNKNOWN", confidence: 0.3, reasoning: "Could not parse" };
  }
}