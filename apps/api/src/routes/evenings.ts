import type { FastifyPluginAsync } from "fastify";
import type { EveningsRoutesOptions } from "./evenings/helpers.js";
import { registerGroupEveningsRoutes } from "./evenings/group-evenings.js";
import { registerEveningLobbyRoutes } from "./evenings/evening-lobby.js";
import { registerEveningVotesRoutes } from "./evenings/evening-votes.js";
import { registerEveningResolutionRoutes } from "./evenings/evening-resolution.js";

export type { EveningsRoutesOptions };

export const eveningsRoutes: FastifyPluginAsync<EveningsRoutesOptions> = async (
  app,
  opts,
) => {
  registerGroupEveningsRoutes(app, opts);
  registerEveningLobbyRoutes(app, opts);
  registerEveningVotesRoutes(app, opts);
  registerEveningResolutionRoutes(app, opts);
};
