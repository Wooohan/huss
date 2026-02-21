import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, ArrowRight, FileText, Shield } from 'lucide-react';

export default function IndexPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold tracking-tight">HUSS Platform</h1>
          <p className="text-blue-200 mt-1">FMCSA Data & Compliance Tools</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900">
            Motor Carrier Data Hub
          </h2>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Access real-time FMCSA Register data, track carrier applications, and stay updated
            with daily decisions and notices from the Federal Motor Carrier Safety Administration.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* FMCSA Register Card */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-[#1E3A5F]/30"
            onClick={() => navigate('/fmcsa-register')}
          >
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-[#1E3A5F] flex items-center justify-center mb-3">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-xl">FMCSA Register</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-4">
                View daily FMCSA Register data including name changes, certificates, revocations,
                and more. Fetches real data directly from FMCSA.
              </p>
              <Button className="w-full bg-[#1E3A5F] hover:bg-[#2a4f7a] text-white">
                View Register
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Database Card */}
          <Card className="border-2 opacity-75">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gray-400 flex items-center justify-center mb-3">
                <Database className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-xl text-gray-500">Data Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 text-sm mb-4">
                Analyze historical FMCSA data trends, carrier statistics, and compliance patterns.
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          {/* Compliance Card */}
          <Card className="border-2 opacity-75">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gray-400 flex items-center justify-center mb-3">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-xl text-gray-500">Compliance Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 text-sm mb-4">
                Monitor carrier compliance status, insurance filings, and out-of-service orders.
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
