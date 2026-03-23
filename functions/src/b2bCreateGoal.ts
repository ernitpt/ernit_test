import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * B2B Cloud Function: Create a goal for an employee from a KPI template.
 * Called by company admins to assign a KPI to an employee.
 * All data written to ernitxfi database.
 */

const getB2bDb = () => getFirestore("ernitxfi");

export const b2bCreateGoal = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const callerUid = request.auth.uid;
    const { companyId, kpiId, employeeUserId } = request.data;

    // Validate inputs
    if (!companyId || !kpiId || !employeeUserId) {
      throw new HttpsError("invalid-argument", "companyId, kpiId, and employeeUserId are required.");
    }

    const b2bDb = getB2bDb();

    // Verify caller is company admin
    const callerMember = await b2bDb
      .collection("companyMembers")
      .doc(`${companyId}_${callerUid}`)
      .get();

    if (!callerMember.exists || callerMember.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Only company admins can assign goals.");
    }

    // Verify employee is a member
    const employeeMember = await b2bDb
      .collection("companyMembers")
      .doc(`${companyId}_${employeeUserId}`)
      .get();

    if (!employeeMember.exists || employeeMember.data()?.status !== "active") {
      throw new HttpsError("not-found", "Employee is not an active member of this company.");
    }

    // Get KPI template
    const kpiDoc = await b2bDb.collection("companyKPIs").doc(kpiId).get();
    if (!kpiDoc.exists) {
      throw new HttpsError("not-found", "KPI not found.");
    }
    const kpi = kpiDoc.data()!;

    if (kpi.companyId !== companyId) {
      throw new HttpsError("permission-denied", "KPI does not belong to this company.");
    }

    // Check if employee already has an active goal for this KPI
    const existingGoals = await b2bDb
      .collection("goals")
      .where("companyId", "==", companyId)
      .where("kpiId", "==", kpiId)
      .where("userId", "==", employeeUserId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!existingGoals.empty) {
      throw new HttpsError("already-exists", "Employee already has an active goal for this KPI.");
    }

    // Create goal document
    const now = Timestamp.now();
    const goalRef = await b2bDb.collection("goals").add({
      companyId,
      kpiId,
      userId: employeeUserId,
      title: kpi.title,
      targetCount: kpi.targetCount,
      currentCount: 0,
      sessionsPerWeek: kpi.sessionsPerWeek,
      weeklyCount: 0,
      weeklyLogDates: [],
      weekStartAt: now,
      isActive: true,
      isCompleted: false,
      experienceId: kpi.experienceId || null,
      experienceSnapshot: kpi.experienceSnapshot || null,
      sessionStreak: 0,
      longestStreak: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Increment assignedCount on the KPI
    await b2bDb.collection("companyKPIs").doc(kpiId).update({
      assignedCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      goalId: goalRef.id,
      message: `Goal "${kpi.title}" assigned to employee.`,
    };
  }
);
