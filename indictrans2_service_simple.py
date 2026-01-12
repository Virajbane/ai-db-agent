"""
============================================================================
indictrans2_service_simple.py - Simplified Translation Service for Windows
============================================================================

This is a lightweight version that works on Windows without complex dependencies.
It uses Ollama as the primary translation engine instead of IndicTrans2.

Run: python indictrans2_service_simple.py
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="Translation Service", version="1.0.0")

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================
class TranslationRequest(BaseModel):
    text: str
    source_lang: str = "hin_Deva"
    target_lang: str = "eng_Latn"
    
class TranslationResponse(BaseModel):
    translated_text: str
    source_lang: str
    target_lang: str
    success: bool
    method: str = "ollama"

# ============================================================================
# OLLAMA TRANSLATION (Works on all platforms)
# ============================================================================
async def translate_with_ollama(text: str, source_lang: str) -> str:
    """
    Use Ollama for translation - works on all platforms
    """
    
    # Detect source language from code
    lang_name = {
        "hin_Deva": "Hindi",
        "mar_Deva": "Marathi",
        "eng_Latn": "English"
    }.get(source_lang, "Hindi")
    
    prompt = f"""Translate this {lang_name} text to English.

Input: "{text}"

Rules:
- Translate to clear, simple English
- Keep names unchanged
- Keep database terms unchanged (users, email, table, etc.)
- Output only the English translation, no explanations

Translation:"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "qwen2.5-coder:7b",
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "num_predict": 100
                    }
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                translated = data.get("response", "").strip()
                
                # Clean up any markdown or quotes
                translated = translated.replace("```", "").replace('"', "").strip()
                
                return translated
            else:
                raise Exception(f"Ollama returned status {response.status_code}")
                
    except Exception as e:
        logger.error(f"Ollama translation failed: {str(e)}")
        raise HTTPException(status_code=503, detail="Translation service unavailable")

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Translation Service (Ollama-powered)",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    
    # Check if Ollama is available
    ollama_available = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://localhost:11434/api/tags")
            ollama_available = response.status_code == 200
    except:
        pass
    
    return {
        "status": "healthy" if ollama_available else "degraded",
        "ollama_available": ollama_available,
        "supported_languages": {
            "source": ["hin_Deva", "mar_Deva", "eng_Latn"],
            "target": ["eng_Latn"]
        },
        "note": "Using Ollama for translations"
    }

@app.post("/translate", response_model=TranslationResponse)
async def translate(request: TranslationRequest):
    """
    Translate text from Indian languages to English
    
    Supported source languages:
    - hin_Deva: Hindi (Devanagari script)
    - mar_Deva: Marathi (Devanagari script)
    - eng_Latn: English (passthrough)
    """
    
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    logger.info(f"Translation request: {request.source_lang} -> {request.target_lang}")
    logger.info(f"Input text: {request.text[:100]}...")
    
    try:
        # If already English, return as-is
        if request.source_lang == "eng_Latn":
            return TranslationResponse(
                translated_text=request.text,
                source_lang=request.source_lang,
                target_lang=request.target_lang,
                success=True,
                method="passthrough"
            )
        
        # Translate using Ollama
        translated_text = await translate_with_ollama(request.text, request.source_lang)
        
        logger.info(f"Translation output: {translated_text[:100]}...")
        
        return TranslationResponse(
            translated_text=translated_text,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            success=True,
            method="ollama"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# ============================================================================
# RUN SERVER
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    
    print("""
    ╔══════════════════════════════════════════════════════════════╗
    ║  Translation Service (Ollama-powered)                        ║
    ║  Running on: http://localhost:8000                           ║
    ║  Docs: http://localhost:8000/docs                            ║
    ║                                                              ║
    ║  ⚠️  Make sure Ollama is running:                           ║
    ║     ollama serve                                             ║
    ╚══════════════════════════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )