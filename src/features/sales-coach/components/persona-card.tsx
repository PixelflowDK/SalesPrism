import {
  CustomerContact,
  PERSONA_TYPE_LABELS,
  PERSONA_TYPE_ORG_LEVEL,
  VALUE_AREA_LABELS,
} from "../models";

/**
 * F-04 auto-generated stakeholder persona card — DESIGN.md §5.7 "Persona
 * tag" (ray-tinted pill) + §5.6 "Stakeholder cards" conventions, rendered
 * inside `/customers/[id]`.
 */

// Deterministic ray-color assignment per persona type (§2.6 — data-viz only,
// never primary chrome) so each archetype reads consistently across cards.
const PERSONA_RAY: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7> = {
  "strategic-visionary": 1,
  "strategic-guardian": 6,
  "tactical-translator": 3,
  "tactical-coordinator": 2,
  "operational-specialist": 4,
  "operational-gatekeeper": 7,
};

export const PersonaCard = ({ contact }: { contact: CustomerContact }) => {
  const orgLevel = contact.personaType ? PERSONA_TYPE_ORG_LEVEL[contact.personaType] : null;
  const ray = contact.personaType ? PERSONA_RAY[contact.personaType] : 7;

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-lg font-bold text-foreground">{contact.name}</p>
          <p className="text-sm text-muted-foreground">{contact.title}</p>
        </div>
        {contact.personaType && (
          <span
            className="rounded-pill px-3 py-1 text-xs font-medium uppercase tracking-[0.06em]"
            style={{ backgroundColor: `var(--ray-${ray})`, color: "var(--color-text-on-primary)" }}
          >
            {PERSONA_TYPE_LABELS[contact.personaType]}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">Org-niveau</dt>
          <dd className="mt-1 capitalize text-foreground">{orgLevel ?? "Ukendt"}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">Primary value</dt>
          <dd className="mt-1 text-foreground">
            {contact.primaryValueArea ? VALUE_AREA_LABELS[contact.primaryValueArea] : "Ukendt"}
          </dd>
        </div>
        {contact.secondaryValueArea && (
          <div>
            <dt className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
              Secondary value
            </dt>
            <dd className="mt-1 text-foreground">{VALUE_AREA_LABELS[contact.secondaryValueArea]}</dd>
          </div>
        )}
      </dl>

      {contact.knownTriggers.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">Kendte triggers</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {contact.knownTriggers.map((trigger, i) => (
              <span
                key={i}
                className="rounded-pill border border-destructive px-2 py-0.5 text-xs text-destructive"
              >
                {trigger}
              </span>
            ))}
          </div>
        </div>
      )}

      {contact.communicationTips.length > 0 && (
        <div className="mt-4 rounded-sm border-l-[3px] border-tertiary bg-tertiary-light p-3">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-tertiary">Kommunikations-tips</p>
          <ul className="mt-1 list-disc pl-4 text-sm text-foreground">
            {contact.communicationTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {contact.suggestedQuestions.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
            Næste møde — foreslåede spørgsmål
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {contact.suggestedQuestions.map((q, i) => (
              <li key={i} className="font-display italic text-sm text-foreground">
                &ldquo;{q}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      {contact.notes && (
        <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">{contact.notes}</p>
      )}
    </div>
  );
};
