"""
Logotipos de ELGO para la app, a partir del logotipo OFICIAL.

El isotipo son tres trazos en forma de techos. Se vectorizó del archivo que
entregó ELGO (14-oct-2026): cada trazo es un polígono con sus esquinas
medidas sobre el original, así se ve nítido a cualquier tamaño. La fuente
vectorial queda en public/logo-mark.svg.

Genera en public/:
  logo-mark.svg        isotipo vectorial (gris del logotipo)
  logo-elgo.png        isotipo + ELGO debajo, para la pantalla de acceso
  logo-mark.png        isotipo gris (encabezado del panel)
  logo-mark-white.png  isotipo gris claro para fondos oscuros (menú, celular, iconos)

Después corre scripts/iconos-finanzas/generar-iconos.py para los iconos del
celular.

Uso (necesita Playwright con Chromium y la fuente Inter Display ExtraBold):
  python3 scripts/marca-elgo/generar-logos.py
"""
import os
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Coordenadas del original (650 × 340 px). Caja del dibujo: x 58–593, y 60–288.
TRAZOS = [
    [(165, 136), (242, 60), (364, 60), (364, 88), (254, 88), (190, 148)],
    [(283, 198), (363, 124), (486, 188), (593, 188), (593, 215), (478, 215), (367, 156), (308, 212)],
    [(58, 238), (138, 163), (322, 261), (424, 261), (424, 234), (452, 234), (452, 288), (314, 288), (140, 196), (83, 251)],
]
CAJA = (58, 60, 535, 228)  # x, y, ancho, alto

GRIS = '#626262'          # gris del logotipo oficial
GRIS_CLARO = '#d9d4ce'    # gris cálido para fondos oscuros


def poligonos(color):
    return ''.join(
        '<polygon fill="{}" points="{}"/>'.format(color, ' '.join(f'{x},{y}' for x, y in t))
        for t in TRAZOS
    )


def svg_isotipo(color, ancho=None):
    x, y, w, h = CAJA
    tam = f' width="{ancho}" height="{round(ancho * h / w)}"' if ancho else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}"{tam}>{poligonos(color)}</svg>'


def svg_con_nombre(color, texto, ancho):
    """Isotipo con ELGO centrado debajo (como en la papelería)."""
    x, y, w, h = CAJA
    alto = h + 165
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {alto}" width="{ancho}" height="{round(ancho * alto / w)}">'
        f'{poligonos(color)}'
        f'<text x="{x + w / 2 + 15}" y="{y + h + 150}" text-anchor="middle" font-family="Inter Display" font-weight="800" '
        f'font-size="122" letter-spacing="30" fill="{texto}">ELGO</text>'
        '</svg>'
    )


SALIDAS = {
    'logo-elgo.png': lambda: svg_con_nombre(GRIS, GRIS, 640),
    'logo-mark.png': lambda: svg_isotipo(GRIS, 512),
    'logo-mark-white.png': lambda: svg_isotipo(GRIS_CLARO, 512),
}


def main():
    with open(os.path.join(RAIZ, 'public', 'logo-mark.svg'), 'w') as f:
        f.write(svg_isotipo(GRIS) + '\n')
    print('ok logo-mark.svg')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(device_scale_factor=1)
        for nombre, hacer in SALIDAS.items():
            pg.set_content(f'<html><body style="margin:0;background:transparent">{hacer()}</body></html>')
            pg.wait_for_timeout(150)
            pg.locator('svg').screenshot(path=os.path.join(RAIZ, 'public', nombre), omit_background=True)
            print('ok', nombre)
        b.close()


if __name__ == '__main__':
    main()
