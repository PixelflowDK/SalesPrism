"use client";

import { Button } from "@/features/ui/button";
import { LoadingIndicator } from "@/features/ui/loading";
import { Plus } from "lucide-react";
import { useFormStatus } from "react-dom";

export const NewChat = () => {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-disabled={pending}
      size={"default"}
      className="flex gap-2 flex-1 min-h-[44px] font-medium"
      variant={"default"}
    >
      {pending ? <LoadingIndicator isLoading={pending} /> : <Plus size={18} aria-hidden="true" />}
      New Chat
    </Button>
  );
};
