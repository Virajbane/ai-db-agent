export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 p-10">
      <div className="max-w-xl w-full bg-white rounded-xl shadow p-8">
        <h1 className="text-3xl font-bold text-center">
          AI Database Agent
        </h1>

        <p className="mt-2 text-gray-600 text-center">
          Connect your database → Chat → Let the AI modify data safely.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          <a
            href="/connect"
            className="w-full text-center bg-black text-white py-3 rounded-lg text-lg hover:bg-neutral-800"
          >
            🔌 Connect Database
          </a>

          <a
            href="/chat"
            className="w-full text-center bg-blue-600 text-white py-3 rounded-lg text-lg hover:bg-blue-700"
          >
            💬 Chat With AI Agent
          </a>
        </div>
      </div>
    </main>
  );
}
