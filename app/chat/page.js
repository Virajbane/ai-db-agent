"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uri, setUri] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("dbURI") || "";
    setUri(stored);
    if (!stored) setTimeout(() => router.push("/connect"), 1500);
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!mounted || !uri) return null;

  async function send() {
    if (!input.trim()) return;
    const userText = input.trim();
    setMessages((m) => [...m, { role: "user", text: userText }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        body: JSON.stringify({ 
          dbType: "mongodb", 
          userText, 
          collections: [], 
          previewLimit: 50,
          uri: uri // Send the database URI so we can fetch schema
        }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setMessages((m) => [
        ...m,
        { role: "ai", text: `Generated ${data.action.action} query on "${data.action.collection}"`, action: data.action },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: err.message }]);
    } finally {
      setLoading(false);
    }
  }

  async function previewAction(action) {
    if (action.action !== "find") return alert("Preview only for find queries");
    setMessages((m) => [...m, { role: "system", text: "Fetching preview..." }]);
    setExecuting(true);

    try {
      const res = await fetch("/api/run-query", {
        method: "POST",
        body: JSON.stringify({ uri, action: { ...action, options: { ...action.options, limit: 5 } } }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMessages((m) => [...m, {
        role: "system",
        text: `${data.result?.length || 0} results:\n\n${JSON.stringify(data.result, null, 2)}`,
      }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: `Preview failed: ${err.message}` }]);
    } finally {
      setExecuting(false);
    }
  }

  async function runAction(action) {
    const isDestructive = ["update", "delete"].includes(action.action);
    if (isDestructive && !confirm(`Execute ${action.action}?`)) return;

    setExecuting(true);
    setMessages((m) => [...m, { role: "system", text: `Executing ${action.action}...` }]);

    try {
      const res = await fetch("/api/run-query", {
        method: "POST",
        body: JSON.stringify({ uri, action }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMessages((m) => [...m, { role: "success", text: `Success!\n\n${JSON.stringify(data.result, null, 2)}` }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: `Failed: ${err.message}` }]);
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      {/* Centered Chat Container with Border */}
      <div className="w-full max-w-5xl h-[calc(100vh-3rem)] flex flex-col bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
        
        {/* Header */}
        <div className="border-b border-neutral-800/50 bg-black/10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">DB Agent</h1>
              <p className="text-xs text-gray-400">Connected</p>
            </div>
            <button
              onClick={() => { localStorage.removeItem("dbURI"); router.push("/connect"); }}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Disconnect
            </button>
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
                  <h2 className="text-4xl font-bold text-white mb-3">Ask Your Database</h2>
                  <p className="text-gray-400 mb-8 max-w-md text-center text-base">
                    Type natural language queries and let AI convert them to MongoDB queries
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
                    {["Find all users", "Count records", "Find active items", "List recent posts"].map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="px-4 py-3 rounded-lg bg-black/20 backdrop-blur-md hover:bg-black/30 border border-neutral-700/30 text-gray-300 hover:text-white transition text-sm font-medium"
                      >
                        {q}
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
                          : "bg-black/30 backdrop-blur-md text-gray-300 border border-neutral-700/30"
                      }`}>
                        <p className="whitespace-pre-wrap break-words font-light">{m.text}</p>
                        {m.action && (
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                              onClick={() => previewAction(m.action)}
                              disabled={executing}
                              className="px-2.5 py-1 text-xs rounded bg-black/40 backdrop-blur-md hover:bg-black/50 text-gray-300 hover:text-white border border-neutral-700/30 disabled:opacity-50 transition"
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => runAction(m.action)}
                              disabled={executing}
                              className="px-2.5 py-1 text-xs rounded bg-black/40 backdrop-blur-md hover:bg-black/50 text-gray-300 hover:text-white border border-neutral-700/30 disabled:opacity-50 transition"
                            >
                              Execute
                            </button>
                            <button
                              onClick={() => navigator.clipboard.writeText(JSON.stringify(m.action, null, 2))}
                              className="px-2.5 py-1 text-xs rounded bg-black/40 backdrop-blur-md hover:bg-black/50 text-gray-300 hover:text-white border border-neutral-700/30 transition"
                            >
                              Copy
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
                  placeholder="Type your query..."
                  className="flex-1 px-4 py-3 rounded-lg bg-black/20 backdrop-blur-md border border-neutral-700/30 hover:border-neutral-600/30 text-white placeholder-gray-500 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition text-sm disabled:opacity-50"
                  disabled={loading || executing}
                />
                <button
                  onClick={send}
                  disabled={loading || executing || !input.trim()}
                  className="px-6 py-3 rounded-lg bg-white text-black font-semibold hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-400 transition disabled:cursor-not-allowed text-sm"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Press Enter to send</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}