// Per-user preferences (CC37). A single namespaced object persisted on the
// server; today only the `sidebar` namespace is used. Project IDs are UUID
// strings (CHAR(36) on the server) — never integers.

export type SidebarView = 'all' | 'mine';

/** Sidebar project-filtering preference: which view is active + the curated set. */
export interface SidebarPreferences {
  view: SidebarView;
  pinnedProjects: string[];
}

/** The full preferences object. Extensible: future namespaces add sibling keys. */
export interface UserPreferences {
  sidebar?: SidebarPreferences;
}
