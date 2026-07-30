import { cn } from "@/ui/lib";
import { Mic, MicOff, Square } from "lucide-react";
import { Button } from "../../button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../tooltip";

export const Microphone = (props: {
  isPlaying: boolean;
  isMicrophoneReady: boolean;
  /** `false` when the Speech resource isn't configured for this workspace — see speech-availability-context.tsx. */
  isAvailable: boolean;
  stopPlaying: () => void;
  startRecognition: () => void;
  stopRecognition: () => void;
}) => {
  const startRecognition = () => {
    props.startRecognition();
  };

  const stopRecognition = () => {
    props.stopRecognition();
  };

  // DESIGN.md §5.4 — voice input is a first-class, always-visible affordance
  // ("not tucked into an overflow menu"), so this stays in place and
  // disabled (§7.1: 44x44px hit area preserved) rather than disappearing,
  // with a tooltip explaining why — never a silent dead button, never a
  // runtime error surfaced from pressing it.
  if (!props.isAvailable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={0}>
              <Button
                size="icon"
                type="button"
                variant="ghost"
                disabled
                aria-label="Voice input isn't configured for this workspace"
                className="min-h-[44px] min-w-[44px] cursor-not-allowed opacity-40"
              >
                <MicOff size={16} aria-hidden="true" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Voice input isn&apos;t set up for this workspace yet.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      {props.isPlaying ? (
        <Button
          size="icon"
          type="button"
          variant={"ghost"}
          onClick={props.stopPlaying}
          aria-label="Stop audio playback"
          className="min-h-[44px] min-w-[44px]"
        >
          <Square size={16} aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          variant={"ghost"}
          onMouseDown={startRecognition}
          onMouseUp={stopRecognition}
          onMouseLeave={stopRecognition}
          className={cn(
            "min-h-[44px] min-w-[44px]",
            props.isMicrophoneReady
              ? "bg-destructive text-destructive-foreground hover:bg-destructive"
              : ""
          )}
          aria-label="Microphone for speech input"
        >
          <Mic size={16} aria-hidden="true" />
        </Button>
      )}
    </>
  );
};
