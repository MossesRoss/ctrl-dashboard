import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Dashboard from './App';

// Mock Firebase
vi.mock('./firebase', () => ({
  db: {},
  auth: {},
  APP_ID: 'test-app',
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  orderBy: vi.fn(),
}));

test('renders loading state initially', () => {
  render(<Dashboard />);
  expect(screen.getByText(/Initialising Intelligence/i)).toBeInTheDocument();
});
