// easy. points alert agent
// Searches for transfer bonuses + all airline promos daily, sends digest email
// Requires: ANTHROPIC_API_KEY, RESEND_API_KEY, ALERT_EMAIL env vars

const Anthropic = require("@anthropic-ai/sdk");
const { Resend } = require("resend");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const ALERT_EMAIL = process.env.ALERT_EMAIL || "mike@example.com";

// Edit this list to match the routes you care about
const WATCHED_ROUTES = [
  { from: "LAX", to: "Paris",    programs: ["Flying Blue", "Chase UR", "Amex MR"] },
  { from: "LAX", to: "Tokyo",    programs: ["ANA Mileage Club", "Chase UR", "Amex MR"] },
  { from: "LAX", to: "Maldives", programs: ["Flying Blue", "Amex MR"] },
  { from: "LAX", to: "Bali",     programs: ["Flying Blue", "Amex MR", "Singapore KrisFlyer"] },
  { from: "LAX", to: "Rome",     programs: ["Flying Blue", "Chase UR", "Avios"] },
  { from: "LAX", to: "London",   programs: ["Avios", "Flying Blue", "Chase UR"] },
  { from: "LAX", to: "Bangkok",  programs: ["Flying Blue", "Amex MR", "Singapore KrisFlyer"] },
];

async function runAgent() {
  console.log("[" + new Date().toISOString() + "] Starting easy. points alert agent");
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const routeSummary = WATCHED_ROUTES.map(r => r.from + " to " + r.to).join(", ");

  const prompt = "Today is " + today + ". You are a travel points researcher for easy., a travel rewards app.\n\nSearch the web for the following. Only report VERIFIED, CURRENT deals.\n\nTASK 1 - TRANSFER BONUSES: Search for active credit card point transfer bonuses from Chase Ultimate Rewards, Amex Membership Rewards, Capital One Miles, and Citi ThankYou. Report bonus %, partner, expiry.\n\nTASK 2 - AIRLINE PROMO AWARDS: Search ALL loyalty programs for discounted award pricing - Flying Blue monthly promos, United saver sales, Delta flash sales, American promo awards, Avios sales, Aeroplan, KrisFlyer, ANA, Emirates, Virgin Atlantic.\n\nTASK 3 - BUSINESS CLASS ALERTS: Search TPG, OMAAT, Doctor of Credit, FlyerTalk for award availability or pricing deals for business class on these routes: " + routeSummary + ". Include all airlines and partner booking opportunities.\n\nTASK 4 - ELEVATED SIGN-UP BONUSES: Any cards with higher than usual sign-up bonuses right now (Chase Sapphire, Amex Platinum/Gold, Capital One Venture X, Citi Strata).\n\nRespond ONLY with JSON:\n{\n  \"date\": \"" + today + "\",\n  \"transfer_bonuses\": [{\n    \"program\": \"Chase UR\",\n    \"partner\": \"airline name\",\n    \"bonus_pct\": 30,\n    \"expires\": \"date or unknown\",\n    \"headline\": \"one sentence\",\n    \"source\": \"url\",\n    \"relevance_to_routes\": [\"LAX to Paris\"]\n  }],\n  \"airline_promos\": [{\n    \"program\": \"Flying Blue\",\n    \"airline\": \"Air France\",\n    \"route\": \"LAX to Paris\",\n    \"cabin\": \"Business\",\n    \"promo_points\": 50000,\n    \"standard_points\": 87500,\n    \"savings_pct\": 43,\n    \"valid_through\": \"end of month\",\n    \"headline\": \"one sentence\"\n  }],\n  \"business_class_alerts\": [{\n    \"route\": \"LAX to Tokyo\",\n    \"airline\": \"ANA\",\n    \"booking_program\": \"United MileagePlus\",\n    \"note\": \"what makes this notable\",\n    \"source\": \"url\"\n  }],\n  \"elevated_bonuses\": [{\n    \"card\": \"Card name\",\n    \"current_offer\": \"175000 points\",\n    \"typical_offer\": \"100000 points\",\n    \"expires\": \"date or unknown\",\n    \"apply_link\": \"url\"\n  }],\n  \"nothing_found\": false,\n  \"agent_notes\": \"any caveats\"\n}";

  let findings;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    findings = JSON.parse(match[0]);
    console.log("Transfer bonuses:", findings.transfer_bonuses?.length || 0);
    console.log("Airline promos:", findings.airline_promos?.length || 0);
    console.log("Business class alerts:", findings.business_class_alerts?.length || 0);
    console.log("Elevated bonuses:", findings.elevated_bonuses?.length || 0);
  } catch (err) {
    console.error("Search failed:", err.message);
    findings = { date: today, transfer_bonuses: [], airline_promos: [], business_class_alerts: [], elevated_bonuses: [], nothing_found: true, agent_notes: err.message };
  }

  const hasAnything = !findings.nothing_found && (
    findings.transfer_bonuses?.length > 0 ||
    findings.airline_promos?.length > 0 ||
    findings.business_class_alerts?.length > 0 ||
    findings.elevated_bonuses?.length > 0
  );

  if (!hasAnything) { console.log("Nothing found today. Skipping email."); return; }

  const subject = buildSubject(findings);
  const html = buildEmailHtml(findings);

  const { data, error } = await resend.emails.send({
    from: "easy. alerts <alerts@yourdomain.com>",
    to: ALERT_EMAIL,
    subject,
    html,
  });
  if (error) throw new Error(JSON.stringify(error));
  console.log("Email sent:", data.id);
}

function buildSubject(f) {
  const parts = [];
  if (f.transfer_bonuses?.length > 0) parts.push(f.transfer_bonuses[0].bonus_pct + "% " + f.transfer_bonuses[0].partner + " bonus");
  if (f.airline_promos?.length > 0) parts.push(f.airline_promos[0].program + " promo - " + f.airline_promos[0].route);
  if (f.elevated_bonuses?.length > 0) parts.push(f.elevated_bonuses[0].card + " elevated offer");
  return parts.length > 0 ? "easy. - " + parts.slice(0,2).join(" / ") : "easy. daily points alert - " + f.date;
}

function buildEmailHtml(f) {
  let sections = "";
  
  if (f.transfer_bonuses?.length > 0) {
    sections += "<h2 style=\"font-size:11px;color:#8a8a8a;letter-spacing:.1em;text-transform:uppercase;margin:0 0 16px;\">Transfer Bonuses</h2>";
    f.transfer_bonuses.forEach(b => {
      sections += "<div style=\"padding:12px 0;border-bottom:1px solid #eee;\">";
      sections += "<div style=\"font-size:15px;font-weight:600;\">" + b.program + " to " + b.partner + "</div>";
      sections += "<div style=\"font-size:13px;color:#525252;margin:4px 0;\">" + b.headline + "</div>";
      sections += "<span style=\"background:#e8f5eb;color:#1e6b2e;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;\">+" + b.bonus_pct + "% bonus</span>";
      if (b.expires && b.expires !== "unknown") sections += " <span style=\"background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-size:12px;\">Expires " + b.expires + "</span>";
      sections += "</div>";
    });
  }
  
  if (f.airline_promos?.length > 0) {
    sections += "<h2 style=\"font-size:11px;color:#8a8a8a;letter-spacing:.1em;text-transform:uppercase;margin:24px 0 16px;\">Airline Promo Awards</h2>";
    f.airline_promos.forEach(p => {
      sections += "<div style=\"padding:12px 0;border-bottom:1px solid #eee;\">";
      sections += "<span style=\"background:#e6f0fa;color:#0057a8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;\">" + p.program + "</span>";
      sections += "<div style=\"font-size:15px;font-weight:600;margin-top:6px;\">" + p.route + " - " + p.cabin + "</div>";
      sections += "<div style=\"font-size:13px;color:#525252;margin:4px 0;\">" + p.headline + "</div>";
      sections += "<span style=\"font-size:18px;font-weight:700;color:#1e6b2e;\">" + (p.promo_points||0).toLocaleString() + " pts</span>";
      sections += " <span style=\"font-size:13px;color:#8a8a8a;text-decoration:line-through;\">" + (p.standard_points||0).toLocaleString() + "</span>";
      sections += " <span style=\"background:#e8f5eb;color:#1e6b2e;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;\">" + p.savings_pct + "% off</span>";
      sections += "</div>";
    });
  }
  
  if (f.business_class_alerts?.length > 0) {
    sections += "<h2 style=\"font-size:11px;color:#8a8a8a;letter-spacing:.1em;text-transform:uppercase;margin:24px 0 16px;\">Business Class Alerts</h2>";
    f.business_class_alerts.forEach(a => {
      sections += "<div style=\"padding:12px 0;border-bottom:1px solid #eee;\">";
      sections += "<div style=\"font-size:15px;font-weight:600;\">" + a.route + " - " + a.airline + "</div>";
      if (a.booking_program) sections += "<span style=\"background:#f4f4f2;color:#525252;padding:2px 8px;border-radius:20px;font-size:11px;\">Book via " + a.booking_program + "</span>";
      sections += "<div style=\"font-size:13px;color:#525252;margin-top:6px;\">" + a.note + "</div>";
      sections += "</div>";
    });
  }
  
  if (f.elevated_bonuses?.length > 0) {
    sections += "<h2 style=\"font-size:11px;color:#8a8a8a;letter-spacing:.1em;text-transform:uppercase;margin:24px 0 16px;\">Elevated Sign-Up Bonuses</h2>";
    f.elevated_bonuses.forEach(b => {
      sections += "<div style=\"padding:12px 0;border-bottom:1px solid #eee;\">";
      sections += "<div style=\"font-size:15px;font-weight:600;\">" + b.card + "</div>";
      sections += "<span style=\"font-size:16px;font-weight:700;color:#1e6b2e;\">" + b.current_offer + "</span>";
      sections += " <span style=\"font-size:13px;color:#8a8a8a;\">vs. " + b.typical_offer + " typical</span>";
      if (b.expires && b.expires !== "unknown") sections += "<div style=\"font-size:12px;color:#b06010;margin-top:4px;\">Expires " + b.expires + "</div>";
      if (b.apply_link) sections += "<div style=\"margin-top:8px;\"><a href=\"" + b.apply_link + "\" style=\"background:#0f0f0f;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;text-decoration:none;\">Apply now</a></div>";
      sections += "</div>";
    });
  }

  return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head><body style=\"font-family:-apple-system,sans-serif;background:#f2f1ed;margin:0;padding:24px 16px;\"><div style=\"max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;\"><div style=\"background:#0f0f0f;padding:24px 28px;\"><div style=\"font-size:24px;font-weight:400;color:#fff;font-family:Georgia,serif;\">easy.</div><div style=\"font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;\">Daily points alert - " + f.date + "</div></div><div style=\"padding:28px;\">" + sections + (f.agent_notes ? "<div style=\"background:#f4f4f2;padding:12px;border-radius:8px;margin-top:16px;font-size:12px;color:#525252;\">" + f.agent_notes + "</div>" : "") + "</div><div style=\"padding:16px 28px;border-top:1px solid #eee;background:#fafaf8;font-size:11px;color:#8a8a8a;\">Watching: " + WATCHED_ROUTES.map(r => r.from + " to " + r.to).join(" / ") + "<br>Always verify before booking.</div></div></body></html>";
}

runAgent().catch(err => { console.error("Fatal:", err); process.exit(1); });
