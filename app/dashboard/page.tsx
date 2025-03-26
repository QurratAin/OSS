'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BusinessInformation {
  [key: string]: string; // Allow any key with string values
}

interface BusinessData {
  Suggestions: { [key: string]: string };
  Recommendations: {
    Negative: { [key: string]: string };
    Positive: { [key: string]: string };
  };
  BusinessInfo?: BusinessInformation | string[]; // Correct key name
}

interface AnalysisData {
  [category: string]: {
    [business: string]: BusinessData;
  };
}

export default function Dashboard() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
  const [expandedBusinesses, setExpandedBusinesses] = useState<{ [key: string]: boolean }>({});
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push('/');
          return;
        }

        const { data, error } = await supabase
          .from('business_analysis')
          .select('analysis_data, analysis_period_end')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error fetching analysis:', error);
          setError(error.message);
          return;
        }

        if (!data || data.length === 0) {
          console.log('No analysis data found');
          setError('No analysis data found');
          return;
        }

        const analysisData = data[0].analysis_data;
        console.log('Raw analysis data:', analysisData);

        if (!analysisData || typeof analysisData !== 'object') {
          console.error('Invalid analysis data structure:', analysisData);
          setError('Invalid analysis data structure');
          return;
        }

        setAnalysis(analysisData);
        setLastUpdated(data[0].analysis_period_end);
      } catch (error) {
        console.error('Error in fetchData:', error);
        setError(error instanceof Error ? error.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const toggleCategory = (category: string) => {
    setSelectedCategory(category);
    setShowWelcome(false);
    setExpandedBusinesses({});
  };

  const toggleBusiness = (businessKey: string) => {
    setExpandedBusinesses(prev => ({
      ...prev,
      [businessKey]: !prev[businessKey]
    }));
  };

  const handleShowWelcome = () => {
    setShowWelcome(true);
    setSelectedCategory(null);
    setExpandedBusinesses({});
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const normalizeBusinessInfo = (info?: BusinessInformation | string[]): BusinessInformation => {
    if (!info) return {};
  
    // If it's already an object, return it as-is
    if (typeof info === 'object' && !Array.isArray(info)) {
      return info;
    }
  
    // If it's an array (fallback), convert it to an object
    if (Array.isArray(info)) {
      const normalizedInfo: BusinessInformation = {};
      info.forEach(item => {
        if (item.startsWith('Phone:')) {
          normalizedInfo.phone = item.replace('Phone:', '').trim();
        } else if (item.startsWith('Insta:')) {
          normalizedInfo.Insta = item.replace('Insta:', '').trim();
        } else if (item.startsWith('Site:')) {
          normalizedInfo.Site = item.replace('Site:', '').trim();
        } else if (item.startsWith('Email:')) {
          normalizedInfo.email = item.replace('Email:', '').trim();
        } else if (item.startsWith('FB:')) {
          normalizedInfo.Facebook = item.replace('FB:', '').trim();
        } else {
          // Handle other keys dynamically
          const [key, value] = item.split(':').map(part => part.trim());
          if (key && value) {
            normalizedInfo[key] = value;
          }
        }
      });
      return normalizedInfo;
    }
  
    return {};
  };

  const hasBusinessInformation = (info?: BusinessInformation | string[]): boolean => {
    const normalizedInfo = normalizeBusinessInfo(info);
    return Object.values(normalizedInfo).some(value => Object.keys(value).length > 0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003200]"></div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-[#003200] mb-8">OSS Soulfull Business Circle</h1>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p className="text-gray-600">{error || 'No analysis data available yet.'}</p>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-500">To generate analysis data:</p>
              <ol className="list-decimal list-inside text-sm text-gray-500 space-y-1">
                <li>Run the scraper: <code className="bg-gray-100 px-2 py-1 rounded">npm run scrape</code></li>
                <li>Run the analysis: <code className="bg-gray-100 px-2 py-1 rounded">npm run analyze</code></li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <div className="w-64 bg-[#e4e4e4] min-h-screen p-6 shadow-md">
        <h2
          onClick={handleShowWelcome}
          className="text-[#003200] text-xl font-bold mb-8 cursor-pointer hover:opacity-80 transition-opacity"
        >
          OSS Soulfull Business Circle
        </h2>
        <ul className="space-y-2">
          {Object.keys(analysis).map((category) => (
            <li key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className={`w-full text-left px-4 py-2 rounded-md transition-colors ${
                  selectedCategory === category
                    ? 'bg-white text-[#003200] font-semibold'
                    : 'text-[#003200] hover:bg-white/80'
                }`}
              >
                {category}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        {showWelcome ? (
          <div className="text-center mt-20">
            <h1 className="text-3xl font-bold text-[#003200] mb-4">
              Welcome to OSS Soulfull Business Circle!
            </h1>
            <p className="text-gray-600">
              Select a category from the sidebar to explore businesses
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-[#003200]">
                {selectedCategory}
              </h1>
              {lastUpdated && (
                <p className="text-sm text-gray-500">
                  Last updated: {formatDate(lastUpdated)}
                </p>
              )}
            </div>

            <div className="space-y-4">
              {selectedCategory && analysis[selectedCategory] &&
                Object.entries(analysis[selectedCategory]).map(([business, data]) => {

                  const businessKey = `${selectedCategory}-${business}`;
                  const isExpanded = expandedBusinesses[businessKey];
                  // Normalize Business Information (with fallback)
                  const businessInfo = normalizeBusinessInfo(data.BusinessInfo || {});
                  return (
                    <div key={business} className="border-l-4 border-[#fffbbc] bg-white rounded-lg shadow-md overflow-hidden">
                      <button
                        onClick={() => toggleBusiness(businessKey)}
                        className="w-full flex justify-between items-center p-4 hover:bg-gray-50 transition-colors"
                      >
                        <h3 className="text-xl font-semibold text-[#003200]">{business}</h3>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="p-4 border-t">
                          {/* Business Information */}
                          {Object.keys(businessInfo).length > 0 && (
                            <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                              <h4 className="text-lg font-semibold text-[#003200] mb-3">
                                Business Information
                              </h4>
                              <div className="space-y-3">
                                {Object.entries(businessInfo).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium text-[#003200] capitalize">{key}:</span>
                                    <p className="text-gray-700">{value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recommendations */}
                          <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                            <h4 className="text-lg font-semibold text-[#003200] mb-3">
                              Recommendations
                            </h4>
                            <div className="space-y-4">
                              {/* Positive Recommendations */}
                              {Object.entries(data.Recommendations.Positive || {}).length > 0 && (
                                <div>
                                  <span className="font-medium text-[#003200]">Positive:</span>
                                  <ul className="mt-1 space-y-2">
                                    {Object.entries(data.Recommendations.Positive || {}).map(([key, value]) => (
                                      <li key={key} className="text-gray-700">
                                        <span className="font-medium">{key}:</span> {value}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Negative Recommendations */}
                              {Object.entries(data.Recommendations.Negative || {}).length > 0 && (
                                <div>
                                  <span className="font-medium text-[#003200]">Negative:</span>
                                  <ul className="mt-1 space-y-2">
                                    {Object.entries(data.Recommendations.Negative || {}).map(([key, value]) => (
                                      <li key={key} className="text-gray-700">
                                        <span className="font-medium">{key}:</span> {value}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Suggestions */}
                          {Object.entries(data.Suggestions || {}).length > 0 && (
                            <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                              <h4 className="text-lg font-semibold text-[#003200] mb-3">
                                Suggestions
                              </h4>
                              <ul className="mt-1 space-y-2">
                                {Object.entries(data.Suggestions || {}).map(([key, value]) => (
                                  <li key={key} className="text-gray-700">
                                    <span className="font-medium">{key}:</span> {value}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}