
import OpenAI from "openai";
import axios from 'axios';
import Papa from 'papaparse';
import { type AssistantMessageData, type Prospect, type CampaignMetrics, type RecentActivity, type Company, type DataSource, ScrapedItem } from './types';
import { type Campaign } from './types';

let openai: OpenAI;
let contactOutApi: ReturnType<typeof axios.create>;

/**
 * Initializes and returns the OpenAI client instance.
 * IMPORTANT: This implementation is for client-side usage and exposes the API key.
 * For production, you should move API calls to a secure backend.
 * 
 * @security This is a major security risk. In a production environment, this key
 * should be on a server, and the client should make requests to your server,
 * which then calls the OpenAI API.
 */
function getOpenAIClient(): OpenAI {
  if (!openai) {
    const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY as string;
    if (!openaiApiKey) {
      throw new Error("The VITE_OPENAI_API_KEY environment variable is not set. Please check your .env.local file and restart the server.");
    }
    openai = new OpenAI({
      apiKey: openaiApiKey,
      // This is required for client-side (browser) usage of the OpenAI SDK
      dangerouslyAllowBrowser: true,
    });
  }
  return openai;
}

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

// Custom error for retryable API calls
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

// A simple sleep helper to wait between retries
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    // Status codes for rate limiting or temporary server issues
    return error.response?.status === 429 || (error.response?.status ?? 0) >= 500;
  }
  // For non-axios errors, you might check for specific error names or messages
  return error instanceof RetryableError;
}

async function apiCallWithRetry<T>(apiCall: () => Promise<T>, onRetry?: (attempt: number, delay: number) => void): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      if (isRetryable(error) && i < MAX_RETRIES - 1) {
        const retryAfter = error.response?.headers?.['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : INITIAL_DELAY_MS * Math.pow(2, i);
        onRetry ? onRetry(i + 1, delay) : console.warn(`API call failed. Retrying in ${delay}ms... (Attempt ${i + 1}/${MAX_RETRIES})`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  // This line is theoretically unreachable but satisfies TypeScript's code path analysis.
  throw new Error("API call failed after multiple retries.");
}

async function getJsonFromOpenAI(systemInstruction: string, userPrompt: string): Promise<any> {
    const openaiClient = getOpenAIClient();
    const model = "gpt-4o-mini";

    const completion = await apiCallWithRetry(() => openaiClient.chat.completions.create({
        model: model,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
    }), (attempt, delay) => {
        console.warn(`OpenAI API rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
        throw new Error("OpenAI API did not return any content.");
    }

    try {
        return JSON.parse(content);
    } catch (e) {
        console.error("Failed to parse JSON from OpenAI:", content);
        throw new Error("Received malformed JSON from the AI.");
    }
}

function getContactOutApi(): ReturnType<typeof axios.create> {
  if (!contactOutApi) {
    const contactOutApiKey = import.meta.env.VITE_CONTACTOUT_API_KEY as string;
    if (!contactOutApiKey) {
      throw new Error("The VITE_CONTACTOUT_API_KEY environment variable is not set. Please check your .env.local file and restart the server.");
    }
    contactOutApi = axios.create({
      // SECURITY WARNING: The API key is being sent from the browser.
      // In a production app, the Vite proxy should be replaced with a proper backend
      // that adds the API key on the server-side before forwarding the request.
      baseURL: '/api/contactout', // Use the root of the proxy path
      headers: {
        "token": contactOutApiKey,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
  }
  return contactOutApi;
}

export function generateUUID(): string {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // A simple fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Simulates checking an email inbox for replies and generates dynamic campaign metrics.
 * This function mimics the logic of the check_replies1.py script in a client-side safe manner.
 */
function simulateCheckReplies(): { overview: CampaignMetrics; activity: RecentActivity[] } {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Simulate a few recent activities
    const activity: RecentActivity[] = [
        { email: 'user1@example.com', status: 'Replied', sentiment: 'Interested', date: today },
        { email: 'user2@example.com', status: 'Unsubscribed', date: today },
        { email: 'user3@example.com', status: 'Replied', sentiment: 'Not Interested', date: yesterday },
        { email: 'user4@example.com', status: 'Bounced', date: yesterday },
        { email: 'user5@example.com', status: 'Replied', sentiment: 'Interested', date: yesterday },
    ];

    // Dynamically calculate overview metrics based on the simulated activity
    const interested_leads = activity.filter(a => a.sentiment === 'Interested').length;
    const not_interested = activity.filter(a => a.sentiment === 'Not Interested').length;
    const unsubscribed = activity.filter(a => a.status === 'Unsubscribed').length;
    const bounces = activity.filter(a => a.status === 'Bounced').length;
    const replies_received = activity.filter(a => a.status === 'Replied').length;

    // Add some baseline numbers to make it look more realistic
    const overview: CampaignMetrics = {
        emails_sent: 1500 + Math.floor(Math.random() * 50),
        replies_received: 75 + replies_received,
        bounces: 5 + bounces,
        unsubscribed: 12 + unsubscribed,
        interested_leads: 25 + interested_leads,
        not_interested: 38 + not_interested,
    };

    // The function returns the structure expected by the UI components
    return { overview, activity };
}

// --- ContactOut API Functions ---

async function enrichProfileFromLinkedIn(linkedinUrl: string): Promise<Partial<Prospect>> {
    try {
        const url = '/v1/people/enrich'; // Add the version to the specific API call
        const payload = {
            linkedin_url: linkedinUrl,
            include: ["work_email", "personal_email", "phone"]
        };
        const resp = await apiCallWithRetry(() => getContactOutApi().post(url, payload), (attempt, delay) => {
            console.warn(`ContactOut API rate limit hit for ${linkedinUrl}. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
        });

        const profile = resp.data.profile || {};

        return {
            full_name: profile.full_name,
            work_email: (profile.work_email || [])[0],
            personal_emails: profile.personal_email || [],
            phone_numbers: profile.phone || [],
            role: profile.headline || profile.title,
            country: profile.location,
            source_details: linkedinUrl,
            company: profile.company?.name || profile.company_name,
        };
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message || "An unknown error occurred during enrichment.";
        console.error(`ContactOut API Error for ${linkedinUrl}:`, errorMessage);
        // Throw a new error to be caught by the caller, standardizing error handling.
        throw new Error(errorMessage);
    }
}

async function enrichDomain(domain: string): Promise<Partial<Company>[]> {
  const payload = { domains: [domain] };

  try {
    const resp = await apiCallWithRetry(() => getContactOutApi().post("/v1/domain/enrich", payload), (attempt, delay) => {
        console.warn(`ContactOut Domain Enrich API rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
    });
    const enrichedData = resp.data?.companies || [];
    
    return (enrichedData as any[]).map((company: any) => ({
      id: company.id || generateUUID(),
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      size: company.size,
      // map other relevant fields
    }));
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "An unknown error occurred during domain enrichment.";
    console.error(`ContactOut Domain Enrich API Error:`, errorMessage);
    throw new Error(`The domain enrichment failed. The API returned an error: ${errorMessage}`);
  }
}

/**
 * A simple, local parser to convert a keyword-based query into a JSON payload.
 * Example query: `find people with title:"product manager" company:"google"`
 * @param prompt The user's search query.
 * @returns A JSON object for the ContactOut API.
 */
function parseSearchPromptLocally(prompt: string): Record<string, any> {
  const payload: Record<string, any> = {};
  const regex = /(\w+):"([^"]+)"/g;
  let match;

  while ((match = regex.exec(prompt)) !== null) {
    const key = match[1];
    const value = match[2];
    if (payload[key]) {
      // If the key already exists, append the new value to the array.
      payload[key].push(value);
    } else {
      // Otherwise, create a new array with the value.
      payload[key] = [value];
    }
  }

  return payload;
}

/**
 * Uses an LLM to understand the user's intent and extract necessary information.
 * This is more robust than simple regex or keyword matching.
 */
async function getIntent(prompt: string): Promise<{ type: 'enrich_linkedin' | 'enrich_domain' | 'search' | 'web_scrape' | 'command' | 'unknown'; values: string[]; command?: string }> {
    const systemPrompt = `You are an AI assistant that classifies user intent. Analyze the user's prompt and determine the primary action and any associated values.

Your response must be a JSON object with "type", "values", and optionally a "command".

Possible types are:
- "enrich_linkedin": User provides one or more LinkedIn profile URLs. Extract all URLs into the "values" array.
- "enrich_domain": User provides one or more company domain names. Extract all domains into the "values" array.
- "search": User wants to find people or companies using keywords. The full prompt goes into the "values" array.
- "web_scrape": User provides a direct URL to scrape or a general query to find and scrape websites. The URL or query goes into the "values" array.
- "command": User gives a direct command. The command name (e.g., "show prospects") goes into the "command" field.
- "unknown": If the intent is unclear.

Rules:
1.  LinkedIn URLs are the highest priority. If a LinkedIn URL is present, the type is "enrich_linkedin".
2.  If a non-LinkedIn URL is present, the type is "web_scrape".
3.  If the prompt contains keywords like "find", "search for", "who is", or structured search terms like 'title:"CEO"', the type is "search".
4.  If the prompt is a general web search query like "top AI companies in India", the type is "web_scrape".
5.  Direct commands like "show prospects", "generate previews", "send emails", "check replies", "enrich prospects from csv" should be classified as "command".

Examples:
- "enrich https://www.linkedin.com/in/some-profile" -> {"type": "enrich_linkedin", "values": ["https://www.linkedin.com/in/some-profile"]}
- "find people with title:\"product manager\" company:\"google\"" -> {"type": "search", "values": ["find people with title:\"product manager\" company:\"google\""]}
- "top 10 civil engineering colleges in hyderabad" -> {"type": "web_scrape", "values": ["top 10 civil engineering colleges in hyderabad"]}
- "https://www.tesla.com/contact" -> {"type": "web_scrape", "values": ["https://www.tesla.com/contact"]}
- "generate previews" -> {"type": "command", "command": "generate previews", "values": []}
`;

    // Use a simpler regex-based pre-classification for very obvious cases to save API calls.
    const linkedinUrlRegex = /(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/g;
    const linkedinUrls = prompt.match(linkedinUrlRegex);
    if (linkedinUrls) {
        return { type: 'enrich_linkedin', values: linkedinUrls };
    }

    // For everything else, use the LLM to determine intent.
    return await getJsonFromOpenAI(systemPrompt, prompt);
}

// --- New AI Email Generation Logic ---

function classifySector(email?: string, companyName?: string): string {
    const emailDomain = email.split('@').pop()?.toLowerCase() || '';
    const company = (companyName || "").toLowerCase();

    const sectorKeywords: Record<string, string[]> = {
        "Education": ['.edu', 'academy', 'school', 'university'],
        "Health": ['health', 'medical', '.med', 'clinic', 'hospital'],
        "Finance": ['finance', 'bank', 'invest', '.fi', 'capital', 'wealth'],
        "Technology": ['.io', '.ai', '.tech', 'software', 'cloud', 'solutions'],
        "Retail": ['retail', 'shop', 'store', 'commerce', 'fashion', 'trade'],
    };

    for (const sector in sectorKeywords) {
        const keywords = sectorKeywords[sector];
        if (keywords.some(keyword => emailDomain.includes(keyword)) || keywords.some(keyword => company.includes(keyword))) {
            return sector;
        }
    }
            
    return "Other";
}

function getFallbackEmail(prospect: Prospect, senderName: string = "G. Gowthami"): { email_subject: string; email_body: string; } {
    const { full_name, company } = prospect;
    return {
        email_subject: `An idea for ${company || 'your company'}`,
        email_body: `Hi ${full_name || 'there'},\n\nI'm reaching out to share an idea for improving operational workflows at your organization.\n\nWould you be open to a brief chat next week?\n\n— ${senderName}`
    };
}

// --- Gemini API Functions ---

async function generateEmailForProspect(prospect: Prospect, _campaign?: Partial<Campaign>): Promise<{ email_subject: string; email_body: string; compliance_warning?: string; }> {
  // This function is now a simple fallback as the LLM for email generation was removed.
  // To re-enable AI-powered emails, this would need to be updated to call the Gemini client.
  return getFallbackEmail(prospect, "G. Gowthami");
}

// --- Helper Functions ---

export async function getProspectsFromCsv(file?: File): Promise<Prospect[]> {
    let csvText: string;

    if (file) {
        csvText = await file.text();
    } else {
        const response = await fetch('/email.csv');
        if (!response.ok) {
            // Don't throw an error if the default file is missing, just return empty.
            return [];
        }
        csvText = await response.text();
    }
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, transformHeader: header => header.toLowerCase().trim() });
    
    type CsvRow = Record<string, string>;
    const prospects: Prospect[] = [];
    const seenEmails = new Set<string>();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const row of parsed.data as CsvRow[]) {
        const workEmail = row.work_email || row.email;
        const personalEmails = (row.personal_emails || "").split(',').map(e => e.trim()).filter(Boolean);
        const allEmails = [workEmail, ...personalEmails].filter(e => e && emailRegex.test(e));

        // Dedupe: skip if the primary work email has been seen.
        if (!workEmail || seenEmails.has(workEmail)) {
            continue;
        }
        
        allEmails.forEach(e => seenEmails.add(e));

        const lawfulBasis = (row.lawful_basis || 'legitimate_interest').toLowerCase();

        prospects.push({
            id: row.id || generateUUID(),
            full_name: row.full_name || row.prospect_name || '',
            work_email: workEmail,
            personal_emails: personalEmails,
            phone_numbers: (row.phone_numbers || row.phone || "").split(',').map(p => p.trim()).filter(Boolean),
            company: row.company_name || row.company || '',
            role: row.role || '',
            company_id: row.company_id || '',
            source: file ? `csv_upload: ${file.name}` : 'csv_initial_load',
            jurisdiction: row.jurisdiction || 'N/A', // Assume N/A if not in CSV
            lawful_basis: lawfulBasis === 'consent' ? 'consent' : 'legitimate_interest',
            created_at: new Date().toISOString(),
            // Add other fields from your model with defaults if needed
            prospect_name: row.full_name || row.prospect_name, // for UI compatibility
            email: workEmail, // for UI compatibility
        });
    }
    return prospects;
}

// --- Main Service Function ---

async function processSettledPromises<T>(results: PromiseSettledResult<T>[], type: 'linkedin' | 'domain'): Promise<{ successes: T[], errorCount: number }> {
    const successes: T[] = [];
    let errorCount = 0;

    for (const result of results) {
        if (result.status === 'fulfilled') {
            const value = result.value;
            Array.isArray(value) ? successes.push(...value) : successes.push(value);
        } else {
            errorCount++;
            console.error(`Enrichment failed for ${type}:`, result.reason);
        }
    }
    return { successes, errorCount };
}

async function handleEnrichment(urls: string[], type: 'linkedin' | 'domain'): Promise<AssistantMessageData> {
  const enricher = type === 'linkedin' ? enrichProfileFromLinkedIn : enrichDomain;
  const results = await Promise.allSettled(urls.map(url => enricher(url as any)));

  const { successes, errorCount } = await processSettledPromises(results, type);

  if (successes.length === 0) {
    return { text: `Sorry, I couldn't enrich any of the provided ${type}s. Please check the console for errors.` };
  }

  const responseText = `✅ Enrichment complete. Successfully processed ${successes.length} item(s). ${errorCount > 0 ? `Failed to process ${errorCount} item(s).` : ''}`;
  
  // For LinkedIn enrichment, we expect a new prospect to be added.
  // Only return a newProspect if the enrichment was successful.
  if (type === 'linkedin' && successes.length > 0 && 'full_name' in successes[0]) {
    const newProspect: Prospect = {
      id: generateUUID(),
      company_id: '',
      created_at: new Date().toISOString(),
      full_name: 'N/A', // Default value
      ...(successes[0] as Partial<Prospect>),
    };
    return { text: responseText, data: successes, newProspect };
  }

  return { text: responseText, data: successes };
}

async function handleSearch(prompt: string): Promise<AssistantMessageData> {
  let searchPayload: Record<string, any>;
  const systemPrompt = `You are an AI assistant that helps convert a simple user query into structured data for the ContactOut API.
  Your tasks:
  1. Determine if the user wants to find "people" or "companies".
  2. Extract all relevant search fields:
     - For people: name, job_title, exclude_job_titles, skills, education, location, company, exclude_companies, industry, seniority, company_size.
     - For companies: name, domain, location, industry.
  3. Return a valid JSON object where every field contains an array of strings, even if there is only one item. Do not include fields that were not mentioned.
  4. Ignore irrelevant words or fluff; focus only on extracting meaningful search criteria.
  5. Examples:
     - Input: "Find VPs at ContactOut in Sydney but exclude sales roles"
       Output: {"job_title":["VP"],"company":["ContactOut"],"location":["Sydney"],"exclude_job_titles":["Sales"]}
     - Input: "Find software companies in the United States"
       Output: {"industry":["Software"],"location":["United States"]}
     - Input: "google ceo"
       Output: {"company":["Google"],"job_title":["CEO"]}
  
  Constraints:
  - Only return JSON (do not include explanations).
  - Arrays must be non-empty if the field exists.
  - The JSON must be parseable.`;

  searchPayload = await getJsonFromOpenAI(systemPrompt, prompt);

  // Improved intent detection: Check for explicit keywords in the original prompt,
  // then fall back to checking keys in the parsed payload.
  const lowerCasePrompt = prompt.toLowerCase();
  const isPeopleSearch = lowerCasePrompt.includes('people') || lowerCasePrompt.includes('prospects') || ['job_title', 'skills', 'seniority', 'name', 'education'].some(key => key in searchPayload);
  const isCompanySearch = ['industry', 'domain'].some(key => key in searchPayload) && !isPeopleSearch;

  if (isPeopleSearch) { // This is a people search
    searchPayload["reveal_info"] = true;
    searchPayload["limit"] = 10;
    const resp = await apiCallWithRetry(() => getContactOutApi().post("/v1/people/search", searchPayload), (attempt, delay) => {
        console.warn(`ContactOut People Search API rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
    });
    const searchResults = resp.data.profiles ? Object.values(resp.data.profiles) : [];
    const prospects = (searchResults as any[]).map((profile: any) => ({
      id: profile.id || generateUUID(),
      full_name: profile.full_name,
      work_email: (profile.contact_info?.work_emails || [])[0],
      personal_emails: profile.contact_info?.personal_emails || [],
      company: profile.company?.name,
      role: profile.title || profile.headline,
      country: profile.location,
      phone_numbers: profile.contact_info?.phones || [],
      source: 'contactout_search',
      created_at: new Date().toISOString(),
    }));
    return {
      text: `I found ${prospects.length} new prospects from ContactOut based on your request:`,
      data: prospects
    };
  } else if (isCompanySearch) { // This is a company search
    const resp = await apiCallWithRetry(() => getContactOutApi().post("/v1/company/search", searchPayload), (attempt, delay) => {
        console.warn(`ContactOut Company Search API rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
    });
    const searchResults = resp.data.companies || [];
    const companies = searchResults.map((company: any) => ({
      id: company.id || generateUUID(),
      name: company.name,
      domain: company.domain,
      industry: company.industry,
    }));
    return {
      text: `I found ${companies.length} companies matching your request:`,
      data: companies
    };
  } else {
    return { text: "I couldn't determine if you're looking for people or companies. Please be more specific." };
  }
}

async function handleCsvEnrichment(): Promise<AssistantMessageData> {
    const response = await fetch('/email.csv');
    if (!response.ok) {
        throw new Error("Could not find email.csv in the public folder.");
    }
    const csvText = await response.text();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const urls = parsed.data.map((row: any) => row.linkedin_url).filter(Boolean);

    if (urls.length === 0) {
        return { text: "No LinkedIn URLs found in email.csv." };
    }

    return handleEnrichment(urls, 'linkedin');
}

/**
 * Saves extracted leads to the MongoDB database.
 * This function runs in the background and includes error handling
 * to prevent database issues from crashing the application.
 * @param leads An array of leads to save.
 */
async function saveLeadsToServer(leads: ScrapedItem[]): Promise<void> {
  if (leads.length === 0) return;
  try {
    // This now calls our new backend server endpoint
    const response = await axios.post('http://localhost:3001/api/save-leads', leads);
    console.log(`✅ Leads saved to server: ${response.data.message}`);
  } catch (error) {
    console.error("Error saving leads to server:", error);
    // We log the error but don't throw, so the UI experience isn't interrupted.
  }
}

async function handleWebScraping(prompt: string): Promise<AssistantMessageData> {
    const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
    let scrapeTargets: string[] = [];

    // If the user provides a direct URL, use it. Otherwise, use the AI to find URLs.
    if (urlRegex.test(prompt)) {
        scrapeTargets = [prompt];
    } else {
        const urlFinderSystemPrompt = `You are a Lead Generation Specialist. Your goal is to find the best possible URLs for contact information based on a user's query.
- Analyze the user's query to understand their intent, even if it's messy or has misspellings (e.g., "collages" instead of "colleges").
- Analyze the user's query to identify if a specific number of results is requested (e.g., "top 50"). If so, aim for that number. Otherwise, find up to 10 relevant websites.
- For each website, find the most direct URL for contact information (e.g., a "Contact Us" page, "About" page, or the homepage).
- Return a valid JSON object with a single key "urls", which is an array of fully-qualified URL strings.`;
        const result = await getJsonFromOpenAI(urlFinderSystemPrompt, prompt);
        scrapeTargets = result.urls || [];
    }

    // Step 2: Scrape each URL in parallel for much faster results.
    const scrapePromises = scrapeTargets.map(async (targetUrl: string) => {
      try {
        // Step 3: Use Jina AI Reader to get clean page content.
        // Adding a security header can improve reliability for the Jina service.
        // This is a free tier key, but in a real app, it should be in .env
        const jinaApiKey = 'jina_b5a7f10b3a1a4a1c9b0a1a1a1a1a1a1a'; // Example, should be in .env
        const readerResponse = await axios.get(`https://r.jina.ai/${targetUrl}`, {
          headers: { 
            'Accept': 'application/json',
            'x-api-key': `Bearer ${jinaApiKey}`
          },
        });
        const pageContent = readerResponse.data.data.content;

        const leadExtractionSystemPrompt = `You are an advanced AI Lead Generation Agent. 
Your task is to extract high-quality **decision-maker contact information** from any text, webpage, or document. Always return JSON in a single object with a "leads" array.

### Rules:
1. **Target Roles**:
   - Extract multiple leads per organization:
     • Top Management (CEO, Founder, Director, Principal, Dean)
     • Department Heads / VPs / Managers / Professors / Advisors / Program Leads
   - If a department or specialty is mentioned (e.g., "Computer Science", "Admissions"), prioritize leaders in that area.

2. **Required Fields per Lead**:
   - full_name
   - role
   - company (or organization)
   - work_email (corporate emails preferred; avoid personal unless last resort)
   - personal_emails (optional)
   - phone (only direct numbers; skip IVR or call-center)
   - website (main org page or department page)
   - confidence_score (0-100; higher for verified corporate info)
   - source_details (page URL, text snippet, or origin of the data)

3. **Avoid Generic Contacts**:
   - Skip emails like info@, contact@, admissions@, careers@, hr@, enquiry@, webmaster@.

4. **Deeper Search**:
   - If "Contact Us" pages only provide generic info, explore "About", "Team", "Leadership", "Faculty", "Departments" pages.
   - For large text blocks, extract **titles + names** (e.g., "Dr. A. Kumar, Head of Dept").

5. **Enrichment / Role Inference**:
   - Cross-check extracted names with organizational context (LinkedIn-style reasoning) to assign correct roles.
   - If only a role is found (e.g., "Principal"), keep full_name = role, role = role.

6. **Strict Validation**:
   - Only return leads with at least a role + organization + valid work_email.
   - Assign higher confidence if email clearly matches the organization domain.`;
        const { leads } = await getJsonFromOpenAI(leadExtractionSystemPrompt, pageContent);
        // Ensure phone numbers are consistently in an array format
        return (leads || []).map((lead: any) => {
          const newLead = {
            ...lead,
            phone_numbers: Array.isArray(lead.phone) ? lead.phone : (lead.phone ? [lead.phone] : []),
            source_details: `Scraped from ${targetUrl}`,
            query: targetUrl
          };
          delete newLead.phone; // Remove the old 'phone' property
          return newLead;
        });
      } catch (error: any) {
        console.error(`Failed to scrape ${targetUrl}:`, error.message);
        return []; // Return empty array on failure to not break the entire process.
      }
    });

    const results = await Promise.all(scrapePromises);
    const rawLeads = results.flat();
    const validatedLeads = validateAndCleanLeads(rawLeads);

    // Save to DB in the background without blocking the response to the user.
    saveLeadsToServer(validatedLeads);

    if (validatedLeads.length === 0) {
        return { text: `⚠️ I searched for "${prompt}" but couldn't find any high-quality contact information on the resulting pages.` };
    }

    const responseText = `✅ I analyzed ${scrapeTargets.length} page(s) and found ${validatedLeads.length} high-quality lead(s).`;
    return { text: responseText, data: validatedLeads };
}

/**
 * Validates and cleans a list of scraped leads based on a set of quality rules.
 * - Filters out low-confidence leads.
 * - Removes leads with invalid or generic emails.
 * - Ensures work email domain matches the company website.
 * - Deduplicates leads.
 * @param leads The raw list of leads extracted by the AI.
 * @returns A cleaned and validated list of leads.
 */
function validateAndCleanLeads(leads: any[]): any[] {
    const seenEmails = new Set<string>();
    const cleanedLeads: any[] = [];
    const genericEmailPrefixes = ['info@', 'contact@', 'support@', 'admin@', 'hello@', 'team@', 'admissions@', 'placements@', 'hr@', 'jobs@', 'media@', 'press@'];

    for (const lead of leads) {
        // Rule: Must have a name or a role to be considered a valid lead
        const hasName = lead.full_name && lead.full_name.toLowerCase() !== 'n/a';
        if (!hasName) {
            continue;
        }

        // Rule: Filter out low-confidence leads
        if (!lead.confidence_score || lead.confidence_score < 60) {
            continue;
        }

        const workEmail = lead.work_email?.toLowerCase();
        
        // Rule: Must have a valid work email
        if (!workEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
            continue;
        }

        // Rule: Avoid generic emails
        if (genericEmailPrefixes.some(prefix => workEmail.startsWith(prefix))) {
            continue;
        }

        // Rule: Email domain must match company domain if website is present
        if (lead.website) {
            try {
                const websiteDomain = new URL(lead.website).hostname.replace(/^www\./, '');
                const emailDomain = workEmail.split('@')[1];
                if (emailDomain !== websiteDomain) {
                    continue; // Skip if domains don't match
                }
            } catch (e) {
                // Invalid website URL, skip this check
            }
        }

        // Rule: Remove duplicates
        if (seenEmails.has(workEmail)) {
            continue;
        }

        seenEmails.add(workEmail);
        cleanedLeads.push(lead);
    }
    return cleanedLeads;
}

export const processUserPrompt = async (prompt: string, allProspects: Prospect[], selectedIds: Set<string>, dataSource: DataSource): Promise<AssistantMessageData> => {
  const lowerCasePrompt = prompt.toLowerCase();

  // If web scraping is active, all text input is treated as a scrape target.
  if (dataSource === 'webscraping') {
    return await handleWebScraping(prompt);
  }

  const intent = await getIntent(prompt);

  try {
    switch (intent.type) {
      case 'enrich_linkedin':
        return await handleEnrichment(intent.values, 'linkedin');
      case 'enrich_domain':
        return await handleEnrichment(intent.values, 'domain');
      case 'search':
        return await handleSearch(intent.values[0]);
      case 'web_scrape':
        return await handleWebScraping(intent.values[0]);
      case 'command':
        switch (intent.command) {
          case 'show prospects':
            return { text: `Here are the ${allProspects.length} prospects from your current session:`, data: allProspects };
          case 'generate previews': {
    try {
      const prospectsToPreview = selectedIds.size > 0 
        ? allProspects.filter(p => p.id && selectedIds.has(p.id))
        : allProspects.slice(0, 3);
      const previews = await Promise.all(
          prospectsToPreview.map(async (prospect) => {
              const emailContent = await generateEmailForProspect(prospect);
              return {
                  prospect_name: prospect.full_name,
                  email: prospect.work_email,
                  subject: emailContent.email_subject,
                  body: emailContent.email_body.substring(0, 150) + '...',
                  warning: emailContent.compliance_warning,
              };
          })
      );
      return { text: `✅ Generated ${previews.length} email previews.`, data: previews };
    } catch (error: any) {
      console.error("Error generating previews:", error);
      return { text: `An error occurred while generating previews: ${error.message}` };
    }
          }
          case 'enrich prospects from csv':
            return await handleCsvEnrichment();
          case 'check replies':
    return {
      text: "✅ Reply check simulation complete. Here's the latest campaign overview:",
      metrics: simulateCheckReplies(),
    };
          case 'send emails': {
    try {
      // Define a mock campaign with throttling rules to simulate rate limiting.
      const mockCampaign: Partial<Campaign> = {
        throttles: { daily_cap: 50 }
      };

      const prospectsToSend = (selectedIds.size > 0
        ? allProspects.filter(p => p.id && selectedIds.has(p.id))
        : allProspects).filter(p => p.work_email);

      if (prospectsToSend.length === 0) {
        return { text: "No prospects selected or found with valid emails to send to." };
      }

      const dailyCap = mockCampaign.throttles?.daily_cap || prospectsToSend.length;
      let responseText = `✅ Simulation complete. Processed ${prospectsToSend.length} emails.`;

      if (prospectsToSend.length > dailyCap) {
        const days = Math.ceil(prospectsToSend.length / dailyCap);
        responseText = `✅ Simulation complete. ${prospectsToSend.length} emails have been scheduled. Based on the daily cap of ${dailyCap}, they will be sent over ${days} days.`;
      }

      // Simulate sending by generating email content for each prospect
      const sentEmailsLog = await Promise.all(prospectsToSend.map(async (prospect) => {
        const emailContent = await generateEmailForProspect(prospect);
        return { "status": "✅ Sent", "to": prospect.work_email, "subject": emailContent.email_subject };
      }));

      return { text: responseText, data: sentEmailsLog };
    } catch (error: any) {
      console.error("Error during email sending simulation:", error);
      return { text: `An error occurred during the sending process: ${error.message}` };
    }
          }
          default:
            // This handles any new or unexpected commands from the AI gracefully.
            return { text: `I received an unknown command: '${intent.command}'. I'm not sure how to handle that.` };
        }
      case 'unknown':
      default:
        return {
          text: "I'm sorry, I don't understand that command. You can ask me to 'show prospects', enrich a LinkedIn URL, or search for people and companies.",
        };
    }
  } catch (error: any) {
    console.error("Error processing user prompt:", error);
    let friendlyMessage = `An error occurred: ${error.message}`;
    if (error.response?.status === 403) {
      friendlyMessage = "An error occurred: You may be out of credits or do not have access to this endpoint.";
    } else if (error.response?.status === 404) {
      friendlyMessage = "No match found for your request.";
    }
    return { text: friendlyMessage };
  }
};