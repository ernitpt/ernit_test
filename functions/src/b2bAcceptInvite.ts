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

    const inviteRef = inviteQuery.docs[0].ref;

    // Capture email/role/etc from the initial query snapshot for email verification
    // (done before the transaction — these fields are immutable once created).
    const initialInvite = inviteQuery.docs[0].data();

    // Verify email matches (case-insensitive) — no race condition risk on immutable field
    if (initialInvite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new HttpsError(
        "permission-denied",
        "This invitation was sent to a different email address."
      );
    }

    const companyId = initialInvite.companyId;

    // Check if already a member (outside transaction — read-only pre-check)
    const existingMember = await b2bDb
      .collection("companyMembers")
      .doc(`${companyId}_${uid}`)
      .get();

    if (existingMember.exists && existingMember.data()?.status === "active") {
      // Already a member — atomically mark invite as accepted and return
      await b2bDb.runTransaction(async (transaction) => {
        const freshInvite = await transaction.get(inviteRef);
        if (!freshInvite.exists || freshInvite.data()?.status !== "pending") {
          throw new HttpsError("not-found", "Invitation not found or already used.");
        }
        transaction.update(inviteRef, { status: "accepted" });
      });
      return { companyId, message: "You are already a member of this company." };
    }

    // Atomically: re-verify expiry + mark accepted + create member doc + update user
    // Using a transaction prevents two concurrent accept requests from both succeeding,
    // and prevents accepting an invite that expires between the query and the write.
    const memberRef = b2bDb.collection("companyMembers").doc(`${companyId}_${uid}`);
    const userRef = b2bDb.collection("users").doc(uid);
    const displayName = request.auth.token.name || userEmail.split("@")[0];

    await b2bDb.runTransaction(async (transaction) => {
      const freshInvite = await transaction.get(inviteRef);
      const invite = freshInvite.data();

      if (!freshInvite.exists || !invite || invite.status !== "pending") {
        throw new HttpsError("not-found", "Invitation not found or already used.");
      }

      if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
        // Mark as expired atomically
        transaction.update(inviteRef, { status: "expired" });
        throw new HttpsError("deadline-exceeded", "This invitation has expired.");
      }

      // Mark invite as accepted atomically
      transaction.update(inviteRef, {
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
      });

      // Create member document
      transaction.set(memberRef, {
        companyId,
        userId: uid,
        role: invite.role || "employee",
        displayName,
        email: userEmail.toLowerCase(),
        department: invite.department || null,
        invitedBy: invite.invitedBy,
        status: "active",
        joinedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update user's companyIds
      transaction.set(
        userRef,
        {
          email: userEmail.toLowerCase(),
          displayName,
          companyIds: FieldValue.arrayUnion(companyId),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return {
      companyId,
      message: "Welcome! You have successfully joined the company.",
    };
  }
);
