// ============================================================================
// app/api/ai/normalize/route.js - Language Normalization Engine
// ============================================================================

import { NextResponse } from "next/server";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "qwen2.5-coder:7b";


// Add this function at the top of normalize/route.js
function preprocessHinglish(text) {
  const hinglishMappings = {
    'kar de': 'update', 'kar do': 'update', 'karde': 'update', 'kardo': 'update',
    'dikha': 'show', 'dikhao': 'show', 'dikha do': 'show',
    'bata': 'show', 'batao': 'show', 'bata do': 'show',
    'dhundo': 'find', 'khojo': 'find', 'gino': 'count',
    'delete kar': 'delete', 'hata do': 'delete', 'remove kar': 'delete',
    'ka': "'s", 'ki': "'s", 'ke': "'s",
    'sabhi': 'all', 'sare': 'all', 'sab': 'all',
  };
  
  let processed = text.toLowerCase();
  for (const [hinglish, english] of Object.entries(hinglishMappings)) {
    const regex = new RegExp(`\\b${hinglish}\\b`, 'gi');
    processed = processed.replace(regex, english);
  }
  return processed.replace(/\s+/g, ' ').trim();
}

// Add this function for language detection with confidence
function detectLanguageWithConfidence(text) {
  const devanagariRegex = /[\u0900-\u097F]/;
  const englishRegex = /[a-zA-Z]/;
  
  const hasDevanagari = devanagariRegex.test(text);
  const hasEnglish = englishRegex.test(text);
  const totalChars = text.replace(/\s/g, '').length;
  
  let language = "unknown";
  let confidence = 0.5;
  
  if (hasDevanagari && hasEnglish) {
    language = "hinglish";
    confidence = 0.7; // Mixed reduces confidence
  } else if (hasDevanagari) {
    const marathiPatterns = ['मध्ये', 'आहे', 'दाखव', 'सांग'];
    const hasMarathi = marathiPatterns.some(p => text.includes(p));
    language = hasMarathi ? "marathi" : "hindi";
    confidence = 0.9;
  } else if (hasEnglish) {
    language = "english";
    confidence = 0.95;
  }
  
  return { language, confidence };
}

/**
 * Normalize mixed-language input to clean English
 * Handles: Hindi, Marathi, Hinglish, English
 */
export async function POST(req) {
  try {
    const { userText } = await req.json();
    
    if (!userText?.trim()) {
      return NextResponse.json({ ok: false, error: "Text required" }, { status: 400 });
    }

    // 🆕 Step 1: Detect language with confidence
    const { language, confidence: langConfidence } = detectLanguageWithConfidence(userText);
    
    console.log("🌍 Language detected:", language, "confidence:", langConfidence);

    // 🆕 Step 2: If English and high confidence, skip normalization
    if (language === "english" && langConfidence > 0.9) {
      return NextResponse.json({
        ok: true,
        original: userText,
        normalized: userText,
        detectedLanguage: language,
        confidence: langConfidence
      });
    }

    // 🆕 Step 3: Preprocess Hinglish before Ollama
    let processedText = userText;
    if (language === "hinglish") {
      processedText = preprocessHinglish(userText);
      console.log("🔧 Preprocessed:", processedText);
    }

    // 🆕 Step 4: Try IndicTrans2 first (if available)
    if (language === "hindi" || language === "marathi" || language === "hinglish") {
      try {
        const indicResponse = await fetch("http://localhost:8000/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: processedText,
            source_lang: language === "marathi" ? "mar_Deva" : "hin_Deva",
            target_lang: "eng_Latn"
          }),
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (indicResponse.ok) {
          const indicData = await indicResponse.json();
          console.log("✅ IndicTrans2 translation:", indicData.translated_text);
          
          return NextResponse.json({
            ok: true,
            original: userText,
            normalized: indicData.translated_text,
            detectedLanguage: language,
            confidence: langConfidence,
            method: "indictrans2"
          });
        }
      } catch (error) {
        console.warn("⚠️ IndicTrans2 unavailable, falling back to Ollama");
      }
    }

    // 🆕 Step 5: Fallback to Ollama (your existing code, but use processedText)
    const prompt = buildNormalizationPrompt(processedText); // Use preprocessed text
    
    // ... rest of your existing Ollama code ...
    
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 150 }
      })
    });

    const data = await response.json();
    const parsed = parseNormalizationResponse(data.response.trim());

    return NextResponse.json({
      ok: true,
      original: userText,
      normalized: parsed.normalized,
      detectedLanguage: language,
      confidence: langConfidence,
      method: "ollama"
    });

  } catch (error) {
    console.error("❌ Normalization failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

function buildNormalizationPrompt(userText) {
  return `You are a multilingual language normalizer for database queries.

🎯 TASK: Convert the user's input to clear, simple English.

📝 LANGUAGE SUPPORT:
- English (already clear)
- Hindi (हिंदी): दिखाओ → show, बताओ → tell, सभी → all, का → of, को → to
- Marathi (मराठी): दाखव → show, सांग → tell, सर्व → all, चा → of, ला → to
- Hinglish: Mixed English + Hindi/Marathi words

🔍 USER INPUT: "${userText}"

📋 OUTPUT FORMAT (JSON only, no explanations):
{
  "normalized": "clear English sentence",
  "language": "english|hindi|marathi|hinglish",
  "confidence": 0.95
}

EXAMPLES:

Input: "ram ka email update kar de"
Output: {"normalized": "Update Ram's email", "language": "hinglish", "confidence": 0.9}

Input: "सभी users दिखाओ"
Output: {"normalized": "Show all users", "language": "hinglish", "confidence": 0.95}

Input: "delete karo ram ko"
Output: {"normalized": "Delete Ram", "language": "hinglish", "confidence": 0.85}

Input: "show all products"
Output: {"normalized": "Show all products", "language": "english", "confidence": 1.0}

CRITICAL:
- Return ONLY JSON, no markdown
- Keep database terms unchanged (users, products, email, etc.)
- Preserve names exactly (Ram, Shyam, etc.)
- confidence: 0.0-1.0 (how clear was the input)

YOUR RESPONSE:`;
}

function parseNormalizationResponse(rawText) {
  let text = rawText.trim();

  // Remove markdown
  if (text.includes("```")) {
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  }

  // Extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  try {
    const json = JSON.parse(text);
    
    return {
      normalized: json.normalized || json.text || text,
      language: json.language || "unknown",
      confidence: json.confidence || 0.7
    };
  } catch (error) {
    console.error("Failed to parse normalization JSON:", error);
    
    // Fallback: return original text
    return {
      normalized: rawText,
      language: "unknown",
      confidence: 0.5
    };
  }
}