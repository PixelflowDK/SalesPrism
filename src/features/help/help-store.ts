"use client";

import { proxy, useSnapshot } from "valtio";

export type HelpTab = "getting-started" | "models" | "faq" | "support";

/** Help slide-over open/closed + active-tab state (Stage 5c, SAD §18 Phase F). */
class HelpUiState {
  public open: boolean = false;
  public tab: HelpTab = "getting-started";

  public openHelp(tab: HelpTab = "getting-started") {
    this.tab = tab;
    this.open = true;
  }

  public closeHelp() {
    this.open = false;
  }

  public setTab(tab: HelpTab) {
    this.tab = tab;
  }
}

export const helpStore = proxy(new HelpUiState());

export const useHelpUi = () => useSnapshot(helpStore);
