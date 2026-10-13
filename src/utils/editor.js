import jSuites from 'jsuites';

import dispatch from './dispatch.js';
import { getMask, isFormula, updateCell } from './internal.js';
import { setHistory } from './history.js';
import { getStickyIndexWidth } from './freeze.js';

/**
 * Scroll the content so the cell is fully visible, also not covered by the sticky header or index column.
 * The resulting scroll event is ignored by scrollControls.
 *
 * @param object cell
 * @return void
 */
const scrollCellIntoView = function (cell) {
    const obj = this;
    const content = obj.content;

    const contentRect = content.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const left = contentRect.left + content.clientLeft + getStickyIndexWidth.call(obj);
    const top = contentRect.top + content.clientTop + obj.thead.getBoundingClientRect().height;
    const right = contentRect.left + content.clientLeft + content.clientWidth;
    const bottom = contentRect.top + content.clientTop + content.clientHeight;

    if (cellRect.left < left) {
        content.scrollLeft -= left - cellRect.left;
    } else if (cellRect.right > right) {
        content.scrollLeft += Math.min(cellRect.right - right, cellRect.left - left);
    }
    if (cellRect.top < top) {
        content.scrollTop -= top - cellRect.top;
    } else if (cellRect.bottom > bottom) {
        content.scrollTop += Math.min(cellRect.bottom - bottom, cellRect.top - top);
    }

    obj.lastScrollLeft = content.scrollLeft;
    obj.lastScrollTop = content.scrollTop;
};

/**
 * Keep a dropdown editor within the content: limit its width to the visible content, wrap long options
 * instead of cutting them off and open towards the left when it would overflow the right edge
 *
 * @param object cell
 * @param object el - jSuites dropdown element
 * @return void
 */
const alignDropdownToContent = function (cell, el) {
    const obj = this;
    const container = el.querySelector('.jdropdown-container');
    if (!container) {
        return;
    }

    // Fix the width before allowing options to wrap, otherwise the container shrinks to the space left of it
    const maxWidth = Math.min(parseFloat(container.style.maxWidth) || Infinity, obj.content.clientWidth);
    container.style.width = Math.min(container.getBoundingClientRect().width, maxWidth) + 'px';
    container.style.maxWidth = maxWidth + 'px';

    const items = container.querySelectorAll('.jdropdown-item');
    for (let i = 0; i < items.length; i++) {
        items[i].style.whiteSpace = 'normal';
    }

    const contentRect = obj.content.getBoundingClientRect();
    const right = contentRect.left + obj.content.clientLeft + obj.content.clientWidth;
    const containerRect = container.getBoundingClientRect();

    if (containerRect.right <= right) {
        return;
    }

    if (container.style.position == 'fixed') {
        // Align the right edges, but never past the left edge of the content
        const cellRect = cell.getBoundingClientRect();
        container.style.left = Math.max(contentRect.left, cellRect.right - containerRect.width) + 'px';
    } else {
        container.style.left = 'auto';
        container.style.right = '0';
    }
};

/**
 * Open the editor
 *
 * @param object cell
 * @return void
 */
export const openEditor = function (cell, empty, e) {
    const obj = this;

    // Get cell position
    const y = cell.getAttribute('data-y');
    const x = cell.getAttribute('data-x');

    // On edition start
    dispatch.call(obj, 'oneditionstart', obj, cell, parseInt(x), parseInt(y));

    // Scrolling the content closes the editor, so bring a partially hidden cell fully into view now,
    // otherwise focusing the editor scrolls it into view and closes the editor right away
    if (obj.options.tableOverflow == true) {
        scrollCellIntoView.call(obj, cell);
    }

    // Overflow
    if (x > 0) {
        obj.records[y][x - 1].element.style.overflow = 'hidden';
    }

    // Create editor
    const createEditor = function (type) {
        // Cell information
        const info = cell.getBoundingClientRect();

        // Create dropdown
        const editor = document.createElement(type);
        editor.style.width = info.width + 'px';
        editor.style.height = info.height - 2 + 'px';
        editor.style.minHeight = info.height - 2 + 'px';

        // Edit cell
        cell.classList.add('editor');
        cell.innerHTML = '';
        cell.appendChild(editor);

        return editor;
    };

    // Readonly
    if (cell.classList.contains('readonly') == true) {
        // Do nothing
    } else {
        // Holder
        obj.edition = [obj.records[y][x].element, obj.records[y][x].element.innerHTML, x, y];

        // If there is a custom editor for it
        if (obj.options.columns && obj.options.columns[x] && typeof obj.options.columns[x].type === 'object') {
            // Custom editors
            obj.options.columns[x].type.openEditor(cell, obj.options.data[y][x], parseInt(x), parseInt(y), obj, obj.options.columns[x], e);

            // On edition start
            dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);
        } else {
            // Native functions
            if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'hidden') {
                // Do nothing
            } else if (obj.options.columns && obj.options.columns[x] && (obj.options.columns[x].type == 'checkbox' || obj.options.columns[x].type == 'radio')) {
                // Get value
                const value = cell.children[0].checked ? false : true;
                // Toogle value
                obj.setValue(cell, value);
                // Do not keep edition open
                obj.edition = null;
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'dropdown') {
                // Get current value
                let value = obj.options.data[y][x];
                if (obj.options.columns[x].multiple && !Array.isArray(value)) {
                    value = value.split(';');
                }

                // Create dropdown
                let source;

                if (typeof obj.options.columns[x].filter == 'function') {
                    source = obj.options.columns[x].filter(obj.element, cell, x, y, obj.options.columns[x].source);
                } else {
                    source = obj.options.columns[x].source;
                }

                // Do not change the original source
                const data = [];
                if (source) {
                    for (let j = 0; j < source.length; j++) {
                        data.push(source[j]);
                    }
                }

                // Create editor
                const editor = createEditor('div');

                // On edition start
                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                const options = {
                    data: data,
                    multiple: obj.options.columns[x].multiple ? true : false,
                    autocomplete: obj.options.columns[x].autocomplete ? true : false,
                    opened: true,
                    value: value,
                    width: '100%',
                    maxWidth: (obj.options.columns[x].maxWidth || 750) + 'px',
                    height: editor.style.minHeight,
                    position: obj.options.tableOverflow == true || obj.parent.config.fullscreen == true ? true : false,
                    onclose: function () {
                        closeEditor.call(obj, cell, true);
                    },
                    onopen: function (el) {
                        alignDropdownToContent.call(obj, cell, el);
                    },
                };
                if (obj.options.columns[x].options && obj.options.columns[x].options.type) {
                    options.type = obj.options.columns[x].options.type;
                }
                jSuites.dropdown(editor, options);
            } else if (obj.options.columns && obj.options.columns[x] && (obj.options.columns[x].type == 'calendar' || obj.options.columns[x].type == 'color')) {
                // Value
                const value = obj.options.data[y][x];
                // Create editor
                const editor = createEditor('input');

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.value = value;

                const options = obj.options.columns[x].options ? { ...obj.options.columns[x].options } : {};

                if (obj.options.tableOverflow == true || obj.parent.config.fullscreen == true) {
                    options.position = true;
                }
                options.value = obj.options.data[y][x];
                options.opened = true;
                options.onclose = function (el, value) {
                    closeEditor.call(obj, cell, true);
                };
                // Current value
                if (obj.options.columns[x].type == 'color') {
                    jSuites.color(editor, options);

                    const rect = cell.getBoundingClientRect();

                    if (options.position) {
                        editor.nextSibling.children[1].style.top = rect.top + rect.height + 'px';
                        editor.nextSibling.children[1].style.left = rect.left + 'px';
                    }
                } else {
                    if (!options.format) {
                        options.format = 'YYYY-MM-DD';
                    }

                    jSuites.calendar(editor, options);
                }
                // Focus on editor
                editor.focus();
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'html') {
                const value = obj.options.data[y][x];
                // Create editor
                const editor = createEditor('div');

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.style.position = 'relative';
                const div = document.createElement('div');
                div.classList.add('jss_richtext');
                editor.appendChild(div);
                jSuites.editor(div, {
                    focus: true,
                    value: value,
                });
                const rect = cell.getBoundingClientRect();
                const rectContent = div.getBoundingClientRect();
                if (window.innerHeight < rect.bottom + rectContent.height) {
                    div.style.top = rect.bottom - (rectContent.height + 2) + 'px';
                } else {
                    div.style.top = rect.top + 'px';
                }

                if (window.innerWidth < rect.left + rectContent.width) {
                    div.style.left = rect.right - (rectContent.width + 2) + 'px';
                } else {
                    div.style.left = rect.left + 'px';
                }
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'image') {
                // Value
                const img = cell.children[0];
                // Create editor
                const editor = createEditor('div');

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.style.position = 'relative';
                const div = document.createElement('div');
                div.classList.add('jclose');
                if (img && img.src) {
                    div.appendChild(img);
                }
                editor.appendChild(div);
                jSuites.image(div, obj.options.columns[x]);
                const rect = cell.getBoundingClientRect();
                const rectContent = div.getBoundingClientRect();
                if (window.innerHeight < rect.bottom + rectContent.height) {
                    div.style.top = rect.top - (rectContent.height + 2) + 'px';
                } else {
                    div.style.top = rect.top + 'px';
                }

                div.style.left = rect.left + 'px';
            } else {
                // Value
                const value = empty == true ? '' : obj.options.data[y][x];

                // Basic editor
                let editor;

                if (
                    (!obj.options.columns || !obj.options.columns[x] || obj.options.columns[x].wordWrap != false) &&
                    (obj.options.wordWrap == true || (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].wordWrap == true))
                ) {
                    editor = createEditor('textarea');
                } else {
                    editor = createEditor('input');
                }

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.focus();
                editor.value = value;

                // Column options
                const options = obj.options.columns && obj.options.columns[x];

                // Apply format when is not a formula
                if (!isFormula(value)) {
                    if (options) {
                        // Format
                        const opt = getMask(options);

                        if (opt) {
                            // Masking
                            if (!options.disabledMaskOnEdition) {
                                if (options.mask) {
                                    const m = options.mask.split(';');
                                    editor.setAttribute('data-mask', m[0]);
                                } else if (options.locale) {
                                    editor.setAttribute('data-locale', options.locale);
                                }
                            }
                            // Input
                            opt.input = editor;
                            // Configuration
                            editor.mask = opt;
                            // Do not treat the decimals
                            jSuites.mask.render(value, opt, false);
                        }
                    }
                }

                editor.onblur = function () {
                    closeEditor.call(obj, cell, true);
                };
                editor.scrollLeft = editor.scrollWidth;
            }
        }
    }
};

/**
 * Close the editor and save the information
 *
 * @param object cell
 * @param boolean save
 * @return void
 */
export const closeEditor = function (cell, save) {
    const obj = this;

    const x = parseInt(cell.getAttribute('data-x'));
    const y = parseInt(cell.getAttribute('data-y'));

    let value;

    // Get cell properties
    if (save == true) {
        // If custom editor
        if (obj.options.columns && obj.options.columns[x] && typeof obj.options.columns[x].type === 'object') {
            // Custom editor
            value = obj.options.columns[x].type.closeEditor(cell, save, parseInt(x), parseInt(y), obj, obj.options.columns[x]);
        } else {
            // Native functions
            if (
                obj.options.columns &&
                obj.options.columns[x] &&
                (obj.options.columns[x].type == 'checkbox' || obj.options.columns[x].type == 'radio' || obj.options.columns[x].type == 'hidden')
            ) {
                // Do nothing
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'dropdown') {
                value = cell.children[0].dropdown.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'calendar') {
                value = cell.children[0].calendar.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'color') {
                value = cell.children[0].color.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'html') {
                value = cell.children[0].children[0].editor.getData();
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'image') {
                const img = cell.children[0].children[0].children[0];
                value = img && img.tagName == 'IMG' ? img.src : '';
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'numeric') {
                value = cell.children[0].value;
                if (('' + value).substr(0, 1) != '=') {
                    if (value == '') {
                        value = obj.options.columns[x].allowEmpty ? '' : 0;
                    }
                }
                cell.children[0].onblur = null;
            } else {
                value = cell.children[0].value;
                cell.children[0].onblur = null;

                // Column options
                const options = obj.options.columns && obj.options.columns[x];

                if (options) {
                    // Format
                    const opt = getMask(options);
                    if (opt) {
                        // Keep numeric in the raw data
                        if (value !== '' && !isFormula(value) && typeof value !== 'number') {
                            const t = jSuites.mask.extract(value, opt, true);
                            if (t && t.value !== '') {
                                value = t.value;
                            }
                        }
                    }
                }
            }
        }

        // Ignore changes if the value is the same
        if (obj.options.data[y][x] == value) {
            cell.innerHTML = obj.edition[1];
        } else {
            obj.setValue(cell, value);
        }
    } else {
        if (obj.options.columns && obj.options.columns[x] && typeof obj.options.columns[x].type === 'object') {
            // Custom editor
            obj.options.columns[x].type.closeEditor(cell, save, parseInt(x), parseInt(y), obj, obj.options.columns[x]);
        } else {
            if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'dropdown') {
                cell.children[0].dropdown.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'calendar') {
                cell.children[0].calendar.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'color') {
                cell.children[0].color.close(true);
            } else {
                cell.children[0].onblur = null;
            }
        }

        // Restore value
        cell.innerHTML = obj.edition && obj.edition[1] ? obj.edition[1] : '';
    }

    // On edition end
    dispatch.call(obj, 'oneditionend', obj, cell, x, y, value, save);

    // Remove editor class
    cell.classList.remove('editor');

    // Finish edition
    obj.edition = null;
};

/**
 * Toogle
 */
export const setCheckRadioValue = function () {
    const obj = this;

    const records = [];
    const keys = Object.keys(obj.highlighted);
    for (let i = 0; i < keys.length; i++) {
        const x = obj.highlighted[i].element.getAttribute('data-x');
        const y = obj.highlighted[i].element.getAttribute('data-y');

        if (obj.options.columns[x].type == 'checkbox' || obj.options.columns[x].type == 'radio') {
            // Update cell
            records.push(updateCell.call(obj, x, y, !obj.options.data[y][x]));
        }
    }

    if (records.length) {
        // Update history
        setHistory.call(obj, {
            action: 'setValue',
            records: records,
            selection: obj.selectedCell,
        });

        // On after changes
        const onafterchangesRecords = records.map(function (record) {
            return {
                x: record.x,
                y: record.y,
                value: record.value,
                oldValue: record.oldValue,
            };
        });

        dispatch.call(obj, 'onafterchanges', obj, onafterchangesRecords);
    }
};
