import { NextRequest, NextResponse } from 'next/server';

const FEEDS: Record<string, string | undefined> = {
  fred_custody:     process.env.FEED_FRED_CUSTODY,
  fred_outlook:     process.env.FEED_FRED_OUTLOOK,
  charissa_custody: process.env.FEED_CHARISSA_CUSTODY,
};

export async function GET(request: NextRequest) {
  const feed = request.nextUrl.searchParams.get('feed');

  if (!feed || !Object.prototype.hasOwnProperty.call(FEEDS, feed)) {
    return new NextResponse('Unknown feed', { status: 400 });
  }

  const url = FEEDS[feed];
  if (!url?.trim()) {
    // Feed not yet configured — return empty
    return new NextResponse(null, { status: 204 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'FamilyCalendar/2.0' },
      next: { revalidate: 300 }, // cache 5 min at the edge
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
