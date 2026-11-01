#!/usr/bin/env python3
"""App Store screenshots with the coral tiger-stripe background, headline and phone frame.

Reads the plain shots in fastlane/screenshots/en-GB (from screenshots.sh) and writes 1206 x 2622
PNGs (the iPhone 6.3" slot App Store Connect asks for) to fastlane/screenshots-framed/en-GB,
rendered by headless Chrome. Run from ios/: ./framed-screenshots.py
"""
import pathlib, re, subprocess, tempfile

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'fastlane/screenshots/en-GB'
OUT = HERE / 'fastlane/screenshots-framed/en-GB'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 1206, 2622

SHOTS = [
    ('01-discover', 'Nearly 500 workouts', 'Benchmarks, strength, HIIT and NHS plans'),
    ('02-workout', 'Plan every round', 'Exercises, rests and loads before you start'),
    ('03-timer', 'Hands-free timer', 'Tones and haptics at every change'),
    ('04-today-target', "Know today's target", 'Set from your last few attempts'),
    ('05-exercise', 'Dial in every set', 'Loads in kilos or % of your max'),
    ('06-logbook', 'See your progress', 'Charts, records and one-rep max'),
    ('07-history', 'Every session, kept', 'Your whole training history'),
    ('08-me', 'See what you trained', 'A muscle map of the last four weeks'),
]

mark = ''.join(re.findall(r"'([^']*)'", (HERE.parent / 'src/shared/brand/tiger-mark-path.ts').read_text()))


def page(name: str, title: str, line: str, i: int) -> str:
    tilt = -18 if i % 2 == 0 else 18
    stripes = ''.join(
        f'<path d="M{-300+k*230},-50 C{-150+k*230},600 {-420+k*230},1300 {-200+k*230},2700 L{-120+k*230},2700 '
        f'C{-330+k*230},1300 {-60+k*230},600 {-220+k*230},-50 Z" transform="rotate({tilt} 603 1311)"/>'
        for k in range(10))
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding-top:118px;
font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;position:relative;
background:radial-gradient(120% 70% at {20 if i % 2 == 0 else 80}% 0%,#FF6A4A 0%,#FF4D2E 35%,#C42A12 75%,#7E1A0A 100%)}}
.stripes{{position:absolute;inset:0;opacity:.13}}
.mark{{position:relative;width:96px;height:96px;flex:none}}
h1{{position:relative;margin:36px 0 0;text-align:center;color:#fff;font-size:104px;font-weight:800;letter-spacing:-2.5px;line-height:1.02;padding:0 60px}}
p{{position:relative;margin:26px 0 0;text-align:center;color:#FFE1D9;font-size:48px;font-weight:500;letter-spacing:-.3px;padding:0 60px}}
.phone{{position:relative;flex:none;margin-top:84px;width:930px;padding:18px;border-radius:118px;background:#121214;
box-shadow:0 60px 120px rgba(60,8,0,.55),0 0 0 3px rgba(255,255,255,.12) inset}}
.phone img{{display:block;width:930px;border-radius:100px}}
</style></head><body>
<svg class="stripes" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><g fill="#000">{stripes}</g></svg>
<svg class="mark" viewBox="0 0 100 100"><path fill="#fff" fill-opacity=".95" d="{mark}"/></svg>
<h1>{title}</h1><p>{line}</p>
<div class="phone"><img src="file://{SRC}/iPhone69-{name}.png"></div>
</body></html>'''


OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for i, (name, title, line) in enumerate(SHOTS):
        html = pathlib.Path(tmp) / f'{name}.html'
        html.write_text(page(name, title, line, i))
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--mute-audio', '--hide-scrollbars',
                        '--allow-file-access-from-files', '--force-device-scale-factor=1', f'--window-size={W},{H}',
                        f'--screenshot={OUT}/iPhone63-{name}.png', f'file://{html}'],
                       check=True, capture_output=True)
        print(f'iPhone63-{name}.png')
