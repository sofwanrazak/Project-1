import type { Account, AccountType, Category } from './types.ts';

export const PALETTE = [
  '#7C5CFF', '#22D3EE', '#34D399', '#FBBF24', '#FB7185', '#F97316',
  '#A78BFA', '#38BDF8', '#4ADE80', '#F472B6', '#2DD4BF', '#E879F9',
  '#FACC15', '#60A5FA', '#FB923C', '#94A3B8',
];

type Seed = [name: string, icon: string, color: string];

const EXPENSE: Seed[] = [
  ['Food & Drink', '🍜', '#F97316'],
  ['Groceries', '🛒', '#34D399'],
  ['Transport', '🚗', '#38BDF8'],
  ['Bills & Utilities', '💡', '#FBBF24'],
  ['Shopping', '🛍️', '#F472B6'],
  ['Health', '💊', '#FB7185'],
  ['Entertainment', '🎬', '#A78BFA'],
  ['Travel', '✈️', '#22D3EE'],
  ['Education', '📚', '#60A5FA'],
  ['Home', '🏠', '#2DD4BF'],
  ['Family & Kids', '👶', '#E879F9'],
  ['Subscriptions', '🔁', '#7C5CFF'],
  ['Gifts & Donations', '🎁', '#FACC15'],
  ['Personal Care', '💇', '#FB923C'],
  ['Fees & Tax', '🧾', '#94A3B8'],
  ['Other', '📦', '#64748B'],
];

const INCOME: Seed[] = [
  ['Salary', '💼', '#34D399'],
  ['Freelance', '💻', '#22D3EE'],
  ['Business', '🏪', '#FBBF24'],
  ['Investments', '📈', '#7C5CFF'],
  ['Gift received', '🎁', '#F472B6'],
  ['Refund', '↩️', '#60A5FA'],
  ['Other income', '💰', '#94A3B8'],
];

export function defaultCategories(newId: () => string): Category[] {
  const mk = (kind: 'expense' | 'income') => (s: Seed, i: number): Category => ({
    id: newId(),
    name: s[0],
    icon: s[1],
    color: s[2],
    kind,
    archived: 0,
    sort: i,
  });
  return [...EXPENSE.map(mk('expense')), ...INCOME.map(mk('income'))];
}

export function defaultAccount(newId: () => string, openingBalance = 0): Account {
  return { id: newId(), name: 'Cash', type: 'cash', openingBalance, color: '#34D399', archived: 0, sort: 0 };
}

export const ACCOUNT_TYPES: { type: AccountType; label: string; icon: string }[] = [
  { type: 'cash', label: 'Cash', icon: '💵' },
  { type: 'bank', label: 'Bank', icon: '🏦' },
  { type: 'card', label: 'Credit card', icon: '💳' },
  { type: 'ewallet', label: 'E-wallet', icon: '📱' },
  { type: 'savings', label: 'Savings', icon: '🐷' },
];

export const accountIcon = (t: AccountType) => ACCOUNT_TYPES.find((a) => a.type === t)?.icon ?? '💵';

export const CURRENCIES = [
  { code: 'MYR', label: 'Malaysian Ringgit' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'IDR', label: 'Indonesian Rupiah' },
  { code: 'THB', label: 'Thai Baht' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'JPY', label: 'Japanese Yen' },
];

/** Lower-case substrings (Malaysia-centric) -> default category name. First match wins. */
const RULES: [string, string[]][] = [
  ['Salary', ['salary', 'gaji', 'payroll', 'bonus']],
  ['Freelance', ['freelance', 'client']],
  ['Refund', ['refund', 'rebate', 'cashback']],
  ['Gift received', ['angpao', 'ang pow', 'duit raya', 'hadiah']],
  ['Investments', ['dividend']],
  ['Subscriptions', ['netflix', 'spotify', 'youtube premium', 'apple.com/bill', 'icloud', 'disney', 'chatgpt', 'openai', 'google one']],
  ['Food & Drink', ['grabfood', 'foodpanda', 'shopeefood', 'mcdonald', 'kfc', 'starbucks', 'zus coffee', 'tealive', 'mamak', 'restoran', 'restaurant', 'cafe', 'kopitiam', 'pizza', 'burger', 'sushi', 'nasi', 'secret recipe', 'coffee bean', 'dominos']],
  ['Groceries', ['tesco', 'lotus', 'aeon', 'mydin', 'jaya grocer', '99 speedmart', 'kk super', 'village grocer', 'giant', 'econsave', 'supermarket', 'ninjavan mart']],
  ['Transport', ['grab ', 'grab*', 'petronas', 'shell', 'petron', 'caltex', 'bhp', 'touch n go', "touch 'n go", 'tng', 'rapidkl', 'rapid kl', 'mrt', 'lrt', 'parking', 'toll', 'plus ', 'maxim', 'indrive', 'mycar', 'ktm']],
  ['Bills & Utilities', ['tnb', 'tenaga', 'syabas', 'air selangor', 'unifi', 'maxis', 'celcom', 'digi', 'u mobile', 'umobile', 'indah water', 'astro', 'time dotcom', 'mcmc']],
  ['Shopping', ['shopee', 'lazada', 'zalora', 'uniqlo', 'ikea', 'mr diy', 'mr. diy', 'h&m', 'amazon']],
  ['Health', ['guardian', 'watsons', 'clinic', 'klinik', 'pharmacy', 'farmasi', 'hospital', 'dental', 'caring']],
  ['Entertainment', ['gsc', 'tgv', 'steam', 'playstation', 'cinema', 'karaoke']],
  ['Travel', ['airasia', 'agoda', 'booking.com', 'malaysia airlines', 'mas ', 'traveloka', 'hotel', 'firefly']],
  ['Education', ['udemy', 'coursera', 'tuition', 'yuran', 'university', 'universiti']],
  ['Fees & Tax', ['lhdn', 'cukai', 'service charge', 'sst', 'bank charge', 'fee ']],
];

/** Short keys must match a whole token ("sst" must not hit "assistance"); longer keys match at a word start. */
function hasKey(haystack: string, rawKey: string) {
  const key = rawKey.trim();
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9])${esc}${key.length <= 4 ? '($|[^a-z0-9])' : ''}`);
  return re.test(haystack);
}

/** Suggest a category id for a statement line; null if no rule matches. */
export function suggestCategory(description: string, kind: 'expense' | 'income', categories: Category[]): string | null {
  const d = description.toLowerCase();
  const byName = (n: string) => categories.find((c) => c.name === n && c.kind === kind && !c.archived)?.id ?? null;
  for (const [name, keys] of RULES) {
    if (keys.some((k) => hasKey(d, k))) {
      const id = byName(name);
      if (id) return id;
    }
  }
  return null;
}
