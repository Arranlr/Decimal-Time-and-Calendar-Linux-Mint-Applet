const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Mainloop = imports.mainloop;

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

/* ============== APPLET ============== */

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function (orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.set_applet_label("0:00:00");
        this.set_applet_tooltip("Decimal Time \u2014 click for calendar");

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this._view = this._todayView();
        this._buildMenu();

        this._fastTimeoutId = null;
        this._slowTimeoutId = Mainloop.timeout_add(1000, () => {
            this._updatePanel();
            return true;
        });

        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._view = this._todayView();
                this._updatePopup();
                this._fastTimeoutId = Mainloop.timeout_add(100, () => {
                    this._updatePopup();
                    return true;
                });
            } else if (this._fastTimeoutId) {
                Mainloop.source_remove(this._fastTimeoutId);
                this._fastTimeoutId = null;
            }
        });

        this._updatePanel();
    },

    on_applet_clicked: function (event) {
        this.menu.toggle();
    },

    _todayView: function () {
        const t = computeRepublicanDate(new Date());
        return {year: t.republicanYear, monthIndex: t.isEpagomenal ? 12 : t.monthIndex};
    },

    _buildMenu: function () {
        // Dial
        this._dialArea = new St.DrawingArea({width: 150, height: 150});
        this._dialArea.connect('repaint', () => this._drawDial());
        const dialItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const dialBox = new St.BoxLayout({x_expand: true});
        const dialCenter = new St.Bin({x_expand: true, x_align: St.Align.MIDDLE});
        dialCenter.set_child(this._dialArea);
        dialBox.add(dialCenter, {expand: true});
        dialItem.addActor(dialBox);
        this.menu.addMenuItem(dialItem);

        // Full time readout
        this._timeLabel = new St.Label({text: '', style_class: 'decimal-popup-time'});
        const timeItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        timeItem.addActor(this._timeLabel);
        this.menu.addMenuItem(timeItem);

        this._stdLabel = new St.Label({text: '', style_class: 'decimal-popup-sub'});
        const stdItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        stdItem.addActor(this._stdLabel);
        this.menu.addMenuItem(stdItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Today's date
        this._dateLabel = new St.Label({text: '', style_class: 'decimal-popup-date'});
        const dateItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        dateItem.addActor(this._dateLabel);
        this.menu.addMenuItem(dateItem);

        // Navigation row
        const navItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
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
        navBox.add(todayBtn, {expand: true});
        navBox.add(prevBtn, {expand: true});
        navBox.add(nextBtn, {expand: true});
        navBox.add(prevYearBtn, {expand: true});
        navBox.add(nextYearBtn, {expand: true});
        navItem.addActor(navBox);
        this.menu.addMenuItem(navItem);

        // Month label
        this._monthLabel = new St.Label({text: '', style_class: 'decimal-month-label'});
        const monthItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        monthItem.addActor(this._monthLabel);
        this.menu.addMenuItem(monthItem);

        // Grid container (rebuilt on navigation)
        this._gridItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        this._gridBox = new St.BoxLayout({vertical: true, style_class: 'decimal-grid'});
        this._gridItem.addActor(this._gridBox);
        this.menu.addMenuItem(this._gridItem);
    },

    _drawHand: function (cr, cx, cy, fraction, length, width, rgba) {
        const angle = fraction * 2 * Math.PI - Math.PI / 2;
        cr.setSourceRGBA(rgba[0], rgba[1], rgba[2], rgba[3]);
        cr.setLineWidth(width);
        cr.moveTo(cx, cy);
        cr.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
        cr.stroke();
    },

    _drawDial: function () {
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
    },

    _updatePanel: function () {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const fractionOfDay = (now - startOfDay) / 86400000;
        const decimalSecondsTotal = fractionOfDay * 100000;
        const dHour = Math.floor(decimalSecondsTotal / 10000);
        const dMinute = Math.floor((decimalSecondsTotal % 10000) / 100);
        const dSecond = Math.floor(decimalSecondsTotal % 100);
        this.set_applet_label(`${dHour}:${pad(dMinute)}:${pad(dSecond)}`);
        return true;
    },

    _updatePopup: function () {
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
    },

    _navPrev: function () {
        if (this._view.monthIndex > 0) {
            this._view.monthIndex -= 1;
        } else {
            this._view.year -= 1;
            this._view.monthIndex = 12;
        }
        this._renderCalendar();
    },

    _navNext: function () {
        if (this._view.monthIndex < 12) {
            this._view.monthIndex += 1;
        } else {
            this._view.year += 1;
            this._view.monthIndex = 0;
        }
        this._renderCalendar();
    },

    _navNextYear: function () {
        this._view.year += 1;
        this._renderCalendar();
    },
    
    _navPrevYear: function () {
        this._view.year -= 1;
        this._renderCalendar();
    },

    _navToday: function () {
        this._view = this._todayView();
        this._renderCalendar();
    },

    _renderCalendar: function () {
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
                this._gridBox.add(lbl);
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
                cell.add(new St.Label({text: String(dayOfMonth), style_class: 'decimal-grid-num'}));
                cell.add(new St.Label({text: DAYS_ABBR[d], style_class: 'decimal-grid-abbr'}));
                row.add(cell);
            }
            this._gridBox.add(row);
        }
    },

    on_applet_removed_from_panel: function () {
        if (this._slowTimeoutId) {
            Mainloop.source_remove(this._slowTimeoutId);
            this._slowTimeoutId = null;
        }
        if (this._fastTimeoutId) {
            Mainloop.source_remove(this._fastTimeoutId);
            this._fastTimeoutId = null;
        }
    },
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(orientation, panel_height, instance_id);
}
