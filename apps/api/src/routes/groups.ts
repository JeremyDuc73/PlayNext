import type { FastifyPluginAsync } from "fastify";
import type { GroupsRoutesOptions } from "./groups/helpers.js";
import { registerGroupCrudRoutes } from "./groups/group-crud.js";
import { registerGroupMembersRoutes } from "./groups/group-members.js";
import { registerGroupInvitesRoutes } from "./groups/group-invites.js";
import { registerGroupDiscordRoutes } from "./groups/group-discord.js";
import { registerGroupLibraryRoutes } from "./groups/group-library.js";

export type { GroupsRoutesOptions };

export const groupsRoutes: FastifyPluginAsync<GroupsRoutesOptions> = async (
  app,
  opts,
) => {
  registerGroupCrudRoutes(app, opts);
  registerGroupMembersRoutes(app, opts);
  registerGroupInvitesRoutes(app, opts);
  registerGroupDiscordRoutes(app, opts);
  registerGroupLibraryRoutes(app, opts);
};
