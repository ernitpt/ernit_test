/**
 * @jest-environment node
 *
 * Unit tests for CartService.mergeCarts — a pure synchronous function that
 * merges a guest cart into a user cart. No storage, no React Native APIs.
 */

import { CartService } from '../CartService';
import type { CartItem } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const item = (experienceId: string, quantity: number): CartItem => ({
  experienceId,
  quantity,
});

// ---------------------------------------------------------------------------
// mergeCarts
// ---------------------------------------------------------------------------

describe('CartService.mergeCarts', () => {
  // ── empty inputs ──────────────────────────────────────────────────────────

  it('returns an empty array when both carts are empty', () => {
    expect(CartService.mergeCarts([], [])).toEqual([]);
  });

  it('returns user items when guest cart is empty', () => {
    const userCart = [item('exp-1', 2), item('exp-2', 1)];
    const result = CartService.mergeCarts([], userCart);
    expect(result).toEqual(userCart);
  });

  it('returns guest items when user cart is empty', () => {
    const guestCart = [item('exp-1', 3)];
    const result = CartService.mergeCarts(guestCart, []);
    expect(result).toEqual(guestCart);
  });

  // ── no overlap ────────────────────────────────────────────────────────────

  it('preserves all items when carts have no common experienceIds', () => {
    const guestCart = [item('exp-A', 1)];
    const userCart  = [item('exp-B', 2)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result).toHaveLength(2);
    expect(result.find(i => i.experienceId === 'exp-A')).toBeDefined();
    expect(result.find(i => i.experienceId === 'exp-B')).toBeDefined();
  });

  it('appends multiple guest items that are absent from the user cart', () => {
    const guestCart = [item('exp-C', 1), item('exp-D', 2)];
    const userCart  = [item('exp-A', 1)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result).toHaveLength(3);
    expect(result.map(i => i.experienceId)).toContain('exp-C');
    expect(result.map(i => i.experienceId)).toContain('exp-D');
  });

  // ── quantity merging ──────────────────────────────────────────────────────

  it('sums quantities when both carts contain the same experienceId', () => {
    const guestCart = [item('exp-1', 3)];
    const userCart  = [item('exp-1', 4)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(7); // 4 + 3
  });

  it('caps merged quantity at 10', () => {
    const guestCart = [item('exp-1', 6)];
    const userCart  = [item('exp-1', 8)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result[0].quantity).toBe(10); // capped
  });

  it('caps at exactly 10 when combined total equals 10', () => {
    const guestCart = [item('exp-1', 4)];
    const userCart  = [item('exp-1', 6)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result[0].quantity).toBe(10);
  });

  it('handles guest quantity + user quantity = 11 → capped at 10', () => {
    const guestCart = [item('exp-X', 5)];
    const userCart  = [item('exp-X', 6)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result[0].quantity).toBe(10);
  });

  it('does not mutate the input user cart array', () => {
    const guestCart = [item('exp-1', 2)];
    const userCart  = [item('exp-1', 1)];
    const originalUserCart = JSON.parse(JSON.stringify(userCart));

    CartService.mergeCarts(guestCart, userCart);

    expect(userCart).toEqual(originalUserCart);
  });

  // ── mixed overlap + non-overlap ───────────────────────────────────────────

  it('sums overlapping items and preserves non-overlapping items', () => {
    const guestCart = [item('exp-A', 2), item('exp-B', 3)];
    const userCart  = [item('exp-A', 1), item('exp-C', 5)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result).toHaveLength(3);

    const a = result.find(i => i.experienceId === 'exp-A');
    const b = result.find(i => i.experienceId === 'exp-B');
    const c = result.find(i => i.experienceId === 'exp-C');

    expect(a?.quantity).toBe(3);  // 1 + 2
    expect(b?.quantity).toBe(3);  // guest only
    expect(c?.quantity).toBe(5);  // user only
  });

  // ── edge cases: zero or negative guest quantities ─────────────────────────

  it('handles guest quantity of 0 gracefully (quantity stays as user value)', () => {
    const guestCart = [item('exp-1', 0)];
    const userCart  = [item('exp-1', 3)];
    const result = CartService.mergeCarts(guestCart, userCart);

    // 0 + 3 = 3 — well within cap
    expect(result[0].quantity).toBe(3);
  });

  it('handles guest quantity of -1 (reduces user quantity — current implementation behaviour)', () => {
    // The function does not validate negative quantities; it just adds them.
    // This test documents the current behaviour so any future guard is detectable.
    const guestCart = [item('exp-1', -1)];
    const userCart  = [item('exp-1', 5)];
    const result = CartService.mergeCarts(guestCart, userCart);

    // Math.min(5 + (-1), 10) = Math.min(4, 10) = 4
    expect(result[0].quantity).toBe(4);
  });

  it('handles a guest cart with multiple items all exceeding the cap', () => {
    const guestCart = [item('exp-1', 10), item('exp-2', 10)];
    const userCart  = [item('exp-1', 10), item('exp-2', 5)];
    const result = CartService.mergeCarts(guestCart, userCart);

    const one = result.find(i => i.experienceId === 'exp-1');
    const two = result.find(i => i.experienceId === 'exp-2');
    expect(one?.quantity).toBe(10); // 10 + 10 → capped
    expect(two?.quantity).toBe(10); // 5 + 10 → capped
  });

  // ── result ordering ───────────────────────────────────────────────────────

  it('user-cart items appear before newly-added guest-only items', () => {
    // The implementation starts with [...userCart] and pushes guest-only items at the end.
    const guestCart = [item('exp-Z', 1)];
    const userCart  = [item('exp-A', 2), item('exp-B', 1)];
    const result = CartService.mergeCarts(guestCart, userCart);

    expect(result[0].experienceId).toBe('exp-A');
    expect(result[1].experienceId).toBe('exp-B');
    expect(result[2].experienceId).toBe('exp-Z');
  });
});
