import { userHashedId } from "@/features/auth-page/helpers";
import { FindMeetingBriefById } from "@/features/sales-coach/meeting-brief-service";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { NextRequest, NextResponse } from "next/server";

/**
 * Read-only, auth-scoped accessor for a single saved MeetingBrief (F-01) —
 * backs the `{% meeting-brief id="..." /%}` chat-stream embed
 * (`MeetingBriefEmbed`). Never trusts a client-supplied user/tenant id:
 * `ownerHashedId`/`tenantSlug` are re-derived server-side from the
 * authenticated session on every request, exactly like every Server Action
 * in `chat-services/*` and `admin/*`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const [tenantSlug, ownerHashedId] = await Promise.all([
      getCurrentTenantSlug(),
      userHashedId(),
    ]);

    const result = await FindMeetingBriefById(tenantSlug, ownerHashedId, id);

    if (result.status === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.status !== "OK") {
      return NextResponse.json({ error: "Unable to load meeting brief" }, { status: 500 });
    }

    return NextResponse.json({ brief: result.response.brief });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
