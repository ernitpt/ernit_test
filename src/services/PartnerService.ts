// services/PartnerService.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase'; // adjust path
import { PartnerUser } from '../types';

export const partnerService = {
  async getPartnerById(id: string): Promise<PartnerUser | null> {
    const snap = await getDoc(doc(db, 'partnerUsers', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<PartnerUser, 'id'>) };
  },
};
