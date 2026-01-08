// ============================================================================
// app/connect/page.js - Enhanced with Pre-warming & Loading States
// ============================================================================

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Database type detector
function detectDatabaseType(uri) {
  if (!uri) return null;
  
  const lower = uri.toLowerCase();
  
  if (lower.includes('mongodb://') || lower.includes('mongodb+srv://')) {
    return {
      type: 'mongodb',
      name: 'MongoDB',
      icon: '🍃',
      color: 'green',
      description: 'NoSQL Document Database',
      defaultPort: '27017'
    };
  }
  
  if (lower.includes('postgresql://') || lower.includes('postgres://') || 
      lower.includes('supabase.co')) {
    const isSupabase = lower.includes('supabase.co');
    return {
      type: 'postgresql',
      name: isSupabase ? 'Supabase (PostgreSQL)' : 'PostgreSQL',
      icon: isSupabase ? '⚡' : '🐘',
      color: 'blue',
      description: isSupabase ? 'PostgreSQL + Cloud APIs' : 'SQL Relational Database',
      defaultPort: '5432'
    };
  }
  
  if (lower.includes('mysql://')) {
    return {
      type: 'mysql',
      name: 'MySQL',
      icon: '🐬',
      color: 'orange',
      description: 'SQL Relational Database',
      defaultPort: '3306'
    };
  }
  
  if (lower.includes('redis://') || lower.includes('rediss://')) {
    return {
      type: 'redis',
      name: 'Redis',
      icon: '🔴',
      color: 'red',
      description: 'Key-Value Store',
      defaultPort: '6379'
    };
  }
  
  return null;
}

// Example URIs for each database
const DATABASE_EXAMPLES = {
  mongodb: {
    cloud: 'mongodb+srv://user:password@cluster.mongodb.net/database',
    local: 'mongodb://localhost:27017/myDatabase',
    queries: ['Show all users', 'Find user with email test@example.com', 'Count all products']
  },
  postgresql: {
    cloud: 'postgresql://user:pass@db.xxx.supabase.co:5432/postgres',
    local: 'postgresql://localhost:5432/mydatabase',
    queries: ['Show revenue by month', 'List all orders', 'Count active users']
  },
  mysql: {
    cloud: 'mysql://user:password@mysql.host.com:3306/database',
    local: 'mysql://localhost:3306/mydatabase',
    queries: ['Show all customers', 'List products by category', 'Get user details']
  },
  redis: {
    cloud: 'redis://default:password@redis.host.com:6379',
    local: 'redis://localhost:6379',
    queries: ['Get all session keys', 'Show user cache', 'List all keys']
  }
};

export default function ConnectPage() {
  const [uri, setUri] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectedDb, setDetectedDb] = useState(null);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [showExamples, setShowExamples] = useState(false);
  
  // 🆕 Pre-warming state
  const [prewarmStage, setPrewarmStage] = useState(''); // 'connecting' | 'prewarming' | 'ready'
  const [prewarmProgress, setPrewarmProgress] = useState({
    connection: false,
    ollama: false,
    schema: false
  });
  const [prewarmData, setPrewarmData] = useState(null);
  
  const router = useRouter();

  // Check for existing connection
  useEffect(() => {
    const savedUri = localStorage.getItem("dbURI");
    const savedDbType = localStorage.getItem("dbType");
    
    if (savedUri && savedDbType) {
      const dbInfo = detectDatabaseType(savedUri);
      setConnectionInfo({
        uri: savedUri.substring(0, 50) + '...',
        dbType: savedDbType,
        dbInfo: dbInfo
      });
    }
  }, []);

  // Detect database type as user types
  useEffect(() => {
    const detected = detectDatabaseType(uri);
    setDetectedDb(detected);
  }, [uri]);

  // ============================================================================
  // 🆕 MAIN CONNECTION FUNCTION WITH PRE-WARMING
  // ============================================================================
  async function connect() {
    if (!uri.trim()) {
      alert("Please enter a database connection URI");
      return;
    }

    if (!detectedDb) {
      alert("Unable to detect database type. Please check your URI format.");
      return;
    }

    setLoading(true);
    setPrewarmStage('connecting');
    setPrewarmProgress({ connection: false, ollama: false, schema: false });

    try {
      // ========================================================================
      // STAGE 1: Test Database Connection
      // ========================================================================
      console.log("🔌 Stage 1: Testing connection to:", detectedDb.name);
      
      const connectionRes = await fetch("/api/connect", {
        method: "POST",
        body: JSON.stringify({ uri }),
        headers: { "Content-Type": "application/json" }
      });
      
      if (!connectionRes.ok) {
        let errorData;
        try {
          errorData = await connectionRes.json();
        } catch {
          throw new Error(`HTTP ${connectionRes.status}: ${connectionRes.statusText}`);
        }
        throw new Error(errorData.error || `HTTP ${connectionRes.status} error`);
      }
      
      const connectionData = await connectionRes.json();
      console.log("✅ Connection response:", connectionData);
      
      const isSuccess = connectionData.ok === true || 
                       connectionData.success === true || 
                       connectionData.supported === true;
      
      if (!isSuccess) {
        throw new Error(connectionData.error || `Failed to connect to ${detectedDb.name}`);
      }

      // Update progress
      setPrewarmProgress(prev => ({ ...prev, connection: true }));
      console.log("✅ Stage 1 complete: Connection successful");

      // ========================================================================
      // STAGE 2: Pre-warm Ollama + Cache Schema
      // ========================================================================
      console.log("🔥 Stage 2: Pre-warming Ollama + Caching schema...");
      setPrewarmStage('prewarming');

      const prewarmRes = await fetch("/api/ai/prewarm", {
        method: "POST",
        body: JSON.stringify({ uri }),
        headers: { "Content-Type": "application/json" }
      });

      if (!prewarmRes.ok) {
        console.warn("⚠️ Pre-warming failed, but connection works");
        
        // Still save connection and proceed
        localStorage.setItem("dbURI", uri);
        localStorage.setItem("dbType", connectionData.dbType || detectedDb.type);
        
        // Show warning but proceed
        setPrewarmStage('ready');
        setTimeout(() => router.push("/chat"), 1000);
        return;
      }

      const prewarmData = await prewarmRes.json();
      console.log("✅ Pre-warm response:", prewarmData);

      if (prewarmData.ok) {
        // Update progress
        setPrewarmProgress({
          connection: true,
          ollama: prewarmData.prewarmSuccess,
          schema: prewarmData.schemaSuccess
        });
        
        setPrewarmData(prewarmData.metadata);
        console.log("✅ Stage 2 complete: Pre-warming successful");
      }

      // ========================================================================
      // STAGE 3: Save & Navigate
      // ========================================================================
      setPrewarmStage('ready');
      
      localStorage.setItem("dbURI", uri);
      localStorage.setItem("dbType", connectionData.dbType || detectedDb.type);

      console.log("🎉 All stages complete! Navigating to chat...");
      
      // Navigate after brief delay to show success
      setTimeout(() => {
        router.push("/chat");
      }, 1500);

    } catch (err) {
      console.error("💥 Connection error:", err);
      
      // Reset states
      setLoading(false);
      setPrewarmStage('');
      setPrewarmProgress({ connection: false, ollama: false, schema: false });
      
      // User-friendly error messages
      let userMessage = err.message;
      
      if (err.message.includes("Failed to fetch")) {
        userMessage = "Cannot reach the server. Make sure your Next.js app is running.";
      } else if (err.message.includes("NetworkError")) {
        userMessage = "Network error. Check your internet connection.";
      } else if (err.message.includes("timeout")) {
        userMessage = "Connection timeout. The database might be unreachable.";
      } else if (err.message.includes("ECONNREFUSED")) {
        userMessage = "Connection refused. Check if the database is running and accessible.";
      } else if (err.message.includes("authentication failed")) {
        userMessage = "Authentication failed. Check your username and password.";
      } else if (err.message.includes("Could not detect database type")) {
        userMessage = "Unsupported database URI format.\n\nSupported formats:\n- mongodb://...\n- postgresql://...\n- mysql://...\n- redis://...";
      }
      
      alert(`❌ Connection Failed\n\n${userMessage}\n\nTechnical details: ${err.message}`);
    }
  }

  function disconnect() {
    localStorage.removeItem("dbURI");
    localStorage.removeItem("dbType");
    setConnectionInfo(null);
    setUri("");
  }

  function useExample(type, isLocal = false) {
    const example = DATABASE_EXAMPLES[type];
    if (example) {
      setUri(isLocal ? example.local : example.cloud);
      setShowExamples(false);
    }
  }

  // ============================================================================
  // 🆕 LOADING SCREEN WITH PROGRESS
  // ============================================================================
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-4 bg-black/50 backdrop-blur-lg z-50">
        <div className="w-full max-w-md bg-black/30 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-8">
          
          {/* Icon */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-4 animate-bounce">{detectedDb?.icon}</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {prewarmStage === 'connecting' && 'Connecting...'}
              {prewarmStage === 'prewarming' && 'Initializing AI...'}
              {prewarmStage === 'ready' && 'Ready!'}
            </h2>
            <p className="text-sm text-gray-400">
              {prewarmStage === 'connecting' && `Testing ${detectedDb?.name} connection`}
              {prewarmStage === 'prewarming' && 'Warming up Ollama & caching schema'}
              {prewarmStage === 'ready' && 'Opening chat interface...'}
            </p>
          </div>

          {/* Progress Steps */}
          <div className="space-y-3 mb-6">
            {/* Step 1: Database Connection */}
            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              prewarmProgress.connection 
                ? 'bg-green-500/10 border border-green-500/30' 
                : prewarmStage === 'connecting'
                ? 'bg-blue-500/10 border border-blue-500/30 animate-pulse'
                : 'bg-black/20 border border-neutral-700/30'
            }`}>
              <div className="text-2xl">
                {prewarmProgress.connection ? '✅' : prewarmStage === 'connecting' ? '⏳' : '⏺️'}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Database Connection</div>
                <div className="text-xs text-gray-400">
                  {prewarmProgress.connection ? 'Connected successfully' : 'Testing connection...'}
                </div>
              </div>
            </div>

            {/* Step 2: Ollama Pre-warming */}
            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              prewarmProgress.ollama 
                ? 'bg-green-500/10 border border-green-500/30' 
                : prewarmStage === 'prewarming'
                ? 'bg-blue-500/10 border border-blue-500/30 animate-pulse'
                : 'bg-black/20 border border-neutral-700/30'
            }`}>
              <div className="text-2xl">
                {prewarmProgress.ollama ? '✅' : prewarmStage === 'prewarming' ? '🔥' : '⏺️'}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">AI Model Warm-up</div>
                <div className="text-xs text-gray-400">
                  {prewarmProgress.ollama ? 'Ollama ready' : 'Initializing Qwen 2.5 Coder...'}
                </div>
              </div>
            </div>

            {/* Step 3: Schema Caching */}
            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              prewarmProgress.schema 
                ? 'bg-green-500/10 border border-green-500/30' 
                : prewarmStage === 'prewarming'
                ? 'bg-blue-500/10 border border-blue-500/30 animate-pulse'
                : 'bg-black/20 border border-neutral-700/30'
            }`}>
              <div className="text-2xl">
                {prewarmProgress.schema ? '✅' : prewarmStage === 'prewarming' ? '📊' : '⏺️'}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Schema Analysis</div>
                <div className="text-xs text-gray-400">
                  {prewarmProgress.schema 
                    ? prewarmData 
                      ? `Found ${prewarmData.totalCollections} ${detectedDb?.type === 'mongodb' ? 'collections' : 'tables'} (${prewarmData.totalDocuments?.toLocaleString()} ${detectedDb?.type === 'mongodb' ? 'documents' : 'records'})`
                      : 'Schema cached'
                    : 'Scanning database structure...'}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-black/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-green-500 to-green-400 transition-all duration-500"
              style={{ 
                width: prewarmStage === 'connecting' ? '33%' : 
                       prewarmStage === 'prewarming' ? '66%' : 
                       prewarmStage === 'ready' ? '100%' : '10%'
              }}
            />
          </div>

          {/* Info */}
          <p className="text-xs text-gray-500 text-center mt-4">
            ⚡ This initialization happens once. Next queries will be instant!
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN UI (Same as before)
  // ============================================================================
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 py-8 pointer-events-none overflow-y-auto">
      <div className="w-full max-w-4xl pointer-events-auto py-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-white mb-3">🌍 Universal DB Agent</h1>
          <p className="text-gray-400 text-lg font-light">
            Query any database with natural language in English, Hindi, or Marathi
          </p>
        </div>

        {/* Current Connection Status (if connected) */}
        {connectionInfo && (
          <div className="mb-6 p-6 rounded-xl bg-black/30 backdrop-blur-md border border-green-500/30 animate-in slide-in-from-top duration-300">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="text-4xl mt-1">{connectionInfo.dbInfo?.icon}</div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-white">Currently Connected</h3>
                    <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                      Active
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{connectionInfo.dbInfo?.name}</p>
                  <p className="text-gray-500 text-xs font-mono">{connectionInfo.uri}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push("/chat")}
                  className="px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-gray-100 transition text-sm"
                >
                  Go to Chat →
                </button>
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition text-sm font-medium"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supported Databases */}
        <div className="mb-6 p-6 rounded-xl bg-black/20 backdrop-blur-md border border-neutral-800/50">
          <h3 className="text-sm font-semibold text-white mb-4">✅ Supported Databases</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { type: 'mongodb', icon: '🍃', name: 'MongoDB', color: 'green' },
              { type: 'postgresql', icon: '🐘', name: 'PostgreSQL', color: 'blue' },
              { type: 'mysql', icon: '🐬', name: 'MySQL', color: 'orange' },
              { type: 'redis', icon: '🔴', name: 'Redis', color: 'red' },
              { type: 'postgresql', icon: '⚡', name: 'Supabase', color: 'purple' }
            ].map((db) => (
              <div
                key={db.name}
                className={`p-3 rounded-lg text-center transition ${
                  detectedDb?.type === db.type && detectedDb?.name.includes(db.name)
                    ? 'bg-white/10 border-2 border-white/30 scale-105'
                    : 'bg-black/20 border border-neutral-700/30 hover:bg-black/30'
                }`}
              >
                <div className="text-2xl mb-1">{db.icon}</div>
                <div className="text-xs font-medium text-gray-300">{db.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Connection Form */}
        <div className="space-y-6">
          
          {/* Database Type Detection */}
          {detectedDb && !connectionInfo && (
            <div className={`p-4 rounded-lg border-2 animate-in slide-in-from-top duration-300 ${
              detectedDb.type === 'mongodb' ? 'bg-green-500/10 border-green-500/30' :
              detectedDb.type === 'postgresql' ? 'bg-blue-500/10 border-blue-500/30' :
              detectedDb.type === 'mysql' ? 'bg-orange-500/10 border-orange-500/30' :
              'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className="text-3xl">{detectedDb.icon}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white">{detectedDb.name} Detected</h4>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      detectedDb.type === 'mongodb' ? 'bg-green-500/20 text-green-400' :
                      detectedDb.type === 'postgresql' ? 'bg-blue-500/20 text-blue-400' :
                      detectedDb.type === 'mysql' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {detectedDb.type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{detectedDb.description} • Default port: {detectedDb.defaultPort}</p>
                </div>
              </div>
            </div>
          )}

          {/* URI Input */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-white">
                Database Connection URI
              </label>
              <button
                onClick={() => setShowExamples(!showExamples)}
                className="text-xs text-gray-400 hover:text-white transition"
              >
                {showExamples ? '✕ Close Examples' : '📝 Show Examples'}
              </button>
            </div>
            
            {/* Example URIs */}
            {showExamples && (
              <div className="mb-4 p-4 rounded-lg bg-black/20 border border-neutral-700/30 space-y-3 animate-in slide-in-from-top duration-200">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">Click to use example:</h4>
                {Object.entries(DATABASE_EXAMPLES).map(([type, examples]) => (
                  <div key={type} className="space-y-2">
                    <div className="text-xs font-semibold text-white capitalize">{type}</div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => useExample(type, false)}
                        className="px-3 py-1.5 rounded bg-black/30 hover:bg-black/40 border border-neutral-600/30 text-xs text-gray-300 hover:text-white transition"
                      >
                        Cloud/Hosted
                      </button>
                      <button
                        onClick={() => useExample(type, true)}
                        className="px-3 py-1.5 rounded bg-black/30 hover:bg-black/40 border border-neutral-600/30 text-xs text-gray-300 hover:text-white transition"
                      >
                        Local
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <textarea
              placeholder="mongodb+srv://user:password@cluster.mongodb.net/database&#10;postgresql://user:pass@host:5432/db&#10;mysql://user:password@host:3306/db&#10;redis://default:password@host:6379"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              className="w-full px-4 py-3 bg-black/20 backdrop-blur-md border border-neutral-800/50 hover:border-neutral-700/50 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-all resize-none text-sm font-mono"
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-2">
              ✨ Supports: MongoDB, PostgreSQL, MySQL, Redis, Supabase
            </p>
          </div>

          {/* Connect Button */}
          <button
            onClick={connect}
            disabled={!uri.trim() || !detectedDb}
            className="w-full py-3 px-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-400 transition-all duration-300 disabled:cursor-not-allowed"
          >
            {`Connect to Database ${detectedDb ? `(${detectedDb.icon} ${detectedDb.name})` : ''}`}
          </button>
        </div>

        {/* Query Examples for Detected DB */}
        {detectedDb && DATABASE_EXAMPLES[detectedDb.type] && !connectionInfo && (
          <div className="mt-6 p-6 rounded-xl bg-black/20 backdrop-blur-md border border-neutral-800/50">
            <h3 className="text-sm font-semibold text-white mb-3">
              💬 Example Queries for {detectedDb.name}
            </h3>
            <div className="space-y-2">
              {DATABASE_EXAMPLES[detectedDb.type].queries.map((query, i) => (
                <div key={i} className="px-4 py-2 rounded-lg bg-black/20 border border-neutral-700/30 text-sm text-gray-300">
                  "{query}"
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              These queries will work in English, Hindi (हिंदी), and Marathi (मराठी)
            </p>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-8 pt-6 border-t border-neutral-800/50">
          <h3 className="text-sm font-semibold text-white mb-4">🚀 Quick Setup Guides</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-lg bg-black/20 border border-neutral-700/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🍃</span>
                <h4 className="font-semibold text-white text-sm">MongoDB Atlas</h4>
              </div>
              <ol className="text-xs text-gray-400 space-y-1">
                <li>1. Go to MongoDB Atlas</li>
                <li>2. Click "Connect" → "Drivers"</li>
                <li>3. Copy connection string</li>
                <li>4. Replace &lt;password&gt; with your password</li>
              </ol>
            </div>
            
            <div className="p-4 rounded-lg bg-black/20 border border-neutral-700/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">⚡</span>
                <h4 className="font-semibold text-white text-sm">Supabase</h4>
              </div>
              <ol className="text-xs text-gray-400 space-y-1">
                <li>1. Go to Project Settings</li>
                <li>2. Navigate to Database</li>
                <li>3. Copy Connection String (URI format)</li>
                <li>4. Replace [YOUR-PASSWORD] placeholder</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            🔒 Your connection string is stored locally and never shared • Works offline with Ollama
          </p>
          <p className="text-xs text-gray-600 mt-1">
            ⚡ First-time connection includes AI warm-up (10-15 seconds) • All subsequent queries are instant
          </p>
        </div>
      </div>
    </div>
  );
}