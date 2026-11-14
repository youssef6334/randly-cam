'use strict';
const crypto = require('crypto');
const { normalize: normalizeCountry } = require('./public/country-display');
const LANGUAGES = Object.freeze(['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh']);
const LOCAL_GEO = {
  "EG": {
    "countryAr": "مصر",
    "countryEn": "egypt",
    "cities": [
      {
        "city": "القاهرة",
        "cityEn": "cairo",
        "areas": [
          "مدينة نصر",
          "المعادي",
          "مصر الجديدة",
          "التجمع الخامس",
          "شبرا",
          "الزمالك"
        ]
      },
      {
        "city": "الجيزة",
        "cityEn": "giza",
        "areas": [
          "الدقي",
          "المهندسين",
          "الشيخ زايد",
          "فيصل",
          "الهرم",
          "أكتوبر"
        ]
      },
      {
        "city": "الإسكندرية",
        "cityEn": "alexandria",
        "areas": [
          "سموحة",
          "سيدي جابر",
          "ميامي",
          "ستانلي",
          "لوران"
        ]
      },
      {
        "city": "المنصورة",
        "cityEn": "mansoura",
        "areas": [
          "حي الجامعة",
          "توريل",
          "المشاية"
        ]
      }
    ],
    "slang": "عامية مصرية صميمة وسريعة من الموبايل (يسطا، عامل ايه، يا غالي، اشطا، بجد، فكك، تمام وانت، يا عم)"
  },
  "AE": {
    "countryAr": "الإمارات",
    "countryEn": "uae",
    "cities": [
      {
        "city": "دبي",
        "cityEn": "dubai",
        "areas": [
          "دبي مارينا",
          "البرشاء",
          "جميرا",
          "داون تاون",
          "بر دبي",
          "مردف"
        ]
      },
      {
        "city": "أبوظبي",
        "cityEn": "abu dhabi",
        "areas": [
          "الخالدية",
          "جزيرة الريم",
          "البطين",
          "الكورنيش",
          "مدينة خليفة"
        ]
      },
      {
        "city": "الشارقة",
        "cityEn": "sharjah",
        "areas": [
          "المجاز",
          "النهدة",
          "القاسمية",
          "الخان"
        ]
      }
    ],
    "slang": "لهجة إماراتية/خليجية شبابية عفوية (هلا والله، شحالك، علومك، وايد، زين، هيه، ماشي الحال، وينك)"
  },
  "SA": {
    "countryAr": "السعودية",
    "countryEn": "saudi",
    "cities": [
      {
        "city": "الرياض",
        "cityEn": "riyadh",
        "areas": [
          "الملقا",
          "العليا",
          "الياسمين",
          "النرجس",
          "الصحافة",
          "النسيم"
        ]
      },
      {
        "city": "جدة",
        "cityEn": "jeddah",
        "areas": [
          "التحلية",
          "الروضة",
          "السلامة",
          "الشاطئ",
          "أبحر"
        ]
      },
      {
        "city": "الدمام",
        "cityEn": "dammam",
        "areas": [
          "الشاطئ",
          "الفيصلية",
          "الريان"
        ]
      }
    ],
    "slang": "لهجة سعودية شبابية مختصرة (هلا والله، شخبارك، وش علومك، من وين، يب، لا والله، يارجال، كفو)"
  },
  "MA": {
    "countryAr": "المغرب",
    "countryEn": "morocco",
    "cities": [
      {
        "city": "كازابلانكا",
        "cityEn": "casablanca",
        "areas": [
          "المعاريف",
          "عين الذياب",
          "أنفا",
          "حي الحسني"
        ]
      },
      {
        "city": "الرباط",
        "cityEn": "rabat",
        "areas": [
          "أكدال",
          "حي الرياض",
          "حسان"
        ]
      },
      {
        "city": "مراكش",
        "cityEn": "marrakech",
        "areas": [
          "جيليز",
          "داوديات",
          "المدينة"
        ]
      }
    ],
    "slang": "دارجة مغربية مفهومة أو عربي مغربي خفيف (سلام، صافا، لاباس، منين نتا، واخا، بصح، والو)"
  },
  "DZ": {
    "countryAr": "الجزائر",
    "countryEn": "algeria",
    "cities": [
      {
        "city": "الجزائر العاصمة",
        "cityEn": "algiers",
        "areas": [
          "باب الزوار",
          "حيدرة",
          "بوزريعة"
        ]
      },
      {
        "city": "وهران",
        "cityEn": "oran",
        "areas": [
          "بئر الجير",
          "السانية"
        ]
      }
    ],
    "slang": "لهجة جزائرية مفهومة وبسيطة (سلام، وش راك، لاباس، منين نتا، صحا، نورمال)"
  },
  "KW": {
    "countryAr": "الكويت",
    "countryEn": "kuwait",
    "cities": [
      {
        "city": "الكويت",
        "cityEn": "kuwait city",
        "areas": [
          "السالمية",
          "حولي",
          "الجابرية",
          "مشرف"
        ]
      }
    ],
    "slang": "لهجة كويتية شبابية (هلا، شلونك، شخبارك، صج، شدعوة، تمام)"
  },
  "QA": {
    "countryAr": "قطر",
    "countryEn": "qatar",
    "cities": [
      {
        "city": "الدوحة",
        "cityEn": "doha",
        "areas": [
          "اللؤلؤة",
          "السد",
          "الوعب",
          "كتارا"
        ]
      }
    ],
    "slang": "لهجة قطرية خليجية شبابية (هلا، شخبارك، علومك، طيب، تمام)"
  },
  "JO": {
    "countryAr": "الأردن",
    "countryEn": "jordan",
    "cities": [
      {
        "city": "عمّان",
        "cityEn": "amman",
        "areas": [
          "عبدون",
          "الجبيهة",
          "تلاع العلي",
          "الشميساني",
          "جبل اللويبدة"
        ]
      },
      {
        "city": "إربد",
        "cityEn": "irbid",
        "areas": [
          "شارع الجامعة",
          "الحي الشرقي"
        ]
      }
    ],
    "slang": "لهجة أردنية شبابية (هلا، كيفك، شو أخبارك، يا زلمة، تمام والله، من وين)"
  },
  "PS": {
    "countryAr": "فلسطين",
    "countryEn": "palestine",
    "cities": [
      {
        "city": "رام الله",
        "cityEn": "ramallah",
        "areas": [
          "الماصيون",
          "الطيرة",
          "المنارة"
        ]
      },
      {
        "city": "نابلس",
        "cityEn": "nablus",
        "areas": [
          "رفيديا",
          "المخفية"
        ]
      }
    ],
    "slang": "لهجة فلسطينية شبابية (هلا، كيفك، شو الأخبار، يسعدك، تمام الحمدلله)"
  },
  "LB": {
    "countryAr": "لبنان",
    "countryEn": "lebanon",
    "cities": [
      {
        "city": "بيروت",
        "cityEn": "beirut",
        "areas": [
          "الحمرا",
          "الأشرفية",
          "الروشة",
          "فردان"
        ]
      }
    ],
    "slang": "لهجة لبنانية شبابية (هاي، كيفك، شو الأخبار، ماشي الحال، هلق)"
  },
  "IQ": {
    "countryAr": "العراق",
    "countryEn": "iraq",
    "cities": [
      {
        "city": "بغداد",
        "cityEn": "baghdad",
        "areas": [
          "المنصور",
          "الكرادة",
          "الأعظمية",
          "زيونة"
        ]
      }
    ],
    "slang": "لهجة عراقية شبابية (هلو، شلونك، شكو ماكو، زين الحمدلله، حبيبي)"
  },
  "SY": {
    "countryAr": "سوريا",
    "countryEn": "syria",
    "cities": [
      {
        "city": "دمشق",
        "cityEn": "damascus",
        "areas": [
          "المزة",
          "المالكي",
          "أبو رمانة",
          "الشعلان"
        ]
      }
    ],
    "slang": "لهجة سورية شامية شبابية (مرحبا، كيفك، شو الأخبار، تمام، أيوا)"
  },
  "US": {
    "countryAr": "أمريكا",
    "countryEn": "usa",
    "cities": [
      {
        "city": "Los Angeles",
        "cityEn": "la",
        "areas": [
          "Santa Monica",
          "Hollywood",
          "Westwood"
        ]
      },
      {
        "city": "New York",
        "cityEn": "nyc",
        "areas": [
          "Brooklyn",
          "Queens",
          "Manhattan"
        ]
      },
      {
        "city": "Chicago",
        "cityEn": "chicago",
        "areas": [
          "Lincoln Park",
          "Downtown"
        ]
      },
      {
        "city": "Miami",
        "cityEn": "miami",
        "areas": [
          "Brickell",
          "South Beach"
        ]
      }
    ],
    "slang": "casual american texting slang (yo, hru, wbu, wyd, ngl, rn, lowkey, fr, bro, idk)"
  },
  "GB": {
    "countryAr": "بريطانيا",
    "countryEn": "uk",
    "cities": [
      {
        "city": "London",
        "cityEn": "london",
        "areas": [
          "Camden",
          "Shoreditch",
          "Greenwich"
        ]
      },
      {
        "city": "Manchester",
        "cityEn": "manchester",
        "areas": [
          "Northern Quarter",
          "Salford"
        ]
      }
    ],
    "slang": "casual uk texting slang (hey, u good, mate, ngl, uni, hru, wbu, lol)"
  },
  "ES": {
    "countryAr": "إسبانيا",
    "countryEn": "spain",
    "cities": [
      {
        "city": "Madrid",
        "cityEn": "madrid",
        "areas": [
          "Malasaña",
          "Chamberí",
          "Sol"
        ]
      },
      {
        "city": "Barcelona",
        "cityEn": "barcelona",
        "areas": [
          "Gràcia",
          "Eixample"
        ]
      }
    ],
    "slang": "casual english texting slang with slight spanish vibe if asked (hey, hru, wbu, im from spain, madrid)"
  },
  "FR": {
    "countryAr": "فرنسا",
    "countryEn": "france",
    "cities": [
      {
        "city": "Paris",
        "cityEn": "paris",
        "areas": [
          "Montmartre",
          "Bastille",
          "Latin Quarter"
        ]
      },
      {
        "city": "Lyon",
        "cityEn": "lyon",
        "areas": [
          "Bellecour",
          "Part-Dieu"
        ]
      }
    ],
    "slang": "casual english texting slang (hey, hru, wbu, from france, lol)"
  },
  "DE": {
    "countryAr": "ألمانيا",
    "countryEn": "germany",
    "cities": [
      {
        "city": "Berlin",
        "cityEn": "berlin",
        "areas": [
          "Kreuzberg",
          "Mitte",
          "Neukölln"
        ]
      },
      {
        "city": "Munich",
        "cityEn": "munich",
        "areas": [
          "Schwabing",
          "Maxvorstadt"
        ]
      }
    ],
    "slang": "casual english texting slang (hey, hru, wbu, from berlin, lol)"
  },
  "IT": {
    "countryAr": "إيطاليا",
    "countryEn": "italy",
    "cities": [
      {
        "city": "Rome",
        "cityEn": "rome",
        "areas": [
          "Trastevere",
          "Prati"
        ]
      },
      {
        "city": "Milan",
        "cityEn": "milan",
        "areas": [
          "Navigli",
          "Brera"
        ]
      }
    ],
    "slang": "casual english texting slang (hey, hru, wbu, from italy, lol)"
  },
  "BR": {
    "countryAr": "البرازيل",
    "countryEn": "brazil",
    "cities": [
      {
        "city": "São Paulo",
        "cityEn": "sao paulo",
        "areas": [
          "Pinheiros",
          "Vila Madalena"
        ]
      },
      {
        "city": "Rio",
        "cityEn": "rio",
        "areas": [
          "Copacabana",
          "Ipanema"
        ]
      }
    ],
    "slang": "casual english texting slang (hey, hru, wbu, from brazil, lol, kkk)"
  },
  "TR": {
    "countryAr": "تركيا",
    "countryEn": "turkey",
    "cities": [
      {
        "city": "Istanbul",
        "cityEn": "istanbul",
        "areas": [
          "Kadıköy",
          "Beşiktaş",
          "Taksim"
        ]
      },
      {
        "city": "Ankara",
        "cityEn": "ankara",
        "areas": [
          "Çankaya",
          "Kızılay"
        ]
      }
    ],
    "slang": "casual english texting slang (hey, hru, wbu, from istanbul, lol)"
  }
};
const EXTRA = {
    CA: ['America/Toronto', 'en', 'Toronto', 'Canadian English'],
    MX: ['America/Mexico_City', 'es', 'Ciudad de México', 'Mexican Spanish'],
    RU: ['Europe/Moscow', 'ru', 'Москва', 'conversational Russian'],
    IN: ['Asia/Kolkata', 'hi', 'दिल्ली', 'conversational Hindi; switch to English when requested'],
    ID: ['Asia/Jakarta', 'id', 'Jakarta', 'conversational Indonesian'],
    CN: ['Asia/Shanghai', 'zh', '上海', 'conversational Mandarin Chinese'],
    NL: ['Europe/Amsterdam', 'nl', 'Amsterdam', 'neutral English; do not imitate a Dutch accent'],
    SE: ['Europe/Stockholm', 'sv', 'Stockholm', 'neutral English; do not imitate a Swedish accent'],
    PT: ['Europe/Lisbon', 'pt', 'Lisboa', 'European Portuguese'],
    AU: ['Australia/Sydney', 'en', 'Sydney', 'Australian English'],
    NZ: ['Pacific/Auckland', 'en', 'Auckland', 'New Zealand English'],
    AR: ['America/Argentina/Buenos_Aires', 'es', 'Buenos Aires', 'Argentinian Spanish'],
    CO: ['America/Bogota', 'es', 'Bogotá', 'Colombian Spanish']
};
const SETTINGS = {
    EG: ['Africa/Cairo', 'ar'], SA: ['Asia/Riyadh', 'ar'], AE: ['Asia/Dubai', 'ar'],
    MA: ['Africa/Casablanca', 'ar'], DZ: ['Africa/Algiers', 'ar'], KW: ['Asia/Kuwait', 'ar'],
    QA: ['Asia/Qatar', 'ar'], JO: ['Asia/Amman', 'ar'], PS: ['Asia/Hebron', 'ar'],
    LB: ['Asia/Beirut', 'ar'], IQ: ['Asia/Baghdad', 'ar'], SY: ['Asia/Damascus', 'ar'],
    US: ['America/New_York', 'en'], GB: ['Europe/London', 'en'], ES: ['Europe/Madrid', 'es'],
    FR: ['Europe/Paris', 'fr'], DE: ['Europe/Berlin', 'de'], IT: ['Europe/Rome', 'it'],
    BR: ['America/Sao_Paulo', 'pt'], TR: ['Europe/Istanbul', 'tr']
};
const STYLES = {
    en: 'simple, clear everyday English with short sentences and common words; no forced slang, fake accent or deliberately broken grammar',
    es: 'natural conversational Spanish', fr: 'natural conversational French',
    de: 'natural conversational German', it: 'natural conversational Italian',
    pt: 'natural conversational Portuguese', tr: 'natural conversational Turkish',
    ru: 'natural conversational Russian', hi: 'natural conversational Hindi',
    id: 'natural conversational Indonesian', zh: 'natural conversational Mandarin Chinese',
    ar: 'clear conversational Arabic; avoid pretending to know an unsupported local dialect'
};
const NAMES = {
    ar: ['نور', 'ريم', 'سامي'], en: ['Alex', 'Sam', 'Robin'], es: ['Alex', 'Dani', 'Sol'],
    fr: ['Camille', 'Alex', 'Lou'], de: ['Alex', 'Kim', 'Toni'], it: ['Andrea', 'Alex', 'Vale'],
    pt: ['Alex', 'Dani', 'Cris'], tr: ['Deniz', 'Ekin', 'Derya'], ru: ['Саша', 'Женя', 'Валя'],
    hi: ['किरण', 'अमन', 'आशा'], id: ['Dian', 'Ari', 'Putri'], zh: ['小林', '小安', '小雨']
};
const WORLD = ['EG', 'SA', 'AE', 'MA', 'JO', 'PS', 'DZ', 'KW', 'QA', 'US', 'GB', 'ES', 'FR', 'DE', 'IT', 'BR', 'TR', 'RU', 'IN', 'ID', 'CA', 'MX', 'NL', 'SE', 'CN', 'PT', 'AR', 'CO'];
function language(value, fallback = 'en') {
    const code = typeof value === 'string' ? value.toLowerCase().split('-')[0] : '';
    return LANGUAGES.includes(code) ? code : fallback;
}
function countryName(country, locale = 'en') {
    if (country === 'global') return '';
    return new Intl.DisplayNames([language(locale)], { type: 'region' }).of(country) || country;
}
function startingLanguage(country) {
    const setting = SETTINGS[country] || EXTRA[country];
    let native = setting ? setting[1] : null;
    if (!native) {
        try { native = new Intl.Locale('und-' + country).maximize().language; }
        catch (_) { native = 'en'; }
    }
    // ICU's likely language is only a starting default for a fictional setting,
    // never a claim about any real person's language or nationality.
    return { nativeLanguage: native, language: language(native, 'en') };
}
function replyLanguageFor(persona, requested) {
    const allowed = persona.replyLanguages || [language(persona.nativeLanguage, 'en'), 'en'];
    const code = language(requested, 'en');
    return allowed.includes(code) ? code : 'en';
}
function styleFor(persona, locale) {
    const code = language(locale), country = persona.country;
    if (code === 'ar' && persona.nativeLanguage === 'ar' && LOCAL_GEO[country]) return LOCAL_GEO[country].slang;
    if (code === persona.nativeLanguage && EXTRA[country]) return EXTRA[country][3];
    if (code === 'pt' && country === 'BR') return 'natural conversational Brazilian Portuguese';
    if (code === 'en' && country === 'GB') return 'natural conversational British English, without forced slang';
    if (code === 'en' && country === 'US') return 'natural conversational American English, without forced slang';
    return STYLES[code];
}
function createPersona({ preferredCountry, actualCountry, interests = [], pick = n => crypto.randomInt(n) } = {}) {
    let country = normalizeCountry(preferredCountry);
    if (country === 'global') country = normalizeCountry(actualCountry);
    if (country === 'global') country = WORLD[pick(WORLD.length)];
    const geo = LOCAL_GEO[country], extra = EXTRA[country];
    const setting = SETTINGS[country] || extra;
    const { nativeLanguage, language: replyLanguage } = startingLanguage(country);
    const cityData = geo ? geo.cities[pick(geo.cities.length)] : null;
    const city = cityData ? cityData.city : (extra ? extra[2] : null);
    // A country can span several time zones. Use a curated representative zone,
    // never infer the real user's time or residence from a fictional setting.
    const cityZones = { la: 'America/Los_Angeles', nyc: 'America/New_York', chicago: 'America/Chicago', miami: 'America/New_York' };
    const timeZone = cityData && cityZones[cityData.cityEn] || (setting ? setting[0] : null);
    let style = STYLES[replyLanguage];
    if (replyLanguage === nativeLanguage && geo && replyLanguage === 'ar') style = geo.slang;
    else if (replyLanguage === nativeLanguage && extra) style = extra[3];
    else if (replyLanguage === 'pt' && country === 'BR') style = 'Brazilian Portuguese';
    return Object.freeze({
        kind: 'ai', country, countryName: countryName(country), city, timeZone,
        replyLanguages: Object.freeze([...new Set([replyLanguage, 'en'])]),
        nativeLanguage, language: replyLanguage, style, name: NAMES[replyLanguage][pick(NAMES[replyLanguage].length)],
        interests: Object.freeze(Array.isArray(interests) ? interests.filter(x => typeof x === 'string').slice(0, 10).map(x => x.slice(0, 30)) : []),
        locallyCurated: !!setting
    });
}
function localTime(persona, date = new Date()) {
    if (!persona.timeZone) return null;
    return new Intl.DateTimeFormat('en-GB', { timeZone: persona.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
module.exports = { LANGUAGES, WORLD: Object.freeze(WORLD), language, countryName, startingLanguage, replyLanguageFor, createPersona, styleFor, localTime };
