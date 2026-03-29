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

    // Refs declared outside the transaction so goalRef.id is accessible for the return value.
    const goalRef = b2bDb.collection("goals").doc();
    let kpiTitle = "";

    // Wrap all reads and writes in a single transaction so that:
    // (a) the duplicate-goal check and the goal creation are atomic — two concurrent
    //     admin requests cannot both pass the duplicate check and create two goals, and
    // (b) the employee/KPI reads that gate the write cannot be invalidated between
    //     the read and the write (TOCTOU).
    await b2bDb.runTransaction(async (transaction) => {
      // Verify caller is company admin
      const callerMemberRef = b2bDb
        .collection("companyMembers")
        .doc(`${companyId}_${callerUid}`);
      const callerMember = await transaction.get(callerMemberRef);

      if (!callerMember.exists || callerMember.data()?.role !== "admin") {
        throw new HttpsError("permission-denied", "Only company admins can assign goals.");
      }

      // Verify employee is an active member of THIS company.
      // Using the composite doc ID `companyId_employeeUserId` implicitly confirms
      // that the employee belongs to companyId — a member of a different company
      // would have a different document path and this read would return !exists.
      const employeeMemberRef = b2bDb
        .collection("companyMembers")
        .doc(`${companyId}_${employeeUserId}`);
      const employeeMember = await transaction.get(employeeMemberRef);

      if (!employeeMember.exists || employeeMember.data()?.status !== "active") {
        throw new HttpsError("not-found", "Employee is not an active member of this company.");
      }

      // Get KPI template
      const kpiRef = b2bDb.collection("companyKPIs").doc(kpiId);
      const kpiDoc = await transaction.get(kpiRef);
      if (!kpiDoc.exists) {
        throw new HttpsError("not-found", "KPI not found.");
      }
      const kpi = kpiDoc.data()!;

      if (kpi.companyId !== companyId) {
        throw new HttpsError("permission-denied", "KPI does not belong to this company.");
      }

      // Check if employee already has an active goal for this KPI.
      // NOTE: Firestore transactions support a limited number of reads.
      // We use a collection-group query inside the transaction to make this
      // check atomic with the subsequent write, preventing duplicate goals
      // under concurrent requests.
      const existingGoals = await transaction.get(
        b2bDb
          .collection("goals")
          .where("companyId", "==", companyId)
          .where("kpiId", "==", kpiId)
          .where("userId", "==", employeeUserId)
          .where("isActive", "==", true)
          .limit(1)
      );

      if (!existingGoals.empty) {
        throw new HttpsError("already-exists", "Employee already has an active goal for this KPI.");
      }

      kpiTitle = kpi.title as string;
      const now = Timestamp.now();

      // Create goal and increment KPI assignedCount in the same transaction commit.
      transaction.set(goalRef, {
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
      transaction.update(kpiRef, {
        assignedCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      goalId: goalRef.id,
      message: `Goal "${kpiTitle}" assigned to employee.`,
    };
  }
);
