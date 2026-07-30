import { Button } from "@/features/ui/button";
import { FC, PropsWithChildren } from "react";

interface HeroProps extends PropsWithChildren {
  title: React.ReactNode;
  description: string;
}

export const Hero: FC<HeroProps> = (props) => {
  return (
    <div className="border-b border-border w-full py-16">
      <div className="container max-w-4xl h-full flex flex-col gap-16">
        <div className="flex gap-6 flex-col items-start">
          <h1 className="font-display text-3xl font-bold text-primary flex gap-3 items-center">
            {props.title}
          </h1>
          <p className="text-muted-foreground max-w-xl">{props.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">{props.children}</div>
      </div>
    </div>
  );
};

interface HeroButtonProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

// DESIGN.md §5.6 — action card: surface bg, border, hover scale(1.02) +
// border transitions to primary (never a deepening shadow).
export const HeroButton: FC<HeroButtonProps> = (props) => {
  return (
    <Button
      variant={"outline"}
      className="flex flex-col gap-4 h-auto p-4 items-start text-start justify-start bg-card border-border transition-transform duration-150 ease-out hover:scale-[1.02] hover:border-primary"
      onClick={props.onClick}
    >
      {/* SR-004 — body-sized label (inherits button's text-sm); text-primary-text is the AA-safe darker Copper. */}
      <span className="flex gap-2 items-center text-primary-text font-medium">
        <span aria-hidden="true">{props.icon}</span>
        <span className="">{props.title}</span>
      </span>

      <span className="text-muted-foreground whitespace-break-spaces font-normal">
        {props.description}
      </span>
    </Button>
  );
};
