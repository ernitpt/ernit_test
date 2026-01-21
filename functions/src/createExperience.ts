// ✅ Firebase Functions v2 version
import { onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";

/** 
 * Admin-only Cloud Function to create experiences
 * Validates admin status, uploads images to Storage, and creates Firestore document
 */
export const createExperience = onCall(
    {
        region: "europe-west1",
        cors: [
            "http://localhost:8081",
            "http://localhost:3000",
            "https://ernit-nine.vercel.app",
            "https://ernit981723498127658912765187923546.vercel.app",
            "https://ernit.app",
            "https://ernitpartner.vercel.app", // Partner app domain
        ],
    },
    async (request) => {
        console.log("🚀 createExperience called");

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
            throw new Error("Missing required fields");
        }

        // ✅ VALIDATION: Validate category
        const validCategories = ["adventure", "creative", "wellness"];
        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category. Must be one of: ${validCategories.join(", ")}`);
        }

        // ✅ VALIDATION: Validate price
        if (price <= 0) {
            throw new Error("Price must be greater than 0");
        }

        // ✅ VALIDATION: Validate partner exists
        const partnerRef = db.collection("partnerUsers").doc(partnerId);
        const partnerSnap = await partnerRef.get();
        if (!partnerSnap.exists) {
            throw new Error("Partner not found");
        }

        // ✅ VALIDATION: Validate images
        if (!images || !Array.isArray(images) || images.length === 0) {
            throw new Error("At least one image is required");
        }

        if (images.length > 10) {
            throw new Error("Maximum 10 images allowed");
        }

        console.log(`📦 Creating experience: ${title} (${category})`);

        try {
            // ✅ UPLOAD IMAGES to Firebase Storage
            const bucket = getStorage().bucket();
            const imageUrls: string[] = [];

            for (let i = 0; i < images.length; i++) {
                const imageData = images[i];

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
                const filename = `experiences/${category}/${title.replace(/\s+/g, "_").toLowerCase()}/${timestamp}_${i}_${randomId}.${mimeType}`;

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
            console.error("❌ Error creating experience:", error);
            throw new Error(`Failed to create experience: ${error.message}`);
        }
    }
);
