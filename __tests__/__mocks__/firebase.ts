// Minimal Firebase mock for unit tests
export const getFirestore = () => ({});
export const collection = () => ({});
export const addDoc = jest.fn().mockResolvedValue({ id: 'mock-id' });
export const getAuth = () => ({ currentUser: null });
