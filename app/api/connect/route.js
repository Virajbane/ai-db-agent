// app/api/connect/route.js
import { connectWithMongoose } from "@/lib/db";

export async function POST(req) {
  try {
    const { uri } = await req.json();
    if (!uri) return new Response(JSON.stringify({ success: false, error: "URI required" }), { status: 400 });

    // Try simple connect (mimic user validation). Close mongoose connection afterwards to avoid long-lived process problems.
    const db = await connectWithMongoose(uri);
    // we don't close mongoose (it keeps global connection). For a simple check, it's fine.
    return new Response(JSON.stringify({ success: true, message: "Connected to MongoDB" }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}
