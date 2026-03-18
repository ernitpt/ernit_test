import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase';

import { logger } from '../utils/logger';
import { compressImageBlob } from '../utils/imageCompression';
import { AppError } from '../utils/AppError';

// ✅ SECURITY: File validation constants
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;  // 5MB
const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_AUDIO_TYPES = ['audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

class StorageService {
    private storage = getStorage(app);

    /**
     * ✅ SECURITY: Validate file before upload
     */
    private validateFile(
        blob: Blob,
        allowedTypes: string[],
        maxSize: number,
        fileType: 'audio' | 'image' | 'video'
    ): void {
        // Check file size
        if (blob.size > maxSize) {
            const maxMB = Math.round(maxSize / (1024 * 1024));
            throw new AppError('FILE_TOO_LARGE', `File too large. Maximum ${fileType} size is ${maxMB}MB.`, 'validation');
        }

        // Check file size is not zero
        if (blob.size === 0) {
            throw new AppError('FILE_EMPTY', `Invalid ${fileType} file: file is empty.`, 'validation');
        }

        // Check file type
        if (blob.type && !allowedTypes.includes(blob.type)) {
            throw new AppError('INVALID_FILE_TYPE', `Invalid ${fileType} type. Allowed types: ${allowedTypes.join(', ')}`, 'validation');
        }

        // Reject files with no MIME type — cannot verify safety
        if (!blob.type) {
            throw new AppError('NO_MIME_TYPE', 'File has no MIME type. Upload rejected for security.', 'validation');
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
            let blob = await response.blob();

            // Compress before validation (may reduce size below limit)
            blob = await compressImageBlob(blob);

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
    /**
     * Upload a motivation audio file to Firebase Storage
     * Path: motivations/{userId}/audio/audio_{timestamp}.m4a
     */
    async uploadMotivationAudio(uri: string, userId: string): Promise<string> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
            const blob = await response.blob();
            this.validateFile(blob, ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE, 'audio');
            const filename = `audio_${Date.now()}.m4a`;
            const path = `motivations/${userId}/audio/${filename}`;
            const storageRef = ref(this.storage, path);
            await uploadBytes(storageRef, blob);
            return await getDownloadURL(storageRef);
        } catch (error) {
            logger.error('Error uploading motivation audio:', error);
            throw error;
        }
    }

    /**
     * Upload a motivation image file to Firebase Storage
     * Path: motivations/{userId}/images/image_{timestamp}.jpg
     */
    async uploadMotivationImage(uri: string, userId: string): Promise<string> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
            let blob = await response.blob();
            blob = await compressImageBlob(blob);
            this.validateFile(blob, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, 'image');
            const filename = `image_${Date.now()}.jpg`;
            const path = `motivations/${userId}/images/${filename}`;
            const storageRef = ref(this.storage, path);
            await uploadBytes(storageRef, blob);
            return await getDownloadURL(storageRef);
        } catch (error) {
            logger.error('Error uploading motivation image:', error);
            throw error;
        }
    }

    /**
     * Upload a session media file (photo or video) to Firebase Storage
     * Path: sessions/{userId}/{goalId}/{type}_{timestamp}.{ext}
     */
    async uploadSessionMedia(
        uri: string,
        userId: string,
        goalId: string,
        mediaType: 'photo' | 'video'
    ): Promise<string> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(uri, { signal: controller.signal });
            clearTimeout(timeoutId);
            let blob = await response.blob();

            if (mediaType === 'video') {
                this.validateFile(blob, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE, 'video');
            } else {
                blob = await compressImageBlob(blob);
                this.validateFile(blob, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, 'image');
            }

            const ext = mediaType === 'video' ? 'mp4' : 'jpg';
            const filename = `${mediaType}_${Date.now()}.${ext}`;
            const path = `sessions/${userId}/${goalId}/${filename}`;
            const storageRef = ref(this.storage, path);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            logger.error(`Error uploading session ${mediaType}:`, error);
            throw error;
        }
    }
}

export const storageService = new StorageService();

