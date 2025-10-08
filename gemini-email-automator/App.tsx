
import React, { useState } from 'react';
import axios from 'axios';
import BackgroundVideo from './BackgroundVideo';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow'; // Assuming ChatWindow is the component for 'dashboard'
import { type ChatMessage, type ViewType, type Prospect, type DataSource, type ScrapedItem, type EmailPreview } from './types';
import { processUserPrompt, getProspectsFromCsv, generateUUID } from './aiService';
import { ProspectsView } from './components/ProspectsView';
import Toast from './components/Toast'; // Import the new Toast component
import { ScrapedDataView } from './components/ScrapedDataView';
import { PreviewsView } from './components/PreviewsView';
import { useProspects } from './useProspects';
import { useScrapedData,  } from './useScrapedData';
import { WebScraperView } from './components/WebScraperView';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const { prospects, addProspects, deleteProspect, refreshProspects } = useProspects();
  const { scrapedData, addScrapedData, clearScrapedData } = useScrapedData();
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(new Set());
  const [dataSource, setDataSource] = useState<DataSource>('contactout');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant', // Changed from 'assistant' to match original design
      content: "Hello! I'm your AI campaign assistant. How can I help you today? You can ask me to show prospects, generate previews, or enrich a contact by providing a LinkedIn URL.",
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [emailPreviews, setEmailPreviews] = useState<EmailPreview[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000); // Auto-hide after 3 seconds
  };

  const postAssistantMessage = (content: string, data?: any) => {
    const newMessage: ChatMessage = { role: 'assistant', content, data };
    setMessages(prev => [...prev, newMessage]);
  };

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
      // For bulk operations, we can provide a progress callback
      const onProgress = (processed: number, total: number) => {
        showToast(`Generating... ${processed} / ${total}`, 'info');
      };

      const isBulkGeneration = prompt.toLowerCase().includes('generate previews');

      const assistantResponseData = await processUserPrompt(prompt, prospects, selectedProspectIds, dataSource, onProgress, postAssistantMessage);
      const assistantMessage: ChatMessage = { 
        role: 'assistant', 
        content: assistantResponseData.text,
        // Only show data in chat if it's not for the dedicated preview page
        data: assistantResponseData.previews ? undefined : assistantResponseData.data,
        metrics: assistantResponseData.metrics
      };

      // --- Consolidated Prospect Handling Logic ---
      // This block now handles adding new prospects from any source (enrichment, search, etc.)
      // It will only add prospects if the data array is present, not empty, and contains valid items.
      const isProspectDataArray = (data: any): data is Partial<Prospect>[] => {
        return (
          Array.isArray(data) &&
          data.length > 0 && 'full_name' in data[0] && !('query' in data[0])
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

      // After a successful scrape and save, refresh the main prospects list from the DB
      if (assistantResponseData.intent?.type === 'web_scrape' || assistantResponseData.intent?.type === 'search') {
        refreshProspects();
      }

      // If previews were generated, store them and switch to the preview view
      if (assistantResponseData.previews) {
        setEmailPreviews(assistantResponseData.previews);
        setCurrentView('previews_display');
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
    // This action is now simpler. Since the data is already in the DB,
    // we just need to ensure the main prospect list is up-to-date.
    // The 'scraped' view is now just for review.
    refreshProspects();
    showToast(`✅ ${scrapedItem.full_name} is available in 'Load Data'.`, 'success');
  };

  const handleReturnToScraped = (prospect: Prospect) => {
    const scrapedItem: ScrapedItem = {
      id: prospect.id,
      full_name: prospect.full_name,
      company: prospect.company || '',
      role: prospect.role,
      work_email: prospect.work_email || '',
      personal_emails: prospect.personal_emails || [],
      phone_numbers: prospect.phone_numbers || [],
      websites: prospect.websites || [],
      source: prospect.source || 'returned_from_prospects',
      source_details: prospect.source_details || '',
      query: prospect.query || '',
      confidence_score: prospect.confidence_score,
    };

    addScrapedData([scrapedItem]);
    deleteProspect(prospect.id);
  };

  const handleMoveAllToProspects = () => {
    // This action is now simpler. We just clear the temporary scraped data view
    // and ensure the main list is fresh.
    refreshProspects();
    showToast(`✅ All new leads are available in 'Load Data'.`, 'success');
    clearScrapedData(); // Clear the scraped data after moving
  };

  const handleAddTestProspect = async (prospectData: Partial<Prospect>) => {
    // Create an object that matches the ScrapedItem structure for the backend
    const leadToSave: ScrapedItem = {
      id: generateUUID(),
      full_name: prospectData.full_name || 'N/A',
      company: prospectData.company || '',
      role: prospectData.role,
      work_email: prospectData.work_email || '',
      personal_emails: [],
      phone_numbers: Array.isArray(prospectData.phone_numbers) ? prospectData.phone_numbers : [],
      websites: [],
      source: 'manual_test',
      source_details: 'Manually added by user',
      query: 'manual',
      confidence_score: 100,
    };

    try {
      // Also save this manually added prospect to the backend
      await axios.post('/api/save-leads', [leadToSave]);
      showToast(`✅ Test prospect added and saved!`, "success");
      refreshProspects(); // Refresh to show the newly saved prospect
    } catch (error) {
      console.error("Failed to save manually added prospect:", error);
      showToast("Error saving prospect. See console for details.", "error");
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'prospects':
        return <ProspectsView 
          prospects={prospects} 
          selectedIds={selectedProspectIds}
          onSelectionChange={setSelectedProspectIds}
          onDeleteProspect={handleDeleteProspect}
          onAddTestProspect={handleAddTestProspect}
          hasProspects={prospects.length > 0} // Indicate if prospects are loaded
          showToast={showToast} // Pass showToast for local toasts
          onReturnToScraped={handleReturnToScraped}
        />;
      case 'scraped':
        return <ScrapedDataView 
          scrapedData={scrapedData} 
          onClearAll={clearScrapedData}
          onMoveToProspects={handleMoveToProspects}
          onMoveAllToProspects={handleMoveAllToProspects}
        />;
      case 'previews_display':
        return <PreviewsView 
          previews={emailPreviews}
          onBack={() => setCurrentView('dashboard')}
        />;
      case 'send':
        // These views are handled by sending a message, which then shows up in the dashboard chat view.
        // The view is switched to 'dashboard' to show the result.
        return <ChatWindow messages={messages} onFileUpload={handleFileUpload} onSendMessage={handleSendMessage} isLoading={isLoading} />;
      case 'replies':
        return <ChatWindow messages={messages} onFileUpload={handleFileUpload} onSendMessage={handleSendMessage} isLoading={isLoading} />;

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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <main className="flex-1 flex flex-col bg-transparent">
        {renderCurrentView()}
      </main>
    </div>
  );
};

export default App;
