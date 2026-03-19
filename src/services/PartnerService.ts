// services/PartnerService.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase'; // adjust path
import { PartnerUser } from '../types';

export const partnerService = {
  /**
   * Fetch a partner's public profile by ID.
   *
   * NOTE: No auth gate is intentional here. The Firestore security rule already
   * allows authenticated `get` on `partnerUsers/{id}` for all signed-in users,
   * because partner info (name, logo, description) must be visible to any user
   * browsing experience cards — not just to the goal recipient. Adding an extra
   * client-side check would silently break experience browsing for users who
   * haven't purchased a gift yet.
   */
  async getPartnerById(id: string): Promise<PartnerUser | null> {
    const snap = await getDoc(doc(db, 'partnerUsers', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<PartnerUser, 'id'>) };
  },
};
