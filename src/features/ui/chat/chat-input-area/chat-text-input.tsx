import React from "react";

export const ChatTextInput = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> // Add ChatInputAreaProps to the type definition
>(({ ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      aria-label="Ask Sales Coach"
      className="p-4 w-full text-base focus:outline-none bg-transparent resize-none placeholder:text-muted-foreground"
      placeholder="Ask Sales Coach…"
      {...props}
    />
  );
});
ChatTextInput.displayName = "ChatTextInput";
