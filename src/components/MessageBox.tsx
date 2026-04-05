/**
 * MessageBox Component
 * Nachrichtenbox für WhatsApp/E-Mail/Telefonnotizen
 * Rohtext einfügen → Produktvorschlag → Vorgang erstellen
 *
 * Accessibility:
 * - ARIA-Labels für alle Formular-Elemente
 * - Keyboard-Navigation (Tab, Enter, Escape)
 * - Screenreader-Announcements für Produktvorschläge
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Message, ProductSuggestion, Customer, Salutation, GmailThread, GmailThreadFormatted } from '../types';
import {
  suggestProductFromMessage,
  extractRentalInfo,
  extractCustomerInfo,
  generateReplySuggestion
} from '../services/messageService';
import { parseMessageFromAI, isAIAvailable } from '../services/aiService';
import { announceToScreenreader, generateId } from '../utils/accessibility';
import { createCustomer as createCustomerInDB } from '../services/sqliteService';
import { logger } from '../services/logger';
import {
  searchByEmail,
  formatGmailThread,
  isGmailAuthenticated
} from '../services/googleGmailService';
import CustomerForm from './CustomerForm';

interface MessageBoxProps {
  customers: Customer[];
  onCustomerCreate?: (customer: Customer) => Promise<void>;
  onRentalRequestCreate: (data: {
    customerId: string;
    productType: string;
    rentalStart: number;
    rentalEnd: number;
    message: string;
    channel: string;
  }) => Promise<void>;
}

export const MessageBox: React.FC<MessageBoxProps> = ({ customers, onCustomerCreate, onRentalRequestCreate }) => {
  // IDs für ARIA-Verknüpfungen
  const channelSelectId = useRef(generateId('channel'));
  const messageTextareaId = useRef(generateId('message'));
  const customerSelectId = useRef(generateId('customer'));
  const searchInputId = useRef(generateId('search'));

  // Neue Nachricht
  const [newMessage, setNewMessage] = useState('');
  const [channel, setChannel] = useState<'WhatsApp' | 'E-Mail' | 'Telefonnotiz'>('WhatsApp');

  // Produktvorschlag
  const [productSuggestion, setProductSuggestion] = useState<ProductSuggestion | null>(null);

  // AI Vorschlag (optional)
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);

  // Kunden-Zuordnung
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);

  // Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterChannel, setFilterChannel] = useState<string>('alle');

  // Vorgang-Daten (aus Nachricht extrahiert)
  const [extractedData, setExtractedData] = useState<{
    rentalStart?: number;
    rentalEnd?: number;
    vehicleMake?: string;
    vehicleModel?: string;
  }>({});

  // Antwort-Vorschlag und Kunden-Extraktion
  const [replySuggestion, setReplySuggestion] = useState<string>('');
  const [extractedCustomerInfo, setExtractedCustomerInfo] = useState<{
    name?: string;
    salutation?: Salutation;
    firstName?: string;
    lastName?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    email?: string;
    phone?: string;
  }>({});

  // Gmail States
  const [gmailThreads, setGmailThreads] = useState<GmailThread[]>([]);
  const [selectedGmailThread, setSelectedGmailThread] = useState<GmailThreadFormatted | null>(null);
  const [isSearchingGmail, setIsSearchingGmail] = useState(false);

  // Produktvorschlag bei Text-Eingabe
  useEffect(() => {
    if (newMessage.length > 10) {
      const suggestion = suggestProductFromMessage(newMessage);
      setProductSuggestion(suggestion);

      // Screenreader-Announcement
      if (suggestion && suggestion.productType) {
        announceToScreenreader(
          `Produkt erkannt: ${suggestion.productType}. Konfidenz: ${Math.round(suggestion.confidence * 100)}%. ${suggestion.reason}`
        );

        // Zusätzlich: Mietdaten extrahieren
        const rentalInfo = extractRentalInfo(newMessage);
        setExtractedData(rentalInfo);

        // Kundeninfos extrahieren
        const customerInfo = extractCustomerInfo(newMessage);
        setExtractedCustomerInfo(customerInfo);

        // Antwort-Vorschlag generieren
        if (suggestion.productType) {
          const reply = generateReplySuggestion(
            newMessage,
            suggestion,
            rentalInfo
          );
          setReplySuggestion(reply);
        }
      }
    } else {
      setProductSuggestion(null);
      setReplySuggestion('');
      setExtractedCustomerInfo({});
    }
  }, [newMessage]);

  // AI Vorschlag abrufen (optional)
  const handleAISuggestion = async () => {
    if (!newMessage.trim()) return;

    // Prüfen ob AI verfügbar ist (hier hardcoded - sollte aus Settings kommen)
	    const config = {
      provider: 'zai' as const,
	      apiKey: '',
	      endpoint: '',
	      modelParse: '',
	      modelResponse: '',
	    };

    if (!isAIAvailable(config)) {
      alert('AI ist nicht konfiguriert. Bitte API-Key in den Einstellungen setzen.');
      return;
    }

    setIsAIProcessing(true);

    try {
      // AI Service aufrufen
      // const parsed = await parseMessageFromAI(newMessage, config);
      // setAiSuggestion(parsed);
      // setExtractedData({
      //   rentalStart: parsed.dates.start ? new Date(parsed.dates.start).getTime() : undefined,
      //   rentalEnd: parsed.dates.end ? new Date(parsed.dates.end).getTime() : undefined,
      //   vehicleMake: parsed.vehicle.make,
      //   vehicleModel: parsed.vehicle.model,
      // });

      // Placeholder für Demo
      setTimeout(() => {
        setIsAIProcessing(false);
        alert('AI Vorschlag erfolgt (Placeholder - API noch nicht konfiguriert)');
      }, 1000);
    } catch (error) {
      console.error('AI Vorschlag fehlgeschlagen:', error);
      setIsAIProcessing(false);
      alert('AI Vorschlag fehlgeschlagen. Bitte versuchen Sie es erneut.');
    }
  };

  // Vorgang erstellen
  const handleCreateRentalRequest = async () => {
    if (!newMessage.trim()) {
      alert('Bitte geben Sie eine Nachricht ein.');
      return;
    }

    if (!selectedCustomerId && !showNewCustomerForm) {
      alert('Bitte wählen Sie einen Kunden aus oder legen Sie einen neuen an.');
      return;
    }

    if (!productSuggestion) {
      alert('Konnte kein Produkt aus der Nachricht erkennen. Bitte wählen Sie manuell.');
      return;
    }

    if (!extractedData.rentalStart || !extractedData.rentalEnd) {
      alert('Bitte geben Sie Mietstart und Mietende an.');
      return;
    }

    try {
      await onRentalRequestCreate({
        customerId: selectedCustomerId,
        productType: productSuggestion.productType,
        rentalStart: extractedData.rentalStart,
        rentalEnd: extractedData.rentalEnd,
        message: newMessage,
        channel,
      });
    } catch (e) {
      console.error('Failed to create rental request:', e);
      alert('Konnte Vorgang nicht erstellen.');
      return;
    }

    // Reset
    setNewMessage('');
    setProductSuggestion(null);
    setExtractedData({});
    setSelectedCustomerId('');
  };

  // Kundenauswahl
  const filteredCustomers = customers.filter((customer) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.firstName.toLowerCase().includes(searchLower) ||
      customer.lastName.toLowerCase().includes(searchLower) ||
      customer.email.toLowerCase().includes(searchLower) ||
      customer.phone.toLowerCase().includes(searchLower)
    );
  });

  const createCustomer = async (customer: Customer) => {
    if (onCustomerCreate) {
      await onCustomerCreate(customer);
      return;
    }
    await createCustomerInDB(customer);
  };

  // Handler: Kunden aus extrahierten Daten erstellen
  const handleCreateCustomerFromExtraction = async () => {
    if (!extractedCustomerInfo.firstName || !extractedCustomerInfo.lastName) {
      alert('Keine ausreichenden Kundendaten extrahiert');
      return;
    }

    try {
      const now = Date.now();
      const newCustomer: Customer = {
        id: `customer_${now}`,
        salutation: extractedCustomerInfo.salutation,
        firstName: extractedCustomerInfo.firstName || '',
        lastName: extractedCustomerInfo.lastName || '',
        email: extractedCustomerInfo.email || '',
        phone: extractedCustomerInfo.phone || '',
        address: {
          street: '',
          city: '',
          zipCode: '',
          country: 'Deutschland',
        },
        notes: `Erstellt aus Nachricht: ${newMessage.substring(0, 100)}...`,
        contactDate: now,
        createdAt: now,
        updatedAt: now,
      };

      await createCustomer(newCustomer);
      logger.info(`Kunde aus Extraktion erstellt: ${newCustomer.firstName} ${newCustomer.lastName}`);

      // Kunde als ausgewählt setzen
      setSelectedCustomerId(newCustomer.id);
      setShowNewCustomerForm(false);

      // Erfolgsmeldung
      announceToScreenreader(`Kunde ${newCustomer.firstName} ${newCustomer.lastName} erstellt`, 'assertive');
    } catch (error) {
      logger.error('Fehler beim Erstellen des Kunden aus Extraktion:', error);
      alert('Fehler beim Erstellen des Kunden');
    }
  };

  const newCustomerPrefill = useMemo<Customer>(() => {
    const now = Date.now();
    return {
      id: '',
      salutation: extractedCustomerInfo.salutation,
      firstName: extractedCustomerInfo.firstName || '',
      lastName: extractedCustomerInfo.lastName || '',
      email: extractedCustomerInfo.email || '',
      phone: extractedCustomerInfo.phone || '',
      address: {
        street: '',
        city: '',
        zipCode: '',
        country: 'Deutschland',
      },
      notes: newMessage?.trim()
        ? `Erstellt aus Nachrichtenbox: ${newMessage.substring(0, 200)}${newMessage.length > 200 ? '...' : ''}`
        : undefined,
      contactDate: now,
      createdAt: 0,
      updatedAt: 0,
      roofRailPhotoDataUrl: undefined,
    };
  }, [
    extractedCustomerInfo.email,
    extractedCustomerInfo.firstName,
    extractedCustomerInfo.lastName,
    extractedCustomerInfo.phone,
    extractedCustomerInfo.salutation,
    newMessage,
  ]);

  // Handler: Antwort kopieren
  const handleCopyReply = () => {
    navigator.clipboard.writeText(replySuggestion);
    announceToScreenreader('Antwort in die Zwischenablage kopiert', 'assertive');
  };

  // Handler: Als E-Mail öffnen
  const handleOpenEmail = () => {
    const subject = encodeURIComponent('Re: Anfrage Dachbox');
    const body = encodeURIComponent(replySuggestion);
    const approved = window.confirm(
      'Bitte E-Mail-Inhalt vor dem Versand manuell pruefen. Der Entwurf wird jetzt geoeffnet und kann angepasst werden. Fortfahren?'
    );
    if (!approved) return;
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  // Handler: Gmail durchsuchen
  const handleSearchGmail = async () => {
    if (!extractedCustomerInfo.email) {
      alert('Keine E-Mail-Adresse extrahiert. Bitte geben Sie eine Nachricht mit E-Mail-Adresse ein.');
      return;
    }

    if (!(await isGmailAuthenticated())) {
      alert('Gmail API ist nicht authentifiziert. Bitte testen Sie die Verbindung in den Einstellungen.');
      return;
    }

    setIsSearchingGmail(true);

    try {
      const threads = await searchByEmail(extractedCustomerInfo.email, 10);
      setGmailThreads(threads);
      logger.info(`Gmail Suche gefunden: ${threads.length} Threads für ${extractedCustomerInfo.email}`);
      announceToScreenreader(`${threads.length} Konversationen in Gmail gefunden`, 'assertive');
    } catch (error) {
      logger.error('Gmail Suche fehlgeschlagen:', error);
      alert('Gmail Suche fehlgeschlagen. Bitte prüfen Sie die Verbindung.');
    } finally {
      setIsSearchingGmail(false);
    }
  };

  // Handler: Gmail Thread auswählen
  const handleSelectGmailThread = async (thread: GmailThread) => {
    const formatted = formatGmailThread(thread);
    setSelectedGmailThread(formatted);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-xl font-semibold text-gray-900">Nachrichtenbox</h2>
        <p className="text-sm text-gray-600 mt-1">
          WhatsApp/E-Mail/Telefonnotizen einfügen → Produkt erkennen → Vorgang erstellen
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Neue Nachricht */}
        <div className="mb-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Neue Nachricht einfügen</h3>

          {/* Channel-Dropdown */}
          <div className="mb-3">
            <label htmlFor={channelSelectId.current} className="block text-sm font-medium text-gray-700 mb-1">
              Kanal wählen
            </label>
            <select
              id={channelSelectId.current}
              value={channel}
              onChange={(e) => setChannel(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              aria-describedby="channel-description"
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="E-Mail">E-Mail</option>
              <option value="Telefonnotiz">Telefonnotiz</option>
            </select>
            <span id="channel-description" className="sr-only">
              Wählen Sie den Kanal aus, über den die Nachricht empfangen wurde
            </span>
          </div>

          {/* Textarea */}
          <div className="mb-3">
            <label htmlFor={messageTextareaId.current} className="block text-sm font-medium text-gray-700 mb-1">
              Nachricht einfügen
            </label>
            <textarea
              id={messageTextareaId.current}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Neue Nachricht hier einfügen..."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              aria-describedby="message-description"
              aria-live="polite"
            />
            <span id="message-description" className="sr-only">
              Fügen Sie hier den Rohtext der WhatsApp/E-Mail/Telefonnotiz ein. Das System wird automatisch das Produkt erkennen.
            </span>
          </div>

          {/* Produktvorschlag */}
          {productSuggestion && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-blue-900">Erkanntes Produkt:</span>
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-semibold">
                    {productSuggestion.productType}
                  </span>
                  {productSuggestion.alternativeProductType && (
                    <span className="ml-2 text-xs text-blue-600">
                      (Alternative: {productSuggestion.alternativeProductType})
                    </span>
                  )}
                </div>
                <div className="text-xs text-blue-700">
                  Konfidenz: {Math.round(productSuggestion.confidence * 100)}%
                </div>
              </div>
              <p className="text-xs text-blue-700 mt-1">{productSuggestion.reason}</p>
            </div>
          )}

          {/* AI Vorschlag Button (optional) */}
          <div className="mb-3">
            <button
              onClick={handleAISuggestion}
              disabled={isAIProcessing || !newMessage.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              aria-label="Künstliche Intelligenz Vorschlag generieren"
              aria-busy={isAIProcessing}
            >
              {isAIProcessing ? 'AI analysiert...' : '✨ AI Vorschlag (optional)'}
            </button>
          </div>

          {/* Kunden-Zuordnung */}
          <div className="mb-3">
            <label htmlFor={customerSelectId.current} className="block text-sm font-medium text-gray-700 mb-1">
              Kunde zuordnen
            </label>
            <div className="flex gap-2">
              <select
                id={customerSelectId.current}
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setShowNewCustomerForm(false);
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                aria-describedby="customer-description"
              >
                <option value="">-- Kunde wählen --</option>
                {filteredCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.lastName}, {customer.firstName} ({customer.email})
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowNewCustomerForm(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                aria-label="Neuen Kunden anlegen"
              >
                + Neu
              </button>
            </div>
            <span id="customer-description" className="sr-only">
              Wählen Sie einen vorhandenen Kunden aus oder legen Sie einen neuen an
            </span>

            {/* Suchfeld für Kunden */}
            <div className="mt-2">
              <label htmlFor={searchInputId.current} className="sr-only">
                Kunde suchen
              </label>
              <input
                id={searchInputId.current}
                type="text"
                placeholder="Kunde suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                aria-describedby="search-hint"
              />
              <span id="search-hint" className="sr-only">
                Geben Sie Name, E-Mail oder Telefonnummer ein, um die Kundenliste zu filtern
              </span>
            </div>
          </div>

          {/* Neuer Kunde anlegen (Modal) */}
          {showNewCustomerForm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Neuen Kunden anlegen"
              onClick={() => setShowNewCustomerForm(false)}
            >
              <div
                className="w-full max-w-3xl rounded-lg bg-white shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <div>
                    <div className="text-base font-semibold text-slate-900">Neuen Kunden anlegen</div>
                    <div className="text-sm text-slate-600">Privatkunde (B2C)</div>
                  </div>
                  <button
                    onClick={() => setShowNewCustomerForm(false)}
                    className="text-slate-500 hover:text-slate-800 px-2 py-1 rounded"
                    aria-label="Dialog schließen"
                  >
                    ✕
                  </button>
                </div>

                <CustomerForm
                  customer={newCustomerPrefill}
                  allCustomers={customers}
                  onCancel={() => setShowNewCustomerForm(false)}
                  onSubmit={async (c) => {
                    try {
                      await createCustomer(c);
                      setSelectedCustomerId(c.id);
                      setShowNewCustomerForm(false);
                      announceToScreenreader(`Kunde ${c.firstName} ${c.lastName} erstellt`, 'assertive');
                    } catch (e) {
                      console.error('Failed to create customer from Nachrichtenbox:', e);
                      alert('Kunde konnte nicht erstellt werden.');
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Extrahierte Daten */}
          {(extractedData.rentalStart || extractedData.rentalEnd) && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <h4 className="text-sm font-medium text-yellow-900 mb-2">Extrahierte Daten:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {extractedData.rentalStart && (
                  <div>
                    <span className="font-medium">Start:</span>{' '}
                    {new Date(extractedData.rentalStart).toLocaleDateString('de-DE')}
                  </div>
                )}
                {extractedData.rentalEnd && (
                  <div>
                    <span className="font-medium">Ende:</span>{' '}
                    {new Date(extractedData.rentalEnd).toLocaleDateString('de-DE')}
                  </div>
                )}
                {extractedData.vehicleMake && (
                  <div>
                    <span className="font-medium">Fahrzeug:</span>{' '}
                    {extractedData.vehicleMake} {extractedData.vehicleModel || ''}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Antwort-Vorschlag */}
          {replySuggestion && (
            <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <span>💬</span>
                Vorgeschlagene Antwort
              </h4>
              <textarea
                value={replySuggestion}
                onChange={(e) => setReplySuggestion(e.target.value)}
                className="w-full px-3 py-2 border border-blue-300 rounded-md text-sm bg-white"
                rows={8}
                aria-label="Vorgeschlagene Antwort - Sie können diese anpassen"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCopyReply}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 flex items-center gap-1"
                  aria-label="Antwort in die Zwischenablage kopieren"
                >
                  <span>📋</span> Kopieren
                </button>
                <button
                  onClick={handleOpenEmail}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 flex items-center gap-1"
                  aria-label="Als E-Mail öffnen"
                >
                  <span>✉️</span> Als E-Mail öffnen
                </button>
              </div>
            </div>
          )}

          {/* Extrahierte Kundeninfos */}
          {extractedCustomerInfo.name && (
            <div className="mb-3 p-4 bg-green-50 border border-green-200 rounded-md">
              <h4 className="text-sm font-semibold text-green-900 mb-2 flex items-center gap-2">
                <span>👤</span>
                Erkannte Kundeninformationen
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                {extractedCustomerInfo.salutation && (
                  <div>
                    <span className="font-medium">Anrede:</span> {extractedCustomerInfo.salutation}
                  </div>
                )}
                {extractedCustomerInfo.name && (
                  <div>
                    <span className="font-medium">Name:</span> {extractedCustomerInfo.name}
                  </div>
                )}
                {extractedCustomerInfo.vehicleMake && (
                  <div>
                    <span className="font-medium">Fahrzeug:</span>{' '}
                    {extractedCustomerInfo.vehicleMake} {extractedCustomerInfo.vehicleModel || ''}
                  </div>
                )}
                {extractedCustomerInfo.email && (
                  <div>
                    <span className="font-medium">E-Mail:</span> {extractedCustomerInfo.email}
                  </div>
                )}
                {extractedCustomerInfo.phone && (
                  <div>
                    <span className="font-medium">Telefon:</span> {extractedCustomerInfo.phone}
                  </div>
                )}
              </div>
              <button
                onClick={handleCreateCustomerFromExtraction}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center justify-center gap-2"
                aria-label="Kunden aus extrahierten Daten anlegen"
              >
                <span>👤</span>
                Kunden aus diesen Daten anlegen
              </button>
            </div>
          )}

          {/* Gmail Integration */}
          {extractedCustomerInfo.email && (
            <div className="mb-3">
              <button
                onClick={handleSearchGmail}
                disabled={isSearchingGmail}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
                aria-label="Gmail nach Konversationen dieses Kunden durchsuchen"
                aria-busy={isSearchingGmail}
              >
                <span>📧</span>
                {isSearchingGmail ? 'Suche in Gmail...' : 'Gmail durchsuchen'}
              </button>
            </div>
          )}

          {/* Gmail Threads Liste */}
          {gmailThreads.length > 0 && (
            <div className="mb-3 p-4 bg-purple-50 border border-purple-200 rounded-md">
              <h4 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                <span>📧</span>
                Gefundene Konversationen ({gmailThreads.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
	                {gmailThreads.map((thread) => (
                  <div
                    key={thread.id}
                    onClick={() => handleSelectGmailThread(thread)}
                    className="p-3 bg-white border border-purple-200 rounded-md cursor-pointer hover:bg-purple-50 transition-colors"
                  >
	                    <div className="text-sm font-medium text-purple-900">
	                      {thread.snippet ? 'Thread gefunden' : 'Thread'}
	                    </div>
	                    <div className="text-xs text-gray-600 truncate">
	                      {thread.snippet}
	                    </div>
	                  </div>
	                ))}
              </div>
            </div>
          )}

          {/* Gmail Thread Details */}
          {selectedGmailThread && (
            <div className="mb-3 p-4 bg-white border border-gray-200 rounded-md">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span>💬</span>
                  Konversation
                </h4>
                <button
                  onClick={() => setSelectedGmailThread(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Konversation schließen"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
	                {(selectedGmailThread.messages || []).map((msg) => (
	                  <div key={msg.id} className="p-3 bg-gray-50 rounded">
	                    <div className="text-xs text-gray-500 mb-1">
	                      {msg.date ? new Date(msg.date).toLocaleString('de-DE') : '-'} • {msg.from || '-'}
	                    </div>
	                    <div className="text-sm text-gray-800">
	                      {msg.body || ''}
	                    </div>
                    {msg.body && (
                      <div className="text-sm text-gray-700 mt-2 p-2 bg-white rounded border border-gray-200">
                        {msg.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vorgang erstellen Button */}
          <button
            onClick={handleCreateRentalRequest}
            disabled={!productSuggestion || !selectedCustomerId}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold text-lg"
            aria-label={
              !productSuggestion
                ? 'Vorgang erstellen - Bitte warten Sie auf Produkterkennung'
                : !selectedCustomerId
                ? 'Vorgang erstellen - Bitte wählen Sie einen Kunden aus'
                : `Vorgang erstellen für Produkt ${productSuggestion.productType}`
            }
          >
            Vorgang erstellen
          </button>
        </div>

        {/* Nachrichten-Liste (Placeholder) */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Nachrichten-Verlauf</h3>
            <div className="flex items-center gap-2">
              <label htmlFor="filter-channel" className="sr-only">
                Nachrichten filtern
              </label>
              <select
                id="filter-channel"
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                aria-label="Nachrichten nach Kanal filtern"
              >
                <option value="alle">Alle Kanäle</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="E-Mail">E-Mail</option>
                <option value="Telefonnotiz">Telefonnotiz</option>
              </select>
            </div>
          </div>

          {/* Placeholder für Nachrichten-Liste */}
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>Noch keine Nachrichten vorhanden.</p>
            <p className="mt-1">Fügen Sie oben eine neue Nachricht ein.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
