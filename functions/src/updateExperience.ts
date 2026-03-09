// ✅ Firebase Functions v2 version
import { onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";

/**
 * Admin-only Cloud Function to update experiences
 * Validates admin status, handles image uploads/deletes, and updates Firestore document
 */
export const updateExperience = onCall(
    {
        region: "europe-west1",
        cors: [
            "http://localhost:8081",
            "http://localhost:3000",
            "https://ernit-nine.vercel.app",
            "https://ernit981723498127658912765187923546.vercel.app",
            "https://ernit.app",
            "https://ernit.xyz", // Partner app production domain
            "https://ernitpartner.vercel.app", // Partner app domain
        ],
    },
    async (request) => {
        console.log("🚀 updateExperience called");

        // ✅ SECURITY: Check authentication
        const auth = request.auth;
        if (!auth?.uid) {
            throw new Error("Unauthorized: User must be authenticated");
        }

        const userId = auth.uid;
        console.log(`👤 Authenticated user: ${userId}`);

        // ✅ SECURITY: Verify admin status
        const db = admin.firestore();
        const partnerUserRef = db.collection("partnerUsers").doc(userId);
        const partnerUserSnap = await partnerUserRef.get();

        if (!partnerUserSnap.exists) {
            console.warn(`❌ User ${userId} is not a partner user`);
            throw new Error("Unauthorized: User is not a partner");
        }

        const partnerUserData = partnerUserSnap.data();
        if (!partnerUserData?.isAdmin) {
            console.warn(`❌ User ${userId} is not an admin`);
            throw new Error("Unauthorized: User is not an admin");
        }

        console.log(`✅ Admin verified: ${userId}`);

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
            throw new Error("experienceId is required");
        }

        // ✅ VALIDATION: Verify experience exists
        const experienceRef = db.collection("experiences").doc(experienceId);
        const experienceSnap = await experienceRef.get();

        if (!experienceSnap.exists) {
            console.warn(`❌ Experience ${experienceId} not found`);
            throw new Error("Experience not found");
        }

        const currentExperience = experienceSnap.data();
        console.log(`📦 Updating experience: ${currentExperience?.title}`);

        try {
            // ✅ VALIDATE FIELDS (if provided)
            if (fields) {
                // Validate category if being updated
                if (fields.category) {
                    const validCategories = ["adventure", "creative", "wellness"];
                    if (!validCategories.includes(fields.category)) {
                        throw new Error(`Invalid category. Must be one of: ${validCategories.join(", ")}`);
                    }
                }

                // Validate price if being updated
                if (fields.price !== undefined) {
                    if (typeof fields.price !== "number" || fields.price <= 0) {
                        throw new Error("Price must be greater than 0");
                    }
                }

                // Validate partner exists if being updated
                if (fields.partnerId) {
                    const partnerRef = db.collection("partnerUsers").doc(fields.partnerId);
                    const partnerSnap = await partnerRef.get();
                    if (!partnerSnap.exists) {
                        throw new Error("Partner not found");
                    }
                }
            }

            const bucket = getStorage().bucket();

            // ✅ DELETE IMAGES from Storage (if provided)
            if (deleteImageUrls && Array.isArray(deleteImageUrls) && deleteImageUrls.length > 0) {
                console.log(`🗑️ Deleting ${deleteImageUrls.length} images from Storage`);

                for (const imageUrl of deleteImageUrls) {
                    try {
                        // Extract Storage path from public URL
                        // Format: https://storage.googleapis.com/{bucketName}/{path}
                        const bucketName = bucket.name;
                        const prefix = `https://storage.googleapis.com/${bucketName}/`;

                        if (!imageUrl.startsWith(prefix)) {
                            console.warn(`⚠️ Invalid Storage URL format: ${imageUrl}`);
                            continue;
                        }

                        const filePath = imageUrl.substring(prefix.length);
                        const file = bucket.file(filePath);

                        // Check if file exists before deleting
                        const [exists] = await file.exists();
                        if (exists) {
                            await file.delete();
                            console.log(`✅ Deleted: ${filePath}`);
                        } else {
                            console.warn(`⚠️ File not found in Storage: ${filePath}`);
                        }
                    } catch (error: any) {
                        console.error(`❌ Error deleting image ${imageUrl}:`, error.message);
                        // Continue with other deletions even if one fails
                    }
                }
            }

            // ✅ UPLOAD NEW IMAGES to Storage (if provided)
            const newImageUrls: string[] = [];
            if (newImages && Array.isArray(newImages) && newImages.length > 0) {
                console.log(`📤 Uploading ${newImages.length} new images`);

                // Determine category for image path
                const categoryForPath = fields?.category || currentExperience?.category || "general";
                const titleForPath = fields?.title || currentExperience?.title || "experience";

                for (let i = 0; i < newImages.length; i++) {
                    const imageData = newImages[i];

                    // Validate base64 format
                    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
                        throw new Error(`Invalid image format at index ${i}`);
                    }

                    // Extract base64 data and mime type
                    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
                    if (!matches) {
                        throw new Error(`Invalid base64 image at index ${i}`);
                    }

                    const mimeType = matches[1];
                    const base64Data = matches[2];
                    const buffer = Buffer.from(base64Data, "base64");

                    // Validate file size (max 5MB)
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (buffer.length > maxSize) {
                        throw new Error(`Image ${i} exceeds 5MB limit`);
                    }

                    // Generate unique filename
                    const timestamp = Date.now();
                    const randomId = Math.random().toString(36).substring(7);
                    const titleSlug = titleForPath.replace(/\s+/g, "_").toLowerCase();
                    const filename = `experiences/${categoryForPath}/${titleSlug}/${timestamp}_${i}_${randomId}.${mimeType}`;

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

                    console.log(`✅ Uploaded image ${i + 1}/${newImages.length}: ${publicUrl}`);
                }
            }

            // ✅ BUILD UPDATE OBJECT
            const updateData: any = {
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

            console.log(`✅ Experience updated successfully: ${experienceId}`);

            return {
                success: true,
                experienceId: experienceId,
                message: "Experience updated successfully",
            };
        } catch (error: any) {
            console.error("❌ Error updating experience:", error);
            throw new Error(`Failed to update experience: ${error.message}`);
        }
    }
);
