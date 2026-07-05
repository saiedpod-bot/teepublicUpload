import { NextRequest, NextResponse } from "next/server";
import { generateListingViaVertex } from "@/lib/vertexClient";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageMime, prompt, model } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "Image data is required" }, { status: 400 });
    }
    const listing = await generateListingViaVertex(imageBase64, imageMime, prompt, model);
    return NextResponse.json({ listing });
  } catch (e: any) {
    console.error("generate-listing error:", e);
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
