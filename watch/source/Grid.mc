import Toybox.Graphics;
import Toybox.Lang;

// The grid of big tap zones shared by the screens: arrow numbers, grades, round setup.
// A cell is [x, y, w, h, value].

function gridCells(w as Number, h as Number, n as Number) as Array<Array<Number>> {
    var cells = [] as Array<Array<Number>>;
    if (n == 0) { return cells; }
    var cols;
    if (n <= 3) { cols = n; }
    else if (n == 4) { cols = 2; }
    else if (n <= 9) { cols = 3; }
    else if (n <= 16) { cols = 4; }
    else { cols = 5; }
    var rows = (n + cols - 1) / cols;
    var rw = (w * 72) / 100;
    var rh = (h * 56) / 100;
    var x0 = (w - rw) / 2;
    var y0 = (h * 27) / 100;
    var gap = 8;
    var cw = (rw - gap * (cols - 1)) / cols;
    var ch = (rh - gap * (rows - 1)) / rows;
    if (ch > cw * 11 / 10) { ch = cw * 11 / 10; }
    var used = ch * rows + gap * (rows - 1);
    y0 += (rh - used) / 2;
    for (var i = 0; i < n; i++) {
        var r = i / cols;
        var c = i % cols;
        var inRow = (r == rows - 1) ? n - r * cols : cols;
        var rowX = x0 + (rw - (cw * inRow + gap * (inRow - 1))) / 2;
        cells.add([rowX + c * (cw + gap), y0 + r * (ch + gap), cw, ch, 0]);
    }
    return cells;
}

// Draws one cell per option (the highlighted one outlined) and returns the cells for hit tests.
function drawGrid(dc as Graphics.Dc, opts as Array<Number>, sel as Number, color as Number) as Array<Array<Number>> {
    var cells = gridCells(dc.getWidth(), dc.getHeight(), opts.size());
    for (var i = 0; i < cells.size(); i++) {
        var c = cells[i];
        c[4] = opts[i];
        dc.setColor(COLOR_CELL, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(c[0], c[1], c[2], c[3], 14);
        if (i == sel) {
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(4);
            dc.drawRoundedRectangle(c[0], c[1], c[2], c[3], 14);
            dc.setPenWidth(1);
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(c[0] + c[2] / 2, c[1] + c[3] / 2, opts.size() > 9 ? Graphics.FONT_MEDIUM : Graphics.FONT_LARGE,
            opts[i].toString(), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
    return cells;
}

function cellValueAt(cells as Array<Array<Number>>, x as Number, y as Number) as Number {
    for (var i = 0; i < cells.size(); i++) {
        var c = cells[i];
        if (x >= c[0] - 4 && x <= c[0] + c[2] + 4 && y >= c[1] - 4 && y <= c[1] + c[3] + 4) { return c[4]; }
    }
    return 0;
}
