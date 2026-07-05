import { NextRequest, NextResponse } from "next/server";
import { generateWithVertex } from "@/lib/vertexClient";

export async function POST(req: NextRequest) {
  try {
    const { prompt, projectId, count } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    const images = await generateWithVertex(prompt, projectId, count ?? 4);
    return NextResponse.json({ images });
  } catch (e: any) {
    console.error("generate-design error:", e);
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
