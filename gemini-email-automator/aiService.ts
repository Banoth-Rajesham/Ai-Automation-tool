import axios from 'axios';
import Papa from 'papaparse';
import { type AssistantMessageData, type Prospect, type CampaignMetrics, type RecentActivity, type Company, type DataSource, ScrapedItem, EmailPreview } from './types';
import { type Campaign } from './types';

let contactOutApi: ReturnType<typeof axios.create>;

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
    try {
        const response = await apiCallWithRetry(() => axios.post('/api/openai-proxy', {
            systemInstruction,
            userPrompt,
        }), (attempt, delay) => {
            console.warn(`OpenAI API call failed. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
        });
        // The backend now returns the parsed JSON directly.
        return response.data;
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
async function checkRealReplies(): Promise<{ overview: CampaignMetrics; activity: RecentActivity[] }> {
    // Fetch real activity data from the backend
    const response = await axios.get<RecentActivity[]>('/api/email-activity');
    const activity = response.data.map(item => ({
        ...item,
        // Ensure date is formatted correctly
        date: new Date(item.date).toISOString().split('T')[0],
    }));

    // Fetch total number of prospects to calculate emails_sent
    const prospectsResponse = await axios.get<Prospect[]>('/api/leads');
    const totalProspects = prospectsResponse.data.length;

    // Calculate overview metrics from the real activity data
    const interested_leads = activity.filter(a => a.sentiment === 'Interested').length;
    const not_interested = activity.filter(a => a.sentiment === 'Not Interested').length;
    const unsubscribed = activity.filter(a => a.status === 'Unsubscribed').length;
    const bounces = activity.filter(a => a.status === 'Bounced').length; // Match the type 'Bounced'
    const replies_received = activity.filter(a => a.status === 'Replied').length;

    const overview: CampaignMetrics = {
        emails_sent: totalProspects, // A more accurate representation
        replies_received: replies_received,
        bounces: bounces,
        unsubscribed: unsubscribed,
        interested_leads: interested_leads,
        not_interested: not_interested,
    };

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
    const systemPrompt = `You are an AI assistant that classifies user intent. Analyze the user's prompt and determine the primary action, values, and optionally a command and count.

Your response must be a JSON object with "type", "values", and optionally "command" and "count".

Possible types are:
- "enrich_linkedin": User provides one or more LinkedIn profile URLs. Extract all URLs into the "values" array.
- "enrich_domain": User provides one or more company domain names. Extract all domains into the "values" array.
- "search": User wants to find people or companies using keywords. The full prompt goes into the "values" array.
- "web_scrape": User provides a direct URL to scrape or a general query to find and scrape websites. The URL or query goes into the "values" array.
- "command": User gives a direct command. The command name (e.g., "show prospects") goes into the "command" field. If a number is specified (e.g., "send 50 emails"), extract it into the "count" field.
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
- "send 50 emails" -> {"type": "command", "command": "send emails", "values": [], "count": 50}
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
    const emailDomain = (email || '').split('@').pop()?.toLowerCase() || '';
    const company = (companyName || "").toLowerCase() || '';

    const sectorKeywords: Record<string, string[]> = {
        "Education": ['.edu', 'academy', 'school', 'university'],
        "Health": ['health', 'medical', '.med', 'clinic', 'hospital'],
        "Finance": ['finance', 'bank', 'invest', '.fi', 'capital', 'wealth'],
        "Technology": ['.io', '.ai', '.tech', 'software', 'cloud', 'solutions'],
        "Psychology": ['psychology', 'therapy', 'counseling'],
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

/**
 * Verifies the structure and content of an AI-generated email.
 * @param email The generated email object.
 * @returns True if the email is valid, false otherwise.
 */
function verifyGeneratedEmail(email: { email_subject: string; email_body: string }): boolean {
  if (!email.email_subject || email.email_subject.length > 70) {
    return false;
  }
  if (!email.email_body || email.email_body.split('\n').length < 2) {
    return false;
  }
  // Simple heuristic to check for spammy phrases
  const spammyPhrases = ['free trial', 'limited time offer', 'act now'];
  if (spammyPhrases.some(phrase => email.email_body.toLowerCase().includes(phrase))) {
    return false;
  }
  return true;
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
            prospect_name: row.full_name || row.prospect_name,
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
async function saveLeadsToServer(data: ScrapedItem | ScrapedItem[]): Promise<void> {
  const leadsToSave = Array.isArray(data) ? data : [data];
  if (leadsToSave.length === 0) return;

  // Ensure every item has a unique ID before saving
  const payload = leadsToSave.map(lead => ({ ...lead, id: lead.id || generateUUID() }));

  try {
    // This now calls our new backend server endpoint
    const response = await axios.post('/api/save-leads', payload);
    console.log(`✅ Leads saved to server: ${response.data.message}`);
  } catch (error) {
    console.error("Error saving leads to server:", error);
    // We log the error but don't throw, so the UI experience isn't interrupted.
  }
}

async function handleWebScraping(prompt: string): Promise<AssistantMessageData> {
  const jinaApiKey = import.meta.env.VITE_JINA_API_KEY as string;
  if (!jinaApiKey) {
    return { text: "⚠️ Web scraping is disabled. Please set the `VITE_JINA_API_KEY` in your `.env.local` file." };
  }

  const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
  let scrapeTargets: string[] = [];

  // If the prompt is a direct URL, scrape it. Otherwise, use Jina Search.
  if (urlRegex.test(prompt)) {
    scrapeTargets = [prompt];
  } else {
    // Use Jina Search API for general queries. It's much faster and more direct.
    // Use the backend proxy for Jina Search
    const searchResponse = await axios.get(`/api/jina-proxy?type=search&url=${encodeURIComponent(prompt)}`);
    scrapeTargets = (searchResponse.data?.data || []).slice(0, 3).map((result: any) => result.url);
  }

  // --- Deep Dive Step ---
  // Scrape the initial search results to find the actual company websites.
  const deepDiveFinderPrompt = `You are a data extraction agent. Your task is to extract the main website URLs of the companies or organizations mentioned in the provided TEXT that are relevant to the USER_QUERY.

### USER_QUERY
"${prompt}"

### INSTRUCTIONS
1.  Analyze the TEXT below.
2.  Extract the official homepage URLs for organizations that directly match the USER_QUERY.
3.  **Do not** extract links to social media, articles, or sub-pages. Only return the main domain (e.g., 'https://flipkart.com', 'https://amazon.in').

Return a valid JSON object with a single key "urls", which is an array of unique, fully-qualified URL strings. If no relevant company homepages are found, return {"urls": []}.`;

  const extractedUrls: string[] = [];
  for (const url of scrapeTargets) {
    try {
      const readerResponse = await axios.get(`/api/jina-proxy?url=${encodeURIComponent(url)}`);
      let pageContent = readerResponse.data?.data?.content || '';
      // Truncate content to avoid exceeding token limits for URL extraction
      if (pageContent.length > 20000) {
        pageContent = pageContent.substring(0, 20000);
      }
      const result = await getJsonFromOpenAI(deepDiveFinderPrompt, pageContent);
      if (result.urls && Array.isArray(result.urls)) {
        extractedUrls.push(...result.urls);
      }
    } catch (error) {
      console.warn(`Could not perform deep dive on ${url}:`, error);
    }
  }
  const finalUrls = extractedUrls;
  const finalScrapeTargets = [...new Set(finalUrls)]; // Deduplicate URLs

  if (scrapeTargets.length === 0) {
    return { text: `⚠️ I searched for "${prompt}" but couldn't find any relevant websites to scrape.` };
  }

  const allLeads: any[] = [];
  const MAX_DEPTH = 0; // Crawling is disabled for now to keep it fast. Can be increased later.
  let pagesScraped = 0;

  // Scrape each of the target URLs found.
  for (const url of finalScrapeTargets.length > 0 ? finalScrapeTargets : scrapeTargets) {
    pagesScraped++;
    const depth = 0; // Define the depth variable
    try {
      // --- Scrape the current page for leads ---
      const readerResponse = await axios.get(`/api/jina-proxy?url=${encodeURIComponent(url)}`);
      let pageContent = readerResponse.data?.data?.content || '';

      // Truncate content to avoid exceeding token limits (approx. 15k characters ~ 4k tokens)
      if (pageContent.length > 15000) {
        pageContent = pageContent.substring(0, 15000);
      }

      const leadExtractionSystemPrompt = `You are a data processing engine. Your only function is to extract information from the provided TEXT based on the key subjects in the USER_QUERY. You have no memory or prior knowledge.
### USER_QUERY:
"${prompt}"

### Rules:
1.  **SUBJECT RELEVANCE**: Identify the key subjects from the USER_QUERY (e.g., for "top 10 eee colleges in hyderabad", the subjects are "college", "eee", "hyderabad"). The people or companies you extract MUST be related to these subjects. If the TEXT is about a completely different topic, return an empty "leads" array.
2.  **GROUNDING**: You MUST base your answer *only* on the TEXT provided below. Do not invent information or use any external knowledge.
3.  **IDENTIFY KEY PEOPLE**: Within the relevant TEXT, find individuals with job titles that suggest they are decision-makers (e.g., Principal, Dean, Director, Head of Department, Professor, CEO, Founder).
4.  **VALIDATE LEADS**: A lead is only valid if it has AT LEAST a **full_name**, a **role**, and a valid **work_email**.
    - The **work_email** must not be generic (e.g., IGNORE 'info@', 'contact@', 'support@').
    - The **company** name must be relevant to the USER_QUERY.

Your entire output must be a single JSON object. This object must have one key: "leads". The value of "leads" must be an array of the contact objects you found. If no relevant contacts are found in the TEXT, you MUST return \`{"leads": []}\`.
`;
      const { leads } = await getJsonFromOpenAI(leadExtractionSystemPrompt, pageContent);
      if (leads && leads.length > 0) {
        const leadsWithSource = leads.map((lead: any) => ({
          ...lead,
          source_details: `Scraped from ${url}`,
          query: prompt,
        }));
        allLeads.push(...leadsWithSource);
      }

      // --- Discover and enqueue new links if within depth limit ---
      if (depth < MAX_DEPTH) {
      }
    } catch (error: any) {
      console.error(`Failed to process ${url}:`, error.message);
      continue; // Continue to the next URL in the queue
    }
  }

  const cleanedLeads = allLeads; // Bypassing cleaning function for now, can be re-added if needed.

  // Convert cleaned leads into full Prospect objects
  const validatedLeads: Prospect[] = cleanedLeads.map((lead: any) => ({
    ...lead,
    id: generateUUID(),
    created_at: new Date().toISOString(),
    source: 'web_scraping',
    email: lead.work_email, // for UI compatibility
  }));

  // Save to DB in the background without blocking the response to the user.
  saveLeadsToServer(validatedLeads as ScrapedItem[]);

  if (validatedLeads.length === 0) {
    return { text: `⚠️ I searched for "${prompt}" but couldn't find any high-quality contact information on the resulting pages.` };
  }
  
  const responseText = `✅ I crawled ${pagesScraped} page(s) across ${scrapeTargets.length} website(s) and found ${validatedLeads.length} high-quality lead(s).`;
  return { text: responseText, data: validatedLeads };
}

/**
 * Processes an array of items in sequential batches to avoid overwhelming APIs.
 * @param items The array of items to process.
 * @param batchSize The number of items to process in each batch.
 * @param processItem A function that takes an item and returns a promise for the result.
 * @param onProgress An optional callback to report progress.
 * @returns A promise that resolves with an array of all results.
 */
async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processBatch: (batch: T[]) => Promise<R[]>,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const allResults: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batchItems = items.slice(i, i + batchSize);
    
    try {
      // The processing function now receives the entire batch
      const batchResults = await processBatch(batchItems);
      allResults.push(...batchResults);
      onProgress?.(Math.min(i + batchSize, items.length), items.length);
    } catch (error) {
      console.error(`Error processing batch starting at index ${i}:`, error);
      // Stop on error to prevent further issues.
      throw new Error(`Failed to process a batch of items. See console for details.`);
    }
  }
  return allResults;
}

// Cache for generated email content to reuse between preview and send
let emailContentCache: Map<string, any> | null = null;

export const processUserPrompt = async (prompt: string, allProspects: Prospect[], selectedIds: Set<string>, dataSource: DataSource, onProgress?: (processed: number, total: number) => void, postAssistantMessage?: (content: string, data?: any) => void): Promise<AssistantMessageData> => {
  const intent = await getIntent(prompt);

  // If the intent is a command, execute it regardless of the data source.
  // This ensures commands like "check replies" always work.
  if (intent.type !== 'command' && dataSource === 'webscraping') {
    // If web scraping is active and it's not a command, treat it as a scrape.    // We pass the original prompt to handleWebScraping.
    return await handleWebScraping(prompt); // This was the correct call
  }

  // Clear the cache if the user is not sending emails immediately after previewing.
  if (intent.command !== 'send emails') {
    emailContentCache = null;
  }

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
          case 'generate previews':
          case 'send emails': {
            try {
              const isSending = intent.command === 'send emails';
              const actionName = isSending ? 'sending' : 'previewing';

              // Determine the base list of prospects
              const baseProspects = selectedIds.size > 0
                ? allProspects.filter(p => p.id && selectedIds.has(p.id))
                : allProspects;
              
              // Filter for prospects with a valid email
              let prospectsToProcess = baseProspects.filter(p => p.work_email);

              // If a count was specified in the prompt, slice the array
              if ((intent as any).count && (intent as any).count > 0) {
                prospectsToProcess = prospectsToProcess.slice(0, (intent as any).count);
              }

              if (prospectsToProcess.length === 0) {
                return { text: `No prospects with valid emails found to ${isSending ? 'send' : 'preview'}.` };
              }

              if (isSending) {
                // --- Logic for Sending Emails (Foreground Task) ---
                let emailContentMap: Map<string, any>;

                if (emailContentCache) {
                  emailContentMap = emailContentCache;
                  emailContentCache = null; // Clear cache after use
                } else {
                  // Fallback: generate content if cache is empty (e.g., direct "send" command)
                  const systemPrompt = getBulkGenerationPrompt();
                  const generatedContents = await processInBatches(prospectsToProcess, 10, async (batch) => {
                    const userPrompt = JSON.stringify(batch.map(p => ({ id: p.id, role: p.role, company: p.company, sector: classifySector(p.work_email, p.company) })));
                    const result = await getJsonFromOpenAI(systemPrompt, userPrompt);
                    return result.emails || [];
                  }, onProgress);
                  emailContentMap = new Map(generatedContents.flat().map((content: any) => [content.id, content]));
                }

                const sendEmail = async (prospect: Prospect) => {
                  const content = emailContentMap.get(prospect.id);
                  if (!content) throw new Error(`No AI content for ${prospect.full_name}`);

                  const emailHtml = generateHtmlBody(prospect, content.intro, content.bullet_points, content.closing, false);
                  const subject = content.subject || `An idea for ${prospect.company || 'your company'}`;

                  try {
                    await axios.post('/api/send-email', {
                      to: prospect.work_email,
                      subject: subject,
                      body: emailHtml,
                      prospectId: prospect.id // Pass prospectId for tracking links
                    });
                    return { status: "✅ Sent", to: prospect.work_email, subject: `Email for ${prospect.full_name}` };
                  } catch (error: any) {
                    // Throw a more specific error if the API call fails
                    throw new Error(error.response?.data?.message || error.message || 'Unknown error sending email');
                  }
                };

                const sentEmailsLog: any[] = [];
                let successCount = 0;
                let errorCount = 0;

                await processInBatches(prospectsToProcess, 10, async (batch) => {
                  const results = await Promise.allSettled(batch.map(sendEmail));
                  results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                      sentEmailsLog.push(result.value);
                      successCount++;
                    } else {
                      errorCount++;
                      console.error(`Failed to send email to ${batch[index].work_email}:`, result.reason.message || result.reason);
                    }
                  });
                  return []; // processInBatches expects an array, but we handle results internally.
                }, onProgress);

                let summaryText: string;
                if (errorCount > 0 && successCount === 0) {
                    summaryText = `❌ Campaign failed. Could not send any of the ${errorCount} email(s). Please check the server logs for details.`;
                } else if (errorCount > 0) {
                    summaryText = `⚠️ Campaign partially complete. Sent ${successCount} emails, but failed to send ${errorCount} email(s).`;
                } else {
                    summaryText = `✅ Campaign complete. Sent ${successCount} emails successfully.`;
                }
                return { text: summaryText, data: sentEmailsLog };

              } else {
                // --- Logic for Generating Previews ---
                const systemPrompt = getBulkGenerationPrompt();
                const generatedContents = await processInBatches(prospectsToProcess, 10, async (batch) => {
                    const userPrompt = JSON.stringify(batch.map(p => ({ id: p.id, role: p.role, company: p.company, sector: classifySector(p.work_email, p.company) })));
                    const result = await getJsonFromOpenAI(systemPrompt, userPrompt);
                    return result.emails || [];
                }, onProgress);
                emailContentCache = new Map(generatedContents.flat().map((content: any) => [content.id, content]));
                const emailContentMap = emailContentCache;

                const previews: EmailPreview[] = prospectsToProcess.map(prospect => {
                    const content = emailContentMap.get(prospect.id);
                    // If content exists for this prospect, generate the full body. Otherwise, use a fallback.
                    const emailHtml = content
                        ? generateHtmlBody(prospect, content.intro, content.bullet_points, content.closing, true)
                        : generateHtmlBody(prospect, null, null, null, true); // Fallback case

                    return {
                        prospect_name: prospect.full_name || 'N/A',
                        email: prospect.work_email,
                        subject: content?.subject || `An idea for ${prospect.company || 'your company'}`,
                        body: emailHtml,
                        warning: content ? undefined : "AI content generation failed for this prospect."
                    };
                });

                return { text: `✅ Generated ${previews.length} email previews.`, previews: previews };
              }
            } catch (error: any) {
              console.error(`Error during '${intent.command}':`, error);
              return { text: `An error occurred: ${error.message}` };
            }
          }
          case 'check replies':
            const metrics = await checkRealReplies();
            return {
              text: "✅ Fetched latest campaign activity from the database. Here's the overview:",
              metrics: metrics,
            };
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

function getBulkGenerationPrompt(): string {
  return `You are an expert email copywriter for MORPHIUS AI. Your task is to write a personalized outreach email for multiple prospects.
### Company: MORPHIUS AI
- **Core Services**: AI-powered automation, workflow optimization, predictive analytics, custom AI solutions, ML & NLP models.
- **Key Selling Point**: We've helped clients in 20+ industries improve efficiency, reduce costs, and increase ROI.
### Your Task:
For each prospect in the input, generate a JSON object with:
1.  "id": The prospect's ID.
2.  "subject": A compelling, personalized subject line (under 70 characters).
3.  "intro": A personalized opening paragraph connecting MORPHIUS AI to the prospect's role and industry.
4.  "bullet_points": An array of 2-3 short bullet points highlighting specific, relevant benefits.
5.  "closing": A closing paragraph with a clear call to action for a 15-minute call.

Return a single JSON object with an "emails" key, which is an array of these individual prospect JSON objects.
`;
}

function generateHtmlBody(prospect: Prospect, intro: string | null, bullet_points: string[] | null, closing: string | null, preview: boolean): string {
  const emailSubject = `Unlock Your Data Potential at MORPHIUS AI`;
  const recipientName = prospect.full_name || 'there';

  const bulletsHtml = (bullet_points && bullet_points.length > 0)
    ? `<ul style="padding-left: 20px; margin: 12px 0;">${bullet_points.map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}</ul>`
    : '';

  const content = `
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; border: 1px solid #cccccc;">
      <tr>
        <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
            <tr><td style="color: #153643; font-family: Arial, sans-serif; font-size: 16px; line-height: 24px; padding: 0 0 20px 0;"><p style="margin: 0;">Dear ${recipientName},</p></td></tr>
            <tr>
              <td style="color: #153643; font-family: Arial, sans-serif; font-size: 16px; line-height: 24px; padding: 0;">
                <p style="margin: 0 0 12px 0;">${(intro || "I hope this message finds you well. At MORPHIUS AI, we specialize in transforming data into actionable insights through our AI-powered automation and predictive analytics solutions.").replace(/\n/g, '<br>')}</p>
                ${bulletsHtml}
                <p style="margin: 0;">${(closing || "Our tailored ML and NLP models have successfully supported clients across various sectors. I would love to schedule a brief 15-minute call to explore how we can leverage these technologies for your team.").replace(/\n/g, '<br>')}</p>
              </td>
            </tr>
            <tr><td style="padding: 20px 0 0 0;">[SIGNATURE_IMAGE]</td></tr>
          </table>
        </td>
      </tr>
    </table>`;

  if (preview) {
    return content; // For previews, return only the core content table.
  }

  // For sending, wrap it in the full HTML document structure.
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${emailSubject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding: 20px 0 30px 0;">${content}</td>
        </tr>
      </table>
    </body>
    </html>`;
}