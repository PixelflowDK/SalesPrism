import { PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  title: string;
}

export const ChatGroup = (props: Props) => {
  return (
    <div className="flex flex-col">
      <div className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground px-3 py-2">
        {props.title}
      </div>
      <div className="flex flex-col gap-1">{props.children}</div>
    </div>
  );
};
