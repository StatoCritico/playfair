"""Genera guida-rapida.pdf (A4, 1 pagina) da docs/guida-rapida.html.
Uso:  python3 docs/guida-rapida.py [--no-shots]
1) serve il sito con http.server e cattura le miniature (tema chiaro) in docs/guida-img/
2) stampa docs/guida-rapida.html con Chrome headless (playwright) in ../guida-rapida.pdf
"""
import subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright

QUI = pathlib.Path(__file__).resolve().parent
SITO = QUI.parent
CHROME = '/usr/bin/google-chrome'
PORTA = 8765

def miniature(b):
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA), '-d', str(SITO)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        url = f'http://localhost:{PORTA}/'
        pg = b.new_page(viewport={'width': 1280, 'height': 1060}, device_scale_factor=1.25, reduced_motion='reduce')
        pg.goto(url + 'index.html')
        pg.evaluate("localStorage.setItem('pf-tema','light'); localStorage.setItem('pf-sankey-guida-vista','1')")
        pg.reload(); pg.wait_for_timeout(1500)
        pg.screenshot(path=str(QUI / 'guida-img/home.jpg'), type='jpeg', quality=82)
        pg.set_viewport_size({'width': 1280, 'height': 800})
        pg.goto(url + 'sankey.html'); pg.wait_for_timeout(800)
        pg.keyboard.press('Escape')
        pg.select_option('#sk-esempio', 'ospedale'); pg.click('#sk-carica-esempio'); pg.wait_for_timeout(400)
        pg.mouse.click(700, 140)
        pg.keyboard.press('a'); pg.wait_for_timeout(400); pg.keyboard.press('0'); pg.wait_for_timeout(800)
        pg.evaluate('document.activeElement && document.activeElement.blur()'); pg.mouse.move(5, 790); pg.wait_for_timeout(300)
        pg.screenshot(path=str(QUI / 'guida-img/sankey.jpg'), type='jpeg', quality=85,
                      clip={'x': 196, 'y': 100, 'width': 765, 'height': 600})
        pg.close()
    finally:
        srv.terminate()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    if '--no-shots' not in sys.argv:
        miniature(b)
    pg = b.new_page()
    pg.goto((QUI / 'guida-rapida.html').as_uri()); pg.wait_for_timeout(800)
    pg.evaluate('document.fonts.ready')
    pg.pdf(path=str(SITO / 'guida-rapida.pdf'), format='A4', print_background=True,
           prefer_css_page_size=True, margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'})
    b.close()
print('ok:', SITO / 'guida-rapida.pdf')
