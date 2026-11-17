// Safety checks shared by autofill, macros and scripts. K-Flow never bypasses
// CAPTCHA/MFA, never auto-submits official forms and asks before anything that
// submits, pays or deletes.
import { labelFor } from './dom';

export const SENSITIVE_ACTION = /\b(submit|send|pay|payment|purchase|buy|order|checkout|check out|confirm|final ?submit|delete|remove|transfer|withdraw|sign ?(up|in)|log ?in|register|subscribe|publish|post|place|donate|lock|freeze|apply|save ?(and|&) ?(submit|next|continue)|cancel (my )?(account|subscription)|close account|update (password|email|account)|deactivate)\b/i;
export const SENSITIVE_FIELD = /(pass(word)?|passwd|pwd|otp|one.?time|cvv|cvc|card.?(no|number)|ccnum|cc-|iban|account.?(no|number)|routing|ssn|\bpin\b|security.?code|aadh?a?a?r|\buid\b|pan.?(no|number|card))/i;
export const CAPTCHA = /(captcha|recaptcha|hcaptcha|turnstile|security.?image|verification.?code|verify.?you.?are.?human)/i;
export const MFA = /(\botp\b|one.?time.?pass|2fa|two.?factor|authenticator|verification.?code|mfa)/i;

export function isSubmitLike(el: Element): boolean {
  const h = el as HTMLInputElement;
  const tag = el.tagName;
  if (tag === 'INPUT' && ['submit', 'image'].includes(h.type)) return true;
  if (tag === 'BUTTON' && (h.type === 'submit' || (!el.getAttribute('type') && !!el.closest('form')))) return true;
  const txt = `${labelFor(el)} ${(el.textContent || '').slice(0, 80)} ${h.value || ''}`;
  return SENSITIVE_ACTION.test(txt);
}

export function sensitiveReason(el: Element | null, action: 'click' | 'type' | 'key' | 'select', keyValue?: string): string | null {
  if (!el) return null;
  const h = el as HTMLInputElement;
  if (action === 'click' || action === 'key') {
    if (action === 'key' && !/^enter$/i.test(keyValue || '')) return null;
    if (action === 'key' && el.closest('form')) return 'Pressing Enter here may submit a form.';
    if (action === 'click' && isSubmitLike(el)) {
      const txt = `${labelFor(el)} ${(el.textContent || '').slice(0, 60)}`.replace(/\s+/g, ' ').trim();
      return `This click looks like it submits, sends, pays or deletes ("${txt.slice(0, 60)}").`;
    }
  }
  if (action === 'type' || action === 'select') {
    const sig = `${h.type || ''} ${h.name || ''} ${h.id || ''} ${h.getAttribute?.('autocomplete') || ''} ${labelFor(el)}`;
    if (h.type === 'password' || SENSITIVE_FIELD.test(sig)) return 'This step enters data into a password, OTP, payment or identity-number field.';
  }
  return null;
}

/** CAPTCHA / human-verification widgets and their answer fields. */
export function isCaptchaField(el: Element): boolean {
  const h = el as HTMLInputElement;
  const sig = `${h.name || ''} ${h.id || ''} ${el.className || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${labelFor(el)}`;
  if (CAPTCHA.test(sig)) return true;
  // answer box next to a captcha image
  const box = el.closest('td,div,p,li');
  const img = box?.querySelector('img');
  if (img && CAPTCHA.test(`${img.getAttribute('alt') || ''} ${img.getAttribute('src') || ''} ${img.id} ${img.className}`)) return true;
  return false;
}

export function isMfaField(el: Element): boolean {
  const h = el as HTMLInputElement;
  return MFA.test(`${h.name || ''} ${h.id || ''} ${h.getAttribute('autocomplete') || ''} ${labelFor(el)}`) || h.getAttribute('autocomplete') === 'one-time-code';
}

export function pageHasCaptcha(doc: Document): boolean {
  if (doc.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="turnstile"],.g-recaptcha,.h-captcha,.cf-turnstile')) return true;
  return Array.from(doc.querySelectorAll('img')).some((i) => CAPTCHA.test(`${i.alt} ${i.id} ${i.className} ${i.getAttribute('src') || ''}`));
}

/** Masks a value for logs and history. */
export function mask(v: string): string {
  if (!v) return '';
  if (v.length <= 4) return '•'.repeat(v.length);
  return '•'.repeat(Math.min(8, v.length - 2)) + v.slice(-2);
}

/** Column names that should be encrypted at rest by default. */
export function looksSensitiveColumn(name: string): boolean {
  return /(aadh?a?a?r|\buid\b|password|passwd|pwd|\bpin\b|otp|pan\b|pan.?(no|number|card)|account.?(no|number)|ifsc|bank|ssn|passport|mobile|phone|contact.?no|whatsapp|email|dob|birth|caste|income|religion|address)/i.test(name);
}

/** 12-digit Aadhaar-like values. */
export function looksLikeAadhaar(v: unknown): boolean {
  return typeof v === 'string' || typeof v === 'number' ? /^\s*\d{4}\s?\d{4}\s?\d{4}\s*$/.test(String(v)) : false;
}
