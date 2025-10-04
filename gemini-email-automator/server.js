import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import bodyParser from 'body-parser';
import url from 'url';

const app = express();
const PORT = 3001;

// --- Middleware ---
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json()); // Parse JSON bodies

// --- Helper Functions (inspired by your Python script) ---

/**
 * Finds a potential "Contact Us" page URL from the base URL's homepage using Puppeteer.
 * @param {string} baseUrl - The base URL of the website (e.g., https://www.morphius.in/)
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @returns {Promise<string>} The URL of the contact page or the base URL as a fallback.
 */
async function getContactPageUrl(browser, baseUrl) {
    const page = await browser.newPage();
    try {
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        
        const contactUrl = await page.evaluate((base) => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            const keywords = ['contact', 'about', 'support', 'reach'];
            let foundUrl = base;

            for (const link of links) {
                const href = link.href.toLowerCase();
                if (keywords.some(keyword => href.includes(keyword))) {
                    foundUrl = link.href;
                    break; // Exit loop once a likely candidate is found
                }
            }
            return foundUrl;
        }, baseUrl);

        return contactUrl;
    } catch (error) {
        console.error(`Failed to find contact page for ${baseUrl}, falling back. Error: ${error.message}`);
        return baseUrl; // Fallback to the original URL on error
    } finally {
        await page.close();
    }
}

/**
 * Extracts emails, phone numbers, and addresses from a block of text.
 * @param {string} text - The text content of a webpage.
 * @returns {{emails: string[], phones: string[], addresses: string[]}}
 */
function extractContactInfoFromText(text) {
    // Regex to find email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = Array.from(text.match(emailRegex) || []);

    // Regex to find phone numbers (international format)
    const phoneRegex = /\+?\d[\d\s-]{8,}\d/g;
    const phones = Array.from(text.match(phoneRegex) || []);
    
    // Heuristic to find potential addresses by looking for keywords in lines of text
    const addressKeywords = ["road", "street", "floor", "park", "city", "address", "india", "telangana", "hyderabad"];
    const addressRegex = new RegExp(`^.*(${addressKeywords.join('|')}).*$`, 'gim');
    const addresses = Array.from(text.match(addressRegex) || []).map(line => line.trim().replace(/\s+/g, ' '));

    // Return unique values
    return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)],
        addresses: [...new Set(addresses)],
    };
}


// --- API Endpoint ---

app.post('/api/scrape', async (req, res) => {
    const { url: targetUrl } = req.body;

    if (!targetUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Scraping initiated for: ${targetUrl}`);

    let browser;
    try {
        // 1. Launch the browser
        browser = await puppeteer.launch({ headless: true });

        // 1. Find the contact page
        const contactUrl = await getContactPageUrl(browser, targetUrl);
        console.log(`Found potential contact page: ${contactUrl}`);

        // 2. Fetch the HTML of the contact page
        const page = await browser.newPage();
        await page.goto(contactUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        // 3. Get all visible text from the page body
        const visibleText = await page.evaluate(() => document.body.innerText);

        // 4. Extract contact information from the text
        const contactInfo = extractContactInfoFromText(visibleText);
        console.log('Extraction complete:', contactInfo);

        // 5. Respond with the extracted data
        res.json(contactInfo);

    } catch (error) {
        console.error(`Error during scraping process for ${targetUrl}:`, error.message);
        res.status(500).json({ error: 'Failed to scrape the website.', details: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Scraping proxy server running on http://localhost:${PORT}`);
});