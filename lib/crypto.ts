// Web Crypto PBKDF2 Password Hashing and Roblox Public Profile Fetcher
// Fully compatible with Cloudflare Workers / Edge Runtime

export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function hashPassword(
  password: string,
  saltHex?: string
): Promise<{ hashHex: string; saltHex: string }> {
  const salt = saltHex ? hexToBuffer(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-512",
    },
    passwordKey,
    512
  );

  return {
    hashHex: bufferToHex(derivedBits),
    saltHex: saltHex || bufferToHex(salt),
  };
}

export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string
): Promise<boolean> {
  try {
    const { hashHex: computedHash } = await hashPassword(password, saltHex);
    if (computedHash.length !== hashHex.length) return false;

    // Constant-time string comparison to mitigate timing attacks
    let mismatch = 0;
    for (let i = 0; i < hashHex.length; i++) {
      mismatch |= computedHash.charCodeAt(i) ^ hashHex.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

export function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const getChunk = (len: number) => {
    const randomVals = new Uint8Array(len);
    crypto.getRandomValues(randomVals);
    return Array.from(randomVals)
      .map((val) => chars[val % chars.length])
      .join("");
  };

  return `ftn-${getChunk(4)}-${getChunk(4)}-${getChunk(4)}`;
}

export async function fetchRobloxPublicProfile(username: string): Promise<{
  robloxId: string | null;
  robloxUsername: string;
  displayName: string;
  avatarUrl: string | null;
}> {
  const cleanUsername = username.trim();
  try {
    // 1. Resolve Roblox ID & Display Name
    const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [cleanUsername],
        excludeBannedUsers: false,
      }),
    });

    if (!userRes.ok) {
      return {
        robloxId: null,
        robloxUsername: cleanUsername,
        displayName: cleanUsername,
        avatarUrl: null,
      };
    }

    const userData = (await userRes.json()) as any;
    if (!userData?.data || userData.data.length === 0) {
      return {
        robloxId: null,
        robloxUsername: cleanUsername,
        displayName: cleanUsername,
        avatarUrl: null,
      };
    }

    const robloxUser = userData.data[0];
    const robloxId = String(robloxUser.id);
    const robloxUsername = robloxUser.name || cleanUsername;
    const displayName = robloxUser.displayName || robloxUsername;

    // 2. Fetch Avatar Headshot Thumbnail
    let avatarUrl: string | null = null;
    try {
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`
      );
      if (thumbRes.ok) {
        const thumbData = (await thumbRes.json()) as any;
        if (thumbData?.data && thumbData.data.length > 0) {
          avatarUrl = thumbData.data[0].imageUrl || null;
        }
      }
    } catch {
      // Non-fatal thumbnail fallback
    }

    return {
      robloxId,
      robloxUsername,
      displayName,
      avatarUrl,
    };
  } catch {
    return {
      robloxId: null,
      robloxUsername: cleanUsername,
      displayName: cleanUsername,
      avatarUrl: null,
    };
  }
}
