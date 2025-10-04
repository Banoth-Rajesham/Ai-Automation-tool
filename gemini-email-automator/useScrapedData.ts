import { useState, useEffect, useCallback } from 'react';
import { type ScrapedItem } from './types';

const mergeScrapedItems = (existing: ScrapedItem[], toAdd: ScrapedItem[]): ScrapedItem[] => {
  const existingUrls = new Set(existing.map(item => item.url));
  const uniqueNewItems = toAdd.filter(newItem => !existingUrls.has(newItem.url));
  return [...existing, ...uniqueNewItems];
};

export const useScrapedData = () => {
  const [scrapedData, setScrapedData] = useState<ScrapedItem[]>([]);

  // Load initial data from localStorage
  useEffect(() => {
    try {
      const storedDataJson = localStorage.getItem('scrapedData') || '[]';
      const loadedData = JSON.parse(storedDataJson);
      setScrapedData(loadedData);
    } catch (error) {
      console.error("Failed to load scraped data:", error);
    }
  }, []);

  // Persist data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('scrapedData', JSON.stringify(scrapedData));
  }, [scrapedData]);

  const addScrapedData = useCallback((newData: ScrapedItem[]) => {
    setScrapedData(prevData => mergeScrapedItems(prevData, newData));
  }, []);

  const clearScrapedData = useCallback(() => {
    setScrapedData([]);
  }, []);

  return { scrapedData, addScrapedData, clearScrapedData };
};