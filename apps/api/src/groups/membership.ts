import type { Db } from "../db.js";
import type { GroupRole } from "./roles.js";

export type Membership = {
  groupId: string;
  userId: string;
  role: GroupRole;
};

export async function getMembership(
  db: Db,
  groupId: string,
  userId: string,
): Promise<Membership | null> {
  const result = await db.pool.query<{
    group_id: string;
    user_id: string;
    role: GroupRole;
  }>(
    `
      SELECT group_id, user_id, role
      FROM group_members
      WHERE group_id = $1 AND user_id = $2
    `,
    [groupId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
  };
}
