import { NextResponse } from "next/server";
import { parseUserInstruction } from "@/lib/ai";
import { logStep, validateAction } from "@/lib/debug";

export async function POST(req) {
  const requestId = Math.random().toString(36).slice(2, 8);
  
  try {
    logStep(`[${requestId}] REQUEST RECEIVED`, { timestamp: new Date().toISOString() });

    // Parse request body
    const body = await req.json();
    const { dbType = "mongodb", userText, collections = [], previewLimit = 50 } = body || {};

    logStep(`[${requestId}] BODY PARSED`, { dbType, userText, collectionsCount: collections.length, previewLimit });

    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      logStep(`[${requestId}] MISSING API KEY`, {}, new Error("GEMINI_API_KEY not set"));
      return NextResponse.json(
        { ok: false, error: "Gemini API key is missing. Check .env.local" },
        { status: 500 }
      );
    }

    // Validate input
    if (!userText || userText.trim().length === 0) {
      logStep(`[${requestId}] INVALID INPUT`, { userText });
      return NextResponse.json({ ok: false, error: "userText is required and cannot be empty" }, { status: 400 });
    }

    logStep(`[${requestId}] CALLING AI PARSER`, { userText });

    // Call AI
    const action = await parseUserInstruction({ dbType, userText, collections, previewLimit });

    logStep(`[${requestId}] AI RESPONSE RECEIVED`, action);

    // Validate parsed action
    const validation = validateAction(action);
    if (!validation.valid) {
      logStep(`[${requestId}] ACTION VALIDATION FAILED`, validation.errors);
      return NextResponse.json(
        { ok: false, error: `Invalid action: ${validation.errors.join("; ")}` },
        { status: 400 }
      );
    }

    logStep(`[${requestId}] ACTION VALIDATED`, action);

    return NextResponse.json({ ok: true, action, requestId });
  } catch (error) {
    logStep(`[${requestId}] FATAL ERROR`, { error: error.message, stack: error.stack }, error);
    return NextResponse.json(
      { ok: false, error: error.message || "Something went wrong parsing your request" },
      { status: 500 }
    );
  }
}