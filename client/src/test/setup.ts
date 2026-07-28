import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';


// Global cleanup keeps tests isolated and prevents timer/mock leakage across files.
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});
