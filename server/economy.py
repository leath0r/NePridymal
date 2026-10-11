"""Экономика: цены коллекций, ценность конкретного подарка, кейсы."""
from settings import conf
import json
import math
import os
import random
from statistics import median

CATALOG = json.load(open(os.path.join(os.path.dirname(__file__), "catalog.json"), encoding="utf-8"))

# базовая цена коллекции в игровых ⭐ — по мотивам реального рынка, но это игра
BASE = {
    "Lucky Locket": 3500,
    "Plush Pepe": 600000, "Heart Locket": 300000, "Durov's Cap": 120000, "Precious Peach": 60000,
    "Intelligence Cup": 50000, "Algorithm Cup": 50000, "Mighty Arm": 30000,
    "Ion Gem": 15000, "Loot Bag": 15000, "Astral Shard": 15000, "Nail Bracelet": 15000,
    "Perfume Bottle": 12000, "Mini Oscar": 10000, "Magic Potion": 9000, "Gem Signet": 9000,
    "Westside Sign": 8000, "Low Rider": 6000, "Khabib's Papakha": 6000, "UFC Strike": 3000,
    "Swiss Watch": 5000, "Genie Lamp": 5000, "Scared Cat": 5000, "Bonded Ring": 5000,
    "Kissed Frog": 4500, "Sharp Tongue": 4000, "Electric Skull": 4000, "Signet Ring": 4000,
    "Durov's Glasses": 4000, "Vintage Cigar": 3500, "Heroic Helmet": 3500, "Toy Bear": 3000,
    "Rare Bird": 3000, "Neko Helmet": 3000, "Eternal Rose": 2500, "Diamond Ring": 2500,
    "Artisan Brick": 2500, "Mad Pumpkin": 2000, "Voodoo Doll": 1800, "Top Hat": 1800,
    "Love Potion": 1500, "Crystal Ball": 1500, "Flying Broom": 1500, "Sky Stilettos": 1500,
    "Cupid Charm": 1500, "Record Player": 1300, "Trapped Heart": 1200, "Skull Flower": 1200,
    "Sakura Flower": 1000, "Berry Box": 1000, "Love Candle": 1000, "Jelly Bunny": 900,
    "Evil Eye": 900, "Sleigh Bell": 900, "Valentine Box": 900, "Snoop Cigar": 900,
    "Hanging Star": 800, "Eternal Candle": 700, "Spy Agaric": 700, "Bunny Muffin": 700,
    "Snow Globe": 700, "Restless Jar": 700, "Hex Pot": 600, "Witch Hat": 600, "Hypno Lollipop": 600,
    "Star Notepad": 600, "Spiced Wine": 600, "Santa Hat": 600, "Input Key": 600, "Light Sword": 600,
    "Jester Hat": 500, "Ginger Cookie": 500, "Snow Mittens": 500, "Winter Wreath": 500,
    "Tama Gadget": 500, "Lush Bouquet": 500, "Joyful Bundle": 500, "Bow Tie": 500, "Swag Bag": 500,
    "Homemade Cake": 350, "Xmas Stocking": 400, "Candy Cane": 400, "Party Sparkler": 400,
    "Cookie Heart": 400, "Jingle Bells": 400, "Holiday Drink": 400, "Pet Snake": 400,
    "Snake Box": 400, "Big Year": 400, "Fresh Socks": 400, "Snoop Dogg": 400,
    "Lol Pop": 300, "B-Day Candle": 300, "Desk Calendar": 300, "Lunar Snake": 300,
}
DEFAULT_BASE = 600


def base(col):
    return BASE.get(col, DEFAULT_BASE)


# медианная редкость по каждому типу черты внутри коллекции — от неё считаем множитель
_MED = {c: (median(m[1] for m in d["models"]), median(b[1] for b in d["backdrops"]), median(s[1] for s in d["symbols"]))
        for c, d in CATALOG.items()}


def mult(col, pm, pb, ps):
    mm, mb, ms = _MED[col]
    k = (mm / max(pm, 1)) ** 0.5 * (mb / max(pb, 1)) ** 0.25 * (ms / max(ps, 1)) ** 0.2
    return min(8.0, max(0.6, k))


def supply(col):
    return int(min(300000, max(1000, 4e6 / base(col) ** 0.6)))


_CUM = {}


def _cum(col, key):
    k = (col, key)
    if k not in _CUM:
        items = CATALOG[col][key]
        acc, out = 0.0, []
        for it in items:
            acc += max(it[1], 0.1)
            out.append(acc)
        _CUM[k] = (items, out)
    return _CUM[k]


def _pick(col, key):
    items, cum = _cum(col, key)
    return random.choices(items, cum_weights=cum)[0]


def roll(col):
    m, b, s = _pick(col, "models"), _pick(col, "backdrops"), _pick(col, "symbols")
    return {
        "col": col, "model": m[0], "backdrop": b[0], "symbol": s[0],
        "num": random.randint(1, supply(col)),
        "value": max(1, round(base(col) * mult(col, m[1], b[1], s[1]))),
    }


def expected_value(col):
    """Матожидание ценности подарка коллекции. Множитель — произведение по чертам, поэтому считаем раздельно."""
    d = CATALOG[col]
    mm, mb, ms = _MED[col]
    def part(items, med, k):
        t = sum(x[1] for x in items)
        return sum(x[1] / t * (med / max(x[1], 1)) ** k for x in items)
    e = part(d["models"], mm, 0.5) * part(d["backdrops"], mb, 0.25) * part(d["symbols"], ms, 0.2)
    return base(col) * min(8.0, e)


_EV = {}


def ev(col):
    if col not in _EV:
        _EV[col] = expected_value(col)
    return _EV[col]


# ---------------- кейсы: от дешёвых до мега ----------------
# id, название, эмодзи-обложка (коллекция для превью), мин. уровень, состав
CASES_DEF = [
    ("free", "Бесплатный", "Lol Pop", 1, ["Lol Pop", "Desk Calendar", "B-Day Candle", "Lunar Snake", "Homemade Cake", "Jingle Bells", "Hex Pot"]),
    ("starter", "Ширпотреб", "Desk Calendar", 1, ["Lol Pop", "Desk Calendar", "B-Day Candle", "Lunar Snake", "Homemade Cake",
                                                  "Party Sparkler", "Cookie Heart", "Big Year", "Snake Box", "Pet Snake", "Sakura Flower"]),
    ("sweet", "Сладкоежка", "Homemade Cake", 1, ["Homemade Cake", "Lol Pop", "Hypno Lollipop", "Cookie Heart", "Ginger Cookie",
                                                 "Candy Cane", "Bunny Muffin", "Whip Cupcake", "Mousse Cake", "Ice Cream", "Happy Brownie", "Berry Box"]),
    ("winter", "Новогодний", "Santa Hat", 2, ["Santa Hat", "Snow Mittens", "Ginger Cookie", "Winter Wreath", "Sleigh Bell", "Snow Globe",
                                              "Candy Cane", "Xmas Stocking", "Jingle Bells", "Holiday Drink", "Party Sparkler"]),
    ("spooky", "Хэллоуин", "Mad Pumpkin", 3, ["Witch Hat", "Eternal Candle", "Spy Agaric", "Hex Pot", "Evil Eye", "Scared Cat",
                                              "Voodoo Doll", "Flying Broom", "Trapped Heart", "Skull Flower", "Crystal Ball", "Mad Pumpkin", "Electric Skull"]),
    ("love", "Валентинка", "Heart Locket", 4, ["Cupid Charm", "Valentine Box", "Love Potion", "Diamond Ring", "Restless Jar", "Sky Stilettos",
                                               "Toy Bear", "Bonded Ring", "Lush Bouquet", "Joyful Bundle", "Love Candle", "Eternal Rose", "Heart Locket"]),
    ("gangsta", "Westside", "Low Rider", 5, ["Snoop Dogg", "Swag Bag", "Snoop Cigar", "Low Rider", "Westside Sign", "Vintage Cigar", "Top Hat"]),
    ("jewel", "Ювелирка", "Signet Ring", 6, ["Signet Ring", "Gem Signet", "Diamond Ring", "Bonded Ring", "Nail Bracelet", "Ion Gem",
                                             "Astral Shard", "Swiss Watch", "Moon Pendant", "Faith Amulet", "Clover Pin"]),
    ("magic", "Магия", "Magic Potion", 8, ["Magic Potion", "Genie Lamp", "Crystal Ball", "Astral Shard", "Mirage Lamp", "Perfume Bottle",
                                           "Kissed Frog", "Sharp Tongue", "Love Potion", "Hex Pot"]),
    ("party", "Вечеринка", "Party Sparkler", 1, ["Party Sparkler", "B-Day Candle", "Homemade Cake", "Jester Hat", "Lol Pop", "Cookie Heart",
                                                 "Big Year", "Joyful Bundle", "Jack-in-the-Box", "Hanging Star"]),
    ("spring", "Весна", "Easter Egg", 1, ["Easter Egg", "Spring Basket", "Pretty Posy", "Clover Pin", "Sakura Flower", "Bunny Muffin",
                                          "Jelly Bunny", "Lush Bouquet", "Eternal Rose"]),
    ("food", "Фастфуд", "Instant Ramen", 2, ["Instant Ramen", "Ice Cream", "Whip Cupcake", "Mousse Cake", "Happy Brownie", "Ginger Cookie",
                                             "Holiday Drink", "Spiced Wine", "Homemade Cake", "Berry Box"]),
    ("summer", "Лето", "Pool Float", 2, ["Pool Float", "Surge Board", "Ice Cream", "Vice Cream", "Chill Flame", "Bling Binky", "Fresh Socks", "Mood Pack"]),
    ("zoo", "Зоопарк", "Scared Cat", 4, ["Scared Cat", "Toy Bear", "Jolly Chimp", "Pet Snake", "Rare Bird", "Kissed Frog", "Lunar Snake",
                                         "Neko Helmet", "Jelly Bunny"]),
    ("style", "Стиль", "Top Hat", 4, ["Top Hat", "Bow Tie", "Fresh Socks", "Sky Stilettos", "Durov's Glasses", "Swag Bag", "Fine Pen",
                                      "Mood Pack", "Ionic Dryer", "Perfume Bottle"]),
    ("space", "Космос", "Stellar Rocket", 5, ["Stellar Rocket", "Astral Shard", "Moon Pendant", "Hanging Star", "Star Notepad", "Crystal Ball",
                                              "Lunar Snake", "Mirage Lamp", "Sleigh Bell"]),
    ("luck", "Удача", "Lucky Locket", 6, ["Lucky Locket", "Clover Pin", "Money Pot", "Faith Amulet", "Evil Eye", "Jack-in-the-Box", "Swiss Watch",
                                        "Genie Lamp", "Loot Bag", "Victory Medal"]),
    ("heroes", "Герои", "Heroic Helmet", 7, ["Heroic Helmet", "Light Sword", "Victory Medal", "Liberty Figure", "UFC Strike",
                                             "Khabib's Papakha", "Mighty Arm", "Timeless Book", "Artisan Brick"]),
    ("elite", "Элитный", "Mini Oscar", 12, ["Mini Oscar", "Perfume Bottle", "Loot Bag", "Ion Gem", "Nail Bracelet", "Astral Shard",
                                            "Gem Signet", "Magic Potion", "Mighty Arm", "Westside Sign"]),
    ("durov", "Дуров", "Durov's Cap", 13, ["Durov's Cap", "Durov's Glasses", "Precious Peach", "Plush Pepe", "Swiss Watch", "Signet Ring", "Vintage Cigar"]),
    ("fresh", "Новинки", "Algorithm Cup", 5, ["Algorithm Cup", "Intelligence Cup", "UFC Strike", "Khabib's Papakha",
                                             "Durov's Glasses", "Low Rider", "Westside Sign", "Rare Bird"]),
    ("flea", "Барахолка", "Record Player", 1, ["Record Player", "Tama Gadget", "Input Key", "Hex Pot", "Witch Hat", "Love Candle",
                                               "Light Sword", "Restless Jar", "Valentine Box", "Snoop Dogg", "Snoop Cigar", "Jolly Chimp",
                                               "Timeless Book", "Liberty Figure", "Signet Ring"]),
    ("pepehunt", "Охота на Пепе", "Plush Pepe", 1, ["Lol Pop", "Desk Calendar", "B-Day Candle", "Homemade Cake", "Plush Pepe"]),
    ("hearthunt", "Охота на Сердце", "Heart Locket", 3, ["Eternal Rose", "Love Potion", "Cupid Charm", "Sky Stilettos", "Heart Locket"]),
    ("retro", "Ретро", "Record Player", 2, ["Record Player", "Vintage Cigar", "Top Hat", "Tama Gadget", "Input Key", "Voodoo Doll", "Crystal Ball"]),
    ("lux", "Роскошь", "Swiss Watch", 7, ["Swiss Watch", "Bonded Ring", "Gem Signet", "Perfume Bottle", "Mini Oscar", "Diamond Ring", "Genie Lamp"]),
    ("cups", "Кубки", "Algorithm Cup", 10, ["Algorithm Cup", "Intelligence Cup", "Mighty Arm", "Loot Bag", "Ion Gem", "Nail Bracelet"]),
    ("peach", "Персик", "Precious Peach", 12, ["Precious Peach", "Algorithm Cup", "Intelligence Cup", "Mighty Arm", "Durov's Cap"]),
    # новые кейсы (10-10): охоты, тематические и «Монетка»
    ("coin", "Монетка", "Lucky Locket", 1, ["Lol Pop", "Lucky Locket"]),
    ("cute", "Милашки", "Jelly Bunny", 1, ["Jelly Bunny", "Bunny Muffin", "Toy Bear", "Scared Cat", "Neko Helmet", "Pet Snake", "Kissed Frog", "Jolly Chimp"]),
    ("tech", "Гаджеты", "Tama Gadget", 2, ["Tama Gadget", "Input Key", "Ionic Dryer", "Record Player", "Fine Pen", "Star Notepad", "Light Sword", "Electric Skull"]),
    ("peachhunt", "Охота на Персик", "Precious Peach", 2, ["Lol Pop", "Desk Calendar", "B-Day Candle", "Homemade Cake", "Precious Peach"]),
    ("night", "Ночной клуб", "Vice Cream", 3, ["Vice Cream", "Bling Binky", "Party Sparkler", "Spiced Wine", "Swag Bag", "Chill Flame", "Snoop Cigar", "Snoop Dogg"]),
    ("caphunt", "Охота на Кепку", "Durov's Cap", 3, ["Lol Pop", "Desk Calendar", "B-Day Candle", "Homemade Cake", "Durov's Cap"]),
    ("sport", "Спорт", "UFC Strike", 4, ["UFC Strike", "Khabib's Papakha", "Victory Medal", "Surge Board", "Heroic Helmet", "Bling Binky"]),
    ("royal", "Королевский", "Heart Locket", 18, ["Plush Pepe", "Heart Locket"]),
    ("mega", "МЕГА", "Plush Pepe", 15, ["Plush Pepe", "Heart Locket", "Durov's Cap", "Precious Peach", "Mighty Arm", "Ion Gem", "Loot Bag"]),
]
RTP = conf("economy.case_rtp", 0.9)  # возврат игроку
CASES = {}


def _nice(x):
    """Красивая цена: 1234 → 1250, 87654 → 90000."""
    if x < 100:
        return int(max(10, round(x / 5) * 5))
    p = 10 ** (int(math.log10(x)) - 1)
    for step in (1, 2.5, 5, 10):
        if x <= 10 * p * step / 2.5 * 2.5:
            break
    return int(math.ceil(x / (p * 2.5)) * p * 2.5)


FLOOR = 0.4    # из платного кейса не выпадает подарок дешевле ~40% его цены
SAMPLES = 2000


def _draw(c, floor):
    """Дроп кейса: коллекция по весу, внутри неё перебрасываем вариант, пока ценность ниже планки."""
    col = random.choices(c["cols"], cum_weights=c["cum"])[0]
    best = None
    for _ in range(25):
        d = roll(col)
        if d["value"] >= floor:
            return d
        if not best or d["value"] > best["value"]:
            best = d
    return best


def build_cases():
    for cid, title, cover, lvl, cols in CASES_DEF:
        cols = [x for x in cols if x in CATALOG]
        while True:   # выкидываем коллекции, которые сильно дешевле кейса
            price = len(cols) / sum(1 / ev(x) for x in cols) / RTP
            low = [x for x in cols if ev(x) < 0.5 * price]
            if cid == "free" or not low or len(cols) <= 3:
                break
            cols.remove(min(low, key=ev))
        w = [1 / ev(x) for x in cols]            # вклад каждой коллекции в ожидание одинаковый → дорогие редкие
        tw = sum(w)
        cum, acc = [], 0.0
        for x in w:
            acc += x
            cum.append(acc)
        odds = {x: wi / tw for x, wi in zip(cols, w)}
        c = {"id": cid, "title": title, "cover": cover, "level": lvl, "cols": cols, "cum": cum, "floor": 0, "odds": odds}
        floor = 0 if cid == "free" else FLOOR * price
        for _ in range(2 if floor else 1):   # средняя ценность каждой коллекции с учётом планки
            evs = {}
            for x in cols:
                one = {"cols": [x], "cum": [1.0]}
                evs[x] = sum(_draw(one, floor)["value"] for _ in range(SAMPLES // len(cols) + 150)) / (SAMPLES // len(cols) + 150)
            if floor:
                price = _nice(sum(odds[x] * evs[x] for x in cols) / RTP)
                floor = FLOOR * price
        c.update(evs=evs, floor=floor, price=0 if cid == "free" else price)
        CASES[cid] = c


def open_case(cid):
    c = CASES[cid]
    return _draw(c, c["floor"])


build_cases()

if __name__ == "__main__":
    for c in CASES.values():
        print(f'{c["id"]:8} {c["title"]:12} lvl{c["level"]:>3} price {c["price"]:>8}  EV {sum(c["odds"][x]*ev(x) for x in c["odds"]):>9.0f}')
    print(roll("Plush Pepe"))
