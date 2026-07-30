import { MeetingBrief as MeetingBriefData, VALUE_AREA_LABELS } from "../models";
import Link from "next/link";

/**
 * F-01 structured document block — DESIGN.md §5.3 "AI Response Block
 * (Signature Component)" anatomy: warm-sand background, 3px copper
 * left-border, Playfair Display copper section headings, italic quoted
 * questions, bordered value-area mini-cards with a 5-segment dot meter.
 *
 * Rendered in two places with the exact same presentational component:
 * 1. Inline in the chat stream, via the `{% meeting-brief id="..." /%}`
 *    Markdoc directive → `MeetingBriefEmbed` (client fetch wrapper).
 * 2. Standalone on `/briefs/[id]` (server-rendered, no client fetch).
 */

const IMPACT_DOTS: Record<"low" | "medium" | "high", number> = {
  low: 2,
  medium: 3,
  high: 5,
};

const IMPACT_LABELS: Record<"low" | "medium" | "high", string> = {
  low: "Low Impact",
  medium: "Medium Impact",
  high: "High Impact",
};

const DotMeter = ({ impact }: { impact: "low" | "medium" | "high" }) => {
  const filled = IMPACT_DOTS[impact];
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={
            i < filled ? "h-1.5 w-1.5 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-border-strong"
          }
        />
      ))}
    </span>
  );
};

export const MeetingBrief = ({
  brief,
  briefId,
  variant = "standalone",
}: {
  brief: MeetingBriefData;
  briefId?: string;
  variant?: "embedded" | "standalone";
}) => {
  return (
    <div className="rounded-md border-l-[3px] border-primary bg-ai px-6 py-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h2 className="font-body text-lg font-bold text-foreground">
          Meeting Brief — {brief.customerName}
        </h2>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{brief.meetingTopic}</p>

      <section className="mt-5">
        <h3 className="font-display text-lg font-bold text-primary">Strategic Context</h3>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {brief.framing.type === "burning-platform" ? "Burning Platform" : "Burning Ambition"}
        </p>
        <p className="mt-1 text-base text-foreground">{brief.framing.narrative}</p>
      </section>

      <section className="mt-5">
        <h3 className="font-display text-lg font-bold text-primary">Recommended Questions</h3>
        <p className="mt-1 text-xs text-muted-foreground">2nd Position opening questions</p>
        <ol className="mt-2 flex flex-col gap-2">
          {brief.openingQuestions.map((q, i) => (
            <li key={i} className="flex gap-2 text-base text-foreground">
              <span className="font-mono text-destructive">{String(i + 1).padStart(2, "0")}.</span>
              <span className="font-display italic">&ldquo;{q}&rdquo;</span>
            </li>
          ))}
        </ol>
      </section>

      {brief.discoveryQuestionsByPersona.length > 0 && (
        <section className="mt-5">
          <h3 className="font-display text-lg font-bold text-primary">Discovery Questions</h3>
          <div className="mt-2 flex flex-col gap-3">
            {brief.discoveryQuestionsByPersona.map((group, i) => (
              <div key={i}>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {group.personaType.replace("-", " · ")}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {group.questions.map((q, j) => (
                    <li key={j} className="font-display italic text-base text-foreground">
                      &ldquo;{q}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {brief.valueAreaThemes.length > 0 && (
        <section className="mt-5 flex flex-wrap gap-3">
          {brief.valueAreaThemes.map((theme, i) => (
            <div key={i} className="min-w-[180px] rounded-sm border border-border p-3">
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {VALUE_AREA_LABELS[theme.valueArea]}
              </p>
              <p className="mt-1 text-sm text-foreground">{theme.theme}</p>
              <div className="mt-2 flex items-center gap-2">
                <DotMeter impact={theme.impact} />
                <span className="font-mono text-xs text-muted-foreground">{IMPACT_LABELS[theme.impact]}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {brief.nextSteps.length > 0 && (
        <section className="mt-5">
          <h3 className="font-display text-lg font-bold text-primary">Next Steps</h3>
          <ul className="mt-2 list-disc pl-5 text-base text-foreground">
            {brief.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </section>
      )}

      {variant === "embedded" && briefId && (
        <div className="mt-5 flex gap-3 border-t border-border pt-4">
          <Link
            href={`/briefs/${briefId}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-hover"
          >
            Open saved brief
          </Link>
        </div>
      )}
    </div>
  );
};
