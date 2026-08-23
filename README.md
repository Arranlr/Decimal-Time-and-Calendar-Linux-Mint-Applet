# Decimal Time F*** yeah! we ball

Ever wondered what a better future could be?

<img width="800" height="450" alt="image" src="https://github.com/user-attachments/assets/0f782909-8238-4398-9b00-67c2ff281308" />


Sometimes in life all you need is a little revolution to bring a sunny day. In this spirit
I've created a French-Revolutionary inspired decimal clock and calendar applet (10 hours/100 minutes/100
seconds a day; 12 months of 30 days each), reimagined with internationalized
month and day names instead of the original's Paris-specific weather poetry.

- **Months** (Latin numeral roots, extending the familiar September–December):
  Unember, Duember, Triember, Quadember, Quintember, Sextember, September,
  October, November, December, Undecember, Duodecember.
- **Days of the décade** (Greek numeral roots, as in polygon names):
  Monoday, Diday, Triday, Tetraday, Pentaday, Hexaday, Heptaday, Octaday,
  Enneaday, Decaday (rest day).
- **Epagomenal days**: 5 or 6 extra days at year's end, belonging to no month.

## Contents

- `web/decimal-time.html` — standalone browser version: live decimal clock
  dial plus a navigable decimal calendar (Prev/Today/Next). No dependencies,
  just open it in a browser.
- `web/decimal-clock.html`, `web/decimal-calendar.html` — earlier standalone
  versions of the clock and calendar separately.
- `gnome-extension/decimal-time@example.local/` — GNOME Shell top-bar
  extension (GNOME 45+, ESM-based).
- `cinnamon-applet/decimal-time@example.local/` — Cinnamon panel applet
  (Linux Mint's default desktop), ported from the GNOME version.

## Installing the GNOME extension

```bash
cp -r gnome-extension/decimal-time@example.local ~/.local/share/gnome-shell/extensions/
gnome-extensions enable decimal-time@example.local
# X11: Alt+F2, r, Enter to reload the shell. Wayland: log out/in.
```

## Installing the Cinnamon applet

```bash
cp -r cinnamon-applet/decimal-time@example.local ~/.local/share/cinnamon/applets/
# Restart Cinnamon (Ctrl+Alt+Esc, or `cinnamon --replace &` in a terminal),
# then right-click the panel -> Applets -> Manage -> enable "Decimal Time & Calendar".
```

## Ok that's cool but what does it look like huh? Check this metric bliss out:
<img width="427" height="649" alt="image" src="https://github.com/user-attachments/assets/f252e559-8580-4ccc-a485-2dc4bb9895a6" />


## Notes / simplifications

- The Republican year is approximated as beginning Sept 22 each year rather
  than the true astronomical equinox (which can shift by a day).
- The leap-day rule (5 vs. 6 epagomenal days) is a modern heuristic tied to
  the Gregorian leap cycle, since the original calendar never settled on one
  before it was abolished in 1806.
  -Viva la revolución!
