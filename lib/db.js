import mongoose from "mongoose";
import { MongoClient } from "mongodb";

/**
 * connectWithMongoose(uri) - used to validate connection
 */
export async function connectWithMongoose(uri) {
  if (!uri) throw new Error("Mongo URI required");
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri);
  return mongoose;
}

/**
 * getNativeMongoClient(uri) - returns a native mongodb client (modern driver)
 */
export async function getNativeMongoClient(uri) {
  if (!uri) throw new Error("Mongo URI required");
  const client = new MongoClient(uri);
  await client.connect();
  return client;
}