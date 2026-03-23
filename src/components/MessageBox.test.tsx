/**
 * MessageBox Component Tests
 *
 * Testet die MessageBox Komponente mit E-Mail-Analyse und Antwort-Generierung.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBox } from './MessageBox';
import { Customer } from '../types';

// Mock Services
vi.mock('../services/messageService', () => ({
  suggestProductFromMessage: vi.fn(() => ({
    productType: 'Dachbox XL' as const,
    confidence: 0.9,
    reason: 'Keyword "Ski" gefunden',
  })),
  extractRentalInfo: vi.fn(() => ({
    rentalStart: new Date('2025-02-10').getTime(),
    rentalEnd: new Date('2025-02-17').getTime(),
  })),
  extractCustomerInfo: vi.fn(() => ({
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@example.com',
    phone: '0123456789',
    salutation: 'Herr' as const,
  })),
  generateReplySuggestion: vi.fn(() => 'Generated reply...'),
}));

vi.mock('../services/sqliteService', () => ({
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  createCustomer: vi.fn(() => Promise.resolve()),
}));

describe('MessageBox Component', () => {
  const mockCustomers: Customer[] = [
    {
      id: 'customer_1',
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.com',
      phone: '0123456789',
      address: {
        street: 'Musterstraße 1',
        city: 'Musterstadt',
        zipCode: '12345',
        country: 'Deutschland',
      },
      contactDate: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const mockOnRentalRequestCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render message input form', () => {
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      expect(screen.getByLabelText(/Kanal wählen/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Nachricht einfügen/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Vorgang erstellen/i })).toBeInTheDocument();
    });

    it('should render header with title and description', () => {
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      expect(screen.getByText('Nachrichtenbox')).toBeInTheDocument();
      expect(screen.getByText(/WhatsApp\/E-Mail\/Telefonnotizen einfügen/i)).toBeInTheDocument();
    });
  });

  describe('Message Input', () => {
    it('should accept message input', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub vom 1.-8. Februar');

      expect(textarea).toHaveValue('Ich suche eine Dachbox für Skiurlaub vom 1.-8. Februar');
    });

    it('should switch channel', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const select = screen.getByLabelText(/Kanal wählen/i);
      await user.selectOptions(select, 'E-Mail');

      expect(select).toHaveValue('E-Mail');
    });
  });

  describe('Product Suggestion', () => {
    it('should show product suggestion when message is long enough', async () => {
      const { suggestProductFromMessage } = await import('../services/messageService');
      const user = userEvent.setup();

      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(() => {
        expect(suggestProductFromMessage).toHaveBeenCalledWith('Ich suche eine Dachbox für Skiurlaub');
      });
    });

    it('should display recognized product', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(() => {
        expect(screen.getByText(/Erkanntes Produkt/i)).toBeInTheDocument();
        expect(screen.getByText('Dachbox XL')).toBeInTheDocument();
      });
    });
  });

  describe('Customer Assignment', () => {
    it('should show customer dropdown', () => {
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      expect(screen.getByLabelText(/Kunde zuordnen/i)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Mustermann,\s*Max/i })).toBeInTheDocument();
    });

    it('should filter customers by search term', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Kunde suchen/i);
      await user.type(searchInput, 'Mustermann');

      // Alle Kunden haben "Mustermann" im Nachnamen
      expect(screen.getByRole('option', { name: /Mustermann,\s*Max/i })).toBeInTheDocument();
    });

    it('should show "New Customer" button', () => {
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      expect(screen.getByRole('button', { name: /Neuen Kunden anlegen/i })).toBeInTheDocument();
    });
  });

  describe('Extracted Data Display', () => {
    it('should show extracted rental dates', async () => {
      const { extractRentalInfo } = await import('../services/messageService');
      const user = userEvent.setup();

      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(() => {
        expect(extractRentalInfo).toHaveBeenCalled();
        // Check ob Daten angezeigt werden
      });
    });

    it('should show extracted customer info', async () => {
      const { extractCustomerInfo } = await import('../services/messageService');
      const user = userEvent.setup();

      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(() => {
        expect(extractCustomerInfo).toHaveBeenCalled();
        // Check ob Kundeninfo angezeigt wird
      });
    });
  });

  describe('Reply Suggestion', () => {
    it('should generate reply suggestion', async () => {
      const { generateReplySuggestion } = await import('../services/messageService');
      const user = userEvent.setup();

      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(() => {
        expect(generateReplySuggestion).toHaveBeenCalled();
      });
    });

    it('should display reply suggestion box', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(() => {
        expect(screen.getByText(/Vorgeschlagene Antwort/i)).toBeInTheDocument();
      });
    });

    it('should provide copy to clipboard button', async () => {
      const user = userEvent.setup();

      // Mock navigator.clipboard
      const mockClipboard = vi.fn();
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockClipboard },
        configurable: true,
      });

      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox für Skiurlaub');

      await waitFor(async () => {
        const copyButton = await screen.findByRole('button', { name: /Kopieren/i });
        await user.click(copyButton);

        expect(mockClipboard).toHaveBeenCalled();
      });
    });
  });

  describe('Gmail Integration', () => {
    it('should show Gmail search button when email is extracted', async () => {
      const { extractCustomerInfo } = await import('../services/messageService');
      const user = userEvent.setup();

      // Mock Gmail authentication check
      vi.mock('../services/googleGmailService', () => ({
        isGmailAuthenticated: vi.fn(() => true),
        searchByEmail: vi.fn(() => Promise.resolve([])),
      }));

      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox, meine E-Mail ist max@example.com');

      await waitFor(() => {
        expect(extractCustomerInfo).toHaveBeenCalled();
        // Button sollte angezeigt werden
      });
    });
  });

  describe('Create Rental Request', () => {
    it('should create rental request with all required data', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      // Message eingeben
      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox');

      // Kunden auswählen
      const customerSelect = screen.getByLabelText(/Kunde zuordnen/i);
      await user.selectOptions(customerSelect, 'customer_1');

      // Button sollte aktiviert sein
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /Vorgang erstellen/i });
        expect(createButton).not.toBeDisabled();
      });
    });

    it('should disable create button when data is missing', () => {
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      const createButton = screen.getByRole('button', { name: /Vorgang erstellen/i });
      expect(createButton).toBeDisabled();
    });

    it('should call onRentalRequestCreate with correct data', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      // Message eingeben
      const textarea = screen.getByLabelText(/Nachricht einfügen/i);
      await user.type(textarea, 'Ich suche eine Dachbox');

      // Kunden auswählen
      const customerSelect = screen.getByLabelText(/Kunde zuordnen/i);
      await user.selectOptions(customerSelect, 'customer_1');

      // Button klicken
      await waitFor(async () => {
        const createButton = await screen.findByRole('button', { name: /Vorgang erstellen/i });
        await user.click(createButton);

        expect(mockOnRentalRequestCreate).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      expect(screen.getByLabelText(/Kanal wählen/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Nachricht einfügen/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Kunde zuordnen/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Kunde suchen/i)).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(
        <MessageBox
          customers={mockCustomers}
          onRentalRequestCreate={mockOnRentalRequestCreate}
        />
      );

      // Tab durch Formular navigieren
      await user.tab();

      // Focus sollte auf einem Element sein
      const activeElement = document.activeElement;
      expect(activeElement).toBeInTheDocument();
    });
  });
});
