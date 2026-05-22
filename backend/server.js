import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { initializeApp, cert } from "firebase-admin/app";
import { readFileSync, existsSync } from "fs";
import authRoutes from "./auth/routes.js";

// ── Firebase Admin SDK init ─────────────────────────────────────────
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
let initialized = false;

try {
  if (serviceAccountPath && existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
    initializeApp({ credential: cert(serviceAccount) });
    initialized = true;
    console.log("✓ Firebase Admin initialized");
  } else if (process.env.FIREBASE_PROJECT_ID) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    initialized = true;
    console.log("✓ Firebase Admin initialized with environment variables.");
  } else {
    console.warn(
      "⚠  Warning: No Firebase credentials found. Running in offline/development mode. Calls to verify token will fail until service account is configured."
    );
  }
} catch (err) {
  console.error("⚠  Firebase Admin Initialization Error:", err.message);
}



// ======= Express App Setup =======


const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet());

// CORS — allow local frontend dev origins and custom frontend URL
const frontendOrigin = process.env.FRONTEND_URL || [/^http:\/\/localhost(:\d+)?$/];
app.use(
  cors({
    origin: frontendOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "16kb" }));

app.use((req, res, next) => {
  req.firebaseInitialized = initialized;
  next();
});

app.use("/auth", authRoutes);

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "icpc-hackathon-auth",
    firebaseConfigured: initialized,
  });
});

app.listen(PORT, () => {
  console.log(`✓ Auth server running on http://localhost:${PORT}`);
});
