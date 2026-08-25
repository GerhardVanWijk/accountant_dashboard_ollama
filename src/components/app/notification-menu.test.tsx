import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationMenu } from './notification-menu';

/**
 * M10: replaced the mock alert list (VAT201/provisional-tax/overdue-invoice
 * items that looked real but were fabricated) with an honest empty state —
 * this app has no notifications backend. No unread badge, no fake items.
 */
describe('NotificationMenu', () => {
  it('shows an honest empty state instead of fabricated alerts', () => {
    render(<NotificationMenu />);

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByText(/VAT201/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it('shows no unread-count badge', () => {
    render(<NotificationMenu />);
    expect(screen.getByRole('button', { name: /notifications/i })).toHaveAccessibleName('Notifications');
  });
});
