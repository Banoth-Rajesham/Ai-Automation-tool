
import React, { useState } from 'react';
import BackgroundVideo from './BackgroundVideo';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { type ChatMessage, type ViewType, type Prospect, type DataSource } from './types';
import { processUserPrompt, getProspectsFromCsv, generateUUID } from './aiService';
import { ProspectsView } from './components/ProspectsView';
import { ScrapedDataView } from './components/ScrapedDataView';
import { useProspects } from './useProspects';
import { useScrapedData,  } from './useScrapedData';
import { WebScraperView } from './components/WebScraperView';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const { prospects, addProspects, deleteProspect } = useProspects();
  const { scrapedData, addScrapedData, clearScrapedData } = useScrapedData();
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(new Set());
  const [dataSource, setDataSource] = useState<DataSource>('contactout');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your AI campaign assistant. How can I help you today? You can ask me to show prospects, generate previews, or enrich a contact by providing a LinkedIn URL.",
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSetDataSource = (source: DataSource) => {
    setDataSource(source);
    if (source === 'webscraping') {
      setCurrentView('scraper_input');
    } else {
      setCurrentView('dashboard');
    }
  };

  const handleNavigate = (view: ViewType) => {
    // For views that just show a chat command result, we can process it directly
    if (['previews', 'send', 'replies'].includes(view)) {
      const commandMap: Record<string, string> = {
        previews: 'generate previews',
        send: 'send emails',
        replies: 'check replies',
      };
      handleSendMessage(commandMap[view]);
    }
    // If user navigates away from scraper input, switch data source back
    if (currentView === 'scraper_input' && view !== 'scraper_input') {
        setDataSource('contactout');
    }
    if (view === 'scraper_input') {
        setDataSource('webscraping');
    }
    setCurrentView(view);
  };

  const handleSendMessage = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const assistantResponseData = await processUserPrompt(prompt, prospects, selectedProspectIds, dataSource);
      const assistantMessage: ChatMessage = { 
        role: 'assistant', 
        content: assistantResponseData.text,
        data: assistantResponseData.data,
        metrics: assistantResponseData.metrics
      };

      // --- Consolidated Prospect Handling Logic ---
      // This block now handles adding new prospects from any source (enrichment, search, etc.)
      // It will only add prospects if the data array is present, not empty, and contains valid items.
      const isProspectDataArray = (data: any): data is Partial<Prospect>[] => {
        return (
          Array.isArray(data) &&
          data.length > 0 &&
          ('full_name' in data[0] || 'work_email' in data[0] || 'company' in data[0])
        );
      };

      const isScrapedDataArray = (data: any): data is ScrapedItem[] => {
        return (
          Array.isArray(data) &&
          data.length > 0 &&
          ('query' in data[0] || 'company' in data[0])
        );
      };

      if (isProspectDataArray(assistantResponseData.data)) {
          const newProspects: Prospect[] = assistantResponseData.data.map(p => ({
            id: p.id || generateUUID(),
            full_name: p.full_name || 'N/A',
            work_email: p.work_email,
            personal_emails: p.personal_emails || [],
            websites: p.websites || [],
            company: p.company,
            role: p.role,
            country: p.country,
            source: p.source || 'contactout_enrichment',
            created_at: p.created_at || new Date().toISOString(),
            company_id: p.company_id || '',
            jurisdiction: p.jurisdiction || 'N/A',
            lawful_basis: p.lawful_basis || 'legitimate_interest',
            // UI compatibility fields
            prospect_name: p.full_name || 'N/A',
            email: p.work_email,
          }));

          addProspects(newProspects);
      } else if (isScrapedDataArray(assistantResponseData.data)) {
          addScrapedData(assistantResponseData.data as ScrapedItem[]);
      }

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error processing user prompt:", error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry, an error occurred. ${error instanceof Error ? error.message : 'Please try again.'}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    const userMessage: ChatMessage = { role: 'user', content: `File Uploaded: ${file.name}` };
    setMessages(prev => [...prev, userMessage]);

    try {
      const newProspects = await getProspectsFromCsv(file);
      addProspects(newProspects, true); // `true` to overwrite and prioritize new file

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: `✅ Successfully loaded ${newProspects.length} prospects from ${file.name}. You can now view them in 'Load Data' or use them to generate previews.`,
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error("Error processing uploaded file:", error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry, there was an error processing your file. ${error instanceof Error ? error.message : 'Please check the file format and try again.'}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProspect = (prospectId: string) => {
    deleteProspect(prospectId);
    // Also remove it from the selection if it was selected
    setSelectedProspectIds(prev => new Set([...prev].filter(id => id !== prospectId)));
  };

  const handleMoveToProspects = (scrapedItem: ScrapedItem) => {
    const newProspect: Prospect = {
      id: scrapedItem.id,
      full_name: scrapedItem.full_name || 'N/A',
      company: scrapedItem.company,
      work_email: scrapedItem.work_email,
      personal_emails: scrapedItem.personal_emails,
      websites: scrapedItem.websites,
      source: scrapedItem.source,
      source_details: scrapedItem.source_details,
      created_at: new Date().toISOString(),
      company_id: '',
      jurisdiction: 'N/A',
      lawful_basis: 'legitimate_interest',
    };
    addProspects([newProspect]);
    // Optional: remove from scraped data after moving
    // clearScrapedData(); // or a function to remove a single item
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'prospects':
        return <ProspectsView 
          prospects={prospects} 
          selectedIds={selectedProspectIds}
          onSelectionChange={setSelectedProspectIds}
          onDeleteProspect={handleDeleteProspect}
        />;
      case 'scraped':
        return <ScrapedDataView 
          scrapedData={scrapedData} 
          onClearAll={clearScrapedData}
          onMoveToProspects={handleMoveToProspects}
        />;
      case 'scraper_input':
        return <WebScraperView
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          messages={messages}
        />;
      case 'dashboard':
      default:
        return (
          <ChatWindow 
            messages={messages} 
            onFileUpload={handleFileUpload}
            onSendMessage={handleSendMessage} 
            isLoading={isLoading} 
          />
        );
    }
  };

  return (
    <div className="flex h-screen text-slate-600 dark:text-slate-300">
      <BackgroundVideo src="/204635-925250848.mp4" />
      <Sidebar 
        currentView={currentView}
        onNavigate={handleNavigate}
        dataSource={dataSource}
        setDataSource={handleSetDataSource}
      />
      <main className="flex-1 flex flex-col bg-transparent">
        {renderCurrentView()}
      </main>
    </div>
  );
};

export default App;
