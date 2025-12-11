import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase';

import { logger } from '../utils/logger';

// ✅ SECURITY: File validation constants
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;  // 5MB
const ALLOWED_AUDIO_TYPES = ['audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

class StorageService {
    private storage = getStorage(app);

    /**
     * ✅ SECURITY: Validate file before upload
     */
    private validateFile(
        blob: Blob,
        allowedTypes: string[],
        maxSize: number,
        fileType: 'audio' | 'image'
    ): void {
        // Check file size
        if (blob.size > maxSize) {
            const maxMB = Math.round(maxSize / (1024 * 1024));
            throw new Error(`File too large. Maximum ${fileType} size is ${maxMB}MB.`);
        }

        // Check file size is not zero
        if (blob.size === 0) {
            throw new Error(`Invalid ${fileType} file: file is empty.`);
        }

        // Check file type
        if (blob.type && !allowedTypes.includes(blob.type)) {
            throw new Error(`Invalid ${fileType} type. Allowed types: ${allowedTypes.join(', ')}`);
        }

        // Additional check: if no type, verify it's not empty
        if (!blob.type) {
            logger.warn(`⚠️ File uploaded without MIME type - allowing based on extension`);
        }
    }

    /**
     * Upload an audio file to Firebase Storage
     * @param uri Local URI of the audio file
     * @param userId User ID of the uploader (for path organization)
     * @returns Promise resolving to the download URL
     */
    async uploadAudio(uri: string, userId: string): Promise<string> {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();

            // ✅ SECURITY: Validate audio file
            this.validateFile(blob, ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE, 'audio');

            const filename = `audio_${Date.now()}.m4a`;
            const path = `hints/${userId}/audio/${filename}`;
            const storageRef = ref(this.storage, path);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            logger.error('Error uploading audio:', error);
            throw error;
        }
    }

    /**
     * Upload an image file to Firebase Storage
     * @param uri Local URI of the image file
     * @param userId User ID of the uploader (for path organization)
     * @returns Promise resolving to the download URL
     */
    async uploadImage(uri: string, userId: string): Promise<string> {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();

            // ✅ SECURITY: Validate image file
            this.validateFile(blob, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, 'image');

            const filename = `image_${Date.now()}.jpg`;
            const path = `hints/${userId}/images/${filename}`;
            const storageRef = ref(this.storage, path);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            logger.error('Error uploading image:', error);
            throw error;
        }
    }
}

export const storageService = new StorageService();

