import { cn } from "@/ui/lib";
import { Loader2, Mic, MicOff, Square } from "lucide-react";
import { Button } from "../../button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../tooltip";

export const Microphone = (props: {
  isPlaying: boolean;
  /** `true` while actively recording — see use-speech-to-text.ts. */
  isMicrophoneReady: boolean;
  /** `true` while the recorded clip has been uploaded and is awaiting a transcript (SR-003: no more live interim results, so this is the only "something is happening" signal between release and text-in-input). */
  isTranscribing: boolean;
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

  // SR-003: there are no live interim results anymore (recognition happens
  // server-side, once, after the recording is uploaded — see
  // use-speech-to-text.ts), so this "transcribing" state is the honest
  // stand-in between "release the mic" and "text lands in the input" —
  // never silently pretend nothing is happening. `motion-safe:` keeps the
  // spin off for prefers-reduced-motion; the button stays visibly disabled
  // (not just static) regardless via `cursor-wait` + `aria-live`.
  if (props.isTranscribing) {
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
                aria-label="Transcribing your recording"
                aria-live="polite"
                className="min-h-[44px] min-w-[44px] cursor-wait"
              >
                <Loader2 size={16} aria-hidden="true" className="motion-safe:animate-spin" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Transcribing…</TooltipContent>
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
          onTouchStart={(e) => {
            // Press-and-hold must also work on touch devices — mobile
            // Safari/Chrome don't reliably synthesize mouse events from
            // touch on a <button>. preventDefault stops the browser from
            // ALSO firing a synthetic mousedown a moment later (which
            // would otherwise start a second recording).
            e.preventDefault();
            startRecognition();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            stopRecognition();
          }}
          className={cn(
            "min-h-[44px] min-w-[44px]",
            props.isMicrophoneReady
              ? "bg-destructive text-destructive-foreground hover:bg-destructive motion-safe:animate-pulse"
              : ""
          )}
          aria-label={
            props.isMicrophoneReady
              ? "Recording — release to stop and transcribe"
              : "Microphone for speech input"
          }
          aria-pressed={props.isMicrophoneReady}
        >
          <Mic size={16} aria-hidden="true" />
        </Button>
      )}
    </>
  );
};
