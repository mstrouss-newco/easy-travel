// easy. points alert agent
// Searches for transfer bonuses + Flying Blue promos daily, sends digest email
// Requires: ANTHROPIC_API_KEY, RESEND_API_KEY, ALERT_EMAIL env vars

const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const ALERT_EMAIL = process.env.ALERT_EMAIL || "mike@example.com";

// ── Watched routes — edit this list to match what you care about ──────────
const WATCHED_ROUTES = [
  { from: "LAX", to: "Paris", programs: ["Flying Blue", "Chase UR", "Amex MR"] },
  { from: "LAX", to: "Tokyo", programs: ["ANA Mileage Club", "Chase UR", "Amex MR"] },
  { from: "LAX", to: "Maldives", programs: ["Flying Blue", "Amex MR"] },
  { from: "LAX", to: "Bali", programs: ["Flying Blue", "Amex MR", "Singapore KrisFlyer"] },
  { from: "LAX", to: "Rome", programs: ["Flying Blue", "Chase UR", "Avios"] },
  { from: "LAX", to: "London", programs: ["Avios", "Flying Blue", "Chase UR"] },
  { from: "LAX", to: "Bangkok", programs: ["Flying Blue", "Amex MR", "Singapore KrisFlyer"] },
];
