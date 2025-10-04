
// --- Core Data Models ---

export interface Company {
  id: string;
  name: string;
  domain: string;
  size?: string; // e.g., "1-10", "11-50"
  industry?: string;
  tech_stack_tags?: string[];
}

export interface Prospect {
  id: string;
  full_name: string;
  role?: string;
  seniority?: string;
  company_id: string;
  work_email?: string; // Made optional
  personal_emails?: string[];
  websites?: { type: string; url: string }[];
  country?: string;
  jurisdiction?: string; // e.g., "GDPR", "CCPA"
  lawful_basis?: 'consent' | 'legitimate_interest';
  source?: string;
  source_details?: string;
  tags?: string[];
  recent_company_events?: string[]; // For richer context
  created_at: string; // ISO 8601 date string
  last_contacted_at?: string;
  retention_expiry_at?: string;
  consent_proof_uri?: string;
  // For UI compatibility
  prospect_name?: string; 
  email?: string;
  company?: string;
}

export interface Campaign {
  id: string;
  objective: string;
  segment_query: string; // JSON or SQL query string
  templates: string[]; // Array of template IDs
  ai_prompt_id: string;
  send_window: string; // e.g., "Mon-Fri 9am-5pm"
  throttles: Record<string, number>; // e.g., { "per_hour": 100 }
}

export interface Email {
  id: string;
  prospect_id: string;
  campaign_id: string;
  subject: string;
  body: string;
  variant?: string; // For A/B testing
  status: 'draft' | 'scheduled' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced';
  sent_at?: string;
  delivery_events?: Record<string, any>[];
  reply_thread_id?: string;
}

// --- UI & Simulation Models ---

export interface CampaignMetrics {
  emails_sent: number;
  replies_received: number;
  bounces?: number;
  unsubscribed: number;
  interested_leads: number;
  not_interested: number;
}

export interface RecentActivity {
  email: string;
  status: 'Replied' | 'Unsubscribed' | 'Bounced';
  sentiment?: 'Interested' | 'Not Interested';
  date: string;
}

export interface AssistantMessageData {
  text: string;
  data?: Record<string, any>[];
  metrics?: {
    overview: CampaignMetrics;
    activity: RecentActivity[];
  };
  newProspect?: Prospect;
  requiresManualEntry?: boolean;
  sourceUrl?: string;
}

export type ViewType = 'dashboard' | 'prospects' | 'previews' | 'send' | 'replies' | 'scraped' | 'scraper_input';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  data?: Record<string, any>[] | ScrapedItem[];
  metrics?: AssistantMessageData['metrics'];
}

export type DataSource = 'contactout' | 'webscraping';

export interface ScrapedItem {
  id: string;
  full_name: string;
  company: string;
  work_email: string;
  personal_emails: string[];
  websites: { type: string; url: string }[];
  source_details: string;
  source: string;
  query: string;
}
