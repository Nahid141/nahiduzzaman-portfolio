import { Algorithm, hash, verify } from "@node-rs/argon2";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";

/* Argon2id with the OWASP minimum profile (m=19 MiB, t=2, p=1). */
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** A precomputed hash so failed lookups cost the same time as real verifications. */
let dummyHash: Promise<string> | null = null;

export const hashPassword = (password: string) => hash(password, ARGON);

export async function verifyPassword(hashValue: string | null | undefined, password: string): Promise<boolean> {
  if (!hashValue) {
    dummyHash ??= hash("timing-equalizer-not-a-password", ARGON);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(hashValue, password).catch(() => false);
}

/** 32 random bytes, base64url: used for session, verification, reset and MFA tickets. */
export const randomToken = () => randomBytes(32).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM; output = base64(iv | tag | ciphertext). */
export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(key: Buffer, payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/* ---------------------------------- TOTP --------------------------------- */

export const generateTotpSecret = () => generateSecret({ length: 20 });

export const totpUri = (username: string, secret: string) =>
  generateURI({ issuer: "Private Connect", label: username, secret });

/** RFC 6238, 30 s steps, accepts one step of clock drift either side. */
export function verifyTotp(secret: string, code: string, now: Date): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = verifySync({ secret, token: code, epoch: Math.floor(now.getTime() / 1000), epochTolerance: 30 });
    return Boolean((result as { valid?: boolean }).valid);
  } catch {
    return false;
  }
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ten single-use recovery codes, `xxxx-xxxx`, from an unambiguous alphabet. */
export function generateRecoveryCodes(count = 10): string[] {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return Array.from({ length: count }, () => `${part()}-${part()}`);
}

export const normalizeRecoveryCode = (code: string) => code.trim().toLowerCase().replace(/\s+/g, "");
