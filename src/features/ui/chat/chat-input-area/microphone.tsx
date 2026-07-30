import { Mic, Square } from "lucide-react";
import { Button } from "../../button";

export const Microphone = (props: {
  isPlaying: boolean;
  isMicrophoneReady: boolean;
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

  return (
    <>
      {props.isPlaying ? (
        <Button
          size="icon"
          type="button"
          variant={"ghost"}
          onClick={props.stopPlaying}
          aria-label="Stop audio playback"
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
          className={
            props.isMicrophoneReady
              ? "bg-destructive text-destructive-foreground hover:bg-destructive"
              : ""
          }
          aria-label="Microphone for speech input"
        >
          <Mic size={16} aria-hidden="true" />
        </Button>
      )}
    </>
  );
};
