import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase';

class StorageService {
    private storage = getStorage(app);

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

            const filename = `audio_${Date.now()}.m4a`;
            const path = `hints/${userId}/audio/${filename}`;
            const storageRef = ref(this.storage, path);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            console.error('Error uploading audio:', error);
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

            const filename = `image_${Date.now()}.jpg`;
            const path = `hints/${userId}/images/${filename}`;
            const storageRef = ref(this.storage, path);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }
}

export const storageService = new StorageService();
