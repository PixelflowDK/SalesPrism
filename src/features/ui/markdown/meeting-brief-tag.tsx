import { MeetingBriefEmbed } from "@/features/sales-coach/components/meeting-brief-embed";
import { FC } from "react";

/**
 * Markdoc tag for the `{% meeting-brief id="..." /%}` directive emitted by
 * the model after a successful `meetingPrep` tool call (F-01) — mirrors
 * `citation.tsx`'s tag/component pairing exactly.
 */
export const meetingBrief = {
  render: "MeetingBriefBlock",
  selfClosing: true,
  attributes: {
    id: {
      type: String,
    },
  },
};

export const MeetingBriefBlock: FC<{ id: string }> = ({ id }) => <MeetingBriefEmbed id={id} />;
