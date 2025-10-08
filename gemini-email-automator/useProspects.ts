import { useState, useEffect, useCallback } from 'react';
import { type Prospect } from './types';
import axios from 'axios';

const API_URL = '/api/leads';

export const useProspects = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);

  const fetchProspects = useCallback(async () => {
    try {
      const response = await axios.get<Prospect[]>(API_URL);
      setProspects(response.data);
    } catch (error) {
      console.error("Failed to load prospects from database:", error);
    }
  }, []);

  // Load initial prospects from the database on mount
  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const addProspects = useCallback((newProspects: Prospect[], overwrite = false) => {
    // This function now primarily adds to the local state for UI responsiveness.
    // The actual saving happens on the backend when scraping.
    // We can refresh from the DB to get the latest truth.
    if (overwrite) {
      setProspects(newProspects);
    } else {
      setProspects(prev => [...prev, ...newProspects]);
    }
    // Optionally, trigger a refetch to ensure consistency
    fetchProspects();
  }, []);

  const deleteProspect = useCallback((prospectId: string) => {
    axios.delete(`${API_URL}/${prospectId}`)
      .then(() => {
        setProspects(prevProspects => prevProspects.filter(p => p.id !== prospectId));
      })
      .catch(error => {
        console.error(`Failed to delete prospect ${prospectId}:`, error);
      });
  }, []);

  return { prospects, addProspects, deleteProspect, refreshProspects: fetchProspects };
};