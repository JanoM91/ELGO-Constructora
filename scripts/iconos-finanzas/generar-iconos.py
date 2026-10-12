"""
Iconos de ELGO Finanzas para la pantalla de inicio del celular.

Mismo esquema que MacAuto Finanzas (docs/61 de ese proyecto): fondo del color
primario oscuro de la marca, el isotipo ELGO (trazos gris claro y palabra en blanco), y la palabra
«Finanzas» debajo. La etiqueta del icono la pone el teléfono aparte.

Parte de public/logo-mark-white.png (los tres trazos en gris claro y ELGO en
blanco, sobre fondo transparente; lo genera scripts/marca-elgo/) y genera en
public/finanzas/:

  icon-192.png / icon-512.png                    Android (manifest, purpose "any")
  icon-maskable-192.png / icon-maskable-512.png  Android con máscara (el dibujo
                                                 va dentro del 80 % central)
  apple-icon.png (180×180)                       iPhone (apple-touch-icon)
  favicon-64.png                                 pestaña del navegador (sin texto)

Uso (solo hace falta volver a correrlo si cambia el logotipo o el nombre):

  pip install Pillow
  python3 scripts/iconos-finanzas/generar-iconos.py
  python3 scripts/iconos-finanzas/generar-iconos.py --texto Finanzas --fondo "#13294b" --acento "#c9cdd3"
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FUENTES = [
    '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
    '/usr/share/fonts/truetype/inter/Inter-Bold.ttf',
    os.path.expanduser('~/Library/Fonts/Inter-Bold.ttf'),
    '/Library/Fonts/Inter-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def color(hexa):
    h = hexa.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fuente(ruta, tam):
    for f in ([ruta] if ruta else []) + FUENTES:
        if f and os.path.exists(f):
            return ImageFont.truetype(f, tam)
    raise SystemExit('No encontré una fuente bold. Usa --fuente <ruta a .ttf/.otf>.')


def icono(tam, isotipo, fondo, acento, texto, zona, ruta_fuente, redondeo=False):
    """zona: fracción del lado que puede ocupar el dibujo (1 = todo; 0.8 = zona segura de maskable)."""
    base = Image.new('RGBA', (tam, tam), fondo + (255,))
    if redondeo:
        m = Image.new('L', (tam, tam), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, tam - 1, tam - 1), radius=int(tam * 0.22), fill=255)
        base.putalpha(m)
    util = tam * zona
    margen = (tam - util) / 2
    alto_texto = util * 0.17 if texto else 0
    hueco = util * 0.05 if texto else 0
    lado = int(min(util * 0.86, util - alto_texto - hueco))
    iso = isotipo.resize((lado, lado), Image.LANCZOS)
    y0 = int(margen + (util - lado - hueco - alto_texto) / 2)
    base.alpha_composite(iso, (int((tam - lado) / 2), y0))
    if texto:
        d = ImageDraw.Draw(base)
        t = int(alto_texto * 0.9)
        f = fuente(ruta_fuente, t)
        while d.textlength(texto, font=f) > util * 0.92 and t > 6:
            t -= 1
            f = fuente(ruta_fuente, t)
        w = d.textlength(texto, font=f)
        d.text(((tam - w) / 2, y0 + lado + hueco), texto, font=f, fill=acento + (255,))
    return base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--isotipo', default=os.path.join(RAIZ, 'public', 'logo-mark-white.png'))
    ap.add_argument('--fondo', default='#13294b')
    ap.add_argument('--acento', default='#c9cdd3')
    ap.add_argument('--texto', default='Finanzas')
    ap.add_argument('--fuente', default=None)
    ap.add_argument('--salida', default=os.path.join(RAIZ, 'public', 'finanzas'))
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    iso = Image.open(a.isotipo).convert('RGBA')
    iso = iso.crop(iso.getbbox())
    fondo, acento = color(a.fondo), color(a.acento)
    trabajos = [
        ('icon-512.png', 512, 0.86, a.texto),
        ('icon-192.png', 192, 0.86, a.texto),
        ('icon-maskable-512.png', 512, 0.72, a.texto),
        ('icon-maskable-192.png', 192, 0.72, a.texto),
        ('apple-icon.png', 180, 0.84, a.texto),
        ('favicon-64.png', 64, 0.9, ''),
    ]
    for nombre, tam, zona, texto in trabajos:
        im = icono(tam, iso, fondo, acento, texto, zona, a.fuente, redondeo=(nombre == 'favicon-64.png'))
        im.save(os.path.join(a.salida, nombre), optimize=True)
        print('ok', nombre)


if __name__ == '__main__':
    main()
