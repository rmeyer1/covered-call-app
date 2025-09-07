'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface Stock {
  ticker: string;
  shares: number;
}

interface Suggestion {
  otmPercent: number;
  strike: number;
  premium: number;
  delta: number;
  yieldMonthly: string;
  yieldAnnualized: string;
  expiration: string;
}

interface SuggestionsData {
  currentPrice: number;
  suggestions: Suggestion[];
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionsData>>({});
  const [tickerInput, setTickerInput] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const savedStocks = JSON.parse(localStorage.getItem('stocks') || '[]');
    setStocks(savedStocks);
  }, []);

  const saveStocks = (newStocks: Stock[]) => {
    localStorage.setItem('stocks', JSON.stringify(newStocks));
    setStocks(newStocks);
  };

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (tickerInput && sharesInput && parseInt(sharesInput) >= 100) {
      const newStock: Stock = {
        ticker: tickerInput.toUpperCase(),
        shares: parseInt(sharesInput),
      };
      saveStocks([...stocks, newStock]);
      setTickerInput('');
      setSharesInput('');
    } else {
      alert('Please enter a valid ticker and at least 100 shares.');
    }
  };

  const handleRemoveStock = (tickerToRemove: string) => {
    const newStocks = stocks.filter(stock => stock.ticker !== tickerToRemove);
    saveStocks(newStocks);
    const newSuggestions = { ...suggestions };
    delete newSuggestions[tickerToRemove];
    setSuggestions(newSuggestions);
  };

  const handleGetSuggestions = async (ticker: string) => {
    setLoading(prev => ({ ...prev, [ticker]: true }));
    try {
      const response = await axios.get(`/api/suggestions/${ticker}`);
      setSuggestions(prev => ({ ...prev, [ticker]: response.data }));
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Failed to get suggestions. Check the console for more details.');
    } finally {
      setLoading(prev => ({ ...prev, [ticker]: false }));
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Covered Call Strategy App</h1>

      <form onSubmit={handleAddStock} style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value)}
          placeholder="Ticker (e.g., AMD)"
          required
          style={{ marginRight: '10px' }}
        />
        <input
          type="number"
          value={sharesInput}
          onChange={(e) => setSharesInput(e.target.value)}
          placeholder="Shares (100+)"
          min="100"
          required
          style={{ marginRight: '10px' }}
        />
        <button type="submit">Add Stock</button>
      </form>

      <h2>My Stocks</h2>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {stocks.map((stock) => (
          <li key={stock.ticker} style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span>
                  <strong>{stock.ticker}</strong> ({stock.shares} shares)
                </span>
                <button onClick={() => handleRemoveStock(stock.ticker)} style={{ marginLeft: '10px', cursor: 'pointer', color: 'red', border: 'none', background: 'none' }}>
                  X
                </button>
              </div>
              <button onClick={() => handleGetSuggestions(stock.ticker)} disabled={loading[stock.ticker]}>
                {loading[stock.ticker] ? 'Loading...' : 'Get Suggestions'}
              </button>
            </div>
            {suggestions[stock.ticker] && (
              <div style={{ marginTop: '10px' }}>
                <p>Current Price: ${suggestions[stock.ticker].currentPrice}</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>OTM %</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>Strike</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>Premium</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>Delta</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>Monthly Yield %</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>Annualized %</th>
                      <th style={{ border: '1px solid #ddd', padding: '8px' }}>Exp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions[stock.ticker].suggestions.map((s) => (
                      <tr key={s.strike}>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{s.otmPercent}</td>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{s.strike}</td>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>${s.premium ? s.premium.toFixed(2) : 'N/A'}</td>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{s.delta ? s.delta.toFixed(4) : 'N/A'}</td>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{s.yieldMonthly}</td>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{s.yieldAnnualized}</td>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{s.expiration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}