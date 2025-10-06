import { useState, useEffect, useCallback } from 'react';
import { type ScrapedItem } from './types';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api/leads'; // Corrected API endpoint

export const useScrapedData = () => {
  const [scrapedData, setScrapedData] = useState<ScrapedItem[]>([]);

  // Load initial data from the server on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const response = await axios.get<ScrapedItem[]>(API_URL);
        // Ensure all fields are correctly typed and present
        setScrapedData(response.data);
      } catch (error) {
        console.error("Failed to load scraped data from server:", error);
      }
    };
    fetchInitialData();
  }, []);

  const addScrapedData = useCallback((newData: ScrapedItem[]) => {
    // The server is already saving the data via a different endpoint.
    // This function just needs to update the local state.
    setScrapedData(prevData => [...prevData, ...newData]);
  }, []);

  const clearScrapedData = useCallback(() => {
    // This would need a new backend endpoint, for now, we'll just clear the local state.
    // For a full implementation, you'd call `axios.delete(API_URL)`
    console.warn("Clearing only local state. A backend DELETE endpoint would be needed to clear the database.");
    setScrapedData([]); // Kept for UI responsiveness
  }, []);

  return { scrapedData, addScrapedData, clearScrapedData };
};