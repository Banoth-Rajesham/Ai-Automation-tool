import { useState, useEffect, useCallback } from 'react';
import { type ScrapedItem } from './types';
import axios from 'axios';

export const useScrapedData = () => {
  const [scrapedData, setScrapedData] = useState<ScrapedItem[]>([]);

  const addScrapedData = useCallback((newData: ScrapedItem[]) => {
    // This function now overwrites the previous scrape results with the new ones.
    setScrapedData(newData);
  }, []);

  const clearScrapedData = useCallback(() => {
    // This just clears the temporary local state.
    setScrapedData([]);
  }, []);

  return { scrapedData, addScrapedData, clearScrapedData };
};