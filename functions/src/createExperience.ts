// ✅ Firebase Functions v2 version
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { allowedOrigins } from "./cors";

const ALLOWED_MIME_TYPES = ['jpeg', 'jpg', 'png', 'webp'];

function sanitizePath(str: string): string {
  return str.replace(/[^a-zA-Z0-9\-_ ]/g, '_').substring(0, 50);
}

/**
 * Admin-only Cloud Function to create experiences
 * Validates admin status, uploads images to Storage, and creates Firestore document
 */
export const createExperience = onCall(
    {
        region: "europe-west1",
        cors: allowedOrigins,
    },
    async (request) => {
        console.log("🚀 createExperience called");

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
        const data = request.data;
        const {
            title,
            subtitle,
            description,
            category,
            price,
            partnerId,
            images, // Array of base64 encoded images
        } = data;

        // ✅ VALIDATION: Check required fields
        if (!title || !subtitle || !description || !category || typeof price !== "number" || !partnerId) {
            throw new HttpsError('invalid-argument', 'Missing required fields');
        }

        // ✅ VALIDATION: Validate category
        const validCategories = ["adventure", "creative", "wellness"];
        if (!validCategories.includes(category)) {
            throw new HttpsError('invalid-argument', `Invalid category. Must be one of: ${validCategories.join(", ")}`);
        }

        // ✅ VALIDATION: Validate price
        if (price <= 0) {
            throw new HttpsError('invalid-argument', 'Price must be greater than 0');
        }

        // ✅ VALIDATION: Validate partner exists
        const partnerRef = db.collection("partnerUsers").doc(partnerId);
        const partnerSnap = await partnerRef.get();
        if (!partnerSnap.exists) {
            throw new HttpsError('not-found', 'Partner not found');
        }

        // ✅ VALIDATION: Validate images
        if (!images || !Array.isArray(images) || images.length === 0) {
            throw new HttpsError('invalid-argument', 'At least one image is required');
        }

        if (images.length > 10) {
            throw new HttpsError('invalid-argument', 'Maximum 10 images allowed');
        }

        console.log(`📦 Creating experience: ${title} (${category})`);

        const uploadedUrls: string[] = [];

        try {
            // ✅ UPLOAD IMAGES to Firebase Storage
            const bucket = getStorage().bucket();
            const imageUrls: string[] = [];

            for (let i = 0; i < images.length; i++) {
                const imageData = images[i];

                // Validate base64 format
                if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
                    throw new HttpsError('invalid-argument', `Invalid image format at index ${i}`);
                }

                // Extract base64 data and mime type
                const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
                if (!matches) {
                    throw new HttpsError('invalid-argument', `Invalid base64 image at index ${i}`);
                }

                const mimeType = matches[1].toLowerCase();
                if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
                    throw new HttpsError('invalid-argument', `Invalid image type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
                }

                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, "base64");

                // Validate file size (max 5MB)
                const maxSize = 5 * 1024 * 1024; // 5MB
                if (buffer.length > maxSize) {
                    throw new HttpsError('invalid-argument', `Image ${i} exceeds 5MB limit`);
                }

                // Generate unique filename
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(7);
                const titleSlug = sanitizePath(title);
                const categorySlug = sanitizePath(category);
                const filename = `experiences/${categorySlug}/${titleSlug}/${timestamp}_${i}_${randomId}.${mimeType}`;

                // Upload to Storage
                const file = bucket.file(filename);
                await file.save(buffer, {
                    metadata: {
                        contentType: `image/${mimeType}`,
                        metadata: {
                            uploadedBy: userId,
                            experienceTitle: title,
                        },
                    },
                });

                // Make file publicly accessible
                await file.makePublic();

                // Get public URL
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
                imageUrls.push(publicUrl);
                uploadedUrls.push(publicUrl);

                console.log(`✅ Uploaded image ${i + 1}/${images.length}: ${publicUrl}`);
            }

            // ✅ CREATE EXPERIENCE DOCUMENT in Firestore
            const experienceRef = db.collection("experiences").doc();
            const experienceData = {
                id: experienceRef.id, // ✅ Include document ID in the data (matches existing pattern)
                title,
                subtitle,
                description,
                category,
                price,
                partnerId,
                status: data.status || 'published', // Default to 'published'; caller may pass 'draft'
                imageUrl: imageUrls, // Array of all images
                coverImageUrl: imageUrls[0], // First image is cover
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: userId, // Track who created this experience
            };

            await experienceRef.set(experienceData);

            console.log(`✅ Experience created successfully: ${experienceRef.id}`);

            return {
                success: true,
                experienceId: experienceRef.id,
                message: "Experience created successfully",
            };
        } catch (error: any) {
            // Preserve HttpsError codes (e.g. invalid-argument, permission-denied) so the
            // client receives the correct error message rather than a generic 'internal' one.
            if (error instanceof HttpsError) {
                throw error;
            }

            console.error("❌ Error creating experience:", error);

            // Cleanup uploaded images on failure
            if (uploadedUrls.length > 0) {
                console.log(`🗑️ Cleaning up ${uploadedUrls.length} uploaded images due to error`);
                const bucket = getStorage().bucket();
                for (const url of uploadedUrls) {
                    try {
                        const bucketName = bucket.name;
                        const prefix = `https://storage.googleapis.com/${bucketName}/`;
                        if (url.startsWith(prefix)) {
                            const filePath = url.substring(prefix.length);
                            await bucket.file(filePath).delete();
                            console.log(`✅ Cleaned up: ${filePath}`);
                        }
                    } catch (cleanupError: any) {
                        console.warn(`⚠️ Failed to cleanup ${url}: ${cleanupError.message}`);
                    }
                }
            }

            throw new HttpsError('internal', 'Failed to create experience');
        }
    }
);
