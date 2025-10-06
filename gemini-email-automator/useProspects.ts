import { useState, useEffect, useCallback } from 'react';
import { type Prospect } from './types';
import { getProspectsFromCsv } from './aiService';

// Helper function to merge and deduplicate prospect lists
const mergeProspects = (existing: Prospect[], toAdd: Prospect[]): Prospect[] => {
  const existingEmails = new Set<string>();
  existing.forEach(prospect => {
    if (prospect.work_email) existingEmails.add(prospect.work_email);
    (prospect.personal_emails || []).forEach(email => existingEmails.add(email));
  });

  const uniqueNewProspects = toAdd.filter(newProspect => {
    const newProspectEmails = [newProspect.work_email, ...(newProspect.personal_emails || [])].filter(Boolean) as string[];
    if (newProspectEmails.length === 0) {
      return !!newProspect.full_name;
    }
    return !newProspectEmails.some(email => existingEmails.has(email));
  });

  return [...existing, ...uniqueNewProspects];
};

export const useProspects = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);

  // Load initial prospects from localStorage and default CSV
  useEffect(() => {
    const fetchInitialProspects = async () => {
      try {
        // Always start by trying to load from localStorage.
        const storedProspectsJson = localStorage.getItem('savedProspects') || '[]';
        const loadedProspects = JSON.parse(storedProspectsJson);
        setProspects(loadedProspects);
      } catch (error) {
        console.error("Failed to load initial prospects:", error);
      }
    };
    fetchInitialProspects();
  }, []);

  // Persist prospects to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('savedProspects', JSON.stringify(prospects));
  }, [prospects]);

  const addProspects = useCallback((newProspects: Prospect[], overwrite = false) => {
    setProspects(prevProspects => 
      overwrite ? mergeProspects(newProspects, prevProspects) : mergeProspects(prevProspects, newProspects)
    );
  }, []);

  const deleteProspect = useCallback((prospectId: string) => {
    setProspects(prevProspects => prevProspects.filter(p => p.id !== prospectId));
  }, []);

  return { prospects, addProspects, deleteProspect };
};