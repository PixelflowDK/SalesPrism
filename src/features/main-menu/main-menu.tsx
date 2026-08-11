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
  ClipboardList,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  LayoutGrid,
  MessageCircle,
  Settings,
  Users,
  VenetianMask,
} from "lucide-react";
import { getCurrentUser } from "../auth-page/helpers";
import { HelpMenuButton } from "./help-menu-button";
import { MenuLink } from "./menu-link";
import { UserProfile } from "./user-profile";

/**
 * W7 — nav IA rebuilt around the seller workflow (docs/feature-to-ui-audit.md
 * W7). Primary order: Home / Prepare / Coach / Chat / Customers / Briefs /
 * Modules / Documents — the two highest-differentiation, previously
 * entry-point-less features (F-01/F-02) now lead the list, immediately
 * after Home. `/persona` (azurechat's system-prompt personas — a DIFFERENT
 * concept from the backlog's F-04 stakeholder personas, see W5) is
 * relabeled "AI Personas" so it never reads as the same thing as the
 * "Stakeholders" section under `/customers/[id]`.
 *
 * `/extensions`, `/prompt`, `/reporting` are inherited azurechat surfaces
 * out of Coach 360 V1 scope (feature-to-ui-audit.md finding 6) — their
 * routes stay intact (not deleted, still reachable by direct URL for an
 * admin who knows them) but are deliberately not linked here anymore,
 * `/reporting` included even though it was previously admin-gated in the
 * flat list: the audit's instruction is to hide it, not relabel it as an
 * admin capability.
 */
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
            <MenuLink href="/home" ariaLabel="Go to the Home page">
              <Home {...menuIconProps} />
              <span className="text-sm">Home</span>
            </MenuLink>
          </MenuItem>
          <MenuTrayToggle />
        </MenuItemContainer>
        <MenuItemContainer className="flex-1 overflow-y-auto">
          {/* F-01 — first-class Meeting Preparation entry point (was: discoverable only by typing a magic phrase into chat). */}
          <MenuItem tooltip="Prepare" asChild>
            <MenuLink href="/prepare" ariaLabel="Go to Meeting Preparation">
              <ClipboardList {...menuIconProps} />
              <span className="text-sm">Prepare</span>
            </MenuLink>
          </MenuItem>
          {/* F-02 — first-class Conversation Coaching entry point. */}
          <MenuItem tooltip="Coach" asChild>
            <MenuLink href="/coach" ariaLabel="Go to Conversation Coaching">
              <GraduationCap {...menuIconProps} />
              <span className="text-sm">Coach</span>
            </MenuLink>
          </MenuItem>
          <MenuItem tooltip="Chat" asChild>
            <MenuLink href="/chat" ariaLabel="Go to the Chat page">
              <MessageCircle {...menuIconProps} />
              <span className="text-sm">Chat</span>
            </MenuLink>
          </MenuItem>
          {/* Sales Coach 360 F-03/F-04 — customer intelligence + stakeholder profiles, visible to every user (per-seller data, not admin-only). */}
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
          {/* SAD §27 — the 7 Sales Coach models. */}
          <MenuItem tooltip="Modules" asChild>
            <MenuLink href="/modules" ariaLabel="Go to the Sales Coach models">
              <LayoutGrid {...menuIconProps} />
              <span className="text-sm">Modules</span>
            </MenuLink>
          </MenuItem>
          {/* W6 — documents backing this seller's RAG, across all chat threads. */}
          <MenuItem tooltip="Documents" asChild>
            <MenuLink href="/documents" ariaLabel="Go to your Documents">
              <FolderOpen {...menuIconProps} />
              <span className="text-sm">Documents</span>
            </MenuLink>
          </MenuItem>
          {/* W5 — relabeled from "Persona" to avoid reading as the same concept as customer Stakeholders (F-04). */}
          <MenuItem tooltip="AI Personas" asChild>
            <MenuLink
              href="/persona"
              ariaLabel="Go to the AI Personas configuration page"
            >
              <VenetianMask {...menuIconProps} />
              <span className="text-sm">AI Personas</span>
            </MenuLink>
          </MenuItem>
          {user.isAdmin && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Admin
              </p>
              <MenuItem tooltip="Admin" asChild>
                <MenuLink href="/admin/users" ariaLabel="Go to the Admin portal">
                  <Settings {...menuIconProps} />
                  <span className="text-sm">Admin</span>
                </MenuLink>
              </MenuItem>
            </div>
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
