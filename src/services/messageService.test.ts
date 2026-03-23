import { describe, expect, it } from 'vitest';
import { detectDachboxRejectionReason, extractCustomerInfo, suggestProductFromMessage } from './messageService';

describe('extractCustomerInfo - address parsing', () => {
  it('parses multi-line street + zip/city without requiring "Adresse:" label', () => {
    const text = `Hallo,\nBoulognestr.64\n66482 Zweibrücken\nGrüße`;
    const out = extractCustomerInfo(text);
    expect(out.address?.street).toBe('Boulognestr. 64');
    expect(out.address?.zipCode).toBe('66482');
    expect(out.address?.city).toBe('Zweibrücken');
  });

  it('parses labeled address and normalizes "str.64" spacing', () => {
    const text = `Meine Adresse: Boulognestr.64 66482 Zweibrücken`;
    const out = extractCustomerInfo(text);
    expect(out.address?.street).toBe('Boulognestr. 64');
    expect(out.address?.zipCode).toBe('66482');
    expect(out.address?.city).toBe('Zweibrücken');
  });

  it('parses Tina Marczinkowsky real Gmail message without space', () => {
    // This is the actual format from Tina's message: "Boulognestr.6466482 Zweibrücken" (NO space after 64)
    const text = `Meine Adresse: Boulognestr.6466482 Zweibrücken`;
    const out = extractCustomerInfo(text);
    expect(out.address?.street).toBe('Boulognestr. 64');
    expect(out.address?.zipCode).toBe('66482');
    expect(out.address?.city).toBe('Zweibrücken');
  });

  it('filters out own phone numbers from signature', () => {
    const text = `Hallo, hier ist meine Anfrage.
Telefon: +49 173 7615995
Grüße`;
    const out = extractCustomerInfo(text);
    expect(out.phone).toBeUndefined(); // Should not extract own phone number
  });

  it('filters out multiple own phone numbers', () => {
    const text = `Kontakt: +49 6841 9800622 oder Mobil: +49 173 7615995`;
    const out = extractCustomerInfo(text);
    expect(out.phone).toBeUndefined(); // Should not extract own phone numbers
  });
});

describe('suggestProductFromMessage - product detection', () => {
  it('recognizes roof-rack wording as Dachbox context', () => {
    const out = suggestProductFromMessage('Ich brauche Dachträger für den Urlaub, kannst du helfen?');
    expect(out?.productType).toBe('Dachbox XL');
    expect((out?.confidence || 0)).toBeGreaterThanOrEqual(0.7);
  });

  it('recognizes payment mail without product as low confidence', () => {
    const out = suggestProductFromMessage('Du hast eine Zahlung erhalten. service@paypal.de');
    expect(out?.productType).toBe('Dachbox XL');
    expect(out?.confidence).toBe(0.35);
  });

  it('keeps stronger signal for payment mail with explicit product', () => {
    const out = suggestProductFromMessage('Du hast eine Zahlung erhalten fuer Dachbox XL im August');
    expect(out?.productType).toBe('Dachbox XL');
    expect((out?.confidence || 0)).toBeGreaterThanOrEqual(0.6);
  });

  it('flags roof-rack-only request as low-confidence manual mapping case', () => {
    const out = suggestProductFromMessage('Ich brauche nur Dachträger, ohne Dachbox, für meinen Kombi.');
    expect(out?.productType).toBe('Dachbox XL');
    expect(out?.confidence).toBe(0.45);
    expect(out?.reason).toMatch(/manuelle Zuordnung/i);
  });

  it('uses product hints from offer/order/invoice mails when available', () => {
    const out = suggestProductFromMessage('Auftragsbestätigung für Heckbox an AHK, Rechnung folgt.');
    expect(out?.productType).toBe('Heckbox');
    expect((out?.confidence || 0)).toBeGreaterThanOrEqual(0.72);
  });
});

describe('detectDachboxRejectionReason', () => {
  it('flags no-reling wording for half-automatic reject', () => {
    const out = detectDachboxRejectionReason('Ich habe leider keine Dachreling am Auto.');
    expect(out.shouldReject).toBe(true);
    expect(out.type).toBe('keine_reling');
  });

  it('flags fixpunkte wording for half-automatic reject', () => {
    const out = detectDachboxRejectionReason('Das Fahrzeug hat nur Fixpunkte auf dem Dach.');
    expect(out.shouldReject).toBe(true);
    expect(out.type).toBe('fixpunkte');
  });
});
