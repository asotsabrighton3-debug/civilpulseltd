import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { MANAGEMENT_ROLES, PHOTO_STORE, PRIORITIES, STATUSES, reference } from "../lib/constants.js";

// Management API. Every route requires a signed-in Identity user with an admin or manager role.
export default async (req: Request) => {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const roles = user.roles ?? [];
  if (!roles.some((role) => MANAGEMENT_ROLES.includes(role))) {
    return Response.json({ error: "Your account does not have management access." }, { status: 403 });
  }

  const path = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, "");
  const [resource, id] = path.split("/");

  if (resource === "me" && req.method === "GET") {
    return Response.json({ email: user.email, name: user.name, roles });
  }

  if (resource === "photos" && id && req.method === "GET") {
    const photo = await getStore(PHOTO_STORE).getWithMetadata(id, { type: "stream" });
    if (!photo) return new Response("Not found", { status: 404 });
    return new Response(photo.data, {
      headers: {
        "Content-Type": String(photo.metadata.contentType ?? "image/jpeg"),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (resource !== "reports") return new Response("Not found", { status: 404 });

  if (!id && req.method === "GET") {
    const rows = await db.select().from(reports).orderBy(desc(reports.createdAt));
    return Response.json(rows.map(({ trackingToken, ...r }) => ({ ...r, reference: reference(r.id) })));
  }

  const reportId = Number(id);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return Response.json({ error: "Invalid report id." }, { status: 400 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    const updates: Partial<typeof reports.$inferInsert> = {};

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return Response.json({ error: "Invalid status." }, { status: 400 });
      updates.status = body.status;
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) return Response.json({ error: "Invalid priority." }, { status: 400 });
      updates.priority = body.priority;
    }
    if (body.assignedTo !== undefined) updates.assignedTo = String(body.assignedTo).trim().slice(0, 200);
    if (body.managementNotes !== undefined) updates.managementNotes = String(body.managementNotes).slice(0, 5000);

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    const [updated] = await db
      .update(reports)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(reports.id, reportId))
      .returning();
    if (!updated) return Response.json({ error: "Report not found." }, { status: 404 });

    const { trackingToken, ...rest } = updated;
    return Response.json({ ...rest, reference: reference(updated.id) });
  }

  if (req.method === "DELETE") {
    const [deleted] = await db.delete(reports).where(eq(reports.id, reportId)).returning();
    if (!deleted) return Response.json({ error: "Report not found." }, { status: 404 });
    if (deleted.photoKey) await getStore(PHOTO_STORE).delete(deleted.photoKey);
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: ["/api/admin/me", "/api/admin/reports", "/api/admin/reports/*", "/api/admin/photos/*"],
};
