import jSuites from 'jsuites';
import { setHistory } from './history.js';
import dispatch from './dispatch.js';
import { updateTableReferences } from './internal.js';
import { loadPage } from './lazyLoading.js';
import { closeFilter } from './filter.js';

/**
 * Update order arrow, a column ordered by one of its named sortings shows the sorting title and direction instead.
 * Without a column the order indicator is removed.
 */
export const updateOrderArrow = function (column, order, title) {
    const obj = this;

    // Remove order
    for (let i = 0; i < obj.headers.length; i++) {
        obj.headers[i].classList.remove('arrow-up');
        obj.headers[i].classList.remove('arrow-down');
        obj.headers[i].removeAttribute('data-order');
    }

    obj.orderState = column == null ? null : { column: column, order: order, title: title };

    if (column == null) {
        return;
    }

    // No order specified then toggle order
    if (order) {
        obj.headers[column].classList.add('arrow-up');
    } else {
        obj.headers[column].classList.add('arrow-down');
    }

    if (title) {
        obj.headers[column].setAttribute('data-order', title + ' ' + jSuites.translate(order ? 'desc' : 'asc'));
    }
};

/**
 * The named sorting to order a column by when none is given: the column's current one, or its first. Without an order
 * a column ordered descending goes on to the next sorting, so the header double click cycles through all of them.
 */
const getNamedSorting = function (column, order) {
    const obj = this;
    const sortings = obj.options.columns && obj.options.columns[column] && obj.options.columns[column].sortings;

    if (!sortings || !sortings.length) {
        return [null, order];
    }

    const current = obj.orderState && obj.orderState.column == column ? obj.orderState : null;
    const index = current ? sortings.findIndex((sorting) => sorting.title === current.title) : -1;

    if (index < 0) {
        return [sortings[0], order == null ? 0 : order];
    }
    if (order == null) {
        if (current.order) {
            return [sortings[(index + 1) % sortings.length], 0];
        }
        return [sortings[index], 1];
    }
    return [sortings[index], order];
};

/**
 * Update rows position
 */
export const updateOrder = function (rows) {
    const obj = this;

    // History
    let data = [];
    for (let j = 0; j < rows.length; j++) {
        data[j] = obj.options.data[rows[j]];
    }
    obj.options.data = data;

    data = [];
    for (let j = 0; j < rows.length; j++) {
        data[j] = obj.records[rows[j]];

        for (let i = 0; i < data[j].length; i++) {
            data[j][i].y = j;
        }
    }
    obj.records = data;

    data = [];
    for (let j = 0; j < rows.length; j++) {
        data[j] = obj.rows[rows[j]];
        data[j].y = j;
    }
    obj.rows = data;

    // Update references
    updateTableReferences.call(obj);

    // Redo search
    if (obj.results && obj.results.length) {
        if (obj.searchInput.value) {
            obj.search(obj.searchInput.value);
        } else {
            closeFilter.call(obj);
        }
    } else {
        // Create page
        obj.results = null;
        obj.pageNumber = 0;

        if (obj.options.pagination > 0) {
            obj.page(0);
        } else if (obj.options.lazyLoading == true) {
            loadPage.call(obj, 0);
        } else {
            for (let j = 0; j < obj.rows.length; j++) {
                obj.tbody.appendChild(obj.rows[j].element);
            }
        }
    }
};

/**
 * Sort data and reload table, with the sorting option, the given sorting function or named sorting ({ title, sorting })
 * of the column. Without a sorting a column with named sortings is ordered by one of them.
 */
export const orderBy = function (column, order, sorting) {
    const obj = this;

    if (column >= 0) {
        // Merged cells
        if (obj.options.mergeCells && Object.keys(obj.options.mergeCells).length > 0) {
            if (!confirm(jSuites.translate('This action will destroy any existing merged cells. Are you sure?'))) {
                return false;
            } else {
                // Remove merged cells
                obj.destroyMerge();
            }
        }

        // Named sorting
        let named = null;
        if (sorting && typeof sorting === 'object') {
            named = sorting;
        } else if (!sorting) {
            [named, order] = getNamedSorting.call(obj, column, order);
        }
        if (named) {
            sorting = named.sorting;
        }

        // Direction
        if (order == null) {
            order = obj.headers[column].classList.contains('arrow-down') ? 1 : 0;
        } else {
            order = order ? 1 : 0;
        }

        // Test order
        let temp = [];
        if (
            obj.options.columns &&
            obj.options.columns[column] &&
            (obj.options.columns[column].type == 'number' ||
                obj.options.columns[column].type == 'numeric' ||
                obj.options.columns[column].type == 'percentage' ||
                obj.options.columns[column].type == 'autonumber' ||
                obj.options.columns[column].type == 'color')
        ) {
            for (let j = 0; j < obj.options.data.length; j++) {
                temp[j] = [j, Number(obj.options.data[j][column]), obj.options.data[j][column]];
            }
        } else if (
            obj.options.columns &&
            obj.options.columns[column] &&
            (obj.options.columns[column].type == 'calendar' || obj.options.columns[column].type == 'checkbox' || obj.options.columns[column].type == 'radio')
        ) {
            for (let j = 0; j < obj.options.data.length; j++) {
                temp[j] = [j, obj.options.data[j][column], obj.options.data[j][column]];
            }
        } else {
            for (let j = 0; j < obj.options.data.length; j++) {
                temp[j] = [j, obj.records[j][column].element.textContent.toLowerCase(), obj.options.data[j][column]];
            }
        }

        // Default sorting method
        if (typeof obj.parent.config.sorting !== 'function') {
            obj.parent.config.sorting = function (direction) {
                return function (a, b) {
                    const valueA = a[1];
                    const valueB = b[1];

                    if (!direction) {
                        return valueA === '' && valueB !== '' ? 1 : valueA !== '' && valueB === '' ? -1 : valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
                    } else {
                        return valueA === '' && valueB !== '' ? 1 : valueA !== '' && valueB === '' ? -1 : valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
                    }
                };
            };
        }

        temp = temp.sort((sorting || obj.parent.config.sorting)(order));

        // Save history
        const newValue = [];
        for (let j = 0; j < temp.length; j++) {
            newValue[j] = temp[j][0];
        }

        // Save history
        setHistory.call(obj, {
            action: 'orderBy',
            rows: newValue,
            column: column,
            order: order,
            title: named && named.title,
            previous: obj.orderState || null,
        });

        // Update order
        updateOrderArrow.call(obj, column, order, named && named.title);
        updateOrder.call(obj, newValue);

        // On sort event
        dispatch.call(
            obj,
            'onsort',
            obj,
            column,
            order,
            newValue.map((row) => row)
        );

        return true;
    }
};
