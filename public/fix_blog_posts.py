#!/usr/bin/env python3
"""fix_blog_posts.py  -  dry-run by default, add --apply to write.
Run from the project root (folder that contains `public`) or pass --dir public.
Idempotent, CRLF-aware."""
import re, sys, json, glob, os, argparse

LANGS = "ar en es fr de it pt tr ru hi id zh".split()
LOCALE = dict(ar="ar_AR", en="en_US", es="es_ES", fr="fr_FR", de="de_DE", it="it_IT",
              pt="pt_BR", tr="tr_TR", ru="ru_RU", hi="hi_IN", id="id_ID", zh="zh_CN")
READ_ALSO = dict(ar="اقرأ أيضاً", en="Read also", es="Lee también", fr="À lire aussi",
                 de="Auch lesenswert", it="Leggi anche", pt="Leia também", tr="Ayrıca okuyun",
                 ru="Читайте также", hi="यह भी पढ़ें", id="Baca juga", zh="相关阅读")
SLUGS = ["post-omegle-alternative", "post-free-video-chat"]
SITE = "https://randly.live"

# ---- targeted text fixes (only where the exact text exists; others are reported) ----
EN_P_COMP = ("<p>After Omegle shut down, many platforms tried to fill the gap — Chatroulette, OmeTV, CooMeet, "
 "Chathub, Emerald Chat, Shagle, OpenTalk and Umingle among them. They all offer the basic random-chat idea, "
 "but features and pricing differ from site to site and change over time, so it is worth checking each site's "
 "current terms. On Randly, choosing your chat partner's country (or staying on global Smart Match) and instant "
 "text translation are free, with no subscription and no sign-up.</p>")
AR_P_COMP = ("<p>بعد إغلاق Omegle، ظهرت منصات كثيرة حاولت ملء الفراغ، أبرزها Chatroulette وOmeTV وCooMeet وChathub "
 "وEmerald Chat وShagle وOpenTalk وUmingle. كل هذه المنصات توفر فكرة الشات العشوائي الأساسية، لكن المميزات والأسعار "
 "تختلف من موقع لآخر وتتغير مع الوقت، لذلك الأفضل مراجعة شروط كل موقع الحالية. أما على <a href=\"/\">Randly</a> "
 "فاختيار دولة الطرف الآخر (أو البقاء على Smart Match العالمي) والترجمة الفورية للرسائل النصية مجانية، "
 "بدون اشتراك وبدون تسجيل.</p>")
TEXT_FIXES = {
 "en": [
  ("Millions of users worldwide used random chat every day, and after it shut down",
   "Random chat with strangers was hugely popular worldwide, and after Omegle shut down"),
  ("pushing millions to look for safer alternatives", "pushing many users to look for safer alternatives"),
  ("No sign-up, no stored chats, an instant report feature", "No sign-up, an instant report feature"),
  ("Unlike many other random chat platforms that lock country selection behind a paid monthly VIP plan, Randly lets you",
   "Unlike some random chat platforms that offer country selection only on a paid plan, Randly lets you"),
  (">Usually paid<", ">Often paid<"), (">Usually yes<", ">Often yes<"), (">Rare<", ">Less common<"),
 ],
 "ar": [
  ("ولا زلت تبحث عن علاقه المفقودة", "ولا زلت تبحث عن تلك التجربة المفقودة"),
  ("ملايين المستخدمين حول العالم كانوا يستخدمون الموقع يومياً عبر الشات العشوائي، وبعد إغلاقه",
   "كان الشات العشوائي مع الغرباء شائعاً جداً حول العالم، وبعد إغلاقه"),
  ("مما دفع الملايين للبحث عن بدائل آمنة", "مما دفع كثيراً من المستخدمين للبحث عن بدائل آمنة"),
 ],
}
PARA_FIXES = {"en": ("After Omegle shut down, many platforms", EN_P_COMP),
              "ar": ("بعد إغلاق Omegle، ظهرت منصات كثيرة", AR_P_COMP)}

NAMES = "Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk"
PARA_FIXES.update({
 "de": ("Nach der Schließung von Omegle versuchten", "<p>Nach der Schließung von Omegle versuchten viele Plattformen, die Lücke zu füllen – darunter Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk und Umingle. Alle bieten die Grundidee des Zufalls-Chats, doch Funktionen und Preise unterscheiden sich von Seite zu Seite und ändern sich mit der Zeit – prüfe daher die aktuellen Bedingungen der jeweiligen Seite. Bei Randly sind die Länderauswahl (oder der globale Smart Match) und die Sofortübersetzung von Textnachrichten kostenlos, ohne Abo und ohne Registrierung.</p>"),
 "es": ("Tras el cierre de Omegle, muchas", "<p>Tras el cierre de Omegle, muchas plataformas intentaron llenar el vacío: Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk y Umingle, entre otras. Todas ofrecen la idea básica del chat aleatorio, pero las funciones y los precios cambian de un sitio a otro y con el tiempo, así que conviene revisar las condiciones actuales de cada uno. En Randly, elegir el país (o seguir en Smart Match global) y la traducción instantánea de mensajes de texto son gratis, sin suscripción y sin registro.</p>"),
 "fr": ("Après la fermeture d'Omegle, de nombreuses", "<p>Après la fermeture d'Omegle, de nombreuses plateformes ont tenté de combler le vide : Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk et Umingle, entre autres. Toutes proposent l'idée de base du chat aléatoire, mais les fonctionnalités et les tarifs varient d'un site à l'autre et évoluent avec le temps ; mieux vaut consulter les conditions actuelles de chacun. Sur Randly, le choix du pays (ou le Smart Match mondial) et la traduction instantanée des messages texte sont gratuits, sans abonnement et sans inscription.</p>"),
 "hi": ("Omegle बंद होने के बाद,", "<p>Omegle बंद होने के बाद, Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk और Umingle जैसे कई प्लेटफ़ॉर्म्स ने यह खाली जगह भरने की कोशिश की। ये सभी रैंडम चैट का बेसिक आइडिया देते हैं, लेकिन फ़ीचर्स और कीमतें हर साइट पर अलग होती हैं और समय के साथ बदलती रहती हैं, इसलिए हर साइट की मौजूदा शर्तें देख लेना बेहतर है। Randly पर देश चुनना (या ग्लोबल Smart Match पर रहना) और टेक्स्ट मैसेज का तुरंत अनुवाद मुफ्त है, बिना सब्सक्रिप्शन और बिना साइन-अप के।</p>"),
 "id": ("Setelah Omegle tutup, banyak", "<p>Setelah Omegle tutup, banyak platform mencoba mengisi kekosongan itu — Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk, dan Umingle di antaranya. Semuanya menawarkan ide dasar random chat, tetapi fitur dan harganya berbeda-beda di tiap situs dan bisa berubah seiring waktu, jadi sebaiknya cek ketentuan terbaru masing-masing situs. Di Randly, memilih negara (atau tetap di Smart Match global) dan terjemahan instan untuk pesan teks gratis, tanpa langganan dan tanpa daftar.</p>"),
 "it": ("Dopo la chiusura di Omegle, molte", "<p>Dopo la chiusura di Omegle, molte piattaforme hanno cercato di colmare il vuoto: Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk e Umingle, tra le altre. Tutte offrono l'idea base della chat casuale, ma funzioni e prezzi cambiano da sito a sito e nel tempo, quindi conviene controllare le condizioni attuali di ciascuno. Su Randly, la scelta del paese (o lo Smart Match globale) e la traduzione istantanea dei messaggi di testo sono gratuite, senza abbonamento e senza registrazione.</p>"),
 "pt": ("Depois do fechamento do Omegle, muitas", "<p>Depois do fechamento do Omegle, muitas plataformas tentaram preencher o vazio: Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk e Umingle, entre outras. Todas oferecem a ideia básica do chat aleatório, mas recursos e preços mudam de um site para outro e com o tempo, então vale conferir as condições atuais de cada um. No Randly, escolher o país (ou ficar no Smart Match global) e a tradução instantânea de mensagens de texto são gratuitas, sem assinatura e sem cadastro.</p>"),
 "ru": ("После закрытия Omegle многие", "<p>После закрытия Omegle многие платформы попытались заполнить пустоту — Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk и Umingle среди них. Все они предлагают базовую идею случайного чата, но функции и цены на разных сайтах отличаются и со временем меняются, поэтому стоит проверять актуальные условия каждого. В Randly выбор страны (или глобальный Smart Match) и мгновенный перевод текстовых сообщений бесплатны, без подписки и без регистрации.</p>"),
 "tr": ("Omegle'ın kapanmasının ardından", "<p>Omegle'ın kapanmasının ardından Chatroulette, OmeTV, CooMeet, Chathub, Emerald Chat, Shagle, OpenTalk ve Umingle gibi birçok platform bu boşluğu doldurmaya çalıştı. Hepsi temel rastgele sohbet fikrini sunuyor, ancak özellikler ve fiyatlar siteden siteye değişiyor ve zamanla farklılaşabiliyor; bu yüzden her sitenin güncel koşullarına bakmakta fayda var. Randly'de ülke seçimi (veya global Smart Match) ve metin mesajlarının anlık çevirisi ücretsizdir; abonelik ve kayıt gerekmez.</p>"),
 "zh": ("Omegle 关闭后，许多平台", "<p>Omegle 关闭后，许多平台都试图填补这一空白——包括 Chatroulette、OmeTV、CooMeet、Chathub、Emerald Chat、Shagle、OpenTalk 和 Umingle 等。它们都提供随机聊天的基本理念，但功能和价格因网站而异，也会随时间变化，建议查看各网站当前的条款。在 Randly，选择国家（或使用全球 Smart Match）和文字消息即时翻译都是免费的，无需订阅，也无需注册。</p>"),
})
_X = {
 "ar": [("عكس كثير من منصات الشات العشوائي الأخرى التي تضع ميزة اختيار الدولة خلف اشتراك VIP مدفوع شهرياً", "على عكس بعض منصات الشات العشوائي التي تتيح اختيار الدولة ضمن خطة مدفوعة فقط")],
 "de": [("Anders als viele andere Zufallschat-Plattformen, bei denen die Länderauswahl hinter einem kostenpflichtigen monatlichen VIP-Abo versteckt ist", "Anders als manche Zufallschat-Plattformen, die die Länderauswahl nur in einem kostenpflichtigen Tarif anbieten"),
        ("Millionen Nutzer weltweit haben täglich den Zufalls-Chat genutzt, und nach der Schließung stellt sich", "Der Zufalls-Chat war weltweit enorm beliebt, und nach der Schließung stellt sich"),
        ("das veranlasste Millionen, nach sichereren Alternativen zu suchen", "das veranlasste viele Nutzer, nach sichereren Alternativen zu suchen")],
 "es": [("A diferencia de muchas otras plataformas de chat aleatorio que bloquean la selección de país detrás de un plan VIP de pago mensual", "A diferencia de algunas plataformas de chat aleatorio que ofrecen la selección de país solo en un plan de pago"),
        ("Millones de usuarios usaban el chat aleatorio a diario, y tras su cierre", "El chat aleatorio era enormemente popular en todo el mundo, y tras su cierre"),
        ("lo que llevó a millones a buscar", "lo que llevó a muchos usuarios a buscar")],
 "fr": [("Contrairement à de nombreuses autres plateformes de chat aléatoire qui verrouillent la sélection du pays derrière un abonnement VIP payant mensuel", "Contrairement à certaines plateformes de chat aléatoire qui ne proposent la sélection du pays que dans une offre payante"),
        ("Des millions d'utilisateurs utilisaient le chat aléatoire chaque jour, et après sa fermeture", "Le chat aléatoire était extrêmement populaire dans le monde entier, et après sa fermeture"),
        ("poussant des millions d'utilisateurs à chercher", "poussant de nombreux utilisateurs à chercher")],
 "hi": [("कई अन्य रैंडम चैट प्लेटफॉर्म्स के विपरीत जो देश चुनने की सुविधा को महीने के भुगतान वाले VIP प्लान के पीछे छुपाते हैं", "कुछ रैंडम चैट प्लेटफॉर्म्स के विपरीत जो देश चुनने की सुविधा केवल पेड प्लान में देते हैं")],
 "id": [("Berbeda dengan banyak platform chat acak lain yang mengunci fitur pilihan negara di balik paket VIP berbayar bulanan", "Berbeda dengan beberapa platform chat acak yang hanya menyediakan pilihan negara di paket berbayar"),
        ("Jutaan pengguna di seluruh dunia memakai random chat setiap hari, dan setelah situs itu tutup", "Random chat sangat populer di seluruh dunia, dan setelah situs itu tutup"),
        ("mendorong jutaan orang mencari", "mendorong banyak orang mencari")],
 "it": [("A differenza di molte altre piattaforme di chat casuale che bloccano la selezione del paese dietro un abbonamento VIP mensile a pagamento", "A differenza di alcune piattaforme di chat casuale che offrono la selezione del paese solo con un piano a pagamento"),
        ("Milioni di utenti nel mondo usavano la chat casuale ogni giorno, e dopo la sua chiusura", "La chat casuale era molto popolare in tutto il mondo, e dopo la sua chiusura"),
        ("spingendo milioni di persone a cercare", "spingendo molte persone a cercare")],
 "pt": [("Diferente de muitas outras plataformas de chat aleatório que bloqueiam a seleção de país atrás de um plano VIP pago mensalmente", "Diferente de algumas plataformas de chat aleatório que oferecem a seleção de país apenas em um plano pago"),
        ("Milhões de usuários pelo mundo usavam o chat aleatório todos os dias, e depois do fechamento", "O chat aleatório era muito popular no mundo todo, e depois do fechamento"),
        ("levando milhões a buscar", "levando muitos usuários a buscar")],
 "ru": [("В отличие от многих других платформ случайного чата, которые скрывают выбор страны за платной ежемесячной VIP-подпиской", "В отличие от некоторых платформ случайного чата, где выбор страны доступен только в платном тарифе"),
        ("Миллионы пользователей по всему миру каждый день пользовались случайным чатом, и после закрытия сайта", "Случайный чат был очень популярен по всему миру, и после закрытия сайта"),
        ("что заставило миллионы людей искать", "что заставило многих людей искать")],
 "tr": [("Ülke seçimini aylık ücretli VIP plan arkasına kilitleyen birçok diğer rastgele sohbet platformunun aksine", "Ülke seçimini yalnızca ücretli planda sunan bazı rastgele sohbet platformlarının aksine")],
 "zh": [("全球数百万用户每天都在使用随机聊天，而该网站关闭后", "随机聊天曾在全球广受欢迎，而该网站关闭后"),
        ("促使数百万人寻找", "促使许多人寻找")],
}
for _l, _v in _X.items(): TEXT_FIXES.setdefault(_l, []).extend(_v)
_X2 = {
 "hi": [("जिससे लाखों लोग सुरक्षित विकल्प खोजने लगे", "जिससे कई लोग सुरक्षित विकल्प खोजने लगे"),
        ("दुनिया भर में लाखों यूज़र्स रोज़ रैंडम चैट इस्तेमाल करते थे", "दुनिया भर में रैंडम चैट बहुत लोकप्रिय था")],
 "tr": [("bu da milyonları daha güvenli alternatifler aramaya yöneltti", "bu da birçok kullanıcıyı daha güvenli alternatifler aramaya yöneltti"),
        ("Dünya çapında milyonlarca kullanıcı rastgele sohbeti her gün kullanıyordu;", "Rastgele sohbet dünya çapında çok popülerdi;")],
}
for _l, _v in _X2.items(): TEXT_FIXES.setdefault(_l, []).extend(_v)
ZH_VIP = (re.compile(r"与许多其他随机聊天平台不同，.*?VIP计划之后"), "与一些仅在付费套餐中提供国家选择的随机聊天平台不同")

FLAG = re.compile(r"VIP|million|ملايين|Millionen|milioni|milhões|milyon|миллион|मिलियन|लाखों|करोड़|juta|jutaan|millones|百万|数百万", re.I)

FOLLOW = "[\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u203a\u20ac\u2122]"
MOJI = re.compile("[\u00c2-\u00f4]" + FOLLOW + "{1,3}")
def _b(ch):
    o = ord(ch)
    if o < 0x100 and not (0x80 <= o <= 0x9f): return bytes([o])
    if 0x80 <= o <= 0x9f: return bytes([o])
    return ch.encode("cp1252")
def demoji(s):
    def f(m):
        try: return b"".join(_b(c) for c in m.group(0)).decode("utf-8")
        except Exception: return m.group(0)
    return MOJI.sub(f, s)

def read(p):
    raw = open(p, "rb").read()
    bom = raw.startswith(b"\xef\xbb\xbf")
    t = raw.decode("utf-8-sig")
    crlf = "\r\n" in t
    return t.replace("\r\n", "\n"), crlf, bom
def write(p, t, crlf, bom):
    if crlf: t = t.replace("\n", "\r\n")
    open(p, "wb").write((b"\xef\xbb\xbf" if bom else b"") + t.encode("utf-8"))

def lang_of(fn):
    return os.path.basename(fn).rsplit("-", 1)[1][:-5]

def h1_text(path):
    try: t, _, _ = read(path)
    except OSError: return None
    m = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
    return re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else None

def fix_schema(t, lang, slug, notes):
    for mm in re.finditer(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', t, re.S):
        try: d = json.loads(mm.group(1))
        except Exception: continue
        if d.get("@type") != "Article": continue
        desc = re.search(r'<meta name="description" content="([^"]*)"', t)
        url = f"{SITE}/{slug}-{lang}.html"
        logo = {"@type": "ImageObject", "url": f"{SITE}/randly-logo-512.png"}
        d.setdefault("description", desc.group(1) if desc else d.get("headline", ""))
        d["image"] = d.get("image") or f"{SITE}/randly-logo-512.png"
        d["inLanguage"] = lang
        d["author"] = {"@type": "Organization", "name": "Randly", "url": SITE + "/"}
        d["publisher"] = {"@type": "Organization", "name": "Randly", "url": SITE + "/", "logo": logo}
        d["mainEntityOfPage"] = {"@type": "WebPage", "@id": url}
        order = ["@context", "@type", "headline", "description", "image", "inLanguage", "author", "publisher",
                 "datePublished", "dateModified", "mainEntityOfPage"]
        d = {k: d[k] for k in order if k in d} | {k: v for k, v in d.items() if k not in order}
        new = '<script type="application/ld+json">\n' + json.dumps(d, ensure_ascii=False, indent=2) + "\n</script>"
        t = t[:mm.start()] + new + t[mm.end():]
        notes.append("schema")
        dp = d.get("datePublished"); dm = d.get("dateModified", dp)
        add = ""
        if 'property="og:locale"' not in t: add += f'<meta property="og:locale" content="{LOCALE[lang]}">\n'
        if 'property="og:site_name"' not in t: add += '<meta property="og:site_name" content="Randly">\n'
        if 'property="article:published_time"' not in t and dp:
            add += f'<meta property="article:published_time" content="{dp}">\n<meta property="article:modified_time" content="{dm}">\n'
        if 'name="author"' not in t: add += '<meta name="author" content="Randly">\n'
        if add:
            t = t.replace('<meta name="twitter:card"', add + '<meta name="twitter:card"', 1); notes.append("meta")
        return t
    return t

def fix_post(path, d, notes):
    t, crlf, bom = read(path); o = t
    lang = lang_of(path); slug = os.path.basename(path).rsplit("-", 1)[0]
    t = demoji(t)
    if t != o: notes.append("mojibake")
    for a, b in TEXT_FIXES.get(lang, []):
        if a in t: t = t.replace(a, b); notes.append("text")
    if lang in PARA_FIXES:
        start, new = PARA_FIXES[lang]
        t2 = re.sub(r"<p>" + re.escape(start) + r".*?</p>", lambda m: new, t, count=1, flags=re.S)
        if t2 != t: t = t2; notes.append("competitor-para")
    if lang == 'zh':
        t2 = ZH_VIP[0].sub(ZH_VIP[1], t)
        if t2 != t: t = t2; notes.append('text')
    # remove vague "Limited" row of the Omegle comparison table (all languages)
    if slug == "post-omegle-alternative":
        rows = re.findall(r"<tr>.*?</tr>", t, re.S)
        for i, r in enumerate(rows):
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)
            if 0 < i < len(rows) - 1 and len(cells) == 3 and cells[1].strip() not in ("✔", "✘"):
                t = t.replace(r + "\n", "", 1) if (r + "\n") in t else t.replace(r, "", 1); notes.append("row-removed")
    # Arabic stale dark fallback css
    t2 = re.sub(r"/\* تصميم احتياطي ثابت.*?\*/\s*\nhtml,body\{margin:0;background:#121218;[^}]*\}\n", "", t, flags=re.S)
    if t2 != t: t = t2; notes.append("stale-dark-css")
    t = fix_schema(t, lang, slug, notes)
    # related posts
    if "<!-- related-posts -->" not in t:
        other = SLUGS[1] if slug == SLUGS[0] else SLUGS[0]
        title = h1_text(os.path.join(d, f"{other}-{lang}.html"))
        if title:
            blk = (f'<!-- related-posts -->\n<aside style="max-width:760px;margin:30px auto 0;padding:0 20px;'
                   f'color:var(--text-main)"><h2 style="font-size:1.1rem;margin-bottom:8px">{READ_ALSO[lang]}</h2>'
                   f'<ul style="padding-inline-start:20px"><li><a href="{other}-{lang}.html" style="color:var(--accent-purple)">'
                   f'{title}</a></li><li><a href="blog-{lang}.html" style="color:var(--accent-purple)">'
                   f'Blog</a> · <a href="{lang}.html" style="color:var(--accent-purple)">Randly</a></li></ul></aside>\n')
            if '<footer class="app-footer">' in t:
                t = t.replace('<footer class="app-footer">', blk + '<footer class="app-footer">', 1)
                notes.append("related")
        else:
            notes.append("NO-SIBLING-FILE")
    if re.search("[\u00c3-\u00f4]" + FOLLOW, t): notes.append("MOJIBAKE-REMAINS")
    fl = sorted(set(m.group(0) for m in FLAG.finditer(t)))
    if fl: notes.append("REVIEW:" + ",".join(fl))
    return t, crlf, bom, t != o

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dir", default="public"); ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(); n = 0
    files = [f for s in SLUGS for f in sorted(glob.glob(os.path.join(a.dir, f"{s}-*.html")))]
    for f in files:
        notes = []
        try: t, crlf, bom, ch = fix_post(f, a.dir, notes)
        except Exception as e: print("ERR ", f, e); continue
        print(("CHANGE " if ch else "same   ") + os.path.basename(f), ",".join(dict.fromkeys(notes)))
        if ch and a.apply: write(f, t, crlf, bom); n += 1
    for f in sorted(glob.glob(os.path.join(a.dir, "blog-*.html"))):
        t, crlf, bom = read(f); t2 = demoji(t)
        print(("CHANGE " if t2 != t else "same   ") + os.path.basename(f), "mojibake" if t2 != t else "")
        if t2 != t and a.apply: write(f, t2, crlf, bom); n += 1
    print(f"\n{'APPLIED' if a.apply else 'DRY-RUN'}: {n} file(s) written" if a.apply else "\nDRY-RUN: nothing written. Add --apply to write.")
main()