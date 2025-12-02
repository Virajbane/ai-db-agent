export default function Home() {
  return (
    <main className="flex items-center justify-center p-10 fixed inset-0 pointer-events-none">
      <div className="max-w-xl w-full bg-black/20 backdrop-blur-md border border-neutral-800/50 rounded-2xl shadow-2xl p-8 pointer-events-auto">
        <h1 className="text-3xl font-bold text-center text-white">
          AI Database Agent
        </h1>

        <p className="mt-2 text-gray-300 text-center">
          Connect your database → Chat → Let the AI modify data safely.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          <a
            href="/connect"
            className="w-full text-center bg-white text-black py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition"
          >
            🔌 Connect Database
          </a>

          <a
            href="/chat"
            className="w-full text-center bg-neutral-800/60 backdrop-blur-sm text-white py-3 rounded-lg text-lg border border-neutral-700/50 hover:bg-neutral-700/60 hover:border-neutral-600/50 transition"
          >
            💬 Chat With AI Agent
          </a>
        </div>
      </div>
    </main>
  );
}