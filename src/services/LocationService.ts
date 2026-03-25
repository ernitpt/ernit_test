import { Platform } from 'react-native';
import { logger } from '../utils/logger';

// Dynamic import to avoid bundle crash when expo-location is not installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Location: any = null;
const getLocation = async () => {
    if (!Location && Platform.OS !== 'web') {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Location = await (Function('return import("expo-location")')() as Promise<any>);
        } catch {
            logger.warn('expo-location not installed. GPS features disabled.');
        }
    }
    return Location;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coordinates {
    lat: number;
    lng: number;
}

interface VenueProximityResult {
    isNearby: boolean;
    distanceMeters: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RADIUS_METERS = 150;
const EARTH_RADIUS_METERS = 6371000;

// ─── LocationService ──────────────────────────────────────────────────────────

class LocationService {
    /**
     * Request foreground location permissions from the user.
     * On web, permissions are handled automatically by the browser
     * when `getCurrentPosition` is first called — so this returns true early.
     *
     * @returns true if permissions were granted (or web), false if denied/failed.
     */
    async requestPermissions(): Promise<boolean> {
        if (Platform.OS === 'web') {
            // Browser handles permission prompts automatically on first geolocation call.
            logger.info('[LocationService] Web platform — permissions deferred to browser.');
            return true;
        }

        try {
            const Loc = await getLocation();
            if (!Loc) return false;
            const { status } = await Loc.requestForegroundPermissionsAsync();
            const granted = status === Loc.PermissionStatus.GRANTED;

            if (granted) {
                logger.info('[LocationService] Foreground location permission granted.');
            } else {
                logger.warn('[LocationService] Foreground location permission denied. Status:', status);
            }

            return granted;
        } catch (error) {
            logger.error('[LocationService] Failed to request location permissions:', error);
            return false;
        }
    }

    /**
     * Retrieve the device's current GPS position.
     * Uses `navigator.geolocation` on web and `expo-location` on native.
     *
     * @returns Coordinates { lat, lng } or null if unavailable/denied.
     */
    async getCurrentPosition(): Promise<Coordinates | null> {
        if (Platform.OS === 'web') {
            return this._getCurrentPositionWeb();
        }

        return this._getCurrentPositionNative();
    }

    /**
     * Determine whether the user is within a given radius of a venue.
     * Defaults to 150 metres if no radius is supplied.
     *
     * @param venueLocation  The venue's GPS coordinates.
     * @param radiusMeters   Acceptable proximity in metres (default 150).
     * @returns { isNearby, distanceMeters }
     */
    async isAtVenue(
        venueLocation: Coordinates,
        radiusMeters: number = DEFAULT_RADIUS_METERS,
    ): Promise<VenueProximityResult> {
        const fallback: VenueProximityResult = { isNearby: false, distanceMeters: Infinity };

        const position = await this.getCurrentPosition();

        if (!position) {
            logger.warn('[LocationService] Cannot verify venue proximity — position unavailable.');
            return fallback;
        }

        const distanceMeters = this.calculateDistance(
            position.lat,
            position.lng,
            venueLocation.lat,
            venueLocation.lng,
        );

        const isNearby = distanceMeters <= radiusMeters;

        logger.info(
            `[LocationService] Distance to venue: ${distanceMeters.toFixed(1)}m ` +
            `(radius: ${radiusMeters}m, isNearby: ${isNearby})`,
        );

        return { isNearby, distanceMeters };
    }

    /**
     * Calculate the great-circle distance between two GPS coordinates
     * using the Haversine formula.
     *
     * @returns Distance in metres.
     */
    calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const toRad = (deg: number) => (deg * Math.PI) / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS_METERS * c;
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    /** Native (iOS / Android) implementation via expo-location. */
    private async _getCurrentPositionNative(): Promise<Coordinates | null> {
        try {
            const Loc = await getLocation();
            if (!Loc) return null;

            // Verify permission before attempting to read position.
            const { status } = await Loc.getForegroundPermissionsAsync();

            if (status !== Loc.PermissionStatus.GRANTED) {
                logger.warn('[LocationService] Native: location permission not granted.');
                return null;
            }

            const location = await Loc.getCurrentPositionAsync({
                accuracy: Loc.Accuracy.Balanced,
            });

            return {
                lat: location.coords.latitude,
                lng: location.coords.longitude,
            };
        } catch (error) {
            logger.error('[LocationService] Native: failed to get current position:', error);
            return null;
        }
    }

    /** Web implementation via the browser's Geolocation API. */
    private _getCurrentPositionWeb(): Promise<Coordinates | null> {
        return new Promise((resolve) => {
            if (typeof navigator === 'undefined' || !navigator.geolocation) {
                logger.warn('[LocationService] Web: Geolocation API not available in this browser.');
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (error) => {
                    logger.error('[LocationService] Web: Geolocation error:', error.message);
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,       // 10 s
                    maximumAge: 30000,    // accept a cached fix up to 30 s old
                },
            );
        });
    }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const locationService = new LocationService();
export default locationService;
