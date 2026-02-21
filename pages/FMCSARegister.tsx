import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { FileText, RefreshCw, Calendar, Search, Filter, ChevronDown, ExternalLink, AlertCircle } from 'lucide-react';

// 1. Initialize Supabase (Replace with your actual project details)
const supabaseUrl = 'https://YOUR_PROJECT_ID.supabase.co';
const supabaseKey = 'YOUR_ANON_PUBLIC_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

interface FMCSARegisterEntry {
  number: string;
  title: string;
  decided: string;
  category: string;
}

export const FMCSARegister: React.FC = () => {
  const [registerData, setRegisterData] = useState<FMCSARegisterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string>('');

  const categories = [
    'NAME CHANGE',
    'CERTIFICATE, PERMIT, LICENSE',
    'CERTIFICATE OF REGISTRATION',
    'DISMISSAL',
    'WITHDRAWAL',
    'REVOCATION',
    'MISCELLANEOUS',
    'TRANSFERS',
    'GRANT DECISION NOTICES'
  ];

  useEffect(() => {
    fetchRegisterData();
  }, []);

  const fetchRegisterData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // 2. Query Supabase instead of localhost
      const { data, error: sbError } = await supabase
        .from('fmcsa_register')
        .select('*')
        .order('published_date', { ascending: false })
        .limit(2000); // Fetching a large batch to match your scraper output

      if (sbError) throw sbError;

      if (data && data.length > 0) {
        // 3. Map Database columns to your UI Interface
        const mappedData: FMCSARegisterEntry[] = data.map(item => ({
          number: item.docket_number,
          title: item.carrier_name,
          decided: new Date(item.published_date).toLocaleDateString(),
          category: item.category || 'GRANT DECISION NOTICES'
        }));

        setRegisterData(mappedData);
        setLastUpdated(new Date().toLocaleString());
      } else {
        throw new Error('No entries found in Supabase.');
      }
    } catch (err: any) {
      console.error('Error fetching FMCSA register:', err);
      setError(`Database Error: ${err.message || 'Check connection'}. Showing mock data.`);
      loadMockData();
    } finally {
      setIsLoading(false);
    }
  };

  const loadMockData = () => {
    const mockData: FMCSARegisterEntry[] = [
      { number: 'FF-40152', title: 'PFL TRANSPORTATION SOLUTIONS INC - SURREY, BC', decided: '02/20/2026', category: 'NAME CHANGE' },
      { number: 'MC-19745', title: 'MACON SIX TRANSPORT LLC - LANSING, IL', decided: '02/20/2026', category: 'GRANT DECISION NOTICES' },
    ];
    setRegisterData(mockData);
    setLastUpdated(new Date().toLocaleString());
  };

  const filteredData = registerData.filter(entry => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesSearch = (entry.title?.toLowerCase() || "").includes(searchTerm.toLowerCase()) || 
                         (entry.number?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'NAME CHANGE': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'CERTIFICATE, PERMIT, LICENSE': 'bg-green-500/20 text-green-300 border-green-500/30',
      'GRANT DECISION NOTICES': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      'REVOCATION': 'bg-red-500/20 text-red-300 border-red-500/30',
    };
    return colors[category] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="p-8 h-screen flex flex-col overflow-hidden bg-slate-950">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">FMCSA Register Live</h1>
          <p className="text-slate-400">Real-time carrier leads from the Department of Transportation</p>
        </div>
        <button
          onClick={fetchRegisterData}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all"
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          Sync with Database
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-red-400" size={20} />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center"><Calendar className="text-indigo-400" size={20} /></div>
            <div><p className="text-xs text-slate-400">Last Sync</p><p className="text-white font-semibold">{lastUpdated || 'Never'}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center"><FileText className="text-green-400" size={20} /></div>
            <div><p className="text-xs text-slate-400">Total in DB</p><p className="text-white font-semibold">{registerData.length}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center"><Filter className="text-purple-400" size={20} /></div>
            <div><p className="text-xs text-slate-400">Filtered View</p><p className="text-white font-semibold">{filteredData.length}</p></div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by MC# or Company Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-10 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Registration Types</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center">
          <h3 className="font-bold text-white">Carrier Registration Data</h3>
          <a href="https://li-public.fmcsa.dot.gov/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            Source: FMCSA <ExternalLink size={14} />
          </a>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-200 sticky top-0">
              <tr>
                <th className="p-4 font-medium text-xs uppercase">Docket Number</th>
                <th className="p-4 font-medium text-xs uppercase">Company & Location</th>
                <th className="p-4 font-medium text-xs uppercase">Category</th>
                <th className="p-4 font-medium text-xs uppercase">Publish Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredData.slice(0, 500).map((entry, index) => (
                <tr key={index} className="hover:bg-slate-700/50 transition-colors text-slate-300">
                  <td className="p-4 font-mono text-white font-semibold">{entry.number}</td>
                  <td className="p-4">{entry.title}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getCategoryColor(entry.category)}`}>
                      {entry.category}
                    </span>
                  </td>
                  <td className="p-4 font-mono">{entry.decided}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
