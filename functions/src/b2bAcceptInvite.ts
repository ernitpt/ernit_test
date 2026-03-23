import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * B2B Cloud Function: Accept a company invitation.
 * Validates the invite token, creates a companyMember doc,
 * and updates the user's companyIds array.
 */

const getB2bDb = () => getFirestore("ernitxfi");

export const b2bAcceptInvite = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to accept an invitation.");
    }

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email || "";
    const { token } = request.data;

    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "Invite token is required.");
    }

    const b2bDb = getB2bDb();

    // Find the invite by token
    const inviteQuery = await b2bDb
      .collection("companyInvites")
      .where("token", "==", token)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (inviteQuery.empty) {
      throw new HttpsError("not-found", "Invitation not found or already used.");
    }

    const inviteDoc = inviteQuery.docs[0];
    const invite = inviteDoc.data();

    // Check expiry
    const now = Timestamp.now();
    if (invite.expiresAt && invite.expiresAt.toMillis() < now.toMillis()) {
      // Mark as expired
      await inviteDoc.ref.update({ status: "expired" });
      throw new HttpsError("deadline-exceeded", "This invitation has expired.");
    }

    // Verify email matches (case-insensitive)
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new HttpsError(
        "permission-denied",
        "This invitation was sent to a different email address."
      );
    }

    const companyId = invite.companyId;

    // Check if already a member
    const existingMember = await b2bDb
      .collection("companyMembers")
      .doc(`${companyId}_${uid}`)
      .get();

    if (existingMember.exists && existingMember.data()?.status === "active") {
      // Already a member, just mark invite as accepted
      await inviteDoc.ref.update({ status: "accepted" });
      return { companyId, message: "You are already a member of this company." };
    }

    // Use batch write for atomicity
    const batch = b2bDb.batch();

    // 1. Create or update member document
    const memberRef = b2bDb.collection("companyMembers").doc(`${companyId}_${uid}`);
    batch.set(memberRef, {
      companyId,
      userId: uid,
      role: invite.role || "employee",
      displayName: request.auth.token.name || userEmail.split("@")[0],
      email: userEmail.toLowerCase(),
      department: invite.department || null,
      invitedBy: invite.invitedBy,
      status: "active",
      joinedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2. Update user's companyIds
    const userRef = b2bDb.collection("users").doc(uid);
    batch.set(
      userRef,
      {
        email: userEmail.toLowerCase(),
        displayName: request.auth.token.name || userEmail.split("@")[0],
        companyIds: FieldValue.arrayUnion(companyId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 3. Mark invite as accepted
    batch.update(inviteDoc.ref, { status: "accepted" });

    await batch.commit();

    return {
      companyId,
      message: "Welcome! You have successfully joined the company.",
    };
  }
);
