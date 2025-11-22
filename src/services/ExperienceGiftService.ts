import { db } from './firebase';
import { doc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp, collection, query, where, orderBy } from 'firebase/firestore';
import { ExperienceGift } from '../types';

export class ExperienceGiftService {

  private experiencesCollection = collection(db, 'experienceGifts');
  
  /** Create a new experienceGift */
  async createExperienceGift(experienceGift: ExperienceGift) {
    const docRef = await addDoc(this.experiencesCollection, {
      ...experienceGift,
      createdAt: serverTimestamp(),
    });
    return { ...experienceGift, id: docRef.id };
  }
  
  async getExperienceGiftById(id: string): Promise<ExperienceGift | null> {
    if (!id) return null;

    // Try as a document ID first
    const docRef = doc(db, 'experienceGifts', id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as ExperienceGift;
    }

    // Fallback: try to find by field `id`
    const q = query(this.experiencesCollection, where('id', '==', id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn('ExperienceGift not found with either docId or field id:', id);
      return null;
    }

    const foundDoc = querySnapshot.docs[0];
    return { id: foundDoc.id, ...foundDoc.data() } as ExperienceGift;
  }

  async getExperienceGiftsByUser(userId: string): Promise<ExperienceGift[]> {
    try {
      const ref = collection(db, 'experienceGifts');
      const q = query(ref, where('giverId', '==', userId), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);

      return snap.docs.map((doc) => {
        const data = doc.data() as ExperienceGift;
        return {
          ...data,
          id: data.id,
          createdAt:
            data.createdAt && typeof data.createdAt === 'function'
              ? data.createdAt
              : data.createdAt,
          deliveryDate:
            data.deliveryDate && typeof data.deliveryDate === 'function'
              ? data.deliveryDate
              : data.deliveryDate,
        };
      });
    } catch (error) {
      console.error('Error fetching gifts by user:', error);
      return [];
    }
  }

  /** Update personalized message for an experience gift */
  async updatePersonalizedMessage(giftId: string, personalizedMessage: string): Promise<void> {
    try {
      // Try as document ID first
      const docRef = doc(db, 'experienceGifts', giftId);
      const snapshot = await getDoc(docRef);
      
      if (snapshot.exists()) {
        await updateDoc(docRef, {
          personalizedMessage,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      // Fallback: find by field 'id'
      const q = query(this.experiencesCollection, where('id', '==', giftId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Experience gift not found');
      }

      const foundDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, 'experienceGifts', foundDoc.id), {
        personalizedMessage,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating personalized message:', error);
      throw error;
    }
  }
}

export const experienceGiftService = new ExperienceGiftService();
