import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { CATEGORIES, MAX_PHOTO_BYTES, PHOTO_STORE, reference } from "../lib/constants.js";

const field = (form: FormData, name: string, max: number) =>
  String(form.get(name) ?? "").trim().slice(0, max);

// Public endpoint: citizens submit reports and look up their own by tracking token.
export default async (req: Request) => {
  if (req.method === "POST") {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "Invalid submission." }, { status: 400 });
    }

    const title = field(form, "title", 200);
    const location = field(form, "location", 300);
    const description = field(form, "description", 5000);
    const categoryInput = field(form, "category", 100);
    const category = CATEGORIES.includes(categoryInput) ? categoryInput : "Other";

    if (!title || !location || !description) {
      return Response.json({ error: "Title, location and description are required." }, { status: 400 });
    }

    let photoKey: string | null = null;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      if (!photo.type.startsWith("image/") || photo.size > MAX_PHOTO_BYTES) {
        return Response.json({ error: "Photo must be an image smaller than 5 MB." }, { status: 400 });
      }
      photoKey = crypto.randomUUID();
      await getStore(PHOTO_STORE).set(photoKey, await photo.arrayBuffer(), {
        metadata: { contentType: photo.type },
      });
    }

    const trackingToken = crypto.randomUUID();
    const [created] = await db
      .insert(reports)
      .values({ trackingToken, title, category, location, description, photoKey })
      .returning();

    return Response.json(
      { reference: reference(created.id), trackingToken, status: created.status },
      { status: 201 },
    );
  }

  if (req.method === "GET") {
    const tokens = (new URL(req.url).searchParams.get("tokens") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (tokens.length === 0) return Response.json([]);

    const rows = await db.select().from(reports).where(inArray(reports.trackingToken, tokens));
    return Response.json(
      rows.map((r) => ({
        trackingToken: r.trackingToken,
        reference: reference(r.id),
        title: r.title,
        category: r.category,
        location: r.location,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/reports",
};
