// ============================================================================
// app/chat/page.js - Enhanced with Smart Table Discovery & Confirmation Dialog
// ============================================================================

"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// Database type detector
function detectDatabaseType(uri) {
  if (!uri) return null;
  
  const lower = uri.toLowerCase();
  
  if (lower.includes('mongodb://') || lower.includes('mongodb+srv://')) {
    return { type: 'mongodb', name: 'MongoDB', icon: '🍃', color: 'green' };
  }
  if (lower.includes('postgresql://') || lower.includes('postgres://') || lower.includes('supabase.co')) {
    const isSupabase = lower.includes('supabase.co');
    return { 
      type: isSupabase ? 'supabase' : 'postgresql', 
      name: isSupabase ? 'Supabase' : 'PostgreSQL', 
      icon: isSupabase ? '⚡' : '🐘', 
      color: 'blue' 
    };
  }
  if (lower.includes('mysql://')) {
    return { type: 'mysql', name: 'MySQL', icon: '🐬', color: 'orange' };
  }
  if (lower.includes('redis://') || lower.includes('rediss://')) {
    return { type: 'redis', name: 'Redis', icon: '🔴', color: 'red' };
  }
  
  return null;
}

// ============================================================================
// SMART QUERY DETECTOR - Detects if user wants to see tables
// ============================================================================
function detectIntrospectionIntent(userText) {
  const lower = userText.toLowerCase();
  
  const introspectionKeywords = [
    // English
    'show tables', 'list tables', 'what tables', 'available tables', 'show collections',
    'list collections', 'what collections', 'show all tables', 'show database',
    'what do you have', 'what data', 'show schema', 'database structure',
    
    // Hindi
    'सभी tables दिखाओ', 'tables बताओ', 'कौन से tables', 'tables list',
    'collections दिखाओ', 'database में क्या है',
    
    // Marathi
    'सर्व tables दाखव', 'tables सांग', 'कोणते tables', 'database मध्ये काय आहे'
  ];
  
  return introspectionKeywords.some(keyword => lower.includes(keyword));
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uri, setUri] = useState(null);
  const [dbInfo, setDbInfo] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showDbDetails, setShowDbDetails] = useState(false);
  
  // 🆕 Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  
  const messagesEndRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("dbURI") || "";
    const storedType = localStorage.getItem("dbType") || "";
    
    setUri(stored);
    
    if (stored) {
      const detected = detectDatabaseType(stored);
      setDbInfo({
        ...detected,
        dbType: storedType || detected?.type,
        uri: stored,
        truncatedUri: stored.substring(0, 60) + (stored.length > 60 ? '...' : '')
      });
    }
    
    if (!stored) setTimeout(() => router.push("/connect"), 1500);
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!mounted || !uri) return null;

  // ============================================================================
  // SCAN DATABASE FUNCTION
  // ============================================================================
  async function scanDatabase() {
    setMessages((m) => [...m, { 
      role: "system", 
      text: "🔍 Checking database schema..." 
    }]);
    setLoading(true);

    try {
      const res = await fetch("/api/db/introspect", {
        method: "POST",
        body: JSON.stringify({ uri }),
        headers: { "Content-Type": "application/json" }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || "Introspection failed");
      }
      
      if (!data.summary || !data.summary.tables) {
        throw new Error("Invalid response structure from introspection API");
      }
      
      const tables = data.summary.tables || [];
      
      if (tables.length === 0) {
        setMessages((m) => [...m, {
          role: "success",
          text: `⚠️ No tables/collections found in ${data.summary.dbType?.toUpperCase() || 'database'}.\n\nThe database appears to be empty or you may not have permission to view tables.`
        }]);
        return;
      }
      
      const tablesList = tables.map(t => `  • ${t}`).join('\n');
      
      const collectionWord = dbInfo?.dbType === 'mongodb' ? 'Collections' : 'Tables';
      const recordWord = dbInfo?.dbType === 'mongodb' ? 'Documents' : 'Records';
      
      let detailsText = '';
      if (data.collections && data.collections.length > 0) {
        detailsText = '\n\n📊 Details:\n';
        data.collections.forEach(col => {
          const fields = col.fields || [];
          const recordCount = col.recordCount || 0;
          detailsText += `\n${col.name}:\n`;
          detailsText += `  - Fields: ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '...' : ''}\n`;
          detailsText += `  - ${recordWord}: ${recordCount.toLocaleString()}\n`;
        });
      }
      
      const totalRecords = data.summary.totalRecords || 0;
      const dbType = data.summary.dbType?.toUpperCase() || 'DATABASE';
      
      const message = `✅ Found ${tables.length} ${collectionWord.toLowerCase()} in ${dbType}:\n\n${tablesList}\n\n📈 Total ${recordWord}: ${totalRecords.toLocaleString()}${detailsText}\n\n💡 Now you can ask: "show all ${tables[0]}"${tables[1] ? ` or "find data in ${tables[1]}"` : ''}`;
      
      setMessages((m) => [...m, {
        role: "success",
        text: message
      }]);
    } catch (err) {
      console.error('Scan error:', err);
      
      let errorMessage = `❌ Scan failed: ${err.message}`;
      
      if (err.message.includes('fetch') || err.message.includes('NetworkError')) {
        errorMessage += '\n\n💡 Check that your dev server is running and the introspection endpoint exists at /api/db/introspect';
      } else if (err.message.includes('authentication') || err.message.includes('Authentication')) {
        errorMessage += '\n\n💡 Check your database credentials in the connection string';
      } else if (err.message.includes('ECONNREFUSED')) {
        errorMessage += '\n\n💡 Check that your database server is running';
      } else if (err.message.includes('404')) {
        errorMessage += '\n\n💡 The introspection endpoint (/api/db/introspect) does not exist. Create it first.';
      }
      
      setMessages((m) => [...m, {
        role: "error",
        text: errorMessage
      }]);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // 🆕 SMART SEND FUNCTION - With Pipeline & Confirmation
  // ============================================================================
  async function send() {
    if (!input.trim()) return;
    const userText = input.trim();
    setMessages((m) => [...m, { role: "user", text: userText }]);
    setInput("");

    if (detectIntrospectionIntent(userText)) {
      await scanDatabase();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/ai/run-query", {
        method: "POST",
        body: JSON.stringify({ 
          dbType: dbInfo?.dbType || "mongodb", 
          userText, 
          collections: [],
          previewLimit: 50,
          uri: uri
        }),
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await res.json();
      
      if (!data.ok) {
        if (data.error.includes('does not exist') || data.error.includes('not found')) {
          throw new Error(data.error + '\n\n💡 Tip: Type "show tables" to see available tables');
        }
        throw new Error(data.error || "Failed to parse query");
      }
      
      // 🆕 SMART CONFIRMATION LOGIC
      // Only show confirmation if:
      // 1. Low confidence (< 0.8) - user might have meant something else
      // 2. Destructive action (UPDATE/DELETE) - always confirm before modifying data
      // 3. Unknown intent - we're not sure what user wants
      
      const needsConfirmation = 
        (data.pipeline?.confidence < 0.8) ||  // Low confidence
        (data.pipeline?.isDestructive) ||     // Destructive (UPDATE/DELETE)
        (data.pipeline?.intent === 'UNKNOWN'); // Unclear intent
      
      if (needsConfirmation) {
        showConfirmationDialog(data);
        setLoading(false);
        return;
      }
      
      // High confidence + safe action (READ) - proceed directly
      displayQueryResult(data);
      
    } catch (err) {
      const errorMsg = err.message.includes("Ollama") 
        ? `🔴 ${err.message}\n\nMake sure:\n1. Ollama is installed\n2. Run: ollama serve\n3. Pull model: ollama pull qwen2.5-coder:7b`
        : err.message;
        
      setMessages((m) => [...m, { role: "error", text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // 🆕 CONFIRMATION DIALOG FUNCTIONS
  // ============================================================================
  function showConfirmationDialog(data) {
    const { pipeline, action } = data;
    
    // Create user-friendly message based on action
    let userFriendlyMessage = "";
    const targetName = action.collection || action.table || "data";
    
    if (action.action === "find") {
      userFriendlyMessage = `Do you want to see all records from "${targetName}"?`;
    } else if (action.action === "updateOne" || action.action === "update") {
      userFriendlyMessage = `Do you want to update data in "${targetName}"?`;
    } else if (action.action === "deleteOne" || action.action === "delete") {
      userFriendlyMessage = `Do you want to delete data from "${targetName}"?`;
    } else if (action.action === "insertOne" || action.action === "insert") {
      userFriendlyMessage = `Do you want to add new data to "${targetName}"?`;
    } else {
      userFriendlyMessage = `Do you want to ${action.action} on "${targetName}"?`;
    }
    
    let dialogContent = {
      title: "",
      message: "",
      userFriendlyMessage: userFriendlyMessage,
      isDestructive: pipeline.isDestructive,
      action: action,
      pipeline: pipeline,
      showQuery: false // 🆕 Don't show technical query by default
    };
    
    if (pipeline.confidence < 0.8) {
      dialogContent.title = "🤔 Please Confirm";
      dialogContent.message = `I understood: "${pipeline.normalized}"`;
      dialogContent.type = "clarification";
    } else if (pipeline.isDestructive) {
      dialogContent.title = "⚠️ Warning";
      dialogContent.message = "This will modify your database data.";
      dialogContent.type = "destructive";
    }
    
    setConfirmationDialog(dialogContent);
    setPendingAction(data);
  }

  function confirmAction() {
    if (pendingAction) {
      // Close dialog first
      setConfirmationDialog(null);
      
      // Display result in chat
      displayQueryResult(pendingAction);
      
      // Clear pending
      setPendingAction(null);
    }
  }

  function cancelAction() {
    setMessages((m) => [...m, { 
      role: "system", 
      text: "❌ Action cancelled by user" 
    }]);
    setConfirmationDialog(null);
    setPendingAction(null);
  }

  function displayQueryResult(data) {
    const targetName = data.action.collection || data.action.table || data.action.key || "unknown";
    
    // Create user-friendly message based on action
    let userMessage = "";
    
    if (data.action.action === "find") {
      userMessage = `✅ Okay! I'll show you data from "${targetName}"`;
    } else if (data.action.action === "updateOne" || data.action.action === "update") {
      userMessage = `✅ I'll update the data in "${targetName}"`;
    } else if (data.action.action === "deleteOne" || data.action.action === "delete") {
      userMessage = `✅ I'll delete the data from "${targetName}"`;
    } else if (data.action.action === "insertOne" || data.action.action === "insert") {
      userMessage = `✅ I'll add new data to "${targetName}"`;
    } else if (data.action.action === "count") {
      userMessage = `✅ I'll count records in "${targetName}"`;
    } else {
      userMessage = `✅ Ready to ${data.action.action} on "${targetName}"`;
    }
    
    setMessages((m) => [
      ...m,
      { 
        role: "ai", 
        text: userMessage, 
        action: data.action,
        metadata: data.metadata,
        pipeline: data.pipeline
      },
    ]);
  }

  // ============================================================================
  // PREVIEW & EXECUTE FUNCTIONS
  // ============================================================================
  async function previewAction(action) {
    const isFind = action.action === "find";
    const dbType = dbInfo?.dbType || "mongodb";
    
    if (!isFind) {
      alert("Preview only available for find/select queries");
      return;
    }
    
    setMessages((m) => [...m, { role: "system", text: "🔍 Fetching preview..." }]);
    setExecuting(true);

    try {
      const previewAction = { ...action };
      
      if (dbType === 'mongodb') {
        previewAction.options = { 
          ...action.options, 
          limit: 5 
        };
      } else {
        previewAction.limit = 5;
      }
      
      const res = await fetch("/api/ai/execute", {
        method: "POST",
        body: JSON.stringify({ uri, action: previewAction }),
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await res.json();
      
      if (!data.ok) {
        if (data.error.includes('does not exist') || data.error.includes('not found')) {
          throw new Error(data.error + '\n\n💡 Tip: Type "show tables" to see available tables');
        }
        throw new Error(data.error || "Preview failed");
      }
      
      const resultCount = data.result?.length || 0;
      const resultText = resultCount > 0 
        ? JSON.stringify(data.result, null, 2)
        : "No results found";
      
      let projectionInfo = "";
      if (data.metadata?.projectionUsed && data.metadata?.fieldsReturned) {
        projectionInfo = `📋 Showing fields: ${data.metadata.fieldsReturned.join(', ')}\n\n`;
      }
      
      setMessages((m) => [...m, {
        role: "preview",
        text: `🔍 Preview (showing ${resultCount} results):\n\n${projectionInfo}${resultText}`,
      }]);
    } catch (err) {
      setMessages((m) => [...m, { 
        role: "error", 
        text: `❌ Preview failed: ${err.message}` 
      }]);
    } finally {
      setExecuting(false);
    }
  }

  async function runAction(action) {
    const isDestructive = ["update", "delete"].includes(action.action);
    
    if (isDestructive && !confirm(`⚠️ Execute ${action.action} operation? This will modify your database.`)) {
      return;
    }

    setExecuting(true);
    setMessages((m) => [...m, { 
      role: "system", 
      text: `⚙️ Executing ${action.action}...` 
    }]);

    try {
      const res = await fetch("/api/ai/execute", {
        method: "POST",
        body: JSON.stringify({ uri, action }),
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await res.json();
      
      if (!data.ok) {
        if (data.error.includes('does not exist') || data.error.includes('not found')) {
          throw new Error(data.error + '\n\n💡 Tip: Type "show tables" to see available tables');
        }
        throw new Error(data.error || "Execution failed");
      }
      
      let resultText = formatExecutionResult(data.result, data.metadata);
      
      setMessages((m) => [...m, { 
        role: "success", 
        text: resultText
      }]);
    } catch (err) {
      setMessages((m) => [...m, { 
        role: "error", 
        text: `❌ Execution failed: ${err.message}` 
      }]);
    } finally {
      setExecuting(false);
    }
  }

  function formatExecutionResult(result, metadata) {
    const dbType = metadata?.dbType || dbInfo?.dbType;
    
    if (Array.isArray(result)) {
      let text = result.length > 0
        ? JSON.stringify(result, null, 2)
        : "No results found";
      
      if (metadata?.projectionUsed) {
        text = `📋 Showing fields: ${metadata.fieldsReturned.join(', ')}\n\n${text}`;
      }
      
      return `✅ Found ${result.length} ${dbType === 'mongodb' ? 'document(s)' : 'record(s)'}\n\n${text}`;
    }
    
    if (result.insertedCount !== undefined) {
      let text = `✅ Inserted ${result.insertedCount} ${dbType === 'mongodb' ? 'document(s)' : 'record(s)'}`;
      if (result.insertedId) text += `\nID: ${result.insertedId}`;
      if (result.insertedIds && Object.keys(result.insertedIds).length > 0) {
        text += `\nIDs: ${JSON.stringify(result.insertedIds)}`;
      }
      return text;
    }
    
    if (result.modifiedCount !== undefined) {
      return `✅ Modified ${result.modifiedCount} ${dbType === 'mongodb' ? 'document(s)' : 'record(s)'}\n📊 Matched ${result.matchedCount || 0} ${dbType === 'mongodb' ? 'document(s)' : 'record(s)'}`;
    }
    
    if (result.deletedCount !== undefined) {
      return `✅ Deleted ${result.deletedCount} ${dbType === 'mongodb' ? 'document(s)' : 'record(s)'}`;
    }
    
    if (result.total !== undefined) {
      return `📊 Total count: ${result.total}`;
    }
    
    if (dbType === 'redis' && result.key) {
      return `✅ Redis operation complete\n\n${JSON.stringify(result, null, 2)}`;
    }
    
    return JSON.stringify(result, null, 2);
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      <div className="w-full max-w-5xl h-[calc(100vh-3rem)] flex flex-col bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
        
        {/* Enhanced Header with Database Info */}
        <div className="border-b border-neutral-800/50 bg-black/10">
          <div className="px-6 py-4">
            {/* Top Row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white">🤖 DB Agent</h1>
                {dbInfo && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 border border-neutral-700/30">
                    <span className="text-lg">{dbInfo.icon}</span>
                    <span className="text-sm font-semibold text-white">{dbInfo.name}</span>
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={scanDatabase}
                  disabled={loading || executing}
                  className="text-sm text-gray-400 hover:text-white transition px-3 py-1 rounded-lg hover:bg-black/30 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Scan database to see available tables/collections"
                >
                  🔍 <span>Scan Database</span>
                </button>
                <button
                  onClick={() => { 
                    localStorage.removeItem("dbURI"); 
                    localStorage.removeItem("dbType");
                    router.push("/connect"); 
                  }}
                  className="text-sm text-gray-400 hover:text-white transition px-3 py-1 rounded-lg hover:bg-black/30"
                >
                  Change Database
                </button>
              </div>
            </div>
            
            {/* Bottom Row - Connection Details */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-4 text-gray-400">
                <span>Powered by Ollama (qwen2.5-coder:7b)</span>
                <span className="text-gray-600">•</span>
                <button
                  onClick={() => setShowDbDetails(!showDbDetails)}
                  className="hover:text-white transition flex items-center gap-1"
                >
                  <span>Connection Details</span>
                  <span className="text-xs">{showDbDetails ? '▲' : '▼'}</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Database Type:</span>
                <span className="font-mono font-semibold text-gray-300">{dbInfo?.dbType || 'mongodb'}</span>
              </div>
            </div>

            {/* Expandable Connection Details */}
            {showDbDetails && dbInfo && (
              <div className="mt-3 p-3 rounded-lg bg-black/30 border border-neutral-700/30 animate-in slide-in-from-top duration-200">
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 min-w-20">Database:</span>
                    <span className="text-gray-300 font-semibold">{dbInfo.name}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 min-w-20">Type:</span>
                    <span className="text-gray-300 font-mono">{dbInfo.dbType}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 min-w-20">URI:</span>
                    <span className="text-gray-300 font-mono break-all">{dbInfo.truncatedUri}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 min-w-20">Status:</span>
                    <span className="text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                      Connected
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="w-full h-full flex flex-col">
              {messages.length === 0 ? (
                // Empty State
                <div className="flex flex-col items-center justify-center h-full w-full px-4 py-8">
                  <div className="text-6xl mb-4">{dbInfo?.icon || '🤖'}</div>
                  <h2 className="text-4xl font-bold text-white mb-3">
                    Ask Your {dbInfo?.name || 'Database'}
                  </h2>
                  <p className="text-gray-400 mb-2 max-w-md text-center text-base">
                    Type queries in <span className="text-white font-semibold">English</span>, 
                    <span className="text-white font-semibold"> Hindi (हिंदी)</span>, or 
                    <span className="text-white font-semibold"> Marathi (मराठी)</span>
                  </p>
                  <p className="text-xs text-gray-500 mb-8">
                    Using Ollama with Qwen 2.5 Coder (local, private, no API keys needed)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                    {[
                      { en: "Show tables", hi: "Tables दिखाओ", icon: "🔍" },
                      { en: "Show Ram's email", hi: "Ram का email बताओ", icon: "📧" },
                      { en: "Count all users", hi: "सभी users गिनो", icon: "🔢" },
                      { en: "List all emails", hi: "सर्व emails दाखव", icon: "📋" }
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(q.en)}
                        className="px-4 py-3 rounded-lg bg-black/20 backdrop-blur-md hover:bg-black/30 border border-neutral-700/30 text-gray-300 hover:text-white transition text-sm font-medium text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span>{q.icon}</span>
                          <div className="flex-1">
                            <div className="font-semibold">{q.en}</div>
                            <div className="text-xs text-gray-500 mt-1">{q.hi}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                // Messages
                <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-2xl rounded-lg px-4 py-3 text-sm ${
                        m.role === "user"
                          ? "bg-black/30 backdrop-blur-md text-white border border-neutral-700/30"
                          : m.role === "error"
                          ? "bg-red-500/10 backdrop-blur-md text-red-400 border border-red-500/30"
                          : m.role === "success"
                          ? "bg-green-500/10 backdrop-blur-md text-green-400 border border-green-500/30"
                          : m.role === "preview"
                          ? "bg-blue-500/10 backdrop-blur-md text-blue-400 border border-blue-500/30"
                          : "bg-black/30 backdrop-blur-md text-gray-300 border border-neutral-700/30"
                      }`}>
                        <p className="whitespace-pre-wrap break-words font-light font-mono">{m.text}</p>
                        {m.action && (
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                              onClick={() => previewAction(m.action)}
                              disabled={executing || m.action.action !== "find"}
                              className="px-2.5 py-1 text-xs rounded bg-blue-500/20 backdrop-blur-md hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              🔍 Preview
                            </button>
                            <button
                              onClick={() => runAction(m.action)}
                              disabled={executing}
                              className="px-2.5 py-1 text-xs rounded bg-green-500/20 backdrop-blur-md hover:bg-green-500/30 text-green-300 hover:text-green-200 border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              ▶️ Execute
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(m.action, null, 2));
                                alert("✅ Query copied to clipboard!");
                              }}
                              className="px-2.5 py-1 text-xs rounded bg-black/40 backdrop-blur-md hover:bg-black/50 text-gray-300 hover:text-white border border-neutral-700/30 transition"
                            >
                              📋 Copy
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-neutral-800/50 bg-black/10">
            <div className="w-full px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && !loading && !executing && send()}
                  placeholder={`Ask ${dbInfo?.name || 'your database'} in English, Hindi (हिंदी), or Marathi (मराठी)...`}
                  className="flex-1 px-4 py-3 rounded-lg bg-black/20 backdrop-blur-md border border-neutral-700/30 hover:border-neutral-600/30 text-white placeholder-gray-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition text-sm disabled:opacity-50"
                  disabled={loading || executing}
                />
                <button
                  onClick={send}
                  disabled={loading || executing || !input.trim()}
                  className="px-6 py-3 rounded-lg bg-white text-black font-semibold hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-400 transition disabled:cursor-not-allowed text-sm"
                >
                  {loading ? "⏳" : "Send"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 Press Enter to send • Try "show tables" to see available data • Connected to {dbInfo?.name || 'Database'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 🆕 CONFIRMATION DIALOG UI */}
      {confirmationDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-black/90 backdrop-blur-md border-2 border-neutral-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            
            {/* Title */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">
                {confirmationDialog.type === 'destructive' ? '⚠️' : '🤔'}
              </span>
              <h3 className="text-xl font-bold text-white">
                {confirmationDialog.title}
              </h3>
            </div>

            {/* User-Friendly Message */}
            <p className="text-gray-300 mb-3 text-base">
              {confirmationDialog.message}
            </p>
            
            <p className="text-white mb-4 text-lg font-medium">
              {confirmationDialog.userFriendlyMessage}
            </p>

            {/* Optional: Show what was understood (for low confidence) */}
            {confirmationDialog.type === 'clarification' && (
              <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <p className="text-sm text-blue-300">
                  💭 You said: "{confirmationDialog.pipeline.original}"
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              {confirmationDialog.type === 'destructive' ? (
                <>
                  <button
                    onClick={cancelAction}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition"
                  >
                    ❌ No, Cancel
                  </button>
                  <button
                    onClick={confirmAction}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition"
                  >
                    ✅ Yes, Do It
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      cancelAction();
                      setInput(confirmationDialog.pipeline.original);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition"
                  >
                    ✏️ Let Me Retype
                  </button>
                  <button
                    onClick={confirmAction}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition"
                  >
                    ✅ Yes, Proceed
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}