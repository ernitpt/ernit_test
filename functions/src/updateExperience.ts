// ✅ Firebase Functions v2 version
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { allowedOrigins } from "./cors";

const ALLOWED_MIME_TYPES = ['jpeg', 'jpg', 'png', 'webp'];

function sanitizePath(str: string): string {
  return str.replace(/[^a-zA-Z0-9\-_ ]/g, '_').substring(0, 50);
}

/**
 * Admin-only Cloud Function to update experiences
 * Validates admin status, handles image uploads/deletes, and updates Firestore document
 */
export const updateExperience = onCall(
    {
        region: "europe-west1",
        cors: allowedOrigins,
    },
    async (request) => {
        logger.info("🚀 updateExperience called");

        // ✅ SECURITY: Check authentication
        const auth = request.auth;
        if (!auth?.uid) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = auth.uid;
        logger.info(`👤 Authenticated user: ${userId}`);

        // ✅ SECURITY: Verify admin status
        const db = admin.firestore();
        const partnerUserRef = db.collection("partnerUsers").doc(userId);
        const partnerUserSnap = await partnerUserRef.get();

        if (!partnerUserSnap.exists) {
            logger.warn(`❌ User ${userId} is not a partner user`);
            throw new HttpsError('permission-denied', 'User is not a partner');
        }

        const partnerUserData = partnerUserSnap.data();
        if (!partnerUserData?.isAdmin) {
            logger.warn(`❌ User ${userId} is not an admin`);
            throw new HttpsError('permission-denied', 'User is not an admin');
        }

        logger.info(`✅ Admin verified: ${userId}`);

        // Extract data from request
        const data = request.data;
        const {
            experienceId,
            fields, // Object with fields to update: title, subtitle, description, category, price, partnerId, status
            newImages, // Array of base64 encoded images to add
            deleteImageUrls, // Array of existing image URLs to delete
            imageOrder, // Final ordered array of image URLs (after adds/deletes)
        } = data;

        // ✅ VALIDATION: Check experienceId
        if (!experienceId || typeof experienceId !== "string") {
            throw new HttpsError('invalid-argument', 'experienceId is required');
        }

        // ✅ VALIDATION: Array length limits
        if (newImages && newImages.length > 10) {
            throw new HttpsError('invalid-argument', 'Maximum 10 new images allowed');
        }
        if (deleteImageUrls && deleteImageUrls.length > 50) {
            throw new HttpsError('invalid-argument', 'Maximum 50 images can be deleted at once');
        }
        if (imageOrder && imageOrder.length > 50) {
            throw new HttpsError('invalid-argument', 'Maximum 50 images in order array');
        }

        // ✅ VALIDATION: Verify experience exists
        const experienceRef = db.collection("experiences").doc(experienceId);
        const experienceSnap = await experienceRef.get();

        if (!experienceSnap.exists) {
            logger.warn(`❌ Experience ${experienceId} not found`);
            throw new HttpsError('not-found', 'Experience not found');
        }

        const currentExperience = experienceSnap.data();
        logger.info(`📦 Updating experience: ${currentExperience?.title}`);

        const uploadedUrls: string[] = [];

        try {
            // ✅ VALIDATE FIELDS (if provided)
            if (fields) {
                if ('title' in fields && (typeof fields.title !== 'string' || fields.title.length > 200)) {
                    throw new HttpsError('invalid-argument', 'Title must be a string under 200 characters');
                }
                if ('subtitle' in fields && (typeof fields.subtitle !== 'string' || fields.subtitle.length > 300)) {
                    throw new HttpsError('invalid-argument', 'Subtitle must be a string under 300 characters');
                }
                if ('description' in fields && (typeof fields.description !== 'string' || fields.description.length > 5000)) {
                    throw new HttpsError('invalid-argument', 'Description must be a string under 5000 characters');
                }
                if ('status' in fields && !['published', 'draft'].includes(fields.status)) {
                    throw new HttpsError('invalid-argument', "Status must be 'published' or 'draft'");
                }

                // Validate category if being updated
                if (fields.category) {
                    const validCategories = ["adventure", "creative", "wellness"];
                    if (!validCategories.includes(fields.category)) {
                        throw new HttpsError('invalid-argument', `Invalid category. Must be one of: ${validCategories.join(", ")}`);
                    }
                }

                // Validate price if being updated
                if (fields.price !== undefined) {
                    if (typeof fields.price !== "number" || fields.price <= 0) {
                        throw new HttpsError('invalid-argument', 'Price must be greater than 0');
                    }
                }

                // Validate partner exists if being updated
                if (fields.partnerId) {
                    const partnerRef = db.collection("partnerUsers").doc(fields.partnerId);
                    const partnerSnap = await partnerRef.get();
                    if (!partnerSnap.exists) {
                        throw new HttpsError('not-found', 'Partner not found');
                    }
                }
            }

            const bucket = getStorage().bucket();

            // ✅ DELETE IMAGES from Storage (if provided)
            if (deleteImageUrls && Array.isArray(deleteImageUrls) && deleteImageUrls.length > 0) {
                logger.info(`🗑️ Deleting ${deleteImageUrls.length} images from Storage`);

                for (const imageUrl of deleteImageUrls) {
                    try {
                        // Extract Storage path from public URL
                        // Format: https://storage.googleapis.com/{bucketName}/{path}
                        const bucketName = bucket.name;
                        const prefix = `https://storage.googleapis.com/${bucketName}/`;

                        if (!imageUrl.startsWith(prefix)) {
                            logger.warn(`⚠️ Invalid Storage URL format: ${imageUrl}`);
                            continue;
                        }

                        const filePath = imageUrl.substring(prefix.length);

                        // Path traversal check
                        if (filePath.includes('..') || !filePath.startsWith('experiences/')) {
                            logger.warn(`Skipping suspicious path: ${filePath}`);
                            continue;
                        }

                        const file = bucket.file(filePath);

                        // Check if file exists before deleting
                        const [exists] = await file.exists();
                        if (exists) {
                            await file.delete();
                            logger.info(`✅ Deleted: ${filePath}`);
                        } else {
                            logger.warn(`⚠️ File not found in Storage: ${filePath}`);
                        }
                    } catch (error: unknown) {
                        logger.error(`❌ Error deleting image ${imageUrl}:`, (error as Error).message);
                        // Continue with other deletions even if one fails
                    }
                }
            }

            // ✅ UPLOAD NEW IMAGES to Storage (if provided)
            const newImageUrls: string[] = [];
            if (newImages && Array.isArray(newImages) && newImages.length > 0) {
                logger.info(`📤 Uploading ${newImages.length} new images`);

                // Determine category for image path
                const categoryForPath = fields?.category || currentExperience?.category || "general";
                const titleForPath = fields?.title || currentExperience?.title || "experience";

                for (let i = 0; i < newImages.length; i++) {
                    const imageData = newImages[i];

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
                    const titleSlug = sanitizePath(titleForPath);
                    const categorySlug = sanitizePath(categoryForPath);
                    const filename = `experiences/${categorySlug}/${titleSlug}/${timestamp}_${i}_${randomId}.${mimeType}`;

                    // Upload to Storage
                    const file = bucket.file(filename);
                    await file.save(buffer, {
                        metadata: {
                            contentType: `image/${mimeType}`,
                            metadata: {
                                uploadedBy: userId,
                                experienceId: experienceId,
                                experienceTitle: titleForPath,
                            },
                        },
                    });

                    // Make file publicly accessible
                    await file.makePublic();

                    // Get public URL
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
                    newImageUrls.push(publicUrl);
                    uploadedUrls.push(publicUrl);

                    logger.info(`✅ Uploaded image ${i + 1}/${newImages.length}: ${publicUrl}`);
                }
            }

            // ✅ BUILD UPDATE OBJECT
            const updateData: Record<string, unknown> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: userId, // Track who updated this experience
            };

            // Add field updates if provided
            if (fields) {
                Object.assign(updateData, fields);
            }

            // Handle image order and cover image
            if (imageOrder && Array.isArray(imageOrder)) {
                // Use the provided imageOrder (which already accounts for deletes)
                // and append any new images
                const finalImageOrder = [...imageOrder, ...newImageUrls];
                updateData.imageUrl = finalImageOrder;
                updateData.coverImageUrl = finalImageOrder[0] || null;
            } else if (newImageUrls.length > 0) {
                // If no imageOrder provided but we have new images, append to existing
                const currentImages = currentExperience?.imageUrl || [];
                const finalImages = [...currentImages, ...newImageUrls];
                updateData.imageUrl = finalImages;
                updateData.coverImageUrl = finalImages[0] || null;
            }

            // ✅ UPDATE EXPERIENCE DOCUMENT in Firestore
            await experienceRef.update(updateData);

            logger.info(`✅ Experience updated successfully: ${experienceId}`);

            return {
                success: true,
                experienceId: experienceId,
                message: "Experience updated successfully",
            };
        } catch (error: unknown) {
            // Preserve HttpsError codes (e.g. invalid-argument, not-found) so the
            // client receives the correct error message rather than a generic 'internal' one.
            if (error instanceof HttpsError) {
                throw error;
            }

            logger.error("❌ Error updating experience:", error);

            // Cleanup uploaded images on failure
            if (uploadedUrls.length > 0) {
                logger.info(`🗑️ Cleaning up ${uploadedUrls.length} uploaded images due to error`);
                const bucket = getStorage().bucket();
                for (const url of uploadedUrls) {
                    try {
                        const bucketName = bucket.name;
                        const prefix = `https://storage.googleapis.com/${bucketName}/`;
                        if (url.startsWith(prefix)) {
                            const filePath = url.substring(prefix.length);
                            await bucket.file(filePath).delete();
                            logger.info(`✅ Cleaned up: ${filePath}`);
                        }
                    } catch (cleanupError: unknown) {
                        logger.warn(`⚠️ Failed to cleanup ${url}: ${(cleanupError as Error).message}`);
                    }
                }
            }

            throw new HttpsError('internal', 'Failed to update experience');
        }
    }
);
