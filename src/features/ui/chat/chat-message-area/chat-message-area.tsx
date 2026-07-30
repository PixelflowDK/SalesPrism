"use client";
import { cn } from "@/ui/lib";
import {
  CheckIcon,
  ClipboardIcon,
  PocketKnife,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarImage } from "../../avatar";
import { Button } from "../../button";

export const ChatMessageArea = (props: {
  children?: React.ReactNode;
  profilePicture?: string | null;
  profileName?: string;
  role: "function" | "user" | "assistant" | "system" | "tool";
  onCopy: () => void;
}) => {
  const [isIconChecked, setIsIconChecked] = useState(false);

  const handleButtonClick = () => {
    props.onCopy();
    setIsIconChecked(true);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsIconChecked(false);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [isIconChecked]);

  let profile = null;

  switch (props.role) {
    case "assistant":
    case "user":
      if (props.profilePicture) {
        profile = (
          <Avatar>
            <AvatarImage src={props.profilePicture} />
          </Avatar>
        );
      } else {
        profile = (
          <UserCircle
            size={28}
            strokeWidth={1.4}
            className="text-muted-foreground"
          />
        );
      }
      break;
    case "tool":
    case "function":
      profile = (
        <PocketKnife
          size={28}
          strokeWidth={1.4}
          className="text-muted-foreground"
        />
      );
      break;
    default:
      break;
  }

  const isAssistant = props.role === "assistant";
  const isToolOrFunction = props.role === "tool" || props.role === "function";

  const header = (
    <div className="h-7 flex items-center justify-between">
      <div className="flex gap-3">
        {profile}
        <div
          className={cn(
            "capitalize items-center flex font-medium",
            // SR-004 — profile-name label renders at body size; text-primary-text
            // is the AA-safe darker Copper (raw text-primary stays reserved for
            // the AI Response Block's own headings/links below).
            isAssistant && "font-display text-primary-text",
            !isAssistant && !isToolOrFunction && "text-foreground",
            isToolOrFunction && "text-muted-foreground text-sm font-body"
          )}
        >
          {props.profileName}
        </div>
      </div>
      <div className="h-7 flex items-center justify-between">
        <Button
          variant={"ghost"}
          size={"sm"}
          title="Copy text"
          aria-label="Copy message text"
          className="justify-right flex"
          onClick={handleButtonClick}
        >
          {isIconChecked ? (
            <CheckIcon size={16} aria-hidden="true" />
          ) : (
            <ClipboardIcon size={16} aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );

  const prose = (
    <div
      className={cn(
        // No `dark:prose-invert` — prose colors are wired to the design
        // tokens above, which already swap under [data-theme="dark"].
        "prose max-w-none whitespace-break-spaces prose-p:leading-relaxed prose-pre:p-0",
        isAssistant &&
          // SR-004 — prose-headings keeps raw text-primary (DESIGN.md §5.3
          // signature AI Response Block section headings, text-lg/700 weight,
          // locked decision). prose-a (inline markdown links) is body-copy
          // sized, so it uses the AA-safe text-primary-text instead.
          "prose-headings:font-display prose-headings:text-primary prose-headings:font-bold prose-a:text-primary-text"
      )}
    >
      {props.children}
    </div>
  );

  // DESIGN.md §5.3 — the AI Response Block is the product's signature
  // component: a structured document card, never a chat bubble. Warm-sand
  // background, copper left border only, entrance fade-in.
  if (isAssistant) {
    return (
      <div
        role="article"
        aria-label={`${props.profileName ?? "Assistant"} response`}
        className="animate-ai-block-in flex flex-col gap-3 rounded-md border-l-[3px] border-primary bg-ai px-6 py-5"
      >
        {header}
        <div aria-live="polite">{prose}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className="flex flex-col gap-2 flex-1 px-10">{prose}</div>
    </div>
  );
};
