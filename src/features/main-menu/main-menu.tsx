import { MenuTrayToggle } from "@/features/main-menu/menu-tray-toggle";
import { AI_NAME } from "@/features/theme/theme-config";
import {
  Menu,
  MenuBar,
  MenuItem,
  MenuItemContainer,
  menuIconProps,
} from "@/ui/menu";
import {
  Book,
  FileText,
  Home,
  MessageCircle,
  PocketKnife,
  Settings,
  Sheet,
  Users,
  VenetianMask,
} from "lucide-react";
import { getCurrentUser } from "../auth-page/helpers";
import { HelpMenuButton } from "./help-menu-button";
import { MenuLink } from "./menu-link";
import { UserProfile } from "./user-profile";

// DESIGN.md §5.1 — sidebar structure: wordmark + subtitle, primary nav
// (icon + label), Recents (chat history tray, rendered separately per
// route — see (authenticated)/chat/layout.tsx), Settings/profile pinned
// to the bottom.
export const MainMenu = async () => {
  const user = await getCurrentUser();

  return (
    <Menu>
      <MenuBar>
        <MenuItemContainer>
          <div className="px-3 pt-1 pb-3">
            <p className="font-display text-lg font-bold leading-none text-foreground">
              {AI_NAME}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Expert Workspace
            </p>
          </div>
          <MenuItem tooltip="Home" asChild>
            <MenuLink href="/chat" ariaLabel="Go to the Home page">
              <Home {...menuIconProps} />
              <span className="text-sm">Home</span>
            </MenuLink>
          </MenuItem>
          <MenuTrayToggle />
        </MenuItemContainer>
        <MenuItemContainer className="flex-1 overflow-y-auto">
          <MenuItem tooltip="Chat" asChild>
            <MenuLink href="/chat" ariaLabel="Go to the Chat page">
              <MessageCircle {...menuIconProps} />
              <span className="text-sm">Chat</span>
            </MenuLink>
          </MenuItem>
          <MenuItem tooltip="Persona" asChild>
            <MenuLink
              href="/persona"
              ariaLabel="Go to the Persona configuration page"
            >
              <VenetianMask {...menuIconProps} />
              <span className="text-sm">Persona</span>
            </MenuLink>
          </MenuItem>
          {/* Sales Coach 360 F-03/F-04 — customer intelligence + persona profiles, visible to every user (per-seller data, not admin-only). */}
          <MenuItem tooltip="Customers" asChild>
            <MenuLink href="/customers" ariaLabel="Go to the Customers page">
              <Users {...menuIconProps} />
              <span className="text-sm">Customers</span>
            </MenuLink>
          </MenuItem>
          {/* Sales Coach 360 F-01 — saved, reopenable meeting-prep briefs. */}
          <MenuItem tooltip="Briefs" asChild>
            <MenuLink href="/briefs" ariaLabel="Go to the Meeting Briefs page">
              <FileText {...menuIconProps} />
              <span className="text-sm">Briefs</span>
            </MenuLink>
          </MenuItem>
          <MenuItem tooltip="Extensions" asChild>
            <MenuLink
              href="/extensions"
              ariaLabel="Go to the Extensions configuration page"
            >
              <PocketKnife {...menuIconProps} />
              <span className="text-sm">Extensions</span>
            </MenuLink>
          </MenuItem>
          <MenuItem tooltip="Prompt library" asChild>
            <MenuLink
              href="/prompt"
              ariaLabel="Go to the Prompt Library configuration page"
            >
              <Book {...menuIconProps} />
              <span className="text-sm">Prompt Library</span>
            </MenuLink>
          </MenuItem>
          {user.isAdmin && (
            <MenuItem tooltip="Reporting" asChild>
              <MenuLink href="/reporting" ariaLabel="Go to the Admin reporting">
                <Sheet {...menuIconProps} />
                <span className="text-sm">Reporting</span>
              </MenuLink>
            </MenuItem>
          )}
          {user.isAdmin && (
            <MenuItem tooltip="Admin" asChild>
              <MenuLink href="/admin/users" ariaLabel="Go to the Admin portal">
                <Settings {...menuIconProps} />
                <span className="text-sm">Admin</span>
              </MenuLink>
            </MenuItem>
          )}
        </MenuItemContainer>
        <MenuItemContainer className="border-t border-border pt-2">
          {/* Stage 5c, SAD §18 Phase F — persistent Help slide-over, reachable from every authenticated page. */}
          <MenuItem tooltip="Help" asChild>
            <HelpMenuButton />
          </MenuItem>
          <MenuItem tooltip="Profile">
            <UserProfile />
          </MenuItem>
        </MenuItemContainer>
      </MenuBar>
    </Menu>
  );
};
