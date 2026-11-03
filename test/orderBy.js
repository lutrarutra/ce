const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

describe('Sorting tests', () => {
    it('Default sorting', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
                        ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E2*F2'],
                        ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
                        ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E4*F4'],
                    ],
                },
            ],
        });

        instance[0].orderBy(5);

        expect(instance[0].options.data).to.eql([
            ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
            ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E2*F2'],
            ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
            ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E4*F4'],
        ]);

        instance[0].orderBy(5);

        expect(instance[0].options.data).to.eql([
            ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E1*F1'],
            ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E2*F2'],
            ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E3*F3'],
            ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E4*F4'],
        ]);
    });

    it('Custom sorting', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
                        ['Peugeot', 1800, 5000, '2005-01-01', '23.00', '5', '=E2*F2'],
                        ['test', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
                        ['Honda CRV', 1900, 6000, '2003-01-01', '56.11', '2', '=E4*F4'],
                    ],
                    sorting: function (direction) {
                        return function (a, b) {
                            let valueA = a[1];
                            let valueB = b[1];

                            if (valueA === 'test') {
                                return direction ? 1 : -1;
                            }

                            if (valueB === 'test') {
                                return direction ? -1 : 1;
                            }

                            // Consider blank rows in the sorting
                            if (!direction) {
                                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
                            } else {
                                return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
                            }
                        };
                    },
                },
            ],
        });

        instance[0].orderBy(0, 1);

        expect(instance[0].options.data).to.eql([
            ['test', 2009, 3000, '2004-01-01', '214.00', '3', '=E1*F1'],
            ['Peugeot', 1800, 5000, '2005-01-01', '23.00', '5', '=E2*F2'],
            ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E3*F3'],
            ['Honda CRV', 1900, 6000, '2003-01-01', '56.11', '2', '=E4*F4'],
        ]);
    });

    it('passes stored values alongside displayed values to custom sorting', async () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    data: [['Alpha [10]'], ['Beta [2]'], ['Gamma [3]']],
                    columns: [
                        {
                            type: 'dropdown',
                            source: [
                                { id: 'Alpha [10]', name: 'Alpha' },
                                { id: 'Beta [2]', name: 'Beta' },
                                { id: 'Gamma [3]', name: 'Gamma' },
                            ],
                            disambiguate: true,
                        },
                    ],
                },
            ],
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const entries = [];
        instance[0].orderBy(0, 0, () => (a, b) => {
            entries.push(a, b);
            return Number(a[2].match(/\[(\d+)\]$/)[1]) - Number(b[2].match(/\[(\d+)\]$/)[1]);
        });

        expect(instance[0].options.data.map((row) => row[0])).to.eql(['Beta [2]', 'Gamma [3]', 'Alpha [10]']);
        expect(entries).to.deep.include([0, 'alpha', 'Alpha [10]']);
        expect(entries).to.deep.include([1, 'beta', 'Beta [2]']);
    });

    it('keeps the original value for numeric column custom sorting', () => {
        const instance = jspreadsheet(root, {
            worksheets: [{ data: [['10'], ['2']], columns: [{ type: 'numeric' }] }],
        });
        const entries = [];
        instance[0].orderBy(0, 0, () => (a, b) => {
            entries.push(a, b);
            return a[1] - b[1];
        });

        expect(entries).to.deep.include([0, 10, '10']);
        expect(entries).to.deep.include([1, 2, '2']);
    });

    it('uses the column-specific comparator from the header context menu', async () => {
        let items;
        const instance = jspreadsheet(root, {
            contextMenu: (worksheet, x, y, event, menu) => {
                items = menu;
                return false;
            },
            worksheets: [
                {
                    data: [['Alpha [10]'], ['Beta [2]']],
                    columns: [
                        {
                            type: 'dropdown',
                            source: [
                                { id: 'Alpha [10]', name: 'Alpha' },
                                { id: 'Beta [2]', name: 'Beta' },
                            ],
                            disambiguate: true,
                            sortings: [
                                {
                                    title: 'ID',
                                    sorting: (direction) => (a, b) => {
                                        const result = Number(a[2].match(/\[(\d+)\]$/)[1]) - Number(b[2].match(/\[(\d+)\]$/)[1]);
                                        return direction ? -result : result;
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        instance[0].headers[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2 }));

        items.find((item) => item.title === 'Order by ID ascending').onclick();
        expect(instance[0].options.data.map((row) => row[0])).to.eql(['Beta [2]', 'Alpha [10]']);
        items.find((item) => item.title === 'Order by ID descending').onclick();
        expect(instance[0].options.data.map((row) => row[0])).to.eql(['Alpha [10]', 'Beta [2]']);
    });

    // Name order is Alpha, Beta, Gamma; id order is Beta [2], Gamma [3], Alpha [10]
    const namedSortings = () => {
        const id = (entry) => Number(entry[2].match(/\[(\d+)\]$/)[1]);
        return [
            { title: 'name', sorting: (direction) => (a, b) => (direction ? -1 : 1) * a[1].localeCompare(b[1]) },
            { title: 'ID', sorting: (direction) => (a, b) => (direction ? -1 : 1) * (id(a) - id(b)) },
        ];
    };
    const namedSortingSheet = (options = {}) =>
        jspreadsheet(root, {
            ...options,
            worksheets: [
                {
                    data: [['Gamma [3]'], ['Alpha [10]'], ['Beta [2]']],
                    columns: [
                        {
                            type: 'dropdown',
                            source: [
                                { id: 'Alpha [10]', name: 'Alpha' },
                                { id: 'Beta [2]', name: 'Beta' },
                                { id: 'Gamma [3]', name: 'Gamma' },
                            ],
                            disambiguate: true,
                            sortings: namedSortings(),
                        },
                    ],
                },
            ],
        });
    const column = (instance) => instance[0].options.data.map((row) => row[0]);
    const label = (instance) => instance[0].headers[0].getAttribute('data-order');

    it('cycles through the named sortings of a column without a sorting', async () => {
        const instance = namedSortingSheet();
        await new Promise((resolve) => setTimeout(resolve, 0));

        instance[0].orderBy(0);
        expect(column(instance)).to.eql(['Alpha [10]', 'Beta [2]', 'Gamma [3]']);
        expect(label(instance)).to.equal('name asc');
        instance[0].orderBy(0);
        expect(column(instance)).to.eql(['Gamma [3]', 'Beta [2]', 'Alpha [10]']);
        expect(label(instance)).to.equal('name desc');
        instance[0].orderBy(0);
        expect(column(instance)).to.eql(['Beta [2]', 'Gamma [3]', 'Alpha [10]']);
        expect(label(instance)).to.equal('ID asc');
        instance[0].orderBy(0);
        expect(column(instance)).to.eql(['Alpha [10]', 'Gamma [3]', 'Beta [2]']);
        expect(label(instance)).to.equal('ID desc');
        instance[0].orderBy(0);
        expect(label(instance)).to.equal('name asc');
    });

    it('keeps sorting by ID when the header is double clicked after ordering by ID from the context menu', async () => {
        let items;
        const instance = namedSortingSheet({
            contextMenu: (worksheet, x, y, event, menu) => {
                items = menu;
                return false;
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        instance[0].headers[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2 }));
        items.find((item) => item.title === 'Order by ID ascending').onclick();
        expect(column(instance)).to.eql(['Beta [2]', 'Gamma [3]', 'Alpha [10]']);
        expect(label(instance)).to.equal('ID asc');

        instance[0].headers[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        expect(column(instance)).to.eql(['Alpha [10]', 'Gamma [3]', 'Beta [2]']);
        expect(label(instance)).to.equal('ID desc');
    });

    it('keeps the named sorting when only the order is given', async () => {
        const instance = namedSortingSheet();
        await new Promise((resolve) => setTimeout(resolve, 0));

        instance[0].orderBy(0, 0, instance[0].options.columns[0].sortings[1]);
        instance[0].orderBy(0, 1);
        expect(column(instance)).to.eql(['Alpha [10]', 'Gamma [3]', 'Beta [2]']);
        expect(label(instance)).to.equal('ID desc');
    });

    it('restores the named sorting label on undo and redo', async () => {
        const instance = namedSortingSheet();
        await new Promise((resolve) => setTimeout(resolve, 0));

        instance[0].orderBy(0);
        instance[0].orderBy(0);
        instance[0].orderBy(0);
        expect(label(instance)).to.equal('ID asc');
        instance[0].undo();
        expect(label(instance)).to.equal('name desc');
        expect(column(instance)).to.eql(['Gamma [3]', 'Beta [2]', 'Alpha [10]']);
        instance[0].undo();
        instance[0].undo();
        expect(label(instance)).to.equal(null);
        expect(instance[0].headers[0].classList.contains('arrow-up') || instance[0].headers[0].classList.contains('arrow-down')).to.equal(false);
        expect(column(instance)).to.eql(['Gamma [3]', 'Alpha [10]', 'Beta [2]']);
        instance[0].redo();
        expect(label(instance)).to.equal('name asc');
        instance[0].orderBy(0);
        expect(label(instance)).to.equal('name desc');
    });

    it('keeps the arrow without a label for columns without named sortings', () => {
        const instance = jspreadsheet(root, { worksheets: [{ data: [['b'], ['a']] }] });

        instance[0].orderBy(0);
        expect(instance[0].headers[0].classList.contains('arrow-down')).to.equal(true);
        expect(instance[0].headers[0].hasAttribute('data-order')).to.equal(false);
    });

    it('orderBy history', () => {
        const instance = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
                        ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E2*F2'],
                        ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
                        ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E4*F4'],
                    ],
                },
            ],
        });

        instance[0].orderBy(5);

        expect(instance[0].options.data).to.eql([
            ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
            ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E2*F2'],
            ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
            ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E4*F4'],
        ]);

        instance[0].undo(5);

        expect(instance[0].options.data).to.eql([
            ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
            ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E2*F2'],
            ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
            ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E4*F4'],
        ]);

        instance[0].redo(5);

        expect(instance[0].options.data).to.eql([
            ['Mazda', 2001, 2000, '2006-01-01', '453.00', '2', '=E1*F1'],
            ['Honda CRV', 2010, 6000, '2003-01-01', '56.11', '2', '=E2*F2'],
            ['Honda Fit', 2009, 3000, '2004-01-01', '214.00', '3', '=E3*F3'],
            ['Peugeot', 2010, 5000, '2005-01-01', '23.00', '5', '=E4*F4'],
        ]);
    });
});
