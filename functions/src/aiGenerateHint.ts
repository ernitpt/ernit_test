// ✅ Firebase Functions v2 version
import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

type HintStyle = "neutral" | "personalized" | "motivational";

// 🔹 Define your secrets once (top-level)
const OPENROUTER_KEY = defineSecret("OPENROUTER_KEY");
const OPENROUTER_MODEL = defineSecret("OPENROUTER_MODEL");
// const OPENAI_KEY = defineSecret("OPENAI_KEY");
// const OPENAI_MODEL = defineSecret("OPENAI_MODEL");
const LLM_PROVIDER = defineSecret("LLM_PROVIDER");

// ------------------------------------------------------
// Utility functions
// ------------------------------------------------------

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function difficultyBand(progress: number) {
  if (progress <= 0.2) return "vague";
  if (progress <= 0.6) return "thematic";
  if (progress <= 0.9) return "strong";
  return "finale";
}

function buildUserPrompt({
  experienceType,
  experienceDescription,
  experienceCategory,
  experienceSubtitle,
  sessionNumber,
  totalSessions,
  userName,
  style,
  previousHints = [], // Add default value here
}: {
  experienceType: string;
  experienceDescription?: string;
  experienceCategory?: string;
  experienceSubtitle?: string;
  sessionNumber: number;
  totalSessions: number;
  userName?: string | null;
  style: HintStyle;
  previousHints?: string[];
}) {
  const progress = clamp01(sessionNumber / totalSessions);
  const band = difficultyBand(progress);
  const name = userName?.trim() || "friend";

  // Casual, grounded examples (not poetic!)
  const styleExamples = {
    neutral: {
      good: "Comfortable shoes recommended. You'll see why.",
      bad: "You're going to the climbing gym on 5th Street.",
    },
    personalized: {
      good: `${name}, hope you're ready for something totally different.`,
      bad: `${name}, you're going rock climbing.`,
    },
    motivational: {
      good: `You've been crushing it, ${name}! Time to celebrate properly.`,
      bad: `Great job ${name}, you're going out to dinner.`,
    },
  };

  const difficultyExamples = {
    vague: "Get ready to feel like a kid again.",
    thematic: "Bring your appetite. You're gonna need it.",
    strong: "Ever wondered what it's like to see things from a totally new perspective?",
    finale: `${name}, get ready for a tasting experience you won't forget.`,
  };

  const currentExample = difficultyExamples[band as keyof typeof difficultyExamples];
  const styleExample = styleExamples[style];

  const promptParts = [
    `Create ONE subtle hint for a surprise ${experienceType} experience.`,
    ``,
    `CRITICAL RULES:`,
    `❌ NEVER mention: brand names, business names, addresses, "you're going to", "will be", "located at"`,
    `❌ NO poetic/mystical language: Avoid "imagine", "picture yourself", "await", "journey"`,
    `❌ FORBIDDEN WORDS FOR THIS EXPERIENCE TYPE:`,
    getForbiddenWords(experienceType, band),
    `✅ BE CASUAL: Talk like you're texting a friend. Keep it real and conversational.`,
    `✅ BE SUBTLE: Don't give away too much. Make them curious, not informed.`,
  ];

  // 🚫 ADD ANTI-REPETITION SECTION
  if (previousHints && previousHints.length > 0) {
    promptParts.push('');
    promptParts.push('🚫 AVOID REPETITION - CRITICAL!');
    promptParts.push('Previous hints for this goal (DO NOT repeat themes, items, advice, or similar wording):');
    previousHints.forEach((hint: string, i: number) => {
      promptParts.push(`  ${i + 1}. "${hint}"`);
    });
    promptParts.push('');
    promptParts.push('✅ Your hint MUST be DIFFERENT from the above:');
    promptParts.push('   - Use a completely different angle or theme');
    promptParts.push('   - Mention different items/preparation if applicable');
    promptParts.push('   - Vary the tone and focus area');
    promptParts.push('   - If previous hints mentioned physical items, try emotional/mental prep instead');
  }

  promptParts.push('');
  promptParts.push(`Difficulty Level: ${band.toUpperCase()} (Session ${sessionNumber}/${totalSessions} = ${Math.round(progress * 100)}%)`);
  promptParts.push('');
  promptParts.push(`📊 How subtle to be:`);
  promptParts.push(`- VAGUE (0-20%): ZERO activity clues. Talk about feelings, preparation, or vibes ONLY.`);
  promptParts.push(`  ⚠️ DO NOT mention: the activity type, equipment, what they'll do, or where they'll be`);
  promptParts.push(`  Example: "${difficultyExamples.vague}"`);
  promptParts.push(``);
  promptParts.push(`- THEMATIC (21-60%): Hint at sensations or what to bring. NO direct activity mentions.`);
  promptParts.push(`  ⚠️ Still avoid: activity names, specific equipment, exact actions`);
  promptParts.push(`  Example: "${difficultyExamples.thematic}"`);
  promptParts.push(``);
  promptParts.push(`- STRONG (61-90%): Suggest activity category vaguely. Still NO specific names.`);
  promptParts.push(`  Example: "${difficultyExamples.strong}"`);
  promptParts.push(``);
  promptParts.push(`- FINALE (91-100%): Clear about activity type, still mysterious about location.`);
  promptParts.push(`  Example: "${difficultyExamples.finale}"`);
  promptParts.push(``);
  promptParts.push(`🎨 Style: ${style.toUpperCase()}`);
  promptParts.push(
    style === "neutral"
      ? "- Be casual, third-person. No names."
      : `- Use "${name}" naturally in the hint`
  );
  promptParts.push(
    style === "motivational"
      ? "- Be hyped and encouraging!"
      : style === "personalized"
        ? "- Keep it warm but casual"
        : ""
  );
  promptParts.push(``);
  promptParts.push(`✅ GOOD example (${style} style):`);
  promptParts.push(`"${styleExample.good}"`);
  promptParts.push(``);
  promptParts.push(`❌ BAD example (too explicit):`);
  promptParts.push(`"${styleExample.bad}"`);
  promptParts.push(``);
  promptParts.push(`📝 Format: 1-2 sentences max, under 180 characters. Just plain text—no quotes or tags.`);
  promptParts.push(``);

  // 🎯 ADD EXPERIENCE CONTEXT (if available)
  promptParts.push(`🎯 EXPERIENCE CONTEXT:`);
  promptParts.push(`Type: "${experienceType}"`);
  if (experienceSubtitle) {
    promptParts.push(`Subtitle: "${experienceSubtitle}"`);
  }
  if (experienceDescription) {
    promptParts.push(`Description: "${experienceDescription}"`);
  }
  if (experienceCategory) {
    promptParts.push(`Category: ${experienceCategory}`);
  }
  promptParts.push(``);
  promptParts.push(`💡 Use this context to create relevant, specific hints:`);
  promptParts.push(`   - What to bring (based on activity details)`);
  promptParts.push(`   - How to prepare physically/mentally`);
  promptParts.push(`   - What mindset or expectations to have`);
  promptParts.push(`   - Practical advice relevant to THIS specific experience`);
  promptParts.push(``);
  promptParts.push(`Go:`);

  return promptParts.join("\n");
}

// Helper to get forbidden words based on experience type
function getForbiddenWords(experienceType: string, band: string): string {
  const type = experienceType.toLowerCase();

  // For VAGUE and THEMATIC levels, be VERY strict
  const isEarlySession = band === 'vague' || band === 'thematic';

  const wordMap: Record<string, string[]> = {
    'rock climbing': isEarlySession
      ? ['climb', 'climbing', 'bouldering', 'rope', 'harness', 'belay', 'wall', 'rock', 'height', 'vertical', 'chalk', 'grip', 'route']
      : ['climb', 'climbing', 'bouldering', 'specific gym name'],
    'spa': isEarlySession
      ? ['spa', 'massage', 'facial', 'sauna', 'treatment', 'therapist', 'wellness', 'pamper', 'relax']
      : ['spa', 'massage', 'specific spa name'],
    'restaurant': isEarlySession
      ? ['restaurant', 'dining', 'menu', 'chef', 'dinner', 'lunch', 'meal', 'cuisine', 'table', 'reservation']
      : ['restaurant', 'specific restaurant name'],
    'wine tasting': isEarlySession
      ? ['wine', 'tasting', 'vineyard', 'winery', 'grape', 'barrel', 'cellar', 'sommelier', 'vintage']
      : ['wine', 'tasting', 'specific winery name'],
    'skydiving': isEarlySession
      ? ['skydive', 'skydiving', 'parachute', 'jump', 'plane', 'freefall', 'altitude', 'harness']
      : ['skydive', 'skydiving', 'specific location'],
  };

  // Try to find matching experience type
  for (const [key, words] of Object.entries(wordMap)) {
    if (type.includes(key)) {
      return `  ${words.map(w => `"${w}"`).join(', ')}`;
    }
  }

  // Default for unknown types
  return isEarlySession
    ? '  (Any obvious activity-related words)'
    : '  (Specific location/business names)';
}

// ------------------------------------------------------
// API helpers
// ------------------------------------------------------

async function callOpenRouter(prompt: string): Promise<string> {
  const key = OPENROUTER_KEY.value();
  const model =
    OPENROUTER_MODEL.value() || "meta-llama/Meta-Llama-3-8B-Instruct";

  if (!key) throw new Error("OpenRouter key missing.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You're creating hints for surprise experiences. Keep them mysterious but exciting.

TONE: Casual and conversational. Talk like you're texting a friend about plans.

RULES (never break):
1. NO brand names, business names, addresses, or specific locations ever
2. NO phrases: "you're going to", "will be", "imagine", "picture yourself", "await"
3. Keep it SUBTLE—don't reveal too much. Build curiosity, not clarity.
4. Keep it CASUAL—no poetic or mystical language. Stay grounded and realistic.
5. Keep it SHORT—1-2 sentences max, under 180 characters

Think: "Hey, bring comfortable shoes" not "Imagine your feet dancing upon clouds"

Output: Plain text only. No quotes, tags, or formatting.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const json: any = await res.json();
  const out = json?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("OpenRouter returned empty content.");
  return out.replace(/\n+/g, " ").trim();
}

async function callOpenAI(prompt: string): Promise<string> {
  // OpenAI implementation not currently in use
  // Uncomment and configure secrets when ready to enable
  /*
  const key = OPENAI_KEY.value();
  const model = OPENAI_MODEL.value() || "gpt-4-turbo";
  */

  throw new Error("OpenAI provider not configured. Use OpenRouter instead.");

  /* Commented out until OpenAI secrets are configured
  const key = OPENAI_KEY.value();
  const model = OPENAI_MODEL.value() || "gpt-4-turbo";

  if (!key) throw new Error("OpenAI key missing.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
    {
      role: "system",
      content: `You're creating hints for surprise experiences. Keep them mysterious but exciting.

TONE: Casual and conversational. Talk like you're texting a friend about plans.

RULES (never break):
1. NO brand names, business names, addresses, or specific locations ever
2. NO phrases: "you're going to", "will be", "imagine", "picture yourself", "await"
3. Keep it SUBTLE—don't reveal too much. Build curiosity, not clarity.
4. Keep it CASUAL—no poetic or mystical language. Stay grounded and realistic.
5. Keep it SHORT—1-2 sentences max, under 180 characters

Think: "Hey, bring comfortable shoes" not "Imagine your feet dancing upon clouds"

Output: Plain text only. No quotes, tags, or formatting.`,
    }
    ,
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const json: any = await res.json();
  const out = json?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("OpenAI returned empty content.");
  return out.replace(/\n+/g, " ").trim();
  */
}

// ------------------------------------------------------
// Cloud Function
// ------------------------------------------------------

export const aiGenerateHint = onCall(
  {
    region: "europe-west1",
    cors: [
      "http://localhost:8081",
      "http://localhost:3000",
      "https://ernit-nine.vercel.app",
      "https://ernit981723498127658912765187923546.vercel.app",
      "https://ernit.app",
      "https://ernit.xyz",
    ],
    secrets: [
      OPENROUTER_KEY,
      OPENROUTER_MODEL,
      // OPENAI_KEY,
      // OPENAI_MODEL,
      LLM_PROVIDER,
    ],
  },
  async (requestData, context) => {
    console.log("🚀 aiGenerateHint called");

    // ✅ SECURITY: Rate limiting check
    const auth = requestData.auth;
    if (!auth?.uid) {
      throw new Error("User must be authenticated to generate hints.");
    }

    const userId = auth.uid;
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const RATE_LIMIT = 20; // Maximum hints per hour per user

    // Import db from index
    const { db } = await import('./index.js');

    // Check rate limit using Firestore
    const rateLimitRef = db.collection('rateLimits').doc(`hints_${userId}`);
    const rateLimitDoc = await rateLimitRef.get();

    if (rateLimitDoc.exists) {
      const data = rateLimitDoc.data();
      const recentRequests = (data?.requests || []).filter(
        (timestamp: number) => timestamp > oneHourAgo
      );

      if (recentRequests.length >= RATE_LIMIT) {
        console.warn(`⚠️ Rate limit exceeded for user ${userId}`);
        throw new Error("Rate limit exceeded. Please try again later.");
      }

      // Update with new request
      await rateLimitRef.set({
        requests: [...recentRequests, now],
        lastRequest: now,
      });
    } else {
      // Create new rate limit document
      await rateLimitRef.set({
        requests: [now],
        lastRequest: now,
      });
    }

    // `requestData.data` for Firebase SDK clients
    const data = (requestData?.data || requestData) as any;
    const {
      experienceType,
      experienceDescription,
      experienceCategory,
      experienceSubtitle,
      sessionNumber,
      totalSessions,
      userName,
      style,
      previousHints = [], // NEW: Extract previous hints
    } = data;

    if (!experienceType || !sessionNumber || !totalSessions || !style) {
      console.error("❌ Missing required fields", data);
      throw new Error("Missing required fields.");
    }

    console.log("📦 Received valid data:", {
      experienceType,
      sessionNumber,
      totalSessions,
      style,
      previousHintsCount: previousHints.length,
    });

    const prompt = buildUserPrompt({
      experienceType,
      experienceDescription,
      experienceCategory,
      experienceSubtitle,
      sessionNumber,
      totalSessions,
      userName,
      style,
      previousHints, // NEW: Pass previous hints
    });

    const provider = (LLM_PROVIDER.value() || "openrouter").toLowerCase();

    try {
      const hint =
        provider === "openai"
          ? await callOpenAI(prompt)
          : await callOpenRouter(prompt);

      const cleaned = hint
        // Remove anything inside [] or <>
        .replace(/\[.*?\]/g, '')
        .replace(/<.*?>/g, '')
        // Collapse extra spaces and newlines
        .replace(/\s+/g, ' ')
        // Fix spaces before punctuation
        .replace(/\s+([.,!?;:])/g, '$1')
        // Remove leading/trailing quotes or weird characters
        .replace(/^["“”'`]+|["“”'`]+$/g, '')
        .trim();

      // Split into sentences using a more compatible regex approach
      // This avoids lookbehind assertions which may not work in all environments
      const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
      const finalHint = sentences.slice(0, 3).join(' ').trim();

      return { hint: finalHint, style };
    } catch (err: any) {
      console.error("aiGenerateHint error:", err?.message || err);
      throw new Error("Failed to generate hint.");
    }
  }
);
