import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors()); // Allow requests from your frontend

const PORT = 3002; // Using a new port for the database backend
let db;

// --- Database Initialization ---
async function initializeDatabase() {
  db = await open({
    filename: './database.db',
    driver: sqlite3.Database
  });

  // Create the scraped_data table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_data (
      id TEXT PRIMARY KEY,
      full_name TEXT,
      company TEXT,
      role TEXT,
      work_email TEXT,
      personal_emails TEXT,
      websites TEXT,
      source_details TEXT,
      source TEXT,
      query TEXT,
      confidence_score INTEGER
    )
  `);
  console.log('Database initialized and table is ready.');
}

// --- API Endpoints ---

// GET all scraped data
app.get('/api/scraped-data', async (req, res) => {
  const data = await db.all('SELECT * FROM scraped_data');
  res.json(data);
});

// POST new scraped data (handles multiple items)
app.post('/api/scraped-data', async (req, res) => {
  const newItems = req.body;
  if (!Array.isArray(newItems)) {
    return res.status(400).send('Request body must be an array of scraped items.');
  }

  const stmt = await db.prepare('INSERT OR IGNORE INTO scraped_data (id, full_name, company, role, work_email, personal_emails, websites, source_details, source, query, confidence_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const item of newItems) {
    // Ensure array-like fields are stringified before saving to the database
    const personalEmails = JSON.stringify(item.personal_emails || []);
    const websites = JSON.stringify(item.websites || []);

    await stmt.run(
      item.id, item.full_name, item.company, item.role, item.work_email, 
      personalEmails, websites, 
      item.source_details, item.source, item.query, item.confidence_score
    );
  }
  await stmt.finalize();

  res.status(201).send('Data added successfully.');
});

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
  initializeDatabase();
});