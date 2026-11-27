import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from "livekit-server-sdk";

export type MediaSource = "camera" | "microphone" | "screen_share" | "screen_share_audio";

export type TokenRequest = {
  room: string;
  identity: string;
  name: string;
  ttlSeconds: number;
  sources: MediaSource[];
};

export type LiveKitEvent = {
  id: string;
  event: string;
  room?: string;
  identity?: string;
  createdAt: number;
};

/** The slice of LiveKit the app uses, so tests can run without a media server. */
export interface LiveKitApi {
  url: string;
  token(req: TokenRequest): Promise<string>;
  createRoom(room: string, maxParticipants: number): Promise<void>;
  deleteRoom(room: string): Promise<void>;
  removeParticipant(room: string, identity: string): Promise<void>;
  /** Mutes (never unmutes) the participant's published tracks of the given source. */
  mute(room: string, identity: string, source: "camera" | "microphone"): Promise<void>;
  setSources(room: string, identity: string, sources: MediaSource[]): Promise<void>;
  receiveWebhook(body: string, authorization: string | undefined): Promise<LiveKitEvent>;
}

const SOURCE: Record<MediaSource, TrackSource> = {
  camera: TrackSource.CAMERA,
  microphone: TrackSource.MICROPHONE,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

export class LiveKitCloud implements LiveKitApi {
  private rooms: RoomServiceClient;
  private webhooks: WebhookReceiver;
  constructor(private opts: { url: string; apiKey: string; apiSecret: string }) {
    this.url = opts.url;
    this.rooms = new RoomServiceClient(opts.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), opts.apiKey, opts.apiSecret);
    this.webhooks = new WebhookReceiver(opts.apiKey, opts.apiSecret);
  }
  url: string;

  async token(req: TokenRequest) {
    const at = new AccessToken(this.opts.apiKey, this.opts.apiSecret, {
      identity: req.identity,
      name: req.name,
      ttl: req.ttlSeconds,
    });
    at.addGrant({
      room: req.room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: req.sources.length > 0,
      canPublishSources: req.sources.map((s) => SOURCE[s]),
      canPublishData: true,
      canUpdateOwnMetadata: false,
      roomCreate: false,
      roomAdmin: false,
      roomRecord: false,
    });
    return at.toJwt();
  }

  async createRoom(room: string, maxParticipants: number) {
    // The media server enforces the same cap as the database, so a leaked token cannot add an 11th person.
    await this.rooms.createRoom({ name: room, maxParticipants, emptyTimeout: 600, departureTimeout: 30 });
  }

  async deleteRoom(room: string) {
    await this.rooms.deleteRoom(room).catch(() => undefined);
  }

  async removeParticipant(room: string, identity: string) {
    await this.rooms.removeParticipant(room, identity).catch(() => undefined);
  }

  async mute(room: string, identity: string, source: "camera" | "microphone") {
    const p = await this.rooms.getParticipant(room, identity).catch(() => null);
    if (!p) return;
    for (const t of p.tracks) {
      if (t.source === SOURCE[source] && !t.muted) await this.rooms.mutePublishedTrack(room, identity, t.sid, true);
    }
  }

  async setSources(room: string, identity: string, sources: MediaSource[]) {
    await this.rooms
      .updateParticipant(room, identity, {
        permission: {
          canSubscribe: true,
          canPublish: sources.length > 0,
          canPublishSources: sources.map((s) => SOURCE[s]),
          canPublishData: true,
        },
      })
      .catch(() => undefined);
  }

  async receiveWebhook(body: string, authorization: string | undefined) {
    const e = await this.webhooks.receive(body, authorization);
    return {
      id: e.id,
      event: e.event,
      room: e.room?.name,
      identity: e.participant?.identity,
      createdAt: Number(e.createdAt) * 1000,
    };
  }
}

/** Test double that records calls. */
export class FakeLiveKit implements LiveKitApi {
  url = "wss://fake.livekit.test";
  calls: { op: string; args: unknown[] }[] = [];
  async token(req: TokenRequest) {
    this.calls.push({ op: "token", args: [req] });
    return `fake.${Buffer.from(JSON.stringify(req)).toString("base64url")}`;
  }
  async createRoom(room: string, max: number) {
    this.calls.push({ op: "createRoom", args: [room, max] });
  }
  async deleteRoom(room: string) {
    this.calls.push({ op: "deleteRoom", args: [room] });
  }
  async removeParticipant(room: string, identity: string) {
    this.calls.push({ op: "removeParticipant", args: [room, identity] });
  }
  async mute(room: string, identity: string, source: string) {
    this.calls.push({ op: "mute", args: [room, identity, source] });
  }
  async setSources(room: string, identity: string, sources: MediaSource[]) {
    this.calls.push({ op: "setSources", args: [room, identity, sources] });
  }
  async receiveWebhook(body: string, authorization: string | undefined) {
    if (authorization !== "valid") throw new Error("bad signature");
    return JSON.parse(body) as LiveKitEvent;
  }
}
