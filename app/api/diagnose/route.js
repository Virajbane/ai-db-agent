import { NextResponse } from "next/server";

/**
 * Diagnostic endpoint to check API keys and connectivity
 * GET /api/diagnose
 */
export async function GET(req) {
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      nodeEnv: process.env.NODE_ENV,
    },
    tests: {},
  };

  // Test Gemini API Key format
  if (process.env.GEMINI_API_KEY) {
    report.tests.geminiKeyFormat = {
      valid: process.env.GEMINI_API_KEY.length > 20,
      length: process.env.GEMINI_API_KEY.length,
      firstChars: process.env.GEMINI_API_KEY.substring(0, 5) + "...",
    };

    // Try connecting to Gemini
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

      const response = await Promise.race([
        model.generateContent("Say 'OK'"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Gemini timeout (5s)")), 5000)
        ),
      ]);

      report.tests.geminiConnection = {
        status: "✅ Connected",
        responseLength: response.response.text().length,
      };
    } catch (err) {
      report.tests.geminiConnection = {
        status: "❌ Failed",
        error: err.message,
      };
    }
  } else {
    report.tests.geminiKeyFormat = { status: "❌ Missing GEMINI_API_KEY" };
  }

  // Test OpenAI API Key format
  if (process.env.OPENAI_API_KEY) {
    report.tests.openaiKeyFormat = {
      valid: process.env.OPENAI_API_KEY.length > 20,
      length: process.env.OPENAI_API_KEY.length,
      firstChars: process.env.OPENAI_API_KEY.substring(0, 5) + "...",
    };

    // Try connecting to OpenAI
    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await Promise.race([
        client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Say 'OK'" }],
          max_tokens: 10,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("OpenAI timeout (5s)")), 5000)
        ),
      ]);

      report.tests.openaiConnection = {
        status: "✅ Connected",
        model: response.model,
      };
    } catch (err) {
      report.tests.openaiConnection = {
        status: "❌ Failed",
        error: err.message,
      };
    }
  } else {
    report.tests.openaiKeyFormat = { status: "❌ Missing OPENAI_API_KEY" };
  }

  return NextResponse.json(report);
}