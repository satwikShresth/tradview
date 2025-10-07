import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[TradingView Proxy] Received request for query:', {
      hasFilter: !!body.filter,
      filterCount: body.filter?.length || 0,
      range: body.range
    });

    const response = await fetch('https://scanner.tradingview.com/coin/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`[TradingView Proxy] API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { 
          error: 'TradingView API error', 
          status: response.status,
          statusText: response.statusText 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[TradingView Proxy] Successful response:', {
      totalCount: data.totalCount,
      resultCount: data.data?.length || 0
    });
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[TradingView Proxy] Internal error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch from TradingView API',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
