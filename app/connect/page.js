//  app/connect/page.js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConnectPage() {
  const [uri, setUri] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function connect() {
    if (!uri.trim()) {
      setError("Please enter a MongoDB URI");
      return;
    }

    setStatus("Connecting...");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        body: JSON.stringify({ uri }),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem("dbURI", uri);
        setStatus("Connected successfully");
        setTimeout(() => router.push("/chat"), 1200);
      } else {
        setError(data.error || data.message || "Connection failed");
        setStatus("");
      }
    } catch (err) {
      setError(err.message || "Connection failed");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 py-8 pointer-events-none">
      <div className="w-full max-w-xl pointer-events-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-white mb-3">DB Agent</h1>
          <p className="text-gray-400 text-lg font-light">
            Query your MongoDB database with natural language
          </p>
        </div>

        {/* Form Card */}
        <div className="space-y-6">
          {/* Input Label */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              MongoDB Connection URI
            </label>
            <textarea
              placeholder="mongodb+srv://user:password@cluster.mongodb.net/database?..."
              value={uri}
              onChange={(e) => {
                setUri(e.target.value);
                setError("");
              }}
              className="w-full px-4 py-3 bg-black/20 backdrop-blur-md border border-neutral-800/50 hover:border-neutral-700/50 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-all resize-none text-sm font-mono"
              rows={5}
            />
            <p className="text-xs text-gray-500 mt-2">
              Get your connection string from MongoDB Atlas Dashboard
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 backdrop-blur-md border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div className="p-4 rounded-lg bg-green-500/10 backdrop-blur-md border border-green-500/30 text-green-400 text-sm">
              {status}
            </div>
          )}

          {/* Connect Button */}
          <button
            onClick={connect}
            disabled={loading || !uri.trim()}
            className="w-full py-3 px-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 disabled:bg-gray-700 disabled:text-gray-400 transition-all duration-300 disabled:cursor-not-allowed"
          >
            {loading ? "Connecting..." : "Connect to Database"}
          </button>
        </div>

        {/* Help Section */}
        <div className="mt-12 pt-8 border-t border-neutral-800/50">
          <h3 className="text-sm font-semibold text-white mb-4">Quick Start</h3>
          <ol className="text-sm text-gray-400 space-y-2">
            <li>1. Go to MongoDB Atlas Dashboard</li>
            <li>2. Click "Connect" → "Drivers"</li>
            <li>3. Copy your connection string</li>
            <li>4. Paste above and connect</li>
          </ol>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-600 mt-8">
          Your connection string is stored locally and never shared
        </p>
      </div>
    </div>
  );
}