import { NextRequest, NextResponse } from 'next/server';
import { getVerdictStore } from "@/lib/registry";

import { checkRateLimit } from '@/lib/api/rate-limit'; 
import { fetchVerdicts } from '@/lib/workers/db';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 1. Enforce Rate Limiting & Abuse Controls (#918)
  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const searchParams = request.nextUrl.searchParams;
  const workerId = searchParams.get('worker');
  const startLedger = searchParams.get('start_ledger');
  const endLedger = searchParams.get('end_ledger');

  if (!workerId) {
    return NextResponse.json({ error: 'Missing required parameter: worker' }, { status: 400 });
  }

  try {
    const verdicts = await fetchVerdicts({
      workerId,
      startLedger: startLedger ? parseInt(startLedger, 10) : undefined,
      endLedger: endLedger ? parseInt(endLedger, 10) : undefined,
    });

    // 2. Return payload with schema, engine, and formula versions
    return NextResponse.json({
      meta: {
        schema_version: '1.0.0',
        engine_version: process.env.ENGINE_VERSION || '1.0.0',
        formula_version: process.env.FORMULA_VERSION || '1.0.0',
      },
      data: verdicts,
    }, {
      status: 200,
      headers: {
        // 3. Cache headers to prevent recomputing per view
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      }
    });
  } catch (error) {
    console.error('Error fetching verdicts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
