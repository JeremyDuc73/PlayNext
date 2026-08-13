const DISCORD_API = "https://discord.com/api/v10";
const SEND_AND_VIEW = 1024 + 2048;

export class DiscordBotError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "invalid" | "unreachable",
  ) {
    super(message);
    this.name = "DiscordBotError";
  }
}

export function discordBotInviteUrl(clientId: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("permissions", String(SEND_AND_VIEW));
  url.searchParams.set("scope", "bot");
  return url.toString();
}

export function parseDiscordChannelId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(
    /discord(?:app)?\.com\/channels\/\d+\/(\d{17,20})/i,
  );
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;
  return null;
}

type DiscordChannel = {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
};

type DiscordGuild = {
  id: string;
  name: string;
};

async function discordRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "PlayNext (https://playnext.jeremyduc.dev, 1.0)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new DiscordBotError("unreachable", "unreachable");
  }

  if (response.status === 404) {
    throw new DiscordBotError("not_found", "not_found");
  }
  if (response.status === 401 || response.status === 403) {
    throw new DiscordBotError("forbidden", "forbidden");
  }
  if (!response.ok) {
    throw new DiscordBotError(`http_${response.status}`, "invalid");
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function resolveDiscordChannel(
  token: string,
  channelId: string,
): Promise<{
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
}> {
  const channel = await discordRequest<DiscordChannel>(
    token,
    "GET",
    `/channels/${channelId}`,
  );
  if (!channel.guild_id || (channel.type !== 0 && channel.type !== 5)) {
    throw new DiscordBotError("invalid_channel", "invalid");
  }
  const guild = await discordRequest<DiscordGuild>(
    token,
    "GET",
    `/guilds/${channel.guild_id}`,
  );
  return {
    guildId: channel.guild_id,
    guildName: guild.name,
    channelId: channel.id,
    channelName: channel.name ?? channel.id,
  };
}

export async function postDiscordMessage(
  token: string,
  channelId: string,
  content: string,
): Promise<void> {
  await discordRequest(token, "POST", `/channels/${channelId}/messages`, {
    content,
  });
}
