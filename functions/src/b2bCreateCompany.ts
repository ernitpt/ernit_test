import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * B2B Cloud Function: Create a new company.
 * Called during admin signup. Creates company doc + admin membership + updates user profile.
 * All data is written to the ernitxfi named database.
 */

const getB2bDb = () => getFirestore("ernitxfi");

export const b2bCreateCompany = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to create a company.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email || "";
    const { companyName, industry, billingEmail } = request.data;

    // Validate input
    if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
      throw new HttpsError("invalid-argument", "Company name must be at least 2 characters.");
    }

    const sanitizedName = companyName.trim().slice(0, 100);
    const sanitizedIndustry = typeof industry === "string" ? industry.trim().slice(0, 100) : undefined;

    // Validate billing email with a proper regex instead of a weak includes("@") check
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    let resolvedBillingEmail = email;
    if (typeof billingEmail === "string" && billingEmail.trim().length > 0) {
      const trimmedBilling = billingEmail.trim().toLowerCase().slice(0, 200);
      if (!EMAIL_REGEX.test(trimmedBilling)) {
        throw new HttpsError("invalid-argument", "Invalid billing email address.");
      }
      resolvedBillingEmail = trimmedBilling;
    }
    const sanitizedBillingEmail = resolvedBillingEmail;

    // Generate slug from company name
    let slug = sanitizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const b2bDb = getB2bDb();

    // Check slug uniqueness; append a short random suffix if it already exists
    const existingSlug = await b2bDb.collection("b2bCompanies").where("slug", "==", slug).limit(1).get();
    if (!existingSlug.empty) {
      slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    // Use a batch to create company + member + update user atomically
    const batch = b2bDb.batch();

    // 1. Create company document
    const companyRef = b2bDb.collection("companies").doc();
    const companyId = companyRef.id;

    batch.set(companyRef, {
      name: sanitizedName,
      slug,
      industry: sanitizedIndustry || null,
      adminUserId: uid,
      billingEmail: sanitizedBillingEmail,
      settings: {
        allowTeamFeed: true,
        allowPeerReactions: true,
        maxKPIsPerEmployee: 3,
        defaultKPIDurationWeeks: 4,
      },
      status: "trial",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2. Create admin membership (composite ID: companyId_userId)
    const memberRef = b2bDb.collection("companyMembers").doc(`${companyId}_${uid}`);
    batch.set(memberRef, {
      companyId,
      userId: uid,
      role: "admin",
      displayName: request.auth.token.name || email.split("@")[0],
      email,
      status: "active",
      invitedBy: uid,
      joinedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Update user's companyIds array
    const userRef = b2bDb.collection("users").doc(uid);
    batch.set(
      userRef,
      {
        companyIds: FieldValue.arrayUnion(companyId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    return {
      companyId,
      slug,
      message: `Company "${sanitizedName}" created successfully.`,
    };
  }
);
