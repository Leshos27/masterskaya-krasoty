#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка сайта «Мастерская красоты».

    python3 build.py

Берёт данные из content/ (контакты, услуги и цены, вопросы, статьи)
и шаблоны из src/, записывает готовый статический сайт в public/.
Зависимостей нет — нужен только Python 3.8+.
"""
import datetime as dt
import hashlib
import html
import json
import math
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
CONTENT = ROOT / "content"
OUT = ROOT / "public"

MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
CTA = {
    "hair": "Запишитесь на стрижку к нашим стилистам",
    "manicure": "Запишитесь на маникюр",
    "pedicure": "Запишитесь на педикюр",
    "massage": "Запишитесь на массаж",
    "hirudo": "Запишитесь на консультацию гирудотерапевта",
    "hijama": "Запишитесь на хиджаму",
    "cosmetology": "Запишитесь к косметологу",
}
MARQUEE = ["Стрижки", "Окрашивание", "Маникюр", "Педикюр", "Массаж", "Гирудотерапия", "Хиджама", "Косметология", "Уход за лицом", "Укладки"]


# ---------------------------------------------------------------- helpers
def esc(s):
    return html.escape(str(s), quote=True)


def price(n):
    return f"{n:,}".replace(",", " ")


def duration(m):
    h, mm = divmod(int(m), 60)
    if h and mm:
        return f"{h} ч {mm} мин"
    return f"{h} ч" if h else f"{mm} мин"


def ld(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def date_human(d):
    return f"{d.day} {MONTHS_GEN[d.month - 1]} {d.year}"


def minutes_word(n):
    if n % 10 == 1 and n % 100 != 11:
        return "минута"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return "минуты"
    return "минут"


# ---------------------------------------------------------------- markdown (минимальный)
def inline(s):
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<em>\1</em>", s)
    return s


def markdown(text):
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l.rstrip() for l in block.strip().splitlines() if l.strip()]
        while lines:
            first = lines[0]
            if first.startswith("### "):
                out.append(f"<h3>{inline(first[4:])}</h3>")
                lines = lines[1:]
            elif first.startswith("## "):
                out.append(f"<h2>{inline(first[3:])}</h2>")
                lines = lines[1:]
            elif all(l.startswith("- ") for l in lines):
                out.append("<ul>" + "".join(f"<li>{inline(l[2:])}</li>" for l in lines) + "</ul>")
                lines = []
            elif all(re.match(r"\d+\.\s", l) for l in lines):
                items = [inline(re.sub(r"^\d+\.\s", "", l)) for l in lines]
                out.append("<ol>" + "".join("<li>" + it + "</li>" for it in items) + "</ol>")
                lines = []
            elif all(l.startswith(">") for l in lines):
                body = " ".join(l.lstrip("> ").strip() for l in lines)
                out.append(f"<blockquote><p>{inline(body)}</p></blockquote>")
                lines = []
            else:
                out.append(f"<p>{inline(' '.join(lines))}</p>")
                lines = []
    return "\n".join(out)


# ---------------------------------------------------------------- data
def load_article(path):
    text = path.read_text("utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"Статья {path.name}: нет блока --- метаданных ---")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    for key in ("title", "slug", "date", "category", "category_id", "description", "excerpt"):
        if not meta.get(key):
            sys.exit(f"Статья {path.name}: не заполнено поле «{key}»")
    meta["date"] = dt.date.fromisoformat(meta["date"])
    meta["md"] = m.group(2).strip()
    meta["html"] = markdown(meta["md"])
    words = len(re.findall(r"\w+", meta["md"]))
    meta["minutes"] = max(2, math.ceil(words / 150))
    meta.setdefault("keywords", "")
    return meta


SITE = json.loads((CONTENT / "site.json").read_text("utf-8"))
CATS = json.loads((CONTENT / "services.json").read_text("utf-8"))["categories"]
FAQ = json.loads((CONTENT / "faq.json").read_text("utf-8"))
ARTICLES = sorted((load_article(p) for p in (CONTENT / "articles").glob("*.md")), key=lambda a: a["date"], reverse=True)
DOMAIN = SITE["domain"].rstrip("/")
TODAY = dt.date.today()


# ---------------------------------------------------------------- templating
def render(tpl, ctx):
    def include(m):
        name, _, arg = m.group(1).partition(":")
        part = (SRC / "partials" / f"{name}.html").read_text("utf-8")
        c = dict(ctx)
        if arg:
            c["form_id"] = arg
        return render(part, c)

    tpl = re.sub(r"\{\{>\s*([\w:-]+)\s*\}\}", include, tpl)

    def var(m):
        key = m.group(1)
        if key not in ctx:
            raise KeyError(f"В шаблоне есть {{{{{key}}}}}, но значение не задано")
        return str(ctx[key])

    return re.sub(r"\{\{\s*(\w+)\s*\}\}", var, tpl)


def base_ctx(R, is_home=False):
    c = {k: esc(v) for k, v in SITE.items() if isinstance(v, str)}
    c.update(
        R=R,
        home="" if is_home else f"{R}index.html",
        home_link="#top" if is_home else f"{R}index.html",
        domain=DOMAIN,
        year=TODAY.year,
        version=VERSION,
        map_query=urllib.parse.quote(f"{SITE['city']}, улица Октября, 44"),
        robots="index, follow",
        og_type="website",
        nav_journal="",
    )
    return c


# ---------------------------------------------------------------- fragments
def hero_rays():
    out = []
    for i in range(120):
        a = math.radians(i * 3)
        long_ = i % 5 == 0
        r1, r2 = 328, (394 if long_ else (370 if i % 2 == 0 else 356))
        x1, y1 = 500 + r1 * math.cos(a), 500 + r1 * math.sin(a)
        x2, y2 = 500 + r2 * math.cos(a), 500 + r2 * math.sin(a)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke-width="{0.9 if long_ else 0.45}"/>')
    return "".join(out)


def arch_rays():
    cx, cy = 200, 560
    out = []
    for i in range(31):
        a = math.radians(180 + i * 6)
        out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx + 760 * math.cos(a):.1f}" y2="{cy + 760 * math.sin(a):.1f}" stroke-width=".5" opacity="{.22 if i % 2 else .45}"/>')
    for r in (110, 180, 260, 350, 450):
        out.append(f'<path d="M{cx - r} {cy}A{r} {r} 0 0 1 {cx + r} {cy}" stroke-width=".7" opacity=".45"/>')
    return "".join(out)


def marquee():
    group = "".join(
        f'<span class="marquee__item">{esc(w)}</span><svg class="marquee__star"><use href="#i-spark"/></svg>' for w in MARQUEE
    )
    return f'<div class="marquee__group">{group}</div><div class="marquee__group">{group}</div>'


def services_cards():
    out = []
    for i, c in enumerate(CATS):
        wide = " service-card--wide" if c["id"] in ("hair",) else ""
        top = "".join(f'<li>{esc(s["name"])}<b>от {price(s["price"])} ₽</b></li>' for s in c["services"][:3])
        tag = (
            '<span class="service-card__tag">Велнес</span>'
            if c.get("medical")
            else f'<a class="service-card__tag" href="#price-{c["id"]}">Все цены</a>'
        )
        out.append(f"""
        <article class="service-card{wide}" data-reveal style="--i:{i}" data-spotlight>
          <div class="service-card__top">
            <svg class="service-card__icon draw" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-{c['icon']}"/></svg>
            <span class="service-card__num">{i + 1:02d}</span>
          </div>
          <div class="service-card__body">
            <h3 class="service-card__title">{esc(c['title'])}</h3>
            <p class="service-card__text">{esc(c['lead'])}</p>
            <ul class="service-card__prices">{top}</ul>
          </div>
          <div class="service-card__foot">
            <button class="link-arrow" type="button" data-book="{c['id']}">Записаться<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>
            {tag}
          </div>
        </article>""")
    return "".join(out)


def price_tabs():
    return "".join(
        f'<button class="cal-tab{" is-active" if i == 0 else ""}" type="button" role="tab" aria-selected="{"true" if i == 0 else "false"}" aria-controls="price-{c["id"]}" data-flip-to="{i}">'
        f'<span class="cal-tab__num">{c["roman"]}</span><span class="cal-tab__name">{esc(c["title"])}</span>'
        f'<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>'
        for i, c in enumerate(CATS)
    )


def price_pages():
    total = CATS[-1]["roman"]
    out = []
    for c in CATS:
        rows = "".join(
            f'<li class="pc-row"><span class="pc-row__name">{esc(s["name"])}<small>{duration(s["duration"])}</small></span>'
            f'<span class="pc-row__dots"></span><span class="pc-row__price">{"<small>от</small>" if s.get("from") else ""}{price(s["price"])}&nbsp;₽</span></li>'
            for s in c["services"]
        )
        med = '<p class="pc-medical">Имеются противопоказания. Необходима консультация специалиста</p>' if c.get("medical") else ""
        out.append(f"""
              <section class="flipcal__page" id="price-{c['id']}" data-cat="{c['id']}" role="tabpanel" aria-label="{esc(c['title'])}">
                <div class="flipcal__face">
                  <div class="pc-head"><span>Раздел {c['roman']}</span><i>Мастерская красоты</i><span>{c['roman']} / {total}</span></div>
                  <div class="pc-title-row"><svg class="pc-icon" fill="none" stroke="currentColor" aria-hidden="true"><use href="#i-{c['icon']}"/></svg><h3 class="pc-title">{esc(c['title'])}</h3></div>
                  <p class="pc-lead">{esc(c['lead'])}</p>
                  <ul class="pc-list">{rows}</ul>
                  <div class="pc-foot"><p class="pc-note">Цены ориентировочные: точную стоимость мастер назовёт после консультации.</p><button class="btn btn--ink btn--sm" type="button" data-book="{c['id']}">Записаться</button></div>
                  {med}
                </div>
              </section>""")
    return "".join(out)


def journal_pages(prefix):
    out = []
    n = len(ARTICLES)
    for i, a in enumerate(ARTICLES):
        d = a["date"]
        sunday = " is-sunday" if d.weekday() == 6 else ""
        out.append(f"""
              <article class="flipcal__page" aria-label="{esc(a['title'])}">
                <div class="flipcal__face">
                  <div class="jc-head"><span>{MONTHS_NOM[d.month - 1]} · {d.year}</span><span>№ {n - i:02d}</span></div>
                  <div class="jc-day{sunday}">{d.day}</div>
                  <div class="jc-weekday">{WEEKDAYS[d.weekday()]}</div>
                  <div class="jc-rule"><svg class="icon icon--fill" aria-hidden="true"><use href="#i-diamond"/></svg></div>
                  <div class="jc-cat">{esc(a['category'])}</div>
                  <h3 class="jc-title">{esc(a['title'])}</h3>
                  <p class="jc-excerpt">{esc(a['excerpt'])}</p>
                  <div class="jc-foot"><a class="jc-link" href="{prefix}{a['slug']}.html">Читать статью<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a></div>
                  <div class="jc-folio"><span>Отрывной календарь красоты</span><span>Лист {i + 1} из {n}</span></div>
                </div>
              </article>""")
    return "".join(out)


def journal_tabs():
    return "".join(
        f'<button class="cal-tab{" is-active" if i == 0 else ""}" type="button" role="tab" aria-selected="{"true" if i == 0 else "false"}" data-flip-to="{i}">'
        f'<span class="cal-tab__num">{a["date"].day:02d}.{a["date"].month:02d}</span><span class="cal-tab__name">{esc(a["category"])}</span>'
        f'<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>'
        for i, a in enumerate(ARTICLES)
    )


def journal_list(limit=4):
    return "".join(
        f'<a href="articles/{a["slug"]}.html"><time datetime="{a["date"].isoformat()}">{a["date"].day}<small>{MONTHS_SHORT[a["date"].month - 1]}</small></time>'
        f'<div><span>{esc(a["category"])}</span><h3>{esc(a["title"])}</h3></div></a>'
        for a in ARTICLES[:limit]
    )


def cards(items, prefix):
    return "".join(
        f'<a class="a-card" href="{prefix}{a["slug"]}.html" data-reveal style="--i:{i % 3}">'
        f'<div class="a-card__date"><b>{a["date"].day}</b><span>{MONTHS_GEN[a["date"].month - 1]}<br>{a["date"].year}</span></div>'
        f'<div class="a-card__cat">{esc(a["category"])}</div><h3>{esc(a["title"])}</h3><p>{esc(a["excerpt"])}</p>'
        f'<span class="link-arrow">Читать<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span></a>'
        for i, a in enumerate(items)
    )


def faq_items():
    return "".join(
        f'<details{" open" if i == 0 else ""}><summary>{esc(f["q"])}<span class="faq__plus" aria-hidden="true"></span></summary>'
        f'<div class="faq__a"><p>{f["a"]}</p></div></details>'
        for i, f in enumerate(FAQ)
    )


# ---------------------------------------------------------------- JSON-LD
def salon_ld():
    address = {
        "@type": "PostalAddress",
        "streetAddress": SITE["street"],
        "addressLocality": SITE["city"],
        "addressRegion": SITE["region"],
        "addressCountry": "RU",
    }
    if SITE.get("postal_code"):
        address["postalCode"] = SITE["postal_code"]
    catalog = [
        {
            "@type": "OfferCatalog",
            "name": c["title"],
            "itemListElement": [
                {
                    "@type": "Offer",
                    "itemOffered": {"@type": "Service", "name": s["name"]},
                    "priceSpecification": {"@type": "PriceSpecification", "minPrice": s["price"], "priceCurrency": "RUB"},
                }
                for s in c["services"]
            ],
        }
        for c in CATS
    ]
    return {
        "@type": "BeautySalon",
        "@id": f"{DOMAIN}/#salon",
        "name": SITE["name"],
        "description": "Салон красоты в Реутове: стрижки, маникюр, педикюр, массаж, гирудотерапия, хиджама, косметология.",
        "url": f"{DOMAIN}/",
        "telephone": SITE["phone"],
        "email": SITE.get("email"),
        "image": f"{DOMAIN}/assets/img/og-image.jpg",
        "logo": f"{DOMAIN}/assets/img/apple-touch-icon.png",
        "priceRange": "₽₽",
        "currenciesAccepted": "RUB",
        "address": address,
        "areaServed": [{"@type": "City", "name": n} for n in SITE.get("area_served", [])],
        "openingHoursSpecification": [
            {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                "opens": SITE["open"],
                "closes": SITE["close"],
            }
        ],
        "hasMap": f"https://yandex.ru/maps/?text={urllib.parse.quote(SITE['city'] + ', улица Октября, 44')}",
        "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Услуги салона", "itemListElement": catalog},
    }


def home_ld():
    faq = {
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", f["a"])}}
            for f in FAQ
        ],
    }
    website = {"@type": "WebSite", "@id": f"{DOMAIN}/#website", "url": f"{DOMAIN}/", "name": SITE["name"], "inLanguage": "ru-RU", "publisher": {"@id": f"{DOMAIN}/#salon"}}
    return ld({"@context": "https://schema.org", "@graph": [salon_ld(), website, faq]})


# ---------------------------------------------------------------- build
def write(rel, content):
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, "utf-8")
    print(f"  ✓ {rel}")


def write_data_js():
    site = {k: SITE[k] for k in ("name", "phone", "phone_href", "address_short", "street", "city", "hours", "open", "close", "booking_endpoint", "demo", "telegram", "whatsapp")}
    services = [
        {"id": c["id"], "title": c["title"], "short": c["short"], "medical": bool(c.get("medical")),
         "services": [{"name": s["name"], "price": s["price"], "from": bool(s.get("from")), "duration": s["duration"]} for s in c["services"]]}
        for c in CATS
    ]
    js = (
        "/* Сгенерировано build.py — не редактируйте вручную. Источник: content/site.json, content/services.json */\n"
        f"window.SITE = {json.dumps(site, ensure_ascii=False, indent=1)};\n"
        "window.SITE.root = new URL('../../', document.currentScript.src).href;\n"
        f"window.SERVICES = {json.dumps(services, ensure_ascii=False)};\n"
    )
    write("assets/js/data.js", js)


def compute_version():
    h = hashlib.md5()
    for p in ("assets/css/style.css", "assets/js/main.js", "assets/js/data.js"):
        f = OUT / p
        if f.exists():
            h.update(f.read_bytes())
    return h.hexdigest()[:8]


def build_pages():
    # главная
    ctx = base_ctx("", is_home=True)
    ctx.update(
        title="Салон красоты в Реутове — «Мастерская красоты» | ул. Октября, 44",
        og_title="«Мастерская красоты» — салон красоты в Реутове",
        description="Салон красоты «Мастерская красоты» в Реутове, ул. Октября, 44: стрижки и окрашивание, маникюр, педикюр, массаж, гирудотерапия, хиджама, косметология. Онлайн-запись.",
        canonical=f"{DOMAIN}/",
        jsonld=home_ld(),
        hero_rays=hero_rays(),
        arch_rays=arch_rays(),
        marquee=marquee(),
        services_cards=services_cards(),
        price_tabs=price_tabs(),
        price_pages=price_pages(),
        journal_pages=journal_pages("articles/"),
        journal_list=journal_list(),
        faq_items=faq_items(),
    )
    write("index.html", render((SRC / "pages" / "index.html").read_text("utf-8"), ctx))

    # политика
    ctx = base_ctx("")
    ctx.update(title="Политика обработки персональных данных — «Мастерская красоты»", og_title="Политика обработки персональных данных",
               description="Политика обработки персональных данных салона красоты «Мастерская красоты», Реутов.",
               canonical=f"{DOMAIN}/privacy.html")
    write("privacy.html", render((SRC / "pages" / "privacy.html").read_text("utf-8"), ctx))

    # 404 (абсолютные пути — страница может открываться по любому адресу)
    ctx = base_ctx("/")
    ctx.update(title="Страница не найдена — «Мастерская красоты»", og_title="Страница не найдена", robots="noindex, follow",
               description="Страница не найдена. Перейдите на главную страницу салона красоты «Мастерская красоты» в Реутове.",
               canonical=f"{DOMAIN}/404.html")
    write("404.html", render((SRC / "pages" / "404.html").read_text("utf-8"), ctx))

    # журнал
    ctx = base_ctx("../")
    ctx.update(
        title="Журнал красоты — статьи мастеров салона в Реутове | «Мастерская красоты»",
        og_title="Журнал красоты — «Мастерская красоты», Реутов",
        description="Статьи мастеров салона «Мастерская красоты» в Реутове: уход за волосами, маникюр и педикюр, массаж, гирудотерапия, хиджама и косметология.",
        canonical=f"{DOMAIN}/articles/",
        nav_journal=" is-active",
        journal_pages=journal_pages(""),
        journal_tabs=journal_tabs(),
        all_cards=cards(ARTICLES, ""),
        jsonld=ld({
            "@context": "https://schema.org",
            "@graph": [
                {"@type": "Blog", "name": "Журнал красоты", "url": f"{DOMAIN}/articles/", "inLanguage": "ru-RU", "publisher": {"@id": f"{DOMAIN}/#salon"},
                 "blogPost": [{"@type": "BlogPosting", "headline": a["title"], "url": f"{DOMAIN}/articles/{a['slug']}.html", "datePublished": a["date"].isoformat()} for a in ARTICLES]},
                {"@type": "BreadcrumbList", "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{DOMAIN}/"},
                    {"@type": "ListItem", "position": 2, "name": "Журнал", "item": f"{DOMAIN}/articles/"}]},
            ],
        }),
    )
    write("articles/index.html", render((SRC / "templates" / "articles-index.html").read_text("utf-8"), ctx))

    # статьи
    tpl = (SRC / "templates" / "article.html").read_text("utf-8")
    n = len(ARTICLES)
    for i, a in enumerate(ARTICLES):
        prev_a, next_a = ARTICLES[(i - 1) % n], ARTICLES[(i + 1) % n]
        related = [ARTICLES[(i + k) % n] for k in range(1, min(4, n))]
        url = f"{DOMAIN}/articles/{a['slug']}.html"
        head, sep, tail = a["title"].partition(":")
        title_html = f'{esc(head)}:<br><em class="gold-text">{esc(tail.strip())}</em>' if sep else esc(a["title"])
        ctx = base_ctx("../")
        ctx.update(
            title=f"{esc(a['title'])} — «Мастерская красоты», Реутов",
            og_title=esc(a["title"]),
            og_type="article",
            description=esc(a["description"]),
            canonical=url,
            nav_journal=" is-active",
            keywords=esc(a["keywords"]),
            category=esc(a["category"]),
            category_id=a["category_id"],
            title_html=title_html,
            date_iso=a["date"].isoformat(),
            date_human=date_human(a["date"]),
            date_short=f"{a['date'].day:02d}.{a['date'].month:02d}.{a['date'].year}",
            read_time=f"{a['minutes']} {minutes_word(a['minutes'])} чтения",
            body=a["html"],
            cta_title=CTA.get(a["category_id"], "Запишитесь онлайн"),
            prev_slug=prev_a["slug"], prev_title=esc(prev_a["title"]),
            next_slug=next_a["slug"], next_title=esc(next_a["title"]),
            related=cards(related, ""),
            jsonld=ld({
                "@context": "https://schema.org",
                "@graph": [
                    {"@type": "BlogPosting", "headline": a["title"], "description": a["description"], "datePublished": a["date"].isoformat(),
                     "dateModified": a["date"].isoformat(), "inLanguage": "ru-RU", "mainEntityOfPage": url, "url": url,
                     "image": f"{DOMAIN}/assets/img/og-image.jpg", "articleSection": a["category"], "keywords": a["keywords"],
                     "wordCount": len(re.findall(r"\w+", a["md"])),
                     "author": {"@type": "Organization", "name": SITE["name"], "url": f"{DOMAIN}/"},
                     "publisher": {"@type": "Organization", "name": SITE["name"], "logo": {"@type": "ImageObject", "url": f"{DOMAIN}/assets/img/apple-touch-icon.png"}},
                     "about": {"@id": f"{DOMAIN}/#salon"}},
                    {"@type": "BreadcrumbList", "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{DOMAIN}/"},
                        {"@type": "ListItem", "position": 2, "name": "Журнал", "item": f"{DOMAIN}/articles/"},
                        {"@type": "ListItem", "position": 3, "name": a["title"], "item": url}]},
                ],
            }),
        )
        write(f"articles/{a['slug']}.html", render(tpl, ctx))


def build_seo_files():
    latest = ARTICLES[0]["date"].isoformat() if ARTICLES else TODAY.isoformat()
    urls = [(f"{DOMAIN}/", TODAY.isoformat(), "1.0"), (f"{DOMAIN}/articles/", latest, "0.8")]
    urls += [(f"{DOMAIN}/articles/{a['slug']}.html", a["date"].isoformat(), "0.7") for a in ARTICLES]
    urls.append((f"{DOMAIN}/privacy.html", TODAY.isoformat(), "0.2"))
    body = "\n".join(f"  <url><loc>{u}</loc><lastmod>{d}</lastmod><priority>{p}</priority></url>" for u, d, p in urls)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n')

    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {DOMAIN}/sitemap.xml\n")

    lines = [
        f"# {SITE['name']} — салон красоты в Реутове",
        "",
        f"> Салон красоты и велнес-кабинет. Адрес: {SITE['region']}, г. {SITE['city']}, {SITE['street']}. Телефон: {SITE['phone']}. {SITE['hours']}. Онлайн-запись на сайте.",
        "",
        "## Услуги и ориентировочные цены",
    ]
    for c in CATS:
        lines.append(f"- {c['title']}: " + "; ".join(f"{s['name']} — от {s['price']} ₽" for s in c["services"]))
    lines += ["", "## Важно", "- Хиджама — баночное кровопускание; гирудотерапия — лечение медицинскими пиявками. Это разные процедуры.",
              "- Для гирудотерапии, хиджамы и массажа имеются противопоказания, необходима консультация специалиста.", "", "## Статьи"]
    lines += [f"- [{a['title']}]({DOMAIN}/articles/{a['slug']}.html): {a['excerpt']}" for a in ARTICLES]
    lines += ["", "## Страницы", f"- [Главная]({DOMAIN}/)", f"- [Журнал красоты]({DOMAIN}/articles/)"]
    write("llms.txt", "\n".join(lines) + "\n")


if __name__ == "__main__":
    print("Сборка «Мастерской красоты»…")
    write_data_js()
    VERSION = compute_version()
    build_pages()
    build_seo_files()
    print(f"Готово: {len(ARTICLES)} статей, {sum(len(c['services']) for c in CATS)} услуг. Сайт в папке public/")
