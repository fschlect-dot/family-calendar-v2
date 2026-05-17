import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const feed = request.nextUrl.searchParams.get('feed');

  // Read env vars inside the handler so they're resolved at request time
  const FEEDS: Record<string, string | undefined> = {
    fred_custody:     process.env.FEED_FRED_CUSTODY,
    fred_outlook:     process.env.FEED_FRED_OUTLOOK,
    charissa_custody: process.env.FEED_CHARISSA_CUSTODY,
  };

  if (!feed || !Object.prototype.hasOwnProperty.call(FEEDS, feed)) {
    return new NextResponse('Unknown feed', { status: 400 });
  }

  const url = FEEDS[feed];

  if (!url?.trim()) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        // Use a real browser UA — Office 365 blocks non-browser agents
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/calendar, text/html, */*',
      },
      next: { revalidate: 300 },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error ${upstream.status}`, { status: 502 });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Fetch failed: ${msg}`, { status: 502 });
  }
}
