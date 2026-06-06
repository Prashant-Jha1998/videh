export const ADMIN_ROLES = ["super_admin", "moderator", "legal", "read_only"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "stats.read"
  | "users.read"
  | "users.moderate"
  | "reports.read"
  | "reports.manage"
  | "moderation.read"
  | "moderation.manage"
  | "grievances.read"
  | "grievances.manage"
  | "legal.read"
  | "legal.manage"
  | "dsr.read"
  | "dsr.manage"
  | "analytics.read"
  | "audit.read"
  | "incidents.read"
  | "incidents.manage"
  | "boosts.manage"
  | "groups.create"
  | "admins.manage"
  | "developer.read"
  | "developer.manage"
  | "reels.read"
  | "reels.manage";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    "stats.read",
    "users.read",
    "users.moderate",
    "reports.manage",
    "moderation.manage",
    "grievances.manage",
    "legal.manage",
    "dsr.manage",
    "analytics.read",
    "audit.read",
    "incidents.manage",
    "boosts.manage",
    "groups.create",
    "admins.manage",
    "developer.manage",
    "reels.manage",
  ],
  moderator: [
    "stats.read",
    "users.read",
    "users.moderate",
    "reports.manage",
    "moderation.manage",
    "analytics.read",
    "audit.read",
    "boosts.manage",
    "groups.create",
    "developer.read",
    "reels.read",
    "reels.manage",
  ],
  legal: [
    "stats.read",
    "grievances.manage",
    "legal.manage",
    "dsr.manage",
    "audit.read",
    "analytics.read",
  ],
  read_only: [
    "stats.read",
    "users.read",
    "reports.read",
    "moderation.read",
    "grievances.read",
    "legal.read",
    "dsr.read",
    "analytics.read",
    "audit.read",
    "incidents.read",
    "developer.read",
    "reels.read",
  ],
};

export function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

function roleHasPermissionDirect(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  if (roleHasPermissionDirect(role, permission)) return true;
  if (permission.endsWith(".read")) {
    const manage = permission.replace(".read", ".manage") as AdminPermission;
    return roleHasPermissionDirect(role, manage);
  }
  return false;
}
