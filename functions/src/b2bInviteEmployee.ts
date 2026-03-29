import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

/**
 * B2B Cloud Function: Invite an employee to a company.
 * Creates an invite document in ernitxfi with a unique token.
 * The employee can accept by visiting /invite/[token].
 */

const getB2bDb = () => getFirestore("ernitxfi");

export const b2bInviteEmployee = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;
    const { email, role, department, companyId } = request.data;

    // Validate inputs
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      throw new HttpsError("invalid-argument", "Valid email is required.");
    }
    if (!companyId || typeof companyId !== "string") {
      throw new HttpsError("invalid-argument", "Company ID is required.");
    }
    if (!role || !["admin", "employee"].includes(role)) {
      throw new HttpsError("invalid-argument", "Role must be 'admin' or 'employee'.");
    }

    const b2bDb = getB2bDb();

    // Verify the caller is an admin of this company
    const memberDoc = await b2bDb
      .collection("companyMembers")
      .doc(`${companyId}_${uid}`)
      .get();

    if (!memberDoc.exists || memberDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Only company admins can invite employees.");
    }

    // Check if already invited (pending)
    const existingInvites = await b2bDb
      .collection("companyInvites")
      .where("companyId", "==", companyId)
      .where("email", "==", email.trim().toLowerCase())
      .where("status", "==", "pending")
      .get();

    if (!existingInvites.empty) {
      throw new HttpsError("already-exists", "An invitation is already pending for this email.");
    }

    // Check if already a member
    // We can't query by email easily with composite IDs, so query by companyId
    const existingMembers = await b2bDb
      .collection("companyMembers")
      .where("companyId", "==", companyId)
      .where("email", "==", email.trim().toLowerCase())
      .where("status", "==", "active")
      .get();

    if (!existingMembers.empty) {
      throw new HttpsError("already-exists", "This person is already a member of the company.");
    }

    // Generate unique invite token
    const token = crypto.randomBytes(32).toString("hex");

    // Set expiry to 7 days from now
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    // Create invite document
    const inviteRef = await b2bDb.collection("companyInvites").add({
      companyId,
      email: email.trim().toLowerCase(),
      role: role as string,
      department: typeof department === "string" ? department.trim().slice(0, 100) : null,
      token,
      invitedBy: uid,
      status: "pending",
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    // TODO: Send invitation email with link to teams.ernit.app/invite/{token}

    return {
      inviteId: inviteRef.id,
      message: `Invitation sent to ${email}`,
    };
  }
);
