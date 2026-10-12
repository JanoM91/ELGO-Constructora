"""
Logotipos de ELGO para la app (recreación provisional).

ELGO todavía no entrega su logotipo en vector. Esta es una recreación del que
aparece en su papelería: tres trazos grises en forma de techos y la palabra
ELGO debajo, en gris. En cuanto llegue el archivo oficial (SVG, AI o PDF),
reemplaza los PNG de public/ y vuelve a correr
scripts/iconos-finanzas/generar-iconos.py.

Genera en public/:
  logo-elgo.png        logotipo para la pantalla de acceso (gris, fondo transparente)
  logo-mark.png        isotipo para el encabezado del panel (gris)
  logo-mark-white.png  isotipo sobre fondo oscuro (trazos gris claro, ELGO en blanco)

Uso (necesita Playwright con Chromium y la fuente Inter Display Black):
  python3 scripts/marca-elgo/generar-logos.py
"""
import os
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TRAZOS = [
    'M40 205 L150 98 L402 98 L402 140',
    'M40 302 L455 160 L522 248 L586 248',
    'M112 212 L330 332 L472 332 L472 292',
]


def svg(lineas, texto, ancho=600):
    caminos = ''.join(
        f'<path d="{d}" fill="none" stroke="{lineas}" stroke-width="34" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt"/>'
        for d in TRAZOS
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 620 620" width="{ancho}" height="{ancho}">'
        f'{caminos}'
        f'<text x="310" y="560" text-anchor="middle" font-family="Inter Display" font-weight="900" font-size="180" letter-spacing="6" font-size-adjust="none" fill="{texto}">ELGO</text>'
        '</svg>'
    )


SALIDAS = {
    'logo-elgo.png': ('#b9bcc0', '#b9bcc0', 640),
    'logo-mark.png': ('#9a9ea4', '#8a8e94', 256),
    'logo-mark-white.png': ('#c9cdd3', '#ffffff', 512),
}


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(device_scale_factor=1)
        for nombre, (lineas, texto, ancho) in SALIDAS.items():
            pg.set_content(f'<html><body style="margin:0;background:transparent">{svg(lineas, texto, ancho)}</body></html>')
            pg.wait_for_timeout(150)
            pg.locator('svg').screenshot(path=os.path.join(RAIZ, 'public', nombre), omit_background=True)
            print('ok', nombre)
        b.close()


if __name__ == '__main__':
    main()
