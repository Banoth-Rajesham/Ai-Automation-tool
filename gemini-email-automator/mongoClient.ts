import { MongoClient, Db } from 'mongodb';

const uri = import.meta.env.VITE_MONGODB_URI as string;

if (!uri) {
  // This warning will appear in the browser console during development if the URI is not set.
  // The app will still run, but database operations will fail.
  console.warn(
    'VITE_MONGODB_URI is not set in your .env.local file. MongoDB features will be disabled.'
  );
}

let client: MongoClient;
let dbInstance: Db;

/**
 * Connects to the MongoDB database and returns the database instance.
 * It uses a single client instance to manage connections efficiently.
 */
export async function connectDB(): Promise<Db> {
  if (dbInstance) {
    return dbInstance;
  }
  if (!uri) {
    throw new Error('MongoDB URI is not configured. Cannot connect to the database.');
  }

  client = new MongoClient(uri);
  await client.connect();
  dbInstance = client.db('email_automator_db'); // You can change 'email_automator_db' to your preferred database name
  return dbInstance;
}