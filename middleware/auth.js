// middlewares/auth.js
import jwt from "jsonwebtoken";
import admin from "firebase-admin";

const JWT_SECRET = process.env.JWT_SECRET || "diveHRZN_@_secret_key_2025";

// Pre-parse admin email list once
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || "")
  .split("|")
  .map((email) => email.trim())
  .filter(Boolean);

// --- Helpers ---------------------------------------------------

const getAuthHeader = (req) => req.headers.authorization || "";

const getSchemeAndToken = (authHeader) => {
  const [scheme, token] = authHeader.split(" ");
  return { scheme, token };
};

const signUserJwt = (payload, options = {}) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "7d", ...options });

export const verifyUserJwt = (token) => jwt.verify(token, JWT_SECRET);

const isAdminEmail = (email) =>
  !!email && ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(email);

// --- Normal user authorization --------------------------------

export const authorization = async (req, res, next) => {
  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header missing" });
    }

    const { scheme, token } = getSchemeAndToken(authHeader);

    // Case 1: Firebase token => "G-Bearer <firebaseIdToken>"
    if (scheme === "G-Bearer") {
      const decoded = await admin.auth().verifyIdToken(token);

      req.user = decoded;

      // Create & attach your own signed JWT (valid 7 days)
      const customToken = signUserJwt({
        email: decoded.email,
        uid: decoded.uid,
      });

      req.token = customToken;
      return next();
    }

    // Case 2: Your own JWT => "Bearer <token>"
    if (scheme === "Bearer") {
      const verified = verifyUserJwt(token);
      console.log("🚀 ~ authorization ~ verified:", verified)

      req.user = verified;
      req.token = token;
      return next();
    }

    return res.status(401).json({ error: "Invalid Authorization prefix" });
  } catch (err) {
    console.error("Authorization failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// --- Admin-only authorization ----------------------------------

export const adminAuth = async (req, res, next) => {
  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const { scheme, token } = getSchemeAndToken(authHeader);

    // Case 1: Firebase token => "G-Bearer <firebaseIdToken>"
    if (scheme === "G-Bearer") {
      const decoded = await admin.auth().verifyIdToken(token);

      if (!isAdminEmail(decoded.email)) {
        return res.status(401).json({ error: "no admin access" });
      }

      // Create your own admin JWT (shorter expiry if you want)
      const customToken = signUserJwt(
        {
          email: decoded.email,
          uid: decoded.uid,
          role: "admin",
        },
        { expiresIn: "1d" }
      );

      req.user = { ...decoded, role: "admin" };
      req.token = customToken;
      return next();
    }

    // Case 2: Your own JWT => "Bearer <yourJwt>"
    if (scheme === "Bearer") {
      let verified;
      try {
        verified = verifyUserJwt(token);
      } catch (err) {
        console.error("JWT verify failed:", err);
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      if (!isAdminEmail(verified.email)) {
        return res.status(401).json({ error: "no admin access" });
      }

      req.user = verified;
      req.token = token;
      return next();
    }

    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  } catch (err) {
    console.error("Admin auth failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
