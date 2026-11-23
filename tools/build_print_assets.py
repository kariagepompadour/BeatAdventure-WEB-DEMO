"""Build self-contained SVG poster and instruction cards from project artwork."""
from base64 import b64encode
from html import escape
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "web" / "assets"


def image_data(name):
    mime = "image/jpeg" if name.endswith(".jpg") else "image/png"
    return f"data:{mime};base64," + b64encode((ASSETS / name).read_bytes()).decode("ascii")


def label(x, y, value, size=24, color="#f9f7eb", weight=700, anchor="start", extra=""):
    return (
        f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" '
        f'font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(value)}</text>'
    )


def lines(x, y, values, size=24, color="#f9f7eb", weight=500, gap=None):
    gap = gap or int(size * 1.45)
    return "".join(label(x, y + i * gap, value, size, color, weight) for i, value in enumerate(values))


def poster(lang):
    ja = lang == "ja"
    tagline = "音が、冒険を動かす。" if ja else "FOLLOW THE SOUND. FIND THE ADVENTURE."
    top = "CARDPUTER ADV  •  MUSIC-POWERED ADVENTURE"
    sub = "ブラウザデモ  •  冒険モード" if ja else "BROWSER DEMO  •  ADVENTURE MODE"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1536" role="img" aria-label="BeatAdventure poster">
<defs>
  <linearGradient id="title" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".45" stop-color="#aafaff"/><stop offset="1" stop-color="#238bf1"/></linearGradient>
  <filter id="shadow" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="#02000d" flood-opacity=".9"/></filter>
</defs>
<image x="0" y="0" width="1024" height="1536" preserveAspectRatio="none" href="{image_data("poster-art.jpg")}"/>
<g font-family="Impact, Arial Black, Hiragino Sans, Yu Gothic, sans-serif">
  {label(512, 71, top, 22, "#ffe476", 800, "middle", 'letter-spacing="3"')}
  <path d="M120 91H904" stroke="#e6c648" stroke-width="2"/>
  <text x="512" y="213" text-anchor="middle" textLength="872" lengthAdjust="spacingAndGlyphs" font-size="110" font-style="italic" font-weight="900" fill="url(#title)" stroke="#c92b88" stroke-width="10" paint-order="stroke fill" filter="url(#shadow)">BEATADVENTURE</text>
  {label(512, 277, tagline, 36 if ja else 27, "#ffe476", 900, "middle", 'letter-spacing="1.2"')}
  <rect x="36" y="1413" width="952" height="94" fill="#081126" fill-opacity=".87" stroke="#71dffa" stroke-opacity=".7"/>
  {label(512, 1456, "KARIAGE POMPADOUR ENTERTAINMENT", 27, "#fff6dd", 900, "middle", 'letter-spacing="1.5"')}
  {label(512, 1486, sub, 19, "#78ecfb", 800, "middle", 'letter-spacing="3"')}
</g>
</svg>'''
    (ASSETS / f"poster-{lang}.svg").write_text(svg, encoding="utf-8")


def scene_card(x, y, image, title, english, description):
    return f'''<g>
<rect x="{x}" y="{y}" width="352" height="328" fill="#0b1124" stroke="#69748b" stroke-width="2"/>
<rect x="{x}" y="{y}" width="352" height="44" fill="#d83545"/>
{label(x + 176, y + 30, title, 24, "#fff9ed", 800, "middle")}
<image x="{x + 12}" y="{y + 56}" width="328" height="185" image-rendering="pixelated" href="{image_data(image)}"/>
{label(x + 18, y + 270, english, 19, "#ffd428", 800)}
{lines(x + 18, y + 301, description, 19, "#f9f7eb", 500, 23)}
</g>'''


def instruction(x, y, number, title, details, en):
    out = [f'<rect x="{x}" y="{y}" width="352" height="206" fill="#fffdf4" stroke="#1a3152" stroke-width="2"/>']
    out += [f'<rect x="{x}" y="{y}" width="352" height="43" fill="#152a4b"/>']
    out += [label(x + 12, y + 30, number, 26, "#ffd428", 900)]
    out += [label(x + 60, y + 29, title, 23 if not en else 21, "#ffffff", 800)]
    out += [lines(x + 18, y + 83, details, 19 if not en else 18, "#192b43", 600, 34)]
    return "".join(out)


def guide(lang):
    ja = lang == "ja"
    if ja:
        title, subtitle, intro = "冒険のインストラクションカード", "ADVENTURE FIELD GUIDE", "音が地形になり、冒険が動く！"
        scenes = [
            ("客船と浜辺", "LINER / BEACH", ["船を降り、客船を追う。"]),
            ("森と追っ手", "FOREST / HUNTERS", ["追っ手を避け、リンゴを取る。"]),
            ("小舟と滝", "BOAT / FALLS", ["小舟で滝へ進み、川に落ちる。"]),
            ("川と水面", "RIVER / WAVE EQ", ["音の波が立つ川を泳ぎ抜ける。"]),
        ]
        instructions = [
            ("01", "音源を選ぶ", ["START で音楽のタブを選び", "「音声を共有」をチェック。", "マイクなら MIC START。"]),
            ("02", "音で進む", ["音量が山・波・葉・炎に変わる。", "拍に合わせて主人公が走る。", "テスト曲だけでも体験できる。"]),
            ("03", "キーで助ける", ["Space / ↑ でジャンプ・上泳ぎ。", "↓ で下へ泳ぐ。", "押すと4秒間だけ手動になる。"]),
            ("04", "休む・試す", ["無音が1分続くとキャンプへ。", "音楽が戻ると元の場所から再開。", "下のボタンで各ステージを試せる。"]),
        ]
        route = "客船  →  浜辺  →  森  →  ツタ  →  滝  →  宝倉庫  →  ピラミッド"
        closing = "得点もゲームオーバーもない。音に乗って、物語の先へ。"
        footer = "KEYSPEAKER SERIES  •  CARDPUTER ADV  •  BEATADVENTURE"
    else:
        title, subtitle, intro = "ADVENTURE FIELD GUIDE", "BEATADVENTURE / INSTRUCTION CARD", "SOUND BECOMES THE LANDSCAPE."
        scenes = [
            ("LINER & BEACH", "THE JOURNEY", ["Chase the departing liner."]),
            ("FOREST & HUNTERS", "THE PURSUIT", ["Dodge pursuers; grab apples."]),
            ("BOAT & FALLS", "THE PLUNGE", ["Row toward the waterfall."]),
            ("RIVER & WAVES", "THE CURRENT", ["Swim the sound-shaped river."]),
        ]
        instructions = [
            ("01", "CHOOSE SOUND", ["START: choose the music tab and", "tick Share audio. MIC START", "uses the microphone instead."]),
            ("02", "FOLLOW MUSIC", ["Volume shapes hills, waves, leaves", "and fire. Beats move the explorer.", "Test song works without sharing."]),
            ("03", "TAKE CONTROL", ["Space / Up: jump or swim up.", "Down: swim down. A key press", "gives four seconds of control."]),
            ("04", "REST & EXPLORE", ["One silent minute leads to Camp.", "Music resumes the same scene.", "Stage buttons jump to any chapter."]),
        ]
        route = "LINER  →  BEACH  →  FOREST  →  VINES  →  FALLS  →  TREASURY  →  PYRAMID"
        closing = "NO SCORE. NO GAME OVER. JUST ADVENTURE."
        footer = "KEYSPEAKER SERIES  •  CARDPUTER ADV  •  BEATADVENTURE"
    scene_images = ["scene-beach.png", "scene-forest.png", "scene-boat.png", "scene-river.png"]
    cards = "".join(scene_card(x, y, image, name, subtitle2, text)
                    for (x, y), image, (name, subtitle2, text) in zip(
                        [(52, 280), (428, 280), (52, 632), (428, 632)], scene_images, scenes))
    steps = "".join(instruction(x, y, *data, en=not ja)
                    for (x, y), data in zip([(52, 1237), (428, 1237), (52, 1465), (428, 1465)], instructions))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 832 2000" role="img" aria-label="BeatAdventure instruction card">
<rect width="832" height="2000" fill="#fffbed"/>
<rect x="15" y="15" width="802" height="1970" fill="none" stroke="#183257" stroke-width="4"/>
<rect x="25" y="25" width="782" height="1950" fill="none" stroke="#dc3448" stroke-width="4"/>
<rect x="32" y="32" width="768" height="145" fill="#ffd428"/>
<rect x="32" y="32" width="768" height="12" fill="#dc3448"/>
<g font-family="Hiragino Sans, Yu Gothic, Arial, sans-serif">
{label(416, 99, "BEATADVENTURE", 62, "#142a4d", 900, "middle", 'textLength="720" lengthAdjust="spacingAndGlyphs"')}
{label(416, 138, title, 31 if ja else 25, "#142a4d", 900, "middle")}
{label(416, 161, subtitle, 17, "#142a4d", 800, "middle", 'letter-spacing="1.2"')}
<rect x="32" y="189" width="768" height="923" fill="#080d20"/>
{label(416, 248, intro, 32 if ja else 29, "#ffd428", 900, "middle")}
<path d="M52 263H780" stroke="#d83545" stroke-width="3"/>
{cards}
{label(416, 1043, route, 19 if ja else 17, "#ffd428", 700, "middle")}
<rect x="32" y="1131" width="768" height="66" fill="#d83545"/>
{label(416, 1175, "操作のポイント" if ja else "HOW TO PLAY", 35, "#ffffff", 900, "middle")}
{steps}
<rect x="52" y="1708" width="728" height="104" fill="#ffd428" stroke="#d83545" stroke-width="2"/>
{label(416, 1770, closing, 22 if ja else 21, "#142a4d", 900, "middle")}
<rect x="32" y="1841" width="768" height="129" fill="#152a4b"/>
{label(416, 1902, "KARIAGE POMPADOUR ENTERTAINMENT", 25, "#ffd428", 900, "middle")}
{label(416, 1936, footer, 16, "#ffffff", 700, "middle")}
</g>
</svg>'''
    (ASSETS / f"field-guide-{lang}.svg").write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    for language in ("en", "ja"):
        poster(language)
        guide(language)
        print("Built", language, "poster and instruction card")
