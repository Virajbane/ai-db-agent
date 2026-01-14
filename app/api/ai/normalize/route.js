// ============================================================================
// app/api/ai/normalize/route.js - SIMPLIFIED Language Normalization
// ============================================================================

import { NextResponse } from "next/server";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";

/**
 * Detect if text is English (no normalization needed)
 */
function isEnglish(text) {
  // If text has Hindi/Marathi characters, it's NOT English
  const devanagariRegex = /[\u0900-\u097F]/;
  if (devanagariRegex.test(text)) {
    return false;
  }
  
  // If it's mostly English characters, consider it English
  const englishChars = text.match(/[a-zA-Z]/g) || [];
  const totalChars = text.replace(/\s/g, '').length;
  
  // If 80%+ is English characters, treat as English
  return (englishChars.length / totalChars) > 0.8;
}

/**
 * Simple Hinglish patterns (only common ones)
 */
function quickHinglishFix(text) {
  let fixed = text;
  
  // Only fix very common patterns
  const patterns = {
    // "X jagh pr Y" = Replace X with Y
    'jagh pr': 'instead of',
    'ki jagh': 'instead of',
    
    // Common verbs
    'kar do': 'do',
    'kar de': 'do', 
    'dikha do': 'show',
    'bata do': 'show',
  };
  
  for (const [hinglish, english] of Object.entries(patterns)) {
    fixed = fixed.replace(new RegExp(hinglish, 'gi'), english);
  }
  
  return fixed;
}

/**
 * Main normalize function
 */
export async function POST(req) {
  try {
    const { userText } = await req.json();

    if (!userText || !userText.trim()) {
      return NextResponse.json({
        ok: false,
        error: "Text required"
      }, { status: 400 });
    }

    const originalText = userText.trim();
    
    console.log("📥 Input:", originalText);

    // ============================================
    // IF ENGLISH → Skip normalization completely
    // ============================================
    if (isEnglish(originalText)) {
      console.log("✅ English detected - skipping normalization");
      return NextResponse.json({
        ok: true,
        original: originalText,
        normalized: originalText, // Same as input
        detectedLanguage: "english",
        confidence: 1.0,
        method: "passthrough"
      });
    }

    // ============================================
    // IF NON-ENGLISH → Normalize with Ollama
    // ============================================
    console.log("🌍 Non-English detected - normalizing...");

    // Quick fix for common Hinglish patterns
    const preprocessed = quickHinglishFix(originalText);

    // Simple prompt for Ollama
    const prompt = `Translate this Hindi/Marathi/Hinglish text to simple English for a database query.

Input: "${preprocessed}"

Rules:
- Keep names unchanged (Ram, Aaditi, Viraj, etc.)
- Keep database terms unchanged (users, email, etc.)
- "jagh" or "jagah" means "place" or "instead of"
- Output simple English only

Examples:
"Aaditi ki jagh Aarti kar do" → "Replace Aaditi with Aarti"
"Ram ka email dikha" → "Show Ram's email"
"sab users" → "all users"

Translation:`;

    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 100,
        },
      }),
    });

    if (!response.ok) {
      console.error("❌ Ollama failed");
      // Fallback: return original text
      return NextResponse.json({
        ok: true,
        original: originalText,
        normalized: preprocessed,
        detectedLanguage: "hinglish",
        confidence: 0.5,
        method: "fallback"
      });
    }

    const data = await response.json();
    let translated = data.response.trim();

    // Clean up the response
    translated = translated
      .replace(/```.*?```/gs, '')
      .replace(/["']/g, '')
      .replace(/^(translation:|output:|result:)/gi, '')
      .replace(/\n+/g, ' ')
      .trim();

    console.log("✅ Translated:", translated);

    return NextResponse.json({
      ok: true,
      original: originalText,
      normalized: translated,
      detectedLanguage: "hindi-marathi",
      confidence: 0.85,
      method: "ollama"
    });

  } catch (error) {
    console.error("❌ Normalization error:", error);
    
    // On error, just return original text
    return NextResponse.json({
      ok: true,
      original: userText,
      normalized: userText,
      detectedLanguage: "unknown",
      confidence: 0.5,
      method: "error-fallback"
    });
  }
}