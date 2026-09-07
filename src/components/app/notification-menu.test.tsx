import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Notification } from '@/types';
import { NotificationMenu } from './notification-menu';

const mockState = {
  notifications: [] as Notification[],
  unreadCount: 0,
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
};

vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => mockState,
}));

function renderMenu() {
  return render(
    <MemoryRouter>
      <NotificationMenu />
    </MemoryRouter>,
  );
}

describe('NotificationMenu', () => {
  beforeEach(() => {
    mockState.notifications = [];
    mockState.unreadCount = 0;
    mockState.loading = false;
    mockState.markAllRead = vi.fn();
    mockState.markRead = vi.fn();
  });

  it('shows no badge and an all-caught-up state when there is nothing to show', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('shows the unread count and real notification titles', async () => {
    mockState.unreadCount = 3;
    mockState.notifications = [
      {
        id: 'n1',
        companyId: 'c1',
        dedupeKey: 'k1',
        category: 'bank_reconciliation',
        severity: 'critical',
        sourceModule: 'banking',
        title: '5 unresolved bank reconciliation issues',
        status: 'open',
        eventSeq: 1,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        metadata: {},
        isUnread: true,
      },
    ];
    renderMenu();
    expect(screen.getByRole('button', { name: /3 unread/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('5 unresolved bank reconciliation issues')).toBeInTheDocument();
    expect(screen.getByText('View all notifications')).toBeInTheDocument();
  });

  it('marks all read from the popover', async () => {
    mockState.unreadCount = 2;
    mockState.notifications = [
      {
        id: 'n1', companyId: 'c1', dedupeKey: 'k1', category: 'security', severity: 'warning',
        sourceModule: 'admin', title: 'Blocked access attempts', status: 'open', eventSeq: 1,
        firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), metadata: {}, isUnread: true,
      },
    ];
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(mockState.markAllRead).toHaveBeenCalled());
  });
});
