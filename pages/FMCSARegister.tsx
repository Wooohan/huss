import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, Search, Database, Calendar, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FmcsaRecord {
  id: number;
  docket_number: string;
  carrier_info: string;
  published_date: string | null;
  category: string;
  scrape_date: string | null;
  register_date: string | null;
}

interface DateOption {
  fmcsa_date: string;
  label: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'NAME CHANGE': 'bg-blue-100 text-blue-800 border-blue-200',
  'CERTIFICATE, PERMIT, LICENSE': 'bg-green-100 text-green-800 border-green-200',
  'CERTIFICATE OF REGISTRATION': 'bg-purple-100 text-purple-800 border-purple-200',
  'DISMISSAL': 'bg-red-100 text-red-800 border-red-200',
  'WITHDRAWAL': 'bg-orange-100 text-orange-800 border-orange-200',
  'REVOCATION': 'bg-rose-100 text-rose-800 border-rose-200',
  'MISCELLANEOUS': 'bg-gray-100 text-gray-800 border-gray-200',
  'TRANSFERS': 'bg-teal-100 text-teal-800 border-teal-200',
  'GRANT DECISION NOTICES': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'UNKNOWN': 'bg-slate-100 text-slate-800 border-slate-200',
};

export default function FmcsaRegister() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<FmcsaRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<DateOption[]>([]);
  const [storedDates, setStoredDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isLoadingDates, setIsLoadingDates] = useState(true);

  // Fetch available dates from FMCSA
  const fetchAvailableDates = useCallback(async () => {
    setIsLoadingDates(true);
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/fmcsa/dates',
        method: 'GET',
        data: {},
      });
      const dates = response.data?.dates || [];
      setAvailableDates(dates);

      // Also fetch stored dates
      const storedResp = await client.apiCall.invoke({
        url: '/api/v1/fmcsa/stored-dates',
        method: 'GET',
        data: {},
      });
      const stored = storedResp.data?.dates || [];
      setStoredDates(stored);

      // Auto-select the first available date
      if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0].fmcsa_date);
      }
    } catch (err: any) {
      console.error('Error fetching dates:', err);
      toast.error('Failed to fetch available dates');
    } finally {
      setIsLoadingDates(false);
    }
  }, [selectedDate]);

  // Fetch records from database
  const fetchRecords = useCallback(async () => {
    if (!selectedDate) return;

    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        register_date: selectedDate,
        limit: '1000',
      };
      if (selectedCategory && selectedCategory !== 'ALL') {
        params.category = selectedCategory;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await client.apiCall.invoke({
        url: '/api/v1/fmcsa/records',
        method: 'GET',
        data: params,
      });

      const data = response.data;
      setRecords(data?.items || []);
      setTotalRecords(data?.total || 0);
      setCategories(data?.categories || []);
    } catch (err: any) {
      console.error('Error fetching records:', err);
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, selectedCategory, searchQuery]);

  // Scrape fresh data from FMCSA
  const handleScrape = async () => {
    if (!selectedDate) {
      toast.error('Please select a date first');
      return;
    }

    setIsScraping(true);
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/fmcsa/scrape',
        method: 'POST',
        data: { pd_date: selectedDate },
      });

      const result = response.data;
      if (result.records_count > 0) {
        toast.success(result.message);
        // Refresh stored dates and records
        const storedResp = await client.apiCall.invoke({
          url: '/api/v1/fmcsa/stored-dates',
          method: 'GET',
          data: {},
        });
        setStoredDates(storedResp.data?.dates || []);
        await fetchRecords();
      } else {
        toast.warning(result.message);
      }
    } catch (err: any) {
      const detail = err?.data?.detail || err?.response?.data?.detail || err?.message || 'Scrape failed';
      toast.error(detail);
    } finally {
      setIsScraping(false);
    }
  };

  useEffect(() => {
    fetchAvailableDates();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchRecords();
    }
  }, [selectedDate, selectedCategory, searchQuery]);

  const isDateStored = storedDates.includes(selectedDate);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">FMCSA Register</h1>
                <p className="text-blue-200 text-sm mt-0.5">
                  Federal Motor Carrier Safety Administration — Daily Register Data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-white border-white/30 text-xs">
                <Database className="h-3 w-3 mr-1" />
                {totalRecords} records
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              {/* Date Selector */}
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Register Date
                </label>
                <Select
                  value={selectedDate}
                  onValueChange={setSelectedDate}
                  disabled={isLoadingDates}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingDates ? 'Loading dates...' : 'Select a date'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.map((d) => (
                      <SelectItem key={d.fmcsa_date} value={d.fmcsa_date}>
                        {d.label}
                        {storedDates.includes(d.fmcsa_date) && ' ✓'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  <Search className="h-4 w-4 inline mr-1" />
                  Search
                </label>
                <Input
                  placeholder="Search docket or carrier name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Scrape Button */}
              <div className="flex gap-2">
                <Button
                  onClick={handleScrape}
                  disabled={isScraping || !selectedDate}
                  className="bg-[#1E3A5F] hover:bg-[#2a4f7a] text-white"
                >
                  {isScraping ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isScraping ? 'Scraping...' : 'Fetch Data'}
                </Button>
              </div>
            </div>

            {/* Status indicator */}
            {selectedDate && (
              <div className="mt-3 flex items-center gap-2">
                {isDateStored ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    ✓ Data available in database
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                    ⚠ No data stored — click "Fetch Data" to scrape from FMCSA
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Tabs & Records Table */}
        {isLoading ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#1E3A5F]" />
              <p className="mt-4 text-gray-500">Loading records...</p>
            </CardContent>
          </Card>
        ) : records.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Database className="h-12 w-12 mx-auto text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-600">No Records Found</h3>
              <p className="mt-2 text-gray-400 max-w-md mx-auto">
                {selectedDate
                  ? `No data for ${selectedDate}. Click "Fetch Data" to scrape live data from FMCSA.`
                  : 'Select a date and click "Fetch Data" to get started.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            className="space-y-4"
          >
            <TabsList className="flex flex-wrap h-auto gap-1 bg-white border p-1">
              <TabsTrigger value="ALL" className="text-xs">
                All ({totalRecords})
              </TabsTrigger>
              {categories.map((cat) => {
                const count = records.filter(
                  (r) => selectedCategory === 'ALL' || r.category === cat
                ).length;
                return (
                  <TabsTrigger key={cat} value={cat} className="text-xs">
                    {cat.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>
                    {selectedCategory === 'ALL' ? 'All Categories' : selectedCategory}
                  </span>
                  <span className="text-sm font-normal text-gray-500">
                    Showing {records.length} of {totalRecords} records
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-[140px] font-semibold">Docket #</TableHead>
                        <TableHead className="font-semibold">Carrier Information</TableHead>
                        <TableHead className="w-[200px] font-semibold">Category</TableHead>
                        <TableHead className="w-[120px] font-semibold">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow key={record.id} className="hover:bg-blue-50/50">
                          <TableCell className="font-mono text-sm font-medium text-[#1E3A5F]">
                            {record.docket_number}
                          </TableCell>
                          <TableCell className="text-sm">{record.carrier_info}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${CATEGORY_COLORS[record.category] || CATEGORY_COLORS['UNKNOWN']}`}
                            >
                              {record.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {record.published_date || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </Tabs>
        )}
      </main>
    </div>
  );
}
