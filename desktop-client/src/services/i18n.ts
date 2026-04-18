import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'ui.language',
    },
  });

export default i18n;

/** Set UI language, persist via both localStorage (i18next detector) and SQLite. */
export async function setLanguage(lang: 'en' | 'zh') {
  await i18n.changeLanguage(lang);
  await window.claw.db.settings.set('ui.language', lang);
}

/** Heuristic: detect user input language by CJK character presence. */
export function detectInputLang(text: string): 'en' | 'zh' {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en';
}

export type AILangPolicy = 'follow-input' | 'always-en' | 'always-zh';

/** Resolve the target reply language given policy + user input. */
export function resolveReplyLang(policy: AILangPolicy, userInput: string): 'en' | 'zh' {
  if (policy === 'always-en') return 'en';
  if (policy === 'always-zh') return 'zh';
  return detectInputLang(userInput);
}
