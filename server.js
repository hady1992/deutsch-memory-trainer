import crypto from "crypto";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_COOKIE = "dmt_admin_session";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const distPath = path.join(__dirname, "dist");
const adminSessions = new Map();
const loginAttempts = new Map();

app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function secureEqual(left, right) {
  const leftDigest = crypto.createHash("sha256").update(String(left ?? ""), "utf8").digest();
  const rightDigest = crypto.createHash("sha256").update(String(right ?? ""), "utf8").digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((result, pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return result;
    const key = decodeURIComponent(pair.slice(0, index).trim());
    const value = decodeURIComponent(pair.slice(index + 1).trim());
    if (key) result[key] = value;
    return result;
  }, {});
}

function isSecureRequest(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return req.secure || forwarded === "https";
}

function adminCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(req),
    maxAge: ADMIN_SESSION_TTL_MS,
    path: "/",
  };
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions) {
    if (!session || session.expiresAt <= now) adminSessions.delete(token);
  }
}

function getAdminSession(req) {
  clearExpiredSessions();
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function configuredAdminCredentials() {
  const username = String(process.env.ADMIN_USERNAME || "").trim();
  const passwordHash = String(process.env.ADMIN_PASSWORD_SHA256 || "").trim().toLowerCase();
  const fallbackPassword = String(process.env.ADMIN_PASSWORD || "");
  return {
    username,
    passwordHash: passwordHash || (fallbackPassword ? sha256(fallbackPassword) : ""),
  };
}

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function attemptState(req) {
  const key = clientKey(req);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + ADMIN_ATTEMPT_WINDOW_MS };
    loginAttempts.set(key, fresh);
    return { key, state: fresh };
  }
  return { key, state: current };
}

app.get("/api/admin/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  const session = getAdminSession(req);
  res.json({
    authenticated: Boolean(session),
    username: session?.username || null,
  });
});

app.post("/api/admin/login", (req, res) => {
  res.set("Cache-Control", "no-store");
  const credentials = configuredAdminCredentials();
  if (!credentials.username || !credentials.passwordHash) {
    return res.status(503).json({
      authenticated: false,
      error: "Admin access is not configured on the server.",
    });
  }

  const { key, state } = attemptState(req);
  if (state.count >= ADMIN_MAX_ATTEMPTS) {
    return res.status(429).json({
      authenticated: false,
      error: "Too many login attempts. Try again later.",
    });
  }

  const username = String(req.body?.username || "").trim();
  const passwordHash = sha256(String(req.body?.password || ""));
  const valid =
    secureEqual(username, credentials.username) &&
    secureEqual(passwordHash, credentials.passwordHash);

  if (!valid) {
    state.count += 1;
    loginAttempts.set(key, state);
    return res.status(401).json({
      authenticated: false,
      error: "Invalid administrator credentials.",
    });
  }

  loginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, {
    username: credentials.username,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
  res.cookie(ADMIN_COOKIE, token, adminCookieOptions(req));
  return res.json({ authenticated: true, username: credentials.username });
});

app.post("/api/admin/logout", (req, res) => {
  res.set("Cache-Control", "no-store");
  const session = getAdminSession(req);
  if (session?.token) adminSessions.delete(session.token);
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(req),
    path: "/",
  });
  res.json({ authenticated: false });
});

app.use(
  "/assets",
  express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  })
);

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Deutsch Memory Trainer running on port ${PORT}`);
});
