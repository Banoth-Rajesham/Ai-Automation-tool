
import OpenAI from "openai";
import axios from 'axios';
import Papa from 'papaparse';
import { type AssistantMessageData, type Prospect, type CampaignMetrics, type RecentActivity, type Company, type DataSource } from '../types';
import { type Campaign } from '../types';

let openai: OpenAI;
let contactOutApi: ReturnType<typeof axios.create>;

/**
 * Initializes and returns the OpenAI client instance.
 * IMPORTANT: This implementation is for client-side usage and exposes the API key.
 * For production, you should move API calls to a secure backend.
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

// A simple sleep helper to wait between retries
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiCallWithRetry<T>(apiCall: () => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      const isRetryable = error.response?.status === 429 || error.message?.includes('503');
      if (isRetryable && i < MAX_RETRIES - 1) {
        const retryAfter = error.response?.headers?.['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : INITIAL_DELAY_MS * Math.pow(2, i);
        console.warn(`API rate limit hit or service unavailable. Retrying in ${delay}ms... (Attempt ${i + 1}/${MAX_RETRIES})`);
        await sleep(delay);
      } else {
        // If it's not a retryable error or the last attempt, re-throw it.
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
  }));

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI API did not return any content.");
  }

  return JSON.parse(content);
}

function getContactOutApi(): ReturnType<typeof axios.create> {
  if (!contactOutApi) {
    const contactOutApiKey = import.meta.env.VITE_CONTACTOUT_API_KEY as string;
    if (!contactOutApiKey) {
      throw new Error("The VITE_CONTACTOUT_API_KEY environment variable is not set. Please check your .env.local file and restart the server.");
    }
    contactOutApi = axios.create({
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
        const resp = await apiCallWithRetry(() => getContactOutApi().post(url, payload));
        const profile = resp.data.profile || {};

        return {
            full_name: profile.full_name,
            work_email: (profile.work_email || [])[0],
            personal_emails: profile.personal_email || [],
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
    const resp = await apiCallWithRetry(() => getContactOutApi().post("/v1/domain/enrich", payload));
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
 * A more robust prompt parser that identifies different types of tasks from the user's input.
 * It can extract multiple URLs, domains, and detect keyword searches.
 */
function parsePrompt(prompt: string): { type: 'enrich_linkedin' | 'enrich_domain' | 'search' | 'command' | 'unknown'; values: string[]; command?: string } {
  const lowerCasePrompt = prompt.toLowerCase();

  const linkedinUrlRegex = /(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/g;
  const domainRegex = /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,})\b/g;
  const keywordSearchRegex = /(\w+):"([^"]+)"/g;

  const linkedinUrls = prompt.match(linkedinUrlRegex);
  if (linkedinUrls) {
      return { type: 'enrich_linkedin', values: linkedinUrls };
  }

  const domains = prompt.match(domainRegex);
  // Check if it's an enrichment command to avoid misinterpreting domains in other commands.
  if (domains && (lowerCasePrompt.startsWith('enrich domain') || lowerCasePrompt.startsWith('enrich'))) {
      // Filter out common irrelevant domains that might be part of a URL
      const filteredDomains = domains.filter(d => !['linkedin.com'].includes(d.toLowerCase()));
      if (filteredDomains.length > 0) {
          return { type: 'enrich_domain', values: filteredDomains };
      }
  }

  const commandMatch = lowerCasePrompt.trim();
  const knownCommands = ['show prospects', 'generate previews', 'send emails', 'check replies', 'enrich prospects from csv'];
  if (knownCommands.includes(commandMatch)) {
      return { type: 'command', values: [], command: commandMatch };
  }

  // Check for keyword search first for a fast, local path.
  if (keywordSearchRegex.test(prompt)) {
    return { type: 'search', values: [prompt], command: 'local_parse' };
  }

  // If it's not a keyword search but contains search-like terms, use the LLM.
  if (/\b(find|get|need|show|who is|who are|people|prospects|candidates)\b/.test(lowerCasePrompt)) {
    return { type: 'search', values: [prompt] };
  }

  return { type: 'unknown', values: [] };
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

        prospects.push({
            id: row.id || generateUUID(),
            full_name: row.full_name || row.prospect_name || '',
            work_email: workEmail,
            personal_emails: personalEmails,
            company: row.company_name || row.company || '',
            role: row.role || '',
            company_id: row.company_id || '',
            source: file ? `csv_upload: ${file.name}` : 'csv_initial_load',
            jurisdiction: row.jurisdiction || 'N/A', // Assume N/A if not in CSV
            lawful_basis: row.lawful_basis || 'legitimate_interest', // Default to legitimate interest
            created_at: new Date().toISOString(),
            // Add other fields from your model with defaults if needed
            prospect_name: row.full_name || row.prospect_name, // for UI compatibility
            email: workEmail, // for UI compatibility
        });
    }
    return prospects;
}

// --- Main Service Function ---

async function handleEnrichment(urls: string[], type: 'linkedin' | 'domain'): Promise<AssistantMessageData> {
  const enricher = type === 'linkedin' ? enrichProfileFromLinkedIn : enrichDomain;
  const results = await Promise.allSettled(urls.map(url => enricher(url as any)));

  const successfulEnrichments: (Partial<Prospect> | Partial<Company>)[] = [];
  let errorCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      // enrichDomain returns an array, enrichProfileFromLinkedIn returns an object.
      const value = result.value;
      Array.isArray(value) ? successfulEnrichments.push(...value) : successfulEnrichments.push(value);
    } else {
      errorCount++;
      console.error(`Enrichment failed:`, result.reason);
    }
  }

  if (successfulEnrichments.length === 0) {
    return { text: `Sorry, I couldn't enrich any of the provided ${type}s. Please check the console for errors.` };
  }

  const responseText = `✅ Enrichment complete. Successfully processed ${successfulEnrichments.length} item(s). ${errorCount > 0 ? `Failed to process ${errorCount} item(s).` : ''}`;
  
  // For LinkedIn enrichment, we expect a new prospect to be added.
  // Only return a newProspect if the enrichment was successful.
  if (type === 'linkedin' && successfulEnrichments.length > 0 && 'full_name' in successfulEnrichments[0]) {
    const newProspect: Prospect = {
      id: generateUUID(),
      company_id: '',
      created_at: new Date().toISOString(),
      full_name: 'N/A',
      ...(successfulEnrichments[0] as Partial<Prospect>),
    };
    return { text: responseText, data: successfulEnrichments, newProspect };
  }

  return { text: responseText, data: successfulEnrichments };
}

async function handleSearch(prompt: string): Promise<AssistantMessageData> {
  const parsed = parsePrompt(prompt);
  let searchPayload: Record<string, any>;

  if (parsed.command === 'local_parse') {
    searchPayload = parseSearchPromptLocally(prompt);
  } else {
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

    // Using a more stable model name to avoid 404 errors.
    searchPayload = await getJsonFromOpenAI(systemPrompt, prompt);
  }

  // Improved intent detection: Check for explicit keywords in the original prompt,
  // then fall back to checking keys in the parsed payload.
  const lowerCasePrompt = prompt.toLowerCase();
  const isPeopleSearch = lowerCasePrompt.includes('people') || lowerCasePrompt.includes('prospects') || ['job_title', 'skills', 'seniority', 'name', 'education'].some(key => key in searchPayload);
  const isCompanySearch = ['industry', 'domain'].some(key => key in searchPayload) && !isPeopleSearch;

  if (isPeopleSearch) { // This is a people search
    searchPayload["reveal_info"] = true;
    searchPayload["limit"] = 10;
    const resp = await apiCallWithRetry(() => getContactOutApi().post("/v1/people/search", searchPayload));
    const searchResults = resp.data.profiles ? Object.values(resp.data.profiles) : [];
    const prospects = (searchResults as any[]).map((profile: any) => ({
      id: profile.id || generateUUID(),
      full_name: profile.full_name,
      work_email: (profile.contact_info?.work_emails || [])[0],
      personal_emails: profile.contact_info?.personal_emails || [],
      company: profile.company?.name,
      role: profile.title || profile.headline,
      country: profile.location,
      source: 'contactout_search',
      created_at: new Date().toISOString(),
    }));
    return {
      text: `I found ${prospects.length} new prospects from ContactOut based on your request:`,
      data: prospects
    };
  } else if (isCompanySearch) { // This is a company search
    const resp = await apiCallWithRetry(() => getContactOutApi().post("/v1/company/search", searchPayload));
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

async function handleWebScraping(prompt: string): Promise<AssistantMessageData> {
    // Step 1: Use an AI agent to perform a web search and identify entity names from the results.
    const entityFinderSystemPrompt = `You are a research assistant. From the user's query, perform a web search and identify the names of up to 5 relevant entities (e.g., companies, colleges, organizations).
- Return a valid JSON object with a single key "entities", which is an array of strings.

Examples:
- Input: "top psychology colleges in hyderabad" -> Output: {"entities": ["Nizam College", "Loyola Academy", "St. Ann's College for Women"]}
- Input: "contact page for Morphius, a company in India" -> Output: {"entities": ["Morphius"]}
`;
    const { entities } = await getJsonFromOpenAI(entityFinderSystemPrompt, prompt);

    if (!entities || entities.length === 0) {
        return { text: "I couldn't identify any specific entities from your query to search for." };
    }

    // Step 2: For each entity, find its contact page URL.
    const urlFinderSystemPrompt = `You are an intelligent web search agent. For the given entity name, find the most relevant URL for their contact information.
- Prioritize "Contact Us", "About Us", or official homepages.
- Return a valid JSON object with a single key "url", which is a string.

Examples:
- Input: "Nizam College" -> Output: {"url": "https://www.nizamcollege.ac.in/contact-us/"}
- Input: "Morphius" -> Output: {"url": "https://www.morphius.in/contact-us"}
`;
    const urlPromises = entities.map((entity: string) => getJsonFromOpenAI(urlFinderSystemPrompt, `contact page for ${entity}`));
    const urlResults = await Promise.allSettled(urlPromises);

    const scrapeTargets = urlResults
        .filter(result => result.status === 'fulfilled' && result.value.url)
        .map(result => (result as PromiseFulfilledResult<{url: string}>).value.url);

    if (scrapeTargets.length === 0) {
        return { text: `I found entities but could not find any contact pages for them.` };
    }

    const allLeads: any[] = [];

    // Step 2: Scrape each URL in parallel for much faster results.
    const scrapePromises = scrapeTargets.map(async (targetUrl: string) => {
      try {
        // Step 3: Use Jina AI Reader to get clean page content.
        const readerResponse = await axios.get(`https://r.jina.ai/${targetUrl}`, {
          headers: { 'Accept': 'application/json' },
        });
        const pageContent = readerResponse.data.data.content;

        // Use a more advanced prompt to extract enriched lead information.
        const leadExtractionSystemPrompt = `You are a high-level AI Lead Generation Agent. Your task is to extract highly-qualified, enriched leads from raw text content.

Your output must be a valid JSON object with a single key "leads", which is an array of lead objects.

Each lead object must adhere to the following strict quality requirements:
1.  **full_name**: MUST be a real person's full name. Do NOT use placeholders like "Unknown", "Inquiry", or "Scraped Company". If a real name cannot be found, discard the lead.
2.  **role**: The person's job title or role. If not available, use "N/A".
3.  **email**: MUST be a professional/work email address. Do NOT include personal emails (e.g., @gmail.com, @yahoo.com) or generic company emails (e.g., info@, contact@, support@). If a valid work email is not found, discard the lead.
4.  **phone**: A valid phone number, formatted with a country code if possible (e.g., +1-555-123-4567). If not available, use "N/A".
5.  **company**: The correct name of the company the person works for, inferred from the text content.
6.  **confidence_score**: An estimated percentage (0-100) of how likely the extracted lead information is accurate and complete based on these rules.

Example Output:
{
  "leads": [
    {
      "full_name": "Jane Doe",
      "role": "Chief Technology Officer",
      "email": "jane.d@examplecorp.com",
      "phone": "+1-800-555-1234",
      "company": "Example Corp",
      "confidence_score": 95
    }
  ]
}`;

        const { leads } = await getJsonFromOpenAI(leadExtractionSystemPrompt, pageContent);

        if (leads && leads.length > 0) {
          return leads.map((lead: any) => ({
            id: generateUUID(),
            full_name: lead.full_name || 'Unknown',
            company: lead.company,
            role: lead.role || 'N/A',
            work_email: lead.email || '',
            personal_emails: [],
            websites: lead.phone ? [{ type: 'phone', url: lead.phone }] : [],
            source_details: `Scraped from ${targetUrl}`,
            source: 'ai_web_scrape',
            query: targetUrl,
            confidence_score: lead.confidence_score || 0,
          }));
        }
      } catch (error: any) {
        console.error(`Failed to scrape ${targetUrl}:`, error.message);
      }
      return []; // Return empty array on failure
    });

    const results = await Promise.allSettled(scrapePromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allLeads.push(...result.value);
      }
    }

    if (allLeads.length === 0) {
        return { text: `⚠️ I searched for "${prompt}" but couldn't find any contact information on the resulting pages.` };
    }

    const responseText = `✅ I analyzed ${scrapeTargets.length} page(s) based on your query and found ${allLeads.length} high-quality lead(s).`;
    return { text: responseText, data: allLeads };
}

export const processUserPrompt = async (prompt: string, allProspects: Prospect[], selectedIds: Set<string>, dataSource: DataSource): Promise<AssistantMessageData> => {
  const lowerCasePrompt = prompt.toLowerCase();

  // If web scraping is active, all text input is treated as a scrape target.
  if (dataSource === 'webscraping') {
    return await handleWebScraping(prompt);
  }

  const parsedPrompt = parsePrompt(prompt);

  try {
    switch (parsedPrompt.type) {
      case 'enrich_linkedin':
        return await handleEnrichment(parsedPrompt.values, 'linkedin');
      case 'enrich_domain':
        return await handleEnrichment(parsedPrompt.values, 'domain');
      case 'search':
        return await handleSearch(parsedPrompt.values[0]);
      case 'command':
        switch (parsedPrompt.command) {
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