const { expect } = require('chai');

const jspreadsheet = require('../dist/index.js');

global.document.execCommand = function execCommandMock() {};

// Two samples named "Twin" (ids 2 and 3), one "Liver", and a new "Brain"
const source = [
    { id: 'Liver [1]', name: 'Liver' },
    { id: 'Twin [2]', name: 'Twin' },
    { id: 'Twin [3]', name: 'Twin' },
    { id: 'Brain [new]', name: 'Brain' },
];

// The disambiguation runs once the current changes are done
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const sheet = (data) =>
    jspreadsheet(root, {
        worksheets: [
            {
                data: data,
                columns: [{ type: 'dropdown', source: source, disambiguate: true }, { type: 'text' }],
            },
        ],
    })[0];

const shown = (worksheet) => worksheet.records.map((row) => row[0].element.textContent);

describe('Disambiguated dropdown', () => {
    it('shows only the names of options with distinct names', async () => {
        const worksheet = sheet([
            ['Liver [1]', 'a'],
            ['Twin [2]', 'b'],
            ['Brain [new]', 'c'],
        ]);
        await settled();

        expect(shown(worksheet)).to.eql(['Liver', 'Twin', 'Brain']);
    });

    it('adds the id where the same name stands for different options', async () => {
        const worksheet = sheet([
            ['Twin [2]', 'a'],
            ['Twin [3]', 'b'],
            ['Liver [1]', 'c'],
        ]);
        await settled();

        expect(shown(worksheet)).to.eql(['Twin [2]', 'Twin [3]', 'Liver']);
    });

    it('does not add the id to the same option selected twice', async () => {
        const worksheet = sheet([
            ['Twin [2]', 'a'],
            ['Twin [2]', 'b'],
        ]);
        await settled();

        expect(shown(worksheet)).to.eql(['Twin', 'Twin']);
    });

    it('removes the id once the names are distinct again', async () => {
        const worksheet = sheet([
            ['Twin [2]', 'a'],
            ['Twin [3]', 'b'],
        ]);
        await settled();
        expect(shown(worksheet)).to.eql(['Twin [2]', 'Twin [3]']);

        worksheet.setValueFromCoords(0, 1, 'Liver [1]');
        await settled();

        expect(shown(worksheet)).to.eql(['Twin', 'Liver']);
    });

    it('updates the other cells when a row is deleted', async () => {
        const worksheet = sheet([
            ['Twin [2]', 'a'],
            ['Twin [3]', 'b'],
            ['Liver [1]', 'c'],
        ]);
        await settled();

        worksheet.deleteRow(1);
        await settled();

        expect(shown(worksheet)).to.eql(['Twin', 'Liver']);
    });

    it('resolves a pasted name of exactly one option to its id', async () => {
        const worksheet = sheet([
            ['', 'a'],
            ['', 'b'],
            ['', 'c'],
        ]);

        worksheet.updateSelectionFromCoords(0, 0, 0, 0);
        worksheet.paste(0, 0, 'Liver\nTwin [3]\nTwin');
        await settled();

        // "Twin" alone names two options and stays as pasted (shown empty, rejected by the backend)
        expect(worksheet.getData().map((row) => row[0])).to.eql(['Liver [1]', 'Twin [3]', 'Twin']);
        expect(shown(worksheet)).to.eql(['Liver', 'Twin', '']);
    });

    it('restores the labels on undo', async () => {
        const worksheet = sheet([
            ['Twin [2]', 'a'],
            ['Liver [1]', 'b'],
        ]);
        await settled();

        worksheet.setValueFromCoords(0, 1, 'Twin [3]');
        await settled();
        expect(shown(worksheet)).to.eql(['Twin [2]', 'Twin [3]']);

        worksheet.undo();
        await settled();

        expect(shown(worksheet)).to.eql(['Twin', 'Liver']);
    });

    it('refreshes custom editors with refreshColumn when rows are deleted', async () => {
        const calls = [];
        const editor = {
            createCell(cell, value) {
                cell.textContent = value;
            },
            refreshColumn(worksheet, x) {
                calls.push([x, worksheet.options.data.length]);
            },
        };
        const worksheet = jspreadsheet(root, {
            worksheets: [
                {
                    data: [
                        ['a', 1],
                        ['b', 2],
                    ],
                    columns: [{ type: 'text' }, { type: editor }],
                },
            ],
        })[0];
        await settled();
        calls.length = 0;

        worksheet.deleteRow(0);
        await settled();

        expect(calls).to.eql([[1, 1]]);
    });

    it('leaves dropdowns without the option unchanged', () => {
        const worksheet = jspreadsheet(root, {
            worksheets: [{ data: [['Twin [2]'], ['Twin [3]']], columns: [{ type: 'dropdown', source: source }] }],
        })[0];

        expect(shown(worksheet)).to.eql(['Twin', 'Twin']);
    });
});
