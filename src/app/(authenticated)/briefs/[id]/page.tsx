import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { MeetingBrief } from "@/features/sales-coach/components/meeting-brief";
import { FindMeetingBriefById } from "@/features/sales-coach/meeting-brief-service";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BriefDetailPage(props: Props) {
  const { id } = await props.params;
  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();

  const result = await FindMeetingBriefById(tenantSlug, ownerHashedId, id);
  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-8 py-8">
      <Link href="/briefs" className="text-sm text-muted-foreground hover:text-primary">
        ← Meeting briefs
      </Link>
      <MeetingBrief brief={result.response.brief} briefId={result.response.id} variant="standalone" />
    </div>
  );
}
