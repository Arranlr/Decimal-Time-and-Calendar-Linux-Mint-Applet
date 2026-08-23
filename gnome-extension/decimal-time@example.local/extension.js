import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/* ============== SHARED DECIMAL-TIME / CALENDAR LOGIC ============== */

const MONTHS = ["Unember", "Duember", "Triember", "Quadember", "Quintember", "Sextember",
    "September", "October", "November", "December", "Undecember", "Duodecember"];
const DAYS = ["Monoday", "Diday", "Triday", "Tetraday", "Pentaday", "Hexaday", "Heptaday", "Octaday", "Enneaday", "Decaday"];
const DAYS_ABBR = ["Mo", "Di", "Tr", "Te", "Pe", "He", "Hp", "Oc", "En", "De"];
const EPAGOMENAL = ["Epagomenal I", "Epagomenal II", "Epagomenal III", "Epagomenal IV", "Epagomenal V", "Epagomenal VI (Leap)"];

function pad(n) {
    return String(n).padStart(2, '0');
}

function isGregorianLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function computeRepublicanDate(now) {
    const y = now.getFullYear();
    let epochYear = y;
    let epoch = new Date(y, 8, 22); // Sept 22, approximating the autumnal equinox
    if (now < epoch) {
        epochYear = y - 1;
        epoch = new Date(epochYear, 8, 22);
    }
    const republicanYear = epochYear - 1791; // Year 1 began autumn 1792
    const msPerDay = 86400000;
    const dayIndex = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - epoch) / msPerDay);
    const complementaryCount = isGregorianLeap(epochYear + 1) ? 6 : 5;

    if (dayIndex < 360) {
        const monthIndex = Math.floor(dayIndex / 30);
        const dayOfMonth = (dayIndex % 30) + 1;
        const decadeIndex = Math.floor((dayOfMonth - 1) / 10);
        const dayInDecadeIndex = (dayOfMonth - 1) % 10;
        return {republicanYear, monthIndex, dayOfMonth, decadeIndex, dayInDecadeIndex, isEpagomenal: false, complementaryCount};
    } else {
        const epagIndex = dayIndex - 360;
        return {republicanYear, epagIndex, isEpagomenal: true, complementaryCount};
    }
}

function complementaryCountForYear(republicanYear) {
    const epochYear = republicanYear + 1791;
    return isGregorianLeap(epochYear + 1) ? 6 : 5;
}

/* ============== PANEL INDICATOR ============== */

const DecimalIndicator = GObject.registerClass(
class DecimalIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Decimal Time', false);

        this._label = new St.Label({
            text: '0:00:00',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'decimal-clock-label',
        });
        this.add_child(this._label);

        this._view = this._todayView();
        this._buildMenu();

        this._fastTimeoutId = null;
        this._slowTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updatePanel();
            return GLib.SOURCE_CONTINUE;
        });

        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._view = this._todayView();
                this._updatePopup();
                this._fastTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._updatePopup();
                    return GLib.SOURCE_CONTINUE;
                });
            } else if (this._fastTimeoutId) {
                GLib.source_remove(this._fastTimeoutId);
                this._fastTimeoutId = null;
            }
        });

        this._updatePanel();
    }

    _todayView() {
        const t = computeRepublicanDate(new Date());
        return {year: t.republicanYear, monthIndex: t.isEpagomenal ? 12 : t.monthIndex};
    }

    _buildMenu() {
        // Dial
        this._dialArea = new St.DrawingArea({width: 150, height: 150, style_class: 'decimal-dial'});
        this._dialArea.connect('repaint', this._drawDial.bind(this));
        const dialItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const dialBox = new St.BoxLayout({x_expand: true});
        const dialCenter = new St.Bin({x_expand: true, x_align: Clutter.ActorAlign.CENTER});
        dialCenter.set_child(this._dialArea);
        dialBox.add_child(dialCenter);
        dialItem.add_child(dialBox);
        this.menu.addMenuItem(dialItem);

        // Full time readout
        this._timeLabel = new St.Label({text: '', style_class: 'decimal-popup-time'});
        const timeItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        timeItem.add_child(this._timeLabel);
        this.menu.addMenuItem(timeItem);

        this._stdLabel = new St.Label({text: '', style_class: 'decimal-popup-sub'});
        const stdItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        stdItem.add_child(this._stdLabel);
        this.menu.addMenuItem(stdItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Today's date
        this._dateLabel = new St.Label({text: '', style_class: 'decimal-popup-date'});
        const dateItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        dateItem.add_child(this._dateLabel);
        this.menu.addMenuItem(dateItem);

        // Navigation row
        const navItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const navBox = new St.BoxLayout({x_expand: true, style_class: 'decimal-nav-row'});
        const todayBtn = new St.Button({label: 'Today', style_class: 'decimal-nav-button', x_expand: true});
        const prevBtn = new St.Button({label: '\u25C0 Prev Month', style_class: 'decimal-nav-button', x_expand: true});
        const nextBtn = new St.Button({label: 'Next Month \u25B6', style_class: 'decimal-nav-button', x_expand: true});
        const prevYearBtn = new St.Button({label: '\u25C0\u25C0 Prev Year', style_class: 'decimal-nav-button', x_expand: true});
        const nextYearBtn = new St.Button({label: 'Next Year \u25B6\u25B6', style_class: 'decimal-nav-button', x_expand: true});
        todayBtn.connect('clicked', () => this._navToday());
        prevBtn.connect('clicked', () => this._navPrev());
        nextBtn.connect('clicked', () => this._navNext());
        prevYearBtn.connect('clicked', () => this._navPrevYear());
        nextYearBtn.connect('clicked', () => this._navNextYear());
        navBox.add_child(todayBtn);
        navBox.add_child(prevBtn);
        navBox.add_child(nextBtn);
        navItem.add_child(navBox);
        navBox.add_child(prevYearBtn);
        navBox.add_child(nextYearBtn);
        this.menu.addMenuItem(navItem);

        // Month label
        this._monthLabel = new St.Label({text: '', style_class: 'decimal-month-label'});
        const monthItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        monthItem.add_child(this._monthLabel);
        this.menu.addMenuItem(monthItem);

        // Grid container (rebuilt on navigation)
        this._gridItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._gridBox = new St.BoxLayout({vertical: true, style_class: 'decimal-grid'});
        this._gridItem.add_child(this._gridBox);
        this.menu.addMenuItem(this._gridItem);
    }

    _drawHand(cr, cx, cy, fraction, length, width, rgba) {
        const angle = fraction * 2 * Math.PI - Math.PI / 2;
        cr.setSourceRGBA(rgba[0], rgba[1], rgba[2], rgba[3]);
        cr.setLineWidth(width);
        cr.moveTo(cx, cy);
        cr.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
        cr.stroke();
    }

    _drawDial() {
        const cr = this._dialArea.get_context();
        const w = 150, h = 150;
        const cx = w / 2, cy = h / 2, rOuter = 64, rInner = 54;

        cr.setSourceRGBA(0, 0, 0, 0);
        cr.paint();

        cr.setSourceRGBA(0.72, 0.53, 0.24, 1);
        cr.setLineWidth(1.5);
        cr.arc(cx, cy, rOuter, 0, 2 * Math.PI);
        cr.stroke();

        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
            const x1 = cx + Math.cos(angle) * rInner, y1 = cy + Math.sin(angle) * rInner;
            const x2 = cx + Math.cos(angle) * rOuter, y2 = cy + Math.sin(angle) * rOuter;
            cr.setSourceRGBA(0.87, 0.7, 0.4, 1);
            cr.setLineWidth(2);
            cr.moveTo(x1, y1);
            cr.lineTo(x2, y2);
            cr.stroke();
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const fractionOfDay = (now - startOfDay) / 86400000;
        const decimalSecondsTotal = fractionOfDay * 100000;

        this._drawHand(cr, cx, cy, fractionOfDay, 30, 3, [0.91, 0.89, 0.82, 1]);
        this._drawHand(cr, cx, cy, (decimalSecondsTotal % 10000) / 10000, 45, 2, [0.87, 0.7, 0.4, 1]);
        this._drawHand(cr, cx, cy, (decimalSecondsTotal % 100) / 100, 50, 1, [0.54, 0.23, 0.2, 1]);

        cr.setSourceRGBA(0.87, 0.7, 0.4, 1);
        cr.arc(cx, cy, 3, 0, 2 * Math.PI);
        cr.fill();

        cr.$dispose();
    }

    _updatePanel() {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const fractionOfDay = (now - startOfDay) / 86400000;
        const decimalSecondsTotal = fractionOfDay * 100000;
        const dHour = Math.floor(decimalSecondsTotal / 10000);
        const dMinute = Math.floor((decimalSecondsTotal % 10000) / 100);
        const dSecond = Math.floor(decimalSecondsTotal % 100);
        this._label.set_text(`${dHour}:${pad(dMinute)}:${pad(dSecond)}`);
    }

    _updatePopup() {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const fractionOfDay = (now - startOfDay) / 86400000;
        const decimalSecondsTotal = fractionOfDay * 100000;
        const dHour = Math.floor(decimalSecondsTotal / 10000);
        const remAfterHour = decimalSecondsTotal % 10000;
        const dMinute = Math.floor(remAfterHour / 100);
        const remAfterMinute = remAfterHour % 100;
        const dSecond = Math.floor(remAfterMinute);
        const dDeci = Math.floor((remAfterMinute - dSecond) * 10);

        this._timeLabel.set_text(`${dHour}:${pad(dMinute)}:${pad(dSecond)}.${dDeci}`);
        this._stdLabel.set_text(`standard time ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
        this._dialArea.queue_repaint();

        const t = computeRepublicanDate(now);
        if (t.isEpagomenal) {
            this._dateLabel.set_text(`${EPAGOMENAL[t.epagIndex]}, Year ${t.republicanYear}`);
        } else {
            this._dateLabel.set_text(`${DAYS[t.dayInDecadeIndex]}, ${t.dayOfMonth} ${MONTHS[t.monthIndex]}, Year ${t.republicanYear}`);
        }

        this._renderCalendar();
    }

    _navPrev() {
        if (this._view.monthIndex > 0) {
            this._view.monthIndex -= 1;
        } else {
            this._view.year -= 1;
            this._view.monthIndex = 12;
        }
        this._renderCalendar();
    }

    _navNext() {
        if (this._view.monthIndex < 12) {
            this._view.monthIndex += 1;
        } else {
            this._view.year += 1;
            this._view.monthIndex = 0;
        }
        this._renderCalendar();
    }

    _navPrevYear() {
        this._view.year -= 1;
        this._renderCalendar();
    }

    _navNextYear() {
        this._view.year += 1;
        this._renderCalendar();
    }

    _navToday() {
        this._view = this._todayView();
        this._renderCalendar();
    }

    _renderCalendar() {
        const now = new Date();
        const t = computeRepublicanDate(now);
        const isViewingToday = (this._view.year === t.republicanYear &&
            this._view.monthIndex === (t.isEpagomenal ? 12 : t.monthIndex));

        this._gridBox.destroy_all_children();

        if (this._view.monthIndex === 12) {
            this._monthLabel.set_text(`Epagomenal Days \u2014 Year ${this._view.year}`);
            const count = complementaryCountForYear(this._view.year);
            for (let i = 0; i < count; i++) {
                const isToday = isViewingToday && t.isEpagomenal && t.epagIndex === i;
                const lbl = new St.Label({
                    text: EPAGOMENAL[i],
                    style_class: 'decimal-epagomenal-label' + (isToday ? ' decimal-grid-today' : ''),
                });
                this._gridBox.add_child(lbl);
            }
            return;
        }

        this._monthLabel.set_text(`${MONTHS[this._view.monthIndex]} \u2014 Year ${this._view.year}`);

        for (let decade = 0; decade < 3; decade++) {
            const row = new St.BoxLayout({style_class: 'decimal-grid-row'});
            for (let d = 0; d < 10; d++) {
                const dayOfMonth = decade * 10 + d + 1;
                const isToday = isViewingToday && !t.isEpagomenal &&
                    decade === t.decadeIndex && d === t.dayInDecadeIndex;
                const isRest = (d === 9);

                let cls = 'decimal-grid-cell';
                if (isToday) cls += ' decimal-grid-today';
                if (isRest) cls += ' decimal-grid-rest';

                const cell = new St.BoxLayout({vertical: true, style_class: cls});
                cell.add_child(new St.Label({text: String(dayOfMonth), style_class: 'decimal-grid-num', x_align: Clutter.ActorAlign.CENTER}));
                cell.add_child(new St.Label({text: DAYS_ABBR[d], style_class: 'decimal-grid-abbr', x_align: Clutter.ActorAlign.CENTER}));
                row.add_child(cell);
            }
            this._gridBox.add_child(row);
        }
    }

    destroy() {
        if (this._slowTimeoutId) {
            GLib.source_remove(this._slowTimeoutId);
            this._slowTimeoutId = null;
        }
        if (this._fastTimeoutId) {
            GLib.source_remove(this._fastTimeoutId);
            this._fastTimeoutId = null;
        }
        super.destroy();
    }
});

/* ============== EXTENSION ENTRY POINT ============== */

export default class DecimalTimeExtension extends Extension {
    enable() {
        this._indicator = new DecimalIndicator();
        // 'right' box, positioned just left of the built-in clock/calendar.
        Main.panel.addToStatusArea('decimal-time-indicator', this._indicator, 0, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
