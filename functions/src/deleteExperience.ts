// ✅ Firebase Functions v2 version
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { allowedOrigins } from "./cors";

/**
 * Admin-only Cloud Function to delete experiences
 * Validates admin status, deletes images from Storage, and removes Firestore document
 */
export const deleteExperience = onCall(
    {
        region: "europe-west1",
        cors: allowedOrigins,
    },
    async (request) => {
        console.log("🚀 deleteExperience called");

        // ✅ SECURITY: Check authentication
        const auth = request.auth;
        if (!auth?.uid) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = auth.uid;
        console.log(`👤 Authenticated user: ${userId}`);

        // ✅ SECURITY: Verify admin status
        const db = admin.firestore();
        const partnerUserRef = db.collection("partnerUsers").doc(userId);
        const partnerUserSnap = await partnerUserRef.get();

        if (!partnerUserSnap.exists) {
            console.warn(`❌ User ${userId} is not a partner user`);
            throw new HttpsError('permission-denied', 'User is not a partner');
        }

        const partnerUserData = partnerUserSnap.data();
        if (!partnerUserData?.isAdmin) {
            console.warn(`❌ User ${userId} is not an admin`);
            throw new HttpsError('permission-denied', 'User is not an admin');
        }

        console.log(`✅ Admin verified: ${userId}`);

        // Extract data from request
        const { experienceId } = request.data;

        // ✅ VALIDATION: Check required fields
        if (!experienceId || typeof experienceId !== "string") {
            throw new HttpsError('invalid-argument', 'Missing or invalid experienceId');
        }

        console.log(`🗑️ Deleting experience: ${experienceId}`);

        try {
            // ✅ FETCH EXPERIENCE DOCUMENT
            const experienceRef = db.collection("experiences").doc(experienceId);
            const experienceSnap = await experienceRef.get();

            if (!experienceSnap.exists) {
                throw new HttpsError('not-found', 'Experience not found');
            }

            const experienceData = experienceSnap.data();
            const imageUrls = experienceData?.imageUrl || [];

            console.log(`📸 Found ${imageUrls.length} images to delete`);

            // ✅ DELETE IMAGES from Firebase Storage
            const bucket = getStorage().bucket();
            const bucketName = bucket.name;

            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];

                try {
                    // Extract Storage path from public URL
                    // Format: https://storage.googleapis.com/{bucketName}/{path}
                    const urlPattern = new RegExp(`https://storage\\.googleapis\\.com/${bucketName}/(.+)`);
                    const matches = imageUrl.match(urlPattern);

                    if (!matches) {
                        console.warn(`⚠️ Could not parse Storage path from URL: ${imageUrl}`);
                        continue;
                    }

                    const storagePath = decodeURIComponent(matches[1]);

                    // Path traversal check
                    if (storagePath.includes('..') || !storagePath.startsWith('experiences/')) {
                        console.warn(`Skipping suspicious path: ${storagePath}`);
                        continue;
                    }

                    console.log(`🗑️ Deleting image ${i + 1}/${imageUrls.length}: ${storagePath}`);

                    // Delete file from Storage
                    const file = bucket.file(storagePath);
                    await file.delete();

                    console.log(`✅ Deleted image ${i + 1}/${imageUrls.length}`);
                } catch (imageError: any) {
                    // Don't fail the entire deletion if an image is already deleted or inaccessible
                    console.warn(`⚠️ Failed to delete image ${i + 1}: ${imageError.message}`);
                }
            }

            // ✅ CHECK FOR ACTIVE GIFT REFERENCES before deleting
            const activeGifts = await db.collection('experienceGifts')
                .where('experienceId', '==', experienceId)
                .where('status', 'in', ['pending', 'claimed'])
                .limit(1)
                .get();

            if (!activeGifts.empty) {
                throw new HttpsError(
                    'failed-precondition',
                    'Cannot delete experience: it has active or claimed gifts. Please resolve them first.'
                );
            }

            // ✅ DELETE EXPERIENCE DOCUMENT from Firestore
            await experienceRef.delete();

            console.log(`✅ Experience deleted successfully: ${experienceId}`);

            return {
                success: true,
                message: "Experience deleted successfully",
            };
        } catch (error: any) {
            // Preserve HttpsError codes (e.g. not-found, failed-precondition) so the
            // client receives the correct error message rather than a generic 'internal' one.
            if (error instanceof HttpsError) {
                throw error;
            }

            console.error("❌ Error deleting experience:", error);
            throw new HttpsError('internal', 'Failed to delete experience');
        }
    }
);
