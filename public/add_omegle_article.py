#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add_omegle_article.py - installs the new "Omegle alternatives" article in the
remaining 9 languages (fr de it pt tr ru hi id zh) and updates their blog cards.

Run from the folder that holds the site files (public):
    python add_omegle_article.py            # dry-run: shows what WOULD change, writes nothing
    python add_omegle_article.py --apply    # writes the changes
    python add_omegle_article.py --dir "C:\\path\\to\\public" --apply

Safe to run twice (second run changes nothing). Stops on any file it does not recognise.
Picture: uses randly-home-screen-XX.webp if present, otherwise the shared randly-home-screen.webp
(same folder). If neither exists the article is written without the picture and the script tells you.
"""
import re, json, html, os, sys, argparse

LANGS = {}

def esc(s): return html.escape(s, quote=False)
def esc_attr(s): return html.escape(s, quote=True)

SEP = " "
def bt(items):  # list of (bold, text) -> <li>
    return "\n".join(f"<li><strong>{esc(b)}</strong>{SEP}{esc(t)}</li>" for b, t in items)

def ul(items): return "<ul>\n" + "\n".join(f"<li>{x}</li>" for x in items) + "\n</ul>"
def ol(items): return "<ol>\n" + "\n".join(f"<li>{x}</li>" for x in items) + "\n</ol>"

def gen_body(code, L, img):
    global SEP
    SEP = L.get("sep", " ")
    home = "/" if code == "ar" else f"{code}.html"
    R = f'<a href="{home}">Randly</a>'
    cta_href = "/" if code == "ar" else f"/{code}.html"
    P = lambda t: f"<p>{t}</p>"
    out = []
    out.append('<div class="blog-article">')
    out.append(f'<a class="blog-back" href="blog-{code}.html">{esc(L["back"])}</a>')
    out.append(f'<h1>{esc(L["h1"])}</h1>')
    out.append(f'<p class="updated">{esc(L["updated"])}</p>')
    out.append("")
    out.append(P(esc(L["intro"][0])))
    out.append(P(esc(L["intro"][1]).replace("{R}", R)))
    out.append(f'<h2>{esc(L["what_h"])}</h2>')
    for t in L["what"]: out.append(P(esc(t)))
    out.append(f'<h3>{esc(L["pop_h"])}</h3>')
    out.append("<ul>\n" + bt(L["pop"]) + "\n</ul>")
    out.append(P(esc(L["pop_end"])))
    out.append(f'<h2>{esc(L["five_h"])}</h2>')
    c_h, c_p = L["c_h"], L["c_p"]
    for i in range(5):
        out.append(f"<h3>{esc(c_h[i])}</h3>")
        for t in c_p[i]: out.append(P(esc(t)))
        if i == 3: out.append("<ul>\n" + bt(L["c4_li"]) + "\n</ul>")
    out.append(f'<h2>{esc(L["types_h"])}</h2>')
    out.append(P(esc(L["types_intro"])))
    out.append("<ul>\n" + bt(L["types"]) + "\n</ul>")
    out.append(P(esc(L["types_end"])))
    out.append(f'<h2>{esc(L["fits_h"])}</h2>')
    out.append(P(esc(L["fits_intro"]).replace("{R}", R)))
    out.append(ul([esc(x) for x in L["fits"]]))
    if img:
        out.append(f'<p><img src="{img[0]}" alt="{esc_attr(L["img_alt"])}" width="{img[1]}" height="{img[2]}" loading="lazy" style="display:block;max-width:100%;height:auto;margin:16px auto;border-radius:12px;border:1px solid rgba(128,128,128,.25)"></p>')
    out.append(P(esc(L["fits_p"])))
    out.append(f'<h3>{esc(L["how_h"])}</h3>')
    out.append(ol([esc(x) for x in L["how"]]))
    out.append(P(esc(L["how_end"])))
    out.append(f'<h3>{esc(L["tr_h"])}</h3>')
    out.append(P(esc(L["tr"])))
    out.append(f'<h2>{esc(L["safe_h"])}</h2>')
    out.append(P(esc(L["safe_intro"])))
    out.append(ol([esc(x) for x in L["safe"]]))
    out.append(f'<h2>{esc(L["mist_h"])}</h2>')
    out.append("<ul>\n" + bt(L["mist"]) + "\n</ul>")
    out.append(f'<h2>{esc(L["faq_h"])}</h2>')
    for q, a in L["faq"]:
        out.append(f"<p><strong>{esc(q)}</strong><br>{esc(a)}</p>")
    out.append(f'<h2>{esc(L["fin_h"])}</h2>')
    out.append(P(esc(L["fin1"])))
    g = f'<a href="post-free-video-chat-{code}.html">{esc(L["guide_text"])}</a>'
    out.append(P(esc(L["fin2"]).replace("{R}", R).replace("{G}", g)))
    out.append("")
    out.append(f'<p><a class="blog-cta" href="{cta_href}">{esc(L["cta"])}</a></p>')
    out.append("</div>")
    return "\n".join(out)

def apply_post(text, code, L, img):
    """returns (new_text, list_of_problems)"""
    probs = []
    nl = "\r\n" if "\r\n" in text else "\n"
    s = text.replace("\r\n", "\n")
    blocks = re.findall(r'<div class="blog-article">[\s\S]*?</div>', s)
    if len(blocks) != 1:
        return text, [f"expected 1 article block, found {len(blocks)}"]
    body = gen_body(code, L, img)
    s = s.replace(blocks[0], "@@BODY@@", 1).replace("@@BODY@@", body, 1)
    d = esc_attr(L["desc"])
    def sub1(pat, repl, label):
        nonlocal s
        s, n = re.subn(pat, repl, s, count=1)
        if n != 1: probs.append(f"{label} not found")
    sub1(r'<title>[^<]*</title>', lambda m: f'<title>{esc(L["title"])}</title>', "title")
    sub1(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + d, "meta description")
    sub1(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + esc_attr(L["title"]), "og:title")
    sub1(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + d, "og:description")
    sub1(r'"headline": "[^"]*"', lambda m: '"headline": ' + json.dumps(L["h1"], ensure_ascii=False), "Article headline")
    sub1(r'("@type": "Article",[\s\S]*?"description": )"[^"]*"', lambda m: m.group(1) + json.dumps(L["desc"], ensure_ascii=False), "Article description")
    s = s.replace('"dateModified": "2026-10-01"', '"dateModified": "2026-10-13"').replace('article:modified_time" content="2026-10-01"', 'article:modified_time" content="2026-10-13"')
    fj = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in L["faq"]]}
    sub1(r'(<script type="application/ld\+json">\s*)\{\s*"@context": "https://schema.org",\s*"@type": "FAQPage"[\s\S]*?\n\}(\s*</script>)',
         lambda m: m.group(1) + json.dumps(fj, ensure_ascii=False, indent=2) + m.group(2), "FAQ schema")
    if probs: return text, probs
    return s.replace("\n", nl), []

def apply_blog(text, code, L):
    probs = []
    nl = "\r\n" if "\r\n" in text else "\n"
    s = text.replace("\r\n", "\n")
    href = f"post-omegle-alternative-{code}.html"
    pat_h = re.compile(r'(<h2><a href="' + re.escape(href) + r'">)[^<]*(</a></h2>)')
    pat_p = re.compile(r'(<p>)[^<]*(<a class="blog-more" href="' + re.escape(href) + r'">)')
    if len(pat_h.findall(s)) != 1 or len(pat_p.findall(s)) != 1:
        return text, ["blog card for the article not found exactly once"]
    s = pat_h.sub(lambda m: m.group(1) + esc(L["blog_title"]) + m.group(2), s, count=1)
    s = pat_p.sub(lambda m: m.group(1) + esc(L["desc"]) + " " + m.group(2), s, count=1)
    return s.replace("\n", nl), []


# ---------------- article text, one block per language ----------------
LANGS['fr'] = dict(
title="Meilleures alternatives à Omegle en 2026 (gratuit, sans inscription)",
desc="Omegle a fermé, mais le chat vidéo aléatoire existe toujours. Comparez les meilleures alternatives à Omegle en 2026 : sécurité, fonctions, mobile et critères.",
h1="Meilleures alternatives à Omegle en 2026 : ce qu'il faut vérifier avant de chatter",
back="← Retour au blog",
updated="Dernière mise à jour : octobre 2026",
intro=[
"Omegle a fermé en novembre 2023, et des millions de personnes se sont retrouvées sans leur moyen préféré de rencontrer des inconnus en ligne. Depuis, des dizaines d'« alternatives à Omegle » sont apparues et, franchement, elles ne se valent pas. Certaines sont remplies de publicités, d'autres n'ont aucune modération, et d'autres vous obligent à créer un compte avant de pouvoir dire bonjour.",
"Ce guide explique ce qui compte vraiment pour choisir un site de chat aléatoire en 2026, ce qu'il vaut mieux éviter, et la place de {R} parmi eux. Que vous vouliez pratiquer une langue, vous faire un ami dans un autre pays ou simplement passer dix minutes agréables, vous saurez à la fin exactement quoi chercher.",
],
what_h="Que s'est-il passé avec Omegle ?",
what=[
"Pendant des années, Omegle a été l'endroit par défaut pour rencontrer des gens au hasard sur Internet. On ouvrait le site, on appuyait sur un bouton et, en quelques secondes, on parlait à un inconnu, par écrit ou en vidéo. C'était simple, et c'est cette simplicité qui l'a rendu énorme.",
"Le site a fermé définitivement en novembre 2023. Depuis, de nombreux sites ont emprunté son nom ou copié son apparence. Il est important de comprendre qu'aucun d'eux n'est l'Omegle d'origine. Certains sont des sites de chat aléatoire corrects ; d'autres sont des copies conçues surtout pour afficher des publicités. C'est pourquoi il vaut la peine de bien regarder avant d'y passer du temps.",
],
pop_h="Pourquoi Omegle était-il populaire au départ ?",
pop=[
("Sans inscription.", "On ouvre le site, on appuie sur un bouton, on commence à parler."),
("Le hasard.", "On ne savait jamais sur qui on allait tomber ensuite."),
("Accès gratuit.", "Pas d'abonnement, pas de pièces, pas de paywall."),
],
pop_end="Une bonne alternative doit garder cet esprit tout en corrigeant ce qu'Omegle faisait mal : une modération faible et une mauvaise sécurité.",
five_h="5 points à vérifier dans toute alternative à Omegle",
c_h=[
"1. Est-ce vraiment gratuit et sans inscription ?",
"2. Comment la sécurité est-elle gérée ?",
"3. Est-ce que ça marche sur mobile ?",
"4. Pouvez-vous choisir avec qui vous parlez ?",
"5. Y a-t-il une prise en charge des langues ?",
],
c_p=[
[
"De nombreux sites affichent « gratuit » mais verrouillent des fonctions de base, comme le choix du pays, derrière un abonnement. D'autres vous laissent essayer une minute puis vous demandent de vous inscrire. Les écrans d'inscription sont l'une des raisons les plus courantes pour lesquelles les gens quittent un site de chat aléatoire, car tout l'intérêt est de commencer à parler rapidement.",
"Avant d'y consacrer du temps, vérifiez trois choses : pouvez-vous chatter en tant qu'invité, les filtres sont-ils gratuits, et le site vous pousse-t-il vers une offre payante ?",
],
[
"Cherchez un bouton de signalement, des bannissements temporaires automatiques pour les récidivistes et une règle claire de 18 ans minimum. Un site sans modération est un site qu'il faut quitter. Une bonne modération ne rend pas un site parfaitement sûr, mais elle montre que ceux qui le dirigent se soucient de l'expérience.",
"Vérifiez aussi si le site vous explique ce qu'il advient de vos conversations. Un site qui ne conserve pas vos chats est meilleur pour votre vie privée qu'un site qui les garde.",
],
[
"La plupart des gens chattent aujourd'hui depuis leur téléphone. Vous ne devriez pas avoir besoin de télécharger une application juste pour essayer un site. Une bonne version web fonctionne directement dans le navigateur du mobile : vous commencez en quelques secondes et vous fermez l'onglet quand vous avez fini. Les applications, c'est très bien si on les aime, mais elles doivent être facultatives, pas obligatoires.",
],
[
"Le hasard pur est amusant quelques minutes, puis il devient fatigant. On passe, on passe, on passe, et on ne trouve jamais une bonne conversation. Deux fonctions règlent ce problème :",
],
[
"Si vous apprenez l'anglais, l'espagnol ou l'arabe, ou si vous rencontrez simplement des gens d'autres pays, la traduction intégrée rend les conversations bien plus faciles. Sans traduction, un échange avec quelqu'un qui parle une autre langue s'arrête généralement après « bonjour ». Avec elle, on peut avoir une vraie conversation.",
],
],
c4_li=[
("Choix du pays.", "Si vous voulez parler à quelqu'un de Turquie, du Brésil ou du Japon, vous devriez pouvoir le choisir. Sur beaucoup de sites, c'est une fonction payante : vérifiez avant de compter dessus."),
("Association par centres d'intérêt.", "Parler à quelqu'un qui aime les mêmes jeux, la même musique ou les mêmes sujets que vous, c'est tout simplement mieux que de partir de zéro."),
],
types_h="Les types courants d'alternatives à Omegle",
types_intro="Toutes les alternatives ne fonctionnent pas de la même façon. Voici les types les plus courants que vous rencontrerez, avec les avantages et les inconvénients de chacun :",
types=[
("Sites avec compte obligatoire.", "Il faut s'inscrire avant de chatter. Ils peuvent sembler plus organisés, mais ils suppriment le côté immédiat et anonyme qu'on aimait chez Omegle."),
("Sites centrés sur l'application.", "Ils vous poussent à télécharger une application. C'est très bien pour certains, mais c'est un obstacle si vous voulez seulement essayer rapidement."),
("Sites freemium.", "Le chat de base est gratuit, mais les fonctions utiles comme les filtres de pays ou la traduction sont payantes."),
("Sites de navigateur entièrement gratuits.", "On ouvre une page et on commence. Ce sont les plus proches de l'idée d'origine."),
],
types_end="Aucun type n'est automatiquement bon ou mauvais. Le bon choix dépend de ce que vous voulez. Mais si vous cherchez l'expérience la plus proche de l'original, un site de navigateur entièrement gratuit, avec une modération raisonnable, est le meilleur choix.",
fits_h="Où se place Randly",
fits_intro="{R} est un chat vidéo et texte aléatoire gratuit, construit autour de ces cinq points :",
fits=[
"Aucune inscription requise",
"Chat vidéo et chat texte",
"Choix du pays, ou mode mondial qui vous met en relation avec n'importe qui",
"Association par centres d'intérêt",
"Traduction facultative des messages en direct dans 12 langues",
"Bouton de signalement avec bannissements temporaires automatiques pour les récidivistes",
"Fonctionne dans le navigateur de votre téléphone",
"Réservé aux 18 ans et plus, avec un écran de confirmation avant d'entrer",
"Aucune offre payante : toutes les fonctions sont gratuites",
],
fits_p="Nous avons créé Randly parce que les écrans d'inscription sont agaçants. Vous ouvrez le site, vous confirmez avoir 18 ans ou plus, et vous êtes dedans. Pas de compte, pas d'application à télécharger, pas d'offre payante qui cache les fonctions utiles. Le choix du pays et la traduction en direct, que beaucoup d'autres sites font payer, sont gratuits ici.",
how_h="Comment démarrer un chat sur Randly",
how=[
"Ouvrez Randly dans votre navigateur, sur téléphone ou sur ordinateur.",
"Confirmez que vous avez 18 ans ou plus.",
"Choisissez le chat vidéo ou le chat texte.",
"Choisissez un pays, ou restez en mode mondial pour rencontrer n'importe qui.",
"Ajoutez vos centres d'intérêt si vous voulez être mis en relation avec des personnes qui les partagent.",
"Appuyez sur démarrer. Si la personne ne vous convient pas, passez à la suivante.",
],
how_end="C'est tout le processus. Pas d'e-mail, pas de mot de passe et pas d'attente.",
tr_h="Une bonne façon d'utiliser la traduction",
tr="Imaginez que vous êtes en France et que vous voulez parler à quelqu'un de Turquie. Sur Randly, vous pouvez choisir la Turquie comme pays et, avec la traduction en direct activée, vous lisez la conversation en français pendant que l'autre personne la lit en turc. La traduction couvre 12 langues, donc elle fonctionne aussi pour beaucoup d'autres combinaisons. C'est également une façon très naturelle de pratiquer une langue, car vous parlez à de vraies personnes de vraies choses.",
safe_h="Conseils de sécurité pour tout site de chat aléatoire",
safe_intro="Le chat aléatoire est amusant, mais c'est aussi un endroit où l'on rencontre des inconnus. Quelques habitudes aident beaucoup :",
safe=[
"Ne partagez jamais votre nom complet, votre adresse, votre école, votre lieu de travail ou votre numéro de téléphone.",
"Ne cliquez pas sur les liens envoyés par des inconnus.",
"Passez ou signalez toute personne qui vous met mal à l'aise. Vous n'êtes jamais obligé de poursuivre un chat.",
"N'oubliez pas que n'importe qui peut enregistrer son écran. Agissez en conséquence.",
"N'envoyez ni argent ni cadeaux à quelqu'un rencontré dans un chat aléatoire, quelle que soit la qualité de son histoire.",
"Si la conversation glisse vers une demande de rejoindre une autre application ou un autre site, méfiez-vous.",
"Si vous avez moins de 18 ans, n'utilisez pas ces sites.",
],
mist_h="Erreurs courantes sur les sites de chat aléatoire",
mist=[
("Abandonner après deux ou trois passages.", "Toutes les rencontres ne seront pas bonnes. Donnez-vous quelques essais et utilisez les filtres de pays et de centres d'intérêt pour améliorer vos chances."),
("Commencer chaque chat par « salut » et rien d'autre.", "Une courte question comme « tu joues à quoi en ce moment ? » obtient une bien meilleure réponse."),
("Ignorer le bouton de signalement.", "Si quelqu'un enfreint les règles, le signaler aide à améliorer le site pour tout le monde."),
("Partager trop, trop vite.", "Allez-y doucement et gardez vos informations personnelles privées, même avec les personnes qui semblent sympathiques."),
],
faq_h="Questions fréquentes",
faq=[
("Y a-t-il un retour officiel d'Omegle ?", "Omegle a fermé définitivement en 2023. Tout site qui utilise ce nom aujourd'hui n'est pas le service d'origine."),
("Les alternatives à Omegle sont-elles sûres ?", "Cela dépend du site. Choisissez-en un avec signalement, bannissements et règles claires, et protégez toujours vos informations personnelles."),
("Quelle est la meilleure alternative à Omegle sans inscription ?", "Randly vous permet de lancer un chat vidéo ou texte en un clic, sans compte."),
("Puis-je utiliser le chat aléatoire sur mon téléphone ?", "Oui. Randly fonctionne directement dans le navigateur du mobile, sans télécharger d'application."),
("Le choix du pays est-il gratuit ?", "Sur Randly, oui. Le choix du pays et la traduction en direct sont gratuits. Beaucoup d'autres sites les font payer, alors vérifiez avant de compter sur un filtre."),
("Puis-je pratiquer une langue sur les sites de chat aléatoire ?", "Oui. Choisir un pays et utiliser la traduction en direct est un bon moyen de parler avec des locuteurs natifs et de pratiquer naturellement."),
("Qui peut utiliser Randly ?", "Uniquement les personnes de 18 ans ou plus. Le premier écran vous demande de confirmer votre âge avant d'entrer."),
],
fin_h="Pour conclure",
fin1="La meilleure alternative à Omegle est celle qui garde le côté simple et spontané de l'original tout en prenant la sécurité au sérieux. Cherchez un site gratuit, sans inscription, qui fonctionne sur votre téléphone, qui vous laisse choisir avec qui vous parlez et qui a une vraie modération.",
fin2="Essayez {R} et comparez. Vous pouvez aussi lire notre guide du {G}.",
guide_text="chat vidéo aléatoire gratuit et sans inscription",
cta="Commencer à chatter sur Randly",
img_alt="Écran d'accueil de Randly avec chat vidéo, chat texte et centres d'intérêt",
blog_title="Meilleures alternatives à Omegle en 2026 : ce qu'il faut vérifier avant de chatter",
)

LANGS['de'] = dict(
title="Die besten Omegle-Alternativen 2026 (kostenlos, ohne Anmeldung)",
desc="Omegle ist weg, aber Zufalls-Videochat gibt es weiter. Die besten Omegle-Alternativen 2026 im Vergleich: Sicherheit, Funktionen, Handy-Nutzung und worauf es ankommt.",
h1="Die besten Omegle-Alternativen 2026: Worauf du vor dem Chatten achten solltest",
back="← Zurück zum Blog",
updated="Zuletzt aktualisiert: Oktober 2026",
intro=[
"Omegle wurde im November 2023 geschlossen, und Millionen Menschen standen plötzlich ohne ihren Lieblingsweg da, online Fremde kennenzulernen. Seitdem sind Dutzende „Omegle-Alternativen“ aufgetaucht, und ehrlich gesagt sind sie nicht alle gleich gut. Manche sind voller Werbung, manche haben keinerlei Moderation, und manche zwingen dich, ein Konto anzulegen, bevor du „Hallo“ sagen kannst.",
"Dieser Ratgeber erklärt, was bei der Wahl einer Zufalls-Chatseite 2026 wirklich zählt, was du meiden solltest und wo {R} steht. Egal, ob du eine Sprache üben, einen neuen Freund aus einem anderen Land finden oder einfach zehn Minuten totschlagen willst: Am Ende weißt du genau, worauf du achten musst.",
],
what_h="Was ist mit Omegle passiert?",
what=[
"Jahrelang war Omegle der Standardort, um online zufällige Leute zu treffen. Man öffnete die Seite, drückte einen Knopf und sprach innerhalb weniger Sekunden mit einem Fremden, per Text oder per Video. Es war einfach, und genau diese Einfachheit machte es riesig.",
"Die Seite wurde im November 2023 endgültig geschlossen. Seitdem haben viele Websites den Namen übernommen oder das Aussehen kopiert. Wichtig zu verstehen: Keine davon ist das echte Omegle. Manche sind ordentliche Zufalls-Chatseiten, andere sind Kopien, die vor allem Werbung anzeigen sollen. Deshalb lohnt es sich, genau hinzuschauen, bevor du Zeit investierst.",
],
pop_h="Warum war Omegle überhaupt so beliebt?",
pop=[
("Keine Anmeldung.", "Seite öffnen, Knopf drücken, losreden."),
("Zufall.", "Man wusste nie, wen man als Nächstes trifft."),
("Kostenloser Zugang.", "Keine Abos, keine Münzen, keine Bezahlschranken."),
],
pop_end="Eine gute Alternative sollte diesen Geist bewahren und dabei beheben, was Omegle falsch gemacht hat: schwache Moderation und mangelnde Sicherheit.",
five_h="5 Dinge, die du bei jeder Omegle-Alternative prüfen solltest",
c_h=[
"1. Ist es wirklich kostenlos und ohne Registrierung?",
"2. Wie geht die Seite mit Sicherheit um?",
"3. Funktioniert sie auf dem Handy?",
"4. Kannst du auswählen, mit wem du sprichst?",
"5. Gibt es Sprachunterstützung?",
],
c_p=[
[
"Viele Seiten sagen „kostenlos“, sperren aber Grundfunktionen wie die Länderwahl hinter einem Bezahlplan. Andere lassen dich eine Minute lang testen und verlangen dann die Registrierung. Anmeldebildschirme gehören zu den häufigsten Gründen, warum Leute eine Zufalls-Chatseite verlassen, denn der ganze Sinn ist, schnell ins Gespräch zu kommen.",
"Prüfe, bevor du Zeit investierst, drei Dinge: Kannst du als Gast chatten? Sind die Filter kostenlos? Drängt dich die Seite zu einem Bezahlplan?",
],
[
"Achte auf einen Melden-Button, automatische vorübergehende Sperren für Wiederholungstäter und eine klare Regel ab 18. Eine Seite ohne Moderation solltest du verlassen. Gute Moderation macht eine Seite nicht perfekt sicher, zeigt aber, dass den Betreibern die Erfahrung wichtig ist.",
"Prüfe auch, ob die Seite sagt, was mit deinen Unterhaltungen passiert. Eine Seite, die deine Chats nicht speichert, ist für deine Privatsphäre besser als eine, die sie aufbewahrt.",
],
[
"Die meisten Leute chatten heute vom Handy aus. Du solltest keine App herunterladen müssen, nur um eine Seite auszuprobieren. Eine gute Webversion läuft direkt im mobilen Browser, du startest in Sekunden und schließt den Tab, wenn du fertig bist. Apps sind in Ordnung, wenn man sie mag, aber sie sollten optional sein, nicht Pflicht.",
],
[
"Reiner Zufall macht ein paar Minuten Spaß, dann wird er anstrengend. Du klickst weiter, weiter, weiter und findest nie ein gutes Gespräch. Zwei Funktionen lösen das:",
],
[
"Wenn du Englisch, Spanisch oder Arabisch üben willst oder einfach Leute aus anderen Ländern triffst, machen eingebaute Übersetzungen Gespräche viel einfacher. Ohne Übersetzung endet ein Chat mit jemandem, der eine andere Sprache spricht, meist nach „Hallo“. Mit ihr kann man ein echtes Gespräch führen.",
],
],
c4_li=[
("Länderwahl.", "Wenn du mit jemandem aus der Türkei, Brasilien oder Japan sprechen willst, solltest du das auswählen können. Auf vielen Seiten ist das eine Bezahlfunktion, prüfe es also, bevor du dich darauf verlässt."),
("Abgleich nach Interessen.", "Mit jemandem zu sprechen, der dieselben Spiele, dieselbe Musik oder dieselben Themen mag wie du, ist schlicht besser als ein leerer Start."),
],
types_h="Gängige Arten von Omegle-Alternativen",
types_intro="Nicht alle Alternativen funktionieren gleich. Das sind die gängigen Arten, die dir begegnen werden, samt ihrer Vor- und Nachteile:",
types=[
("Seiten mit Kontopflicht.", "Du musst dich vor dem Chatten registrieren. Sie wirken vielleicht organisierter, nehmen aber das sofortige, anonyme Gefühl, das Leute an Omegle mochten."),
("App-zuerst-Seiten.", "Sie drängen dich, eine App herunterzuladen. Für manche ist das in Ordnung, aber es ist eine Hürde, wenn du nur schnell etwas ausprobieren willst."),
("Freemium-Seiten.", "Der Basis-Chat ist kostenlos, aber nützliche Funktionen wie Länderfilter oder Übersetzung kosten Geld."),
("Komplett kostenlose Browser-Seiten.", "Du öffnest eine Seite und legst los. Sie kommen der ursprünglichen Idee am nächsten."),
],
types_end="Keine dieser Arten ist automatisch gut oder schlecht. Die richtige hängt davon ab, was du willst. Wenn du aber das Erlebnis möchtest, das dem Original am nächsten kommt, ist eine komplett kostenlose Browser-Seite mit vernünftiger Moderation die beste Wahl.",
fits_h="Wo Randly einzuordnen ist",
fits_intro="{R} ist ein kostenloser Zufalls-Video- und Textchat, aufgebaut um diese fünf Punkte:",
fits=[
"Keine Registrierung nötig",
"Videochat und Textchat",
"Länderwahl oder ein globaler Modus, der dich mit jedem verbindet",
"Abgleich nach Interessen",
"Optionale Live-Übersetzung von Nachrichten in 12 Sprachen",
"Melden-Button mit automatischen vorübergehenden Sperren für Wiederholungstäter",
"Funktioniert im Browser deines Handys",
"Nur ab 18, mit einem Bestätigungsbildschirm vor dem Einstieg",
"Kein Bezahlplan: Alle Funktionen sind kostenlos",
],
fits_p="Wir haben Randly gebaut, weil Anmeldebildschirme nerven. Du öffnest die Seite, bestätigst, dass du 18 oder älter bist, und bist drin. Kein Konto, keine App zum Herunterladen und kein Bezahlplan, der die nützlichen Funktionen versteckt. Länderwahl und Live-Übersetzung, für die viele andere Seiten Geld verlangen, sind hier kostenlos.",
how_h="So startest du einen Chat auf Randly",
how=[
"Öffne Randly in deinem Browser, auf dem Handy oder am Computer.",
"Bestätige, dass du 18 oder älter bist.",
"Wähle Videochat oder Textchat.",
"Wähle ein Land oder bleib im globalen Modus, um jeden zu treffen.",
"Füge deine Interessen hinzu, wenn du mit Leuten verbunden werden willst, die sie teilen.",
"Drücke Start. Wenn dir die Person nicht gefällt, geh zur nächsten weiter.",
],
how_end="Das ist der ganze Ablauf. Keine E-Mail, kein Passwort und kein Warten.",
tr_h="Eine gute Art, die Übersetzung zu nutzen",
tr="Angenommen, du bist aus Deutschland und willst mit jemandem aus der Türkei sprechen. Auf Randly kannst du die Türkei als Land wählen, und mit eingeschalteter Live-Übersetzung liest du das Gespräch auf Deutsch, während die andere Person es auf Türkisch liest. Die Übersetzung deckt 12 Sprachen ab und funktioniert daher auch für viele andere Kombinationen. Es ist außerdem eine sehr natürliche Art, eine Sprache zu üben, weil du mit echten Menschen über echte Dinge sprichst.",
safe_h="Sicherheitstipps für jede Zufalls-Chatseite",
safe_intro="Zufalls-Chat macht Spaß, ist aber auch ein Ort, an dem du Fremde triffst. Ein paar Gewohnheiten helfen sehr:",
safe=[
"Gib nie deinen vollständigen Namen, deine Adresse, Schule, Arbeitsstelle oder Telefonnummer weiter.",
"Klicke nicht auf Links von Fremden.",
"Überspringe oder melde jeden, bei dem du dich unwohl fühlst. Du bist nie verpflichtet, einen Chat fortzusetzen.",
"Denk daran, dass jeder seinen Bildschirm aufzeichnen kann. Verhalte dich entsprechend.",
"Schick kein Geld und keine Geschenke an jemanden aus einem Zufalls-Chat, egal wie gut die Geschichte klingt.",
"Wenn das Gespräch in Richtung einer anderen App oder Seite geht, sei misstrauisch.",
"Wenn du unter 18 bist, nutze diese Seiten nicht.",
],
mist_h="Häufige Fehler auf Zufalls-Chatseiten",
mist=[
("Nach zwei oder drei Mal Überspringen aufgeben.", "Nicht jeder Treffer ist gut. Gib dir ein paar Versuche und nutze Länder- und Interessenfilter, um deine Chancen zu verbessern."),
("Jeden Chat nur mit „Hi“ beginnen.", "Eine kurze Frage wie „Was spielst du gerade so?“ bringt eine viel bessere Antwort."),
("Den Melden-Button ignorieren.", "Wenn jemand gegen die Regeln verstößt, hilft das Melden, die Seite für alle besser zu machen."),
("Zu früh zu viel preisgeben.", "Geh es langsam an und halte persönliche Daten privat, auch bei Leuten, die freundlich wirken."),
],
faq_h="Häufige Fragen",
faq=[
("Gibt es ein offizielles Comeback von Omegle?", "Omegle wurde 2023 endgültig geschlossen. Jede Seite, die heute den Namen nutzt, ist nicht der ursprüngliche Dienst."),
("Sind Omegle-Alternativen sicher?", "Das hängt von der Seite ab. Wähle eine mit Melden-Funktion, Sperren und klaren Regeln, und schütze immer deine persönlichen Daten."),
("Was ist die beste Omegle-Alternative ohne Registrierung?", "Mit Randly startest du einen Video- oder Textchat mit einem Klick und ohne Konto."),
("Kann ich Zufalls-Chat auf dem Handy nutzen?", "Ja. Randly läuft direkt im mobilen Browser, ohne App-Download."),
("Ist die Länderwahl kostenlos?", "Auf Randly ja. Länderwahl und Live-Übersetzung sind beide kostenlos. Viele andere Seiten verlangen dafür Geld, prüfe es also, bevor du dich auf einen Filter verlässt."),
("Kann ich auf Zufalls-Chatseiten eine Sprache üben?", "Ja. Ein Land zu wählen und die Live-Übersetzung zu nutzen ist eine gute Möglichkeit, mit Muttersprachlern zu sprechen und ganz natürlich zu üben."),
("Wer darf Randly nutzen?", "Nur Personen ab 18 Jahren. Der erste Bildschirm bittet dich, dein Alter zu bestätigen, bevor du eintreten kannst."),
],
fin_h="Fazit",
fin1="Die beste Omegle-Alternative ist die, die das einfache, spontane Gefühl des Originals bewahrt und Sicherheit ernst nimmt. Suche eine Seite, die kostenlos ist, keine Registrierung braucht, auf deinem Handy läuft, dich wählen lässt, mit wem du sprichst, und echte Moderation hat.",
fin2="Probier {R} aus und vergleiche selbst. Du kannst auch unseren Ratgeber zum {G} lesen.",
guide_text="kostenlosen Zufalls-Videochat ohne Anmeldung",
cta="Jetzt auf Randly chatten",
img_alt="Randly-Startseite mit Videochat, Textchat und Interessen",
blog_title="Die besten Omegle-Alternativen 2026: Worauf du vor dem Chatten achten solltest",
)

LANGS['it'] = dict(
title="Le migliori alternative a Omegle nel 2026 (gratis, senza registrazione)",
desc="Omegle ha chiuso, ma la videochat casuale esiste ancora. Confronta le migliori alternative a Omegle nel 2026: sicurezza, funzioni, supporto mobile e cosa cercare.",
h1="Le migliori alternative a Omegle nel 2026: cosa controllare prima di chattare",
back="← Torna al blog",
updated="Ultimo aggiornamento: ottobre 2026",
intro=[
"Omegle ha chiuso a novembre 2023 e milioni di persone sono rimaste di colpo senza il loro modo preferito di conoscere sconosciuti online. Da allora sono comparse decine di «alternative a Omegle» e, a dire il vero, non sono tutte uguali. Alcune sono piene di pubblicità, altre non hanno alcuna moderazione, altre ancora ti obbligano a creare un account prima di poter dire ciao.",
"Questa guida spiega cosa conta davvero quando si sceglie un sito di chat casuale nel 2026, cosa evitare e dove si colloca {R}. Che tu voglia esercitarti con una lingua, fare amicizia con qualcuno di un altro paese o semplicemente passare dieci minuti in compagnia, alla fine saprai esattamente cosa cercare.",
],
what_h="Che cosa è successo a Omegle?",
what=[
"Per anni Omegle è stato il posto di riferimento per incontrare persone a caso online. Aprivi il sito, premevi un pulsante e in pochi secondi parlavi con uno sconosciuto, per iscritto o in video. Era semplice, e proprio questa semplicità lo ha reso enorme.",
"Il sito ha chiuso definitivamente a novembre 2023. Da allora molti siti ne hanno preso il nome o copiato l'aspetto. È importante capire che nessuno di loro è l'Omegle originale. Alcuni sono siti di chat casuale decenti, altri sono copie create soprattutto per mostrare pubblicità. Per questo conviene guardare con attenzione prima di dedicare loro il tuo tempo.",
],
pop_h="Perché Omegle era così popolare all'inizio?",
pop=[
("Nessuna registrazione.", "Apri il sito, premi un pulsante, inizi a parlare."),
("Casualità.", "Non sapevi mai chi avresti incontrato dopo."),
("Accesso gratuito.", "Niente abbonamenti, niente monete, niente paywall."),
],
pop_end="Una buona alternativa dovrebbe mantenere questo spirito e correggere ciò che Omegle sbagliava: moderazione debole e scarsa sicurezza.",
five_h="5 cose da controllare in qualsiasi alternativa a Omegle",
c_h=[
"1. È davvero gratis e senza registrazione?",
"2. Come gestisce la sicurezza?",
"3. Funziona sul telefono?",
"4. Puoi scegliere con chi parli?",
"5. C'è il supporto per le lingue?",
],
c_p=[
[
"Molti siti dicono «gratis», ma bloccano funzioni di base, come la scelta del paese, dietro un piano a pagamento. Altri ti lasciano provare per un minuto e poi chiedono di registrarti. Le schermate di registrazione sono uno dei motivi più comuni per cui le persone lasciano un sito di chat casuale, perché lo scopo è iniziare a parlare in fretta.",
"Prima di investire il tuo tempo, controlla tre cose: puoi chattare come ospite, i filtri sono gratuiti e il sito ti spinge verso un piano a pagamento?",
],
[
"Cerca un pulsante di segnalazione, blocchi temporanei automatici per chi infrange le regole più volte e una regola chiara dei 18 anni. Un sito senza moderazione è un sito da lasciare. Una buona moderazione non rende un sito perfettamente sicuro, ma dimostra che chi lo gestisce tiene all'esperienza.",
"Controlla anche se il sito ti dice cosa succede alle tue conversazioni. Un sito che non conserva le tue chat è meglio per la tua privacy di uno che le tiene.",
],
[
"Oggi la maggior parte delle persone chatta dal telefono. Non dovresti dover scaricare un'app solo per provare un sito. Una buona versione web funziona direttamente nel browser del cellulare, così inizi in pochi secondi e chiudi la scheda quando hai finito. Le app vanno bene se piacciono, ma dovrebbero essere facoltative, non obbligatorie.",
],
[
"La casualità pura diverte per qualche minuto, poi stanca. Salti, salti, salti e non trovi mai una buona conversazione. Due funzioni risolvono il problema:",
],
[
"Se vuoi esercitarti con inglese, spagnolo o arabo, o semplicemente incontri persone di altri paesi, la traduzione integrata rende le conversazioni molto più facili. Senza traduzione, una chat con qualcuno che parla un'altra lingua di solito finisce dopo «ciao». Con la traduzione si può avere una vera conversazione.",
],
],
c4_li=[
("Scelta del paese.", "Se vuoi parlare con qualcuno della Turchia, del Brasile o del Giappone, dovresti poterlo scegliere. Su molti siti è una funzione a pagamento, quindi controlla prima di contarci."),
("Abbinamento per interessi.", "Parlare con qualcuno a cui piacciono gli stessi giochi, la stessa musica o gli stessi argomenti è semplicemente meglio che partire da zero."),
],
types_h="I tipi più comuni di alternative a Omegle",
types_intro="Non tutte le alternative funzionano allo stesso modo. Ecco i tipi più comuni che incontrerai e i pro e i contro di ciascuno:",
types=[
("Siti con account obbligatorio.", "Devi registrarti prima di chattare. Possono sembrare più organizzati, ma tolgono la sensazione immediata e anonima che piaceva di Omegle."),
("Siti incentrati sull'app.", "Ti spingono a scaricare un'app. Va bene per alcuni, ma è un ostacolo se vuoi solo provare qualcosa in fretta."),
("Siti freemium.", "La chat di base è gratuita, ma funzioni utili come i filtri per paese o la traduzione costano."),
("Siti browser completamente gratuiti.", "Apri una pagina e inizi. Sono i più vicini all'idea originale."),
],
types_end="Nessuno di questi tipi è automaticamente buono o cattivo. Quello giusto dipende da cosa vuoi. Ma se cerchi l'esperienza più simile all'originale, un sito browser completamente gratuito e con una moderazione sensata è la scelta migliore.",
fits_h="Dove si colloca Randly",
fits_intro="{R} è una chat casuale gratuita di video e testo, costruita attorno a questi cinque punti:",
fits=[
"Nessuna registrazione richiesta",
"Videochat e chat di testo",
"Scelta del paese, oppure modalità globale che ti abbina a chiunque",
"Abbinamento per interessi",
"Traduzione facoltativa dei messaggi in tempo reale in 12 lingue",
"Pulsante di segnalazione con blocchi temporanei automatici per chi ripete le violazioni",
"Funziona nel browser del telefono",
"Solo per maggiorenni (18+), con una schermata di conferma prima di entrare",
"Nessun piano a pagamento: tutte le funzioni sono gratuite",
],
fits_p="Abbiamo creato Randly perché le schermate di registrazione sono fastidiose. Apri il sito, confermi di avere 18 anni o più e sei dentro. Nessun account, nessuna app da scaricare e nessun piano a pagamento che nasconda le funzioni utili. La scelta del paese e la traduzione in tempo reale, per cui molti altri siti chiedono denaro, qui sono gratuite.",
how_h="Come iniziare una chat su Randly",
how=[
"Apri Randly nel browser, dal telefono o dal computer.",
"Conferma di avere 18 anni o più.",
"Scegli videochat o chat di testo.",
"Scegli un paese, oppure resta in modalità globale per incontrare chiunque.",
"Aggiungi i tuoi interessi se vuoi essere abbinato a persone che li condividono.",
"Premi avvia. Se la persona non ti piace, passa alla successiva.",
],
how_end="Questo è tutto il processo. Niente e-mail, niente password e niente attese.",
tr_h="Un buon modo di usare la traduzione",
tr="Immagina di essere in Italia e di voler parlare con qualcuno della Turchia. Su Randly puoi scegliere la Turchia come paese e, con la traduzione in tempo reale attiva, leggi la conversazione in italiano mentre l'altra persona la legge in turco. La traduzione copre 12 lingue, quindi funziona anche per molte altre combinazioni. È anche un modo molto naturale di esercitarsi con una lingua, perché parli con persone vere di cose vere.",
safe_h="Consigli di sicurezza per qualsiasi sito di chat casuale",
safe_intro="La chat casuale è divertente, ma è anche un posto in cui incontri sconosciuti, quindi poche abitudini fanno molta differenza:",
safe=[
"Non condividere mai nome completo, indirizzo, scuola, luogo di lavoro o numero di telefono.",
"Non cliccare sui link inviati da sconosciuti.",
"Salta o segnala chiunque ti metta a disagio. Non sei mai obbligato a continuare una chat.",
"Ricorda che chiunque può registrare lo schermo. Comportati di conseguenza.",
"Non inviare denaro o regali a qualcuno conosciuto in una chat casuale, per quanto convincente sia la sua storia.",
"Se la conversazione ti porta a unirti a un'altra app o a un altro sito, diffida.",
"Se hai meno di 18 anni, non usare questi siti.",
],
mist_h="Errori comuni sui siti di chat casuale",
mist=[
("Arrendersi dopo due o tre salti.", "Non tutti gli abbinamenti saranno buoni. Concediti qualche tentativo e usa i filtri per paese e interessi per migliorare le probabilità."),
("Iniziare ogni chat solo con «ciao».", "Una domanda breve come «a cosa giochi ultimamente?» ottiene una risposta molto migliore."),
("Ignorare il pulsante di segnalazione.", "Se qualcuno infrange le regole, segnalarlo aiuta a migliorare il sito per tutti."),
("Condividere troppo e troppo presto.", "Vai con calma e tieni riservati i dati personali, anche con persone che sembrano gentili."),
],
faq_h="Domande frequenti",
faq=[
("Esiste un ritorno ufficiale di Omegle?", "Omegle ha chiuso definitivamente nel 2023. Qualsiasi sito che oggi usa quel nome non è il servizio originale."),
("Le alternative a Omegle sono sicure?", "Dipende dal sito. Scegline uno con segnalazioni, blocchi e regole chiare, e proteggi sempre i tuoi dati personali."),
("Qual è la migliore alternativa a Omegle senza registrazione?", "Randly ti permette di avviare una videochat o una chat di testo con un clic e senza account."),
("Posso usare la chat casuale dal telefono?", "Sì. Randly funziona direttamente nel browser del cellulare, senza scaricare alcuna app."),
("La scelta del paese è gratuita?", "Su Randly sì. Scelta del paese e traduzione in tempo reale sono entrambe gratuite. Molti altri siti le fanno pagare, quindi controlla prima di contare su un filtro."),
("Posso esercitarmi con una lingua sui siti di chat casuale?", "Sì. Scegliere un paese e usare la traduzione in tempo reale è un buon modo per parlare con madrelingua e fare pratica in modo naturale."),
("Chi può usare Randly?", "Solo persone di 18 anni o più. La prima schermata ti chiede di confermare la tua età prima di entrare."),
],
fin_h="Considerazioni finali",
fin1="La migliore alternativa a Omegle è quella che mantiene la sensazione semplice e spontanea dell'originale prendendo sul serio la sicurezza. Cerca un sito gratuito, senza registrazione, che funzioni sul telefono, che ti permetta di scegliere con chi parli e che abbia una vera moderazione.",
fin2="Prova {R} e fai il confronto. Puoi anche leggere la nostra guida alla {G}.",
guide_text="videochat casuale gratuita senza registrazione",
cta="Inizia a chattare su Randly",
img_alt="Schermata iniziale di Randly con videochat, chat di testo e interessi",
blog_title="Le migliori alternative a Omegle nel 2026: cosa controllare prima di chattare",
)

LANGS['pt'] = dict(
title="Melhores alternativas ao Omegle em 2026 (grátis, sem cadastro)",
desc="O Omegle acabou, mas o chat de vídeo aleatório continua. Compare as melhores alternativas ao Omegle em 2026: segurança, recursos, uso no celular e o que procurar.",
h1="Melhores alternativas ao Omegle em 2026: o que verificar antes de conversar",
back="← Voltar ao blog",
updated="Última atualização: outubro de 2026",
intro=[
"O Omegle fechou em novembro de 2023, e milhões de pessoas ficaram de repente sem a sua forma favorita de conhecer estranhos na internet. Desde então surgiram dezenas de «alternativas ao Omegle» e, sendo sincero, elas não são todas iguais. Algumas estão cheias de anúncios, outras não têm nenhuma moderação, e outras obrigam você a criar uma conta antes de dizer olá.",
"Este guia explica o que realmente importa ao escolher um site de chat aleatório em 2026, o que evitar e onde o {R} se encaixa. Seja para praticar um idioma, fazer um amigo de outro país ou apenas passar dez minutos, no final você saberá exatamente o que procurar.",
],
what_h="O que aconteceu com o Omegle?",
what=[
"Durante anos, o Omegle foi o lugar padrão para conhecer pessoas aleatórias na internet. Você abria o site, apertava um botão e, em segundos, estava falando com um estranho, por texto ou por vídeo. Era simples, e foi essa simplicidade que o tornou enorme.",
"O site foi encerrado em definitivo em novembro de 2023. Desde então, muitos sites pegaram o nome emprestado ou copiaram o visual. É importante entender que nenhum deles é o Omegle original. Alguns são sites de chat aleatório razoáveis; outros são cópias feitas principalmente para exibir anúncios. Por isso vale a pena olhar com cuidado antes de gastar seu tempo com qualquer um deles.",
],
pop_h="Por que o Omegle era popular desde o início?",
pop=[
("Sem cadastro.", "Abrir o site, apertar um botão e começar a conversar."),
("Aleatoriedade.", "Você nunca sabia quem encontraria em seguida."),
("Acesso grátis.", "Sem assinaturas, sem moedas, sem paywalls."),
],
pop_end="Uma boa alternativa deve manter esse espírito e corrigir o que o Omegle fazia mal: moderação fraca e pouca segurança.",
five_h="5 coisas para verificar em qualquer alternativa ao Omegle",
c_h=[
"1. É realmente grátis e sem cadastro?",
"2. Como ele lida com a segurança?",
"3. Funciona no celular?",
"4. Dá para escolher com quem você conversa?",
"5. Há suporte a idiomas?",
],
c_p=[
[
"Muitos sites dizem «grátis», mas bloqueiam recursos básicos, como a escolha do país, atrás de um plano pago. Outros deixam você testar por um minuto e depois pedem para se cadastrar. As telas de cadastro são um dos motivos mais comuns pelos quais as pessoas abandonam um site de chat aleatório, porque o objetivo é começar a conversar rápido.",
"Antes de investir seu tempo, verifique três coisas: dá para conversar como convidado, os filtros são grátis e o site empurra você para um plano pago?",
],
[
"Procure um botão de denúncia, banimentos temporários automáticos para reincidentes e uma regra clara de 18+. Um site sem moderação é um site que você deve deixar. Boa moderação não torna um site perfeitamente seguro, mas mostra que quem o administra se importa com a experiência.",
"Verifique também se o site informa o que acontece com as suas conversas. Um site que não guarda os seus chats é melhor para a sua privacidade do que um que os mantém.",
],
[
"Hoje a maioria das pessoas conversa pelo celular. Você não deveria precisar baixar um aplicativo só para testar um site. Uma boa versão web funciona direto no navegador do celular, então você começa em segundos e fecha a aba quando terminar. Aplicativos são ótimos para quem gosta, mas devem ser opcionais, não obrigatórios.",
],
[
"A aleatoriedade pura é divertida por alguns minutos e depois cansa. Você pula, pula, pula e nunca encontra uma boa conversa. Dois recursos resolvem isso:",
],
[
"Se você quer praticar inglês, espanhol ou árabe, ou simplesmente conhece pessoas de outros países, a tradução integrada torna as conversas muito mais fáceis. Sem tradução, um chat com alguém que fala outro idioma costuma acabar depois do «oi». Com ela, dá para ter uma conversa de verdade.",
],
],
c4_li=[
("Escolha do país.", "Se você quer falar com alguém da Turquia, do Brasil ou do Japão, deveria poder escolher. Em muitos sites isso é um recurso pago, então verifique antes de contar com ele."),
("Combinação por interesses.", "Conversar com alguém que gosta dos mesmos jogos, da mesma música ou dos mesmos assuntos que você é simplesmente melhor do que começar do zero."),
],
types_h="Tipos comuns de alternativas ao Omegle",
types_intro="Nem todas as alternativas funcionam do mesmo jeito. Estes são os tipos mais comuns que você vai encontrar, com os prós e contras de cada um:",
types=[
("Sites que exigem conta.", "Você precisa se cadastrar antes de conversar. Podem parecer mais organizados, mas eliminam a sensação imediata e anônima de que as pessoas gostavam no Omegle."),
("Sites focados em aplicativo.", "Empurram você para baixar um app. Serve para algumas pessoas, mas é uma barreira se você só quer testar algo rapidamente."),
("Sites freemium.", "O chat básico é grátis, mas recursos úteis como filtros de país ou tradução custam dinheiro."),
("Sites de navegador totalmente grátis.", "Você abre uma página e começa. São os mais próximos da ideia original."),
],
types_end="Nenhum desses tipos é automaticamente bom ou ruim. O certo depende do que você quer. Mas se você quer a experiência mais parecida com a original, um site de navegador totalmente grátis e com moderação razoável é a melhor opção.",
fits_h="Onde o Randly se encaixa",
fits_intro="O {R} é um chat aleatório de vídeo e texto gratuito, construído em torno desses cinco pontos:",
fits=[
"Não exige cadastro",
"Chat de vídeo e chat de texto",
"Escolha do país, ou modo global que conecta você com qualquer pessoa",
"Combinação por interesses",
"Tradução opcional das mensagens ao vivo em 12 idiomas",
"Botão de denúncia com banimentos temporários automáticos para reincidentes",
"Funciona no navegador do celular",
"Apenas para maiores de 18 anos, com uma tela de confirmação antes de entrar",
"Sem plano pago: todos os recursos são grátis",
],
fits_p="Criamos o Randly porque telas de cadastro são chatas. Você abre o site, confirma que tem 18 anos ou mais e já está dentro. Não há conta, não há aplicativo para baixar e não há plano pago escondendo os recursos úteis. Escolha de país e tradução ao vivo, pelos quais muitos outros sites cobram, são grátis aqui.",
how_h="Como começar um chat no Randly",
how=[
"Abra o Randly no navegador, no celular ou no computador.",
"Confirme que você tem 18 anos ou mais.",
"Escolha chat de vídeo ou chat de texto.",
"Escolha um país, ou fique no modo global para conhecer qualquer pessoa.",
"Adicione seus interesses se quiser ser combinado com pessoas que os compartilham.",
"Aperte iniciar. Se não gostar da pessoa, passe para a próxima.",
],
how_end="Esse é todo o processo. Sem e-mail, sem senha e sem espera.",
tr_h="Uma boa maneira de usar a tradução",
tr="Imagine que você é do Brasil e quer conversar com alguém da Turquia. No Randly você pode escolher a Turquia como país e, com a tradução ao vivo ativada, você lê a conversa em português enquanto a outra pessoa lê em turco. A tradução cobre 12 idiomas, então funciona também para muitas outras combinações. É ainda uma forma muito natural de praticar um idioma, porque você conversa com pessoas reais sobre coisas reais.",
safe_h="Dicas de segurança para qualquer site de chat aleatório",
safe_intro="O chat aleatório é divertido, mas também é um lugar onde você conhece estranhos, então alguns hábitos ajudam bastante:",
safe=[
"Nunca compartilhe seu nome completo, endereço, escola, local de trabalho ou número de telefone.",
"Não clique em links enviados por estranhos.",
"Pule ou denuncie quem deixar você desconfortável. Você nunca é obrigado a continuar um chat.",
"Lembre-se de que qualquer pessoa pode gravar a tela. Aja de acordo.",
"Não envie dinheiro nem presentes para alguém que você conheceu em um chat aleatório, por melhor que seja a história.",
"Se a conversa levar você a entrar em outro app ou site, desconfie.",
"Se você tem menos de 18 anos, não use esses sites.",
],
mist_h="Erros comuns em sites de chat aleatório",
mist=[
("Desistir depois de dois ou três pulos.", "Nem toda conexão será boa. Dê algumas chances e use os filtros de país e interesses para melhorar suas chances."),
("Começar todo chat só com «oi».", "Uma pergunta curta como «o que você tem jogado ultimamente?» recebe uma resposta muito melhor."),
("Ignorar o botão de denúncia.", "Se alguém quebra as regras, denunciar ajuda a deixar o site melhor para todos."),
("Compartilhar demais cedo demais.", "Vá com calma e mantenha seus dados pessoais privados, mesmo com quem parece simpático."),
],
faq_h="Perguntas frequentes",
faq=[
("Existe um retorno oficial do Omegle?", "O Omegle fechou em definitivo em 2023. Qualquer site que use o nome hoje não é o serviço original."),
("As alternativas ao Omegle são seguras?", "Depende do site. Escolha um com denúncias, banimentos e regras claras, e proteja sempre os seus dados pessoais."),
("Qual é a melhor alternativa ao Omegle sem cadastro?", "O Randly permite iniciar um chat de vídeo ou texto com um clique e sem conta."),
("Posso usar o chat aleatório no celular?", "Sim. O Randly funciona direto no navegador do celular, sem baixar aplicativo."),
("Escolher o país é grátis?", "No Randly, sim. A escolha do país e a tradução ao vivo são grátis. Muitos outros sites cobram por isso, então verifique antes de contar com um filtro."),
("Posso praticar um idioma em sites de chat aleatório?", "Sim. Escolher um país e usar a tradução ao vivo é uma boa forma de falar com nativos e praticar de maneira natural."),
("Quem pode usar o Randly?", "Somente pessoas com 18 anos ou mais. A primeira tela pede que você confirme a sua idade antes de entrar."),
],
fin_h="Considerações finais",
fin1="A melhor alternativa ao Omegle é a que mantém a sensação simples e espontânea do original e leva a segurança a sério. Procure um site grátis, sem cadastro, que funcione no celular, que deixe você escolher com quem fala e que tenha moderação de verdade.",
fin2="Experimente o {R} e compare. Você também pode ler o nosso guia sobre {G}.",
guide_text="chat de vídeo aleatório grátis e sem cadastro",
cta="Começar a conversar no Randly",
img_alt="Tela inicial do Randly com chat de vídeo, chat de texto e interesses",
blog_title="Melhores alternativas ao Omegle em 2026: o que verificar antes de conversar",
)

LANGS['tr'] = dict(
title="2026'nın En İyi Omegle Alternatifleri (Ücretsiz, Kayıtsız)",
desc="Omegle kapandı ama rastgele görüntülü sohbet sürüyor. 2026'nın en iyi Omegle alternatiflerini karşılaştırın: güvenlik, özellikler, mobil destek ve nelere bakmalı.",
h1="2026'nın En İyi Omegle Alternatifleri: Sohbet Etmeden Önce Nelere Bakmalı",
back="← Bloga dön",
updated="Son güncelleme: Ekim 2026",
intro=[
"Omegle Kasım 2023'te kapandı ve milyonlarca insan, internette yabancılarla tanışmanın en sevdikleri yolu olmadan kaldı. O günden beri düzinelerce «Omegle alternatifi» ortaya çıktı ve açıkçası hepsi aynı değil. Bazıları reklamlarla dolu, bazılarında hiç moderasyon yok, bazıları ise «merhaba» demeden önce hesap açmanızı zorunlu kılıyor.",
"Bu rehber, 2026'da rastgele sohbet sitesi seçerken gerçekten neyin önemli olduğunu, nelerden kaçınmanız gerektiğini ve {R}'nin bu tablodaki yerini anlatıyor. İster bir dil pratiği yapmak, ister başka bir ülkeden yeni bir arkadaş edinmek, ister sadece on dakika eğlenmek isteyin; sonunda tam olarak neye bakacağınızı bileceksiniz.",
],
what_h="Omegle'a ne oldu?",
what=[
"Yıllarca Omegle, internette rastgele insanlarla tanışmak için varsayılan adresti. Siteyi açıyor, bir düğmeye basıyor ve saniyeler içinde yazıyla ya da görüntüyle bir yabancıyla konuşuyordunuz. Basitti ve onu bu kadar büyüten de bu basitlikti.",
"Site Kasım 2023'te kalıcı olarak kapandı. O günden beri birçok web sitesi adını ödünç aldı ya da görünümünü kopyaladı. Bunlardan hiçbirinin orijinal Omegle olmadığını anlamak önemli. Bazıları fena olmayan rastgele sohbet siteleri; bazıları ise esas olarak reklam göstermek için yapılmış kopyalar. Bu yüzden herhangi birine zaman ayırmadan önce dikkatlice bakmakta fayda var.",
],
pop_h="Omegle en başta neden popülerdi?",
pop=[
("Kayıt yok.", "Siteyi açın, bir düğmeye basın, konuşmaya başlayın."),
("Rastgelelik.", "Bir sonraki kişinin kim olacağını asla bilemezdiniz."),
("Ücretsiz erişim.", "Abonelik yok, jeton yok, ödeme duvarı yok."),
],
pop_end="İyi bir alternatif bu ruhu korumalı ve Omegle'ın yanlış yaptığı şeyleri düzeltmeli: zayıf moderasyon ve yetersiz güvenlik.",
five_h="Her Omegle alternatifinde kontrol etmeniz gereken 5 şey",
c_h=[
"1. Gerçekten ücretsiz ve kayıtsız mı?",
"2. Güvenliği nasıl ele alıyor?",
"3. Telefonda çalışıyor mu?",
"4. Kiminle konuşacağınızı seçebiliyor musunuz?",
"5. Dil desteği var mı?",
],
c_p=[
[
"Birçok site «ücretsiz» der ama ülke seçimi gibi temel özellikleri ücretli bir planın arkasına kilitler. Bazıları bir dakika denemenize izin verir, sonra kayıt olmanızı ister. Kayıt ekranları, insanların rastgele sohbet sitelerini terk etmesinin en yaygın nedenlerinden biridir, çünkü asıl amaç hızlıca konuşmaya başlamaktır.",
"Zamanınızı harcamadan önce üç şeyi kontrol edin: Misafir olarak sohbet edebiliyor musunuz, filtreler ücretsiz mi ve site sizi ücretli bir plana yönlendiriyor mu?",
],
[
"Bir bildirme düğmesi, tekrar eden ihlalciler için otomatik geçici yasaklar ve net bir 18+ kuralı arayın. Moderasyonu olmayan bir site, ayrılmanız gereken bir sitedir. İyi moderasyon bir siteyi kusursuz derecede güvenli yapmaz, ama siteyi yönetenlerin deneyimi önemsediğini gösterir.",
"Ayrıca sitenin konuşmalarınıza ne olduğunu söyleyip söylemediğine bakın. Sohbetlerinizi saklamayan bir site, onları tutan bir siteden gizliliğiniz için daha iyidir.",
],
[
"Artık çoğu insan telefondan sohbet ediyor. Bir siteyi denemek için uygulama indirmeniz gerekmemeli. İyi bir web sürümü doğrudan mobil tarayıcıda çalışır; saniyeler içinde başlar, işiniz bitince sekmeyi kapatırsınız. Beğenenler için uygulamalar sorun değil ama zorunlu değil, isteğe bağlı olmalı.",
],
[
"Saf rastgelelik birkaç dakika eğlencelidir, sonra yorucu olur. Geçersiniz, geçersiniz, geçersiniz ve iyi bir sohbet bulamazsınız. İki özellik bunu çözer:",
],
[
"İngilizce, İspanyolca ya da Arapça pratiği yapmak istiyorsanız ya da sadece başka ülkelerden insanlarla tanışıyorsanız, yerleşik çeviri sohbetleri çok kolaylaştırır. Çeviri olmadan, farklı bir dil konuşan biriyle sohbet genellikle «merhaba»dan sonra biter. Çeviriyle gerçek bir konuşma yapabilirsiniz.",
],
],
c4_li=[
("Ülke seçimi.", "Türkiye'den, Brezilya'dan ya da Japonya'dan biriyle konuşmak istiyorsanız bunu seçebilmelisiniz. Birçok sitede bu ücretli bir özelliktir, o yüzden güvenmeden önce kontrol edin."),
("İlgi alanına göre eşleşme.", "Sizinle aynı oyunları, müziği ya da konuları seven biriyle konuşmak, boş bir başlangıçtan kesinlikle daha iyi bir deneyimdir."),
],
types_h="Yaygın Omegle alternatifi türleri",
types_intro="Tüm alternatifler aynı şekilde çalışmaz. Karşınıza çıkacak yaygın türler ve her birinin artıları ile eksileri şöyle:",
types=[
("Hesap isteyen siteler.", "Sohbetten önce kayıt olmanız gerekir. Daha düzenli görünebilirler ama Omegle'ın sevilen anlık ve anonim havasını ortadan kaldırırlar."),
("Önce uygulama diyen siteler.", "Sizi uygulama indirmeye yönlendirirler. Bazıları için sorun değil ama sadece hızlıca denemek istiyorsanız bir engeldir."),
("Freemium siteler.", "Temel sohbet ücretsizdir ama ülke filtresi ya da çeviri gibi işe yarar özellikler paralıdır."),
("Tamamen ücretsiz tarayıcı siteleri.", "Bir sayfa açıp başlarsınız. Orijinal fikre en yakın olanlar bunlardır."),
],
types_end="Bu türlerin hiçbiri kendiliğinden iyi ya da kötü değildir. Doğrusu ne istediğinize bağlı. Ama orijinale en yakın deneyimi istiyorsanız, makul moderasyonlu, tamamen ücretsiz bir tarayıcı sitesi en iyi seçenektir.",
fits_h="Randly nerede duruyor",
fits_intro="{R}, şu beş noktanın etrafında kurulmuş ücretsiz bir rastgele görüntülü ve yazılı sohbet sitesidir:",
fits=[
"Kayıt gerekmez",
"Görüntülü sohbet ve yazılı sohbet",
"Ülke seçimi ya da sizi herkesle eşleştiren küresel mod",
"İlgi alanına göre eşleşme",
"12 dilde isteğe bağlı canlı mesaj çevirisi",
"Tekrar eden ihlalciler için otomatik geçici yasaklı bildirme düğmesi",
"Telefon tarayıcınızda çalışır",
"Yalnızca 18 yaş ve üzeri, girişten önce onay ekranıyla",
"Ücretli plan yok: tüm özellikler ücretsiz",
],
fits_p="Randly'yi kayıt ekranları can sıkıcı olduğu için yaptık. Siteyi açıyor, 18 yaşında ya da daha büyük olduğunuzu onaylıyor ve içeri giriyorsunuz. Hesap yok, indirilecek uygulama yok ve işe yarar özellikleri saklayan ücretli plan yok. Birçok başka sitenin ücret aldığı ülke seçimi ve canlı çeviri burada ücretsiz.",
how_h="Randly'de sohbet nasıl başlatılır",
how=[
"Randly'yi tarayıcınızda, telefonda ya da bilgisayarda açın.",
"18 yaşında ya da daha büyük olduğunuzu onaylayın.",
"Görüntülü sohbeti ya da yazılı sohbeti seçin.",
"Bir ülke seçin ya da herkesle tanışmak için küresel modda kalın.",
"Aynı şeyleri sevenlerle eşleşmek istiyorsanız ilgi alanlarınızı ekleyin.",
"Başlat'a basın. Eşleşmeyi beğenmezseniz sıradaki kişiye geçin.",
],
how_end="Bütün süreç bu kadar. E-posta yok, şifre yok, bekleme yok.",
tr_h="Çeviriyi kullanmanın iyi bir yolu",
tr="Türkiye'den olduğunuzu ve İspanya'dan biriyle konuşmak istediğinizi düşünün. Randly'de ülke olarak İspanya'yı seçebilirsiniz ve canlı çeviri açıkken siz konuşmayı Türkçe okurken karşınızdaki kişi İspanyolca okur. Çeviri 12 dili kapsar, yani başka birçok kombinasyonda da çalışır. Bu aynı zamanda bir dili pratik etmenin çok doğal bir yoludur, çünkü gerçek insanlarla gerçek konular hakkında konuşursunuz.",
safe_h="Her rastgele sohbet sitesi için güvenlik ipuçları",
safe_intro="Rastgele sohbet eğlencelidir ama aynı zamanda yabancılarla karşılaştığınız bir yerdir, o yüzden birkaç alışkanlık çok işe yarar:",
safe=[
"Tam adınızı, adresinizi, okulunuzu, iş yerinizi ya da telefon numaranızı asla paylaşmayın.",
"Yabancıların gönderdiği bağlantılara tıklamayın.",
"Sizi rahatsız eden kişiyi geçin ya da bildirin. Bir sohbeti sürdürmek zorunda değilsiniz.",
"Herkesin ekranını kaydedebileceğini unutmayın. Buna göre davranın.",
"Rastgele sohbette tanıştığınız birine, hikâyesi ne kadar inandırıcı olursa olsun, para ya da hediye göndermeyin.",
"Konuşma sizi başka bir uygulamaya ya da siteye katılmaya yönlendiriyorsa şüpheyle yaklaşın.",
"18 yaşından küçükseniz bu siteleri kullanmayın.",
],
mist_h="Rastgele sohbet sitelerinde sık yapılan hatalar",
mist=[
("İki üç geçişten sonra pes etmek.", "Her eşleşme iyi olmayacak. Birkaç şans verin ve şansınızı artırmak için ülke ve ilgi filtrelerini kullanın."),
("Her sohbete sadece «selam» diye başlamak.", "«Bu aralar ne oynuyorsun?» gibi kısa bir soru çok daha iyi bir yanıt getirir."),
("Bildirme düğmesini görmezden gelmek.", "Biri kuralları çiğniyorsa bildirmek, siteyi herkes için daha iyi hale getirir."),
("Çok erken çok şey paylaşmak.", "Acele etmeyin ve samimi görünen insanlarla bile kişisel bilgilerinizi gizli tutun."),
],
faq_h="Sık sorulan sorular",
faq=[
("Omegle'ın resmî bir geri dönüşü var mı?", "Omegle 2023'te kalıcı olarak kapandı. Bugün bu adı kullanan herhangi bir site orijinal hizmet değildir."),
("Omegle alternatifleri güvenli mi?", "Siteye bağlı. Bildirme, yasaklama ve net kuralları olan birini seçin ve kişisel bilgilerinizi her zaman koruyun."),
("Kayıtsız en iyi Omegle alternatifi hangisi?", "Randly, hesap açmadan tek tıkla görüntülü ya da yazılı sohbet başlatmanızı sağlar."),
("Rastgele sohbeti telefonda kullanabilir miyim?", "Evet. Randly uygulama indirmeden doğrudan mobil tarayıcıda çalışır."),
("Ülke seçmek ücretsiz mi?", "Randly'de evet. Ülke seçimi ve canlı çeviri ikisi de ücretsiz. Birçok başka site bunlar için ücret alıyor, o yüzden bir filtreye güvenmeden önce kontrol edin."),
("Rastgele sohbet sitelerinde dil pratiği yapabilir miyim?", "Evet. Bir ülke seçip canlı çeviriyi kullanmak, ana dili konuşanlarla konuşmak ve doğal şekilde pratik yapmak için iyi bir yoldur."),
("Randly'yi kimler kullanabilir?", "Yalnızca 18 yaş ve üzeri kişiler. İlk ekran, girmeden önce yaşınızı onaylamanızı ister."),
],
fin_h="Son düşünceler",
fin1="En iyi Omegle alternatifi, orijinalin basit ve spontane havasını koruyup güvenliği ciddiye alandır. Ücretsiz olan, kayıt gerektirmeyen, telefonunuzda çalışan, kiminle konuşacağınızı seçmenize izin veren ve gerçek moderasyonu olan bir site arayın.",
fin2="{R}'yi deneyin ve karşılaştırın. Ayrıca {G} rehberimizi de okuyabilirsiniz.",
guide_text="kayıtsız ücretsiz rastgele görüntülü sohbet",
cta="Randly'de sohbete başla",
img_alt="Randly ana ekranı: görüntülü sohbet, yazılı sohbet ve ilgi alanları",
blog_title="2026'nın En İyi Omegle Alternatifleri: Sohbet Etmeden Önce Nelere Bakmalı",
)

LANGS['ru'] = dict(
title="Лучшие альтернативы Omegle в 2026 году (бесплатно, без регистрации)",
desc="Omegle закрылся, но случайный видеочат остался. Сравните лучшие альтернативы Omegle в 2026 году: безопасность, функции, работа на телефоне и на что смотреть.",
h1="Лучшие альтернативы Omegle в 2026 году: на что смотреть перед тем, как начать общение",
back="← Назад в блог",
updated="Последнее обновление: октябрь 2026",
intro=[
"Omegle закрылся в ноябре 2023 года, и миллионы людей внезапно остались без любимого способа знакомиться с незнакомцами в интернете. С тех пор появились десятки «альтернатив Omegle», и, честно говоря, они не одинаковы. В одних полно рекламы, в других нет никакой модерации, а третьи заставляют создавать аккаунт, прежде чем вы сможете сказать «привет».",
"В этом руководстве объясняется, что действительно важно при выборе сайта случайного чата в 2026 году, чего стоит избегать и какое место занимает {R}. Хотите ли вы практиковать язык, найти друга из другой страны или просто провести десять минут за общением, к концу вы будете точно знать, на что смотреть.",
],
what_h="Что случилось с Omegle?",
what=[
"Годами Omegle был главным местом, где можно познакомиться со случайными людьми в интернете. Вы открывали сайт, нажимали кнопку и через несколько секунд уже говорили с незнакомцем, текстом или по видео. Всё было просто, и именно эта простота сделала его огромным.",
"Сайт окончательно закрылся в ноябре 2023 года. С тех пор многие сайты позаимствовали его название или скопировали внешний вид. Важно понимать, что ни один из них не является настоящим Omegle. Некоторые из них вполне приличные сайты случайного чата; другие созданы в основном ради показа рекламы. Поэтому стоит внимательно присмотреться, прежде чем тратить на них время.",
],
pop_h="Чем Omegle был популярен с самого начала?",
pop=[
("Без регистрации.", "Откройте сайт, нажмите кнопку и начните говорить."),
("Случайность.", "Вы никогда не знали, с кем столкнётесь дальше."),
("Бесплатный доступ.", "Никаких подписок, монет и платных барьеров."),
],
pop_end="Хорошая альтернатива должна сохранить этот дух и исправить то, что Omegle делал плохо: слабую модерацию и недостаточную безопасность.",
five_h="5 вещей, которые нужно проверить в любой альтернативе Omegle",
c_h=[
"1. Он действительно бесплатный и без регистрации?",
"2. Как сайт обеспечивает безопасность?",
"3. Работает ли он на телефоне?",
"4. Можно ли выбирать, с кем говорить?",
"5. Есть ли поддержка языков?",
],
c_p=[
[
"Многие сайты пишут «бесплатно», но закрывают базовые функции, например выбор страны, за платным тарифом. Другие дают попробовать минуту, а потом просят зарегистрироваться. Экраны регистрации — одна из самых частых причин, по которым люди уходят с сайтов случайного чата, ведь главное — быстро начать разговор.",
"Прежде чем тратить время, проверьте три вещи: можно ли общаться как гость, бесплатны ли фильтры и подталкивает ли вас сайт к платному тарифу?",
],
[
"Ищите кнопку жалобы, автоматические временные блокировки для повторных нарушителей и чёткое правило 18+. Сайт без модерации — это сайт, который стоит покинуть. Хорошая модерация не делает сайт абсолютно безопасным, но показывает, что тем, кто им управляет, небезразлично качество общения.",
"Проверьте также, говорит ли сайт, что происходит с вашими разговорами. Сайт, который не хранит ваши чаты, лучше для вашей приватности, чем тот, который их сохраняет.",
],
[
"Сегодня большинство людей общается с телефона. Вам не должно требоваться скачивать приложение только ради того, чтобы попробовать сайт. Хорошая веб-версия работает прямо в мобильном браузере: вы начинаете за секунды и закрываете вкладку, когда закончили. Приложения — это нормально, если они вам нравятся, но они должны быть необязательными.",
],
[
"Чистая случайность забавна несколько минут, потом утомляет. Вы пропускаете, пропускаете, пропускаете и так и не находите хороший разговор. Две функции решают эту проблему:",
],
[
"Если вы хотите практиковать английский, испанский или арабский или просто знакомитесь с людьми из других стран, встроенный перевод делает разговоры намного проще. Без перевода чат с человеком, говорящим на другом языке, обычно заканчивается после «привет». С ним можно вести настоящий разговор.",
],
],
c4_li=[
("Выбор страны.", "Если вы хотите поговорить с кем-то из Турции, Бразилии или Японии, вы должны иметь возможность это выбрать. На многих сайтах это платная функция, поэтому проверьте, прежде чем на неё рассчитывать."),
("Подбор по интересам.", "Разговор с тем, кто любит те же игры, музыку или темы, что и вы, просто лучше, чем старт с чистого листа."),
],
types_h="Распространённые типы альтернатив Omegle",
types_intro="Не все альтернативы работают одинаково. Вот самые распространённые типы, с которыми вы столкнётесь, и плюсы и минусы каждого:",
types=[
("Сайты с обязательной учётной записью.", "Перед общением нужно зарегистрироваться. Они могут выглядеть более организованными, но лишают того мгновенного и анонимного ощущения, которое люди любили в Omegle."),
("Сайты, ориентированные на приложение.", "Они подталкивают вас скачать приложение. Для кого-то это нормально, но это препятствие, если вы просто хотите быстро попробовать."),
("Условно-бесплатные сайты.", "Базовый чат бесплатный, но полезные функции вроде фильтров по странам или перевода стоят денег."),
("Полностью бесплатные браузерные сайты.", "Вы открываете страницу и начинаете. Они ближе всего к первоначальной идее."),
],
types_end="Ни один из этих типов не является хорошим или плохим сам по себе. Правильный выбор зависит от того, что вам нужно. Но если вы хотите опыт, максимально близкий к оригиналу, лучший вариант — полностью бесплатный браузерный сайт с разумной модерацией.",
fits_h="Где место Randly",
fits_intro="{R} — это бесплатный случайный видеочат и текстовый чат, построенный вокруг этих пяти пунктов:",
fits=[
"Регистрация не требуется",
"Видеочат и текстовый чат",
"Выбор страны или глобальный режим, который соединяет вас с любым человеком",
"Подбор по интересам",
"Необязательный живой перевод сообщений на 12 языков",
"Кнопка жалобы с автоматическими временными блокировками для повторных нарушителей",
"Работает в браузере телефона",
"Только для лиц старше 18 лет, с экраном подтверждения перед входом",
"Нет платного тарифа: все функции бесплатны",
],
fits_p="Мы создали Randly, потому что экраны регистрации раздражают. Вы открываете сайт, подтверждаете, что вам 18 лет или больше, и вы внутри. Нет аккаунта, нет приложения для скачивания и нет платного тарифа, скрывающего полезные функции. Выбор страны и живой перевод, за которые многие другие сайты берут деньги, здесь бесплатны.",
how_h="Как начать чат в Randly",
how=[
"Откройте Randly в браузере, на телефоне или на компьютере.",
"Подтвердите, что вам 18 лет или больше.",
"Выберите видеочат или текстовый чат.",
"Выберите страну или оставайтесь в глобальном режиме, чтобы встретить кого угодно.",
"Добавьте свои интересы, если хотите, чтобы вас соединяли с теми, кто их разделяет.",
"Нажмите «Старт». Если собеседник вам не подходит, переходите к следующему.",
],
how_end="Вот и весь процесс. Без электронной почты, без пароля и без ожидания.",
tr_h="Хороший способ использовать перевод",
tr="Представьте, что вы из России и хотите поговорить с кем-то из Турции. В Randly вы можете выбрать Турцию как страну, и при включённом живом переводе вы читаете разговор по-русски, а ваш собеседник читает его по-турецки. Перевод охватывает 12 языков, поэтому работает и для многих других сочетаний. Это ещё и очень естественный способ практиковать язык, ведь вы говорите с настоящими людьми о настоящих вещах.",
safe_h="Советы по безопасности для любого сайта случайного чата",
safe_intro="Случайный чат — это весело, но это ещё и место, где вы встречаете незнакомцев, поэтому несколько привычек очень помогают:",
safe=[
"Никогда не сообщайте полное имя, адрес, школу, место работы или номер телефона.",
"Не переходите по ссылкам от незнакомцев.",
"Пропускайте или жалуйтесь на тех, кто вызывает у вас дискомфорт. Вы никогда не обязаны продолжать чат.",
"Помните, что любой может записать свой экран. Действуйте соответственно.",
"Не отправляйте деньги и подарки тому, с кем познакомились в случайном чате, как бы убедительно ни звучала его история.",
"Если разговор подталкивает вас перейти в другое приложение или на другой сайт, отнеситесь с подозрением.",
"Если вам нет 18 лет, не пользуйтесь этими сайтами.",
],
mist_h="Частые ошибки на сайтах случайного чата",
mist=[
("Сдаваться после двух-трёх пропусков.", "Не каждое соединение будет удачным. Дайте себе несколько попыток и используйте фильтры по странам и интересам, чтобы повысить шансы."),
("Начинать каждый чат только с «привет».", "Короткий вопрос вроде «во что ты играешь в последнее время?» получает гораздо лучший ответ."),
("Игнорировать кнопку жалобы.", "Если кто-то нарушает правила, жалоба помогает сделать сайт лучше для всех."),
("Слишком рано делиться лишним.", "Не торопитесь и сохраняйте личные данные в тайне, даже с теми, кто кажется дружелюбным."),
],
faq_h="Часто задаваемые вопросы",
faq=[
("Будет ли официальное возвращение Omegle?", "Omegle окончательно закрылся в 2023 году. Любой сайт, использующий это название сегодня, не является оригинальным сервисом."),
("Безопасны ли альтернативы Omegle?", "Это зависит от сайта. Выбирайте тот, где есть жалобы, блокировки и чёткие правила, и всегда защищайте личные данные."),
("Какая лучшая альтернатива Omegle без регистрации?", "Randly позволяет начать видеочат или текстовый чат одним щелчком и без аккаунта."),
("Можно ли пользоваться случайным чатом на телефоне?", "Да. Randly работает прямо в мобильном браузере, без скачивания приложения."),
("Выбор страны бесплатный?", "В Randly да. Выбор страны и живой перевод бесплатны. Многие другие сайты берут за них плату, поэтому проверьте, прежде чем рассчитывать на фильтр."),
("Можно ли практиковать язык на сайтах случайного чата?", "Да. Выбор страны и живой перевод — хороший способ поговорить с носителями и практиковаться естественным образом."),
("Кто может пользоваться Randly?", "Только люди старше 18 лет. Первый экран просит подтвердить возраст перед входом."),
],
fin_h="Итоги",
fin1="Лучшая альтернатива Omegle — та, что сохраняет простое и спонтанное ощущение оригинала и всерьёз относится к безопасности. Ищите сайт, который бесплатный, не требует регистрации, работает на телефоне, позволяет выбирать собеседника и имеет настоящую модерацию.",
fin2="Попробуйте {R} и сравните. Вы также можете прочитать наше руководство по {G}.",
guide_text="бесплатному случайному видеочату без регистрации",
cta="Начать общение в Randly",
img_alt="Главный экран Randly с видеочатом, текстовым чатом и интересами",
blog_title="Лучшие альтернативы Omegle в 2026 году: на что смотреть перед тем, как начать общение",
)

LANGS['hi'] = dict(
title="2026 में सबसे अच्छे Omegle विकल्प (मुफ़्त, बिना साइन-अप)",
desc="Omegle बंद हो गया, लेकिन रैंडम वीडियो चैट अब भी मौजूद है। 2026 के सबसे अच्छे Omegle विकल्पों की तुलना करें: सुरक्षा, फ़ीचर, मोबाइल सपोर्ट और क्या देखें।",
h1="2026 में सबसे अच्छे Omegle विकल्प: चैट शुरू करने से पहले क्या देखें",
back="← ब्लॉग पर वापस जाएँ",
updated="आख़िरी अपडेट: अक्टूबर 2026",
intro=[
"Omegle नवंबर 2023 में बंद हो गया, और लाखों लोग अचानक इंटरनेट पर अजनबियों से मिलने के अपने पसंदीदा तरीके के बिना रह गए। तब से दर्जनों «Omegle विकल्प» सामने आए हैं, और सच कहें तो वे सब एक जैसे नहीं हैं। कुछ विज्ञापनों से भरे हैं, कुछ में कोई मॉडरेशन नहीं है, और कुछ «हेलो» कहने से पहले ही आपसे अकाउंट बनवाते हैं।",
"यह गाइड बताती है कि 2026 में रैंडम चैट साइट चुनते समय असल में क्या मायने रखता है, किससे बचना चाहिए, और {R} कहाँ खड़ा है। चाहे आप कोई भाषा सीखना चाहें, दूसरे देश में नया दोस्त बनाना चाहें, या बस दस मिनट मज़े करना चाहें, अंत तक आप जान जाएँगे कि क्या देखना है।",
],
what_h="Omegle को क्या हुआ?",
what=[
"कई सालों तक Omegle इंटरनेट पर अनजान लोगों से मिलने की सबसे आम जगह रहा। आप साइट खोलते, एक बटन दबाते, और कुछ ही सेकंड में टेक्स्ट या वीडियो पर किसी अजनबी से बात कर रहे होते। यह आसान था, और इसी आसानी ने इसे इतना बड़ा बनाया।",
"यह साइट नवंबर 2023 में हमेशा के लिए बंद हो गई। तब से कई वेबसाइटों ने इसका नाम उधार लिया या इसका रूप-रंग कॉपी किया। यह समझना ज़रूरी है कि इनमें से कोई भी असली Omegle नहीं है। कुछ ठीक-ठाक रैंडम चैट साइटें हैं, जबकि कुछ मुख्य रूप से विज्ञापन दिखाने के लिए बनी नकलें हैं। इसीलिए किसी पर भी समय लगाने से पहले ध्यान से देखना फ़ायदेमंद है।",
],
pop_h="Omegle शुरू में लोकप्रिय क्यों हुआ?",
pop=[
("साइन-अप नहीं।", "साइट खोलिए, एक बटन दबाइए और बात शुरू कीजिए।"),
("रैंडम अनुभव।", "आपको कभी पता नहीं होता था कि अगला कौन मिलेगा।"),
("मुफ़्त पहुँच।", "न सब्सक्रिप्शन, न कॉइन, न पेवॉल।"),
],
pop_end="एक अच्छे विकल्प को यही भावना बनाए रखनी चाहिए, और Omegle की कमियाँ दूर करनी चाहिए: कमज़ोर मॉडरेशन और खराब सुरक्षा।",
five_h="किसी भी Omegle विकल्प में जाँचने वाली 5 बातें",
c_h=[
"1. क्या यह सच में मुफ़्त और बिना रजिस्ट्रेशन का है?",
"2. यह सुरक्षा कैसे संभालता है?",
"3. क्या यह फ़ोन पर चलता है?",
"4. क्या आप चुन सकते हैं कि किससे बात करें?",
"5. क्या भाषा का सपोर्ट है?",
],
c_p=[
[
"कई साइटें «मुफ़्त» कहती हैं, लेकिन देश चुनने जैसे बुनियादी फ़ीचर को पेड प्लान के पीछे बंद कर देती हैं। कुछ आपको एक मिनट आज़माने देती हैं और फिर रजिस्टर करने को कहती हैं। रजिस्ट्रेशन स्क्रीन लोगों के रैंडम चैट साइट छोड़ने के सबसे आम कारणों में से एक है, क्योंकि पूरा मक़सद जल्दी बात शुरू करना होता है।",
"अपना समय लगाने से पहले तीन बातें जाँच लें: क्या आप गेस्ट के तौर पर चैट कर सकते हैं, क्या फ़िल्टर मुफ़्त हैं, और क्या साइट आपको पेड प्लान की ओर धकेलती है?",
],
[
"रिपोर्ट बटन, बार-बार नियम तोड़ने वालों के लिए अपने-आप लगने वाले अस्थायी बैन, और 18+ का साफ़ नियम देखें। जिस साइट पर कोई मॉडरेशन नहीं है, उसे छोड़ देना चाहिए। अच्छा मॉडरेशन किसी साइट को पूरी तरह सुरक्षित नहीं बनाता, लेकिन यह दिखाता है कि उसे चलाने वाले अनुभव की परवाह करते हैं।",
"यह भी देखें कि साइट बताती है या नहीं कि आपकी बातचीत का क्या होता है। जो साइट आपकी चैट सेव नहीं करती, वह आपकी प्राइवेसी के लिए उस साइट से बेहतर है जो उन्हें रखती है।",
],
[
"आज ज़्यादातर लोग फ़ोन से चैट करते हैं। किसी साइट को आज़माने भर के लिए आपको ऐप डाउनलोड नहीं करना चाहिए। एक अच्छा वेब वर्ज़न सीधे मोबाइल ब्राउज़र में चलता है, इसलिए आप सेकंडों में शुरू कर सकते हैं और काम खत्म होने पर टैब बंद कर सकते हैं। जिन्हें पसंद हो उनके लिए ऐप ठीक हैं, लेकिन वे वैकल्पिक होने चाहिए, अनिवार्य नहीं।",
],
[
"पूरी तरह रैंडम होना कुछ मिनटों तक मज़ेदार लगता है, फिर थका देता है। आप स्किप, स्किप, स्किप करते रहते हैं और कभी अच्छी बातचीत नहीं मिलती। दो फ़ीचर इसे ठीक करते हैं:",
],
[
"अगर आप अंग्रेज़ी, स्पैनिश या अरबी का अभ्यास करना चाहते हैं, या बस दूसरे देशों के लोगों से मिलते हैं, तो इन-बिल्ट अनुवाद बातचीत को बहुत आसान बना देता है। अनुवाद के बिना, दूसरी भाषा बोलने वाले से चैट आम तौर पर «हेलो» के बाद खत्म हो जाती है। अनुवाद के साथ आप असली बातचीत कर सकते हैं।",
],
],
c4_li=[
("देश चुनना।", "अगर आप तुर्की, ब्राज़ील या जापान के किसी व्यक्ति से बात करना चाहते हैं, तो आपको यह चुनने की सुविधा होनी चाहिए। कई साइटों पर यह पेड फ़ीचर है, इसलिए भरोसा करने से पहले जाँच लें।"),
("रुचियों के आधार पर मैचिंग।", "ऐसे व्यक्ति से बात करना जिसे आपकी जैसी गेम, संगीत या विषय पसंद हों, खाली शुरुआत से बस बेहतर अनुभव है।"),
],
types_h="Omegle विकल्पों के आम प्रकार",
types_intro="सभी विकल्प एक तरह से काम नहीं करते। ये वे आम प्रकार हैं जो आपको मिलेंगे, और हर एक के फ़ायदे-नुकसान:",
types=[
("अकाउंट माँगने वाली साइटें।", "चैट से पहले रजिस्टर करना पड़ता है। ये ज़्यादा व्यवस्थित लग सकती हैं, लेकिन Omegle की वह तुरंत और बेनाम वाली भावना खत्म कर देती हैं जो लोगों को पसंद थी।"),
("पहले ऐप वाली साइटें।", "ये आपको ऐप डाउनलोड करने की ओर धकेलती हैं। कुछ लोगों के लिए ठीक है, लेकिन अगर आप बस जल्दी आज़माना चाहते हैं तो यह रुकावट है।"),
("फ़्रीमियम साइटें।", "बेसिक चैट मुफ़्त है, लेकिन देश फ़िल्टर या अनुवाद जैसे काम के फ़ीचर के पैसे लगते हैं।"),
("पूरी तरह मुफ़्त ब्राउज़र साइटें।", "आप एक पेज खोलते हैं और शुरू हो जाते हैं। ये मूल विचार के सबसे क़रीब हैं।"),
],
types_end="इनमें से कोई भी अपने-आप अच्छा या बुरा नहीं है। सही विकल्प इस पर निर्भर करता है कि आप क्या चाहते हैं। लेकिन अगर आप मूल के सबसे क़रीब अनुभव चाहते हैं, तो समझदार मॉडरेशन वाली पूरी तरह मुफ़्त ब्राउज़र साइट सबसे अच्छा विकल्प है।",
fits_h="Randly कहाँ फ़िट बैठता है",
fits_intro="{R} एक मुफ़्त रैंडम वीडियो और टेक्स्ट चैट है, जो इन्हीं पाँच बातों के आधार पर बना है:",
fits=[
"रजिस्ट्रेशन की ज़रूरत नहीं",
"वीडियो चैट और टेक्स्ट चैट",
"देश का चुनाव, या ग्लोबल मोड जो आपको किसी से भी जोड़ता है",
"रुचियों के आधार पर मैचिंग",
"12 भाषाओं में वैकल्पिक लाइव मैसेज अनुवाद",
"बार-बार नियम तोड़ने वालों के लिए अपने-आप लगने वाले अस्थायी बैन के साथ रिपोर्ट बटन",
"आपके फ़ोन के ब्राउज़र में चलता है",
"केवल 18+ के लिए, अंदर आने से पहले पुष्टि स्क्रीन के साथ",
"कोई पेड प्लान नहीं: सारे फ़ीचर मुफ़्त हैं",
],
fits_p="हमने Randly इसलिए बनाया क्योंकि रजिस्ट्रेशन स्क्रीन परेशान करती हैं। आप साइट खोलते हैं, पुष्टि करते हैं कि आप 18 साल या उससे ज़्यादा के हैं, और अंदर पहुँच जाते हैं। कोई अकाउंट नहीं, डाउनलोड करने के लिए कोई ऐप नहीं, और कोई पेड प्लान नहीं जो काम के फ़ीचर छिपाए। देश चुनना और लाइव अनुवाद, जिनके लिए कई दूसरी साइटें पैसे लेती हैं, यहाँ मुफ़्त हैं।",
how_h="Randly पर चैट कैसे शुरू करें",
how=[
"अपने ब्राउज़र में Randly खोलें, फ़ोन पर या कंप्यूटर पर।",
"पुष्टि करें कि आप 18 साल या उससे ज़्यादा के हैं।",
"वीडियो चैट या टेक्स्ट चैट चुनें।",
"कोई देश चुनें, या किसी से भी मिलने के लिए ग्लोबल मोड में रहें।",
"अगर आप अपनी जैसी रुचि वाले लोगों से मैच होना चाहते हैं तो अपनी रुचियाँ जोड़ें।",
"स्टार्ट दबाएँ। अगर मैच पसंद न आए तो अगले व्यक्ति पर चले जाएँ।",
],
how_end="बस यही पूरी प्रक्रिया है। न ईमेल, न पासवर्ड और न इंतज़ार।",
tr_h="अनुवाद इस्तेमाल करने का एक अच्छा तरीका",
tr="मान लीजिए आप भारत से हैं और तुर्की के किसी व्यक्ति से बात करना चाहते हैं। Randly पर आप देश के रूप में तुर्की चुन सकते हैं, और लाइव अनुवाद चालू होने पर आप बातचीत हिंदी में पढ़ते हैं जबकि दूसरा व्यक्ति उसे तुर्की में पढ़ता है। अनुवाद 12 भाषाओं को कवर करता है, इसलिए यह कई और जोड़ियों के लिए भी काम करता है। यह किसी भाषा का अभ्यास करने का बहुत स्वाभाविक तरीका भी है, क्योंकि आप असली लोगों से असली बातों पर बात करते हैं।",
safe_h="किसी भी रैंडम चैट साइट के लिए सुरक्षा सुझाव",
safe_intro="रैंडम चैट मज़ेदार है, लेकिन यह ऐसी जगह भी है जहाँ आप अजनबियों से मिलते हैं, इसलिए कुछ आदतें बहुत काम आती हैं:",
safe=[
"अपना पूरा नाम, पता, स्कूल, कार्यस्थल या फ़ोन नंबर कभी साझा न करें।",
"अजनबियों के भेजे लिंक पर क्लिक न करें।",
"जो आपको असहज करे उसे स्किप करें या रिपोर्ट करें। आप कोई चैट जारी रखने के लिए बाध्य नहीं हैं।",
"याद रखें कि कोई भी अपनी स्क्रीन रिकॉर्ड कर सकता है। उसी हिसाब से व्यवहार करें।",
"रैंडम चैट में मिले किसी व्यक्ति को पैसे या उपहार न भेजें, चाहे उसकी कहानी कितनी भी अच्छी लगे।",
"अगर बातचीत आपको किसी दूसरे ऐप या साइट से जुड़ने की ओर ले जाए, तो शक की नज़र से देखें।",
"अगर आपकी उम्र 18 साल से कम है, तो इन साइटों का इस्तेमाल न करें।",
],
mist_h="रैंडम चैट साइटों पर लोगों की आम गलतियाँ",
mist=[
("दो-तीन स्किप के बाद हार मान लेना।", "हर मैच अच्छा नहीं होगा। कुछ कोशिशें दें, और अपने मौक़े बढ़ाने के लिए देश और रुचि फ़िल्टर इस्तेमाल करें।"),
("हर चैट सिर्फ़ «हाय» से शुरू करना।", "«आजकल कौन-सा गेम खेल रहे हो?» जैसा छोटा सवाल कहीं बेहतर जवाब दिलाता है।"),
("रिपोर्ट बटन को अनदेखा करना।", "अगर कोई नियम तोड़ता है, तो उसे रिपोर्ट करने से साइट सबके लिए बेहतर बनती है।"),
("बहुत जल्दी बहुत कुछ बता देना।", "धीरे चलें, और दोस्ताना लगने वाले लोगों से भी अपनी निजी जानकारी निजी रखें।"),
],
faq_h="अक्सर पूछे जाने वाले सवाल",
faq=[
("क्या Omegle की आधिकारिक वापसी हुई है?", "Omegle 2023 में हमेशा के लिए बंद हो गया। आज जो भी साइट यह नाम इस्तेमाल करती है, वह मूल सेवा नहीं है।"),
("क्या Omegle के विकल्प सुरक्षित हैं?", "यह साइट पर निर्भर करता है। रिपोर्टिंग, बैन और साफ़ नियमों वाली साइट चुनें, और अपनी निजी जानकारी हमेशा सुरक्षित रखें।"),
("बिना रजिस्ट्रेशन का सबसे अच्छा Omegle विकल्प कौन-सा है?", "Randly आपको बिना अकाउंट के एक क्लिक में वीडियो या टेक्स्ट चैट शुरू करने देता है।"),
("क्या मैं फ़ोन पर रैंडम चैट इस्तेमाल कर सकता हूँ?", "हाँ। Randly सीधे मोबाइल ब्राउज़र में चलता है, ऐप डाउनलोड किए बिना।"),
("क्या देश चुनना मुफ़्त है?", "Randly पर हाँ। देश चुनना और लाइव अनुवाद दोनों मुफ़्त हैं। कई दूसरी साइटें इनके पैसे लेती हैं, इसलिए किसी फ़िल्टर पर भरोसा करने से पहले जाँच लें।"),
("क्या मैं रैंडम चैट साइटों पर कोई भाषा सीख सकता हूँ?", "हाँ। कोई देश चुनना और लाइव अनुवाद इस्तेमाल करना, मूल बोलने वालों से बात करने और स्वाभाविक रूप से अभ्यास करने का अच्छा तरीका है।"),
("Randly कौन इस्तेमाल कर सकता है?", "केवल 18 साल या उससे ज़्यादा उम्र के लोग। पहली स्क्रीन अंदर आने से पहले आपसे उम्र की पुष्टि करने को कहती है।"),
],
fin_h="अंतिम विचार",
fin1="सबसे अच्छा Omegle विकल्प वही है जो मूल की सरल और सहज भावना बनाए रखे और सुरक्षा को गंभीरता से ले। ऐसी साइट खोजें जो मुफ़्त हो, रजिस्ट्रेशन न माँगे, आपके फ़ोन पर चले, आपको चुनने दे कि किससे बात करनी है, और जिसमें असली मॉडरेशन हो।",
fin2="{R} आज़माएँ और खुद तुलना करें। आप {G} पर हमारी गाइड भी पढ़ सकते हैं।",
guide_text="बिना साइन-अप मुफ़्त रैंडम वीडियो चैट",
cta="अभी Randly पर चैट शुरू करें",
img_alt="Randly का होम स्क्रीन: वीडियो चैट, टेक्स्ट चैट और रुचियाँ",
blog_title="2026 में सबसे अच्छे Omegle विकल्प: चैट शुरू करने से पहले क्या देखें",
)

LANGS['id'] = dict(
title="Alternatif Omegle Terbaik 2026 (Gratis, Tanpa Daftar)",
desc="Omegle sudah tutup, tetapi video chat acak masih ada. Bandingkan alternatif Omegle terbaik 2026: keamanan, fitur, dukungan ponsel, dan hal yang perlu dicari.",
h1="Alternatif Omegle Terbaik 2026: Apa yang Perlu Dicek Sebelum Mengobrol",
back="← Kembali ke blog",
updated="Terakhir diperbarui: Oktober 2026",
intro=[
"Omegle tutup pada November 2023, dan jutaan orang tiba-tiba kehilangan cara favorit mereka untuk bertemu orang asing secara online. Sejak itu muncul puluhan «alternatif Omegle», dan jujur saja, semuanya tidak sama. Ada yang penuh iklan, ada yang tanpa moderasi sama sekali, dan ada yang memaksa Anda membuat akun sebelum bisa menyapa.",
"Panduan ini menjelaskan apa yang benar-benar penting saat memilih situs obrolan acak di 2026, apa yang sebaiknya dihindari, dan di mana posisi {R}. Entah Anda ingin melatih bahasa, berteman dengan orang dari negara lain, atau sekadar mengisi sepuluh menit, di akhir Anda akan tahu persis apa yang harus dicari.",
],
what_h="Apa yang Terjadi pada Omegle?",
what=[
"Bertahun-tahun, Omegle menjadi tempat utama untuk bertemu orang acak di internet. Anda membuka situs, menekan satu tombol, dan dalam hitungan detik sudah berbicara dengan orang asing, lewat teks atau video. Semuanya sederhana, dan kesederhanaan itulah yang membuatnya sangat besar.",
"Situs itu tutup permanen pada November 2023. Sejak itu, banyak situs meminjam namanya atau meniru tampilannya. Penting untuk dipahami bahwa tidak ada satu pun dari mereka yang merupakan Omegle asli. Sebagian adalah situs obrolan acak yang cukup baik; sebagian lain adalah tiruan yang dibuat terutama untuk menampilkan iklan. Karena itu ada baiknya Anda memeriksa dengan teliti sebelum menghabiskan waktu di salah satunya.",
],
pop_h="Apa yang Membuat Omegle Populer?",
pop=[
("Tanpa daftar.", "Buka situs, tekan tombol, mulai mengobrol."),
("Keacakan.", "Anda tidak pernah tahu siapa yang akan Anda temui berikutnya."),
("Akses gratis.", "Tanpa langganan, tanpa koin, tanpa paywall."),
],
pop_end="Alternatif yang baik harus menjaga semangat itu sambil memperbaiki kelemahan Omegle: moderasi yang lemah dan keamanan yang buruk.",
five_h="5 Hal yang Perlu Dicek pada Alternatif Omegle Mana Pun",
c_h=[
"1. Apakah benar-benar gratis dan tanpa pendaftaran?",
"2. Bagaimana situs menangani keamanan?",
"3. Apakah berfungsi di ponsel?",
"4. Bisakah Anda memilih dengan siapa berbicara?",
"5. Apakah ada dukungan bahasa?",
],
c_p=[
[
"Banyak situs mengaku «gratis» tetapi mengunci fitur dasar, seperti memilih negara, di balik paket berbayar. Yang lain membiarkan Anda mencoba semenit lalu meminta Anda mendaftar. Layar pendaftaran adalah salah satu alasan paling umum orang meninggalkan situs obrolan acak, karena intinya adalah mulai mengobrol dengan cepat.",
"Sebelum menghabiskan waktu, periksa tiga hal: apakah Anda bisa mengobrol sebagai tamu, apakah filternya gratis, dan apakah situs mendorong Anda ke paket berbayar?",
],
[
"Cari tombol laporan, pemblokiran sementara otomatis untuk pelanggar berulang, dan aturan 18+ yang jelas. Situs tanpa moderasi adalah situs yang sebaiknya Anda tinggalkan. Moderasi yang baik tidak membuat situs benar-benar aman, tetapi menunjukkan bahwa pengelolanya peduli pada pengalaman pengguna.",
"Periksa juga apakah situs memberi tahu apa yang terjadi pada percakapan Anda. Situs yang tidak menyimpan obrolan Anda lebih baik untuk privasi daripada situs yang menyimpannya.",
],
[
"Sekarang kebanyakan orang mengobrol dari ponsel. Anda tidak perlu mengunduh aplikasi hanya untuk mencoba sebuah situs. Versi web yang baik berfungsi langsung di browser ponsel, jadi Anda bisa mulai dalam hitungan detik dan menutup tab saat selesai. Aplikasi boleh saja bagi yang menyukainya, tetapi harus opsional, bukan wajib.",
],
[
"Keacakan murni menyenangkan beberapa menit, lalu melelahkan. Anda terus melewati, melewati, melewati, dan tidak pernah menemukan obrolan yang bagus. Dua fitur mengatasinya:",
],
[
"Jika Anda ingin melatih bahasa Inggris, Spanyol, atau Arab, atau sekadar bertemu orang dari negara lain, terjemahan bawaan membuat percakapan jauh lebih mudah. Tanpa terjemahan, obrolan dengan orang yang berbicara bahasa lain biasanya berakhir setelah «halo». Dengan terjemahan, Anda bisa mengobrol sungguhan.",
],
],
c4_li=[
("Pilihan negara.", "Jika Anda ingin berbicara dengan seseorang dari Turki, Brasil, atau Jepang, Anda seharusnya bisa memilihnya. Di banyak situs ini adalah fitur berbayar, jadi periksa dulu sebelum mengandalkannya."),
("Pencocokan berdasarkan minat.", "Berbicara dengan orang yang menyukai permainan, musik, atau topik yang sama dengan Anda jelas lebih baik daripada memulai dari nol."),
],
types_h="Jenis-Jenis Alternatif Omegle yang Umum",
types_intro="Tidak semua alternatif bekerja dengan cara yang sama. Berikut jenis yang umum Anda temui, beserta kelebihan dan kekurangannya:",
types=[
("Situs yang mewajibkan akun.", "Anda harus mendaftar sebelum mengobrol. Terlihat lebih tertata, tetapi menghilangkan kesan instan dan anonim yang disukai orang dari Omegle."),
("Situs yang mengutamakan aplikasi.", "Mereka mendorong Anda mengunduh aplikasi. Bagi sebagian orang tidak masalah, tetapi menjadi hambatan jika Anda hanya ingin mencoba dengan cepat."),
("Situs freemium.", "Obrolan dasar gratis, tetapi fitur berguna seperti filter negara atau terjemahan berbayar."),
("Situs browser yang sepenuhnya gratis.", "Anda membuka halaman dan langsung mulai. Ini yang paling dekat dengan ide aslinya."),
],
types_end="Tidak ada jenis yang otomatis baik atau buruk. Pilihan yang tepat bergantung pada apa yang Anda inginkan. Namun jika Anda ingin pengalaman yang paling mirip dengan aslinya, situs browser yang sepenuhnya gratis dengan moderasi yang masuk akal adalah pilihan terbaik.",
fits_h="Di Mana Posisi Randly",
fits_intro="{R} adalah obrolan video dan teks acak gratis yang dibangun di sekitar lima poin tadi:",
fits=[
"Tanpa pendaftaran",
"Video chat dan obrolan teks",
"Pilihan negara, atau mode global yang mencocokkan Anda dengan siapa saja",
"Pencocokan berdasarkan minat",
"Terjemahan pesan langsung opsional dalam 12 bahasa",
"Tombol laporan dengan pemblokiran sementara otomatis untuk pelanggar berulang",
"Berfungsi di browser ponsel",
"Khusus 18+, dengan layar konfirmasi sebelum masuk",
"Tanpa paket berbayar: semua fitur gratis",
],
fits_p="Kami membuat Randly karena layar pendaftaran itu menyebalkan. Anda membuka situs, mengonfirmasi bahwa usia Anda 18 tahun atau lebih, lalu langsung masuk. Tidak ada akun, tidak ada aplikasi untuk diunduh, dan tidak ada paket berbayar yang menyembunyikan fitur berguna. Pilihan negara dan terjemahan langsung, yang dikenai biaya di banyak situs lain, gratis di sini.",
how_h="Cara Memulai Obrolan di Randly",
how=[
"Buka Randly di browser Anda, di ponsel atau komputer.",
"Konfirmasi bahwa usia Anda 18 tahun atau lebih.",
"Pilih video chat atau obrolan teks.",
"Pilih negara, atau tetap di mode global untuk bertemu siapa saja.",
"Tambahkan minat Anda jika ingin dicocokkan dengan orang yang memiliki minat sama.",
"Tekan mulai. Jika tidak cocok dengan lawan bicara, lanjut ke orang berikutnya.",
],
how_end="Itulah seluruh prosesnya. Tanpa email, tanpa kata sandi, dan tanpa menunggu.",
tr_h="Cara yang Baik Menggunakan Terjemahan",
tr="Misalkan Anda dari Indonesia dan ingin berbicara dengan seseorang dari Turki. Di Randly Anda bisa memilih Turki sebagai negara, dan dengan terjemahan langsung aktif Anda membaca percakapan dalam bahasa Indonesia sementara lawan bicara membacanya dalam bahasa Turki. Terjemahan mencakup 12 bahasa, jadi bisa dipakai untuk banyak kombinasi lain. Ini juga cara yang sangat alami untuk melatih bahasa, karena Anda berbicara dengan orang sungguhan tentang hal-hal nyata.",
safe_h="Tips Keamanan untuk Situs Obrolan Acak Mana Pun",
safe_intro="Obrolan acak itu menyenangkan, tetapi juga tempat Anda bertemu orang asing, jadi beberapa kebiasaan sangat membantu:",
safe=[
"Jangan pernah membagikan nama lengkap, alamat, sekolah, tempat kerja, atau nomor telepon Anda.",
"Jangan klik tautan dari orang asing.",
"Lewati atau laporkan siapa pun yang membuat Anda tidak nyaman. Anda tidak wajib melanjutkan obrolan.",
"Ingat bahwa siapa pun bisa merekam layar. Bersikaplah sesuai itu.",
"Jangan kirim uang atau hadiah kepada orang yang Anda temui di obrolan acak, sebagus apa pun ceritanya.",
"Jika percakapan mengarah ke ajakan bergabung di aplikasi atau situs lain, waspadalah.",
"Jika usia Anda di bawah 18 tahun, jangan gunakan situs seperti ini.",
],
mist_h="Kesalahan Umum di Situs Obrolan Acak",
mist=[
("Menyerah setelah dua atau tiga kali lewati.", "Tidak semua pencocokan akan bagus. Beri beberapa kesempatan dan gunakan filter negara serta minat untuk meningkatkan peluang."),
("Memulai setiap obrolan hanya dengan «hai».", "Pertanyaan singkat seperti «lagi main game apa belakangan ini?» mendapat balasan yang jauh lebih baik."),
("Mengabaikan tombol laporan.", "Jika seseorang melanggar aturan, melaporkannya membantu situs menjadi lebih baik untuk semua orang."),
("Membagikan terlalu banyak terlalu cepat.", "Pelan-pelan saja dan jaga data pribadi tetap rahasia, bahkan dengan orang yang tampak ramah."),
],
faq_h="Pertanyaan yang Sering Diajukan",
faq=[
("Apakah Omegle akan kembali secara resmi?", "Omegle tutup permanen pada 2023. Situs mana pun yang memakai namanya hari ini bukan layanan aslinya."),
("Apakah alternatif Omegle aman?", "Tergantung situsnya. Pilih yang punya fitur laporan, pemblokiran, dan aturan yang jelas, dan selalu lindungi informasi pribadi Anda."),
("Apa alternatif Omegle terbaik tanpa pendaftaran?", "Randly memungkinkan Anda memulai video chat atau obrolan teks dengan satu klik dan tanpa akun."),
("Bisakah saya memakai obrolan acak di ponsel?", "Bisa. Randly berfungsi langsung di browser ponsel, tanpa mengunduh aplikasi."),
("Apakah memilih negara itu gratis?", "Di Randly, ya. Pilihan negara dan terjemahan langsung sama-sama gratis. Banyak situs lain memungut biaya untuk keduanya, jadi periksa dulu sebelum mengandalkan sebuah filter."),
("Bisakah saya melatih bahasa di situs obrolan acak?", "Bisa. Memilih negara dan memakai terjemahan langsung adalah cara yang bagus untuk berbicara dengan penutur asli dan berlatih secara alami."),
("Siapa yang boleh menggunakan Randly?", "Hanya orang berusia 18 tahun ke atas. Layar pertama meminta Anda mengonfirmasi usia sebelum masuk."),
],
fin_h="Kesimpulan",
fin1="Alternatif Omegle terbaik adalah yang menjaga kesan sederhana dan spontan dari aslinya sambil menganggap serius keamanan. Carilah situs yang gratis, tidak perlu mendaftar, berfungsi di ponsel, memungkinkan Anda memilih lawan bicara, dan memiliki moderasi yang nyata.",
fin2="Coba {R} dan bandingkan sendiri. Anda juga bisa membaca panduan kami tentang {G}.",
guide_text="video chat acak gratis tanpa daftar",
cta="Mulai mengobrol di Randly",
img_alt="Layar utama Randly dengan video chat, obrolan teks, dan minat",
blog_title="Alternatif Omegle Terbaik 2026: Apa yang Perlu Dicek Sebelum Mengobrol",
)

LANGS['zh'] = dict(
sep="",
title="2026年最佳Omegle替代品（免费、无需注册）",
desc="Omegle已关闭，但随机视频聊天依然存在。对比2026年最佳Omegle替代品：安全性、功能、手机支持，以及选择时该看什么。",
h1="2026年最佳Omegle替代品：聊天前该看什么",
back="← 返回博客",
updated="最后更新：2026年10月",
intro=[
"Omegle于2023年11月关闭，数百万人一下子失去了他们最喜欢的在线结识陌生人的方式。从那以后，出现了几十个“Omegle替代品”，说实话，它们并不都一样。有些满是广告，有些完全没有审核，还有些要求你先创建账号才能打招呼。",
"本指南将说明2026年选择随机聊天网站时真正重要的是什么、应该避开什么，以及{R}的定位。无论你想练习一门语言、结交来自其他国家的新朋友，还是只想消磨十分钟，读完后你都会清楚该看什么。",
],
what_h="Omegle发生了什么？",
what=[
"多年来，Omegle一直是在网上结识随机陌生人的首选之地。打开网站，按下一个按钮，几秒钟内你就在用文字或视频和陌生人交谈。它很简单，而正是这种简单让它变得巨大。",
"该网站于2023年11月永久关闭。此后，许多网站借用了它的名字或模仿了它的外观。需要明白的是，它们都不是原版Omegle。有些是还不错的随机聊天网站，另一些则是主要为了展示广告而做的仿冒品。所以在花时间之前，仔细看清楚是值得的。",
],
pop_h="Omegle最初为什么受欢迎？",
pop=[
("无需注册。", "打开网站，按下按钮，开始聊天。"),
("随机性。", "你永远不知道下一个会遇到谁。"),
("免费使用。", "没有订阅，没有代币，没有付费墙。"),
],
pop_end="好的替代品应该保留这种精神，同时弥补Omegle的不足：审核薄弱和安全性差。",
five_h="检查任何Omegle替代品的5件事",
c_h=[
"1. 它真的免费且无需注册吗？",
"2. 它如何处理安全问题？",
"3. 能在手机上使用吗？",
"4. 你能选择和谁聊天吗？",
"5. 有语言支持吗？",
],
c_p=[
[
"许多网站声称“免费”，却把选择国家等基本功能锁在付费套餐后面。还有些网站让你试用一分钟，然后要求注册。注册页面是人们离开随机聊天网站最常见的原因之一，因为重点就是尽快开始聊天。",
"在投入时间之前，先检查三件事：能否以访客身份聊天，筛选功能是否免费，网站是否在引导你购买付费套餐？",
],
[
"留意举报按钮、对屡次违规者的自动临时封禁，以及明确的18岁以上规定。没有审核的网站，就该离开。良好的审核并不能让网站绝对安全，但它说明运营者在意使用体验。",
"也看看网站是否说明了你的对话会如何处理。不保存聊天记录的网站，比保存记录的网站对你的隐私更好。",
],
[
"如今大多数人用手机聊天。你不该为了试一个网站就必须下载应用。好的网页版可以直接在手机浏览器中使用，几秒钟就能开始，用完关掉标签页即可。喜欢应用的人用应用也没问题，但应用应该是可选的，而不是必须的。",
],
[
"纯粹的随机性玩几分钟很有趣，然后就会让人疲惫。你不停地跳过、跳过、跳过，却始终找不到一场好的对话。有两项功能可以解决这个问题：",
],
[
"如果你想练习英语、西班牙语或阿拉伯语，或者只是结识来自其他国家的人，内置翻译会让交流容易得多。没有翻译，和说另一种语言的人聊天通常在“你好”之后就结束了。有了翻译，你就能进行真正的对话。",
],
],
c4_li=[
("选择国家。", "如果你想和土耳其、巴西或日本的人聊天，就应该能够直接选择。在很多网站上这是付费功能，所以依赖之前先确认一下。"),
("按兴趣匹配。", "和喜欢相同游戏、音乐或话题的人聊天，就是比从零开始要好。"),
],
types_h="常见的Omegle替代品类型",
types_intro="并非所有替代品的运作方式都一样。下面是你会遇到的常见类型，以及各自的利弊：",
types=[
("必须有账号的网站。", "聊天前必须注册。它们可能显得更有条理，但会失去人们喜爱Omegle的那种即时、匿名的感觉。"),
("应用优先的网站。", "它们催你下载应用。对一些人来说没问题，但如果你只想快速试一试，这就是一道门槛。"),
("免费增值网站。", "基础聊天免费，但国家筛选或翻译等实用功能要付费。"),
("完全免费的浏览器网站。", "打开页面就能开始。它们最接近最初的理念。"),
],
types_end="这些类型本身并无好坏之分，适合哪种取决于你想要什么。但如果你想要最接近原版的体验，审核合理、完全免费的浏览器网站是最佳选择。",
fits_h="Randly的定位",
fits_intro="{R}是一个免费的随机视频和文字聊天网站，围绕上述五点构建：",
fits=[
"无需注册",
"视频聊天和文字聊天",
"可选择国家，或使用全球模式与任何人匹配",
"按兴趣匹配",
"可选的12种语言实时消息翻译",
"举报按钮，对屡次违规者自动临时封禁",
"可在手机浏览器中使用",
"仅限18岁以上，进入前有确认页面",
"没有付费套餐：所有功能都免费",
],
fits_p="我们做Randly，是因为注册页面太烦人。你打开网站，确认自己年满18岁，就可以进入。没有账号，不需要下载应用，也没有付费套餐把实用功能藏起来。选择国家和实时翻译，很多其他网站要收费，在这里是免费的。",
how_h="如何在Randly上开始聊天",
how=[
"在浏览器中打开Randly，手机或电脑都可以。",
"确认你年满18岁。",
"选择视频聊天或文字聊天。",
"选择一个国家，或保持全球模式以遇见任何人。",
"如果想匹配有相同兴趣的人，就添加你的兴趣。",
"点击开始。如果不喜欢这次匹配，就跳到下一位。",
],
how_end="整个过程就是这样。不用邮箱，不用密码，也不用等待。",
tr_h="使用翻译的一个好方法",
tr="假设你来自中国，想和一位西班牙的人聊天。在Randly上，你可以选择西班牙作为国家，并开启实时翻译，这样你用中文阅读对话，对方则用西班牙语阅读。翻译涵盖12种语言，所以也适用于许多其他组合。这也是一种非常自然的语言练习方式，因为你是在和真实的人谈论真实的事情。",
safe_h="任何随机聊天网站的安全提示",
safe_intro="随机聊天很有趣，但它也是你结识陌生人的地方，所以养成一些习惯会很有帮助：",
safe=[
"永远不要透露你的全名、住址、学校、工作单位或电话号码。",
"不要点击陌生人发来的链接。",
"跳过或举报任何让你不舒服的人。你没有义务继续任何一场聊天。",
"请记住，任何人都可以录屏。请据此行事。",
"不要给在随机聊天中认识的人汇款或送礼物，无论他的故事听起来多么动人。",
"如果对话引导你加入另一个应用或网站，请保持警惕。",
"如果你未满18岁，请不要使用这类网站。",
],
mist_h="随机聊天网站上的常见错误",
mist=[
("跳过两三次就放弃。", "不是每次匹配都会很好。多给自己几次机会，并使用国家和兴趣筛选来提高成功率。"),
("每次聊天只说“嗨”。", "像“你最近在玩什么游戏？”这样的简短问题，能得到好得多的回应。"),
("忽略举报按钮。", "如果有人违反规则，举报他们有助于让网站对所有人都更好。"),
("过早透露太多。", "慢慢来，即使对看起来友好的人，也要保护好个人信息。"),
],
faq_h="常见问题",
faq=[
("Omegle会正式回归吗？", "Omegle已于2023年永久关闭。今天任何使用这个名字的网站都不是原来的服务。"),
("Omegle替代品安全吗？", "这取决于网站。选择有举报、封禁和明确规则的网站，并始终保护好你的个人信息。"),
("最好的无需注册的Omegle替代品是什么？", "Randly让你一键开始视频或文字聊天，无需账号。"),
("我可以在手机上使用随机聊天吗？", "可以。Randly直接在手机浏览器中运行，无需下载应用。"),
("选择国家是免费的吗？", "在Randly上是的。选择国家和实时翻译都是免费的。很多其他网站对此收费，所以依赖筛选功能之前请先确认。"),
("我可以在随机聊天网站上练习语言吗？", "可以。选择一个国家并使用实时翻译，是与母语者交流并自然练习的好方法。"),
("谁可以使用Randly？", "仅限年满18岁的人。第一个页面会要求你在进入前确认年龄。"),
],
fin_h="最后的话",
fin1="最好的Omegle替代品，是保留原版简单、自然的感觉，同时认真对待安全的那一个。请寻找免费、无需注册、能在手机上使用、让你选择聊天对象，并且有真正审核的网站。",
fin2="试试{R}，亲自比较一下。你也可以阅读我们关于{G}的指南。",
guide_text="免费、无需注册的随机视频聊天",
cta="立即在Randly上开始聊天",
img_alt="Randly首页：视频聊天、文字聊天和兴趣选择",
blog_title="2026年最佳Omegle替代品：聊天前该看什么",
)


# ---------------- program ----------------
def webp_size(path):
    """width, height of a .webp file (VP8 / VP8L / VP8X) or None"""
    try:
        d = open(path, "rb").read(64)
        if d[:4] != b"RIFF" or d[8:12] != b"WEBP": return None
        t = d[12:16]
        if t == b"VP8 ":  return (int.from_bytes(d[26:28], "little") & 0x3FFF, int.from_bytes(d[28:30], "little") & 0x3FFF)
        if t == b"VP8L":
            b = int.from_bytes(d[21:25], "little"); return ((b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1)
        if t == b"VP8X":  return (int.from_bytes(d[24:27], "little") + 1, int.from_bytes(d[27:30], "little") + 1)
    except Exception:
        pass
    return None

def read_text(path):
    raw = open(path, "rb").read()
    return raw.decode("utf-8")

def write_text(path, text):
    open(path, "wb").write(text.encode("utf-8"))

def main():
    ap = argparse.ArgumentParser(description="Install the new Omegle-alternatives article in 9 more languages.")
    ap.add_argument("--dir", default=".", help="folder with the site files (default: current folder)")
    ap.add_argument("--apply", action="store_true", help="write the changes (without it: dry-run)")
    ap.add_argument("--only", default="", help="comma-separated language codes, e.g. fr,de")
    a = ap.parse_args()
    codes = [c for c in LANGS if not a.only or c in a.only.split(",")]
    print(("APPLY" if a.apply else "DRY-RUN") + " in " + os.path.abspath(a.dir))
    errors = changed = 0
    for code in codes:
        L = LANGS[code]
        post = os.path.join(a.dir, f"post-omegle-alternative-{code}.html")
        blog = os.path.join(a.dir, f"blog-{code}.html")
        img = None
        for fn_ in (f"randly-home-screen-{code}.webp", "randly-home-screen.webp"):
            sz = webp_size(os.path.join(a.dir, fn_))
            if sz: img = (fn_, sz[0], sz[1]); break
        if not img: print(f"[{code}] NOTE: no picture found (randly-home-screen.webp) - article will be written without it (run again after adding it)")
        for path, fn in ((post, lambda t: apply_post(t, code, L, img)), (blog, lambda t: apply_blog(t, code, L))):
            name = os.path.basename(path)
            if not os.path.exists(path):
                print(f"[{code}] ERROR {name}: file not found"); errors += 1; continue
            old = read_text(path)
            new, probs = fn(old)
            if probs:
                print(f"[{code}] ERROR {name}: " + "; ".join(probs) + " - file left untouched"); errors += 1; continue
            if new == old:
                print(f"[{code}] ok     {name}: already up to date"); continue
            changed += 1
            print(f"[{code}] CHANGE {name}" + ("" if a.apply else "  (dry-run, not written)"))
            if a.apply: write_text(path, new)
    print(f"\n{changed} file(s) {'written' if a.apply else 'would change'}, {errors} problem(s).")
    if errors: print("Fix the problems above (or send me the file named in the ERROR line) before relying on this run.")
    if not a.apply and changed: print("Looks right? Run again with --apply")

if __name__ == "__main__":
    main()
