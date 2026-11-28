/* Private object storage. The backend holds the only credential; browsers get short-lived signed URLs. */

export interface FileStore {
  /** A one-off URL the browser PUTs the bytes to. Supabase signed upload URLs last two hours. */
  signedUploadUrl(path: string): Promise<string>;
  /** Streams the stored object, or null when it does not exist. */
  open(path: string): Promise<AsyncIterable<Uint8Array> | null>;
  /** A read URL valid for `expiresIn` seconds; `downloadName` forces an attachment download. */
  signedDownloadUrl(path: string, expiresIn: number, downloadName?: string): Promise<string>;
  remove(paths: string[]): Promise<void>;
}

/** Test and local-development double. */
export class MemoryFileStore implements FileStore {
  objects = new Map<string, Buffer>();
  removed: string[] = [];
  async signedUploadUrl(path: string) {
    return `memory://upload/${path}`;
  }
  async open(path: string) {
    const b = this.objects.get(path);
    if (!b) return null;
    return (async function* () {
      for (let i = 0; i < b.length; i += 64 * 1024) yield b.subarray(i, i + 64 * 1024);
    })();
  }
  async signedDownloadUrl(path: string, expiresIn: number, downloadName?: string) {
    return `memory://download/${path}?expires=${expiresIn}${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ""}`;
  }
  async remove(paths: string[]) {
    for (const p of paths) {
      this.objects.delete(p);
      this.removed.push(p);
    }
  }
}

export class StorageError extends Error {}

/** Supabase Storage REST API, called with a secret (service role) key that never leaves the server. */
export class SupabaseFileStore implements FileStore {
  private base: string;
  constructor(
    private opts: { url: string; secretKey: string; bucket: string },
    private fetchImpl: typeof fetch = fetch
  ) {
    this.base = `${opts.url}/storage/v1`;
  }

  private headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { apikey: this.opts.secretKey, ...extra };
    // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys must not.
    if (this.opts.secretKey.startsWith("eyJ")) h.authorization = `Bearer ${this.opts.secretKey}`;
    return h;
  }

  private objectPath(path: string) {
    return `${this.opts.bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async call(method: string, url: string, body?: unknown) {
    const res = await this.fetchImpl(url, {
      method,
      headers: this.headers(body === undefined ? {} : { "content-type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return res;
  }

  async signedUploadUrl(path: string) {
    const res = await this.call("POST", `${this.base}/object/upload/sign/${this.objectPath(path)}`, {});
    if (!res.ok) throw new StorageError(`storage sign-upload ${res.status}`);
    const { url } = (await res.json()) as { url: string };
    return `${this.base}${url}`;
  }

  async open(path: string) {
    const res = await this.fetchImpl(`${this.base}/object/authenticated/${this.objectPath(path)}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok || !res.body) throw new StorageError(`storage read ${res.status}`);
    return res.body as unknown as AsyncIterable<Uint8Array>;
  }

  async signedDownloadUrl(path: string, expiresIn: number, downloadName?: string) {
    const res = await this.call("POST", `${this.base}/object/sign/${this.objectPath(path)}`, { expiresIn });
    if (!res.ok) throw new StorageError(`storage sign ${res.status}`);
    const { signedURL } = (await res.json()) as { signedURL: string };
    const url = new URL(`${this.base}${signedURL}`);
    if (downloadName !== undefined) url.searchParams.set("download", downloadName);
    return url.toString();
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const res = await this.call("DELETE", `${this.base}/object/${this.opts.bucket}`, { prefixes: paths });
    if (!res.ok) throw new StorageError(`storage delete ${res.status}`);
  }

  /** Creates or updates the private bucket with size and type limits. Idempotent. */
  async ensureBucket(limits: { fileSizeLimit: number; allowedMimeTypes: string[] }) {
    const body = {
      id: this.opts.bucket,
      name: this.opts.bucket,
      public: false,
      file_size_limit: limits.fileSizeLimit,
      allowed_mime_types: limits.allowedMimeTypes,
    };
    const existing = await this.call("GET", `${this.base}/bucket/${this.opts.bucket}`);
    const res = existing.ok
      ? await this.call("PUT", `${this.base}/bucket/${this.opts.bucket}`, body)
      : await this.call("POST", `${this.base}/bucket`, body);
    if (!res.ok) throw new StorageError(`storage bucket ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const check = await this.call("GET", `${this.base}/bucket/${this.opts.bucket}`);
    const info = (await check.json()) as { public: boolean; file_size_limit: number | null; allowed_mime_types: string[] | null };
    if (info.public) throw new StorageError("bucket is public; refusing to continue");
    return info;
  }
}
