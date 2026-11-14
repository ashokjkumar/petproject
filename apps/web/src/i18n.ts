export type Lang = "ta" | "en";

/** Tamil first. The Tamil text is a draft and needs a native-speaker review (DECISIONS.md O9). */
const TEXT = {
  brand: { ta: "கூட்டு மளிகை", en: "Kootu Maligai" },
  otherLang: { ta: "English", en: "தமிழ்" },
  loading: { ta: "ஏற்றுகிறது…", en: "Loading…" },
  noApartment: { ta: "உங்கள் குடியிருப்பின் இணைப்பை கேப்டனிடம் கேளுங்கள்.", en: "Ask your captain for your apartment's link." },
  notFound: { ta: "இந்தக் குடியிருப்பு கிடைக்கவில்லை.", en: "We could not find this apartment." },
  noCard: { ta: "இந்த மாத விலை அட்டை இன்னும் வெளியாகவில்லை. வெளியானதும் கேப்டன் தெரிவிப்பார்.", en: "This month's price card is not out yet. Your captain will tell you when it is." },
  thisMonth: { ta: "இந்த மாத விலை", en: "This month's prices" },
  mill: { ta: "ஆலை விலை", en: "Mill price" },
  transport: { ta: "போக்குவரத்து, பேக்கிங்", en: "Transport and packing" },
  margin: { ta: "எங்கள் நிலையான லாபம்", en: "Our fixed margin" },
  gst: { ta: "ஜிஎஸ்டி", en: "GST" },
  kgPack: { ta: "கிலோ பை", en: "kg pack" },
  milled: { ta: "அரைத்த நாள்", en: "Milled on" },
  join: { ta: "சேர", en: "Join" },
  joinTitle: { ta: "உங்கள் குடும்பத்தைச் சேர்க்கவும்", en: "Add your household" },
  name: { ta: "பெயர்", en: "Name" },
  flat: { ta: "வீட்டு எண்", en: "Flat number" },
  phone: { ta: "கைபேசி எண்", en: "Phone number" },
  consent: { ta: "நானே விரும்பி இந்தக் குழுவில் சேர்கிறேன்.", en: "I am choosing to join this group myself." },
  dataNote: { ta: "பெயர், வீட்டு எண், கைபேசி, ஆர்டர் விவரம் மட்டுமே சேமிக்கப்படும்.", en: "We keep only your name, flat, phone and orders." },
  yourOrder: { ta: "உங்கள் ஆர்டர்", en: "Your order" },
  total: { ta: "மொத்தம்", en: "Total" },
  placeOrder: { ta: "ஆர்டர் செய்", en: "Place order" },
  skipNote: { ta: "இந்த மாதம் வேண்டாம் என்றால் எதுவும் செய்ய வேண்டாம். பணம் செலுத்தாவிட்டால் ஆர்டர் இல்லை.", en: "To skip this month, do nothing. No payment means no order." },
  pay: { ta: "செலுத்த வேண்டிய தொகை", en: "Amount to pay" },
  payUpi: { ta: "UPI மூலம் செலுத்து", en: "Pay by UPI" },
  ref: { ta: "குறிப்பு எண்", en: "Reference" },
  payWait: { ta: "பணம் வந்ததும் இங்கே உறுதி செய்யப்படும். கேப்டனிடம் பணம் கொடுக்க வேண்டாம்.", en: "We confirm here once your payment arrives. Never hand money to the captain." },
  paid: { ta: "பணம் வந்துவிட்டது. 1 முதல் 5 தேதிக்குள் உங்கள் குடியிருப்பு வாசலில் டெலிவரி.", en: "Payment received. Delivery at your apartment gate between the 1st and the 5th." },
  failed: { ta: "பணம் செலுத்துதல் தோல்வி. மீண்டும் முயற்சிக்கவும்.", en: "The payment failed. Please try again." },
  error: { ta: "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.", en: "Something went wrong. Please try again." },
  captain: { ta: "கேப்டன்", en: "Captain" },
  captainCode: { ta: "கேப்டன் குறியீடு", en: "Captain code" },
  show: { ta: "காட்டு", en: "Show" },
  wrongCode: { ta: "குறியீடு தவறு.", en: "Wrong code." },
  paidHouseholds: { ta: "பணம் செலுத்திய குடும்பங்கள்", en: "Households paid" },
  minNote: { ta: "வண்டி வர குறைந்தது 15 தேவை", en: "15 needed for the truck to come" },
  statusPaid: { ta: "செலுத்தியது", en: "Paid" },
  statusUnpaid: { ta: "செலுத்தவில்லை", en: "Not paid" },
  commission: { ta: "உங்கள் கமிஷன்", en: "Your commission" },
  noOrders: { ta: "இன்னும் ஆர்டர்கள் இல்லை.", en: "No orders yet." },
  back: { ta: "விலை அட்டைக்கு", en: "Back to prices" },
} as const;

export type Key = keyof typeof TEXT;
export const t = (lang: Lang, key: Key): string => TEXT[key][lang];

const ITEMS: Record<string, { ta: string; en: string }> = {
  PONNI_RICE_BOILED: { ta: "பொன்னி புழுங்கல் அரிசி", en: "Ponni boiled rice" },
  PONNI_RICE_RAW: { ta: "பொன்னி பச்சரிசி", en: "Ponni raw rice" },
  TOOR_DAL: { ta: "துவரம் பருப்பு", en: "Toor dal" },
};
export const itemName = (lang: Lang, itemId: string): string => ITEMS[itemId]?.[lang] ?? itemId;
