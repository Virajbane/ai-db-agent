"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SchemaViewer() {
  const [uri, setUri] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("dbURI");
    if (!stored) {
      router.push("/connect");
      return;
    }
    setUri(stored);
    fetchSchema(stored);
  }, [router]);

  async function fetchSchema(dbUri, forceRefresh = false) {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/db/introspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: dbUri, refresh: forceRefresh })
      });
      
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || "Failed to fetch schema");
      }
      
      setMetadata(data.metadata);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    if (!uri) return;
    setRefreshing(true);
    await fetchSchema(uri, true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🔍</div>
          <p className="text-white text-xl">Scanning database...</p>
          <p className="text-gray-400 text-sm mt-2">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-2xl p-8 max-w-md text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Schema Scan Failed</h2>
          <p className="text-gray-300 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push("/chat")}
            className="px-6 py-2 bg-white text-black rounded-lg hover:bg-gray-100 transition"
          >
            Back to Chat
          </button>
        </div>
      </div>
    );
  }

  if (!metadata) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">📊 Database Schema</h1>
              <p className="text-gray-400 text-sm">
                Last scanned: {new Date(metadata.scannedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-blue-500/20 backdrop-blur-md hover:bg-blue-500/30 text-blue-300 rounded-lg border border-blue-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshing ? "🔄 Refreshing..." : "🔄 Refresh"}
              </button>
              <button
                onClick={() => router.push("/chat")}
                className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-100 transition font-semibold"
              >
                Back to Chat
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-xl p-6">
            <div className="text-4xl mb-2">📂</div>
            <div className="text-2xl font-bold text-white">{metadata.totalCollections}</div>
            <div className="text-gray-400 text-sm">Collections</div>
          </div>
          
          <div className="bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-xl p-6">
            <div className="text-4xl mb-2">📄</div>
            <div className="text-2xl font-bold text-white">{metadata.totalDocuments.toLocaleString()}</div>
            <div className="text-gray-400 text-sm">Total Documents</div>
          </div>
          
          <div className="bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-xl p-6">
            <div className="text-4xl mb-2">💾</div>
            <div className="text-2xl font-bold text-white">
              {formatBytes(metadata.collections.reduce((sum, c) => sum + c.storageSize, 0))}
            </div>
            <div className="text-gray-400 text-sm">Storage Size</div>
          </div>
        </div>

        {/* Collections */}
        <div className="space-y-4">
          {metadata.collections.map((col, idx) => (
            <div
              key={idx}
              className="bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-xl overflow-hidden"
            >
              {/* Collection Header */}
              <div className="bg-black/30 border-b border-neutral-800/50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white">📂 {col.name}</h3>
                    <p className="text-gray-400 text-sm mt-1">
                      {col.documentCount.toLocaleString()} documents • {formatBytes(col.storageSize)} • 
                      Avg size: {formatBytes(col.avgDocSize)}
                    </p>
                  </div>
                  {col.indexes.length > 0 && (
                    <div className="text-sm text-gray-400">
                      📌 {col.indexes.length} {col.indexes.length === 1 ? "index" : "indexes"}
                    </div>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div className="p-6">
                <h4 className="text-sm font-semibold text-gray-400 mb-3">
                  🔑 FIELDS ({col.fields.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {col.fields.map((field, fieldIdx) => {
                    const types = col.fieldTypes[field]?.join(" | ") || "unknown";
                    const sample = col.sampleValues[field];
                    
                    return (
                      <div
                        key={fieldIdx}
                        className="bg-black/30 backdrop-blur-md border border-neutral-700/30 rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-white font-semibold truncate">
                              {field}
                            </div>
                            <div className="text-xs text-blue-400 mt-1">{types}</div>
                            {sample !== undefined && (
                              <div className="text-xs text-gray-500 mt-1 truncate font-mono">
                                Example: {JSON.stringify(sample)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Indexes */}
                {col.indexes.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-400 mb-3">
                      📌 INDEXES ({col.indexes.length})
                    </h4>
                    <div className="space-y-2">
                      {col.indexes.map((idx, idxIdx) => (
                        <div
                          key={idxIdx}
                          className="bg-black/30 backdrop-blur-md border border-neutral-700/30 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-mono text-sm text-white font-semibold">
                                {idx.name}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                Fields: {idx.keys.join(", ")}
                              </div>
                            </div>
                            {idx.unique && (
                              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">
                                UNIQUE
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}