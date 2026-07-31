import { NextRequest, NextResponse } from "next/server";

import { enforceApiRateLimit } from "@/lib/rateLimit";
import { fetchSetlistById, SetlistFmApiError } from "@/lib/setlistfm";

export async function GET(request: NextRequest) {
  const rateLimited = enforceApiRateLimit(request, "setlist");
  if (rateLimited) {
    return rateLimited;
  }

  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing setlist ID." }, { status: 400 });
  }

  try {
    const setlist = await fetchSetlistById(id);

    return NextResponse.json({ setlist });
  } catch (error) {
    if (error instanceof SetlistFmApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status && error.status >= 400 ? error.status : 500 },
      );
    }

    return NextResponse.json({ error: "Unable to fetch that setlist." }, { status: 500 });
  }
}
