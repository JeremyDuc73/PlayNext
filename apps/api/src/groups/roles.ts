export type GroupRole = "owner" | "admin" | "member";

export function isManager(role: GroupRole): boolean {
  return role === "owner" || role === "admin";
}

export function roleRank(role: GroupRole): number {
  switch (role) {
    case "owner":
      return 3;
    case "admin":
      return 2;
    case "member":
      return 1;
  }
}

/** Can actor change target's membership/role? */
export function canManageMember(
  actor: GroupRole,
  target: GroupRole,
): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return target === "member";
  return false;
}
