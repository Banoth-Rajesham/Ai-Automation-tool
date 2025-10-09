import dotenv from 'dotenv';
// Load environment variables from .env.local (or .env)
const envPath = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: envPath });
dotenv.config(); // Also load .env as a fallback

import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pkg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import nodemailer from 'nodemailer';
import { type ScrapedItem } from './types.js';

const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- Load and cache the signature image on server start ---
// Ensure CALCOM_API_KEY is loaded from .env.local
const signatureImagePath = (() => {
    const publicDir = path.join(process.cwd(), 'public');
    const pngPath = path.join(publicDir, 'signature.png');
    const jpgPath = path.join(publicDir, 'signature.jpg');
    if (fs.existsSync(pngPath)) return pngPath;
    if (fs.existsSync(jpgPath)) return jpgPath;
    return null;
})();

if (!signatureImagePath) {
    console.warn('Signature image not found in /public folder. Falling back to text signature.');
}

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: Number(process.env.PG_PORT),
});

const ensureTableExists = async () => {
  const client = await pool.connect();
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(255) PRIMARY KEY,
        full_name VARCHAR(255),
        company VARCHAR(255),
        role VARCHAR(255),
        work_email VARCHAR(255) UNIQUE,
        personal_emails TEXT[],
        phone_numbers TEXT[],
        websites JSONB,
        source_details VARCHAR(255),
        source VARCHAR(255),
        query TEXT,
        confidence_score INT
      );

      CREATE TABLE IF NOT EXISTS email_activity (
        id SERIAL PRIMARY KEY,
        prospect_id VARCHAR(255) REFERENCES leads(id) ON DELETE CASCADE,
        prospect_email VARCHAR(255),
        action VARCHAR(50), -- e.g., 'interested', 'unsubscribed', 'bounced'
        sentiment VARCHAR(50), -- e.g., 'Interested', 'Not Interested'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await client.query(createTableQuery);
    console.log('✅ "leads" table is ready.');
  } finally {
    client.release();
  }
};

app.use(cors());
app.use(bodyParser.json());

// --- Serve Static Frontend Files (for Production) ---
if (process.env.NODE_ENV === 'production') {
  // The production build of the frontend is expected to be in `dist`
  const clientBuildPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(clientBuildPath));

  // For any other request, serve the index.html file for client-side routing
  app.get('*', (req, res) => {
    // Exclude API routes from this catch-all
    if (!req.originalUrl.startsWith('/api/')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

/**
 * Endpoint to save scraped leads to the database.
 */
app.post('/api/save-leads', async (req: Request, res: Response) => {
  const leads: ScrapedItem[] = req.body;

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ message: 'No leads provided.' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const queryText = 'INSERT INTO leads (id, full_name, company, role, work_email, personal_emails, phone_numbers, websites, source_details, source, query, confidence_score) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (work_email) DO NOTHING';
      let insertedCount = 0;
      for (const lead of leads) {
        const values = [lead.id, lead.full_name, lead.company, lead.role, lead.work_email, lead.personal_emails, lead.phone_numbers, JSON.stringify(lead.websites), lead.source_details, lead.source, lead.query, lead.confidence_score];
        const result = await client.query(queryText, values);
        insertedCount += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
      res.status(201).json({ message: `Successfully inserted ${insertedCount} new leads (duplicates were ignored).` });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Failed to insert leads into database:', error);
    res.status(500).json({ message: 'Failed to save leads to the database.', error: error.message });
  }
});

/**
 * Endpoint to fetch all scraped leads from the database.
 */
app.get('/api/leads', async (_req: Request, res: Response) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM leads');
            res.status(200).json(result.rows);
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Failed to fetch leads from database:', error);
        res.status(500).json({ message: 'Failed to fetch leads.', error: error.message });
    }
});

/**
 * Endpoint to delete a single lead by its ID.
 */
app.delete('/api/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM leads WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Lead not found.' });
      }
      res.status(200).json({ message: 'Lead deleted successfully.' });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error(`Failed to delete lead ${id}:`, error);
    res.status(500).json({ message: 'Failed to delete lead.', error: error.message });
  }
});

/**
 * Endpoint to track an email interaction (e.g., reply, unsubscribe).
 * In a real app, this might be a webhook hit by your email service provider.
 * For this simulation, we'll use mailto links that could redirect to this.
 */
app.post('/api/track-reply', async (req: Request, res: Response) => {
    const { prospectId, action, sentiment, prospectEmail } = req.body;

    if (!prospectId || !action) {
        return res.status(400).json({ message: 'Missing prospectId or action.' });
    }

    try {
        const client = await pool.connect();
        try {
            const queryText = 'INSERT INTO email_activity (prospect_id, prospect_email, action, sentiment) VALUES ($1, $2, $3, $4)';
            await client.query(queryText, [prospectId, prospectEmail, action, sentiment]);
            res.status(200).json({ message: 'Interaction tracked successfully.' });
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Failed to track email interaction:', error);
        res.status(500).json({ message: 'Failed to track interaction.', error: error.message });
    }
});

/**
 * Helper function to send an email using Nodemailer.
 */
async function sendEmailHelper(to: string, subject: string, htmlBody: string, attachments: any[] = []) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"MORPHIUS AI" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: htmlBody,
      attachments: attachments,
    });
    console.log(`Follow-up email sent successfully to ${to}: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error(`Failed to send follow-up email to ${to}:`, error);
    return false;
  }
}

/**
 * Endpoint to handle quick reply actions from emails.
 */
app.get('/api/quick-reply-action', async (req: Request, res: Response) => {
    const { prospectId, prospectEmail, action } = req.query;

    if (!prospectId || !prospectEmail || !action) {
        return res.status(400).send('Missing required parameters for quick reply action.');
    }

    let sentiment: string | undefined;
    let followUpSubject = '';
    let followUpBody = '';
    let meetingLink = '';

    try {
        // 1. Track the action in the database
        const client = await pool.connect();
        try {
            if (action === 'interested') {
                sentiment = 'Interested';
                followUpSubject = 'Great! Let\'s schedule a meeting.';

                // 2. Use the correct, hardcoded Cal.com meeting link.
                meetingLink = 'https://cal.com/banoth-rajesham-jxhqyz/30min?overlayCalendar=true';
                followUpBody = `Dear Prospect,\n\nThanks for your interest! You can book a convenient time for a 30-minute call using this link:\n\n${meetingLink}\n\nLooking forward to connecting!\n\nMORPHIUS AI Team`;
                
            } else if (action === 'more_info') {
                sentiment = 'More Info Requested';
                followUpSubject = 'Here\'s more information about MORPHIUS AI';
                followUpBody = `Dear Prospect,\n\nThanks for your interest! You can find more details about MORPHIUS AI and our solutions on our website: https://www.morphius.in\n\nFeel free to reach out if you have any questions.\n\nMORPHIUS AI Team`;
            } else if (action === 'unsubscribe') {
                sentiment = 'Unsubscribed';
                followUpSubject = 'Unsubscribe Confirmation';
                followUpBody = `Dear Prospect,\n\nYou have been successfully unsubscribed from our mailing list. We're sorry to see you go!\n\nMORPHIUS AI Team`;
            }

            const queryText = 'INSERT INTO email_activity (prospect_id, prospect_email, action, sentiment) VALUES ($1, $2, $3, $4)';
            await client.query(queryText, [prospectId, prospectEmail, action, sentiment]);
        } finally {
            client.release();
        }

        // 3. Send automated follow-up email
        if (followUpSubject && followUpBody) {
            await sendEmailHelper(prospectEmail as string, followUpSubject, followUpBody);
        }

        // 4. Send a simple confirmation message instead of redirecting.
        // This prevents any localhost or other pages from opening on the client's side.
        const confirmationMessage = action === 'interested'
            ? "Thank you for your interest! A follow-up email with a meeting link has been sent to your inbox."
            : "Thank you. Your response has been recorded.";
        res.status(200).send(`<html><body style="font-family: sans-serif; text-align: center; padding-top: 50px;"><h1>${confirmationMessage}</h1></body></html>`);
    } catch (error: any) {
        console.error('Failed to process quick reply action:', error);
        res.status(500).send('Failed to process your request.');
    }
});

/**
 * Endpoint to fetch all email activity for reporting.
 */
app.get('/api/email-activity', async (_req: Request, res: Response) => {
    try {
        const client = await pool.connect();
        try {
            // Fetch recent activities, joining with leads to get email if not stored directly
            const queryText = `
                SELECT ea.prospect_email as email, ea.action as status, ea.sentiment, ea.created_at as date
                FROM email_activity ea
                ORDER BY ea.created_at DESC
                LIMIT 50;
            `;
            const result = await client.query(queryText);
            res.status(200).json(result.rows);
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Failed to fetch email activity:', error);
        res.status(500).json({ message: 'Failed to fetch email activity.', error: error.message });
    }
});

/**
 * Endpoint to send a single email.
 */
app.post('/api/send-email', async (req: Request, res: Response) => {
  let { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ message: 'Missing required fields: to, subject, body.' });
  }

  // The prospect ID is now expected to be part of the request to create unique links
  const { prospectId } = req.body; // Extract prospectId from the request body
  const attachments: any[] = [];
  let finalHtmlBody = body;

  if (signatureImagePath) {
    // If an image exists, attach it and reference it via CID
    const signatureCid = 'signature-image@morphius.ai';
    attachments.push({
      filename: path.basename(signatureImagePath),
      path: signatureImagePath,
      cid: signatureCid, // same cid value as in the html img src
    });
    const signatureHtml = `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; font-family: Arial, sans-serif;">
        <tr>
          <td style="font-size: 14px; color: #555555; line-height: 1.4;">
            <strong>MORPHIUS AI Team</strong><br>
            <a href="mailto:hello@morphius.in" style="color: #1a0dab;">hello@morphius.in</a><br>+91 7981809795<br><a href="https://www.morphius.in" style="color: #1a0dab;" target="_blank">https://www.morphius.in</a>
          </td>
        </tr>
        <tr>
          <td style="padding-top: 15px;">
            <img src="cid:${signatureCid}" alt="MORPHIUS AI Logo" width="150" style="display: block; max-width: 150px; height: auto;">
          </td>
        </tr>
        <tr>
          <td style="padding-top: 20px; text-align: center; font-family: Arial, sans-serif;">
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #555555;"><strong>Quick Reply:</strong></p>
            <a href="${process.env.BACKEND_URL}/api/quick-reply-action?prospectId=${prospectId}&prospectEmail=${to}&action=interested" style="background-color: #4CAF50; color: white; padding: 8px 12px; text-decoration: none; border-radius: 4px; font-size: 12px; margin: 0 5px;" target="_blank">I'm Interested</a>
            <a href="${process.env.BACKEND_URL}/api/quick-reply-action?prospectId=${prospectId}&prospectEmail=${to}&action=more_info" style="background-color: #008CBA; color: white; padding: 8px 12px; text-decoration: none; border-radius: 4px; font-size: 12px; margin: 0 5px;" target="_blank">Send More Info</a>
          </td>
        </tr>
        <tr>
          <td style="padding-top: 20px; font-size: 12px; color: #888888; text-align: center;">
            <p style="margin: 0;">If you no longer wish to receive these emails, you can <a href="${process.env.BACKEND_URL}/api/quick-reply-action?prospectId=${prospectId}&prospectEmail=${to}&action=unsubscribe" style="color: #888888;" target="_blank">unsubscribe here</a>.</p>
          </td>
        </tr>
      </table>
    `;
    finalHtmlBody = body.replace('[SIGNATURE_IMAGE]', signatureHtml);
  } else {
    // Fallback to a text signature if no image is found
    const textSignature = `
      <div style="font-size: 14px; color: #555555; line-height: 1.4; font-family: Arial, sans-serif;">
        Best regards,<br>
        <strong>MORPHIUS AI Team</strong><br>
        <a href="mailto:hello@morphius.in" style="color: #1a0dab;">hello@morphius.in</a><br>+91 7981809795<br><a href="https://www.morphius.in" style="color: #1a0dab;" target="_blank">https://www.morphius.in</a>
        <p style="margin-top: 20px; font-size: 12px; color: #888888;">If you no longer wish to receive these emails, you can <a href="${process.env.BACKEND_URL}/api/quick-reply-action?prospectId=${prospectId}&prospectEmail=${to}&action=unsubscribe" style="color: #888888;" target="_blank">unsubscribe here</a>.</p>
      </div>`;
    finalHtmlBody = body.replace('[SIGNATURE_IMAGE]', textSignature);
  }



  // Configure Nodemailer transporter
  // It's recommended to use environment variables for security
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const success = await sendEmailHelper(to, subject, finalHtmlBody, attachments);
    if (!success) throw new Error("Failed to send email via Nodemailer helper.");

    res.status(200).json({ message: `Email sent successfully to ${to}` });
  } catch (error: any) {
    console.error('Failed to send initial email:', error);
    // Provide a more specific error message for authentication issues
    if (error.code === 'EAUTH') {
      return res.status(500).json({ message: 'Failed to send email: Invalid SMTP credentials. Please check your .env.local file.', error: error.message });
    }
    return res.status(500).json({ message: 'Failed to send email.', error: error.message });
  }
});

const startServer = async () => {
  try {
    await ensureTableExists();
    app.listen(port, () => {
      console.log(`🚀 Backend server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();