// services/PartnerService.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase'; // adjust path
import { PartnerUser } from '../types';
import { logger } from '../utils/logger';

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
    try {
      const snap = await getDoc(doc(db, 'partnerUsers', id));
      if (!snap.exists()) return null;
      const data = snap.data() ?? {};
      return {
        // Required fields — provide safe fallbacks if the document is partially populated
        id: snap.id,
        userType: (data['userType'] as PartnerUser['userType']) ?? 'partner',
        isAdmin: (data['isAdmin'] as PartnerUser['isAdmin']) ?? false,
        name: (data['name'] as PartnerUser['name']) ?? '',
        createdFromInvite: (data['createdFromInvite'] as PartnerUser['createdFromInvite']) ?? '',
        // Optional fields — spread remaining document data (all are already optional on the type)
        email: data['email'] as PartnerUser['email'],
        contactEmail: data['contactEmail'] as PartnerUser['contactEmail'],
        phone: data['phone'] as PartnerUser['phone'],
        address: data['address'] as PartnerUser['address'],
        mapsUrl: data['mapsUrl'] as PartnerUser['mapsUrl'],
        emailVerified: data['emailVerified'] as PartnerUser['emailVerified'],
        status: data['status'] as PartnerUser['status'],
        preferredContact: data['preferredContact'] as PartnerUser['preferredContact'],
        createdAt: data['createdAt'] as PartnerUser['createdAt'],
        onboardedAt: data['onboardedAt'] as PartnerUser['onboardedAt'],
        updatedAt: data['updatedAt'] as PartnerUser['updatedAt'],
      };
    } catch (error: unknown) {
      logger.error('Error fetching partner:', error);
      return null;
    }
  },
};
