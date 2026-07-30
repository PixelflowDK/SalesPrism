import React, { ForwardRefRenderFunction } from "react";

interface ChatMessageContentAreaProps {
  children?: React.ReactNode;
}

const ChatMessageContentArea: ForwardRefRenderFunction<
  HTMLDivElement,
  ChatMessageContentAreaProps
> = (props, ref) => {
  return (
    <div
      ref={ref}
      // DESIGN.md §4.2 — `gutter` (24px) between sibling layout blocks.
      className="container max-w-3xl relative min-h-screen pb-[240px] pt-8 flex flex-col gap-6"
    >
      {props.children}
    </div>
  );
};

export default React.forwardRef(ChatMessageContentArea);
