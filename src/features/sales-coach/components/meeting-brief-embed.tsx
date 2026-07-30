"use client";

import { useEffect, useState } from "react";
import { MeetingBrief as MeetingBriefData } from "../models";
import { MeetingBrief } from "./meeting-brief";

/**
 * Chat-stream renderer for the `{% meeting-brief id="..." /%}` Markdoc
 * directive (see `markdown/config.tsx` / `markdown/meeting-brief-tag.tsx`).
 * The model only ever emits the directive + a brief id — this component
 * fetches the saved brief from the auth-scoped read API
 * (`/api/sales-coach/meeting-briefs/[id]`) and renders it with the same
 * `<MeetingBrief>` presentational component the standalone `/briefs/[id]`
 * page uses.
 */
export const MeetingBriefEmbed = ({ id }: { id: string }) => {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ok"; brief: MeetingBriefData }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sales-coach/meeting-briefs/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("not-ok");
        return res.json();
      })
      .then((data: { brief: MeetingBriefData }) => {
        if (!cancelled) setState({ status: "ok", brief: data.brief });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="rounded-md border-l-[3px] border-primary bg-ai px-6 py-5 text-sm text-muted-foreground">
        Loading meeting brief…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-md border-l-[3px] border-destructive bg-card px-6 py-5 text-sm text-foreground">
        This meeting brief could not be loaded. It may have been removed, or you may not have access to it.
      </div>
    );
  }

  return <MeetingBrief brief={state.brief} briefId={id} variant="embedded" />;
};
