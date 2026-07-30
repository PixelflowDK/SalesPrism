"use client";
import { cn } from "@/ui/lib";
import { MenuItem, menuIconProps } from "@/ui/menu";
import { PanelLeftClose } from "lucide-react";
import { menuStore, useMenuState } from "./menu-store";

export const MenuTrayToggle = () => {
  const { isMenuOpen } = useMenuState();

  return (
    <MenuItem
      onClick={() => menuStore.toggleMenu()}
      tooltip="Open and collapse chat history"
      aria-label="Open and collapse chat history"
    >
      <PanelLeftClose
        {...menuIconProps}
        aria-hidden={true}
        className={cn(
          "transition-all rotate-180 duration-700",
          isMenuOpen ? "rotate-0" : ""
        )}
      />
      <span className="text-sm text-muted-foreground">Chat history</span>
    </MenuItem>
  );
};
