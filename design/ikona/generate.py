"""Ikona FFF · Fast Facts Finder: pinta kojoj je pjena mozak + prekriženi vilica i nož.
Generira SVG-ove u design/ikona/ (pokreni: python3 design/ikona/generate.py)."""
import os

NAVY = '#1B2A4A'
CUTLERY = '#5B74A8'
BEER = '#F5A524'
BEER_LIGHT = '#FFC65C'
FOAM = '#FFF4DE'
FOLD = '#E2C48E'
WHITE = '#FFFFFF'
OUT = os.path.dirname(os.path.abspath(__file__))


def fork(x, y, s, color):
    w = 14 * s
    g = ''.join(f'<rect x="{x + (i - 1.5) * 26 * s - w / 2}" y="{y}" width="{w}" height="{95 * s}" rx="{w / 2}" fill="{color}"/>' for i in range(4))
    g += f'<path d="M{x - 52 * s} {y + 80 * s} Q{x - 52 * s} {y + 150 * s} {x} {y + 160 * s} Q{x + 52 * s} {y + 150 * s} {x + 52 * s} {y + 80 * s} Z" fill="{color}"/>'
    g += f'<rect x="{x - 14 * s}" y="{y + 150 * s}" width="{28 * s}" height="{230 * s}" rx="{14 * s}" fill="{color}"/>'
    return g


def knife(x, y, s, color):
    g = f'<path d="M{x - 10 * s} {y} C{x + 45 * s} {y + 20 * s},{x + 40 * s} {y + 150 * s},{x + 18 * s} {y + 200 * s} L{x - 18 * s} {y + 200 * s} Z" fill="{color}"/>'
    g += f'<rect x="{x - 17 * s}" y="{y + 195 * s}" width="{34 * s}" height="{190 * s}" rx="{17 * s}" fill="{color}"/>'
    return g


def cutlery(color):
    return (f'<g transform="rotate(-38 512 620)">{fork(512, 60, 1.45, color)}</g>'
            f'<g transform="rotate(38 512 620)">{knife(512, 60, 1.45, color)}</g>')


def glass(beer=BEER, light=BEER_LIGHT, rim=WHITE, mono=None):
    if mono:
        return f'<path d="M322 360 L702 360 L660 870 Q656 900 626 900 L398 900 Q368 900 364 870 Z" fill="{mono}"/>'
    bubbles = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{FOAM}" opacity=".75"/>'
                      for x, y, r in [(430, 700, 9), (470, 790, 7), (585, 650, 8), (550, 760, 11), (455, 560, 6), (600, 820, 6)])
    return (f'<path d="M322 360 L702 360 L660 870 Q656 900 626 900 L398 900 Q368 900 364 870 Z" fill="{beer}" stroke="{rim}" stroke-width="22" stroke-linejoin="round"/>'
            f'<path d="M642 420 L612 840" stroke="{light}" stroke-width="26" stroke-linecap="round" opacity=".9"/>'
            + bubbles)


def foam_brain(mono=None):
    fill = mono or FOAM
    # Pjena preko ruba čaše u obliku mozga: dvije polutke od "mjehurića"
    lobes = [(-150, 10, 70), (-105, -45, 78), (-40, -80, 80), (40, -80, 80), (105, -45, 78), (150, 10, 70),
             (-95, 25, 80), (95, 25, 80), (0, 0, 95), (-40, 40, 70), (40, 40, 70)]
    cx, cy = 512, 330
    g = ''.join(f'<circle cx="{cx + x}" cy="{cy + y}" r="{r}" fill="{fill}"/>' for x, y, r in lobes)
    # kapi pjene niz čašu
    g += f'<path d="M352 360 Q352 430 372 440 Q392 430 392 380 Z" fill="{fill}"/>'
    g += f'<path d="M640 360 Q640 470 662 480 Q684 470 682 380 Z" fill="{fill}"/>'
    if mono:
        return g
    line = lambda d: f'<path d="{d}" fill="none" stroke="{FOLD}" stroke-width="14" stroke-linecap="round"/>'
    folds = [
        f'M{cx} {cy - 150} C{cx - 14} {cy - 90},{cx + 14} {cy - 20},{cx} {cy + 70}',  # razdjelnica polutki
        f'M{cx - 60} {cy - 135} C{cx - 45} {cy - 100},{cx - 85} {cy - 85},{cx - 70} {cy - 45}',
        f'M{cx - 150} {cy - 40} C{cx - 110} {cy - 30},{cx - 105} {cy + 5},{cx - 135} {cy + 30}',
        f'M{cx - 80} {cy + 5} C{cx - 55} {cy + 20},{cx - 65} {cy + 50},{cx - 40} {cy + 65}',
        f'M{cx + 60} {cy - 135} C{cx + 45} {cy - 100},{cx + 85} {cy - 85},{cx + 70} {cy - 45}',
        f'M{cx + 150} {cy - 40} C{cx + 110} {cy - 30},{cx + 105} {cy + 5},{cx + 135} {cy + 30}',
        f'M{cx + 80} {cy + 5} C{cx + 55} {cy + 20},{cx + 65} {cy + 50},{cx + 40} {cy + 65}',
    ]
    return g + ''.join(line(d) for d in folds)


def svg(body, bg=None):
    rect = f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{rect}{body}</svg>'


def scaled(body, scale):
    # Android adaptivna ikona: sadržaj mora stati u sigurnu zonu (~66 % sredine)
    off = 512 * (1 - scale)
    return f'<g transform="translate({off} {off}) scale({scale})">{body}</g>'


art = cutlery(CUTLERY) + glass() + foam_brain()
mono = cutlery(WHITE) + glass(mono=WHITE) + foam_brain(mono=WHITE)

files = {
    'icon.svg': svg(art, NAVY),                                  # iOS / opća ikona (pun kvadrat)
    'android-foreground.svg': svg(scaled(art, 0.68)),            # prozirna pozadina
    'android-background.svg': svg('', NAVY),
    'android-monochrome.svg': svg(scaled(mono, 0.68)),
    'splash.svg': svg(scaled(art, 0.9)),                         # na tamnoplavoj pozadini splash ekrana
    'logo.svg': svg(scaled(cutlery(CUTLERY) + glass() + foam_brain(), 1.0)),  # za unutar aplikacije (prozirno)
}
for name, content in files.items():
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(content)
print('ok', ', '.join(files))
