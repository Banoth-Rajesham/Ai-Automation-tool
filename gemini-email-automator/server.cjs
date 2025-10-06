const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config({ path: './.env.local' }); // Specify the path to your .env.local file

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Enable parsing of JSON bodies

// MongoDB Connection
const uri = process.env.VITE_MONGODB_URI;
if (!uri) {
  console.error('FATAL ERROR: VITE_MONGODB_URI is not defined in .env file.');
  process.exit(1);
}

// API Endpoint to save leads
app.post('/api/save-leads', async (req, res) => {
  const leads = req.body;
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ message: 'No leads provided.' });
  }

  if (!db) {
    return res.status(503).json({ message: 'Database not connected.' });
  }

  try {
    // Prepare bulk operations for upserting
    const bulkOps = leads.map(lead => ({
      updateOne: {
        filter: { email: lead.email }, // Use a unique field like email for matching
        update: { $set: lead },
        upsert: true // This is the key: inserts if not found, updates if found
      }
    }));

    const collection = db.collection('leads');
    if (bulkOps.length === 0) {
      return res.status(200).json({ message: 'No leads to process.' });
    }

    const result = await collection.bulkWrite(bulkOps);

    const message = `Successfully processed leads. Inserted: ${result.upsertedCount + result.insertedCount}, Updated: ${result.modifiedCount}.`;
    res.status(201).json({ message, details: result });
  } catch (error) {
    console.error('Failed to save leads to MongoDB', error);
    res.status(500).json({ message: 'Failed to save leads.' });
  }
});

// API Endpoint to get all saved leads
app.get('/api/leads', async (req, res) => {
  if (!db) {
    return res.status(503).json({ message: 'Database not connected.' });
  }
  try {
    const collection = db.collection('leads');
    const leads = await collection.find({}).toArray();
    res.status(200).json(leads);
  } catch (error) {
    console.error('Failed to fetch leads from MongoDB', error);
    res.status(500).json({ message: 'Failed to fetch leads.' });
  }
});

let db;
let server; // Renamed for clarity

async function startServer() {
  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });

    // Connect the client to the server
    await client.connect();
    console.log("✅ Connected successfully to MongoDB Atlas!");
    
    // Establish and assign the database instance
    db = client.db("email_automator_db"); // Using a more descriptive DB name

    // Send a ping to confirm a successful connection
    await db.command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    server = app.listen(port, () => {
      console.log(`🚀 Server listening on http://localhost:${port}`);
    });

    // Graceful shutdown
    const cleanup = async () => {
      await client.close(); // client is captured by the closure
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (err) {
    console.error("❌ Connection error:", err);
    process.exit(1);
  }
}

startServer();