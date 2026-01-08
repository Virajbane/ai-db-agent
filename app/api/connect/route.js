// Multi-database support app/api/connect/route.js
import { testUniversalConnection } from "@/lib/multiDbIntrospect";
import { detectDatabaseType } from "@/lib/dbAdapters";

export async function POST(req) {
  try {
    const { uri } = await req.json();
    if (!uri || uri.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Connection string is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("🔌 Testing universal database connection...");
    
    // Detect database type (MongoDB, PostgreSQL, MySQL, Redis)
    const dbType = detectDatabaseType(uri);
    
    if (!dbType) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Could not detect database type. Supported: MongoDB, PostgreSQL, MySQL, Redis, Supabase" 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    console.log(`📊 Detected: ${dbType}`);
    
    // Test connection using appropriate adapter
    const result = await testUniversalConnection(uri);
    
    if (!result.ok) {
      console.error("❌ Connection failed:", result.error);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: result.error || "Connection failed",
          dbType 
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    console.log(`✅ ${dbType} connection successful`);
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: result.message,
        dbType,
        supported: true
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("💥 Connection test error:", error);
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || "Connection test failed" 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}