/**
 * Dropdown columns with `disambiguate: true` show the name of each selected option and add its id only where cells
 * of the column show the same name for different options, e.g. two samples named "Liver": "Liver [12]", "Liver [13]".
 *
 * The source items are `{ id, name }`. The shown id is `column.disambiguateLabel(id)` or, by default, the "[...]"
 * the id ends with (ids like "Liver [12]") or else "[id]". Text that is pasted or typed instead of an id (e.g. a
 * copied name, with or without its id) is resolved to the option it names, if it names exactly one.
 *
 * Custom editors (column types that are objects) with a `refreshColumn(worksheet, x, column)` function are refreshed
 * on the same occasions, to do the same for the options they know.
 */

const isDisambiguated = function (column) {
    return !!(column && column.type == 'dropdown' && column.disambiguate && !column.multiple);
};

const hasRefresh = function (column) {
    return !!(column && column.type && typeof column.type == 'object' && typeof column.type.refreshColumn == 'function');
};

const idLabel = function (column, id) {
    if (typeof column.disambiguateLabel == 'function') {
        return column.disambiguateLabel(id);
    }
    const match = /(\[[^\]]*\])$/.exec('' + id);
    return match ? match[1] : '[' + id + ']';
};

// Option names by id
const optionNames = function (column) {
    const names = new Map();
    const source = column.source || [];
    for (let i = 0; i < source.length; i++) {
        if (source[i] !== null && typeof source[i] == 'object') {
            names.set('' + source[i].id, source[i].name);
        } else {
            names.set('' + source[i], source[i]);
        }
    }
    return names;
};

/**
 * The id a pasted or typed text stands for: an id stays, a name (or "name [id]" as shown) of exactly one option
 * becomes its id, any other text stays as it is.
 */
export const resolveDisambiguatedValue = function (x, value) {
    const obj = this;
    const column = obj.options.columns && obj.options.columns[x];
    if (!isDisambiguated(column) || typeof value != 'string' || value === '') {
        return value;
    }
    const names = optionNames(column);
    if (names.has(value)) {
        return value;
    }
    const text = value.trim();
    const matches = [];
    names.forEach(function (name, id) {
        if (name === text || name + ' ' + idLabel(column, id) === text) {
            matches.push(id);
        }
    });
    if (matches.length != 1) {
        return value;
    }
    // Keep numeric ids numeric
    const source = column.source || [];
    for (let i = 0; i < source.length; i++) {
        const id = source[i] !== null && typeof source[i] == 'object' ? source[i].id : source[i];
        if ('' + id === matches[0]) {
            return id;
        }
    }
    return matches[0];
};

/**
 * Show the names of a column's cells, with the id where the same name stands for different options.
 */
export const refreshDisambiguatedColumn = function (x) {
    const obj = this;
    const column = obj.options.columns && obj.options.columns[x];
    if (hasRefresh(column) && obj.records) {
        column.type.refreshColumn(obj, x, column);
        return;
    }
    if (!isDisambiguated(column) || !obj.records) {
        return;
    }
    const names = optionNames(column);
    const nameOf = function (value) {
        if (value === '' || value === null || value === undefined || !names.has('' + value)) {
            return '';
        }
        return names.get('' + value);
    };

    // Distinct options per shown name
    const optionsByName = new Map();
    for (let y = 0; y < obj.options.data.length; y++) {
        const value = obj.options.data[y][x];
        const name = nameOf(value);
        if (name === '') {
            continue;
        }
        if (!optionsByName.has(name)) {
            optionsByName.set(name, new Set());
        }
        optionsByName.get(name).add('' + value);
    }

    for (let y = 0; y < obj.options.data.length; y++) {
        const record = obj.records[y] && obj.records[y][x];
        if (!record || !record.element) {
            continue;
        }
        const value = obj.options.data[y][x];
        const name = nameOf(value);
        const text = name !== '' && optionsByName.get(name).size > 1 ? name + ' ' + idLabel(column, value) : name;
        if (record.element.textContent !== text) {
            record.element.textContent = text;
        }
    }
};

/**
 * Refresh a column (or every disambiguated column) once the current changes are done, e.g. after all cells of a
 * paste are set.
 */
export const scheduleDisambiguate = function (x) {
    const obj = this;
    if (!obj || !obj.options || !obj.options.columns) {
        return;
    }
    const columns = x === undefined ? obj.options.columns.map((_, i) => i) : [x];
    const pending = obj.disambiguatePending || (obj.disambiguatePending = new Set());
    let added = false;
    for (let i = 0; i < columns.length; i++) {
        const column = obj.options.columns[columns[i]];
        if ((isDisambiguated(column) || hasRefresh(column)) && !pending.has(columns[i])) {
            pending.add(columns[i]);
            added = true;
        }
    }
    if (!added || obj.disambiguateScheduled) {
        return;
    }
    obj.disambiguateScheduled = true;
    Promise.resolve().then(function () {
        obj.disambiguateScheduled = false;
        const xs = Array.from(pending);
        pending.clear();
        for (let i = 0; i < xs.length; i++) {
            // Columns may have been moved or deleted meanwhile
            if (xs[i] < obj.options.columns.length) {
                refreshDisambiguatedColumn.call(obj, xs[i]);
            }
        }
    });
};

// Events after which other cells of a column may show a name that is (no longer) shared
export const DISAMBIGUATE_EVENTS = [
    'oninsertrow',
    'ondeleterow',
    'onmoverow',
    'onsort',
    'onundo',
    'onredo',
    'onmovecolumn',
    'oninsertcolumn',
    'ondeletecolumn',
];
